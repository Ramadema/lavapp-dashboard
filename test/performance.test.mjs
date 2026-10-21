// Tests de lib/kpis/performance.js. Sin framework: node los corre directo.
//
//   npm test
//
// Los datos de entrada tienen la forma exacta de la API v3 de Shortcut (los
// mismos campos que devuelve el workspace real), con contenido inventado. El
// "ahora" se fija en cada caso: nada depende del reloj de la maquina.

import {
  armarHistorial,
  armarReporte,
  avancePorIniciativa,
  calcularBurndown,
  calcularCumplimiento,
  calcularCycleTime,
  calcularFlujo,
  calcularRetrabajo,
  calcularRitmo,
  calcularTiempoEnSprint,
  calcularTiempoPorColumna,
  cargaPorResponsable,
  describirSprint,
  diaLocal,
  elegirSprintPorDefecto,
  fechaDeIngreso,
  listarSprints,
  pasoPorSprint,
  sprintsDestino,
  sprintsParaHistorial,
  otrosSprints,
  describirProyecto,
  repartirDias,
  ETIQUETA_SIN_RETRABAJO,
  MINUTOS_DE_CORRECCION,
  VERSION_DE_DATOS,
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

// Las `stats` vienen siempre en /iterations; sin ellas el progreso del
// proyecto reporta un problema (ver proyecto.test.mjs), asi que la iteracion
// de prueba las trae en 0.
const iteracion = (o = {}) => ({
  id: 29,
  name: "Sprint 1",
  status: "started",
  start_date: "2026-09-23",
  end_date: "2026-10-07",
  app_url: "https://app.shortcut.com/lavapp/iteration/29",
  stats: {
    num_stories_done: 0, num_stories_started: 0, num_stories_unstarted: 0, num_stories_backlog: 0,
    num_stories_unestimated: 0, num_points: 0, num_points_done: 0, num_points_started: 0,
    num_points_unstarted: 0, num_points_backlog: 0, num_related_documents: 0,
  },
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

// Las stats del sprint que se mira se derivan de sus stories, como las calcula
// Shortcut: si no coincidieran, armarReporte reportaria la diferencia y los
// tests que fijan `problemas` fallarian por eso y no por lo que prueban.
const conStats = (it, stories) => {
  const vivas = stories.filter((s) => !s.archived);
  const terminadas = vivas.filter((s) => s.completed);
  return {
    ...it,
    stats: {
      ...it.stats,
      num_stories_done: terminadas.length,
      num_stories_started: vivas.filter((s) => s.started && !s.completed).length,
      num_stories_unstarted: vivas.filter((s) => !s.started && !s.completed).length,
      num_stories_backlog: 0,
      num_stories_unestimated: vivas.filter((s) => s.estimate === null).length,
      num_points: vivas.reduce((t, s) => t + (s.estimate ?? 0), 0),
      num_points_done: terminadas.reduce((t, s) => t + (s.estimate ?? 0), 0),
    },
  };
};

const reporte = (stories, o = {}) => {
  const it = conStats(o.iteracion ?? iteracion(), stories);
  return armarReporte(
    {
      // La fila del proyecto sale de la lista: la iteracion que se mira va con
      // las mismas stats en los dos lados.
      iteraciones: (o.iteraciones ?? [iteracion()]).map((i) => (i.id === it.id ? it : i)),
      iteracion: it,
      stories,
      workflows: o.workflows ?? [WORKFLOW],
      miembros: o.miembros ?? MIEMBROS,
      epics: o.epics ?? EPICS,
      camposCustom: o.camposCustom,
      historiales: o.historiales,
      movidas: o.movidas,
    },
    { ahora: o.ahora ?? AHORA, leidoEl: o.leidoEl ?? [], problemas: o.problemas, equipo: o.equipo }
  );
};

// Entradas de /stories/{id}/history, con la forma real: `changes.iteration_id`
// trae solo `new` cuando la story no tenia sprint.
const creada = (id, changed_at, extra = {}) => ({
  changed_at,
  actions: [{ id, entity_type: "story", action: "create", name: `Tarea ${id}`, ...extra }],
});
const movida = (id, changed_at, iteration_id) => ({
  changed_at,
  actions: [{ id, entity_type: "story", action: "update", changes: { iteration_id } }],
});

// Tarea interna ya normalizada, para probar el burndown y el cycle time sin
// pasar por toda la traduccion.
const tarea = (o = {}) => ({
  id: siguienteId++,
  titulo: "Tarea",
  terminada: false,
  puntos: null,
  ingresoEl: "2026-09-20T12:00:00Z",
  ingresoEstimado: false,
  empezadaEl: null,
  terminadaEl: null,
  ...o,
});

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

console.log("### 7. cuando entro cada tarea al sprint (historial)");
{
  check("creada directo en el sprint", fechaDeIngreso([creada(53, "2026-09-17T00:56:00Z", { iteration_id: 29 })], 53, 29), "2026-09-17T00:56:00Z");
  check("creada afuera y movida despues (caso real sc-27)",
    fechaDeIngreso([creada(27, "2026-09-17T00:44:25.834Z"), movida(27, "2026-09-29T17:00:22.029Z", { new: 29 })], 27, 29),
    "2026-09-29T17:00:22.029Z");
  check("entro, salio y volvio: cuenta la ultima entrada",
    fechaDeIngreso([movida(30, "2026-09-17T00:51:00Z", { new: 29 }), movida(30, "2026-09-17T00:51:30Z", { old: 29 }), movida(30, "2026-09-17T00:55:00Z", { new: 29 })], 30, 29),
    "2026-09-17T00:55:00Z");
  check("entro y salio: no esta", fechaDeIngreso([movida(31, "2026-09-18T10:00:00Z", { new: 29 }), movida(31, "2026-09-19T10:00:00Z", { old: 29, new: 70 })], 31, 29), null);
  check("la creacion de subtareas en el historial de la historia no cuenta",
    fechaDeIngreso([creada(17, "2026-09-17T00:15:00Z"), creada(19, "2026-09-17T00:16:00Z", { iteration_id: 29 }), movida(17, "2026-09-17T00:55:00Z", { new: 29 })], 17, 29),
    "2026-09-17T00:55:00Z");
  // Mismo segundo, con y sin milisegundos: como texto "25.834Z" < "25Z" y se ordenaria al reves.
  check("ordena por instante, no por texto",
    fechaDeIngreso([movida(32, "2026-09-18T10:00:25.834Z", { old: 29 }), movida(32, "2026-09-18T10:00:25Z", { new: 29 })], 32, 29),
    null);
}
{
  const conHistorial = story({ id: 80, created_at: "2026-09-17T00:00:00Z" });
  const sinEntrada = story({ id: 81, created_at: "2026-09-18T00:00:00Z" });
  const noLeido = story({ id: 82, created_at: "2026-09-19T00:00:00Z" });
  const r = reporte([conHistorial, sinEntrada, noLeido], {
    historiales: { 80: [movida(80, "2026-09-29T17:00:00Z", { new: 29 })], 81: [creada(81, "2026-09-18T00:00:00Z")] },
    problemas: [{ tarea: 82, campo: "historial", valor: null, motivo: "no se pudo leer" }],
  });
  check("sin entrada o sin historial: se estima con la creacion", r.burndown.ingresosEstimados, 2);
  check("el historial sin entrada se reporta; el que no se leyo ya venia reportado",
    r.problemas.map((p) => [p.tarea, p.campo]), [[82, "historial"], [81, "iteration_id"]]);
  check("la que entro el 29 recien suma ese dia", r.burndown.cambiosDeAlcance, [{ dia: "2026-09-29", tareas: 1, puntos: 0 }]);
}

console.log("### 8. burndown");
{
  // Sprint del miercoles 23 al martes 29; hoy es el domingo 27 al mediodia.
  const sprint = describirSprint(iteracion({ start_date: "2026-09-23", end_date: "2026-09-29" }), new Date("2026-09-27T15:00:00Z"));
  const b = calcularBurndown(
    [
      tarea({ puntos: 3, ingresoEl: "2026-09-20T12:00:00Z", terminada: true, terminadaEl: "2026-09-24T12:00:00Z" }),
      tarea({ puntos: 2, ingresoEl: "2026-09-23T10:00:00Z" }),
      // Entra con el sprint empezado y se termina a las 23:30 de Buenos Aires del 25.
      tarea({ puntos: 5, ingresoEl: "2026-09-25T16:00:00Z", terminada: true, terminadaEl: "2026-09-26T02:30:00Z" }),
      tarea({ puntos: null, ingresoEl: "2026-09-26T12:00:00Z" }),
    ],
    sprint,
    new Date("2026-09-27T15:00:00Z")
  );
  check("un punto por dia, del inicio al fin", b.dias.map((d) => d.dia), ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"]);
  check("tareas pendientes al cierre de cada dia; futuro en null", b.dias.map((d) => d.tareas), [2, 1, 1, 2, 2, null, null]);
  check("puntos pendientes (sin estimar suma 0)", b.dias.map((d) => d.puntos), [5, 2, 2, 2, 2, null, null]);
  check("alcance: sube cuando entran tareas", b.dias.map((d) => d.alcanceTareas), [2, 2, 3, 4, 4, null, null]);
  check("ideal en tareas: del alcance total (4) a 0 en linea recta", b.dias.map((d) => d.idealTareas), [4, 3.3, 2.7, 2, 1.3, 0.7, 0]);
  check("ideal en puntos: del alcance total (10) a 0", b.dias.map((d) => d.idealPuntos), [10, 8.3, 6.7, 5, 3.3, 1.7, 0]);
  check("alcance total de hoy", b.alcance, { tareas: 4, puntos: 10 });
  check("cambios de alcance con el sprint empezado", b.cambiosDeAlcance, [
    { dia: "2026-09-25", tareas: 1, puntos: 5 },
    { dia: "2026-09-26", tareas: 1, puntos: 0 },
  ]);
}
{
  const sprint = describirSprint(iteracion({ status: "unstarted", start_date: "2026-10-07", end_date: "2026-10-09" }), AHORA);
  const b = calcularBurndown([tarea({ puntos: 3 }), tarea({ puntos: 1 })], sprint, AHORA);
  check("sprint que no empezo: nada medido", b.dias.map((d) => d.tareas), [null, null, null]);
  check("pero la linea ideal sale del alcance de hoy", b.dias.map((d) => d.idealPuntos), [4, 2, 0]);
}
{
  const sprint = describirSprint(iteracion({ status: "done", start_date: "2026-09-01", end_date: "2026-09-03" }), AHORA);
  const antes = "2026-08-30T12:00:00Z";
  const b = calcularBurndown(
    [tarea({ ingresoEl: antes, terminada: true, terminadaEl: "2026-09-02T12:00:00Z" }), tarea({ ingresoEl: antes })],
    sprint,
    AHORA
  );
  check("sprint terminado: todos los dias medidos", b.dias.map((d) => d.tareas), [2, 1, 1]);
}
{
  const sprint = describirSprint(iteracion(), AHORA);
  const b = calcularBurndown([tarea({ terminada: true, terminadaEl: null })], sprint, AHORA);
  const hoy = b.dias.find((d) => d.dia === "2026-09-30");
  check("terminada sin fecha: cuenta como terminada hoy", [b.dias[0].tareas, hoy.tareas], [1, 0]);
}

console.log("### 9. cycle time");
{
  const ct = calcularCycleTime(
    [
      tarea({ id: 1, terminada: true, empezadaEl: "2026-09-24T12:00:00Z", terminadaEl: "2026-09-25T12:00:00Z" }),
      tarea({ id: 2, terminada: true, empezadaEl: "2026-09-24T00:00:00Z", terminadaEl: "2026-09-24T06:00:00Z" }),
      tarea({ id: 3, terminada: true, empezadaEl: "2026-09-20T00:00:00Z", terminadaEl: "2026-09-27T00:00:00Z" }),
      tarea({ id: 4, terminada: true, empezadaEl: null, terminadaEl: "2026-09-27T00:00:00Z" }),
      tarea({ id: 5, empezadaEl: "2026-09-24T00:00:00Z" }),
    ],
    []
  );
  check("una fila por terminada medible, la mas lenta primero", ct.tareas.map((t) => [t.id, t.dias]), [[3, 7], [1, 1], [2, 0.25]]);
  check("promedio y mediana en dias", [ct.promedioDias, ct.medianaDias], [2.8, 1]);
  check("sin fecha de inicio no se mide y se cuenta", ct.sinDatos, 1);
}
{
  const ct = calcularCycleTime([
    tarea({ terminada: true, empezadaEl: "2026-09-24T00:00:00Z", terminadaEl: "2026-09-25T00:00:00Z" }),
    tarea({ terminada: true, empezadaEl: "2026-09-24T00:00:00Z", terminadaEl: "2026-09-27T00:00:00Z" }),
  ], []);
  check("mediana con cantidad par: promedio de las dos del medio", ct.medianaDias, 2);
}
{
  const problemas = [];
  const ct = calcularCycleTime([tarea({ id: 9, terminada: true, empezadaEl: "2026-09-25T00:00:00Z", terminadaEl: "2026-09-24T00:00:00Z" })], problemas);
  check("termina antes de empezar: no se mide y se reporta", [ct.tareas.length, ct.sinDatos, problemas.map((p) => p.tarea)], [0, 1, [9]]);
  check("sin nada medido no hay promedio", [ct.promedioDias, ct.medianaDias], [null, null]);
}
{
  // sc-78 del Sprint 1 real: Shortcut informa cycle_time = 168968 segundos.
  const r = reporte([terminada({ id: 78, started_at: "2026-09-23T23:13:39Z", completed_at: "2026-09-25T22:09:48Z" })]);
  check("coincide con el cycle_time que calcula Shortcut", r.cycleTime.tareas[0].dias, Math.round((168968 / 86400) * 100) / 100);
  const conOverride = reporte([terminada({ started_at: "2026-09-23T00:00:00Z", started_at_override: "2026-09-24T00:00:00Z", completed_at: "2026-09-26T00:00:00Z" })]);
  check("usa el override de inicio si lo hay", conOverride.cycleTime.tareas[0].dias, 2);
}

console.log("### 10. flujo acumulado");
{
  // Mismo sprint y mismo "hoy" que el burndown: las curvas tienen que sumar lo mismo.
  const sprint = describirSprint(iteracion({ start_date: "2026-09-23", end_date: "2026-09-29" }), new Date("2026-09-27T15:00:00Z"));
  const f = calcularFlujo(
    [
      // Empieza el 23, termina el 24.
      tarea({ ingresoEl: "2026-09-20T12:00:00Z", empezadaEl: "2026-09-23T12:00:00Z", terminada: true, terminadaEl: "2026-09-24T12:00:00Z" }),
      // Entra el 23 y se empieza el 26, sigue abierta.
      tarea({ ingresoEl: "2026-09-23T10:00:00Z", empezadaEl: "2026-09-26T12:00:00Z" }),
      // Entra el 25, se termina el 25 de Buenos Aires sin haberse marcado empezada.
      tarea({ ingresoEl: "2026-09-25T16:00:00Z", terminada: true, terminadaEl: "2026-09-26T02:30:00Z" }),
      tarea({ ingresoEl: "2026-09-26T12:00:00Z" }),
    ],
    sprint,
    new Date("2026-09-27T15:00:00Z")
  );
  check("terminadas acumuladas por dia; futuro en null", f.dias.map((d) => d.terminadas), [0, 1, 2, 2, 2, null, null]);
  check("en curso: empezadas y no terminadas", f.dias.map((d) => d.enCurso), [1, 0, 0, 1, 1, null, null]);
  check("pendientes: el resto de lo que ya entro", f.dias.map((d) => d.pendientes), [1, 1, 1, 1, 1, null, null]);
  check(
    "las tres etapas suman el alcance del dia",
    f.dias.slice(0, 5).map((d) => d.terminadas + d.enCurso + d.pendientes),
    [2, 2, 3, 4, 4]
  );
}
{
  const sprint = describirSprint(iteracion(), AHORA);
  const f = calcularFlujo([tarea({ terminada: true, terminadaEl: null })], sprint, AHORA);
  const hoy = f.dias.find((d) => d.dia === "2026-09-30");
  check("terminada sin fecha: pendiente hasta hoy, terminada hoy", [f.dias[0].pendientes, hoy.terminadas], [1, 1]);
}

console.log("### 11. avance por iniciativa y carga por responsable");
{
  const r = reporte([
    terminada({ epic_id: 16, owner_ids: ["uuid-ana"], estimate: 3 }),
    enCurso({ epic_id: 16, owner_ids: ["uuid-ana", "uuid-beto"], estimate: 2 }),
    story({ epic_id: 16, owner_ids: [] }),
    story({ epic_id: null, owner_ids: ["uuid-beto"], estimate: 1 }),
  ]);
  check(
    "por iniciativa: el epic y 'Sin iniciativa', del mas cargado al menos",
    r.porIniciativa.grupos.map((g) => [g.nombre, g.total, g.terminadas, g.enCurso, g.pendientes, g.pct]),
    [["Epic - LavApp", 3, 1, 1, 1, 33.3], ["Sin iniciativa", 1, 0, 0, 1, 0]]
  );
  check("por iniciativa: puntos totales y terminados", r.porIniciativa.grupos.map((g) => [g.puntos, g.puntosTerminados]), [[5, 3], [1, 0]]);
  check(
    "por responsable: la compartida cuenta para los dos; sin dueño va a 'Sin asignar'",
    r.porResponsable.grupos.map((g) => [g.nombre, g.total, g.terminadas, g.enCurso, g.pendientes]),
    [["Ana Pérez", 2, 1, 1, 0], ["beto", 2, 0, 1, 1], ["Sin asignar", 1, 0, 0, 1]]
  );
  check("se informa cuantas estan compartidas", r.porResponsable.compartidas, 1);
}
{
  check("sin tareas: sin grupos", [avancePorIniciativa([]).grupos, cargaPorResponsable([]).grupos], [[], []]);
  const empate = cargaPorResponsable([
    tarea({ responsables: ["Zoe"], etapa: "Pendiente" }),
    tarea({ responsables: ["Ana"], etapa: "Pendiente" }),
  ]);
  check("a igual carga, orden alfabetico", empate.grupos.map((g) => g.nombre), ["Ana", "Zoe"]);
}


// ---- planificado vs. hecho -------------------------------------------------

const cambioDeEstado = (id, changed_at, old, nuevo) => ({
  changed_at,
  actions: [{ id, entity_type: "story", action: "update", changes: { workflow_state_id: { old, new: nuevo } } }],
});

console.log("### Paso por el sprint (historial)");
{
  check(
    "creada en el sprint: entro, no salio",
    pasoPorSprint([creada(1, "2026-09-20T12:00:00Z", { iteration_id: 29 })], 1, 29),
    { entro: "2026-09-20T12:00:00Z", salio: null }
  );
  check(
    "entro y despues salio",
    pasoPorSprint(
      [creada(1, "2026-09-17T12:00:00Z"), movida(1, "2026-09-20T12:00:00Z", { new: 29 }), movida(1, "2026-09-29T12:00:00Z", { old: 29, new: 70 })],
      1,
      29
    ),
    { entro: "2026-09-20T12:00:00Z", salio: "2026-09-29T12:00:00Z" }
  );
  check(
    "entro, salio y volvio: cuenta la ultima entrada",
    pasoPorSprint(
      [movida(1, "2026-09-20T12:00:00Z", { new: 29 }), movida(1, "2026-09-21T12:00:00Z", { old: 29 }), movida(1, "2026-09-24T12:00:00Z", { new: 29 })],
      1,
      29
    ),
    { entro: "2026-09-24T12:00:00Z", salio: null }
  );
  check("sin rastro", pasoPorSprint([creada(1, "2026-09-17T12:00:00Z")], 1, 29), { entro: null, salio: null });
  check(
    "fechaDeIngreso de una que salio es null (sigue valiendo)",
    fechaDeIngreso([movida(1, "2026-09-20T12:00:00Z", { new: 29 }), movida(1, "2026-09-21T12:00:00Z", { old: 29 })], 1, 29),
    null
  );
}

console.log("### Cumplimiento del sprint");
{
  const sprint = describirSprint(iteracion(), AHORA);
  const t1 = tarea({ id: 1, ingresoEl: "2026-09-20T12:00:00Z", terminada: true, terminadaEl: "2026-09-25T12:00:00Z", etapa: "Terminado", posicionEstado: 4 });
  const t2 = tarea({ id: 2, ingresoEl: "2026-09-23T20:00:00Z", etapa: "En curso", posicionEstado: 2 });
  // Entro con el sprint empezado: planificada igual que las demas.
  const t3 = tarea({ id: 3, ingresoEl: "2026-09-28T12:00:00Z", etapa: "Pendiente", posicionEstado: 1 });
  const t4 = tarea({ id: 4, ingresoEl: "2026-09-29T12:00:00Z", terminada: true, terminadaEl: "2026-09-29T13:00:00Z", etapa: "Terminado", posicionEstado: 4 });
  const m1 = tarea({ id: 5, ingresoEl: "2026-09-21T12:00:00Z", salioEl: "2026-09-29T12:00:00Z", etapa: "Pendiente", posicionEstado: 1, movidaA: { id: 70, nombre: "Sprint 2" } });
  // Entro y salio el primer dia (hora de Buenos Aires): nunca fue trabajo del sprint.
  const m2 = tarea({ id: 6, ingresoEl: "2026-09-23T02:00:00Z", salioEl: "2026-09-23T20:00:00Z", etapa: "Pendiente", posicionEstado: 1, movidaA: { id: 70, nombre: "Sprint 2" } });
  // Se saco antes de que el sprint empezara (el caso de las subtareas del Sprint 1).
  const m3 = tarea({ id: 7, ingresoEl: "2026-09-10T12:00:00Z", salioEl: "2026-09-20T12:00:00Z", etapa: "Terminado", terminada: true, posicionEstado: 4, movidaA: { id: 10, nombre: "Sprint 0" } });
  const c = calcularCumplimiento([t1, t2, t3, t4], [m1, m2, m3], sprint, AHORA);
  check("planificadas: lo que esta hoy mas lo movido que estuvo al cierre de algun dia del sprint", c.planificadas, {
    total: 5, terminadas: 2, enCurso: 1, pendientes: 1, movidas: 1, pct: 40,
  });
  check(
    "sin terminar: la mas avanzada primero, las movidas al final con su destino",
    c.sinTerminar.map((t) => [t.id, t.movidaA]),
    [[2, null], [3, null], [5, { id: 70, nombre: "Sprint 2" }]]
  );
  check("proyeccion: regla de tres sobre los dias completos transcurridos", c.proyeccion, {
    diasTranscurridos: 7, terminadasPorDia: 0.3, terminadasAlCierre: 4, total: 4, pct: 100,
  });
  const terminado = describirSprint(iteracion(), new Date("2026-10-10T15:00:00Z"));
  check("sin proyeccion en un sprint terminado", calcularCumplimiento([t1], [], terminado, new Date("2026-10-10T15:00:00Z")).proyeccion, null);
  const primerDia = new Date("2026-09-23T15:00:00Z");
  check("sin proyeccion el primer dia", calcularCumplimiento([t1], [], describirSprint(iteracion(), primerDia), primerDia).proyeccion, null);
  check("sin tareas: totales en cero y pct null", calcularCumplimiento([], [], sprint, AHORA).planificadas, {
    total: 0, terminadas: 0, enCurso: 0, pendientes: 0, movidas: 0, pct: null,
  });
}

console.log("### Ritmo: entradas y salidas por dia");
{
  const sprint = describirSprint(iteracion(), AHORA);
  const r = calcularRitmo(
    [
      tarea({ ingresoEl: "2026-09-20T12:00:00Z" }),
      tarea({ ingresoEl: "2026-09-20T12:00:00Z", terminada: true, terminadaEl: "2026-09-25T12:00:00Z" }),
      tarea({ ingresoEl: "2026-09-25T15:00:00Z", terminada: true, terminadaEl: "2026-09-30T14:00:00Z" }),
      tarea({ ingresoEl: "2026-09-28T12:00:00Z" }),
    ],
    sprint,
    AHORA
  );
  check("solo los dias hasta hoy", [r.dias.length, r.dias[0].dia, r.dias.at(-1).dia], [8, "2026-09-23", "2026-09-30"]);
  const por = Object.fromEntries(r.dias.map((d) => [d.dia, [d.entraron, d.terminadas]]));
  check("lo anterior al inicio entra el primer dia", por["2026-09-23"], [2, 0]);
  check("entradas y terminadas del mismo dia", por["2026-09-25"], [1, 1]);
  check("entrada suelta", por["2026-09-28"], [1, 0]);
  check("terminada hoy", por["2026-09-30"], [0, 1]);
  check("dias sin movimiento en cero", por["2026-09-24"], [0, 0]);
}

console.log("### Tiempo en el sprint");
{
  const sprint = describirSprint(iteracion(), AHORA);
  const t = calcularTiempoEnSprint(
    [
      tarea({ id: 1, titulo: "A", ingresoEl: "2026-09-20T12:00:00Z", terminada: true, terminadaEl: "2026-09-25T12:00:00Z" }),
      tarea({ id: 2, titulo: "B", ingresoEl: "2026-09-24T15:00:00Z", terminada: true, terminadaEl: "2026-09-24T20:00:00Z" }),
      tarea({ id: 3, titulo: "C", ingresoEl: "2026-09-26T12:00:00Z", terminada: true, terminadaEl: "2026-09-30T12:00:00Z" }),
      tarea({ id: 4, titulo: "D", ingresoEl: "2026-09-26T12:00:00Z", terminada: true, terminadaEl: null }),
      tarea({ id: 5, titulo: "E", ingresoEl: "2026-09-26T12:00:00Z" }),
    ],
    sprint
  );
  check("promedio y mediana en dias de calendario desde el ingreso (o el inicio)", [t.promedioDias, t.medianaDias, t.sinDatos], [2, 2, 1]);
  check("la mas lenta primero", t.tareas, [
    { id: 3, titulo: "C", dias: 4 },
    { id: 1, titulo: "A", dias: 2 },
    { id: 2, titulo: "B", dias: 0 },
  ]);
}

console.log("### Tiempo por columna");
{
  const tareas = [
    tarea({ id: 1, creadaEl: "2026-09-20T12:00:00Z", terminada: true, terminadaEl: "2026-09-24T12:00:00Z" }),
    tarea({ id: 2, creadaEl: "2026-09-21T00:00:00Z", terminada: true, terminadaEl: "2026-09-22T00:00:00Z" }),
    tarea({ id: 3, creadaEl: "2026-09-21T00:00:00Z", terminada: true, terminadaEl: "2026-09-22T00:00:00Z" }),
    tarea({ id: 4, creadaEl: "2026-09-21T00:00:00Z", terminada: true, terminadaEl: "2026-09-22T00:00:00Z" }),
    tarea({ id: 5, creadaEl: "2026-09-21T00:00:00Z" }),
  ];
  const historiales = {
    1: [
      creada(1, "2026-09-20T12:00:00Z", { workflow_state_id: TO_DO }),
      cambioDeEstado(1, "2026-09-22T12:00:00Z", TO_DO, IN_PROGRESS),
      cambioDeEstado(1, "2026-09-23T00:00:00Z", IN_PROGRESS, IN_REVIEW),
      cambioDeEstado(1, "2026-09-24T12:00:00Z", IN_REVIEW, DONE),
    ],
    2: [creada(2, "2026-09-21T00:00:00Z", { workflow_state_id: TO_DO }), cambioDeEstado(2, "2026-09-22T00:00:00Z", TO_DO, DONE)],
    // Creacion sin estado: el primer cambio dice de donde salio.
    4: [cambioDeEstado(4, "2026-09-22T00:00:00Z", TO_DO, DONE)],
  };
  const c = calcularTiempoPorColumna(tareas, historiales, [WORKFLOW]);
  check("una fila por columna recorrida, en el orden del tablero, sin Done", c.columnas.map((x) => x.nombre), ["To Do", "In Progress", "In Review"]);
  check("To Do: 2, 1 y 1 dias", c.columnas[0], { id: TO_DO, nombre: "To Do", etapa: "Pendiente", tareas: 3, diasTotales: 4, promedioDias: 1.3, medianaDias: 1 });
  check("In Progress: medio dia", c.columnas[1], { id: IN_PROGRESS, nombre: "In Progress", etapa: "En curso", tareas: 1, diasTotales: 0.5, promedioDias: 0.5, medianaDias: 0.5 });
  check("In Review: un dia y medio", c.columnas[2], { id: IN_REVIEW, nombre: "In Review", etapa: "En curso", tareas: 1, diasTotales: 1.5, promedioDias: 1.5, medianaDias: 1.5 });
  check("terminada sin historial no se mide; la no terminada no cuenta", [c.medidas, c.sinDatos], [3, 1]);
}

console.log("### Sprints posteriores y ventana del historial");
{
  const s10 = iteracion({ id: 10, name: "Sprint 0", status: "done", start_date: "2026-09-09", end_date: "2026-09-22" });
  const s29 = iteracion();
  const s70 = iteracion({ id: 70, name: "Sprint 2", status: "unstarted", start_date: "2026-10-07", end_date: "2026-10-21" });
  check("los demas sprints, anteriores incluidos, del primero al ultimo", otrosSprints([s70, s10, s29], s29).map((i) => i.id), [10, 70]);
  check("desde el viejo, en orden", otrosSprints([s70, s10, s29], s10).map((i) => i.id), [29, 70]);
  check("historial: solo en curso o terminados, del mas viejo al mas nuevo", sprintsParaHistorial([s70, s29, s10]).map((i) => i.id), [10, 29]);
  check("historial: se queda con los ultimos", sprintsParaHistorial([s70, s29, s10], { maximo: 1 }).map((i) => i.id), [29]);
  check("destinos: los de afuera de la ventana que empiezan despues del mas viejo", sprintsDestino([s70, s29, s10], [s29]).map((i) => i.id), [70]);
  check("destinos: sin ventana no hay destinos", sprintsDestino([s70, s29], []), []);
}

console.log("### Historial de sprints");
{
  const s10 = iteracion({ id: 10, name: "Sprint 0", status: "done", start_date: "2026-09-09", end_date: "2026-09-22" });
  const s29 = iteracion();
  const a = terminada({ id: 1, iteration_id: 10, created_at: "2026-09-01T12:00:00Z", completed_at: "2026-09-15T12:00:00Z", estimate: 3 });
  const b = story({ id: 2, iteration_id: 10, created_at: "2026-09-01T12:00:00Z" });
  const c = terminada({ id: 3, iteration_id: 29, created_at: "2026-09-17T12:00:00Z", completed_at: "2026-09-25T12:00:00Z" });
  const d = enCurso({ id: 4, iteration_id: 29, created_at: "2026-09-01T12:00:00Z", previous_iteration_ids: [10] });
  const historiales29 = {
    3: [creada(3, "2026-09-17T12:00:00Z"), movida(3, "2026-09-20T12:00:00Z", { new: 29 })],
    4: [creada(4, "2026-09-01T12:00:00Z", { iteration_id: 10 }), movida(4, "2026-09-22T12:00:00Z", { old: 10, new: 29 })],
  };
  const historiales10 = {
    1: [creada(1, "2026-09-01T12:00:00Z", { iteration_id: 10 })],
    2: [creada(2, "2026-09-01T12:00:00Z", { iteration_id: 10 })],
  };
  const h = armarHistorial(
    {
      iteraciones: [s29, s10],
      sprints: [
        { iteracion: s29, stories: [c, d], historiales: historiales29 },
        { iteracion: s10, stories: [a, b], historiales: historiales10 },
      ],
      workflows: [WORKFLOW],
      miembros: MIEMBROS,
      epics: EPICS,
    },
    { ahora: AHORA }
  );
  check("una fila por sprint, del mas viejo al mas nuevo", h.sprints.map((s) => s.nombre), ["Sprint 0", "Sprint 1"]);
  const [viejo, actual] = h.sprints;
  check(
    "sprint viejo: la movida sigue siendo planificada y no cumplida",
    [viejo.planificadas, viejo.cumplidas, viejo.pctCumplimiento, viejo.movidas, viejo.total, viejo.terminadas, viejo.puntosTerminados],
    [3, 1, 33.3, 1, 2, 1, 3]
  );
  check(
    "sprint actual: la que vino del viejo cuenta como planificada aca",
    [actual.planificadas, actual.cumplidas, actual.movidas, actual.estado],
    [2, 1, 0, "En curso"]
  );
  check("sin problemas", h.problemas, []);

  // Una tarea que se fue a un sprint de afuera de la ventana (el proximo, sin
  // empezar) se atribuye igual al de origen.
  const s70 = iteracion({ id: 70, name: "Sprint 2", status: "unstarted", start_date: "2026-10-07", end_date: "2026-10-21" });
  const e = story({ id: 5, iteration_id: 70, created_at: "2026-09-17T12:00:00Z", previous_iteration_ids: [29] });
  const conDestino = armarHistorial(
    {
      iteraciones: [s29, s10, s70],
      sprints: [{ iteracion: s29, stories: [c, d], historiales: historiales29 }],
      destinos: [
        {
          iteracion: s70,
          stories: [e],
          historiales: { 5: [creada(5, "2026-09-17T12:00:00Z"), movida(5, "2026-09-20T12:00:00Z", { new: 29 }), movida(5, "2026-09-29T12:00:00Z", { old: 29, new: 70 })] },
        },
      ],
      workflows: [WORKFLOW],
      miembros: MIEMBROS,
      epics: EPICS,
    },
    { ahora: AHORA }
  );
  check("movida a un sprint de destino: planificada, no cumplida, sin fila propia", [conDestino.sprints.length, conDestino.sprints[0].planificadas, conDestino.sprints[0].movidas], [1, 3, 1]);
}

console.log("### Reporte con tareas movidas a otro sprint");
{
  const s70 = iteracion({ id: 70, name: "Sprint 2", status: "unstarted", start_date: "2026-10-07", end_date: "2026-10-21" });
  const ida = story({ id: 9, iteration_id: 70, created_at: "2026-09-17T12:00:00Z", previous_iteration_ids: [29] });
  const r = reporte([terminada({ id: 1, created_at: "2026-09-17T12:00:00Z" }), story({ id: 2, created_at: "2026-09-28T12:00:00Z" })], {
    iteraciones: [iteracion(), s70],
    historiales: {
      1: [creada(1, "2026-09-17T12:00:00Z", { iteration_id: 29 })],
      2: [creada(2, "2026-09-28T12:00:00Z", { iteration_id: 29 })],
    },
    movidas: {
      stories: [ida],
      historiales: { 9: [creada(9, "2026-09-17T12:00:00Z", { iteration_id: 29 }), movida(9, "2026-09-29T12:00:00Z", { old: 29, new: 70 })] },
    },
  });
  check("cumplimiento: 1 cumplida de 3 planificadas (2 adentro y 1 movida)", r.cumplimiento.planificadas, {
    total: 3, terminadas: 1, enCurso: 0, pendientes: 1, movidas: 1, pct: 33.3,
  });
  check("la movida aparece en 'sin terminar' con su destino, despues de las pendientes", r.cumplimiento.sinTerminar.map((t) => [t.id, t.movidaA?.nombre ?? null]), [[2, null], [9, "Sprint 2"]]);
  check("el resumen no cuenta la movida (es como cuenta Shortcut)", r.resumen.tareas.total, 2);
  check("el reporte trae ritmo, tiempo en el sprint y tiempo por columna", [r.ritmo.dias.length, r.tiempoEnSprint.tareas.length, r.tiempoPorColumna.columnas.length, r.tiempoPorColumna.sinDatos], [8, 1, 0, 1]);
  check("sin movidas el cumplimiento igual se calcula", reporte([story()]).cumplimiento.planificadas.movidas, 0);
}

console.log("### Versión de los datos");
{
  check("el reporte de un sprint trae la versión de los datos", reporte([story()]).version, VERSION_DE_DATOS);
  check("es una fecha AAAA-MM-DD, que se compara como texto", /^\d{4}-\d{2}-\d{2}$/.test(VERSION_DE_DATOS), true);
  const h = armarHistorial({ iteraciones: [iteracion()], sprints: [], workflows: [WORKFLOW], miembros: MIEMBROS, epics: EPICS }, { ahora: AHORA });
  check("el historial también", h.version, VERSION_DE_DATOS);
}

console.log("### Avance por tipo de trabajo (Skill Set)");
{
  const CAMPOS = [{ id: "cf-skill", name: "Skill Set" }, { id: "cf-prio", name: "Priority" }];
  const skill = (valor) => [{ field_id: "cf-skill", value_id: "v-" + valor, value: valor }, { field_id: "cf-prio", value_id: "p", value: "High" }];
  const r = reporte(
    [
      story({ estimate: 3, custom_fields: skill("Backend") }),
      terminada({ estimate: 2, custom_fields: skill("Backend") }),
      story({ custom_fields: skill("Frontend") }),
      story(),
    ],
    { camposCustom: CAMPOS }
  );
  check("grupos por Skill Set, partidos por etapa; sin tipo aparte", r.porEspecialidad.grupos.map((g) => [g.nombre, g.total, g.terminadas, g.puntos]), [["Backend", 2, 1, 5], ["Frontend", 1, 0, 0], ["Sin tipo de trabajo", 1, 0, 0]]);
  check("sin problemas cuando todos los campos están en el catálogo", [r.problemas, r.porEspecialidad.motivo], [[], null]);
  const desconocido = reporte([story({ custom_fields: [{ field_id: "cf-otro", value_id: "x", value: "X" }] })], { camposCustom: CAMPOS });
  check("un campo que no está en el catálogo se reporta", desconocido.problemas.map((p) => [p.campo, p.valor]), [["custom_fields", "cf-otro"]]);
  const sinCatalogo = reporte([story({ custom_fields: skill("Backend") })], { camposCustom: null });
  check("sin catálogo (no se pudo leer): sin grupos y con el motivo, no «nadie lo cargó»", [sinCatalogo.porEspecialidad, sinCatalogo.problemas], [{ grupos: [], motivo: "sin-catalogo" }, []]);
  const sinCampo = reporte([story({ custom_fields: skill("Backend") })], { camposCustom: [{ id: "cf-prio", name: "Priority" }] });
  check("el workspace no tiene el campo Skill Set: sin grupos y con el motivo", sinCampo.porEspecialidad, { grupos: [], motivo: "sin-campo" });
}

console.log("### Días de cada sprint para repartir las horas y fin del proyecto");
{
  const s1 = iteracion({ id: 29, start_date: "2026-09-23", end_date: "2026-10-07" });
  const s2 = iteracion({ id: 70, name: "Sprint 2", start_date: "2026-10-07", end_date: "2026-10-21" });
  const r = repartirDias([s2, s1]);
  check("el día del cambio cuenta una vez, para el primero: 15 + 14 = 29, el proyecto", [r.porSprint.get(29), r.porSprint.get(70), r.solapados], [15, 14, []]);
  const pisado = repartirDias([s1, { ...s2, start_date: "2026-10-01" }]);
  check("si se pisan más que el día del cambio, el de después pierde esos días y se informa", [pisado.porSprint.get(70), pisado.solapados], [14, [{ id: 70, nombre: "Sprint 2", dias: 7 }]]);
  check("fin configurado posterior: se usa", describirProyecto([s1, s2], { fin: "2026-12-05" }), { inicio: "2026-09-23", fin: "2026-12-05", dias: 74, configurado: true, descartado: false });
  check("fin configurado igual al último sprint: se usa", describirProyecto([s1, s2], { fin: "2026-10-21" }).configurado, true);
  check("fin configurado anterior al último sprint: se descarta y se dice", describirProyecto([s1, s2], { fin: "2026-10-10" }), { inicio: "2026-09-23", fin: "2026-10-21", dias: 29, configurado: false, descartado: true });
  check("sin fin configurado: el del último sprint", describirProyecto([s1, s2]), { inicio: "2026-09-23", fin: "2026-10-21", dias: 29, configurado: false, descartado: false });
}

console.log("### La efectividad de un sprint cuenta lo que se movió a otro");
{
  // Sprint 1 con 3 tareas terminadas de 2 puntos de Ana y una cuarta suya que
  // se movio al Sprint 2 sin terminar: el cumplimiento es 3 de 4 y la
  // efectividad tiene que ser 75 %, no 100.
  const EQUIPO_ANA = { horasPorPunto: 4, wipMaxPorPersona: 3, horasPactadas: { porIntegrante: 150, finDelProyecto: null }, metas: { bugsRatioMax: null, efectividadMin: 80, utilizacionMin: null, utilizacionMax: null }, integrantes: [{ nombre: "Ana Pérez", rol: "Dev", detalle: null, horasPactadas: null }] };
  const s70 = iteracion({ id: 70, name: "Sprint 2", status: "unstarted", start_date: "2026-10-07", end_date: "2026-10-21" });
  const ida = story({ id: 9, iteration_id: 70, estimate: 2, owner_ids: ["uuid-ana"], created_at: "2026-09-17T12:00:00Z", previous_iteration_ids: [29] });
  const terminadas = [1, 2, 3].map((id) => terminada({ id, estimate: 2, owner_ids: ["uuid-ana"], created_at: "2026-09-17T12:00:00Z" }));
  const r = reporte(terminadas, {
    iteraciones: [iteracion(), s70],
    historiales: Object.fromEntries(terminadas.map((t) => [t.id, [creada(t.id, "2026-09-17T12:00:00Z", { iteration_id: 29 })]])),
    movidas: { stories: [ida], historiales: { 9: [creada(9, "2026-09-17T12:00:00Z", { iteration_id: 29 }), movida(9, "2026-09-29T12:00:00Z", { old: 29, new: 70 })] } },
    equipo: EQUIPO_ANA,
  });
  check("cumplimiento 3 de 4 con la movida", [r.cumplimiento.planificadas.total, r.cumplimiento.planificadas.terminadas, r.cumplimiento.planificadas.movidas], [4, 3, 1]);
  check("efectividad 24 h hechas de 32 h asignadas: 75 %, no cumple", [r.equipo.horas.equipo.hechas, r.equipo.horas.equipo.asignadas, ...(({ valor, cumple }) => [valor, cumple])(r.equipo.okrs.find((o) => o.clave === "efectividad"))], [24, 32, 75, false]);
  check("la movida no suma demanda: la utilización mira lo que hay hoy", r.equipo.horas.equipo.demanda, 24);
}

console.log("### Retrabajo");
{
  const con = (id, changed_at, old, nuevo, member_id = "uuid-ana") => ({ ...cambioDeEstado(id, changed_at, old, nuevo), member_id });
  // Un push a la rama de una story, como lo anota Shortcut: la accion de la rama
  // y la story sumando la rama. `deLaStory` es la story duena de la rama.
  const push = (changed_at, deLaStory) => ({
    changed_at,
    actions: [
      { id: 900 + deLaStory, entity_type: "branch", action: "push", name: `feat-sc-${deLaStory}` },
      { id: deLaStory, entity_type: "story", action: "update", changes: { branch_ids: { adds: [900 + deLaStory] } } },
    ],
  });
  const cerrada = (id, o = {}) =>
    tarea({ id, titulo: `Tarea ${id}`, url: `https://app.shortcut.com/lavapp/story/${id}`, terminada: true, creadaEl: "2026-09-20T12:00:00Z", ...o });
  const empezada = (id) => [creada(id, "2026-09-20T12:00:00Z", { workflow_state_id: TO_DO }), con(id, "2026-09-22T12:00:00Z", TO_DO, IN_PROGRESS)];
  const tareas = [
    cerrada(1), cerrada(2), cerrada(3), cerrada(4), cerrada(5, { etiquetas: ["release 1.0", " No-Es-Retrabajo "] }),
    cerrada(6), cerrada(7, { terminada: false }), cerrada(8), cerrada(9), cerrada(10, { terminada: false }), cerrada(11), cerrada(12),
  ];
  const historiales = {
    // Reabierta a los dos dias por Beto, con un push a su rama antes del nuevo cierre.
    1: [...empezada(1), con(1, "2026-09-25T12:00:00Z", IN_PROGRESS, DONE), con(1, "2026-09-27T12:00:00Z", DONE, IN_REVIEW, "uuid-beto"), push("2026-09-27T15:00:00Z", 1), con(1, "2026-09-28T12:00:00Z", IN_REVIEW, DONE)],
    // Devuelta desde la revision a la hora, sin codigo vinculado.
    2: [...empezada(2), con(2, "2026-09-24T12:00:00Z", IN_PROGRESS, IN_REVIEW), con(2, "2026-09-24T13:00:00Z", IN_REVIEW, IN_PROGRESS), con(2, "2026-09-25T12:00:00Z", IN_PROGRESS, IN_REVIEW), con(2, "2026-09-26T12:00:00Z", IN_REVIEW, DONE)],
    // Sacada de Done a los dos minutos: tarjeta mal movida.
    3: [...empezada(3), con(3, "2026-09-25T12:00:00Z", IN_PROGRESS, DONE), con(3, "2026-09-25T12:02:00Z", DONE, IN_REVIEW), con(3, "2026-09-25T12:03:00Z", IN_REVIEW, DONE)],
    // Pausada a Backlog y, ya cerrada, devuelta a To Do: es replanificar.
    4: [...empezada(4), con(4, "2026-09-23T12:00:00Z", IN_PROGRESS, BACKLOG), con(4, "2026-09-24T12:00:00Z", BACKLOG, IN_PROGRESS), con(4, "2026-09-25T12:00:00Z", IN_PROGRESS, DONE), con(4, "2026-09-27T12:00:00Z", DONE, TO_DO), con(4, "2026-09-28T12:00:00Z", TO_DO, DONE)],
    // Reabierta, pero con la etiqueta: va aparte.
    5: [...empezada(5), con(5, "2026-09-25T12:00:00Z", IN_PROGRESS, DONE), con(5, "2026-09-27T00:00:00Z", DONE, IN_PROGRESS), con(5, "2026-09-27T12:00:00Z", IN_PROGRESS, DONE)],
    // La 6 esta terminada y no tiene historial.
    // Devuelta desde la revision y todavia sin cerrar: entra cuando se cierre.
    7: [...empezada(7), con(7, "2026-09-24T12:00:00Z", IN_PROGRESS, IN_REVIEW), con(7, "2026-09-25T12:00:00Z", IN_REVIEW, IN_PROGRESS)],
    // Historia reabierta: el push de su historial es de una subtarea, no suyo.
    8: [...empezada(8), con(8, "2026-09-25T12:00:00Z", IN_PROGRESS, DONE), con(8, "2026-09-26T12:00:00Z", DONE, IN_PROGRESS), push("2026-09-26T15:00:00Z", 81), con(8, "2026-09-27T12:00:00Z", IN_PROGRESS, DONE)],
    // Dos vueltas: la tarea cuenta una vez.
    9: [...empezada(9), con(9, "2026-09-24T12:00:00Z", IN_PROGRESS, DONE), con(9, "2026-09-25T12:00:00Z", DONE, IN_PROGRESS), con(9, "2026-09-26T12:00:00Z", IN_PROGRESS, DONE), con(9, "2026-09-28T18:00:00Z", DONE, IN_REVIEW), con(9, "2026-09-29T12:00:00Z", IN_REVIEW, DONE)],
    // Reabierta y todavia abierta: cuenta, y el codigo se busca hasta ahora.
    10: [...empezada(10), con(10, "2026-09-25T12:00:00Z", IN_PROGRESS, DONE), con(10, "2026-09-29T12:00:00Z", DONE, IN_PROGRESS), push("2026-09-30T12:00:00Z", 10)],
    // Pasa por una columna que ya no esta en ningun workflow.
    11: [...empezada(11), con(11, "2026-09-25T12:00:00Z", IN_PROGRESS, 999), con(11, "2026-09-26T12:00:00Z", 999, DONE)],
    // Sin la creacion en el historial el primer tramo arranca cuando se creo la
    // tarea (12:00): salir de In Review a las 12:05 es una correccion.
    12: [con(12, "2026-09-20T12:05:00Z", IN_REVIEW, IN_PROGRESS), con(12, "2026-09-21T12:00:00Z", IN_PROGRESS, DONE)],
  };
  const problemas = [];
  const r = calcularRetrabajo(tareas, historiales, [WORKFLOW], { miembros: MIEMBROS, ahora: AHORA }, problemas);
  check("las constantes de la regla", [ETIQUETA_SIN_RETRABAJO, MINUTOS_DE_CORRECCION], ["no-es-retrabajo", 10]);
  check("10 cerradas alguna vez (la abierta que nunca cerró no; la terminada sin historial se informa aparte)", [r.cerradas, r.sinHistorial], [10, 1]);
  check("5 con retrabajo: el 50 %", [r.conRetrabajo, r.pct, r.vueltas], [5, 50, 6]);
  check("la más reciente primero", r.casos.map((c) => c.id), [10, 9, 1, 8, 2]);
  check("reabiertas, devueltas antes de cerrar y con código nuevo", [r.reabiertas, r.devueltas, r.conCodigoNuevo], [4, 1, 2]);
  check("descartadas: dos replanificaciones (a Backlog y a To Do) y dos correcciones de menos de 10 minutos", r.descartadas, { replanificadas: 2, correcciones: 2 });
  check("la etiqueta, sin mayúsculas ni espacios, saca a la 5 de la cuenta", r.excluidas.map((c) => c.id), [5]);
  check("una vuelta, completa", r.casos.find((c) => c.id === 1), {
    id: 1, titulo: "Tarea 1", url: "https://app.shortcut.com/lavapp/story/1", historia: null, responsables: [], terminada: true,
    vueltas: [{ el: "2026-09-27T12:00:00Z", quien: "beto", desde: "Done", hacia: "In Review", reapertura: true, conCodigoNuevo: true }],
    conCodigoNuevo: true,
  });
  check("devuelta desde la revisión: no es reapertura", r.casos.find((c) => c.id === 2).vueltas, [{ el: "2026-09-24T13:00:00Z", quien: "Ana Pérez", desde: "In Review", hacia: "In Progress", reapertura: false, conCodigoNuevo: false }]);
  check("el push de una subtarea en el historial de su historia no es código de la historia", r.casos.find((c) => c.id === 8).conCodigoNuevo, false);
  check("todavía abierta: cuenta, y el push de después también", [r.casos.find((c) => c.id === 10).terminada, r.casos.find((c) => c.id === 10).conCodigoNuevo], [false, true]);
  check("la columna que no existe se anota una vez", problemas.map((p) => [p.tarea, p.campo, p.valor]), [[11, "historial", "999"]]);
  check("sin tareas: nada que medir", (({ cerradas, pct, casos }) => [cerradas, pct, casos])(calcularRetrabajo([], {}, [WORKFLOW], { ahora: AHORA })), [0, null, []]);

  // De punta a punta: armarReporte lee las etiquetas de la story y publica el
  // retrabajo en el equipo, con el OKR segundo en la lista.
  const reabierta = (id) => [
    creada(id, "2026-09-20T12:00:00Z", { iteration_id: 29, workflow_state_id: TO_DO }),
    cambioDeEstado(id, "2026-09-24T12:00:00Z", TO_DO, DONE),
    cambioDeEstado(id, "2026-09-26T12:00:00Z", DONE, IN_PROGRESS),
    cambioDeEstado(id, "2026-09-27T12:00:00Z", IN_PROGRESS, DONE),
  ];
  const metaDe10 = { horasPorPunto: null, wipMaxPorPersona: 3, horasPactadas: { porIntegrante: null, finDelProyecto: null }, metas: { bugsRatioMax: null, retrabajoMax: 10, efectividadMin: null, utilizacionMin: null, utilizacionMax: null }, integrantes: [] };
  const rep = reporte(
    [terminada({ id: 21, labels: [{ id: 1, name: "needs qa" }] }), terminada({ id: 22, labels: [{ id: 2, name: "no-es-retrabajo" }] }), terminada({ id: 23 })],
    { historiales: { 21: reabierta(21), 22: reabierta(22), 23: [creada(23, "2026-09-20T12:00:00Z", { iteration_id: 29 })] }, equipo: metaDe10 }
  );
  check("armarReporte: 1 de 3 cerradas con retrabajo; la de la etiqueta va aparte", [rep.equipo.retrabajo.cerradas, rep.equipo.retrabajo.casos.map((c) => c.id), rep.equipo.retrabajo.excluidas.map((c) => c.id)], [3, [21], [22]]);
  check("y el OKR, segundo en la lista, contra la meta", rep.equipo.okrs[1], { clave: "retrabajo", nombre: "Retrabajo", valor: 33.3, meta: 10, descripcionMeta: "como mucho 10%", cumple: false });
  check("sin problemas", rep.problemas, []);
}

console.log("\n" + ok + " OK, " + fail + " fallas");
process.exit(fail ? 1 : 0);
