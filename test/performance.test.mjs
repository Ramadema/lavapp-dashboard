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
  calcularCompromiso,
  calcularCycleTime,
  calcularFlujo,
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
  sprintsPosteriores,
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
      historiales: o.historiales,
      movidas: o.movidas,
    },
    { ahora: o.ahora ?? AHORA, leidoEl: o.leidoEl ?? [], problemas: o.problemas }
  );

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
  check("ideal en tareas: de 2 a 0 en linea recta", b.dias.map((d) => d.idealTareas), [2, 1.7, 1.3, 1, 0.7, 0.3, 0]);
  check("ideal en puntos: de 5 a 0", b.dias.map((d) => d.idealPuntos), [5, 4.2, 3.3, 2.5, 1.7, 0.8, 0]);
  check("alcance inicial al cierre del primer dia", b.alcanceInicial, { tareas: 2, puntos: 5 });
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

console.log("### Compromiso del sprint");
{
  const sprint = describirSprint(iteracion(), AHORA);
  const t1 = tarea({ id: 1, ingresoEl: "2026-09-20T12:00:00Z", terminada: true, terminadaEl: "2026-09-25T12:00:00Z", etapa: "Terminado", posicionEstado: 4 });
  const t2 = tarea({ id: 2, ingresoEl: "2026-09-23T20:00:00Z", etapa: "En curso", posicionEstado: 2 });
  const t3 = tarea({ id: 3, ingresoEl: "2026-09-28T12:00:00Z", etapa: "Pendiente", posicionEstado: 1 });
  const t4 = tarea({ id: 4, ingresoEl: "2026-09-29T12:00:00Z", terminada: true, terminadaEl: "2026-09-29T13:00:00Z", etapa: "Terminado", posicionEstado: 4 });
  const m1 = tarea({ id: 5, ingresoEl: "2026-09-21T12:00:00Z", salioEl: "2026-09-29T12:00:00Z", etapa: "Pendiente", posicionEstado: 1, movidaA: { id: 70, nombre: "Sprint 2" } });
  // Entro y salio el primer dia (hora de Buenos Aires): nunca fue alcance.
  const m2 = tarea({ id: 6, ingresoEl: "2026-09-23T02:00:00Z", salioEl: "2026-09-23T20:00:00Z", etapa: "Pendiente", posicionEstado: 1, movidaA: { id: 70, nombre: "Sprint 2" } });
  const c = calcularCompromiso([t1, t2, t3, t4], [m1, m2], sprint, AHORA);
  check("comprometidas: al cierre del primer dia, movidas incluidas", c.comprometidas, {
    total: 3, terminadas: 1, enCurso: 1, pendientes: 0, movidas: 1, pct: 33.3,
  });
  check("agregadas: lo que entro despues", c.agregadas, {
    total: 2, terminadas: 1, enCurso: 0, pendientes: 1, movidas: 0, pct: 50,
  });
  check(
    "sin terminar: la mas avanzada primero, las movidas al final con su destino",
    c.sinTerminar.map((t) => [t.id, t.movidaA]),
    [[2, null], [5, { id: 70, nombre: "Sprint 2" }]]
  );
  check("alcance: cuanto del total se sumo despues", c.alcance, { total: 5, pctAgregado: 40 });
  check("proyeccion: regla de tres sobre los dias completos transcurridos", c.proyeccion, {
    diasTranscurridos: 7, terminadasPorDia: 0.3, terminadasAlCierre: 4, total: 4, pct: 100,
  });
  const terminado = describirSprint(iteracion(), new Date("2026-10-10T15:00:00Z"));
  check("sin proyeccion en un sprint terminado", calcularCompromiso([t1], [], terminado, new Date("2026-10-10T15:00:00Z")).proyeccion, null);
  const primerDia = new Date("2026-09-23T15:00:00Z");
  check("sin proyeccion el primer dia", calcularCompromiso([t1], [], describirSprint(iteracion(), primerDia), primerDia).proyeccion, null);
  check("sin tareas: totales en cero y pct null", calcularCompromiso([], [], sprint, AHORA).comprometidas, {
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
  check("posteriores al actual", sprintsPosteriores([s70, s10, s29], s29).map((i) => i.id), [70]);
  check("posteriores al viejo, en orden", sprintsPosteriores([s70, s10, s29], s10).map((i) => i.id), [29, 70]);
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
    "sprint viejo: la movida sigue siendo comprometida y no cumplida",
    [viejo.comprometidas, viejo.cumplidas, viejo.pctCumplimiento, viejo.movidas, viejo.total, viejo.terminadas, viejo.puntosTerminados],
    [3, 1, 33.3, 1, 2, 1, 3]
  );
  check(
    "sprint actual: la que vino del viejo entro antes del cierre del primer dia",
    [actual.comprometidas, actual.cumplidas, actual.agregadas, actual.movidas, actual.estado],
    [2, 1, 0, 0, "En curso"]
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
  check("movida a un sprint de destino: comprometida, no cumplida, sin fila propia", [conDestino.sprints.length, conDestino.sprints[0].comprometidas, conDestino.sprints[0].movidas], [1, 3, 1]);
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
  check("compromiso: 1 cumplida de 2 comprometidas, 1 movida", r.compromiso.comprometidas, {
    total: 2, terminadas: 1, enCurso: 0, pendientes: 0, movidas: 1, pct: 50,
  });
  check("la movida aparece en 'sin terminar' con su destino", r.compromiso.sinTerminar.map((t) => [t.id, t.movidaA?.nombre]), [[9, "Sprint 2"]]);
  check("el resumen no cuenta la movida (es como cuenta Shortcut)", r.resumen.tareas.total, 2);
  check("el reporte trae ritmo, tiempo en el sprint y tiempo por columna", [r.ritmo.dias.length, r.tiempoEnSprint.tareas.length, r.tiempoPorColumna.columnas.length, r.tiempoPorColumna.sinDatos], [8, 1, 0, 1]);
  check("sin movidas el compromiso igual se calcula", reporte([story()]).compromiso.comprometidas.movidas, 0);
}

console.log("\n" + ok + " OK, " + fail + " fallas");
process.exit(fail ? 1 : 0);
