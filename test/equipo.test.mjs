// Tests de lib/kpis/equipo.js y de la normalizacion de data/equipo.json.
// Sin framework: node los corre directo con `npm test`.
//
// Las tareas tienen la forma interna que arma performance.js (ya traducidas);
// armarReporte se prueba al final con payloads con forma de Shortcut para
// cubrir el enganche (`tipo` y `comprometida`).

import {
  armarEquipo,
  bugsRatio,
  cargaPorIntegrante,
  distribucionPorRol,
  evaluarOkrs,
  horasPorIntegrante,
  wipPorRol,
  EQUIPO_VACIO,
  SIN_ASIGNAR,
  SIN_ROL,
} from "../lib/kpis/equipo.js";
import { normalizarEquipo } from "../lib/equipo.js";
import { armarReporte } from "../lib/kpis/performance.js";

let ok = 0, fail = 0;
const check = (nombre, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log("  OK   " + nombre); }
  else { fail++; console.log("  FALLA " + nombre + "\n        real:     " + a + "\n        esperado: " + b); }
};

// ---- datos ----------------------------------------------------------------

const EQUIPO = {
  horasPorPunto: 4,
  wipMaxPorPersona: 2,
  metas: { bugsRatioMax: 0.25, efectividadMin: 80, utilizacionMin: 70, utilizacionMax: 90 },
  integrantes: [
    { nombre: "Ana", rol: "Dev", horasSemanales: 20 },
    { nombre: "Beto", rol: "Dev", horasSemanales: 10 },
    { nombre: "Caro", rol: "QA", horasSemanales: null },
    { nombre: "Dani", rol: null, horasSemanales: 5 },
  ],
};

// Sprint de 14 dias = 2 semanas.
const SPRINT = { id: 29, inicio: "2026-09-23", fin: "2026-10-06", diasTotales: 14, diasRestantes: 7 };

let siguienteId = 1;
const tarea = (o = {}) => ({
  id: siguienteId++,
  titulo: "Tarea",
  tipo: "feature",
  estado: "To Do",
  etapa: "Pendiente",
  terminada: false,
  puntos: null,
  responsables: [],
  historia: null,
  ingresoEl: "2026-09-22T12:00:00Z",
  comprometida: true,
  ...o,
});
const enCurso = (o = {}) => tarea({ estado: "In Progress", etapa: "En curso", ...o });
const terminada = (o = {}) => tarea({ estado: "Done", etapa: "Terminado", terminada: true, ...o });

// ---- distribucion por rol -------------------------------------------------

console.log("Distribución por rol");
{
  const tareas = [
    terminada({ puntos: 3, responsables: ["Ana"] }),
    enCurso({ puntos: 2, responsables: ["Ana", "Beto"] }), // dos devs: cuenta una vez para Dev
    tarea({ puntos: 5, responsables: ["Caro"] }),
    tarea({ puntos: 1, responsables: ["Dani"] }), // sin rol
    tarea({ puntos: 2, responsables: ["Ana", "Caro"] }), // Dev y QA: compartida entre roles
    tarea({ puntos: null }), // sin asignar
  ];
  const r = distribucionPorRol(tareas, EQUIPO);
  check("orden fijo de roles y totales", r.grupos.map((g) => [g.rol, g.integrantes, g.tareas, g.puntos]), [
    ["Dev", 2, 3, 7],
    ["QA", 1, 2, 7],
    [SIN_ROL, 1, 1, 1],
    [SIN_ASIGNAR, 0, 1, 0],
  ]);
  check("porcentajes sobre el total del sprint", r.grupos.map((g) => [g.pctTareas, g.pctPuntos]), [
    [50, 53.8],
    [33.3, 53.8],
    [16.7, 7.7],
    [16.7, 0],
  ]);
  check("terminadas por rol", r.grupos[0].terminadas, 1);
  check("compartidas entre roles: solo la Dev+QA", [r.compartidas, r.totalTareas, r.totalPuntos], [1, 6, 13]);
  check("UX configurado sin gente ni tareas no aparece", r.grupos.some((g) => g.rol === "UX"), false);
  check("sin tareas: solo los roles configurados, en 0",
    distribucionPorRol([], EQUIPO).grupos.map((g) => [g.rol, g.tareas]),
    [["Dev", 0], ["QA", 0], [SIN_ROL, 0]]);
}

// ---- WIP por rol ------------------------------------------------------------

