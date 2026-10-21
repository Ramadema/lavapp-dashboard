// Tests del progreso del proyecto y de los errores (lib/kpis/performance.js) y
// del proyecto entero (lib/kpis/proyecto.js).
// Sin framework: node los corre directo con `npm test`.

import { armarReporte, erroresDelProyecto, progresoDelProyecto } from "../lib/kpis/performance.js";
import { armarProyecto, describirPeriodo } from "../lib/kpis/proyecto.js";
import { VERSION_DE_DATOS } from "../lib/kpis/performance.js";

let ok = 0, fail = 0;
const check = (nombre, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log("  OK   " + nombre); }
  else { fail++; console.log("  FALLA " + nombre + "\n        real:     " + a + "\n        esperado: " + b); }
};

// Iteraciones con la forma de /iterations, con las `stats` reales de Shortcut.
const stats = (o = {}) => ({
  num_stories_done: 0, num_stories_started: 0, num_stories_unstarted: 0, num_stories_backlog: 0,
  num_stories_unestimated: 0, num_points: 0, num_points_done: 0, num_points_started: 0,
  num_points_unstarted: 0, num_points_backlog: 0, num_related_documents: 0, ...o,
});
const SPRINT_1 = {
  id: 29, name: "Sprint 1", status: "done", start_date: "2026-09-23", end_date: "2026-10-07",
  app_url: "https://app.shortcut.com/lavapp/iteration/29",
  stats: stats({ num_stories_done: 84, num_points: 235, num_points_done: 235, num_stories_unestimated: 17 }),
};
const SPRINT_2 = {
  id: 70, name: "Sprint 2", status: "started", start_date: "2026-10-07", end_date: "2026-10-21",
  app_url: "https://app.shortcut.com/lavapp/iteration/70",
  stats: stats({ num_stories_done: 1, num_stories_started: 17, num_stories_unstarted: 7, num_stories_backlog: 19, num_points: 110, num_points_done: 0, num_stories_unestimated: 9 }),
};
const SPRINT_3 = {
  id: 90, name: "Sprint 3", status: "unstarted", start_date: "2026-10-21", end_date: "2026-11-04",
  app_url: "https://app.shortcut.com/lavapp/iteration/90",
  stats: stats({ num_stories_unstarted: 6, num_points: 20 }),
};

console.log("Progreso del proyecto");
{
  const problemas = [];
  const r = progresoDelProyecto([SPRINT_2, SPRINT_3, SPRINT_1], { stories: 138 }, problemas);
  check("sprints del primero al último, con estado traducido", r.sprints.map((s) => [s.id, s.nombre, s.estado, s.inicio, s.fin]), [
    [29, "Sprint 1", "Terminado", "2026-09-23", "2026-10-07"],
    [70, "Sprint 2", "En curso", "2026-10-07", "2026-10-21"],
    [90, "Sprint 3", "Próximo", "2026-10-21", "2026-11-04"],
  ]);
  check("tareas por sprint: pendientes = unstarted + backlog", r.sprints.map((s) => s.tareas), [
    { total: 84, terminadas: 84, enCurso: 0, pendientes: 0, pct: 100 },
    { total: 44, terminadas: 1, enCurso: 17, pendientes: 26, pct: 2.3 },
    { total: 6, terminadas: 0, enCurso: 0, pendientes: 6, pct: 0 },
  ]);
  check("puntos por sprint", r.sprints.map((s) => s.puntos), [
    { total: 235, terminados: 235, pct: 100, tareasSinEstimar: 17 },
    { total: 110, terminados: 0, pct: 0, tareasSinEstimar: 9 },
    { total: 20, terminados: 0, pct: 0, tareasSinEstimar: 0 },
  ]);
  check("el proyecto: 85 de 134 tareas, 235 de 365 puntos", [r.tareas, r.puntos], [
    { total: 134, terminadas: 85, enCurso: 17, pendientes: 32, pct: 63.4 },
    { total: 365, terminados: 235, pct: 64.4, tareasSinEstimar: 26 },
  ]);
  check("sin sprint = stories del workspace menos lo que suman los sprints", r.sinSprint, 4);
  check("sin problemas cuando todos traen stats y la cuenta cierra", problemas, []);

  const sinStats = [];
  const r2 = progresoDelProyecto([SPRINT_1, { ...SPRINT_2, stats: undefined }], {}, sinStats);
  check("un sprint sin stats cuenta en 0 y se reporta", [r2.tareas.total, r2.sprints[1].tareas.total, sinStats.map((p) => [p.campo, p.valor])], [84, 0, [["stats", 70]]]);
  check("sin conteo de stories no hay dato de sin sprint", r2.sinSprint, null);

  const noCierra = [];
  const r3 = progresoDelProyecto([SPRINT_1, SPRINT_2], { stories: 100 }, noCierra);
  check("si los sprints suman más que el workspace, sin dato y reportado", [r3.sinSprint, noCierra.map((p) => p.campo)], [null, ["búsqueda stories"]]);

  check("sin sprints: sin porcentaje, no 0", progresoDelProyecto([]), {
    sprints: [], tareas: { total: 0, terminadas: 0, enCurso: 0, pendientes: 0, pct: null },
    puntos: { total: 0, terminados: 0, pct: null, tareasSinEstimar: 0 }, sinSprint: null,
  });
}

