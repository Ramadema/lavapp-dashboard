// KPIs y OKRs del equipo sobre un periodo, que es un sprint o el proyecto
// entero con todos sus sprints: distribucion por rol, WIP por rol, carga por
// integrante, horas pactadas contra consumidas, bugs sobre historias,
// retrabajo y utilizacion y efectividad por integrante. El retrabajo necesita
// el historial de cada tarea: lo calcula performance.js (calcularRetrabajo) y
// llega hecho, aca solo se evalua contra su meta.
//
// Funciones puras, igual que performance.js: reciben las tareas ya normalizadas
// (lo que arma performance.js, con `tipo`, `responsables`, `puntos`, `etapa`,
// `estado`, `terminada`, `ingresoEl` e `historia`), el periodo (el sprint que
// describe performance.js o el periodo del proyecto que describe proyecto.js,
// los dos con `inicio`, `fin`, `diasTotales`, `diasParaEmpezar` y
// `diasDelProyecto`) y la configuracion de data/equipo.json. Sin fetch, sin
// React, sin process.env.
//
// Shortcut no sabe ni el rol ni las horas de nadie: las dos cosas salen de la
// configuracion, que empareja a cada integrante por su nombre tal como lo
// devuelve /members (el mismo nombre que ya se ve en "Carga por responsable").

import { conUnDecimal, diaLocal, porcentaje, sumar } from "./tiempo.js";

// La configuracion cuando data/equipo.json falta o esta rota: sin horas ni
// metas, nadie con rol. Vive aca y no en lib/equipo.js para que este modulo (y
// la pantalla, que importa sus constantes) no arrastre node:fs al navegador.
export const EQUIPO_VACIO = Object.freeze({
  horasPorPunto: null,
  wipMaxPorPersona: 3,
  horasPactadas: { porIntegrante: null, finDelProyecto: null },
  metas: { bugsRatioMax: null, retrabajoMax: null, efectividadMin: null, utilizacionMin: null, utilizacionMax: null },
  integrantes: [],
});

// @decision 2026-10-18 ramiro@mispichos.com
// Los roles del equipo, como los nombra el equipo: gestion (PM, PO), desarrollo
// (Dev, DevOps), calidad (QA) y diseno (UX). Antes eran UX, Dev, QA y PM; se
// sumaron PO y DevOps porque el equipo los tiene. Quien tiene mas de un
// sombrero (BA y dev, Scrum Master y dev) se agrupa por el principal, el que
// mas tiempo le lleva, y lo demas va en `detalle`, que se muestra pero no
// agrupa.
export const ROLES = ["PM", "PO", "Dev", "DevOps", "QA", "UX"];
export const SIN_ROL = "Sin rol";
export const SIN_ASIGNAR = "Sin asignar";
const ORDEN_ROLES = [...ROLES, SIN_ROL, SIN_ASIGNAR];

// Que es cada cosa, para la insignia y el tooltip de las tarjetas.
export const TIPOS_DE_METRICA = {
  kpi: {
    sigla: "KPI",
    nombre: "Indicador clave",
    ayuda:
      "Un KPI (Key Performance Indicator) es un número que se mira para entender cómo viene el equipo. No tiene una meta acordada: sirve para detectar desbalances y conversar.",
  },
  okr: {
    sigla: "OKR",
    nombre: "Resultado clave",
    ayuda:
      "Un OKR (Objectives and Key Results) es un resultado clave con una meta acordada por el equipo. La tarjeta compara el valor de lo que se está mirando, el sprint o el proyecto entero, contra esa meta y avisa cuando no se cumple. Las metas se cambian en data/equipo.json.",
  },
};

const EQUIPO_SIN_INTEGRANTES = { integrantes: [] };
const ordenDeRol = (rol) => {
  const i = ORDEN_ROLES.indexOf(rol);
  return i === -1 ? ORDEN_ROLES.length : i;
};

function indexarIntegrantes(equipo) {
  return new Map(equipo.integrantes.map((i) => [i.nombre, i]));
}

const rolDe = (integrantes, nombre) => integrantes.get(nombre)?.rol ?? SIN_ROL;

