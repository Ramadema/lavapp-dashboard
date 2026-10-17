// KPIs y OKRs del equipo sobre un sprint: distribucion por rol, WIP por rol,
// carga por integrante, horas pactadas contra consumidas, bugs sobre historias
// y utilizacion y efectividad por integrante.
//
// Funciones puras, igual que performance.js: reciben las tareas ya normalizadas
// (lo que arma performance.js, con `tipo`, `responsables`, `puntos`, `etapa`,
// `estado`, `terminada`, `ingresoEl`, `historia` y `comprometida`), el sprint
// descripto y la configuracion de data/equipo.json. Sin fetch, sin React, sin
// process.env.
//
// Shortcut no sabe ni el rol ni las horas de nadie: las dos cosas salen de la
// configuracion, que empareja a cada integrante por su nombre tal como lo
// devuelve /members (el mismo nombre que ya se ve en "Carga por responsable").

import { diaLocal } from "./tiempo.js";

// La configuracion cuando data/equipo.json falta o esta rota: sin horas ni
// metas, nadie con rol. Vive aca y no en lib/equipo.js para que este modulo (y
// la pantalla, que importa sus constantes) no arrastre node:fs al navegador.
export const EQUIPO_VACIO = Object.freeze({
  horasPorPunto: null,
  wipMaxPorPersona: 3,
  metas: { bugsRatioMax: null, efectividadMin: null, utilizacionMin: null, utilizacionMax: null },
  integrantes: [],
});

export const ROLES = ["UX", "Dev", "QA", "PM"];
export const SIN_ROL = "Sin rol";
export const SIN_ASIGNAR = "Sin asignar";
const ORDEN_ROLES = ["UX", "Dev", "QA", "PM", SIN_ROL, SIN_ASIGNAR];

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
      "Un OKR (Objectives and Key Results) es un resultado clave con una meta acordada por el equipo. La tarjeta compara el valor del sprint contra esa meta y avisa cuando no se cumple. Las metas se cambian en data/equipo.json.",
  },
};

const porcentaje = (parte, total) =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : null;
const conUnDecimal = (n) => Math.round(n * 10) / 10;
const sumar = (valores) => valores.reduce((total, v) => total + v, 0);
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
// Distribucion por rol: cuantas tareas y puntos tiene cada rol del sprint. Una
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
// Carga por integrante: los puntos asignados a cada persona en el sprint, con
// su rol. Una tarea compartida cuenta entera para cada responsable, como en
// "Carga por responsable". Los integrantes configurados que no tienen nada
// asignado aparecen en 0: la falta de carga tambien se quiere ver. Las
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
    for (const nombre of tarea.responsables) {
      const persona = asegurar(nombre);
      persona.tareas++;
      persona.puntos += tarea.puntos ?? 0;
      if (tarea.puntos === null) persona.sinEstimar++;
      if (tarea.terminada) {
        persona.terminadas++;
        persona.puntosTerminados += tarea.puntos ?? 0;
      } else if (tarea.etapa === "En curso") persona.enCurso++;
    }
  }

  const lista = [...personas.values()].sort(
    (a, b) => b.puntos - a.puntos || b.tareas - a.tareas || a.nombre.localeCompare(b.nombre)
  );
  return {
    personas: lista,
    sinAsignar,
    sinConfigurar: lista.filter((p) => !p.configurada).map((p) => p.nombre),
  };
}