console.log("El sprint que se mira se cuenta desde sus stories");
{
  // Las stats dicen 1 de 44; las stories (resumen) dicen 2 de 44: gana el resumen y se reporta.
  const resumen = {
    tareas: { total: 44, terminadas: 2, enCurso: 16, pendientes: 26, pct: 4.5 },
    puntos: { total: 110, terminados: 5, pct: 4.5, tareasSinEstimar: 9 },
  };
  const problemas = [];
  const r = progresoDelProyecto([SPRINT_1, SPRINT_2], { stories: 132, desdeStories: [{ id: 70, resumen }] }, problemas);
  check("la fila del sprint toma los números de las stories", [r.sprints[1].tareas, r.sprints[1].puntos], [resumen.tareas, resumen.puntos]);
  check("los totales del proyecto se recalculan con esa fila", [r.tareas, r.puntos.terminados, r.sinSprint], [
    { total: 128, terminadas: 86, enCurso: 16, pendientes: 26, pct: 67.2 }, 240, 4,
  ]);
  check("la diferencia queda reportada con los dos números", problemas.map((p) => [p.campo, p.valor, p.motivo.includes("1 de 44") && p.motivo.includes("2 de 44")]), [["stats", 70, true]]);

  const iguales = [];
  const resumenIgual = {
    tareas: { total: 44, terminadas: 1, enCurso: 17, pendientes: 26, pct: 2.3 },
    puntos: { total: 110, terminados: 0, pct: 0, tareasSinEstimar: 9 },
  };
  progresoDelProyecto([SPRINT_1, SPRINT_2], { stories: 132, desdeStories: [{ id: 70, resumen: resumenIgual }] }, iguales);
  check("si coinciden, nada que reportar", iguales, []);

  const otro = [];
  const r4 = progresoDelProyecto([SPRINT_1], { stories: 84, desdeStories: [{ id: 999, resumen }] }, otro);
  check("un sprint que no está en la lista no cambia nada", [r4.tareas.total, otro], [84, []]);
}

console.log("Errores del proyecto");
{
  const problemas = [];
  check("reportados, resueltos y abiertos, cada uno de su búsqueda; el sprint con el vocabulario del OKR",
    erroresDelProyecto({ bugs: 7, bugsResueltos: 5, bugsAbiertos: 2 }, { bugs: 3, bugsAbiertosEnSprint: 2, bugsTerminados: 1 }, problemas), {
    reportados: 7, resueltos: 5, abiertos: 2, pctResueltos: 71.4, enElSprint: { reportados: 2, sinResolver: 2 },
  });
  check("cuando cierra, nada que reportar", problemas, []);
  check("sin conteos: null, no 0", erroresDelProyecto(null, { bugs: 0, bugsAbiertosEnSprint: 0, bugsTerminados: 0 }), {
    reportados: null, resueltos: null, abiertos: null, pctResueltos: null, enElSprint: { reportados: 0, sinResolver: 0 },
  });
  check("si solo falló una búsqueda, lo que depende de ella es null", erroresDelProyecto({ bugs: 3, bugsResueltos: null, bugsAbiertos: 1 }, null), {
    reportados: 3, resueltos: null, abiertos: 1, pctResueltos: null, enElSprint: { reportados: 0, sinResolver: 0 },
  });
  check("ningún bug reportado: 0 resueltos y 0 abiertos aunque esas búsquedas hayan fallado", erroresDelProyecto({ bugs: 0, bugsResueltos: null, bugsAbiertos: null }, null), {
    reportados: 0, resueltos: 0, abiertos: 0, pctResueltos: null, enElSprint: { reportados: 0, sinResolver: 0 },
  });
  const noCierra = [];
  const r = erroresDelProyecto({ bugs: 2, bugsResueltos: 3, bugsAbiertos: 0 }, null, noCierra);
  check("resueltos > reportados: no se tapa, se reporta y el porcentaje queda sin dato", [r.abiertos, r.pctResueltos, noCierra.map((p) => [p.campo, p.valor])], [0, null, [["búsqueda bugs", "2 reportados, 3 resueltos, 0 abiertos"]]]);
  const suma = [];
  erroresDelProyecto({ bugs: 5, bugsResueltos: 2, bugsAbiertos: 2 }, null, suma);
  check("resueltos + abiertos distinto de reportados también se reporta", suma.length, 1);
}