// Los roles de una tarea: uno por responsable, sin repetir. Dos devs en la
// misma tarea la cuentan una sola vez para Dev; sin responsables va a "Sin
// asignar".
function rolesDeTarea(tarea, integrantes) {
  if (tarea.responsables.length === 0) return [SIN_ASIGNAR];
  return [...new Set(tarea.responsables.map((r) => rolDe(integrantes, r)))];
}

// @decision 2026-10-17 ramiro@mispichos.com
// Distribucion por rol: cuantas tareas y puntos tiene cada rol en el periodo. Una
// tarea con responsables de dos roles cuenta entera para cada uno (es la misma
// regla que "Carga por responsable"), asi que los porcentajes pueden sumar mas
// de 100 y se informa cuantas tareas estan en esa situacion. Los roles sin
// nada asignado se listan en 0: "QA no tiene tareas" tambien es un dato.
export function distribucionPorRol(tareas, equipo) {
  const integrantes = indexarIntegrantes(equipo);
  const grupos = new Map();
  const asegurar = (rol) => {
    if (!grupos.has(rol)) {
      grupos.set(rol, { rol, integrantes: 0, tareas: 0, puntos: 0, terminadas: 0, puntosTerminados: 0 });
    }
    return grupos.get(rol);
  };
  for (const i of equipo.integrantes) asegurar(i.rol ?? SIN_ROL).integrantes++;

  let compartidas = 0;
  for (const tarea of tareas) {
    const roles = rolesDeTarea(tarea, integrantes);
    if (roles.length > 1) compartidas++;
    for (const rol of roles) {
      const grupo = asegurar(rol);
      grupo.tareas++;
      grupo.puntos += tarea.puntos ?? 0;
      if (tarea.terminada) {
        grupo.terminadas++;
        grupo.puntosTerminados += tarea.puntos ?? 0;
      }
    }
  }

  const totalTareas = tareas.length;
  const totalPuntos = sumar(tareas.map((t) => t.puntos ?? 0));
  return {
    grupos: [...grupos.values()]
      .filter((g) => g.tareas > 0 || g.integrantes > 0)
      .map((g) => ({
        ...g,
        pctTareas: porcentaje(g.tareas, totalTareas),
        pctPuntos: porcentaje(g.puntos, totalPuntos),
      }))
      .sort((a, b) => ordenDeRol(a.rol) - ordenDeRol(b.rol) || a.rol.localeCompare(b.rol)),
    compartidas,
    totalTareas,
    totalPuntos,
  };
}

// @decision 2026-10-17 ramiro@mispichos.com
// WIP por rol: las tareas en curso (columnas de tipo started: In Progress, In
// Review, Ready for deploy) que tiene cada rol, partidas por columna y por
// persona. Un rol esta sobrecargado cuando alguna de sus personas tiene mas
// tareas en curso que `wipMaxPorPersona`: es el caso "un solo QA con cinco
// tareas en In Review". Se mira por persona y no por promedio, porque el
// promedio esconde justamente a la persona tapada.
export function wipPorRol(tareas, equipo) {
  const integrantes = indexarIntegrantes(equipo);
  const maximo = equipo.wipMaxPorPersona;
  const enCurso = tareas.filter((t) => !t.terminada && t.etapa === "En curso");
  const grupos = new Map();
  const asegurar = (rol) => {
    if (!grupos.has(rol)) grupos.set(rol, { rol, enCurso: 0, porEstado: new Map(), personas: new Map() });
    return grupos.get(rol);
  };
  for (const i of equipo.integrantes) asegurar(i.rol ?? SIN_ROL);

  for (const tarea of enCurso) {
    for (const rol of rolesDeTarea(tarea, integrantes)) {
      const grupo = asegurar(rol);
      grupo.enCurso++;
      grupo.porEstado.set(tarea.estado, (grupo.porEstado.get(tarea.estado) ?? 0) + 1);
      const personas = tarea.responsables.length > 0 ? tarea.responsables : [SIN_ASIGNAR];
      for (const persona of personas) {
        if (rolDe(integrantes, persona) !== rol && persona !== SIN_ASIGNAR) continue;
        grupo.personas.set(persona, (grupo.personas.get(persona) ?? 0) + 1);
      }
    }
  }

  return {
    maximoPorPersona: maximo,
    grupos: [...grupos.values()]
      .map((g) => {
        const personas = [...g.personas]
          .map(([nombre, n]) => ({ nombre, enCurso: n, sobrecargada: n > maximo }))
          .sort((a, b) => b.enCurso - a.enCurso || a.nombre.localeCompare(b.nombre));
        const activas = personas.length;
        return {
          rol: g.rol,
          enCurso: g.enCurso,
          personasActivas: activas,
          porPersona: activas > 0 ? conUnDecimal(g.enCurso / activas) : null,
          porEstado: [...g.porEstado].map(([estado, n]) => ({ estado, tareas: n })),
          sobrecargado: personas.some((p) => p.sobrecargada),
          personas,
        };
      })
      .filter((g) => g.enCurso > 0 || g.rol !== SIN_ASIGNAR)
      .sort((a, b) => ordenDeRol(a.rol) - ordenDeRol(b.rol) || a.rol.localeCompare(b.rol)),
  };
}