console.log("WIP por rol");
{
  const tareas = [
    enCurso({ responsables: ["Caro"] }),
    enCurso({ responsables: ["Caro"], estado: "In Review" }),
    enCurso({ responsables: ["Caro"], estado: "In Review" }),
    enCurso({ responsables: ["Ana"] }),
    terminada({ responsables: ["Ana"] }), // terminada no es WIP
    tarea({ responsables: ["Beto"] }), // pendiente no es WIP
    enCurso({ responsables: [] }),
  ];
  const r = wipPorRol(tareas, EQUIPO);
  const qa = r.grupos.find((g) => g.rol === "QA");
  check("QA: 3 en curso, 1 persona, sobrecargada con máximo 2", [qa.enCurso, qa.personasActivas, qa.porPersona, qa.sobrecargado], [3, 1, 3, true]);
  check("QA: por columna", qa.porEstado, [{ estado: "In Progress", tareas: 1 }, { estado: "In Review", tareas: 2 }]);
  check("QA: la persona tapada", qa.personas, [{ nombre: "Caro", enCurso: 3, sobrecargada: true }]);
  const dev = r.grupos.find((g) => g.rol === "Dev");
  check("Dev: 1 en curso, Beto no cuenta porque no tiene nada en curso", [dev.enCurso, dev.personasActivas, dev.sobrecargado], [1, 1, false]);
  check("sin asignar en curso se ve", r.grupos.find((g) => g.rol === SIN_ASIGNAR).enCurso, 1);
  check("el máximo configurado viaja", r.maximoPorPersona, 2);
  check("sin tareas: roles configurados en 0 y sin 'Sin asignar'",
    wipPorRol([], EQUIPO).grupos.map((g) => [g.rol, g.enCurso]),
    [["Dev", 0], ["QA", 0], [SIN_ROL, 0]]);
}

// ---- carga por integrante ---------------------------------------------------

console.log("Carga por integrante");
{
  const tareas = [
    terminada({ puntos: 3, responsables: ["Ana"] }),
    enCurso({ puntos: 2, responsables: ["Ana", "Beto"] }),
    tarea({ puntos: null, responsables: ["Beto"] }),
    tarea({ puntos: 8, responsables: ["Zoe"] }), // no está en la configuración
    tarea({ puntos: 1 }),
  ];
  const r = cargaPorIntegrante(tareas, EQUIPO);
  check("de más a menos puntos, con rol y los configurados sin carga en 0",
    r.personas.map((p) => [p.nombre, p.rol, p.tareas, p.puntos, p.configurada]),
    [["Zoe", SIN_ROL, 1, 8, false], ["Ana", "Dev", 2, 5, true], ["Beto", "Dev", 2, 2, true], ["Caro", "QA", 0, 0, true], ["Dani", SIN_ROL, 0, 0, true]]);
  check("Ana: 1 terminada (3 pts), 1 en curso", [r.personas[1].terminadas, r.personas[1].puntosTerminados, r.personas[1].enCurso], [1, 3, 1]);
  check("Beto: una sin estimar", r.personas[2].sinEstimar, 1);
  check("sin asignar aparte", r.sinAsignar, { tareas: 1, puntos: 1 });
  check("quien no está en equipo.json se informa", r.sinConfigurar, ["Zoe"]);
}

// ---- horas ------------------------------------------------------------------

console.log("Horas pactadas, utilización y efectividad");
{
  const tareas = [
    terminada({ puntos: 5, responsables: ["Ana"] }), // comprometida y hecha
    enCurso({ puntos: 5, responsables: ["Ana"] }), // comprometida, no hecha
    tarea({ puntos: 2, responsables: ["Ana"], comprometida: false }), // agregada
    terminada({ puntos: 4, responsables: ["Beto"] }),
    tarea({ puntos: 3, responsables: ["Caro"] }), // sin horas pactadas
  ];
  const r = horasPorIntegrante(tareas, SPRINT, EQUIPO);
  check("2 semanas, factor 4", [r.configurado, r.semanas, r.horasPorPunto], [true, 2, 4]);
  const ana = r.personas.find((p) => p.nombre === "Ana");
  check("Ana: capacidad 40, demanda 48, extras 8, utilización 120%",
    [ana.capacidad, ana.demanda, ana.dentroDeLoPactado, ana.extras, ana.utilizacion], [40, 48, 40, 8, 120]);
  check("Ana: hechas 20 sobre 40 comprometidas = 50%", [ana.hechas, ana.comprometidas, ana.efectividad], [20, 40, 50]);
  const beto = r.personas.find((p) => p.nombre === "Beto");
  check("Beto: capacidad 20, demanda 16, sin extras, 80% utilización, 100% efectividad",
    [beto.capacidad, beto.demanda, beto.extras, beto.utilizacion, beto.efectividad], [20, 16, 0, 80, 100]);
  const caro = r.personas.find((p) => p.nombre === "Caro");
  check("Caro: sin horas pactadas no tiene capacidad ni utilización, pero sí demanda", [caro.capacidad, caro.utilizacion, caro.extras, caro.demanda], [null, null, null, 12]);
  check("equipo: solo quien tiene capacidad entra en utilización",
    [r.equipo.capacidad, r.equipo.demanda, r.equipo.extras, r.equipo.utilizacion, r.equipo.conSobrecarga], [70, 64, 8, 91.4, 1]);
  check("equipo: efectividad sobre todos", [r.equipo.hechas, r.equipo.comprometidas, r.equipo.efectividad], [36, 68, 52.9]);
  check("se informa quién no tiene horas (Dani tiene 5)", r.sinHoras, ["Caro"]);
  check("sin horasPorPunto no se calcula nada", horasPorIntegrante(tareas, SPRINT, EQUIPO_VACIO), { configurado: false, semanas: null, personas: [], equipo: null, sinHoras: [] });
}

