// Tests de lib/kpis/equipo.js y de la normalizacion de data/equipo.json.
// Sin framework: node los corre directo con `npm test`.
//
// Las tareas tienen la forma interna que arma performance.js (ya traducidas);
// armarReporte se prueba al final con payloads con forma de Shortcut para
// cubrir el enganche (`tipo` y las horas prorrateadas por proyecto).

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

const ESCALA = [
  { puntos: 1, horas: 2 },
  { puntos: 2, horas: 4 },
  { puntos: 3, horas: 8 },
  { puntos: 5, horas: 15 },
  { puntos: 8, horas: 25 },
];
const EQUIPO = {
  escalaDeHoras: ESCALA,
  wipMaxPorPersona: 2,
  horasPactadas: { porIntegrante: null, finDelProyecto: null },
  metas: { bugsRatioMax: 0.25, retrabajoMax: 10, efectividadMin: 80, utilizacionMin: 70, utilizacionMax: 90 },
  integrantes: [
    { nombre: "Ana", rol: "Dev", detalle: null, horasPactadas: 40 },
    { nombre: "Beto", rol: "Dev", detalle: null, horasPactadas: 20 },
    { nombre: "Caro", rol: "QA", detalle: null, horasPactadas: null },
    { nombre: "Dani", rol: null, detalle: null, horasPactadas: 10 },
  ],
};

// Sprint de 14 dias que es todo el proyecto: las horas pactadas entran enteras.
const SPRINT = { id: 29, inicio: "2026-09-23", fin: "2026-10-06", diasTotales: 14, diasRestantes: 7, diasParaEmpezar: 0, diasDelProyecto: 14 };

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
  check("de más a menos puntos, con rol y los configurados sin carga en 0; la compartida reparte 1 y 1",
    r.personas.map((p) => [p.nombre, p.rol, p.tareas, p.puntos, p.configurada]),
    [["Zoe", SIN_ROL, 1, 8, false], ["Ana", "Dev", 2, 4, true], ["Beto", "Dev", 2, 1, true], ["Caro", "QA", 0, 0, true], ["Dani", SIN_ROL, 0, 0, true]]);
  check("Ana: 1 terminada (3 pts), 1 en curso", [r.personas[1].terminadas, r.personas[1].puntosTerminados, r.personas[1].enCurso], [1, 3, 1]);
  check("una reunión de 8 puntos con 10 personas suma 0.8 a cada una",
    cargaPorIntegrante([tarea({ puntos: 8, responsables: ["Ana", "Beto", "Caro", "Dani", "E", "F", "G", "H", "I", "J"] })], EQUIPO).personas.map((p) => p.puntos),
    Array(10).fill(0.8));
  check("Beto: una sin estimar", r.personas[2].sinEstimar, 1);
  check("sin asignar aparte", r.sinAsignar, { tareas: 1, puntos: 1 });
  check("quien no está en equipo.json se informa", r.sinConfigurar, ["Zoe"]);
}

// ---- horas ------------------------------------------------------------------

