// Tests de lib/kpis/performance.js. Sin framework: node los corre directo.
//
//   npm test
//
// Los datos de entrada tienen la forma exacta de la API v3 de Shortcut (los
// mismos campos que devuelve el workspace real), con contenido inventado. El
// "ahora" se fija en cada caso: nada depende del reloj de la maquina.

import {
  armarReporte,
  describirSprint,
  diaLocal,
  elegirSprintPorDefecto,
  listarSprints,
} from "../lib/kpis/performance.js";

let ok = 0, fail = 0;
const check = (nombre, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log("  OK   " + nombre); }
  else { fail++; console.log("  FALLA " + nombre + "\n        real:     " + a + "\n        esperado: " + b); }
};

// ---- payloads con forma de Shortcut --------------------------------------

const BACKLOG = 500000006, TO_DO = 500000007, IN_PROGRESS = 500000008, IN_REVIEW = 500000009, DONE = 500000010;
const WORKFLOW = {
  id: 500000005,
  name: "Standard",
  states: [
    { id: BACKLOG, name: "Backlog", type: "backlog", position: 0 },
    { id: TO_DO, name: "To Do", type: "unstarted", position: 1 },
    { id: IN_PROGRESS, name: "In Progress", type: "started", position: 2 },
    { id: IN_REVIEW, name: "In Review", type: "started", position: 3 },
    { id: DONE, name: "Done", type: "done", position: 4 },
  ],
};
const MIEMBROS = [
  { id: "uuid-ana", profile: { name: "Ana Pérez", mention_name: "ana" } },
  { id: "uuid-beto", profile: { name: null, mention_name: "beto" } },
];
const EPICS = [{ id: 16, name: "Epic - LavApp " }];

const iteracion = (o = {}) => ({
  id: 29,
  name: "Sprint 1",
  status: "started",
  start_date: "2026-09-23",
  end_date: "2026-10-07",
  app_url: "https://app.shortcut.com/lavapp/iteration/29",
  ...o,
});

let siguienteId = 100;
const story = (o = {}) => {
  const id = o.id ?? siguienteId++;
  return {
    id,
    name: `Tarea ${id}`,
    app_url: `https://app.shortcut.com/lavapp/story/${id}`,
    archived: false,
    workflow_id: WORKFLOW.id,
    workflow_state_id: TO_DO,
    started: false,
    completed: false,
    estimate: null,
    epic_id: null,
    owner_ids: [],
    parent_story_id: null,
    iteration_id: 29,
    created_at: "2026-09-20T12:00:00Z",
    updated_at: "2026-09-20T12:00:00Z",
    started_at: null,
    started_at_override: null,
    completed_at: null,
    completed_at_override: null,
    ...o,
  };
};
const enCurso = (o = {}) =>
  story({ workflow_state_id: IN_PROGRESS, started: true, started_at: "2026-09-24T12:00:00Z", ...o });
const terminada = (o = {}) =>
  story({
    workflow_state_id: DONE,
    started: true,
    completed: true,
    started_at: "2026-09-24T12:00:00Z",
    completed_at: "2026-09-25T12:00:00Z",
    ...o,
  });

// Miercoles 30/09 a las 12 de Buenos Aires.
const AHORA = new Date("2026-09-30T15:00:00Z");

const reporte = (stories, o = {}) =>
  armarReporte(
    {
      iteraciones: o.iteraciones ?? [iteracion()],
      iteracion: o.iteracion ?? iteracion(),
      stories,
      workflows: o.workflows ?? [WORKFLOW],
      miembros: o.miembros ?? MIEMBROS,
      epics: o.epics ?? EPICS,
    },
    { ahora: o.ahora ?? AHORA, leidoEl: o.leidoEl ?? [] }
  );

// ---- tests ----------------------------------------------------------------