// ---- bugs ratio -------------------------------------------------------------

console.log("Bugs ratio");
{
  const tareas = [
    terminada({ id: 1 }), // historia terminada
    terminada({ id: 2 }), // historia terminada
    terminada({ id: 3, historia: { id: 1, titulo: "Tarea" } }), // subtarea: no es historia
    tarea({ id: 4 }), // historia pendiente
    tarea({ tipo: "bug", ingresoEl: "2026-09-25T15:00:00Z" }), // abierto en el sprint
    terminada({ tipo: "bug", ingresoEl: "2026-10-06T23:00:00Z" }), // último día en BA (20:00): cuenta
    tarea({ tipo: "bug", ingresoEl: "2026-09-10T12:00:00Z" }), // de antes del sprint: no cuenta como abierto
  ];
  const r = bugsRatio(tareas, SPRINT);
  check("2 bugs abiertos en el sprint sobre 2 historias terminadas = 1", [r.bugs, r.bugsAbiertosEnSprint, r.bugsTerminados, r.historiasTerminadas, r.historias, r.ratio], [3, 2, 1, 2, 3, 1]);
  check("sin historias terminadas el ratio es null", bugsRatio([tarea({ tipo: "bug", ingresoEl: "2026-09-25T15:00:00Z" })], SPRINT).ratio, null);
  check("un tercio se redondea a dos decimales", bugsRatio([terminada(), terminada(), terminada(), tarea({ tipo: "bug", ingresoEl: "2026-09-25T15:00:00Z" })], SPRINT).ratio, 0.33);
}

// ---- OKRs -------------------------------------------------------------------

console.log("OKRs");
{
  const metas = EQUIPO.metas;
  const okrs = evaluarOkrs({ bugs: { ratio: 0.2 }, horas: { equipo: { efectividad: 85, utilizacion: 95 } } }, metas);
  check("claves y cumplimiento", okrs.map((o) => [o.clave, o.valor, o.cumple]), [["bugsRatio", 0.2, true], ["efectividad", 85, true], ["utilizacion", 95, false]]);
  check("metas en texto", okrs.map((o) => o.descripcionMeta), ["como mucho 0.25", "al menos 80%", "entre 70% y 90%"]);
  const sinDatos = evaluarOkrs({ bugs: { ratio: null }, horas: { equipo: null } }, metas);
  check("sin valor no se puede decir si cumple", sinDatos.map((o) => o.cumple), [null, null, null]);
  const sinMetas = evaluarOkrs({ bugs: { ratio: 0.2 }, horas: { equipo: { efectividad: 85, utilizacion: 80 } } }, EQUIPO_VACIO.metas);
  check("sin meta tampoco", sinMetas.map((o) => [o.cumple, o.descripcionMeta]), [[null, null], [null, null], [null, null]]);
}

// ---- configuración ------------------------------------------------------------