// @decision 2026-10-17 ramiro@mispichos.com
// Carga por integrante: los puntos asignados a cada persona en el periodo, con
// su rol. Los integrantes configurados que no tienen
//
// @decision 2026-10-18 ramiro@mispichos.com
// Una tarea compartida reparte sus puntos en partes iguales entre sus
// responsables (una reunion de 8 puntos con 10 personas suma 0.8 a cada una),
// asi la suma de las personas da el total del periodo, salvo redondeo, y las
// horas no se multiplican. Antes contaba entera para cada uno: las 8 reuniones
// del Sprint 1 con 6 y 10 personas inflaban la demanda. La cantidad de tareas
// si cuenta entera para cada una, que es lo que mira "Carga por responsable".
// Los integrantes configurados que no tienen
// nada asignado aparecen en 0: la falta de carga tambien se quiere ver. Las
// personas que estan en Shortcut pero no en data/equipo.json salen como "Sin
// rol" y se informan, para que el equipo complete el archivo.
export function cargaPorIntegrante(tareas, equipo) {
  const integrantes = indexarIntegrantes(equipo);
  const personas = new Map();
  const asegurar = (nombre) => {
    if (!personas.has(nombre)) {
      personas.set(nombre, {
        nombre,
        rol: rolDe(integrantes, nombre),
        detalle: integrantes.get(nombre)?.detalle ?? null,
        configurada: integrantes.has(nombre),
        tareas: 0,
        puntos: 0,
        terminadas: 0,
        puntosTerminados: 0,
        enCurso: 0,
        sinEstimar: 0,
      });
    }
    return personas.get(nombre);
  };
  for (const i of equipo.integrantes) asegurar(i.nombre);

  let sinAsignar = { tareas: 0, puntos: 0 };
  for (const tarea of tareas) {
    if (tarea.responsables.length === 0) {
      sinAsignar.tareas++;
      sinAsignar.puntos += tarea.puntos ?? 0;
      continue;
    }
    const parte = (tarea.puntos ?? 0) / tarea.responsables.length;
    for (const nombre of tarea.responsables) {
      const persona = asegurar(nombre);
      persona.tareas++;
      persona.puntos += parte;
      if (tarea.puntos === null) persona.sinEstimar++;
      if (tarea.terminada) {
        persona.terminadas++;
        persona.puntosTerminados += parte;
      } else if (tarea.etapa === "En curso") persona.enCurso++;
    }
  }

  const lista = [...personas.values()]
    .map((p) => ({ ...p, puntos: conUnDecimal(p.puntos), puntosTerminados: conUnDecimal(p.puntosTerminados) }))
    .sort((a, b) => b.puntos - a.puntos || b.tareas - a.tareas || a.nombre.localeCompare(b.nombre));
  return {
    personas: lista,
    sinAsignar,
    sinConfigurar: lista.filter((p) => !p.configurada).map((p) => p.nombre),
  };
}

