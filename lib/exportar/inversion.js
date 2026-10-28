// El libro de Avance e inversión: las mismas secciones que la pantalla, en el
// mismo orden, con los números que ya calculó el informe.

import { aBuffer, anchos, hoja, libroNuevo, seccion, tabla, tarjetas, texto, textoDe, titulo } from "./formato.js";

const COLUMNAS = 6;

const estadoDe = (cumple) => (cumple === true ? "Cumplido" : cumple === false ? "Pendiente" : "Sin evaluar");

const fecha = (iso) => {
  if (!iso) return "–";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

export async function libroDeInversion(reporte) {
  const libro = libroNuevo();
  resumen(libro, reporte);
  proyeccion(libro, reporte);
  horas(libro, reporte);
  entregas(libro, reporte);
  pendiente(libro, reporte);
  return aBuffer(libro);
}

function resumen(libro, r) {
  const ws = hoja(libro, "Resumen");
  anchos(ws, [28, 22, 28, 22, 18, 18]);
  const leido = r.lectura?.leidoEl ? `Datos de Shortcut del ${r.lectura.leidoEl}` : "Avance e inversión";
  let fila = titulo(ws, 1, "Avance e inversión", COLUMNAS, leido);
  const mvp = r.mvp ?? {};
  const alcance = r.alcance?.valor ?? {};
  fila = seccion(ws, fila, "MVP de LavApp", COLUMNAS);
  fila = tarjetas(
    ws,
    fila,
    [
      { etiqueta: "Fecha de entrega", valor: mvp.configurada ? fecha(mvp.entrega) : "Sin fecha" },
      { etiqueta: "Días restantes", valor: textoDe(mvp.diasRestantes) },
      { etiqueta: "Alcance terminado", valor: alcance.pct == null ? "–" : `${alcance.pct}%` },
      { etiqueta: "Horas terminadas", valor: textoDe(alcance.terminado) },
      { etiqueta: "Horas del alcance", valor: textoDe(alcance.total) },
      { etiqueta: "Horas en curso", valor: textoDe(alcance.enCurso) },
    ],
    COLUMNAS
  );
  fila = seccion(ws, fila, "Objetivos del MVP", COLUMNAS);
  tabla(
    ws,
    fila,
    ["Objetivo", "Valor", "Meta", "Estado"],
    (r.okrs ?? []).map((o) => [o.nombre, textoDe(o.valor), textoDe(o.meta), estadoDe(o.cumple)])
  );
}

function proyeccion(libro, r) {
  const ws = hoja(libro, "Proyección");
  anchos(ws, [22, 18, 22, 18, 22, 18]);
  let fila = titulo(ws, 1, "Proyección de la entrega", COLUMNAS, "Ritmo desde el inicio del sprint en curso");
  const ritmo = r.ritmo ?? {};
  const p = ritmo.proyeccion;
  fila = tarjetas(
    ws,
    fila,
    [
      { etiqueta: "Ritmo actual", valor: ritmo.porDia == null ? "–" : `${ritmo.porDia} h por día` },
      { etiqueta: "Desde", valor: fecha(ritmo.desde) },
      { etiqueta: "Días del período", valor: textoDe(ritmo.dias) },
      { etiqueta: "Pendiente", valor: ritmo.restante == null ? "–" : `${ritmo.restante} h` },
      { etiqueta: "Fecha estimada", valor: p?.terminado ? "Completo" : fecha(p?.fin) },
      { etiqueta: "Tareas del ritmo", valor: textoDe(ritmo.tareasTerminadas) },
    ],
    COLUMNAS
  );
  fila = seccion(ws, fila, "Avance acumulado", COLUMNAS);
  tabla(
    ws,
    fila,
    ["Día", "Alcance", "Planificado", "Terminado", "Proyección"],
    (r.avanceAcumulado ?? []).map((d) => [fecha(d.dia), d.alcance, d.planificado, d.terminado, d.proyeccion])
  );
}

function horas(libro, r) {
  const ws = hoja(libro, "Horas");
  anchos(ws, [28, 16, 16, 16, 18, 18]);
  let fila = titulo(ws, 1, "Inversión de horas", COLUMNAS, "Cada historia se estima en puntos y esos puntos se traducen a horas");
  const h = r.inversion?.horas ?? {};
  fila = seccion(ws, fila, "Puntos y horas", COLUMNAS);
  fila = tabla(
    ws,
    fila,
    ["Puntos", "Horas"],
    (h.escala ?? []).map((e) => [e.puntos, e.horas])
  );
  fila = tarjetas(
    ws,
    fila,
    [
      { etiqueta: "Horas justificadas", valor: textoDe(h.justificadas) },
      { etiqueta: "En curso", valor: textoDe(h.enCurso) },
      { etiqueta: "Por iniciar", valor: textoDe(h.pendientes) },
      { etiqueta: "Comprometidas", valor: textoDe(h.comprometidas) },
      { etiqueta: "Mínimo", valor: textoDe(h.minimo) },
      { etiqueta: "Pactadas", valor: textoDe(h.pactadas) },
    ],
    COLUMNAS
  );
  fila = seccion(ws, fila, "Por tipo de trabajo", COLUMNAS);
  tabla(
    ws,
    fila,
    ["Tipo", "Total", "Terminado", "En curso", "Pendiente", "% de lo terminado"],
    (r.inversion?.porTipo ?? []).map((t) => [
      t.nombre,
      t.valor?.total,
      t.valor?.terminado,
      t.valor?.enCurso,
      t.valor?.pendiente,
      t.pctDeLoTerminado,
    ])
  );
}

function entregas(libro, r) {
  const ws = hoja(libro, "Entregas");
  anchos(ws, [28, 14, 14, 20, 12, 26, 16, 24, 16]);
  let fila = titulo(ws, 1, "Entregas por sprint", 9);
  tabla(
    ws,
    fila,
    ["Sprint", "Desde", "Hasta", "Planificado (h)", "Tareas", "Entregado en el sprint (h)", "% en el sprint", "Después del cierre (h)", "Pendiente (h)"],
    (r.entregas ?? []).map((s) => [
      s.nombre,
      fecha(s.inicio),
      fecha(s.fin),
      s.planificado?.valor,
      s.planificado?.tareas,
      s.enElSprint?.valor,
      s.pctEnElSprint,
      s.despues?.valor,
      s.pendiente?.valor,
    ])
  );
}

function pendiente(libro, r) {
  const ws = hoja(libro, "Pendiente");
  anchos(ws, [28, 16, 16, 16, 36]);
  let fila = titulo(ws, 1, "Pendiente para el MVP", COLUMNAS);
  fila = tabla(
    ws,
    fila,
    ["Tipo", "En curso", "Sin empezar", "Horas"],
    (r.pendientes ?? []).map((g) => [g.nombre ?? g.clave, g.enCurso, g.sinEmpezar, g.valor])
  );
  const notas = r.riesgos ?? [];
  if (notas.length === 0) return;
  fila = seccion(ws, fila, "Para la entrega", COLUMNAS);
  notas.forEach((n) => {
    fila = texto(ws, fila, frase(n), COLUMNAS);
  });
}

function frase(n) {
  if (n.clave === "no-llega") return `Al ritmo del sprint, el alcance se completaría el ${fecha(n.fin)}.`;
  if (n.clave === "horas-bajo-el-minimo") return `Faltan ${n.faltan} h para el mínimo de horas justificadas.`;
  if (n.clave === "entrega-vencida") return `La fecha de entrega venció con ${n.restante} h pendientes.`;
  if (n.clave === "sin-estimar") return `${n.tareas} tareas sin estimación.`;
  if (n.clave === "sin-clasificar") return `${n.tareas} tareas sin tipo de trabajo.`;
  if (n.clave === "entregas-despues-del-cierre") return `${n.tareas} tareas de ${n.sprint?.nombre ?? "un sprint"} se completaron después del cierre.`;
  if (n.clave === "sprint-cerrado-con-pendientes") return `${n.sprint?.nombre ?? "Un sprint"} cerró con ${n.tareas} tareas sin completar.`;
  return n.clave;
}
