// Tests de la vista del cliente: el avance del MVP, las horas invertidas, las
// entregas y los riesgos (lib/kpis/inversion.js).
// Sin framework: node los corre directo con `npm test`.

import {
  DIAS_DEL_RITMO,
  SIN_CLASIFICAR,
  VERSION_DE_INVERSION,
  armarInversion,
  calcularRitmo,
  clasificarTareas,
  describirMvp,
  horasInvertidas,
  okrsDelCliente,
  riesgosDelMvp,
  tipoPorPrefijo,
} from "../lib/kpis/inversion.js";
import { EQUIPO_VACIO } from "../lib/kpis/equipo.js";

let ok = 0, fail = 0;
const check = (nombre, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log("  OK   " + nombre); }
  else { fail++; console.log("  FALLA " + nombre + "\n        real:     " + a + "\n        esperado: " + b); }
};

// ---- escenario --------------------------------------------------------------
// Tres sprints de dos semanas; la entrega del MVP es el 28/10, el fin del
// segundo. El tercero empieza despues: es de una version posterior.

const TO_DO = 7, EN_CURSO = 8, DONE = 10;
const WORKFLOW = { id: 5, name: "Standard", states: [
  { id: TO_DO, name: "To Do", type: "unstarted", position: 1 },
  { id: EN_CURSO, name: "In Progress", type: "started", position: 2 },
  { id: DONE, name: "Done", type: "done", position: 3 },
] };
const MIEMBROS = [{ id: "u-ana", profile: { name: "Ana", mention_name: "ana" } }];
// Las `stats` coinciden con las stories de cada sprint, como en Shortcut.
const iteracion = (id, nombre, inicio, fin, [hechas, empezadas, sinEmpezar, puntos, puntosHechos, sinEstimar]) => ({
  id, name: nombre, status: "started", start_date: inicio, end_date: fin, app_url: `https://sc/iteration/${id}`,
  stats: {
    num_stories_done: hechas, num_stories_started: empezadas, num_stories_unstarted: sinEmpezar, num_stories_backlog: 0,
    num_points: puntos, num_points_done: puntosHechos, num_stories_unestimated: sinEstimar,
  },
});
const S1 = iteracion(1, "Sprint 1", "2026-10-01", "2026-10-14", [4, 0, 0, 18, 18, 0]);
const S2 = iteracion(2, "Sprint 2", "2026-10-15", "2026-10-28", [1, 1, 2, 6, 1, 1]);
const S3 = iteracion(3, "Sprint 3", "2026-10-29", "2026-11-11", [0, 0, 1, 5, 0, 0]);

const story = (o) => ({
  id: 1, name: "Tarea", app_url: `https://sc/story/${o.id}`, archived: false, workflow_id: 5, workflow_state_id: TO_DO,
  started: false, completed: false, estimate: null, epic_id: null, owner_ids: ["u-ana"], parent_story_id: null,
  created_at: "2026-09-28T12:00:00Z", updated_at: "2026-09-28T12:00:00Z", started_at: null, started_at_override: null,
  completed_at: null, completed_at_override: null, story_type: "feature", labels: [], custom_fields: [], ...o,
});
const hecha = (completada, o) => story({ workflow_state_id: DONE, started: true, completed: true, started_at: "2026-10-02T12:00:00Z", completed_at: completada, ...o });
const enCurso = (o) => story({ workflow_state_id: EN_CURSO, started: true, started_at: "2026-10-16T12:00:00Z", ...o });

const STORIES = {
  1: [
    hecha("2026-10-10T15:00:00Z", { id: 1, name: "HU-01 — Alta de cliente", estimate: 5, iteration_id: 1 }),
    hecha("2026-10-12T15:00:00Z", { id: 2, name: "Subtarea - Formulario", estimate: 3, iteration_id: 1, parent_story_id: 1 }),
    // 23 h de Buenos Aires del 14/10, el ultimo dia del sprint: es del sprint.
    hecha("2026-10-15T02:00:00Z", { id: 3, name: "HG-01 Planificación", estimate: 8, iteration_id: 1 }),
    hecha("2026-10-16T15:00:00Z", { id: 4, name: "HT-01\tLogin", estimate: 2, iteration_id: 1 }),
  ],
  2: [
    enCurso({ id: 5, name: "HU-02 Cola", estimate: 3, iteration_id: 2 }),
    story({ id: 6, name: "BACK - Endpoint de la cola", estimate: 2, iteration_id: 2, parent_story_id: 5 }),
    hecha("2026-10-18T15:00:00Z", { id: 7, name: "QA - Validar el alta", estimate: 1, iteration_id: 2 }),
    story({ id: 8, name: "Retro interna", iteration_id: 2 }),
  ],
  3: [story({ id: 9, name: "HU-03 Reportes", estimate: 5, iteration_id: 3 })],
};

