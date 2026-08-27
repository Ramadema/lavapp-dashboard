// Tests de lib/csv.js y lib/normalizar.js. Sin framework: node los corre directo.
//
//   npm test
//
// Cubren, ademas del camino feliz, los cuatro bugs que encontro la revision del
// 2026-08-27, cada uno marcado con REGRESION. Son las dos piezas puras del repo y
// las que fallan en silencio si se rompen, asi que valen tests de verdad.

import { parsearCsv } from "../lib/csv.js";
import { mapearCabeceras, detectarCabecera, normalizarFilas } from "../lib/normalizar.js";

let ok = 0, fail = 0;
const check = (nombre, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log("  OK   " + nombre); }
  else { fail++; console.log("  FALLA " + nombre + "\n        real:     " + a + "\n        esperado: " + b); }
};
const lanza = (nombre, fn, fragmento) => {
  try { fn(); fail++; console.log("  FALLA " + nombre + " (no lanzo)"); }
  catch (e) {
    if (e.message.includes(fragmento)) { ok++; console.log("  OK   " + nombre); }
    else { fail++; console.log("  FALLA " + nombre + " (mensaje: " + e.message + ")"); }
  }
};

const CAB = ["frecuenciaAltaDemanda","volumenPico","registro","criterioOrden","dificultadOrden","consultasTiempo","desvioEstimacion","abandonoCliente","dificultadEstimar","mayorDificultad"];
const idx = mapearCabeceras(CAB).indices;
const BUENA = ["3-4 dias/sem","Mas de 50","Papel/pizarra","Orden de llegada","4","Siempre","A veces","A veces","3","Ninguna"];

console.log("### 1. parser CSV");
check("comas dentro de comillas", parsearCsv('a,"b,c",d'), [["a","b,c","d"]]);
check("comillas escapadas", parsearCsv('a,"di ""hola""",c'), [["a",'di "hola"',"c"]]);
check("salto de linea dentro de comillas", parsearCsv('a,"linea1\nlinea2"'), [["a","linea1\nlinea2"]]);
check("CRLF", parsearCsv("a,b\r\nc,d"), [["a","b"],["c","d"]]);
check("BOM removido", parsearCsv("﻿a,b"), [["a","b"]]);
check("sin salto final", parsearCsv("a,b\nc,d"), [["a","b"],["c","d"]]);
check("salto final no agrega fila", parsearCsv("a,b\n"), [["a","b"]]);

console.log("### 2. REGRESION bug 1: comilla sin cerrar no puede pasar como CSV valido");
lanza("comilla sin cerrar lanza", () => parsearCsv('a,b\nc,"d\ne,f\ng,h'), "comilla sin cerrar");
check("comillas balanceadas siguen andando", parsearCsv('a,"b"\nc,"d"'), [["a","b"],["c","d"]]);

console.log("### 3. REGRESION bug 2: las filas vacias NO se filtran (preservan el numero de linea)");
check("fila vacia preservada", parsearCsv("a,b\n\nc,d"), [["a","b"],[""],["c","d"]]);
check("fila de comas preservada", parsearCsv("a,b\n,\nc,d"), [["a","b"],["",""],["c","d"]]);

console.log("### 4. REGRESION bug 2 (cont): numero de fila real con filas en blanco");
{
  // relleno(1) + cabecera(2) + blanco(3) + blanco(4) + buena(5) + mala(6)
  const filas = parsearCsv(
    "Columna1,Columna2\n" + CAB.join(",") + "\n\n\n" + BUENA.join(",") + "\n" +
    ["3-4 dias/sem","Mas de 50","Papel/pizarra","Orden de llegada","9","Siempre","A veces","A veces","3","Ninguna"].join(",")
  );
  const cab = detectarCabecera(filas);
  check("cabecera detectada en fila 2 (indice 1)", cab.fila, 1);
  const r = normalizarFilas(filas.slice(cab.fila + 1), cab.indices, cab.fila + 2);
  check("1 fila valida", r.datos.length, 1);
  check("la fila mala se reporta como fila 6", r.problemas.map(p => p.fila), [6]);
  check("filas en blanco no son problemas", r.problemas.length, 1);
}