console.log("### 1. % de avance");
{
  const r = reporte([
    terminada({ estimate: 5 }),
    enCurso({ estimate: 3 }),
    story({ estimate: 2 }),
    story(),
  ]);
  check("conteo de tareas", r.resumen.tareas, {
    total: 4, terminadas: 1, enCurso: 1, pendientes: 2, pct: 25, subtareas: 0, archivadas: 0,
  });
  check("puntos: las sin estimar suman 0 y se informan", r.resumen.puntos, {
    total: 10, terminados: 5, pct: 50, tareasSinEstimar: 1,
  });
}
{
  const r = reporte([terminada(), story(), story()]);
  check("redondeo a un decimal (1 de 3)", r.resumen.tareas.pct, 33.3);
}
{
  const r = reporte([terminada({ estimate: 3, archived: true }), story({ estimate: 2 })]);
  check("las archivadas no cuentan", [r.resumen.tareas.total, r.resumen.tareas.terminadas, r.resumen.puntos.total], [1, 0, 2]);
  check("pero se informa cuantas se excluyeron", r.resumen.tareas.archivadas, 1);
}
{
  const r = reporte([]);
  check("sprint vacio: sin porcentaje, no 0%", [r.resumen.tareas.pct, r.resumen.puntos.pct], [null, null]);
  check("sprint vacio: sin filas por estado", r.porEstado, []);
}
{
  const r = reporte([terminada(), story()]);
  check("nada estimado: sin porcentaje de puntos", [r.resumen.puntos.total, r.resumen.puntos.pct], [0, null]);
}
{
  const r = reporte([story({ id: 17, name: "HU-07" }), terminada({ parent_story_id: 17 }), story({ parent_story_id: 17 })]);
  check("las subtareas cuentan como tareas", [r.resumen.tareas.total, r.resumen.tareas.subtareas], [3, 2]);
}
{
  // Terminada es `completed`, no el nombre de la columna.
  const r = reporte([story({ workflow_state_id: IN_REVIEW, started: true, completed: true, completed_at: "2026-09-25T12:00:00Z" })]);
  check("completed manda aunque la columna no sea de tipo done", r.resumen.tareas.terminadas, 1);
}

console.log("### 2. tareas por estado");
{
  const r = reporte([
    terminada({ estimate: 5 }),
    enCurso({ estimate: 3 }),
    enCurso(),
    story({ estimate: 2 }),
  ]);
  check(
    "en el orden del tablero y con las columnas vacias",
    r.porEstado.map((e) => [e.nombre, e.tareas, e.puntos]),
    [["Backlog", 0, 0], ["To Do", 1, 2], ["In Progress", 2, 3], ["In Review", 0, 0], ["Done", 1, 5]]
  );
  check("cada columna trae su etapa", r.porEstado.map((e) => e.etapa), ["Pendiente", "Pendiente", "En curso", "En curso", "Terminado"]);
}
{
  const OTRO = { id: 9, name: "Otro", states: [{ id: 1, name: "Nuevo", type: "unstarted", position: 0 }] };
  const r = reporte([story()], { workflows: [WORKFLOW, OTRO] });
  check("solo los workflows que usan las tareas del sprint", r.porEstado.length, 5);
}
{
  const r = reporte([story({ workflow_state_id: 999, started: true })]);
  check("un estado desconocido no se pierde: tiene su fila", r.porEstado.at(-1), {
    id: 999, nombre: "Estado desconocido", etapa: "En curso", tareas: 1, puntos: 0,
  });
  check("y queda reportado", r.problemas, [
    { tarea: r.pendientes[0].id, campo: "workflow_state_id", valor: 999, motivo: "estado que no esta en ningun workflow" },
  ]);
}

console.log("### 3. traduccion de ids a nombres");
{
  const r = reporte([
    story({ id: 17, name: "HU-07 — Registrar cliente", owner_ids: ["uuid-ana"], epic_id: 16 }),
    story({ id: 27, parent_story_id: 17, owner_ids: ["uuid-beto", "uuid-ana"] }),
    story({ id: 28, parent_story_id: 999 }),
  ]);
  const porId = Object.fromEntries(r.pendientes.map((t) => [t.id, t]));
  check("responsable por nombre", porId[17].responsables, ["Ana Pérez"]);
  check("sin nombre cargado usa el usuario", porId[27].responsables, ["beto", "Ana Pérez"]);
  check("epic por nombre, sin espacios de mas", porId[17].epic, "Epic - LavApp");
  check("sin epic queda null", porId[27].epic, null);
  check("subtarea con su historia", porId[27].historia, { id: 17, titulo: "HU-07 — Registrar cliente" });
  check("historia fuera del sprint: id sin titulo", porId[28].historia, { id: 999, titulo: null });
  check("nada que reportar", r.problemas, []);
}
{
  const r = reporte([story({ id: 50, owner_ids: ["uuid-nadie"], epic_id: 77 })]);
  check("persona y epic desconocidos se muestran igual", [r.pendientes[0].responsables, r.pendientes[0].epic], [["Persona sin nombre"], "Epic sin nombre"]);
  check("y los dos quedan reportados", r.problemas.map((p) => p.campo), ["owner_ids", "epic_id"]);
}
{
  const r = reporte([terminada({ id: 60, completed_at: "2026-09-25T12:00:00Z", completed_at_override: "2026-09-24T18:00:00Z" })]);
  check("la fecha manual de Shortcut le gana a la real", r.terminadas[0].terminadaEl, "2026-09-24T18:00:00Z");
}
{
  const r = reporte([terminada({ id: 61, completed_at: null })]);
  check("terminada sin fecha: se reporta", r.problemas.map((p) => [p.tarea, p.campo]), [[61, "completed_at"]]);
}