console.log("Horas pactadas, utilización y efectividad");
{
  const tareas = [
    terminada({ puntos: 5, responsables: ["Ana"] }),
    enCurso({ puntos: 5, responsables: ["Ana"] }),
    tarea({ puntos: 2, responsables: ["Ana"] }),
    terminada({ puntos: 2, responsables: ["Beto"] }),
    tarea({ puntos: 3, responsables: ["Caro"] }), // sin horas pactadas
  ];
  const r = horasPorIntegrante(tareas, SPRINT, EQUIPO);
  check("el sprint es todo el proyecto: 14 de 14 días, con escala", [r.configurado, r.diasDelPeriodo, r.diasDelProyecto, r.escala], [true, 14, 14, ESCALA]);
  const ana = r.personas.find((p) => p.nombre === "Ana");
  // 5+5+2 puntos → 15+15+4 h. Cabe en las 40 h de capacidad.
  check("Ana: capacidad 40, demanda 34, sin extras, utilización 85%",
    [ana.capacidad, ana.demanda, ana.dentroDeLoPactado, ana.extras, ana.utilizacion], [40, 34, 34, 0, 85]);
  check("Ana: hechas 15 sobre 34 asignadas = 44.1%", [ana.hechas, ana.efectividad], [15, 44.1]);
  const beto = r.personas.find((p) => p.nombre === "Beto");
  check("Beto: capacidad 20, demanda 4, sin extras, 20% utilización, 100% efectividad",
    [beto.capacidad, beto.demanda, beto.extras, beto.utilizacion, beto.efectividad], [20, 4, 0, 20, 100]);
  const caro = r.personas.find((p) => p.nombre === "Caro");
  check("Caro: sin horas pactadas no tiene capacidad ni utilización, pero sí demanda", [caro.capacidad, caro.utilizacion, caro.extras, caro.demanda], [null, null, null, 8]);
  check("equipo: solo quien tiene capacidad entra en utilización",
    [r.equipo.capacidad, r.equipo.demanda, r.equipo.extras, r.equipo.utilizacion, r.equipo.conSobrecarga], [70, 38, 0, 54.3, 0]);
  check("equipo: efectividad sobre las horas asignadas a todos", [r.equipo.hechas, r.equipo.asignadas, r.equipo.efectividad], [19, 46, 41.3]);
  check("se informa quién no tiene horas (Dani tiene 10)", r.sinHoras, ["Caro"]);
  const compartida = horasPorIntegrante(
    [tarea({ puntos: 3, responsables: ["Ana", "Beto"] }), tarea({ puntos: 4, responsables: ["Ana"] })],
    SPRINT,
    EQUIPO
  );
  check("3 puntos compartidos son 8 h, 4 h cada uno; un 4 fuera de la escala no suma", [
    compartida.personas.find((p) => p.nombre === "Ana").demanda,
    compartida.personas.find((p) => p.nombre === "Beto").demanda,
  ], [4, 4]);
  check("sin escala no se calcula nada", horasPorIntegrante(tareas, SPRINT, EQUIPO_VACIO), {
    configurado: false, horasPactadasPorIntegrante: null, diasDelPeriodo: 14, diasDelProyecto: 14, reparto: { fin: null, configurado: false }, personas: [], equipo: null, sinHoras: [],
  });
  // Un sprint de 14 dias en un proyecto de 28 vale la mitad de las horas pactadas.
  const mitad = horasPorIntegrante(tareas, { ...SPRINT, diasDelProyecto: 28 }, EQUIPO);
  check("la capacidad se prorratea por los días del proyecto", [mitad.personas.find((p) => p.nombre === "Ana").capacidad, mitad.equipo.capacidad], [20, 35]);
  // La cifra por defecto cubre a quien no tiene la suya.
  const conDefecto = horasPorIntegrante(tareas, SPRINT, { ...EQUIPO, horasPactadas: { porIntegrante: 100, finDelProyecto: null } });
  check("con horas por defecto, Caro tiene capacidad y nadie queda sin horas", [conDefecto.personas.find((p) => p.nombre === "Caro").capacidad, conDefecto.sinHoras], [100, []]);
  // Quien no esta en data/equipo.json no recibe las horas por defecto.
  const conAjeno = horasPorIntegrante([...tareas, tarea({ puntos: 1, responsables: ["Zoe"] })], SPRINT, { ...EQUIPO, horasPactadas: { porIntegrante: 100, finDelProyecto: null } });
  // Ana 40, Beto 20 y Dani 10 tienen las suyas; Caro toma las 100 por defecto; Zoe, ninguna.
  check("una persona fuera de la configuración no suma horas que nadie pactó", [conAjeno.personas.find((p) => p.nombre === "Zoe").capacidad, conAjeno.sinHoras, conAjeno.equipo.capacidad], [null, ["Zoe"], 170]);
  // Los dias propios del periodo mandan sobre su calendario.
  const propios = horasPorIntegrante(tareas, { ...SPRINT, diasParaHoras: 7 }, EQUIPO);
  check("con 7 días propios de 14 del proyecto, la capacidad es la mitad", [propios.diasDelPeriodo, propios.personas.find((p) => p.nombre === "Ana").capacidad], [7, 20]);
  // Lo planificado que se movio a otro sprint entra en las asignadas.
  const conMovidas = horasPorIntegrante(tareas, SPRINT, EQUIPO, { movidas: [tarea({ puntos: 5, responsables: ["Ana"] }), tarea({ puntos: 2, responsables: ["Zoe"] })] });
  const anaConMovidas = conMovidas.personas.find((p) => p.nombre === "Ana");
  check("Ana: 34 h de demanda y 49 h asignadas con su movida: 30.6 % de efectividad", [anaConMovidas.demanda, anaConMovidas.asignadas, anaConMovidas.efectividad], [34, 49, 30.6]);
  check("equipo: 46 h más la movida de Ana (15 h) y la de Zoe (4 h) = 65 h asignadas", [conMovidas.equipo.demanda, conMovidas.equipo.asignadas, conMovidas.equipo.efectividad], [38, 65, 29.2]);
  check("el reparto viaja", horasPorIntegrante(tareas, { ...SPRINT, finDelReparto: "2026-12-05", repartoConfigurado: true }, EQUIPO).reparto, { fin: "2026-12-05", configurado: true });
  // Antes de empezar no hay nada hecho que medir.
  const futuro = horasPorIntegrante(tareas, { ...SPRINT, diasRestantes: 14, diasParaEmpezar: 3 }, EQUIPO);
  check("periodo que no empezó: efectividad sin dato", [futuro.equipo.efectividad, futuro.personas[0].efectividad], [null, null]);
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
  const sinRegistro = bugsRatio([terminada(), terminada()], SPRINT, { bugsRegistrados: 0 });
  check("sin ningún bug en el workspace: sin dato, no un 0 que parece cumplir", [sinRegistro.ratio, sinRegistro.sinRegistro], [null, true]);
  check("con bugs en el workspace (aunque ninguno en el periodo) el 0 es un 0", [bugsRatio([terminada()], SPRINT, { bugsRegistrados: 3 }).ratio, bugsRatio([terminada()], SPRINT, { bugsRegistrados: 3 }).sinRegistro], [0, false]);
  check("si la búsqueda no se pudo hacer, se calcula con lo que hay", bugsRatio([terminada()], SPRINT, { bugsRegistrados: null }).ratio, 0);
  check("el OKR sin registro queda sin valor y sin cumplir ni incumplir",
    evaluarOkrs({ bugs: sinRegistro, horas: { equipo: null } }, EQUIPO.metas).map((o) => [o.clave, o.valor, o.cumple])[0],
    ["bugsRatio", null, null]);
}