console.log("armarReporte publica `proyecto`");
{
  const TO_DO = 7, DONE = 10;
  const WORKFLOW = { id: 5, name: "Standard", states: [
    { id: TO_DO, name: "To Do", type: "unstarted", position: 1 },
    { id: DONE, name: "Done", type: "done", position: 4 },
  ] };
  const story = (o) => ({
    id: 1, name: "Tarea", app_url: "", archived: false, workflow_id: 5, workflow_state_id: TO_DO,
    started: false, completed: false, estimate: null, epic_id: null, owner_ids: [],
    parent_story_id: null, iteration_id: 70, created_at: "2026-10-08T12:00:00Z", updated_at: "2026-10-08T12:00:00Z",
    started_at: null, started_at_override: null, completed_at: null, completed_at_override: null, story_type: "feature", ...o,
  });
  const base = {
    iteraciones: [SPRINT_1, SPRINT_2], iteracion: SPRINT_2,
    stories: [story({ id: 1, story_type: "bug" }), story({ id: 2 })],
    workflows: [WORKFLOW], miembros: [], epics: [], historiales: {}, movidas: null,
  };
  // Las stats del Sprint 2 dicen 1 de 44, pero las stories del reporte son 2 sin
  // terminar: el proyecto usa las stories para ese sprint (84 + 2) y lo reporta.
  const r = armarReporte({ ...base, conteos: { stories: 90, bugs: 1, bugsResueltos: 0, bugsAbiertos: 1 } }, { ahora: new Date("2026-10-17T15:00:00Z") });
  check("progreso: el sprint que se mira desde sus stories, el resto desde stats", [r.proyecto.progreso.tareas, r.proyecto.progreso.sprints[1].tareas, r.proyecto.progreso.sinSprint], [
    { total: 86, terminadas: 84, enCurso: 0, pendientes: 2, pct: 97.7 },
    { total: 2, terminadas: 0, enCurso: 0, pendientes: 2, pct: 0 }, 4,
  ]);
  check("la diferencia entre stats y stories queda en problemas", r.problemas.filter((p) => p.campo === "stats").map((p) => p.valor), [70]);
  check("errores: conteos del workspace y el bug del sprint con el vocabulario del OKR", r.proyecto.errores, {
    reportados: 1, resueltos: 0, abiertos: 1, pctResueltos: 0, enElSprint: { reportados: 1, sinResolver: 1 },
  });
  const sinConteos = armarReporte(base, { ahora: new Date("2026-10-17T15:00:00Z") });
  check("sin conteos el progreso sale igual y los errores quedan en null", [sinConteos.proyecto.progreso.tareas.pct, sinConteos.proyecto.progreso.sinSprint, sinConteos.proyecto.errores.abiertos], [97.7, null, null]);
}

// ---- lib/kpis/proyecto.js: el proyecto entero -----------------------------