// @decision 2026-10-17 ramiro@mispichos.com
// Horas: Shortcut no registra horas, asi que se convierten los puntos con
// `horasPorPunto` de la configuracion.
//
// @decision 2026-10-18 ramiro@mispichos.com
// Las horas pactadas son por persona para todo el proyecto (unas 150 h cada
// uno, `horasPactadas.porIntegrante`, o la cifra propia de un integrante); se
// descarto la cifra semanal. Un periodo recibe la parte que le toca por sus
// dias sobre los del proyecto (un sprint, sus dias propios: ver repartirDias).
// La cifra por defecto es solo para los integrantes de data/equipo.json: quien
// no esta (o una "Persona sin nombre") no suma horas que nadie pacto. Por
// persona:
//   capacidad   = horas pactadas x dias del periodo / dias del proyecto
//   demanda     = puntos asignados (repartidos si la tarea es compartida) x
//                 horas por punto
//   extras      = lo que la demanda excede a la capacidad (0 si no excede)
//   hechas      = puntos terminados x horas por punto
//   asignadas   = demanda + las horas de lo planificado que se movio a otro
//                 sprint (`movidas`, solo en la vista de un sprint)
//   utilizacion = demanda / capacidad      (OKR: entre utilizacionMin y Max)
//   efectividad = hechas / asignadas        (OKR: al menos efectividadMin)
// Antes la efectividad era sobre lo que estaba al cierre del primer dia; ahora
// es sobre todo lo planificado (ver calcularCumplimiento), asi que sacar lo
// pendiente a otro sprint no la sube. Queda sin dato hasta que el periodo
// empieza. Quien no tiene horas pactadas no entra en capacidad ni en
// utilizacion, y se informa. Sin `horasPorPunto` no hay nada que calcular y la
// pantalla lo dice. `reparto` dice hasta cuando se reparten las horas y si esa
// fecha salio de la configuracion.
export function horasPorIntegrante(tareas, periodo, equipo, { movidas = [] } = {}) {
  const { horasPorPunto } = equipo;
  const porIntegrante = equipo.horasPactadas?.porIntegrante ?? null;
  // Los dias propios del periodo (un sprint sin el dia que comparte con el
  // anterior; el proyecto, su calendario) contra los del proyecto entero; sin
  // dato del proyecto, el periodo es todo el proyecto.
  const diasDelPeriodo = periodo.diasParaHoras ?? periodo.diasTotales;
  const diasDelProyecto = periodo.diasDelProyecto ?? diasDelPeriodo;
  const sinCalcular = {
    configurado: false,
    horasPactadasPorIntegrante: porIntegrante,
    diasDelPeriodo,
    diasDelProyecto,
    reparto: { fin: periodo.finDelReparto ?? null, configurado: periodo.repartoConfigurado ?? false },
    personas: [],
    equipo: null,
    sinHoras: [],
  };
  if (!horasPorPunto) return sinCalcular;

  const parteDelProyecto = diasDelProyecto > 0 ? diasDelPeriodo / diasDelProyecto : 0;
  const empezo = (periodo.diasParaEmpezar ?? 0) === 0;
  const carga = cargaPorIntegrante(tareas, equipo);
  const integrantes = indexarIntegrantes(equipo);
  const movidasPor = new Map(
    cargaPorIntegrante(movidas, EQUIPO_SIN_INTEGRANTES).personas.map((p) => [p.nombre, p.puntos])
  );

  const personas = carga.personas.map((p) => {
    const integrante = integrantes.get(p.nombre);
    const horasPactadas = integrante ? (integrante.horasPactadas ?? porIntegrante) : null;
    const capacidad =
      horasPactadas === null || parteDelProyecto === 0 ? null : conUnDecimal(horasPactadas * parteDelProyecto);
    const demanda = conUnDecimal(p.puntos * horasPorPunto);
    const hechas = conUnDecimal(p.puntosTerminados * horasPorPunto);
    const asignadas = conUnDecimal(demanda + (movidasPor.get(p.nombre) ?? 0) * horasPorPunto);
    return {
      nombre: p.nombre,
      rol: p.rol,
      detalle: p.detalle,
      horasPactadas,
      capacidad,
      demanda,
      dentroDeLoPactado: capacidad === null ? null : conUnDecimal(Math.min(demanda, capacidad)),
      extras: capacidad === null ? null : conUnDecimal(Math.max(0, demanda - capacidad)),
      hechas,
      asignadas,
      utilizacion: capacidad === null ? null : porcentaje(demanda, capacidad),
      efectividad: empezo ? porcentaje(hechas, asignadas) : null,
    };
  });
  // Quien solo tiene tareas movidas (no le queda nada en el periodo) igual
  // suma lo que se le habia planificado.
  const sinFila = [...movidasPor].filter(([nombre]) => !personas.some((p) => p.nombre === nombre));
  const asignadasSinFila = sumar(sinFila.map(([, puntos]) => puntos * horasPorPunto));

  const conCapacidad = personas.filter((p) => p.capacidad !== null);
  const capacidad = conUnDecimal(sumar(conCapacidad.map((p) => p.capacidad)));
  const demanda = conUnDecimal(sumar(conCapacidad.map((p) => p.demanda)));
  const asignadas = conUnDecimal(sumar(personas.map((p) => p.asignadas)) + asignadasSinFila);
  const hechas = conUnDecimal(sumar(personas.map((p) => p.hechas)));
  return {
    ...sinCalcular,
    configurado: true,
    horasPorPunto,
    personas,
    equipo: {
      capacidad,
      // La demanda de quienes tienen capacidad, para la utilizacion; `asignadas`
      // son las horas de todo lo planificado, el denominador de la efectividad.
      demanda,
      extras: conUnDecimal(sumar(conCapacidad.map((p) => p.extras))),
      hechas,
      asignadas,
      utilizacion: porcentaje(demanda, capacidad),
      efectividad: empezo ? porcentaje(hechas, asignadas) : null,
      conSobrecarga: conCapacidad.filter((p) => p.extras > 0).length,
    },
    sinHoras: personas.filter((p) => p.capacidad === null).map((p) => p.nombre),
  };
}