// ---- OKRs -------------------------------------------------------------------

console.log("OKRs");
{
  const metas = EQUIPO.metas;
  const okrs = evaluarOkrs({ bugs: { ratio: 0.2 }, retrabajo: { pct: 12.5 }, horas: { equipo: { efectividad: 85, utilizacion: 95 } } }, metas);
  check("claves y cumplimiento, en el orden de la pantalla: calidad primero", okrs.map((o) => [o.clave, o.valor, o.cumple]), [["bugsRatio", 0.2, true], ["retrabajo", 12.5, false], ["efectividad", 85, true], ["utilizacion", 95, false]]);
  check("metas en texto", okrs.map((o) => o.descripcionMeta), ["como mucho 0.25", "como mucho 10%", "al menos 80%", "entre 70% y 90%"]);
  check("retrabajo justo en la meta: cumple", evaluarOkrs({ bugs: { ratio: null }, retrabajo: { pct: 10 }, horas: { equipo: null } }, metas)[1].cumple, true);
  check("sin tareas cerradas el retrabajo no tiene valor", evaluarOkrs({ bugs: { ratio: null }, retrabajo: { pct: null }, horas: { equipo: null } }, metas)[1], { clave: "retrabajo", nombre: "Retrabajo", valor: null, meta: 10, descripcionMeta: "como mucho 10%", cumple: null });
  const sinDatos = evaluarOkrs({ bugs: { ratio: null }, horas: { equipo: null } }, metas);
  check("sin valor no se puede decir si cumple (sin el cálculo del retrabajo, tampoco)", sinDatos.map((o) => o.cumple), [null, null, null, null]);
  const sinMetas = evaluarOkrs({ bugs: { ratio: 0.2 }, retrabajo: { pct: 3.4 }, horas: { equipo: { efectividad: 85, utilizacion: 80 } } }, EQUIPO_VACIO.metas);
  check("sin meta tampoco", sinMetas.map((o) => [o.cumple, o.descripcionMeta]), [[null, null], [null, null], [null, null], [null, null]]);
  check("metas armadas sin retrabajoMax: el OKR queda sin meta, no se rompe",
    evaluarOkrs({ bugs: { ratio: 0.2 }, retrabajo: { pct: 3.4 }, horas: { equipo: null } }, { bugsRatioMax: 0.25, efectividadMin: 80, utilizacionMin: 70, utilizacionMax: 90 })[1],
    { clave: "retrabajo", nombre: "Retrabajo", valor: 3.4, meta: null, descripcionMeta: null, cumple: null });
}