// @decision 2026-10-17 ramiro@mispichos.com
// Horas: Shortcut no registra horas, asi que se convierten los puntos con
// `horasPorPunto` de la configuracion. Por persona:
//   capacidad   = horas semanales pactadas x semanas del sprint (dias / 7)
//   demanda     = puntos asignados x horas por punto
//   extras      = lo que la demanda excede a la capacidad (0 si no excede)
//   hechas      = puntos terminados x horas por punto
//   comprometidas = puntos de las tareas que ya estaban al cierre del primer
//                   dia x horas por punto (la misma regla que "Compromiso")
//   utilizacion = demanda / capacidad      (OKR: entre utilizacionMin y Max)
//   efectividad = hechas / comprometidas    (OKR: al menos efectividadMin)
// Quien no tiene horas pactadas no entra en capacidad ni en utilizacion, y se
// informa. Sin `horasPorPunto` no hay nada que calcular y la pantalla lo dice.
export function horasPorIntegrante(tareas, sprint, equipo) {
  const { horasPorPunto } = equipo;
  if (!horasPorPunto) {
    return { configurado: false, semanas: null, personas: [], equipo: null, sinHoras: [] };
  }
  const semanas = conUnDecimal(sprint.diasTotales / 7);
  const carga = cargaPorIntegrante(tareas, equipo);
  const integrantes = indexarIntegrantes(equipo);

  const comprometidosPor = new Map();
  for (const tarea of tareas) {
    if (!tarea.comprometida) continue;
    for (const nombre of tarea.responsables) {
      comprometidosPor.set(nombre, (comprometidosPor.get(nombre) ?? 0) + (tarea.puntos ?? 0));
    }
  }

  const personas = carga.personas.map((p) => {
    const horasSemanales = integrantes.get(p.nombre)?.horasSemanales ?? null;
    const capacidad = horasSemanales === null ? null : conUnDecimal(horasSemanales * semanas);
    const demanda = conUnDecimal(p.puntos * horasPorPunto);
    const hechas = conUnDecimal(p.puntosTerminados * horasPorPunto);
    const comprometidas = conUnDecimal((comprometidosPor.get(p.nombre) ?? 0) * horasPorPunto);
    return {
      nombre: p.nombre,
      rol: p.rol,
      horasSemanales,
      capacidad,
      demanda,
      dentroDeLoPactado: capacidad === null ? null : conUnDecimal(Math.min(demanda, capacidad)),
      extras: capacidad === null ? null : conUnDecimal(Math.max(0, demanda - capacidad)),
      hechas,
      comprometidas,
      utilizacion: capacidad === null ? null : porcentaje(demanda, capacidad),
      efectividad: porcentaje(hechas, comprometidas),
    };
  });

  const conCapacidad = personas.filter((p) => p.capacidad !== null);
  const capacidad = conUnDecimal(sumar(conCapacidad.map((p) => p.capacidad)));
  const demanda = conUnDecimal(sumar(conCapacidad.map((p) => p.demanda)));
  const hechas = conUnDecimal(sumar(personas.map((p) => p.hechas)));
  const comprometidas = conUnDecimal(sumar(personas.map((p) => p.comprometidas)));
  return {
    configurado: true,
    horasPorPunto,
    semanas,
    personas,
    equipo: {
      capacidad,
      demanda,
      extras: conUnDecimal(sumar(conCapacidad.map((p) => p.extras))),
      hechas,
      comprometidas,
      utilizacion: porcentaje(demanda, capacidad),
      efectividad: porcentaje(hechas, comprometidas),
      conSobrecarga: conCapacidad.filter((p) => p.extras > 0).length,
    },
    sinHoras: personas.filter((p) => p.capacidad === null).map((p) => p.nombre),
  };
}

// @decision 2026-10-17 ramiro@mispichos.com
// Bugs ratio: los bugs abiertos durante el sprint (stories de tipo "bug" que
// entraron al sprint entre su inicio y su fin, en hora de Buenos Aires) sobre
// las historias de usuario terminadas (stories sin tarea madre, que no son
// bugs, con `completed`). Las subtareas no son historias: contar las 47
// subtareas del Sprint 1 como historias dejaria el ratio en nada. Sin historias
// terminadas el ratio es null, no 0: no hay con que comparar. Hoy el equipo
// carga todo como "feature"; el ratio empieza a decir algo cuando los bugs se
// carguen con el tipo bug de Shortcut.
export function bugsRatio(tareas, sprint) {
  const enElSprint = (t) => {
    const dia = diaLocal(t.ingresoEl);
    return dia >= sprint.inicio && dia <= sprint.fin;
  };
  const bugs = tareas.filter((t) => t.tipo === "bug");
  const abiertosEnSprint = bugs.filter(enElSprint);
  const historiasTerminadas = tareas.filter((t) => t.tipo !== "bug" && !t.historia && t.terminada);
  const ratio =
    historiasTerminadas.length > 0
      ? Math.round((abiertosEnSprint.length / historiasTerminadas.length) * 100) / 100
      : null;
  return {
    bugs: bugs.length,
    bugsAbiertosEnSprint: abiertosEnSprint.length,
    bugsTerminados: bugs.filter((t) => t.terminada).length,
    historiasTerminadas: historiasTerminadas.length,
    historias: tareas.filter((t) => t.tipo !== "bug" && !t.historia).length,
    ratio,
  };
}

// Los tres OKR con su meta, evaluados. `cumple` es null cuando no hay valor o
// no hay meta: no se puede decir ni que si ni que no.
export function evaluarOkrs({ bugs, horas }, metas) {
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

// Todo junto, como lo publica /api/performance en `equipo`.
export function armarEquipo(tareas, sprint, equipo) {
  const bugs = bugsRatio(tareas, sprint);
  const horas = horasPorIntegrante(tareas, sprint, equipo);
  const carga = cargaPorIntegrante(tareas, equipo);
  return {
    porRol: distribucionPorRol(tareas, equipo),
    wip: wipPorRol(tareas, equipo),
    carga,
    horas,
    bugs,
    okrs: evaluarOkrs({ bugs, horas }, equipo.metas),
    configuracion: {
      integrantes: equipo.integrantes.length,
      sinRol: equipo.integrantes.filter((i) => i.rol === null).map((i) => i.nombre),
      sinHoras: equipo.integrantes.filter((i) => i.horasSemanales === null).map((i) => i.nombre),
      fueraDeLaConfiguracion: carga.sinConfigurar,
      horasPorPunto: equipo.horasPorPunto,
      metas: equipo.metas,
    },
  };
}
