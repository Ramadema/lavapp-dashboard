// El proyecto entero de Shortcut, que es lo que Performance muestra por
// defecto: todos los sprints sumados (terminados, en curso y por empezar), con
// el avance total, los OKR y los KPIs del equipo sobre todas las tareas (el
// retrabajo incluido), el detalle sprint por sprint y los errores de todo el
// workspace.
//
// Funciones puras, como performance.js: reciben las respuestas crudas de
// lib/shortcut.js (las iteraciones y, por cada una, sus stories con los
// historiales de esas stories), la hora y la configuracion del equipo por
// parametro. Sin fetch, sin React, sin process.env.
//
// Reusa los calculos de performance.js y equipo.js para que un numero del
// proyecto se cuente igual que el mismo numero de un sprint: lo unico que
// cambia es el conjunto de tareas (todas) y el periodo (todos los sprints).

import { EQUIPO_VACIO, armarEquipo } from "./equipo.js";
import {
  describirLectura,
  diaLocal,
  diasEntre,
  diasRestantesDe,
  fechaDeCalendario,
} from "./tiempo.js";
import {
  ESTADOS_SPRINT,
  armarHistorial,
  avancePorEspecialidad,
  avancePorIniciativa,
  calcularRetrabajo,
  cargaPorResponsable,
  describirProyecto,
  describirSprint,
  erroresDelProyecto,
  listarSprints,
  normalizarTareas,
  problemaDeFinDescartado,
  problemaDeSolapado,
  progresoDelProyecto,
  repartirDias,
  resumir,
  sprintsParaHistorial,
  VERSION_DE_DATOS,
} from "./performance.js";

export const AMBITO_PROYECTO = "proyecto";

const porInicio = (a, b) =>
  fechaDeCalendario(a.start_date).localeCompare(fechaDeCalendario(b.start_date)) || a.id - b.id;

// Un periodo sin sprints: nada que medir, pero con la forma completa para que
// la pantalla y equipo.js no tengan casos especiales.
const PERIODO_VACIO = Object.freeze({
  inicio: null,
  fin: null,
  diasTotales: 0,
  diasTranscurridos: 0,
  diasRestantes: 0,
  diasParaEmpezar: 0,
  diasDelProyecto: 0,
  finDelReparto: null,
  repartoConfigurado: false,
  sprints: { total: 0, terminados: 0, enCurso: 0, proximos: 0 },
  enCurso: null,
});

// @decision 2026-10-18 ramiro@mispichos.com
// El periodo del proyecto tiene la misma forma que un sprint para lo que usa
// equipo.js: va del inicio del primer sprint al fin del ultimo, en dias de
// calendario (`diasTotales`), con los dias restantes contando hoy, igual que la
// tarjeta de un sprint. Las horas pactadas son por persona para todo el
// proyecto y la capacidad del periodo es la parte que le toca por sus dias
// sobre `diasDelProyecto` (hasta el fin configurado en data/equipo.json o, sin
// el, hasta el fin del ultimo sprint cargado, ver describirProyecto). Se cuenta
// el calendario y no la suma de los sprints, que cuenta dos veces el dia del
// cambio y daria mas horas que las pactadas. Los sprints que no empezaron
// tambien entran: su alcance ya esta planificado.
export function describirPeriodo(iteraciones, ahora, { finDelProyecto = null } = {}) {
  if (iteraciones.length === 0) return { ...PERIODO_VACIO };
  const sprints = [...iteraciones].sort(porInicio).map((i) => describirSprint(i, ahora));
  const inicio = sprints[0].inicio;
  const fin = sprints.map((s) => s.fin).sort().at(-1);
  const hoy = diaLocal(ahora);
  const diasTotales = diasEntre(inicio, fin) + 1;
  const diasRestantes = diasRestantesDe(inicio, fin, hoy);
  const enCurso = sprints.filter((s) => s.estado === ESTADOS_SPRINT.started);
  const contar = (estado) => sprints.filter((s) => s.estado === estado).length;
  const proyecto = describirProyecto(iteraciones, { fin: finDelProyecto });
  return {
    inicio,
    fin,
    diasTotales,
    diasTranscurridos: diasTotales - diasRestantes,
    diasRestantes,
    diasParaEmpezar: hoy < inicio ? diasEntre(hoy, inicio) : 0,
    // Hasta cuando se reparten las horas pactadas: el fin del proyecto (el
    // configurado, si no es anterior al ultimo sprint).
    diasDelProyecto: proyecto.dias,
    finDelReparto: proyecto.fin,
    repartoConfigurado: proyecto.configurado,
    sprints: {
      total: sprints.length,
      terminados: contar(ESTADOS_SPRINT.done),
      enCurso: enCurso.length,
      proximos: contar(ESTADOS_SPRINT.unstarted),
    },
    // Si hay varios en curso, el ultimo en empezar: el mismo criterio que
    // elegirSprintPorDefecto.
    enCurso: enCurso.length > 0 ? { id: enCurso.at(-1).id, nombre: enCurso.at(-1).nombre } : null,
  };
}