console.log("Normalización de data/equipo.json");
{
  const r = normalizarEquipo({
    horasPorPunto: 4,
    wipMaxPorPersona: "tres",
    metas: { bugsRatioMax: 0.25, efectividadMin: -1 },
    integrantes: [
      { nombre: " Ana ", rol: "Dev", horasSemanales: 20 },
      { nombre: "Ana", rol: "QA" },
      { nombre: "", rol: "Dev" },
      { nombre: "Beto", rol: "Tester", horasSemanales: "10" },
      { nombre: "Caro" },
    ],
  });
  check("lo válido se normaliza, lo inválido cae al default", [r.datos.horasPorPunto, r.datos.wipMaxPorPersona, r.datos.metas], [4, 3, { bugsRatioMax: 0.25, efectividadMin: null, utilizacionMin: null, utilizacionMax: null }]);
  check("integrantes: recortados, sin repetidos, rol y horas inválidos a null", r.datos.integrantes, [
    { nombre: "Ana", rol: "Dev", horasSemanales: 20 },
    { nombre: "Beto", rol: null, horasSemanales: null },
    { nombre: "Caro", rol: null, horasSemanales: null },
  ]);
  check("cada problema queda anotado", r.problemas.map((p) => p.campo), ["wipMaxPorPersona", "metas.efectividadMin", "integrantes[1].nombre", "integrantes[2].nombre", "integrantes[3].rol", "integrantes[3].horasSemanales"]);
  check("raíz que no es objeto", normalizarEquipo([]).problemas.length, 1);
  check("sin integrantes se avisa", normalizarEquipo({ horasPorPunto: 4 }).problemas.map((p) => p.campo), ["integrantes"]);
}

// ---- enganche con armarReporte ------------------------------------------------

console.log("armarReporte publica `equipo`");
{
  const TO_DO = 7, DONE = 10;
  const WORKFLOW = { id: 5, name: "Standard", states: [
    { id: TO_DO, name: "To Do", type: "unstarted", position: 1 },
    { id: DONE, name: "Done", type: "done", position: 4 },
  ] };
  const MIEMBROS = [{ id: "u-ana", profile: { name: "Ana", mention_name: "ana" } }];
  const story = (o) => ({
    id: 1, name: "Tarea", app_url: "", archived: false, workflow_id: 5, workflow_state_id: TO_DO,
    started: false, completed: false, estimate: null, epic_id: null, owner_ids: ["u-ana"],
    parent_story_id: null, iteration_id: 29, created_at: "2026-09-20T12:00:00Z", updated_at: "2026-09-20T12:00:00Z",
    started_at: null, started_at_override: null, completed_at: null, completed_at_override: null, story_type: "feature", ...o,
  });
  const iteracion = { id: 29, name: "Sprint 1", status: "started", start_date: "2026-09-23", end_date: "2026-10-07", app_url: "" };
  const reporte = armarReporte(
    {
      iteraciones: [iteracion], iteracion,
      stories: [
        story({ id: 1, estimate: 5, workflow_state_id: DONE, started: true, completed: true, started_at: "2026-09-24T12:00:00Z", completed_at: "2026-09-25T12:00:00Z" }),
        story({ id: 2, estimate: 3, created_at: "2026-09-30T12:00:00Z" }), // entró después: agregada
        story({ id: 3, story_type: "bug", created_at: "2026-09-26T12:00:00Z" }),
      ],
      workflows: [WORKFLOW], miembros: MIEMBROS, epics: [], historiales: {}, movidas: null,
    },
    { ahora: new Date("2026-09-30T15:00:00Z"), equipo: { ...EQUIPO, integrantes: [{ nombre: "Ana", rol: "Dev", horasSemanales: 10 }] } }
  );
  const e = reporte.equipo;
  check("tipo viaja: 1 bug abierto en el sprint sobre 1 historia terminada", [e.bugs.bugsAbiertosEnSprint, e.bugs.historiasTerminadas, e.bugs.ratio], [1, 1, 1]);
  check("comprometida viaja: 5 pts comprometidos (la agregada no), 5 hechos", [e.horas.personas[0].comprometidas, e.horas.personas[0].hechas, e.horas.personas[0].efectividad], [20, 20, 100]);
  check("capacidad de 15 días a 10 h/semana", [e.horas.semanas, e.horas.personas[0].capacidad, e.horas.personas[0].demanda], [2.1, 21, 32]);
  check("por rol", e.porRol.grupos.map((g) => [g.rol, g.tareas]), [["Dev", 3]]);
  check("configuración resumida", [e.configuracion.integrantes, e.configuracion.sinRol, e.configuracion.sinHoras, e.configuracion.fueraDeLaConfiguracion], [1, [], [], []]);
  check("sin configuración: todo sin rol y horas sin calcular",
    (() => { const r = armarReporte({ iteraciones: [iteracion], iteracion, stories: [story({})], workflows: [WORKFLOW], miembros: MIEMBROS, epics: [], historiales: {}, movidas: null }, { ahora: new Date("2026-09-30T15:00:00Z") }).equipo; return [r.porRol.grupos[0].rol, r.horas.configurado, r.okrs.map((o) => o.cumple)]; })(),
    [SIN_ROL, false, [null, null, null]]);
}

console.log(`\n${ok} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