// ---- configuración ------------------------------------------------------------

console.log("Normalización de data/equipo.json");
{
  const r = normalizarEquipo({
    escalaDeHoras: [
      { puntos: 8, horas: 25 },
      { puntos: 1, horas: 2 },
      { puntos: 1, horas: 9 },
      { puntos: 0, horas: 4 },
    ],
    wipMaxPorPersona: "tres",
    horasPactadas: { porIntegrante: 150, finDelProyecto: "2026-12-05" },
    metas: { bugsRatioMax: 0.25, retrabajoMax: 10, efectividadMin: -1 },
    integrantes: [
      { nombre: " Ana ", rol: "Dev", detalle: " BA ", horasPactadas: 120 },
      { nombre: "Ana", rol: "QA" },
      { nombre: "", rol: "Dev" },
      { nombre: "Beto", rol: "Tester", horasPactadas: "10" },
      { nombre: "Caro" },
    ],
  });
  check("lo válido se normaliza, lo inválido cae al default", [r.datos.escalaDeHoras, r.datos.wipMaxPorPersona, r.datos.horasPactadas, r.datos.metas], [[{ puntos: 1, horas: 2 }, { puntos: 8, horas: 25 }], 3, { porIntegrante: 150, finDelProyecto: "2026-12-05" }, { bugsRatioMax: 0.25, retrabajoMax: 10, efectividadMin: null, utilizacionMin: null, utilizacionMax: null }]);
  check("integrantes: recortados, sin repetidos, rol y horas inválidos a null", r.datos.integrantes, [
    { nombre: "Ana", rol: "Dev", detalle: "BA", horasPactadas: 120 },
    { nombre: "Beto", rol: null, detalle: null, horasPactadas: null },
    { nombre: "Caro", rol: null, detalle: null, horasPactadas: null },
  ]);
  check("cada problema queda anotado", r.problemas.map((p) => p.campo), ["escalaDeHoras[2].puntos", "escalaDeHoras[3]", "wipMaxPorPersona", "metas.efectividadMin", "integrantes[1].nombre", "integrantes[2].nombre", "integrantes[3].rol", "integrantes[3].horasPactadas"]);
  check("raíz que no es objeto", normalizarEquipo([]).problemas.length, 1);
  check("sin integrantes se avisa", normalizarEquipo({ escalaDeHoras: ESCALA }).problemas.map((p) => p.campo), ["integrantes"]);
  check("horasPactadas o metas que no son un objeto se anotan",
    (() => { const n = normalizarEquipo({ escalaDeHoras: ESCALA, horasPactadas: 150, metas: 80, integrantes: [] }); return [n.problemas.map((p) => p.campo), n.datos.horasPactadas.porIntegrante]; })(),
    [["horasPactadas", "metas"], null]);
  check("un día que no existe (31 de noviembre) no pasa por fecha",
    normalizarEquipo({ escalaDeHoras: ESCALA, horasPactadas: { finDelProyecto: "2026-11-31" }, integrantes: [] }).problemas.map((p) => p.campo),
    ["horasPactadas.finDelProyecto"]);
  check("horas pactadas y fin del proyecto inválidos se anotan y caen al default",
    (() => { const n = normalizarEquipo({ escalaDeHoras: ESCALA, horasPactadas: { porIntegrante: "muchas", finDelProyecto: "diciembre" }, integrantes: [] }); return [n.problemas.map((p) => p.campo), n.datos.horasPactadas]; })(),
    [["horasPactadas.porIntegrante", "horasPactadas.finDelProyecto"], { porIntegrante: null, finDelProyecto: null }]);
  check("cliente: lo que pide del MVP se normaliza",
    normalizarEquipo({ escalaDeHoras: ESCALA, cliente: { horasMinimas: 680, avanceContraElPlanMin: 90, costoPorHora: 12000, moneda: " ARS " }, integrantes: [] }).datos.cliente,
    { horasMinimas: 680, avanceContraElPlanMin: 90, costoPorHora: 12000, moneda: "ARS" });
  check("cliente: sin el bloque, todo en null y sin problemas",
    (() => { const n = normalizarEquipo({ escalaDeHoras: ESCALA, integrantes: [] }); return [n.datos.cliente, n.problemas]; })(),
    [{ horasMinimas: null, avanceContraElPlanMin: null, costoPorHora: null, moneda: null }, []]);
  check("cliente: números inválidos se anotan y quedan en null",
    (() => { const n = normalizarEquipo({ escalaDeHoras: ESCALA, cliente: { horasMinimas: "680", avanceContraElPlanMin: 0, moneda: 5 }, integrantes: [] }); return [n.problemas.map((p) => p.campo), n.datos.cliente]; })(),
    [["cliente.horasMinimas", "cliente.avanceContraElPlanMin", "cliente.moneda"], { horasMinimas: null, avanceContraElPlanMin: null, costoPorHora: null, moneda: null }]);
  check("cliente: un costo por hora sin moneda no se usa y se anota",
    (() => { const n = normalizarEquipo({ escalaDeHoras: ESCALA, cliente: { costoPorHora: 12000 }, integrantes: [] }); return [n.problemas.map((p) => [p.campo, p.motivo]), n.datos.cliente.costoPorHora]; })(),
    [[["cliente.moneda", "falta la moneda del costo por hora: se muestran solo horas"]], null]);
  check("cliente que no es un objeto se anota",
    normalizarEquipo({ escalaDeHoras: ESCALA, cliente: [680], integrantes: [] }).problemas.map((p) => p.campo),
    ["cliente"]);
}