const TO_DO = 7, IN_PROGRESS = 8, DONE = 10;
const WORKFLOW = { id: 5, name: "Standard", states: [
  { id: TO_DO, name: "To Do", type: "unstarted", position: 1 },
  { id: IN_PROGRESS, name: "In Progress", type: "started", position: 2 },
  { id: DONE, name: "Done", type: "done", position: 4 },
] };
const MIEMBROS = [
  { id: "u-ana", profile: { name: "Ana", mention_name: "ana" } },
  { id: "u-beto", profile: { name: "Beto", mention_name: "beto" } },
];
const EQUIPO = {
  horasPorPunto: 4, wipMaxPorPersona: 3,
  horasPactadas: { porIntegrante: null, finDelProyecto: null },
  metas: { bugsRatioMax: 0.25, retrabajoMax: 10, efectividadMin: 80, utilizacionMin: 70, utilizacionMax: 90 },
  integrantes: [{ nombre: "Ana", rol: "Dev", detalle: null, horasPactadas: 100 }, { nombre: "Beto", rol: "QA", detalle: null, horasPactadas: 50 }],
};
const story = (o) => ({
  id: 1, name: "Tarea", app_url: "", archived: false, workflow_id: 5, workflow_state_id: TO_DO,
  started: false, completed: false, estimate: null, epic_id: null, owner_ids: [], parent_story_id: null,
  iteration_id: 70, created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
  started_at: null, started_at_override: null, completed_at: null, completed_at_override: null, story_type: "feature", ...o,
});
const terminada = (o) => story({ workflow_state_id: DONE, started: true, completed: true, started_at: "2026-09-24T12:00:00Z", completed_at: "2026-09-30T12:00:00Z", ...o });
const enCurso = (o) => story({ workflow_state_id: IN_PROGRESS, started: true, started_at: "2026-10-09T12:00:00Z", ...o });
// Historial con la creacion directa en el sprint: dice cuando entro.
const creada = (id, changed_at, iteration_id) => [{ changed_at, actions: [{ id, entity_type: "story", action: "create", name: "Tarea", iteration_id }] }];

// Sprint 1 terminado con dos tareas hechas (una sin estimar); Sprint 2 en curso
// con una comprometida en curso, una agregada sin asignar y un bug agregado y
// resuelto. Las stats de cada iteracion coinciden con sus stories.
const S1 = { ...SPRINT_1, stats: stats({ num_stories_done: 2, num_points: 3, num_points_done: 3, num_stories_unestimated: 1 }) };
const S2 = { ...SPRINT_2, stats: stats({ num_stories_done: 1, num_stories_started: 1, num_stories_unstarted: 1, num_points: 8, num_points_done: 1 }) };
const a = terminada({ id: 1, iteration_id: 29, estimate: 3, owner_ids: ["u-ana"], created_at: "2026-09-20T12:00:00Z" });
const b = terminada({ id: 2, iteration_id: 29, estimate: null, owner_ids: ["u-beto"], created_at: "2026-09-20T12:00:00Z" });
const c = enCurso({ id: 3, iteration_id: 70, estimate: 5, owner_ids: ["u-ana"], created_at: "2026-10-01T12:00:00Z" });
const d = story({ id: 4, iteration_id: 70, estimate: 2, created_at: "2026-10-10T12:00:00Z" });
const e = terminada({ id: 5, iteration_id: 70, estimate: 1, owner_ids: ["u-ana"], story_type: "bug", created_at: "2026-10-12T12:00:00Z", started_at: "2026-10-12T12:00:00Z", completed_at: "2026-10-13T12:00:00Z" });
const HISTORIALES = {
  1: creada(1, "2026-09-20T12:00:00Z", 29), 2: creada(2, "2026-09-20T12:00:00Z", 29),
  3: creada(3, "2026-10-01T12:00:00Z", 70), 4: creada(4, "2026-10-10T12:00:00Z", 70), 5: creada(5, "2026-10-12T12:00:00Z", 70),
};
// Domingo 18/10 a las 12 de Buenos Aires: el Sprint 2 va por su dia 12.
const AHORA = new Date("2026-10-18T15:00:00Z");
const CATALOGOS = { workflows: [WORKFLOW], miembros: MIEMBROS, epics: [] };
const LECTURAS = [
  { iteracion: S1, stories: [a, b], historiales: HISTORIALES },
  { iteracion: S2, stories: [c, d, e], historiales: HISTORIALES },
];

console.log("Periodo del proyecto");
{
  const p = describirPeriodo([S2, S1], AHORA);
  check("del inicio del primero al fin del último, en días de calendario", [p.inicio, p.fin, p.diasTotales, p.diasParaEmpezar, p.diasDelProyecto], ["2026-09-23", "2026-10-21", 29, 0, 29]);
  check("con fin de proyecto configurado, los días del proyecto llegan hasta ahí", describirPeriodo([S1, S2], AHORA, { finDelProyecto: "2026-12-05" }).diasDelProyecto, 74);
  check("un fin anterior al último sprint no recorta el proyecto", describirPeriodo([S1, S2], AHORA, { finDelProyecto: "2026-10-01" }).diasDelProyecto, 29);
  check("restantes contando hoy, transcurridos el resto", [p.diasTranscurridos, p.diasRestantes], [25, 4]);
  check("cuántos sprints hay de cada estado y cuál está en curso", [p.sprints, p.enCurso], [{ total: 2, terminados: 1, enCurso: 1, proximos: 0 }, { id: 70, nombre: "Sprint 2" }]);
  const conProximo = describirPeriodo([S1, S2, SPRINT_3], AHORA);
  check("un sprint por empezar extiende el periodo", [conProximo.fin, conProximo.diasTotales, conProximo.sprints.proximos, conProximo.diasRestantes], ["2026-11-04", 43, 1, 18]);
  const terminado = describirPeriodo([S1], AHORA);
  check("proyecto terminado: sin días restantes ni sprint en curso", [terminado.diasRestantes, terminado.diasTranscurridos, terminado.enCurso], [0, 15, null]);
  check("sin sprints: todo en cero y sin fechas", describirPeriodo([], AHORA), {
    inicio: null, fin: null, diasTotales: 0, diasTranscurridos: 0, diasRestantes: 0, diasParaEmpezar: 0, diasDelProyecto: 0,
    finDelReparto: null, repartoConfigurado: false,
    sprints: { total: 0, terminados: 0, enCurso: 0, proximos: 0 }, enCurso: null,
  });
}