console.log("### 4. listas de terminadas y pendientes");
{
  const r = reporte([
    terminada({ id: 1, completed_at: "2026-09-24T12:00:00Z" }),
    terminada({ id: 2, completed_at: "2026-09-26T12:00:00Z" }),
    story({ id: 3 }),
    enCurso({ id: 4, workflow_state_id: IN_REVIEW }),
    enCurso({ id: 5 }),
    story({ id: 6, workflow_state_id: BACKLOG }),
  ]);
  check("terminadas: la mas reciente primero", r.terminadas.map((t) => t.id), [2, 1]);
  check("pendientes: la mas avanzada primero", r.pendientes.map((t) => t.id), [4, 5, 3, 6]);
  check("cada fila con lo que muestra la tabla", Object.keys(r.pendientes[0]), [
    "id", "titulo", "url", "estado", "etapa", "epic", "responsables", "puntos", "historia", "terminadaEl",
  ]);
}

console.log("### 5. el sprint: dias y cual mostrar");
{
  const s = describirSprint(iteracion(), AHORA);
  check("dias restantes cuentan hoy (30/09 al 07/10)", [s.diasRestantes, s.diasTotales], [8, 15]);
  check("estado en castellano", s.estado, "En curso");
  // 23:00 del 30/09 en Buenos Aires ya es 01/10 en UTC.
  check("el dia se corta en hora argentina", describirSprint(iteracion(), new Date("2026-10-01T02:00:00Z")).diasRestantes, 8);
  check("el ultimo dia queda 1", describirSprint(iteracion(), new Date("2026-10-07T15:00:00Z")).diasRestantes, 1);
  check("terminado: 0", describirSprint(iteracion({ status: "done" }), new Date("2026-10-08T15:00:00Z")).diasRestantes, 0);
  const proximo = describirSprint(iteracion({ status: "unstarted" }), new Date("2026-09-20T15:00:00Z"));
  check("proximo: faltan 3 dias y quedan los 15", [proximo.diasParaEmpezar, proximo.diasRestantes, proximo.estado], [3, 15, "Próximo"]);
  check("fechas con hora se toman por su dia", describirSprint(iteracion({ start_date: "2026-09-23T00:00:00Z" }), AHORA).inicio, "2026-09-23");
}
{
  const it = (id, status, start_date) => iteracion({ id, status, start_date, end_date: start_date });
  check("el sprint en curso", elegirSprintPorDefecto([it(1, "done", "2026-09-01"), it(2, "started", "2026-09-15"), it(3, "unstarted", "2026-10-01")]), 2);
  check("dos en curso: el que empezo ultimo", elegirSprintPorDefecto([it(1, "started", "2026-09-01"), it(2, "started", "2026-09-15")]), 2);
  check("ninguno en curso: el ultimo terminado", elegirSprintPorDefecto([it(1, "done", "2026-09-01"), it(2, "done", "2026-09-15"), it(3, "unstarted", "2026-10-01")]), 2);
  check("solo proximos: el mas cercano", elegirSprintPorDefecto([it(1, "unstarted", "2026-11-01"), it(2, "unstarted", "2026-10-01")]), 2);
  check("sin sprints: null", elegirSprintPorDefecto([]), null);
  check("selector del mas nuevo al mas viejo", listarSprints([it(1, "done", "2026-09-01"), it(3, "unstarted", "2026-10-01"), it(2, "started", "2026-09-15")]).map((s) => s.id), [3, 2, 1]);
}
{
  check("diaLocal: 23:59 de Buenos Aires sigue siendo ese dia", diaLocal("2026-09-25T02:59:59Z"), "2026-09-24");
  check("diaLocal: 00:00 de Buenos Aires ya es el siguiente", diaLocal("2026-09-25T03:00:00Z"), "2026-09-25");
}

console.log("### 6. de cuando es el dato");
{
  const r = reporte([], { leidoEl: ["2026-09-30T14:50:00Z", "2026-09-30T14:40:00Z"] });
  check("manda la lectura mas vieja", r.lectura, { leidoEl: "2026-09-30T14:40:00.000Z", desactualizado: false });
  const viejo = reporte([], { leidoEl: ["2026-09-30T14:20:00Z", null] });
  check("mas de 30 minutos: desactualizado", viejo.lectura, { leidoEl: "2026-09-30T14:20:00.000Z", desactualizado: true });
  check("sin fecha de lectura no se inventa una", reporte([]).lectura, { leidoEl: null, desactualizado: false });
}

console.log("\n" + ok + " OK, " + fail + " fallas");
process.exit(fail ? 1 : 0);