console.log("data/equipo.json del repo es válido");
{
  const { readFileSync } = await import("node:fs");
  const real = normalizarEquipo(JSON.parse(readFileSync(new URL("../data/equipo.json", import.meta.url), "utf8")));
  check("sin problemas", real.problemas, []);
  check("70 h por persona hasta la entrega del MVP", real.datos.horasPactadas, { porIntegrante: 70, finDelProyecto: "2026-10-28" });
  check("el cliente pide 680 h y 90 % de avance contra el plan", [real.datos.cliente.horasMinimas, real.datos.cliente.avanceContraElPlanMin], [680, 90]);
  check("la escala de puntos a horas", real.datos.escalaDeHoras, ESCALA);
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
        story({ id: 2, estimate: 3, created_at: "2026-09-30T12:00:00Z" }), // entró después: planificada igual
        story({ id: 3, story_type: "bug", created_at: "2026-09-26T12:00:00Z" }),
      ],
      workflows: [WORKFLOW], miembros: MIEMBROS, epics: [], historiales: {}, movidas: null,
    },
    { ahora: new Date("2026-09-30T15:00:00Z"), equipo: { ...EQUIPO, integrantes: [{ nombre: "Ana", rol: "Dev", detalle: null, horasPactadas: 30 }] } }
  );
  const e = reporte.equipo;
  check("tipo viaja: 1 bug abierto en el sprint sobre 1 historia terminada", [e.bugs.bugsAbiertosEnSprint, e.bugs.historiasTerminadas, e.bugs.ratio], [1, 1, 1]);
  check("horas: 23 h asignadas, 15 hechas, 65.2% de efectividad", [e.horas.personas[0].demanda, e.horas.personas[0].hechas, e.horas.personas[0].efectividad], [23, 15, 65.2]);
  check("capacidad: 30 h pactadas para un proyecto que es este sprint de 15 días", [e.horas.diasDelPeriodo, e.horas.diasDelProyecto, e.horas.personas[0].capacidad], [15, 15, 30]);
  check("por rol", e.porRol.grupos.map((g) => [g.rol, g.tareas]), [["Dev", 3]]);
  check("configuración resumida", [e.configuracion.integrantes, e.configuracion.sinRol, e.configuracion.sinHoras, e.configuracion.fueraDeLaConfiguracion], [1, [], [], []]);
  check("sin configuración: todo sin rol y horas sin calcular",
    (() => { const r = armarReporte({ iteraciones: [iteracion], iteracion, stories: [story({})], workflows: [WORKFLOW], miembros: MIEMBROS, epics: [], historiales: {}, movidas: null }, { ahora: new Date("2026-09-30T15:00:00Z") }).equipo; return [r.porRol.grupos[0].rol, r.horas.configurado, r.okrs.map((o) => o.cumple)]; })(),
    [SIN_ROL, false, [null, null, null, null]]);
}

console.log(`\n${ok} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