const EQUIPO = {
  ...EQUIPO_VACIO,
  horasPorPunto: 4,
  horasPactadas: { porIntegrante: 70, finDelProyecto: "2026-10-28" },
  cliente: { horasMinimas: 80, avanceContraElPlanMin: 90, costoPorHora: null, moneda: null },
  integrantes: [
    { nombre: "Ana", rol: "Dev", detalle: null, horasPactadas: null },
    { nombre: "Beto", rol: "QA", detalle: null, horasPactadas: 30 },
  ],
};

const armar = (ahora, equipo = EQUIPO, { conteos = { stories: 10 } } = {}) =>
  armarInversion(
    {
      iteraciones: [S1, S2, S3],
      sprints: [S1, S2, S3].map((i) => ({ iteracion: i, stories: STORIES[i.id], historiales: {} })),
      workflows: [WORKFLOW], miembros: MIEMBROS, epics: [], conteos,
    },
    { ahora: new Date(ahora), equipo }
  );

// ---- tipo de trabajo ------------------------------------------------------------

console.log("Tipo de trabajo por prefijo");
{
  const clave = (titulo) => tipoPorPrefijo(titulo)?.clave ?? null;
  check("HU es funcionalidad, en sus formas", ["HU-07 — Registrar", "HU - 50  DEV Backend", "HU-16\tModificar", "hu-07 minúscula"].map(clave), ["funcionalidades", "funcionalidades", "funcionalidades", "funcionalidades"]);
  check("HT, QA, HG y SM", ["HT-10\tMotor", "QA-02 — Validar", "QA - Probar ingreso", "HG - 13 Crear", "SM-01 - Facilitar"].map(clave), ["tecnica", "calidad", "calidad", "gestion", "gestion"]);
  check("después de «Subtarea -» también vale", clave("Subtarea - QA - Flujo HU34"), "calidad");
  check("palabras que empiezan con dos letras no son prefijo", ["BACK - Crear endpoint", "DEV - Subtarea", "UX/UI - Vista", "BD - Persistir", "Retro Interna", "• Regla"].map(clave), [null, null, null, null, null, null]);
}

console.log("Clasificación de las tareas");
{
  const t = (id, titulo, historia = null) => ({ id, titulo, historia });
  const clasificadas = clasificarTareas([
    t(1, "HU-01 Alta"),
    t(2, "Subtarea - Formulario", { id: 1, titulo: "HU-01 Alta" }),
    t(3, "QA - Probar el alta", { id: 1, titulo: "HU-01 Alta" }),
    t(4, "Integrar", { id: 99, titulo: "HT-02 Login" }), // la historia no está en ningún sprint
    t(5, "Retro interna"),
    t(6, "Subtarea de nadie", { id: 98, titulo: "Algo sin prefijo" }),
  ]);
  check("la subtarea toma el tipo de su historia; el prefijo propio manda", clasificadas.map((c) => c.tipoDeTrabajo), ["funcionalidades", "funcionalidades", "calidad", "tecnica", SIN_CLASIFICAR.clave, SIN_CLASIFICAR.clave]);
}

// ---- el MVP ----------------------------------------------------------------------

console.log("El MVP");
{
  const mvp = describirMvp([S3, S1, S2], new Date("2026-10-20T15:00:00Z"), { entrega: "2026-10-28" });
  check("del primer sprint a la entrega, con los días restantes contando hoy", [mvp.inicio, mvp.fin, mvp.diasTotales, mvp.diasTranscurridos, mvp.diasRestantes, mvp.vencida], ["2026-10-01", "2026-10-28", 28, 19, 9, false]);
  check("los sprints que empiezan después de la entrega quedan afuera", [mvp.sprints.map((s) => s.id), mvp.despues.map((s) => s.id)], [[1, 2], [3]]);
  check("en curso es por calendario", mvp.enCurso, { id: 2, nombre: "Sprint 2" });
  const sinFecha = describirMvp([S1, S2, S3], new Date("2026-10-20T15:00:00Z"));
  check("sin fecha, el MVP es todo lo cargado", [sinFecha.configurada, sinFecha.fin, sinFecha.sprints.length], [false, "2026-11-11", 3]);
  const problemas = [];
  const anterior = describirMvp([S1, S2], new Date("2026-10-20T15:00:00Z"), { entrega: "2026-09-01" }, problemas);
  check("una entrega anterior al primer sprint se descarta y se anota", [anterior.configurada, problemas.map((p) => p.campo)], [false, ["horasPactadas.finDelProyecto"]]);
  check("sin sprints no se rompe", describirMvp([], new Date("2026-10-20T15:00:00Z"), { entrega: "2026-10-28" }).sprints, []);
}