console.log("armarProyecto: el proyecto entero desde las stories de todos los sprints");
{
  const r = armarProyecto(
    { iteraciones: [S2, S1], sprints: LECTURAS, ...CATALOGOS, conteos: { stories: 5, bugs: 1, bugsResueltos: 1, bugsAbiertos: 0 } },
    { ahora: AHORA, equipo: EQUIPO }
  );
  check("ámbito, versión de los datos y sprints para el selector, del más nuevo al más viejo", [r.ambito, r.version, r.sprints.map((s) => s.id)], ["proyecto", VERSION_DE_DATOS, [70, 29]]);
  check("progreso: 3 de 5 tareas y 4 de 11 puntos, contados desde las stories", [r.progreso.tareas, r.progreso.puntos], [
    { total: 5, terminadas: 3, enCurso: 1, pendientes: 1, pct: 60 },
    { total: 11, terminados: 4, pct: 36.4, tareasSinEstimar: 1 },
  ]);
  check("una fila por sprint, del primero al último", r.progreso.sprints.map((s) => [s.nombre, s.tareas.terminadas, s.tareas.total, s.puntos.terminados, s.puntos.total]), [["Sprint 1", 2, 2, 3, 3], ["Sprint 2", 1, 3, 1, 8]]);
  check("nada fuera de los sprints: la búsqueda cuenta lo mismo que las stories", r.progreso.sinSprint, 0);
  check("periodo adjunto", [r.periodo.inicio, r.periodo.fin, r.periodo.sprints.total], ["2026-09-23", "2026-10-21", 2]);
  check("sprint por sprint con la cuenta del historial: planificado, cumplido y movido",
    r.porSprint.map((s) => [s.nombre, s.planificadas, s.cumplidas, s.pctCumplimiento, s.movidas, s.terminadas, s.total, s.puntosTerminados, s.puntosTotales]),
    [["Sprint 1", 2, 2, 100, 0, 2, 2, 3, 3], ["Sprint 2", 3, 1, 33.3, 0, 1, 3, 1, 8]]);
  check("bugs del proyecto: 1 bug sobre 2 historias terminadas", r.equipo.bugs, { bugs: 1, bugsAbiertosEnSprint: 1, bugsTerminados: 1, historiasTerminadas: 2, historias: 4, ratio: 0.5, sinRegistro: false });
  check("tipo de trabajo: sin el campo Skill Set en el catálogo, sin grupos y con el motivo", r.porEspecialidad, { grupos: [], motivo: "sin-campo" });
  check("OKRs sobre todo el proyecto: ratio 0.5 no cumple, sin retrabajo cumple, efectividad 44.4% y utilización 24% no", r.equipo.okrs.map((o) => [o.clave, o.valor, o.cumple]), [["bugsRatio", 0.5, false], ["retrabajo", 0, true], ["efectividad", 44.4, false], ["utilizacion", 24, false]]);
  check("horas: el periodo del proyecto es todo el proyecto (29 días de calendario), así que las pactadas entran enteras", [r.equipo.horas.diasDelPeriodo, r.equipo.horas.diasDelProyecto, r.equipo.horas.equipo], [29, 29, { capacidad: 150, demanda: 36, extras: 0, hechas: 16, asignadas: 36, utilizacion: 24, efectividad: 44.4, conSobrecarga: 0 }]);
  check("Ana: 100 h pactadas, 36 h asignadas (3 + 5 + 1 puntos), 16 h hechas", r.equipo.horas.personas.find((p) => p.nombre === "Ana"), {
    nombre: "Ana", rol: "Dev", detalle: null, horasPactadas: 100, capacidad: 100, demanda: 36, dentroDeLoPactado: 36, extras: 0, hechas: 16, asignadas: 36, utilizacion: 36, efectividad: 44.4,
  });
  check("errores del workspace, con los bugs de los sprints en el vocabulario del OKR", r.errores, { reportados: 1, resueltos: 1, abiertos: 0, pctResueltos: 100, enElSprint: { reportados: 1, sinResolver: 0 } });
  check("iniciativas y responsables sobre todas las tareas", [
    r.porIniciativa.grupos.map((g) => [g.nombre, g.total, g.terminadas, g.pct]),
    r.porResponsable.grupos.map((g) => [g.nombre, g.total, g.terminadas]),
    r.porResponsable.compartidas,
  ], [[["Sin iniciativa", 5, 3, 60]], [["Ana", 3, 2], ["Beto", 1, 1], ["Sin asignar", 1, 0]], 0]);
  check("distribución por rol sobre el proyecto", r.equipo.porRol.grupos.map((g) => [g.rol, g.tareas, g.puntos]), [["Dev", 3, 9], ["QA", 1, 0], ["Sin asignar", 1, 2]]);
  check("sin archivadas, sin problemas y con la lectura descripta", [r.archivadas, r.problemas, r.lectura], [0, [], { leidoEl: null, desactualizado: false }]);
}

