// El proyecto entero de Shortcut, que es lo que Performance muestra por
// defecto: todos los sprints sumados (terminados, en curso y por empezar), con
// el avance total, los OKR y los KPIs del equipo sobre todas las tareas, el
// detalle sprint por sprint y los errores de todo el workspace.
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
  conUnDecimal,
  describirLectura,
  diaLocal,
  diasEntre,
  diasRestantesDe,
  fechaDeCalendario,
  sumar,
} from "./tiempo.js";
import {
  ESTADOS_SPRINT,
  armarHistorial,
  avancePorIniciativa,
  cargaPorResponsable,
  describirSprint,
  erroresDelProyecto,
  estabaAlCierreDelPrimerDia,
  listarSprints,
  normalizarTareas,
  progresoDelProyecto,
  resumir,
  sprintsParaHistorial,
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
  diasCalendario: 0,
  diasTranscurridos: 0,
  diasRestantes: 0,
  semanas: 0,
  sprints: { total: 0, terminados: 0, enCurso: 0, proximos: 0 },
  enCurso: null,
  solapados: [],
});

// @decision 2026-10-18 ramiro@mispichos.com
// El periodo del proyecto para las horas es la suma de sus sprints, no el
// calendario entre el primero y el ultimo: la capacidad del equipo (horas
// semanales x semanas) se suma sprint a sprint, igual que en la vista de cada
// uno, asi la utilizacion del proyecto es la misma cuenta que la de un sprint
// sobre mas tareas. Dos sprints de 15 dias son 30 dias (4.3 semanas) aunque
// compartan el dia del cambio. Si dos sprints se pisan mas que ese dia, la
// suma cuenta esos dias dos veces: se informa (`solapados`) en vez de sumar en
// silencio. Los dias transcurridos y restantes, en cambio, son de calendario
// (del inicio del primero al fin del ultimo, contando hoy como restante, igual
// que la tarjeta de un sprint), que es lo que se lee en pantalla. Los sprints
// que no empezaron tambien entran en el alcance y en la capacidad (ya estan
// planificados y pactados), pero no en lo comprometido: nada esta comprometido
// hasta que cierra el primer dia del sprint (ver armarProyecto).
export function describirPeriodo(iteraciones, ahora) {
  if (iteraciones.length === 0) return { ...PERIODO_VACIO };
  const sprints = [...iteraciones].sort(porInicio).map((i) => describirSprint(i, ahora));
  const inicio = sprints[0].inicio;
  const fin = sprints.map((s) => s.fin).sort().at(-1);
  const hoy = diaLocal(ahora);
  const diasCalendario = diasEntre(inicio, fin) + 1;
  const diasRestantes = diasRestantesDe(inicio, fin, hoy);
  const diasTotales = sumar(sprints.map((s) => s.diasTotales));
  const enCurso = sprints.filter((s) => s.estado === ESTADOS_SPRINT.started);
  const contar = (estado) => sprints.filter((s) => s.estado === estado).length;

  const solapados = [];
  for (let n = 1; n < sprints.length; n++) {
    const anterior = sprints[n - 1];
    const actual = sprints[n];
    const finComun = anterior.fin < actual.fin ? anterior.fin : actual.fin;
    const dias = diasEntre(actual.inicio, finComun) + 1;
    if (dias > 1) {
      solapados.push({ ids: [anterior.id, actual.id], nombres: [anterior.nombre, actual.nombre], dias });
    }
  }

  return {
    inicio,
    fin,
    diasTotales,
    diasCalendario,
    diasTranscurridos: diasCalendario - diasRestantes,
    diasRestantes,
    semanas: conUnDecimal(diasTotales / 7),
    sprints: {
      total: sprints.length,
      terminados: contar(ESTADOS_SPRINT.done),
      enCurso: enCurso.length,
      proximos: contar(ESTADOS_SPRINT.unstarted),
    },
    // Si hay varios en curso, el ultimo en empezar: el mismo criterio que
    // elegirSprintPorDefecto.
    enCurso: enCurso.length > 0 ? { id: enCurso.at(-1).id, nombre: enCurso.at(-1).nombre } : null,
    solapados,
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
  { iteraciones, sprints, workflows, miembros, epics, conteos = null },
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
        historiales: lectura.historiales,
        sprintId: iteracion.id,
      },
      problemas
    ).map((t) => ({
      ...t,
      sprint: { id: sprint.id, nombre: sprint.nombre },
      // La misma regla que calcularCompromiso, sprint por sprint: comprometida
      // es la que ya estaba en su sprint al cierre del primer dia de ese
      // sprint. En un sprint que no empezo ese dia no cerro: nada esta
      // comprometido todavia, aunque su alcance y su capacidad ya cuenten.
      comprometida:
        sprint.estado !== ESTADOS_SPRINT.unstarted && estabaAlCierreDelPrimerDia(t, sprint),
    }));
    const archivadasDelSprint = lectura.stories.length - propias.length;
    archivadas += archivadasDelSprint;
    contados.push({ id: iteracion.id, resumen: resumir(propias, archivadasDelSprint) });
    tareas.push(...propias);
  }

  const periodo = describirPeriodo(iteraciones, ahora);
  for (const s of periodo.solapados) {
    problemas.push({
      tarea: null,
      campo: "sprints",
      valor: s.ids.join(", "),
      motivo:
        `los sprints "${s.nombres[0]}" y "${s.nombres[1]}" se solapan ${s.dias} días: ` +
        "la capacidad del equipo cuenta esos días dos veces",
    });
  }
  const datosDeEquipo = armarEquipo(tareas, periodo, equipo);

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
    porResponsable: cargaPorResponsable(tareas),
    equipo: datosDeEquipo,
    archivadas,
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}