// @decision 2026-10-17 ramiro@mispichos.com
// Bugs ratio: los bugs abiertos durante el periodo (stories de tipo "bug" que
// entraron a un sprint entre el inicio y el fin del periodo, en hora de Buenos
// Aires; el periodo es el sprint, o todos los sprints en el proyecto) sobre
// las historias de usuario terminadas (stories sin tarea madre, que no son
// bugs, con `completed`). Las subtareas no son historias: contar las 47
// subtareas del Sprint 1 como historias dejaria el ratio en nada. Sin historias
// terminadas el ratio es null, no 0: no hay con que comparar.
//
// @decision 2026-10-18 ramiro@mispichos.com
// Si en todo el workspace no hay ni un bug registrado (`bugsRegistrados`, la
// busqueda de Shortcut, da 0), el ratio tambien queda sin dato: un 0 con la
// meta cumplida diria que no hubo defectos, cuando lo que pasa es que no se
// registran (hoy las 132 stories son "feature" y no hay etiquetas ni Severity
// cargadas). `sinRegistro` lo marca para que la pantalla lo diga. Si la
// busqueda no se pudo hacer (null), se calcula con lo que hay.
export function bugsRatio(tareas, periodo, { bugsRegistrados = null } = {}) {
  const enElSprint = (t) => {
    const dia = diaLocal(t.ingresoEl);
    return dia >= periodo.inicio && dia <= periodo.fin;
  };
  const bugs = tareas.filter((t) => t.tipo === "bug");
  const abiertosEnSprint = bugs.filter(enElSprint);
  const historiasTerminadas = tareas.filter((t) => t.tipo !== "bug" && !t.historia && t.terminada);
  const sinRegistro = bugsRegistrados === 0 && bugs.length === 0;
  const ratio =
    !sinRegistro && historiasTerminadas.length > 0
      ? Math.round((abiertosEnSprint.length / historiasTerminadas.length) * 100) / 100
      : null;
  return {
    bugs: bugs.length,
    bugsAbiertosEnSprint: abiertosEnSprint.length,
    bugsTerminados: bugs.filter((t) => t.terminada).length,
    historiasTerminadas: historiasTerminadas.length,
    historias: tareas.filter((t) => t.tipo !== "bug" && !t.historia).length,
    ratio,
    sinRegistro,
  };
}