console.log("armarProyecto: lo que no cierra se reporta");
{
  // Las stats del Sprint 2 dicen 2 terminadas; sus stories, 1: ganan las stories y se anota.
  const distinto = armarProyecto(
    { iteraciones: [S1, { ...S2, stats: stats({ num_stories_done: 2, num_stories_started: 1, num_points: 8, num_points_done: 1 }) }], sprints: LECTURAS, ...CATALOGOS },
    { ahora: AHORA, equipo: EQUIPO }
  );
  check("stats distintas de las stories: se cuentan las stories y queda reportado", [distinto.progreso.tareas.terminadas, distinto.problemas.map((p) => [p.campo, p.valor])], [3, [["stats", 70]]]);

  // No vinieron las stories del Sprint 2: se cuenta con sus stats, sin fila
  // propia ni tareas en los KPIs del equipo, y se anota.
  const sinSprint2 = armarProyecto(
    { iteraciones: [S1, S2], sprints: [LECTURAS[0]], ...CATALOGOS },
    { ahora: AHORA, equipo: EQUIPO }
  );
  check("sprint sin stories: progreso desde las stats, fuera del equipo y del detalle, reportado", [
    sinSprint2.progreso.tareas, sinSprint2.porSprint.map((s) => s.nombre), sinSprint2.equipo.carga.personas.map((p) => [p.nombre, p.tareas]),
    sinSprint2.problemas.map((p) => [p.campo, p.valor]),
  ], [
    { total: 5, terminadas: 3, enCurso: 1, pendientes: 1, pct: 60 }, ["Sprint 1"], [["Ana", 1], ["Beto", 1]], [["stories", 70]],
  ]);
  check("sin conteos: ni tareas fuera de sprint ni errores, sin inventar ceros", [sinSprint2.progreso.sinSprint, sinSprint2.errores.reportados], [null, null]);

  // Ningún bug en todo el workspace: el OKR de bugs queda sin dato.
  const sinBugs = armarProyecto(
    { iteraciones: [S1, { ...S2, stats: stats({ num_stories_done: 0, num_stories_started: 1, num_stories_unstarted: 1, num_points: 7 }) }], sprints: [LECTURAS[0], { ...LECTURAS[1], stories: [c, d] }], ...CATALOGOS, conteos: { stories: 4, bugs: 0, bugsResueltos: 0, bugsAbiertos: 0 } },
    { ahora: AHORA, equipo: EQUIPO }
  );
  check("sin bugs registrados en el workspace: ratio sin dato y OKR neutro", [sinBugs.equipo.bugs.sinRegistro, sinBugs.equipo.okrs[0].valor, sinBugs.equipo.okrs[0].cumple, sinBugs.problemas], [true, null, null, []]);

  // Fin del proyecto configurado antes del último sprint: se descarta y se anota.
  const finViejo = armarProyecto({ iteraciones: [S1, S2], sprints: LECTURAS, ...CATALOGOS }, { ahora: AHORA, equipo: { ...EQUIPO, horasPactadas: { porIntegrante: null, finDelProyecto: "2026-10-10" } } });
  check("fin del proyecto anterior al último sprint: se reparte hasta el último sprint y se anota", [finViejo.periodo.finDelReparto, finViejo.periodo.repartoConfigurado, finViejo.problemas.map((p) => [p.campo, p.valor])], ["2026-10-21", false, [["horasPactadas.finDelProyecto", "2026-10-10"]]]);
  const finNuevo = armarProyecto({ iteraciones: [S1, S2], sprints: LECTURAS, ...CATALOGOS }, { ahora: AHORA, equipo: { ...EQUIPO, horasPactadas: { porIntegrante: null, finDelProyecto: "2026-12-05" } } });
  check("fin del proyecto posterior: los sprints cargados reciben 29 de 74 días de las horas", [finNuevo.periodo.finDelReparto, finNuevo.periodo.repartoConfigurado, finNuevo.equipo.horas.diasDelPeriodo, finNuevo.equipo.horas.diasDelProyecto, finNuevo.equipo.horas.equipo.capacidad, finNuevo.problemas], ["2026-12-05", true, 29, 74, 58.8, []]);

  // Sprints que se pisan una semana: se anota (en la vista de cada sprint esos días cuentan para el primero).
  const pisado = { ...S2, start_date: "2026-10-01" };
  const conSolape = armarProyecto({ iteraciones: [S1, pisado], sprints: [LECTURAS[0], { ...LECTURAS[1], iteracion: pisado }], ...CATALOGOS }, { ahora: AHORA, equipo: EQUIPO });
  check("sprints que se pisan una semana se anotan", conSolape.problemas.map((p) => [p.campo, p.valor, p.motivo.includes("7 días")]), [["sprints", 70, true]]);

  const vacio = armarProyecto({ iteraciones: [], sprints: [], ...CATALOGOS }, { ahora: AHORA });
  check("sin sprints: sin porcentajes, sin filas, OKRs sin valor", [vacio.progreso.tareas.pct, vacio.porSprint, vacio.equipo.okrs.map((o) => o.valor), vacio.periodo.sprints.total, vacio.problemas], [null, [], [null, null, null, null], 0, []]);
}

