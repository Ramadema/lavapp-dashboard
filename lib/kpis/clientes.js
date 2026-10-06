// Clientes y vehiculos: los clientes finales de los lavaderos, vistos desde el
// backoffice. Recibe las filas crudas de GET /backoffice/clientes (lo que
// devuelve lib/gestion.js) y la hora por parametro. Puro: sin fetch, sin React,
// sin process.env; la pantalla lo importa para sus constantes.
import { MS_POR_DIA, describirLectura, instante, mesLocal, promedio } from "./tiempo.js";

// @decision 2026-10-06 ramiro@mispichos.com
// Un cliente es recurrente si tuvo dos o mas lavados en los ultimos 90 dias.
// Un trimestre es el plazo en que un auto que se lava "seguido" vuelve al menos
// una vez mas; con 30 dias casi nadie calificaba y con un año el dato no dice
// nada de hoy. El backend recibe la fecha de corte y cuenta; el umbral vive aca.
export const DIAS_RECURRENCIA = 90;
export const LAVADOS_PARA_RECURRENTE = 2;

// Como se reparten los clientes segun cuantos lavados tienen en total.
export const TRAMOS_DE_LAVADOS = [
  { nombre: "Sin lavados", desde: 0, hasta: 0 },
  { nombre: "1 lavado", desde: 1, hasta: 1 },
  { nombre: "2 a 4 lavados", desde: 2, hasta: 4 },
  { nombre: "5 o más", desde: 5, hasta: Infinity },
];

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// La fecha de corte que se le pide al backend para contar los lavados
// recientes. Redondeada al minuto, como el periodo de Operacion, para que la
// URL se repita y el cache sirva.
export function desdeRecurrencia(ahora) {
  const minuto = Math.floor(ahora.getTime() / 60_000) * 60_000;
  return new Date(minuto - DIAS_RECURRENCIA * MS_POR_DIA).toISOString();
}

const esCantidad = (v) => Number.isInteger(v) && v >= 0;

function normalizar(filas, problemas, ahora) {
  const rechazar = (fila, campo, valor, motivo) => {
    problemas.push({ cliente: fila?.id ?? null, campo, valor: valor ?? null, motivo });
    return null;
  };
  return filas
    .map((fila) => {
      if (!Number.isInteger(fila?.id)) return rechazar(fila, "id", fila?.id, "no es un número");
      if (typeof fila.nombre !== "string" || fila.nombre === "") {
        return rechazar(fila, "nombre", fila.nombre, "sin nombre");
      }
      if (!FECHA.test(fila.altaEl ?? "")) return rechazar(fila, "altaEl", fila.altaEl, "no es una fecha");
      for (const campo of ["vehiculos", "lavados", "lavadosRecientes"]) {
        if (!esCantidad(fila[campo])) return rechazar(fila, campo, fila[campo], "no es una cantidad");
      }
      let ultimo = null;
      if (fila.ultimoLavado != null) {
        ultimo = instante(fila.ultimoLavado);
        if (ultimo === null) return rechazar(fila, "ultimoLavado", fila.ultimoLavado, "no es una fecha");
      }
      return {
        id: fila.id,
        lavadero: fila.lavadero ?? "Sin lavadero",
        nombre: fila.nombre,
        altaEl: fila.altaEl,
        vehiculos: fila.vehiculos,
        lavados: fila.lavados,
        lavadosRecientes: fila.lavadosRecientes,
        ultimoLavado: ultimo === null ? null : new Date(ultimo).toISOString(),
        diasDesdeUltimoLavado:
          ultimo === null ? null : Math.max(0, Math.floor((ahora.getTime() - ultimo) / MS_POR_DIA)),
        recurrente: fila.lavadosRecientes >= LAVADOS_PARA_RECURRENTE,
      };
    })
    .filter(Boolean);
}

// El tablero de Clientes y vehiculos. `clientes` son las filas crudas del
// backend, pedidas con desdeRecurrencia(ahora); `leidoEl` es cuando se leyeron.
export function armarClientes(clientes, { ahora, leidoEl = [] }) {
  const problemas = [];
  const filas = normalizar(clientes, problemas, ahora);
  const mesActual = mesLocal(ahora);
  const sumar = (lista, campo) => lista.reduce((total, f) => total + f[campo], 0);
  const tipo = (f) => (f.recurrente ? "recurrentes" : f.lavados > 0 ? "ocasionales" : "sinLavados");

  const porLavadero = [...new Set(filas.map((f) => f.lavadero))]
    .map((lavadero) => {
      const lista = filas.filter((f) => f.lavadero === lavadero);
      return {
        lavadero,
        clientes: lista.length,
        recurrentes: lista.filter((f) => tipo(f) === "recurrentes").length,
        ocasionales: lista.filter((f) => tipo(f) === "ocasionales").length,
        sinLavados: lista.filter((f) => tipo(f) === "sinLavados").length,
        vehiculos: sumar(lista, "vehiculos"),
        lavados: sumar(lista, "lavados"),
      };
    })
    .sort((a, b) => b.clientes - a.clientes || a.lavadero.localeCompare(b.lavadero));

  return {
    totales: {
      clientes: filas.length,
      recurrentes: filas.filter((f) => f.recurrente).length,
      conLavados: filas.filter((f) => f.lavados > 0).length,
      sinLavados: filas.filter((f) => f.lavados === 0).length,
      nuevosDelMes: filas.filter((f) => f.altaEl.startsWith(mesActual)).length,
      vehiculos: sumar(filas, "vehiculos"),
      lavados: sumar(filas, "lavados"),
      lavadosPorCliente: promedio(filas.map((f) => f.lavados), 1),
    },
    porLavadero,
    distribucionLavados: TRAMOS_DE_LAVADOS.map((tramo) => ({
      nombre: tramo.nombre,
      valor: filas.filter((f) => f.lavados >= tramo.desde && f.lavados <= tramo.hasta).length,
    })),
    clientes: [...filas].sort(
      (a, b) =>
        b.lavados - a.lavados ||
        (b.ultimoLavado ?? "").localeCompare(a.ultimoLavado ?? "") ||
        a.nombre.localeCompare(b.nombre)
    ),
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}
