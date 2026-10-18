// Tests del progreso del proyecto y de los errores (lib/kpis/performance.js).
// Sin framework: node los corre directo con `npm test`.

import { armarReporte, erroresDelProyecto, progresoDelProyecto } from "../lib/kpis/performance.js";

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
  const r = progresoDelProyecto([SPRINT_1, SPRINT_2], { stories: 132, sprintDesdeStories: { id: 70, resumen } }, problemas);
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
  progresoDelProyecto([SPRINT_1, SPRINT_2], { stories: 132, sprintDesdeStories: { id: 70, resumen: resumenIgual } }, iguales);
  check("si coinciden, nada que reportar", iguales, []);

  const otro = [];
  const r4 = progresoDelProyecto([SPRINT_1], { stories: 84, sprintDesdeStories: { id: 999, resumen } }, otro);
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

console.log(`\n${ok} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
