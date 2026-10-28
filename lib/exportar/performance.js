// El libro de Performance: el proyecto entero o el sprint que está en pantalla.

import { aBuffer, anchos, hoja, libroNuevo, seccion, tabla, tarjetas, texto, textoDe, titulo } from "./formato.js";

const COLUMNAS = 6;

const fecha = (iso) => {
  if (!iso) return "–";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : String(iso);
};

const estadoDe = (cumple) => (cumple === true ? "Cumplido" : cumple === false ? "Pendiente" : "Sin evaluar");

export async function libroDePerformance(reporte) {
  const libro = libroNuevo();
  if (reporte.ambito === "proyecto" || reporte.periodo) proyecto(libro, reporte);
  else sprint(libro, reporte);
  return aBuffer(libro);
}

function proyecto(libro, r) {
  const equipo = r.equipo ?? {};
  resumen(libro, r, equipo);
  planificacion(libro, r.porSprint ?? []);
  equipoHoras(libro, equipo);
  roles(libro, r, equipo);
  calidad(libro, r.errores, equipo.retrabajo);
}

function resumen(libro, r, equipo) {
  const ws = hoja(libro, "Resumen");
  anchos(ws, [28, 22, 28, 22, 18, 18]);
  const p = r.periodo ?? {};
  const leido = r.lectura?.leidoEl ? `Datos de Shortcut del ${r.lectura.leidoEl}` : "Performance";
  let fila = titulo(ws, 1, "Performance · todo el proyecto", COLUMNAS, leido);
  fila = tarjetas(
    ws,
    fila,
    [
      { etiqueta: "Desde", valor: fecha(p.inicio) },
      { etiqueta: "Hasta", valor: fecha(p.fin) },
      { etiqueta: "Días", valor: textoDe(p.diasTotales) },
      { etiqueta: "Sprints", valor: textoDe(p.sprints?.total) },
      { etiqueta: "En curso", valor: p.enCurso?.nombre ?? "–" },
      { etiqueta: "Días restantes", valor: textoDe(p.diasRestantes) },
    ],
    COLUMNAS
  );
  fila = seccion(ws, fila, "OKRs principales", COLUMNAS);
  tabla(
    ws,
    fila,
    ["Indicador", "Valor", "Meta", "Estado"],
    (equipo.okrs ?? []).map((o) => [o.nombre, textoDe(o.valor), o.descripcionMeta ?? "–", estadoDe(o.cumple)])
  );
}

function planificacion(libro, filas) {
  const ws = hoja(libro, "Planificación");
  anchos(ws, [28, 16, 14, 14, 16, 14, 14, 16, 16]);
  let fila = titulo(ws, 1, "Planificación", 9, "Sprint por sprint");
  tabla(
    ws,
    fila,
    ["Sprint", "Estado", "Desde", "Hasta", "Planificadas", "Cumplidas", "%", "Movidas", "Puntos"],
    filas.map((s) => [
      s.nombre,
      s.estado,
      fecha(s.inicio),
      fecha(s.fin),
      s.planificadas,
      s.cumplidas,
      s.pctCumplimiento,
      s.movidas,
      s.puntosTotales,
    ])
  );
}

function equipoHoras(libro, equipo) {
  const ws = hoja(libro, "Equipo");
  anchos(ws, [24, 14, 14, 14, 14, 14, 16, 16]);
  const h = equipo.horas ?? {};
  let fila = titulo(ws, 1, "Horas y carga del equipo", 8);
  const eq = h.equipo ?? {};
  fila = tarjetas(
    ws,
    fila,
    [
      { etiqueta: "Capacidad", valor: textoDe(eq.capacidad) },
      { etiqueta: "Demanda", valor: textoDe(eq.demanda) },
      { etiqueta: "Horas hechas", valor: textoDe(eq.hechas) },
      { etiqueta: "Horas asignadas", valor: textoDe(eq.asignadas) },
      { etiqueta: "Utilización", valor: eq.utilizacion == null ? "–" : `${eq.utilizacion}%` },
      { etiqueta: "Efectividad", valor: eq.efectividad == null ? "–" : `${eq.efectividad}%` },
    ],
    6
  );
  fila = seccion(ws, fila, "Puntos y horas", 8);
  fila = tabla(
    ws,
    fila,
    ["Puntos", "Horas"],
    (h.escala ?? equipo.configuracion?.escala ?? []).map((e) => [e.puntos, e.horas])
  );
  fila = seccion(ws, fila, "Por persona", 8);
  tabla(
    ws,
    fila,
    ["Persona", "Rol", "Capacidad", "Demanda", "Hechas", "Asignadas", "Utilización %", "Efectividad %"],
    (h.personas ?? []).map((p) => [p.nombre, p.rol, p.capacidad, p.demanda, p.hechas, p.asignadas, p.utilizacion, p.efectividad])
  );
}