// Los OKR con su meta, evaluados, en el orden de la pantalla: los dos de calidad
// (bugs y retrabajo) y los dos de horas. `cumple` es null cuando no hay valor o
// no hay meta: no se puede decir ni que si ni que no.
export function evaluarOkrs({ bugs, horas, retrabajo = null }, metas) {
  const okrs = [];
  const bugsRatioMax = metas.bugsRatioMax;
  okrs.push({
    clave: "bugsRatio",
    nombre: "Bugs por historia terminada",
    valor: bugs.ratio,
    meta: bugsRatioMax,
    descripcionMeta: bugsRatioMax === null ? null : `como mucho ${bugsRatioMax}`,
    cumple: bugs.ratio === null || bugsRatioMax === null ? null : bugs.ratio <= bugsRatioMax,
  });
  // El porcentaje de tareas cerradas que volvieron atras (ver calcularRetrabajo
  // en performance.js). Sin tareas cerradas, o sin el calculo, queda sin dato.
  const retrabajoPct = retrabajo?.pct ?? null;
  const retrabajoMax = metas.retrabajoMax ?? null;
  okrs.push({
    clave: "retrabajo",
    nombre: "Retrabajo",
    valor: retrabajoPct,
    meta: retrabajoMax,
    descripcionMeta: retrabajoMax === null ? null : `como mucho ${retrabajoMax}%`,
    cumple: retrabajoPct === null || retrabajoMax === null ? null : retrabajoPct <= retrabajoMax,
  });
  const efectividad = horas.equipo?.efectividad ?? null;
  const efectividadMin = metas.efectividadMin;
  okrs.push({
    clave: "efectividad",
    nombre: "Efectividad de entrega",
    valor: efectividad,
    meta: efectividadMin,
    descripcionMeta: efectividadMin === null ? null : `al menos ${efectividadMin}%`,
    cumple: efectividad === null || efectividadMin === null ? null : efectividad >= efectividadMin,
  });
  const utilizacion = horas.equipo?.utilizacion ?? null;
  const { utilizacionMin, utilizacionMax } = metas;
  const hayRango = utilizacionMin !== null && utilizacionMax !== null;
  okrs.push({
    clave: "utilizacion",
    nombre: "Utilización del equipo",
    valor: utilizacion,
    meta: hayRango ? { min: utilizacionMin, max: utilizacionMax } : null,
    descripcionMeta: hayRango ? `entre ${utilizacionMin}% y ${utilizacionMax}%` : null,
    cumple:
      utilizacion === null || !hayRango
        ? null
        : utilizacion >= utilizacionMin && utilizacion <= utilizacionMax,
  });
  return okrs;
}

// Todo junto, como lo publican /api/performance y /api/performance/proyecto
// en `equipo`. `bugsRegistrados` es cuantos bugs hay en todo el workspace (la
// busqueda de Shortcut), o null si no se pudo contar: ver bugsRatio. `movidas`
// son las tareas planificadas del sprint que hoy estan en otro: solo entran en
// la efectividad (ver horasPorIntegrante). `retrabajo` es lo que devuelve
// calcularRetrabajo para las mismas tareas, o null si no se calculo.
export function armarEquipo(
  tareas,
  periodo,
  equipo,
  { bugsRegistrados = null, movidas = [], retrabajo = null } = {}
) {
  const bugs = bugsRatio(tareas, periodo, { bugsRegistrados });
  const horas = horasPorIntegrante(tareas, periodo, equipo, { movidas });
  const carga = cargaPorIntegrante(tareas, equipo);
  return {
    porRol: distribucionPorRol(tareas, equipo),
    wip: wipPorRol(tareas, equipo),
    carga,
    horas,
    bugs,
    retrabajo,
    okrs: evaluarOkrs({ bugs, horas, retrabajo }, equipo.metas),
    configuracion: {
      integrantes: equipo.integrantes.length,
      sinRol: equipo.integrantes.filter((i) => i.rol === null).map((i) => i.nombre),
      // Sin horas: solo si no hay cifra por defecto ni propia.
      sinHoras:
        equipo.horasPactadas?.porIntegrante == null
          ? equipo.integrantes.filter((i) => i.horasPactadas == null).map((i) => i.nombre)
          : [],
      fueraDeLaConfiguracion: carga.sinConfigurar,
      horasPorPunto: equipo.horasPorPunto,
      horasPactadasPorIntegrante: equipo.horasPactadas?.porIntegrante ?? null,
      finDelProyecto: equipo.horasPactadas?.finDelProyecto ?? null,
      metas: equipo.metas,
    },
  };
}