// ---- todo junto, a mitad del Sprint 2 -------------------------------------------------

console.log("A mitad del Sprint 2 (20/10)");
{
  const r = armar("2026-10-20T15:00:00Z");
  check("versión y unidad", [r.version, r.unidad], [VERSION_DE_INVERSION, "horas"]);
  check("el alcance del MVP: 8 tareas, 96 h, 76 h terminadas", [r.alcance.tareas, r.alcance.valor, r.alcance.sinEstimar], [
    { total: 8, terminadas: 5, enCurso: 1, pendientes: 2, pct: 62.5 },
    { total: 96, terminado: 76, enCurso: 12, pendiente: 8, pct: 79.2 },
    1,
  ]);
  check("funcionalidades: 1 de 2 historias de usuario", [r.funcionalidades.total, r.funcionalidades.entregadas, r.funcionalidades.faltan.map((f) => f.id)], [2, 1, [5]]);
  // Sprint 1 entero (72 h) más 6 de los 14 días del Sprint 2 (24 h x 6/14).
  check("avance contra el plan: 76 h sobre 82.3 h planificadas a hoy", r.plan, { planificado: 82.3, terminado: 76, pct: 92.3 });
  check("ritmo: 76 h en 14 días; faltan 20 h y se terminan el 24/10", [r.ritmo.porDia, r.ritmo.restante, r.ritmo.necesarioPorDia, r.ritmo.proyeccion], [
    5.4, 20, 2.2, { terminado: false, fin: "2026-10-24", llegaALaEntrega: true, diasDeAtraso: 0, alaEntrega: 96 },
  ]);
  check("horas: 76 justificadas de 80 mínimas; 70 + 30 pactadas", (({ justificadas, comprometidas, minimo, pactadas, pctDelMinimo, faltanParaElMinimo, plata }) => ({ justificadas, comprometidas, minimo, pactadas, pctDelMinimo, faltanParaElMinimo, plata }))(r.inversion.horas), {
    justificadas: 76, comprometidas: 96, minimo: 80, pactadas: 100, pctDelMinimo: 95, faltanParaElMinimo: 4, plata: null,
  });
  check("en qué se invirtió, por tipo", r.inversion.porTipo.map((t) => [t.clave, t.valor.total, t.valor.terminado, t.pctDeLoTerminado]), [
    ["funcionalidades", 52, 32, 42.1], ["tecnica", 8, 8, 10.5], ["calidad", 4, 4, 5.3], ["gestion", 32, 32, 42.1], [SIN_CLASIFICAR.clave, 0, 0, 0],
  ]);
  check("las entregas van del sprint más nuevo al más viejo", r.entregas.map((s) => s.id), [2, 1]);
  const s1 = r.entregas[1];
  check("Sprint 1: tres tareas dentro del sprint (la de las 23 h incluida) y una después", [s1.planificado, s1.enElSprint, s1.despues, s1.pendiente, s1.pctEnElSprint], [
    { tareas: 4, valor: 72 }, { tareas: 3, valor: 64 }, { tareas: 1, valor: 8 }, { tareas: 0, valor: 0 }, 88.9,
  ]);
  check("Sprint 1: se listan las historias, la subtarea suma a la suya", s1.entregas.map((g) => [g.clave, g.tareas, g.valor, g.items.map((i) => [i.id, i.subtareas, i.despuesDelCierre])]), [
    ["funcionalidades", 2, 32, [[1, 1, false]]], ["tecnica", 1, 8, [[4, 0, true]]], ["gestion", 1, 32, [[3, 0, false]]],
  ]);
  check("lo que falta: la historia en curso con su subtarea, y la retro sin tipo", r.pendientes.map((g) => [g.clave, g.enCurso, g.sinEmpezar, g.valor, g.items.map((i) => [i.id, i.valor, i.subtareasPendientes, i.sinEstimar])]), [
    ["funcionalidades", 1, 0, 20, [[5, 20, 1, false]]], [SIN_CLASIFICAR.clave, 0, 1, 0, [[8, 0, 0, true]]],
  ]);
  check("después del MVP: el Sprint 3, y 2 stories fuera de los sprints", [r.despuesDelMvp.sprints.map((s) => s.id), r.despuesDelMvp.tareas, r.despuesDelMvp.valor, r.despuesDelMvp.fueraDeSprints], [[3], 1, 20, 1]);
  check("OKR del cliente", r.okrs.map((o) => [o.clave, o.valor, o.meta, o.cumple]), [
    ["alcance", 79.2, 100, true], ["funcionalidades", 50, 100, null], ["horas", 76, 80, true], ["plan", 92.3, 90, true],
  ]);
  check("riesgos: faltan 4 h para el mínimo, una entrega tardía, una sin estimar y una sin tipo", r.riesgos.map((x) => [x.clave, x.nivel]), [
    ["horas-bajo-el-minimo", "medio"], ["entregas-despues-del-cierre", "bajo"], ["sin-estimar", "bajo"], ["sin-clasificar", "bajo"],
  ]);
  const hoy = r.avanceAcumulado.find((d) => d.dia === "2026-10-20");
  const ultimo = r.avanceAcumulado.at(-1);
  check("la curva va del 1/10 al 28/10", [r.avanceAcumulado.length, r.avanceAcumulado[0].dia, ultimo.dia], [28, "2026-10-01", "2026-10-28"]);
  check("hoy: lo terminado y la proyección arrancan juntos", [hoy.terminado, hoy.proyeccion, hoy.planificado], [76, 76, 82.3]);
  check("después de hoy no hay terminado y la proyección no pasa del alcance", [ultimo.terminado, ultimo.proyeccion, ultimo.alcance], [null, 96, 96]);
  check("antes de hoy no hay proyección", r.avanceAcumulado[0].proyeccion, null);
  check("sin problemas", r.problemas, []);
}