console.log("### 5. REGRESION bug 3: cabecera en fila 3 tras dos blancos");
{
  const filas = parsearCsv("\n\n" + CAB.join(",") + "\n" + BUENA.join(","));
  const cab = detectarCabecera(filas);
  check("cabecera detectada en indice 2", cab.fila, 2);
  check("sin faltantes", cab.faltantes, []);
}

console.log("### 6. REGRESION bug 4: filasRechazadas cuenta FILAS, no problemas");
{
  // Fila totalmente en blanco: la planilla las tiene, no es un error.
  const enBlanco = ["","","","","","","","","",""];
  const r0 = normalizarFilas([BUENA, enBlanco], idx, 2);
  check("fila en blanco se saltea sin reportar", r0.problemas.length, 0);
  check("y no cuenta como rechazada", r0.filasRechazadas, 0);
  check("1 fila valida", r0.datos.length, 1);

  // Caso real del hallazgo: marca temporal cargada, las 10 respuestas vacias.
  // La columna 10 (indice 10) es una ignorada con contenido, asi que la fila NO
  // esta en blanco: se rechaza y se reporta como UNA fila.
  const cabConMarca = [...CAB, "Marca temporal"];
  const idxMarca = mapearCabeceras(cabConMarca).indices;
  const aMedias = ["","","","","","","","","","", "2026/08/22 8:14:27"];
  const r = normalizarFilas([[...BUENA, "2026/08/22 9:00"], aMedias], idxMarca, 2);
  check("10 problemas (uno por campo)", r.problemas.length, 10);
  check("pero 1 sola fila rechazada", r.filasRechazadas, 1);
  check("1 fila valida", r.datos.length, 1);
}
{
  const mala = ["Cuaderno","Mucho","Cuaderno","Ninguno","9","Siempre","A veces","A veces","3","Ninguna"];
  const r = normalizarFilas([mala, mala, BUENA], idx, 2);
  check("2 filas rechazadas, no 10 problemas", r.filasRechazadas, 2);
}

console.log("### 7. cabeceras tolerantes y ambiguedad");
{
  const c = mapearCabeceras(["id","Frecuencia Alta Demanda","volumen_pico","REGISTRO","Criterio orden","Dificultad Orden","consultasTiempo","Desvío estimación","abandono cliente","dificultad estimar","Mayor Dificultad","Columna suelta"]);
  check("todas mapeadas", c.faltantes, []);
  check("cabecera desconocida reportada", c.ignoradas, ["Columna suelta"]);
  check("sin ambiguedad", c.ambiguas, []);
}
{
  // dos columnas que matchean el patron de criterioOrden
  const c = mapearCabeceras(["¿Cómo determinan el orden en que se atienden los vehículos?", "¿Qué tan difícil es mantener el orden en que se atienden?"]);
  check("ambiguedad detectada", c.ambiguas.map(a => a.campo), ["criterioOrden"]);
  check("y el campo queda sin asignar", c.faltantes.includes("criterioOrden"), true);
}

console.log("### 8. normalizacion de valores");
{
  const r = normalizarFilas([["3-4 días/sem","Más de 50","Papel / pizarra","Orden de llegada","4","Siempre","Casi siempre","A veces","3","Registrar vehículos"]], idx, 2);
  check("acentos y espacios", r.datos[0].registro + "|" + r.datos[0].volumenPico + "|" + r.datos[0].frecuenciaAltaDemanda,
        "Papel/pizarra|Mas de 50|3-4 dias/sem");
}
{
  const r = normalizarFilas([["Practicamente todos los dias","Menos de 10","No realizamos un registro","Mediante turnos o reservas","1","Frecuentemente","Frecuentemente","Siempre","5","Ninguno representa una dificultad significativa"]], idx, 2);
  check("etiquetas largas del formulario", r.problemas.length, 0);
  check("mapeadas al canonico", r.datos[0].registro + "|" + r.datos[0].mayorDificultad + "|" + r.datos[0].criterioOrden,
        "Sin registro|Ninguna|Turnos/reservas");
}

console.log("\n" + ok + " OK, " + fail + " fallas");
process.exit(fail ? 1 : 0);