console.log("armarProyecto: sprints sin empezar y tareas movidas");
{
  // Sprint 3 sin empezar, con una tarea planificada (5 pts de Ana) y una que
  // vino del Sprint 2 (estaba comprometida ahi y se movio el 16/10).
  const f = story({ id: 6, iteration_id: 90, estimate: 5, owner_ids: ["u-ana"], created_at: "2026-10-15T12:00:00Z" });
  const g = story({ id: 7, iteration_id: 90, estimate: 2, created_at: "2026-10-02T12:00:00Z", previous_iteration_ids: [70] });
  const S3 = { ...SPRINT_3, stats: stats({ num_stories_unstarted: 2, num_points: 7 }) };
  const movida = (id, changed_at, old, nuevo) => ({ changed_at, actions: [{ id, entity_type: "story", action: "update", changes: { iteration_id: { old, new: nuevo } } }] });
  const historiales = {
    ...HISTORIALES,
    6: creada(6, "2026-10-15T12:00:00Z", 90),
    7: [...creada(7, "2026-10-02T12:00:00Z", 70), movida(7, "2026-10-16T12:00:00Z", 70, 90)],
  };
  const lecturas = [...LECTURAS, { iteracion: S3, stories: [f, g], historiales }];
  const r = armarProyecto({ iteraciones: [S1, S2, S3], sprints: lecturas, ...CATALOGOS }, { ahora: AHORA, equipo: EQUIPO });
  check("el sprint por empezar suma alcance y horas asignadas: la efectividad baja porque de él no se hizo nada", [r.progreso.tareas.total, r.equipo.horas.diasDelPeriodo, r.equipo.horas.diasDelProyecto, r.equipo.horas.equipo.capacidad, r.equipo.horas.equipo.asignadas, r.equipo.okrs.find((o) => o.clave === "efectividad").valor], [7, 43, 43, 150, 56, 28.6]);
  check("la movida cuenta una sola vez en el proyecto, y en el Sprint 2 como planificada y movida", [r.progreso.sprints.map((s) => s.tareas.total), r.porSprint.map((s) => [s.nombre, s.planificadas, s.cumplidas, s.movidas])], [[2, 3, 2], [["Sprint 1", 2, 2, 0], ["Sprint 2", 4, 1, 1]]]);
  check("el sprint que no empezó no tiene fila propia y nada que reportar", [r.porSprint.length, r.periodo.sprints.proximos, r.problemas], [2, 1, []]);

  // En la vista de un sprint que no empezo todavia no hay nada hecho que
  // medir: la efectividad queda sin dato, no en 0 %.
  const sprint3 = armarReporte({ iteraciones: [S1, S2, S3], iteracion: S3, stories: [f, g], ...CATALOGOS, historiales, movidas: null }, { ahora: AHORA, equipo: EQUIPO });
  check("armarReporte de un sprint sin empezar: 20 h asignadas y efectividad sin dato", [sprint3.equipo.horas.equipo.asignadas, sprint3.equipo.okrs.find((o) => o.clave === "efectividad").valor], [20, null]);

  // Una movida cuyo historial no dice cuando entro al sprint de origen: lo que
  // armarHistorial reporta sobre ella llega a `problemas`, una sola vez.
  // Con 2 puntos las stats del Sprint 3 (7 puntos) siguen cerrando con f + h.
  const h = story({ id: 8, iteration_id: 90, estimate: 2, created_at: "2026-10-03T12:00:00Z", previous_iteration_ids: [70] });
  const sinOrigen = armarProyecto(
    { iteraciones: [S1, S2, S3], sprints: [...LECTURAS, { iteracion: S3, stories: [f, h], historiales: { ...historiales, 8: creada(8, "2026-10-03T12:00:00Z", 90) } }], ...CATALOGOS },
    { ahora: AHORA, equipo: EQUIPO }
  );
  check("la movida sin fecha de ingreso al origen se reporta (y no se duplica)", sinOrigen.problemas.map((p) => [p.tarea, p.campo, p.valor]), [[8, "iteration_id", 70]]);
}