console.log("Un día antes de la entrega (27/10): no llega");
{
  const r = armar("2026-10-27T15:00:00Z");
  // En los 14 días del 14/10 al 27/10 se terminaron 11 puntos (44 h).
  check("ritmo de 3.1 h por día: se termina el 3/11, 6 días tarde", [r.ritmo.porDia, r.ritmo.proyeccion.fin, r.ritmo.proyeccion.llegaALaEntrega, r.ritmo.proyeccion.diasDeAtraso, r.ritmo.necesarioPorDia], [3.1, "2026-11-03", false, 6, 10]);
  check("OKR: el alcance no llega y las horas tampoco", r.okrs.map((o) => [o.clave, o.cumple]), [["alcance", false], ["funcionalidades", null], ["horas", false], ["plan", false]]);
  check("riesgo principal: no llega", r.riesgos[0], { clave: "no-llega", nivel: "alto", fin: "2026-11-03", diasDeAtraso: 6, necesarioPorDia: 10, porDia: 3.1 });
}

console.log("Pasada la entrega (30/10)");
{
  const r = armar("2026-10-30T15:00:00Z");
  check("vencida, sin días restantes ni ritmo necesario", [r.mvp.vencida, r.mvp.diasRestantes, r.ritmo.necesarioPorDia], [true, 0, null]);
  check("OKR: el alcance y las funcionalidades no se cumplieron", r.okrs.map((o) => [o.clave, o.cumple]), [["alcance", false], ["funcionalidades", false], ["horas", false], ["plan", false]]);
  check("riesgos: entrega vencida, horas bajo el mínimo y el sprint cerrado con pendientes", r.riesgos.filter((x) => x.nivel !== "bajo").map((x) => [x.clave, x.nivel]), [
    ["entrega-vencida", "alto"], ["horas-bajo-el-minimo", "alto"], ["sprint-cerrado-con-pendientes", "medio"],
  ]);
}