// Todo junto, como lo publica /api/performance/proyecto. `sprints` trae, por
// cada iteracion, sus stories de hoy y los historiales de esas stories (lo que
// devuelve obtenerHistorialDeSprints). Cada sprint se cuenta desde sus stories,
// como en la vista de un sprint, y las estadisticas de Shortcut quedan de
// contraste: si difieren, progresoDelProyecto lo reporta. Un sprint del que no
// vinieron las stories se cuenta con sus estadisticas y queda anotado: sus
// tareas no entran en los KPIs del equipo ni en el detalle por sprint.
export function armarProyecto(
  { iteraciones, sprints, workflows, miembros, epics, camposCustom = [], conteos = null },
  { ahora, leidoEl = [], problemas: problemasDeLectura = [], equipo = EQUIPO_VACIO }
) {
  const problemas = [...problemasDeLectura];
  const leidos = new Map(sprints.map((s) => [s.iteracion.id, s]));
  const ordenadas = [...iteraciones].sort(porInicio);

  const tareas = [];
  const contados = [];
  let archivadas = 0;
  for (const iteracion of ordenadas) {
    const lectura = leidos.get(iteracion.id);
    if (!lectura) {
      problemas.push({
        tarea: null,
        campo: "stories",
        valor: iteracion.id,
        motivo:
          `no se leyeron las stories del sprint "${iteracion.name}": se cuenta con sus estadísticas ` +
          "y sus tareas no entran en los KPIs del equipo ni en el detalle por sprint",
      });
      continue;
    }
    const sprint = describirSprint(iteracion, ahora);
    const propias = normalizarTareas(
      {
        stories: lectura.stories,
        workflows,
        miembros,
        epics,
        camposCustom,
        historiales: lectura.historiales,
        sprintId: iteracion.id,
      },
      problemas
    ).map((t) => ({ ...t, sprint: { id: sprint.id, nombre: sprint.nombre } }));
    const archivadasDelSprint = lectura.stories.length - propias.length;
    archivadas += archivadasDelSprint;
    contados.push({ id: iteracion.id, resumen: resumir(propias, archivadasDelSprint) });
    tareas.push(...propias);
  }

  const finConfigurado = equipo.horasPactadas?.finDelProyecto ?? null;
  const periodo = describirPeriodo(iteraciones, ahora, { finDelProyecto: finConfigurado });
  if (describirProyecto(iteraciones, { fin: finConfigurado }).descartado) {
    problemas.push(problemaDeFinDescartado(finConfigurado, periodo.finDelReparto));
  }
  // Los sprints que se pisan mas que el dia del cambio: no cambian la capacidad
  // del proyecto (se cuenta el calendario), pero si la de cada sprint.
  for (const s of repartirDias(iteraciones).solapados) problemas.push(problemaDeSolapado(s));
  // El retrabajo de todas las tareas, cada una con el historial que vino con
  // su sprint.
  const historiales = Object.assign({}, ...sprints.map((s) => s.historiales ?? {}));
  const retrabajo = calcularRetrabajo(tareas, historiales, workflows, { miembros, ahora }, problemas);
  const datosDeEquipo = armarEquipo(tareas, periodo, equipo, {
    bugsRegistrados: conteos?.bugs ?? null,
    retrabajo,
  });

  // Sprint por sprint, con la misma cuenta que /api/performance/historial: los
  // que ya empezaron tienen fila; los que no, solo sirven para atribuir las
  // tareas que se les movieron.
  const empezados = sprintsParaHistorial(ordenadas, { maximo: ordenadas.length }).filter((i) =>
    leidos.has(i.id)
  );
  const idsEmpezados = new Set(empezados.map((i) => i.id));
  const lecturaDe = (i) => ({
    iteracion: i,
    stories: leidos.get(i.id).stories,
    historiales: leidos.get(i.id).historiales,
  });
  const historial = armarHistorial(
    {
      iteraciones,
      sprints: empezados.map(lecturaDe),
      destinos: ordenadas.filter((i) => !idsEmpezados.has(i.id) && leidos.has(i.id)).map(lecturaDe),
      workflows,
      miembros,
      epics,
      camposCustom,
    },
    { ahora }
  );
  // armarHistorial vuelve a traducir las mismas stories (esos problemas ya
  // estan anotados) pero ademas analiza las tareas movidas entre sprints: lo
  // que diga de ellas y no se haya anotado todavia se suma, sin repetir.
  const anotados = new Set(problemas.map((p) => JSON.stringify(p)));
  for (const p of historial.problemas) {
    const clave = JSON.stringify(p);
    if (anotados.has(clave)) continue;
    anotados.add(clave);
    problemas.push(p);
  }

  return {
    ambito: AMBITO_PROYECTO,
    sprints: listarSprints(iteraciones),
    periodo,
    progreso: progresoDelProyecto(
      iteraciones,
      { stories: conteos?.stories ?? null, desdeStories: contados },
      problemas
    ),
    // `enElSprint` lleva aca los bugs que entraron a algun sprint del periodo y
    // los que siguen sin resolver: el mismo vocabulario que el OKR del equipo.
    errores: erroresDelProyecto(conteos, datosDeEquipo.bugs, problemas),
    porSprint: historial.sprints,
    porIniciativa: avancePorIniciativa(tareas),
    porEspecialidad: avancePorEspecialidad(tareas, camposCustom),
    porResponsable: cargaPorResponsable(tareas),
    equipo: datosDeEquipo,
    archivadas,
    version: VERSION_DE_DATOS,
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}