function roles(libro, r, equipo) {
  const ws = hoja(libro, "Roles");
  anchos(ws, [24, 14, 14, 14, 28, 16, 16]);
  let fila = titulo(ws, 1, "Roles y tipo de trabajo", 7);
  fila = seccion(ws, fila, "Distribución por rol", 7);
  fila = tabla(
    ws,
    fila,
    ["Rol", "Tareas", "Puntos", "%"],
    (equipo.porRol?.grupos ?? []).map((g) => [g.rol, g.tareas, g.puntos, g.pctTareas])
  );
  fila = seccion(ws, fila, "Por tipo de trabajo", 7);
  fila = tabla(
    ws,
    fila,
    ["Tipo", "Tareas", "Puntos", "Terminadas"],
    (r.porEspecialidad?.grupos ?? []).map((g) => [g.nombre, g.total, g.puntos, g.terminadas])
  );
  fila = seccion(ws, fila, "Por iniciativa", 7);
  tabla(
    ws,
    fila,
    ["Iniciativa", "Tareas", "Puntos", "Puntos terminados"],
    (r.porIniciativa?.grupos ?? []).map((g) => [g.nombre, g.total, g.puntos, g.puntosTerminados])
  );
}

function calidad(libro, errores, retrabajo) {
  const ws = hoja(libro, "Calidad");
  anchos(ws, [28, 18, 28, 18]);
  let fila = titulo(ws, 1, "Calidad", 4);
  const e = errores ?? {};
  fila = tarjetas(
    ws,
    fila,
    [
      { etiqueta: "Errores reportados", valor: textoDe(e.reportados) },
      { etiqueta: "Resueltos", valor: textoDe(e.resueltos) },
      { etiqueta: "Abiertos", valor: textoDe(e.abiertos) },
      { etiqueta: "% resueltos", valor: e.pctResueltos == null ? "–" : `${e.pctResueltos}%` },
      { etiqueta: "Retrabajo", valor: retrabajo?.pct == null ? "–" : `${retrabajo.pct}%` },
      { etiqueta: "Tareas con retrabajo", valor: textoDe(retrabajo?.conRetrabajo) },
    ],
    4
  );
  const casos = retrabajo?.casos ?? [];
  if (casos.length === 0) return;
  fila = seccion(ws, fila, "Tareas que volvieron atrás", 4);
  tabla(
    ws,
    fila,
    ["Tarea", "Responsables", "Vueltas"],
    casos.map((c) => [c.titulo, (c.responsables ?? []).join(", "), c.vueltas?.length ?? 0])
  );
}

function sprint(libro, r) {
  const ws = hoja(libro, "Sprint");
  anchos(ws, [36, 18, 16, 22, 18, 16]);
  const s = r.sprint ?? {};
  const res = r.resumen ?? {};
  let fila = titulo(ws, 1, s.nombre ?? "Sprint", COLUMNAS, `${fecha(s.inicio)} al ${fecha(s.fin)} · ${s.estado ?? ""}`);
  const tareas = res.tareas ?? {};
  const puntos = res.puntos ?? {};
  fila = tarjetas(
    ws,
    fila,
    [
      { etiqueta: "Tareas", valor: textoDe(tareas.total) },
      { etiqueta: "Terminadas", valor: textoDe(tareas.terminadas) },
      { etiqueta: "% tareas", valor: tareas.pct == null ? "–" : `${tareas.pct}%` },
      { etiqueta: "Puntos", valor: textoDe(puntos.total) },
      { etiqueta: "Puntos terminados", valor: textoDe(puntos.terminados) },
      { etiqueta: "% puntos", valor: puntos.pct == null ? "–" : `${puntos.pct}%` },
    ],
    COLUMNAS
  );
  const plan = r.cumplimiento?.planificadas;
  if (plan) {
    fila = seccion(ws, fila, "Cumplimiento", COLUMNAS);
    fila = tarjetas(
      ws,
      fila,
      [
        { etiqueta: "Planificadas", valor: textoDe(plan.total) },
        { etiqueta: "Cumplidas", valor: textoDe(plan.terminadas) },
        { etiqueta: "En curso", valor: textoDe(plan.enCurso) },
        { etiqueta: "Movidas", valor: textoDe(plan.movidas) },
        { etiqueta: "%", valor: plan.pct == null ? "–" : `${plan.pct}%` },
      ],
      COLUMNAS
    );
  }
  const okrs = r.equipo?.okrs ?? [];
  if (okrs.length > 0) {
    fila = seccion(ws, fila, "OKRs", COLUMNAS);
    fila = tabla(
      ws,
      fila,
      ["Indicador", "Valor", "Meta", "Estado"],
      okrs.map((o) => [o.nombre, textoDe(o.valor), o.descripcionMeta ?? "–", estadoDe(o.cumple)])
    );
  }
  equipoHoras(libro, r.equipo ?? {});
  const tareasWs = hoja(libro, "Tareas");
  anchos(tareasWs, [42, 18, 18, 12, 28]);
  let f = titulo(tareasWs, 1, "Tareas del sprint", 5);
  f = seccion(tareasWs, f, "Terminadas", 5);
  f = tabla(
    tareasWs,
    f,
    ["Tarea", "Estado", "Responsables", "Puntos", "Terminada"],
    (r.terminadas ?? []).map((t) => [t.titulo, t.estado, (t.responsables ?? []).join(", "), t.puntos, fecha(t.terminadaEl)])
  );
  f = seccion(tareasWs, f, "Pendientes", 5);
  tabla(
    tareasWs,
    f,
    ["Tarea", "Estado", "Responsables", "Puntos"],
    (r.pendientes ?? []).map((t) => [t.titulo, t.estado, (t.responsables ?? []).join(", "), t.puntos])
  );
  if ((r.problemas ?? []).length > 0) {
    texto(tareasWs, f, `${r.problemas.length} notas sobre los datos.`, 5);
  }
}