console.log("armarProyecto: retrabajo con el historial de cada sprint");
{
  // La tarea 1 (Sprint 1) se reabre a los dos dias y la 5 (Sprint 2) se saca de
  // Done a los dos minutos: cada historial viene con la lectura de su sprint.
  const IN_REVIEW = 9;
  const conRevision = { ...WORKFLOW, states: [...WORKFLOW.states, { id: IN_REVIEW, name: "In Review", type: "started", position: 3 }] };
  const cambio = (id, changed_at, old, nuevo, member_id = "u-ana") => ({ changed_at, member_id, actions: [{ id, entity_type: "story", action: "update", changes: { workflow_state_id: { old, new: nuevo } } }] });
  const del1 = {
    1: [...creada(1, "2026-09-20T12:00:00Z", 29), cambio(1, "2026-09-25T12:00:00Z", IN_PROGRESS, DONE), cambio(1, "2026-09-27T12:00:00Z", DONE, IN_REVIEW, "u-beto"), cambio(1, "2026-09-28T12:00:00Z", IN_REVIEW, DONE)],
    2: HISTORIALES[2],
  };
  const del2 = {
    3: HISTORIALES[3], 4: HISTORIALES[4],
    5: [...creada(5, "2026-10-12T12:00:00Z", 70), cambio(5, "2026-10-13T12:00:00Z", IN_PROGRESS, DONE), cambio(5, "2026-10-13T12:02:00Z", DONE, IN_PROGRESS), cambio(5, "2026-10-13T12:03:00Z", IN_PROGRESS, DONE)],
  };
  const r = armarProyecto(
    { iteraciones: [S1, S2], sprints: [{ iteracion: S1, stories: [a, b], historiales: del1 }, { iteracion: S2, stories: [c, d, e], historiales: del2 }], workflows: [conRevision], miembros: MIEMBROS, epics: [] },
    { ahora: AHORA, equipo: EQUIPO }
  );
  check("1 de las 3 cerradas de los dos sprints volvió atrás; la de los dos minutos es una corrección", [r.equipo.retrabajo.cerradas, r.equipo.retrabajo.conRetrabajo, r.equipo.retrabajo.pct, r.equipo.retrabajo.descartadas], [3, 1, 33.3, { replanificadas: 0, correcciones: 1 }]);
  check("la vuelta dice de dónde a dónde y quién", r.equipo.retrabajo.casos.map((x) => [x.id, x.vueltas.map((v) => [v.desde, v.hacia, v.quien, v.reapertura])]), [[1, [["Done", "In Review", "Beto", true]]]]);
  check("el OKR la evalúa contra la meta", r.equipo.okrs.find((o) => o.clave === "retrabajo"), { clave: "retrabajo", nombre: "Retrabajo", valor: 33.3, meta: 10, descripcionMeta: "como mucho 10%", cumple: false });
  check("sin problemas nuevos", r.problemas, []);
}

console.log(`\n${ok} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