console.log("Sin fecha de entrega, sin horas por punto");
{
  const r = armar("2026-10-20T15:00:00Z", { ...EQUIPO, horasPorPunto: null, horasPactadas: { porIntegrante: 70, finDelProyecto: null } });
  check("se mide en puntos y el MVP es todo lo cargado", [r.unidad, r.mvp.configurada, r.alcance.valor.total, r.despuesDelMvp.tareas], ["puntos", false, 29, 0]);
  check("las horas no se calculan", [r.inversion.horas.configurado, r.inversion.horas.justificadas], [false, undefined]);
  check("los riesgos lo dicen primero", r.riesgos.slice(0, 2).map((x) => x.clave), ["sin-entrega", "sin-horas-por-punto"]);
  check("OKR sin fecha: alcance y horas sin juzgar", r.okrs.map((o) => [o.clave, o.cumple]), [["alcance", null], ["funcionalidades", null], ["horas", null], ["plan", true]]);
}

// ---- piezas sueltas ---------------------------------------------------------------

console.log("Ritmo");
{
  const t = (id, puntos, terminadaEl = null) => ({ id, puntos, terminada: terminadaEl !== null, terminadaEl });
  const valorDe = (x) => (x.puntos ?? 0) * 4;
  check(`sin nada terminado en ${DIAS_DEL_RITMO} días no hay proyección`,
    calcularRitmo([t(1, 5, "2026-09-01T15:00:00Z"), t(2, 3)], "2026-10-20", { valorDe, diasRestantes: 9, entrega: "2026-10-28" }).proyeccion, null);
  check("con todo terminado, la proyección dice terminado",
    calcularRitmo([t(1, 5, "2026-10-19T15:00:00Z")], "2026-10-20", { valorDe, diasRestantes: 9, entrega: "2026-10-28" }).proyeccion,
    { terminado: true, fin: null, llegaALaEntrega: true, alaEntrega: 20 });
  check("una terminada sin fecha no entra en el ritmo",
    calcularRitmo([{ id: 1, puntos: 5, terminada: true, terminadaEl: null }, t(2, 3)], "2026-10-20", { valorDe, diasRestantes: 9, entrega: "2026-10-28" }).tareasTerminadas, 0);
}

console.log("Horas con costo por hora");
{
  const alcance = { valor: { total: 100, terminado: 60, enCurso: 20, pendiente: 20 } };
  const h = horasInvertidas(alcance, { ...EQUIPO, cliente: { ...EQUIPO.cliente, costoPorHora: 1500, moneda: "ARS" } }, "horas");
  check("las horas pasan a plata", h.plata, { moneda: "ARS", porHora: 1500, justificadas: 90000, comprometidas: 150000, minimo: 120000 });
  check("justificadas por encima del mínimo: no falta nada", horasInvertidas({ valor: { total: 100, terminado: 90, enCurso: 0, pendiente: 10 } }, EQUIPO, "horas").faltanParaElMinimo, 0);
}

console.log("OKR y riesgos sueltos");
{
  const base = {
    alcance: { valor: { pct: 100 }, tareas: { pct: 100 } },
    funcionalidades: { total: 3, entregadas: 3, pct: 100 },
    horas: { minimo: 680, justificadas: 700, configurado: true },
    plan: { pct: 100 },
    ritmo: { porDia: 0, proyeccion: { terminado: true, alaEntrega: 700 }, restante: 0 },
    mvp: { configurada: true, vencida: false, diasRestantes: 3 },
    cliente: { avanceContraElPlanMin: 90 },
    unidad: "horas",
  };
  check("todo entregado: los cuatro se cumplen", okrsDelCliente(base).map((o) => o.cumple), [true, true, true, true]);
  check("sin meta del plan ni mínimo de horas: sin juzgar", okrsDelCliente({ ...base, horas: { ...base.horas, minimo: null }, cliente: { avanceContraElPlanMin: null } }).map((o) => o.cumple), [true, true, null, null]);
  const riesgos = riesgosDelMvp({
    mvp: { configurada: true, vencida: false, inicio: "2026-10-01", hoy: "2026-10-24", ultimoFin: "2026-10-21", enCurso: null, sprints: [], entrega: "2026-10-28" },
    ritmo: { restante: 10, proyeccion: null, dias: 14 },
    horas: { configurado: true, minimo: 80, justificadas: 90 },
    entregas: [],
    alcance: { sinEstimar: 0 },
    tareas: [],
    unidad: "horas",
  });
  check("sin ritmo y sin sprint en curso", riesgos.map((x) => [x.clave, x.nivel]), [["sin-ritmo", "alto"], ["sin-sprint-en-curso", "medio"]]);
}

console.log(`\n${ok} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
