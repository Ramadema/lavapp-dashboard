// Avance de un sprint de Shortcut, en los terminos que lee el area de negocio:
// el resumen, las listas de tareas, el burndown y el cycle time.
//
// Funciones puras: reciben las respuestas crudas de la API (lo que devuelve
// lib/shortcut.js) y la hora actual por parametro, asi los tests fijan el "hoy"
// y los mismos datos dan siempre el mismo resultado. Sin fetch, sin React, sin
// process.env: tambien la importa la pantalla para sus constantes.
//
// "Story" es el termino de Shortcut; en la salida y en la pantalla se dice "tarea".

import {
  MINUTOS_PARA_DESACTUALIZADO,
  MS_POR_DIA,
  ZONA_HORARIA,
  conUnDecimal,
  describirLectura,
  diaLocal,
  diasEntre,
  diasRestantesDe,
  fechaDeCalendario,
  mediana,
  numeroDeDia,
  porcentaje,
  sumar,
  sumarDias,
} from "./tiempo.js";
import { EQUIPO_VACIO, armarEquipo } from "./equipo.js";

// La zona horaria, el corte de dias, la mediana y la lectura viven en tiempo.js,
// compartidos con las secciones de Gestion. Se reexportan porque la pantalla y
// los tests los importan de aca.
export { MINUTOS_PARA_DESACTUALIZADO, ZONA_HORARIA, diaLocal };

// Los cuatro tipos de estado que Shortcut le da a cada columna de un workflow,
// traducidos a las tres etapas que ve negocio. "backlog" es anterior a
// "unstarted" y para negocio los dos son trabajo sin empezar.
export const ETAPAS = {
  backlog: "Pendiente",
  unstarted: "Pendiente",
  started: "En curso",
  done: "Terminado",
};

// El `status` que Shortcut le pone a cada iteracion segun sus fechas.
// La forma de los datos que publican /api/performance, /proyecto y /historial.
// La pantalla la compara con la suya: si el servidor responde con otra (pasa
// cuando se actualiza el codigo y un `next dev` sigue con el viejo en memoria,
// o con una pagina abierta durante un deploy), avisa que hay que reiniciar el
// servidor o recargar, en vez de romperse leyendo un campo que no vino. Es una
// fecha AAAA-MM-DD y se cambia cada vez que cambia la forma de la respuesta.
export const VERSION_DE_DATOS = "2026-10-21";

export const ESTADOS_SPRINT = {
  unstarted: "Próximo",
  started: "En curso",
  done: "Terminado",
};

// La aritmetica (porcentaje, sumar, conUnDecimal) y los dias de calendario
// (fechaDeCalendario, diasEntre, diasRestantesDe) viven en tiempo.js,
// compartidos con proyecto.js y equipo.js.

export function describirSprint(iteracion, ahora) {
  const inicio = fechaDeCalendario(iteracion.start_date);
  const fin = fechaDeCalendario(iteracion.end_date);
  const hoy = diaLocal(ahora);
  const diasTotales = diasEntre(inicio, fin) + 1;
  // La regla de los dias restantes (incluyen hoy) lleva su firma en tiempo.js:
  // el periodo del proyecto la usa igual.
  const diasRestantes = diasRestantesDe(inicio, fin, hoy);

  return {
    id: iteracion.id,
    nombre: iteracion.name,
    estado: ESTADOS_SPRINT[iteracion.status] ?? iteracion.status,
    inicio,
    fin,
    diasTotales,
    diasRestantes,
    diasParaEmpezar: hoy < inicio ? diasEntre(hoy, inicio) : 0,
    url: iteracion.app_url,
  };
}

// Los sprints para el selector, del mas nuevo al mas viejo.
export function listarSprints(iteraciones) {
  return [...iteraciones]
    .sort((a, b) =>
      fechaDeCalendario(b.start_date).localeCompare(fechaDeCalendario(a.start_date))
    )
    .map((i) => ({
      id: i.id,
      nombre: i.name,
      estado: ESTADOS_SPRINT[i.status] ?? i.status,
      inicio: fechaDeCalendario(i.start_date),
      fin: fechaDeCalendario(i.end_date),
    }));
}

// @decision 2026-09-30 ramiro@mispichos.com
// Sin sprint pedido se muestra el que esta en curso; si hay varios en curso a la
// vez (equipos distintos), el que empezo ultimo. Si no hay ninguno en curso, el
// ultimo terminado, que es el que alguien de negocio querria revisar; y solo si
// tampoco hay terminados, el proximo a empezar. Devuelve el id o null.
export function elegirSprintPorDefecto(iteraciones) {
  const porInicio = [...iteraciones].sort((a, b) =>
    fechaDeCalendario(b.start_date).localeCompare(fechaDeCalendario(a.start_date))
  );
  const elegido =
    porInicio.find((i) => i.status === "started") ??
    porInicio.find((i) => i.status === "done") ??
    porInicio.reverse().find((i) => i.status === "unstarted");
  return elegido?.id ?? null;
}

function indexarEstados(workflows) {
  const estados = new Map();
  for (const workflow of workflows) {
    for (const estado of workflow.states) {
      estados.set(estado.id, {
        id: estado.id,
        nombre: estado.name,
        tipo: estado.type,
        posicion: estado.position,
        workflowId: workflow.id,
      });
    }
  }
  return estados;
}

const nombreDePersona = (miembro) =>
  miembro.profile?.name?.trim() || miembro.profile?.mention_name || null;

const ordenarCambios = (historial) =>
  [...historial].sort((a, b) => Date.parse(a.changed_at) - Date.parse(b.changed_at));

// Las acciones del historial que hablan de esta story, en orden. El historial
// de una historia tambien trae la creacion de sus subtareas: por eso se filtra
// por el id de la story.
function* accionesDeLaStory(historial, storyId) {
  for (const cambio of ordenarCambios(historial)) {
    for (const accion of cambio.actions ?? []) {
      if (accion.entity_type === "story" && accion.id === storyId) yield { cambio, accion };
    }
  }
}

// Cuando entro y cuando salio una story de un sprint, segun su historial. La
// API no lo da como campo: se reconstruye con los cambios de `iteration_id`,
// que Shortcut anota como `changes.iteration_id: { old, new }` (sin `old` si no
// tenia sprint), y con la creacion directa en el sprint. Si entro, salio y
// volvio, cuenta la ultima entrada. Devuelve { entro, salio }: `salio` es la
// salida posterior a esa entrada, o null si sigue adentro. Sin rastro en el
// historial, los dos son null.
export function pasoPorSprint(historial, storyId, sprintId) {
  let entro = null;
  let salio = null;
  for (const { cambio, accion } of accionesDeLaStory(historial, storyId)) {
    if (accion.action === "create" && accion.iteration_id === sprintId) {
      entro = cambio.changed_at;
      salio = null;
    }
    const iteracion = accion.action === "update" ? accion.changes?.iteration_id : null;
    if (iteracion?.new === sprintId) {
      entro = cambio.changed_at;
      salio = null;
    } else if (iteracion?.old === sprintId && entro !== null) {
      salio = cambio.changed_at;
    }
  }
  return { entro, salio };
}

// Cuando entro una story al sprint en el que esta hoy, o null si el historial
// no lo dice (o dice que salio).
export function fechaDeIngreso(historial, storyId, sprintId) {
  const { entro, salio } = pasoPorSprint(historial, storyId, sprintId);
  return salio === null ? entro : null;
}

// Los catalogos de Shortcut indexados por id, para traducir cada story.
function armarCatalogos({ workflows, miembros, epics, camposCustom, stories }) {
  return {
    estados: indexarEstados(workflows),
    personas: new Map(miembros.map((m) => [m.id, nombreDePersona(m)])),
    nombresDeEpic: new Map(epics.map((e) => [e.id, e.name.trim()])),
    nombresDeCampo: new Map((camposCustom ?? []).map((c) => [c.id, c.name])),
    titulos: new Map(stories.map((s) => [s.id, s.name])),
  };
}

// Lleva una story cruda al formato interno, sin las fechas de sprint (esas
// dependen de si la story esta hoy en el sprint o se fue a otro). Nada se
// descarta en silencio: un id que no se puede traducir (un estado, una persona
// o un epic creados despues de la ultima lectura de los catalogos) deja la tarea
// adentro con un nombre generico y queda anotado en `problemas`.
function traducirStory(s, { estados, personas, nombresDeEpic, nombresDeCampo, titulos }, problemas) {
  const reportar = (campo, valor, motivo) => problemas.push({ tarea: s.id, campo, valor, motivo });

  // Los campos custom del workspace por su nombre en Shortcut ("Skill Set":
  // "Backend"). Uno que no esta en el catalogo se reporta; si el catalogo no se
  // pudo leer (vacio) no se reporta story por story: ya esta anotado una vez.
  const campos = {};
  for (const c of s.custom_fields ?? []) {
    const nombre = nombresDeCampo.get(c.field_id);
    if (nombre) campos[nombre] = c.value ?? null;
    else if (nombresDeCampo.size > 0) {
      reportar("custom_fields", c.field_id, "campo custom que no esta en la lista de campos");
    }
  }

  const estado = estados.get(s.workflow_state_id);
  if (!estado) {
    reportar("workflow_state_id", s.workflow_state_id, "estado que no esta en ningun workflow");
  }

  const responsables = s.owner_ids.map((id) => {
    if (personas.get(id)) return personas.get(id);
    reportar("owner_ids", id, "persona que no esta entre los miembros");
    return "Persona sin nombre";
  });

  let epic = null;
  if (s.epic_id != null) {
    epic = nombresDeEpic.get(s.epic_id) ?? null;
    if (!epic) {
      reportar("epic_id", s.epic_id, "epic que no esta en la lista de epics");
      epic = "Epic sin nombre";
    }
  }

  const terminadaEl = s.completed ? (s.completed_at_override ?? s.completed_at) : null;
  if (s.completed && !terminadaEl) {
    reportar("completed_at", null, "tarea terminada sin fecha de terminacion");
  }

  // @decision 2026-09-30 ramiro@mispichos.com
  // Terminada es `completed` de Shortcut, no el nombre de la columna: sigue
  // valiendo aunque renombren "Done". Las fechas usan el override manual
  // cuando existe, igual que los reportes de Shortcut, porque es la
  // correccion que el equipo cargo a mano.
  return {
    id: s.id,
    titulo: s.name,
    url: s.app_url,
    estadoId: s.workflow_state_id,
    estado: estado?.nombre ?? "Estado desconocido",
    posicionEstado: estado?.posicion ?? -1,
    workflowId: s.workflow_id,
    etapa: s.completed ? ETAPAS.done : s.started ? ETAPAS.started : ETAPAS.unstarted,
    terminada: s.completed,
    // "feature", "bug" o "chore", tal como lo carga el equipo en Shortcut.
    tipo: s.story_type ?? "feature",
    // Los nombres de sus etiquetas: el retrabajo mira ETIQUETA_SIN_RETRABAJO.
    etiquetas: (s.labels ?? []).map((l) => l.name).filter(Boolean),
    puntos: s.estimate,
    epic,
    campos,
    responsables,
    historia:
      s.parent_story_id != null
        ? { id: s.parent_story_id, titulo: titulos.get(s.parent_story_id) ?? null }
        : null,
    creadaEl: s.created_at,
    empezadaEl: s.started_at_override ?? s.started_at,
    terminadaEl,
  };
}

// Las stories que hoy estan en el sprint, con la fecha en que entraron. La usa
// tambien proyecto.js, sprint por sprint, para contar el proyecto entero con la
// misma traduccion.
export function normalizarTareas(
  { stories, workflows, miembros, epics, camposCustom = [], historiales, sprintId },
  problemas
) {
  const catalogos = armarCatalogos({ workflows, miembros, epics, camposCustom, stories });
  return stories
    .filter((s) => !s.archived)
    .map((s) => {
      const tarea = traducirStory(s, catalogos, problemas);

      // Sin historial (no se pudo leer: lib/shortcut.js ya lo reporto) o sin la
      // entrada en el historial, la fecha de creacion es la mejor cota: antes de
      // existir no pudo estar en el sprint. Queda marcada como estimada.
      const historial = historiales?.[s.id];
      let ingresoEl = historial ? fechaDeIngreso(historial, s.id, sprintId) : null;
      if (historial && !ingresoEl) {
        problemas.push({
          tarea: s.id,
          campo: "iteration_id",
          valor: sprintId,
          motivo: "el historial no dice cuando entro al sprint: se toma la fecha de creacion",
        });
      }
      const ingresoEstimado = !ingresoEl;
      if (ingresoEstimado) ingresoEl = s.created_at;

      return { ...tarea, ingresoEl, ingresoEstimado };
    });
}

// Las stories que pasaron por el sprint y hoy estan en otro (Shortcut las
// lista en el sprint de destino con `previous_iteration_ids`). Traen cuando
// entraron y cuando salieron del sprint que se mira, y a cual se fueron.
function normalizarMovidas(
  { stories, historiales, iteraciones, workflows, miembros, epics, camposCustom = [], sprintId },
  problemas
) {
  const catalogos = armarCatalogos({ workflows, miembros, epics, camposCustom, stories });
  const nombresDeSprint = new Map(iteraciones.map((i) => [i.id, i.name]));
  return stories
    .filter((s) => !s.archived)
    .map((s) => {
      const tarea = traducirStory(s, catalogos, problemas);
      const historial = historiales?.[s.id];
      const paso = historial ? pasoPorSprint(historial, s.id, sprintId) : { entro: null, salio: null };
      if (historial && !paso.entro) {
        problemas.push({
          tarea: s.id,
          campo: "iteration_id",
          valor: sprintId,
          motivo: "el historial no dice cuando entro al sprint del que se movio: se toma la fecha de creacion",
        });
      }
      return {
        ...tarea,
        ingresoEl: paso.entro ?? s.created_at,
        ingresoEstimado: !paso.entro,
        salioEl: paso.salio,
        movidaA: { id: s.iteration_id, nombre: nombresDeSprint.get(s.iteration_id) ?? null },
      };
    });
}

// @decision 2026-09-30 ramiro@mispichos.com
// El avance cuenta todas las stories no archivadas del sprint, subtareas
// incluidas, que es como las cuenta Shortcut en las estadisticas de la iteracion:
// asi el numero de esta pantalla y el de Shortcut coinciden. Se descarto contar
// solo historias (stories sin parent): en el Sprint 1 hay 9 historias y 47
// subtareas, y el avance quedaria en 0% hasta cerrar una historia entera. En
// puntos, una tarea sin estimar suma 0 y se informa cuantas hay, porque el
// porcentaje de puntos solo habla de lo estimado.
export function resumir(tareas, archivadas) {
  const terminadas = tareas.filter((t) => t.terminada);
  const enCurso = tareas.filter((t) => t.etapa === ETAPAS.started).length;
  const puntosTotales = sumar(tareas.map((t) => t.puntos ?? 0));
  const puntosTerminados = sumar(terminadas.map((t) => t.puntos ?? 0));

  return {
    tareas: {
      total: tareas.length,
      terminadas: terminadas.length,
      enCurso,
      pendientes: tareas.length - terminadas.length - enCurso,
      pct: porcentaje(terminadas.length, tareas.length),
      subtareas: tareas.filter((t) => t.historia).length,
      archivadas,
    },
    puntos: {
      total: puntosTotales,
      terminados: puntosTerminados,
      pct: porcentaje(puntosTerminados, puntosTotales),
      tareasSinEstimar: tareas.filter((t) => t.puntos === null).length,
    },
  };
}

// Las columnas de los workflows que usan las tareas del sprint, en el orden del
// tablero y con las vacias incluidas: "0 listas para deploy" tambien informa.
function contarPorEstado(tareas, workflows) {
  const usados = new Set(tareas.map((t) => t.workflowId));
  const filas = new Map();
  for (const workflow of workflows.filter((w) => usados.has(w.id))) {
    for (const estado of [...workflow.states].sort((a, b) => a.position - b.position)) {
      filas.set(estado.id, {
        id: estado.id,
        nombre: estado.name,
        etapa: ETAPAS[estado.type] ?? ETAPAS.unstarted,
        tareas: 0,
        puntos: 0,
      });
    }
  }
  for (const tarea of tareas) {
    if (!filas.has(tarea.estadoId)) {
      filas.set(tarea.estadoId, {
        id: tarea.estadoId,
        nombre: tarea.estado,
        etapa: tarea.etapa,
        tareas: 0,
        puntos: 0,
      });
    }
    const fila = filas.get(tarea.estadoId);
    fila.tareas++;
    fila.puntos += tarea.puntos ?? 0;
  }
  return [...filas.values()];
}

const paraLista = (t) => ({
  id: t.id,
  titulo: t.titulo,
  url: t.url,
  estado: t.estado,
  etapa: t.etapa,
  epic: t.epic,
  responsables: t.responsables,
  puntos: t.puntos,
  historia: t.historia,
  terminadaEl: t.terminadaEl,
});

function diasDelSprint(inicio, fin) {
  const dias = [];
  for (let n = numeroDeDia(inicio); n <= numeroDeDia(fin); n++) {
    dias.push(new Date(n * MS_POR_DIA).toISOString().slice(0, 10));
  }
  return dias;
}

// @decision 2026-09-30 ramiro@mispichos.com
// El burndown se reconstruye dia por dia con tres fechas de cada tarea: cuando
// entro al sprint (del historial de Shortcut), cuando se termino (completed_at o
// su override) y el corte de dia de Buenos Aires. El pendiente de un dia es lo
// que ya estaba en el sprint al cierre de ese dia y todavia no estaba terminado;
// lo que entro antes del inicio cuenta desde el primer dia. Los dias que
// todavia no pasaron van en null: no se proyecta nada.
//
// @decision 2026-10-18 ramiro@mispichos.com
// La linea ideal baja en linea recta, por dias corridos, del alcance de hoy (lo
// que esta hoy en el sprint, sin lo que se movio a otro) hasta 0 el ultimo dia.
// Se descarto arrancarla del alcance al cierre del primer dia: el equipo carga
// el sprint durante la primera semana (el Sprint 2 empezo el 7/10 con 1 tarea y
// el 13/10 entraron 42), y la linea saldria de una o dos tareas.
// Los puntos son la estimacion actual de cada tarea. Limitacion de la API: solo
// lista las tareas que hoy estan en el sprint, asi que una que se saco a mitad
// de camino no aparece en ningun dia.
export function calcularBurndown(tareas, sprint, ahora) {
  const hoy = diaLocal(ahora);
  const dias = diasDelSprint(sprint.inicio, sprint.fin);
  const fechas = tareas.map((t) => {
    const entra = diaLocal(t.ingresoEl);
    return {
      puntos: t.puntos ?? 0,
      entra: entra < sprint.inicio ? sprint.inicio : entra,
      // Terminada sin fecha (ya reportada): se da por terminada hoy, asi el
      // ultimo punto del grafico coincide con el resumen.
      sale: t.terminada ? (t.terminadaEl ? diaLocal(t.terminadaEl) : hoy) : null,
    };
  });

  const medir = (dia) => {
    const adentro = fechas.filter((f) => f.entra <= dia);
    const pendientes = adentro.filter((f) => !(f.sale !== null && f.sale <= dia));
    return {
      tareas: pendientes.length,
      puntos: sumar(pendientes.map((f) => f.puntos)),
      alcanceTareas: adentro.length,
      alcancePuntos: sumar(adentro.map((f) => f.puntos)),
    };
  };

  const total = { tareas: fechas.length, puntos: sumar(fechas.map((f) => f.puntos)) };
  const tramos = Math.max(dias.length - 1, 1);
  const SIN_MEDIR = { tareas: null, puntos: null, alcanceTareas: null, alcancePuntos: null };

  const serie = dias.map((dia, i) => ({
    dia,
    ...(dia <= hoy ? medir(dia) : SIN_MEDIR),
    idealTareas: conUnDecimal(total.tareas * (1 - i / tramos)),
    idealPuntos: conUnDecimal(total.puntos * (1 - i / tramos)),
  }));

  const cambiosDeAlcance = [];
  for (let i = 1; i < serie.length && serie[i].alcanceTareas !== null; i++) {
    const tareasNuevas = serie[i].alcanceTareas - serie[i - 1].alcanceTareas;
    const puntosNuevos = serie[i].alcancePuntos - serie[i - 1].alcancePuntos;
    if (tareasNuevas > 0 || puntosNuevos > 0) {
      cambiosDeAlcance.push({ dia: serie[i].dia, tareas: tareasNuevas, puntos: puntosNuevos });
    }
  }

  return {
    dias: serie,
    alcance: total,
    cambiosDeAlcance,
    ingresosEstimados: tareas.filter((t) => t.ingresoEstimado).length,
  };
}

// @decision 2026-09-30 ramiro@mispichos.com
// El flujo acumulado (cumulative flow) reparte, al cierre de cada dia, las
// tareas que ya estaban en el sprint entre las tres etapas de negocio: terminada
// si su fecha de fin ya paso, en curso si ya se habia empezado (started_at o su
// override) y todavia no terminado, pendiente el resto. Son las mismas fechas y
// el mismo corte de dia que el burndown, asi las dos curvas cuentan lo mismo;
// no se reconstruye columna por columna del tablero porque negocio lee etapas,
// no columnas. Una terminada sin fecha de inicio pasa de pendiente a terminada
// sin pisar "en curso": no se inventa cuando empezo. Los dias que no pasaron
// van en null. Se mide en tareas, no en puntos: lo que muestra este grafico es
// donde se acumula el trabajo, y ahi una tarea sin estimar pesa igual que otra.
export function calcularFlujo(tareas, sprint, ahora) {
  const hoy = diaLocal(ahora);
  const fechas = tareas.map((t) => {
    const entra = diaLocal(t.ingresoEl);
    return {
      entra: entra < sprint.inicio ? sprint.inicio : entra,
      empieza: t.empezadaEl ? diaLocal(t.empezadaEl) : null,
      termina: t.terminada ? (t.terminadaEl ? diaLocal(t.terminadaEl) : hoy) : null,
    };
  });

  const medir = (dia) => {
    const adentro = fechas.filter((f) => f.entra <= dia);
    const terminadas = adentro.filter((f) => f.termina !== null && f.termina <= dia);
    const enCurso = adentro.filter(
      (f) => !(f.termina !== null && f.termina <= dia) && f.empieza !== null && f.empieza <= dia
    );
    return {
      terminadas: terminadas.length,
      enCurso: enCurso.length,
      pendientes: adentro.length - terminadas.length - enCurso.length,
    };
  };
  const SIN_MEDIR = { terminadas: null, enCurso: null, pendientes: null };

  return {
    dias: diasDelSprint(sprint.inicio, sprint.fin).map((dia) => ({
      dia,
      ...(dia <= hoy ? medir(dia) : SIN_MEDIR),
    })),
  };
}

const SIN_INICIATIVA = "Sin iniciativa";
const SIN_ASIGNAR = "Sin asignar";

// Reparte las tareas en grupos y cuenta, por grupo, cuantas hay en cada etapa y
// cuantos puntos. `gruposDe` devuelve los nombres de grupo de una tarea (una
// tarea puede estar en varios). Los grupos van del mas cargado al menos.
function agrupar(tareas, gruposDe) {
  const grupos = new Map();
  for (const tarea of tareas) {
    for (const nombre of gruposDe(tarea)) {
      if (!grupos.has(nombre)) {
        grupos.set(nombre, {
          nombre,
          total: 0,
          terminadas: 0,
          enCurso: 0,
          pendientes: 0,
          puntos: 0,
          puntosTerminados: 0,
        });
      }
      const grupo = grupos.get(nombre);
      grupo.total++;
      if (tarea.terminada) grupo.terminadas++;
      else if (tarea.etapa === ETAPAS.started) grupo.enCurso++;
      else grupo.pendientes++;
      grupo.puntos += tarea.puntos ?? 0;
      if (tarea.terminada) grupo.puntosTerminados += tarea.puntos ?? 0;
    }
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, pct: porcentaje(g.terminadas, g.total) }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

// Avance por iniciativa: el epic de cada tarea. Las que no tienen epic van
// juntas en "Sin iniciativa", que se muestra igual: son trabajo del sprint que
// nadie encuadro y eso tambien es un dato.
export function avancePorIniciativa(tareas) {
  return { grupos: agrupar(tareas, (t) => [t.epic ?? SIN_INICIATIVA]) };
}

// El campo custom de Shortcut que dice que tipo de trabajo es cada tarea
// (Frontend, Backend, Product, Design, Analytics). Es el nombre con el que esta
// creado en el workspace: si lo renombran en Shortcut, hay que cambiarlo aca.
export const CAMPO_TIPO_DE_TRABAJO = "Skill Set";
const SIN_TIPO_DE_TRABAJO = "Sin tipo de trabajo";

// @decision 2026-10-18 ramiro@mispichos.com
// Avance por tipo de trabajo: las tareas agrupadas por el Skill Set que el
// equipo carga en cada una en Shortcut, partidas por etapa. Es lo que Shortcut
// sabe de la tarea; el rol es de la persona y sale de data/equipo.json, asi que
// los dos cortes se miran juntos. Las que no lo tienen cargado van juntas y se
// muestran igual: tambien es un dato.
//
// `camposCustom` es el catalogo de Shortcut: null si no se pudo leer. Sin
// catalogo, o si el workspace no tiene el campo, no se agrupa nada: todo
// caeria en "Sin tipo de trabajo" y diria que nadie lo cargo, cuando lo que
// pasa es que no se pudo saber. `motivo` lo dice ("sin-catalogo", "sin-campo").
export function avancePorEspecialidad(tareas, camposCustom = []) {
  if (camposCustom === null) return { grupos: [], motivo: "sin-catalogo" };
  if (!camposCustom.some((c) => c.name === CAMPO_TIPO_DE_TRABAJO)) {
    return { grupos: [], motivo: "sin-campo" };
  }
  return {
    grupos: agrupar(tareas, (t) => [t.campos?.[CAMPO_TIPO_DE_TRABAJO] ?? SIN_TIPO_DE_TRABAJO]),
    motivo: null,
  };
}

// @decision 2026-09-30 ramiro@mispichos.com
// Carga por responsable: una tarea con dos responsables cuenta entera para
// cada uno, porque lo que se quiere ver es cuanto tiene cada persona en la
// mesa, no repartir el credito. Por eso los totales por persona pueden sumar
// mas que el total del sprint, y se informa cuantas tareas estan compartidas.
// Las sin responsable van en "Sin asignar": en un sprint en curso, es lo que
// hay que mirar primero.
export function cargaPorResponsable(tareas) {
  return {
    grupos: agrupar(tareas, (t) => (t.responsables.length > 0 ? t.responsables : [SIN_ASIGNAR])),
    compartidas: tareas.filter((t) => t.responsables.length > 1).length,
  };
}

// @decision 2026-09-30 ramiro@mispichos.com
// El cycle time de una tarea va de su inicio (started_at) a su fin
// (completed_at), con los overrides si los hay: es la definicion de Shortcut y
// da lo mismo que su campo `cycle_time`. En dias corridos, no habiles. Se informa
// promedio y mediana porque con pocas tareas una sola que quedo abierta semanas
// mueve mucho el promedio. Las terminadas sin fecha de inicio no se miden y se
// cuentan aparte.
export function calcularCycleTime(tareas, problemas) {
  const medidas = [];
  let sinDatos = 0;
  for (const t of tareas.filter((t) => t.terminada)) {
    if (!t.empezadaEl || !t.terminadaEl) {
      sinDatos++;
      continue;
    }
    const dias = (Date.parse(t.terminadaEl) - Date.parse(t.empezadaEl)) / MS_POR_DIA;
    if (!(dias >= 0)) {
      problemas.push({
        tarea: t.id,
        campo: "started_at",
        valor: t.empezadaEl,
        motivo: "la tarea figura terminada antes de empezada: no se mide",
      });
      sinDatos++;
      continue;
    }
    medidas.push({ id: t.id, titulo: t.titulo, dias: Math.round(dias * 100) / 100 });
  }

  const valores = medidas.map((m) => m.dias);
  return {
    promedioDias: valores.length ? conUnDecimal(sumar(valores) / valores.length) : null,
    medianaDias: valores.length ? conUnDecimal(mediana(valores)) : null,
    tareas: medidas.sort((a, b) => b.dias - a.dias || a.id - b.id),
    sinDatos,
  };
}

// @decision 2026-10-04 ramiro@mispichos.com
// Entradas y salidas por dia: cuantas tareas entraron al sprint y cuantas se
// terminaron cada dia, solo hasta hoy (no se dibujan dias vacios a futuro). Lo
// que entro antes del inicio se cuenta el primer dia, igual que en el burndown,
// asi la primera barra es el alcance con el que arranco el sprint. Una tarea
// que se sumo ya terminada entra y se termina el mismo dia.
export function calcularRitmo(tareas, sprint, ahora) {
  const hoy = diaLocal(ahora);
  const diaDeEntrada = (t) => {
    const entra = diaLocal(t.ingresoEl);
    return entra < sprint.inicio ? sprint.inicio : entra;
  };
  const diaDeFin = (t) => (t.terminadaEl ? diaLocal(t.terminadaEl) : hoy);
  return {
    dias: diasDelSprint(sprint.inicio, sprint.fin)
      .filter((dia) => dia <= hoy)
      .map((dia) => ({
        dia,
        entraron: tareas.filter((t) => diaDeEntrada(t) === dia).length,
        terminadas: tareas.filter((t) => t.terminada && diaDeFin(t) === dia).length,
      })),
  };
}

// @decision 2026-10-04 ramiro@mispichos.com
// La proyeccion es una regla de tres: las terminadas por dia transcurrido, por
// los dias que quedan. Es una estimacion y no un dato de Shortcut, y la
// pantalla la nombra asi. Solo para un sprint en curso con al menos un dia
// completo transcurrido; en uno terminado o que no empezo es null. Los dias
// transcurridos son los completos (hoy no cuenta, porque todavia no cerro) y los
// restantes incluyen hoy, igual que la tarjeta de dias restantes.
function proyectar(tareas, sprint, ahora) {
  const hoy = diaLocal(ahora);
  if (hoy < sprint.inicio || hoy > sprint.fin) return null;
  const diasTranscurridos = diasEntre(sprint.inicio, hoy);
  if (diasTranscurridos < 1) return null;
  const terminadas = tareas.filter((t) => t.terminada).length;
  const terminadasPorDia = terminadas / diasTranscurridos;
  const terminadasAlCierre = Math.min(
    tareas.length,
    Math.round(terminadas + terminadasPorDia * sprint.diasRestantes)
  );
  return {
    diasTranscurridos,
    terminadasPorDia: conUnDecimal(terminadasPorDia),
    terminadasAlCierre,
    total: tareas.length,
    pct: porcentaje(terminadasAlCierre, tareas.length),
  };
}

// Si una tarea que hoy esta en otro sprint estuvo en `sprint` al cierre de al
// menos uno de sus dias (ver calcularCumplimiento). La usa tambien armarReporte
// para que la efectividad cuente las mismas movidas que el cumplimiento.
export function estuvoEnElSprint(tarea, sprint) {
  const ingreso = diaLocal(tarea.ingresoEl);
  const desde = ingreso > sprint.inicio ? ingreso : sprint.inicio;
  if (desde > sprint.fin) return false;
  return tarea.salioEl == null || diaLocal(tarea.salioEl) > desde;
}

// @decision 2026-10-18 ramiro@mispichos.com
// Lo planificado del sprint es todo lo que paso por el: las tareas que hoy
// estan adentro mas las que se movieron a otro sprint. No se distingue lo que
// estaba el primer dia de lo que entro despues: el equipo carga el sprint
// durante la primera semana (el Sprint 2 arranco el 7/10 y sus 42 tareas
// entraron el 13/10) y desglosa las historias en subtareas con el sprint
// andando, asi que "comprometido al cierre del primer dia" dejaba casi todo
// como agregado y la efectividad no decia nada. Cumplido es lo planificado que
// se termino; una tarea movida a otro sprint cuenta como planificada y no
// cumplida: sacarla del sprint no la vuelve cumplida. Pero solo si estuvo en
// el sprint al cierre de al menos uno de sus dias: la que salio antes de que
// empezara, o el mismo dia en que entro, nunca fue trabajo de ese sprint (las
// 12 subtareas del Sprint 1 que se crearon en el Sprint 2 y se pasaron al 1 el
// 7/10, ya terminadas). `tareas` son las que hoy estan en el sprint y `movidas`
// las que pasaron por el y hoy estan en otro.
export function calcularCumplimiento(tareas, movidas, sprint, ahora) {
  movidas = movidas.filter((t) => estuvoEnElSprint(t, sprint));
  const terminadas = tareas.filter((t) => t.terminada).length;
  const enCurso = tareas.filter((t) => !t.terminada && t.etapa === ETAPAS.started).length;
  const total = tareas.length + movidas.length;

  // Lo planificado que no esta hecho, lo mas avanzado primero y al final lo
  // que se fue a otro sprint: es la lista que se mira en la retrospectiva.
  const sinTerminar = [
    ...tareas
      .filter((t) => !t.terminada)
      .sort((a, b) => b.posicionEstado - a.posicionEstado || a.id - b.id)
      .map((t) => ({ ...paraLista(t), movidaA: null })),
    ...[...movidas].sort((a, b) => a.id - b.id).map((t) => ({ ...paraLista(t), movidaA: t.movidaA })),
  ];

  return {
    planificadas: {
      total,
      terminadas,
      enCurso,
      pendientes: tareas.length - terminadas - enCurso,
      movidas: movidas.length,
      pct: porcentaje(terminadas, total),
    },
    sinTerminar,
    proyeccion: proyectar(tareas, sprint, ahora),
  };
}

// @decision 2026-10-18 ramiro@mispichos.com
// El proyecto, para prorratear las horas pactadas: va del inicio del primer
// sprint al fin configurado en data/equipo.json (horasPactadas.finDelProyecto)
// o, si no esta o es anterior, al fin del ultimo sprint cargado. Las horas
// pactadas son por persona para todo el proyecto (unas 150 h cada uno, dijo el
// equipo), asi que la capacidad de un periodo es esa cifra por la parte del
// proyecto que el periodo ocupa: un sprint de 15 dias en un proyecto de 30
// vale la mitad de las horas.
// Devuelve { inicio, fin, dias, configurado, descartado }: `configurado` si el
// fin sale de la configuracion; `descartado` si habia uno configurado pero
// cae antes del fin del ultimo sprint (los sprints ya cargados no pueden
// quedar afuera del proyecto): quien lo llama lo anota en `problemas`.
export function describirProyecto(iteraciones, { fin = null } = {}) {
  if (iteraciones.length === 0) {
    return { inicio: null, fin, dias: 0, configurado: fin !== null, descartado: false };
  }
  const inicio = iteraciones.map((i) => fechaDeCalendario(i.start_date)).sort()[0];
  const finDeSprints = iteraciones.map((i) => fechaDeCalendario(i.end_date)).sort().at(-1);
  const usaElConfigurado = fin !== null && fin >= finDeSprints;
  const finReal = usaElConfigurado ? fin : finDeSprints;
  return {
    inicio,
    fin: finReal,
    dias: diasEntre(inicio, finReal) + 1,
    configurado: usaElConfigurado,
    descartado: fin !== null && !usaElConfigurado,
  };
}

// El problema que se anota cuando el fin configurado se descarta.
export const problemaDeFinDescartado = (configurado, fin) => ({
  tarea: null,
  campo: "horasPactadas.finDelProyecto",
  valor: configurado,
  motivo: `es anterior al fin del último sprint (${fin}): las horas pactadas se reparten hasta ahí`,
});

// @decision 2026-10-18 ramiro@mispichos.com
// Los dias de cada sprint para repartir las horas pactadas: los de su
// calendario que no cubre un sprint que empezo antes. Asi el dia del cambio (el
// Sprint 1 termina el 7/10 y el 2 empieza el 7/10) cuenta una sola vez, para el
// primero, y las capacidades de los sprints suman la del proyecto en vez de
// pasarse (776 + 776 h contra 1500 pactadas). Si dos sprints se pisan mas que
// ese dia, el de despues pierde los dias compartidos y se informa en
// `solapados`. Devuelve { porSprint: Map(id -> dias), solapados }.
export function repartirDias(iteraciones) {
  const ordenadas = [...iteraciones].sort(
    (a, b) =>
      fechaDeCalendario(a.start_date).localeCompare(fechaDeCalendario(b.start_date)) || a.id - b.id
  );
  const porSprint = new Map();
  const solapados = [];
  let cubiertoHasta = null;
  for (const i of ordenadas) {
    const inicio = fechaDeCalendario(i.start_date);
    const fin = fechaDeCalendario(i.end_date);
    const desde = cubiertoHasta !== null && cubiertoHasta >= inicio ? sumarDias(cubiertoHasta, 1) : inicio;
    const dias = desde > fin ? 0 : diasEntre(desde, fin) + 1;
    const pisados = diasEntre(inicio, fin) + 1 - dias;
    if (pisados > 1) solapados.push({ id: i.id, nombre: i.name, dias: pisados });
    porSprint.set(i.id, dias);
    if (cubiertoHasta === null || fin > cubiertoHasta) cubiertoHasta = fin;
  }
  return { porSprint, solapados };
}

export const problemaDeSolapado = (s) => ({
  tarea: null,
  campo: "sprints",
  valor: s.id,
  motivo: `el sprint "${s.nombre}" se pisa ${s.dias} días con uno anterior: para repartir las horas pactadas, esos días cuentan para el anterior`,
});

// @decision 2026-10-04 ramiro@mispichos.com
// Tiempo en el sprint: desde el dia en que la tarea entro al sprint (o el
// primer dia del sprint, si entro antes) hasta el dia en que se termino, en
// dias de calendario de Buenos Aires: 0 es "el mismo dia". Es lo que ve
// negocio: cuanto tarda algo desde que se planifica hasta que esta hecho, pase
// o no por "In Progress", que es lo que el cycle time no puede medir cuando las
// tarjetas van directo a Done. Las terminadas sin fecha de fin no se miden.
export function calcularTiempoEnSprint(tareas, sprint) {
  const medidas = [];
  let sinDatos = 0;
  for (const t of tareas.filter((t) => t.terminada)) {
    if (!t.terminadaEl) {
      sinDatos++;
      continue;
    }
    const entra = diaLocal(t.ingresoEl);
    const desde = entra < sprint.inicio ? sprint.inicio : entra;
    const dias = Math.max(0, diasEntre(desde, diaLocal(t.terminadaEl)));
    medidas.push({ id: t.id, titulo: t.titulo, dias });
  }
  const valores = medidas.map((m) => m.dias);
  return {
    promedioDias: valores.length ? conUnDecimal(sumar(valores) / valores.length) : null,
    medianaDias: valores.length ? conUnDecimal(mediana(valores)) : null,
    tareas: medidas.sort((a, b) => b.dias - a.dias || a.id - b.id),
    sinDatos,
  };
}

// Los tramos que paso una story por cada columna, segun su historial: el
// estado con el que se creo (la accion `create` lo trae) y cada cambio de
// `workflow_state_id`. El ultimo tramo cierra en la fecha de terminacion.
function estadiasPorColumna(historial, tarea) {
  const estadias = [];
  let estadoActual = null;
  let desde = null;
  const cerrar = (hasta) => {
    if (estadoActual !== null && desde && hasta && Date.parse(hasta) >= Date.parse(desde)) {
      estadias.push({ estadoId: estadoActual, desde, hasta });
    }
  };
  for (const { cambio, accion } of accionesDeLaStory(historial, tarea.id)) {
    if (accion.action === "create" && accion.workflow_state_id != null) {
      estadoActual = accion.workflow_state_id;
      desde = cambio.changed_at;
      continue;
    }
    const estado = accion.action === "update" ? accion.changes?.workflow_state_id : null;
    if (!estado) continue;
    if (estadoActual === null && estado.old != null) {
      estadoActual = estado.old;
      desde = tarea.creadaEl;
    }
    cerrar(cambio.changed_at);
    estadoActual = estado.new;
    desde = cambio.changed_at;
  }
  cerrar(tarea.terminadaEl);
  return estadias;
}

// @decision 2026-10-04 ramiro@mispichos.com
// Tiempo por columna: cuanto estuvo cada tarea terminada en cada columna del
// tablero, desde que se creo hasta que se termino, reconstruido del historial.
// Es la unica forma de ver donde se demora el trabajo (por ejemplo en revision)
// cuando el cycle time da cero porque las tarjetas saltan de "To Do" a "Done".
// Dias corridos con decimales. Las columnas de tipo done no se miden: ahi ya no
// hay trabajo. Una tarea que paso dos veces por la misma columna suma los dos
// tramos. Las terminadas sin historial (o con un historial que no trae estados)
// no se miden y se cuentan aparte.
export function calcularTiempoPorColumna(tareas, historiales, workflows) {
  const estados = indexarEstados(workflows);
  const columnas = new Map();
  let medidas = 0;
  let sinDatos = 0;

  for (const t of tareas.filter((t) => t.terminada)) {
    const historial = historiales?.[t.id];
    const estadias = historial && t.terminadaEl ? estadiasPorColumna(historial, t) : [];
    if (estadias.length === 0) {
      sinDatos++;
      continue;
    }
    medidas++;
    const porEstado = new Map();
    for (const e of estadias) {
      const dias = (Date.parse(e.hasta) - Date.parse(e.desde)) / MS_POR_DIA;
      porEstado.set(e.estadoId, (porEstado.get(e.estadoId) ?? 0) + dias);
    }
    for (const [estadoId, dias] of porEstado) {
      const estado = estados.get(estadoId);
      if (estado?.tipo === "done") continue;
      if (!columnas.has(estadoId)) {
        columnas.set(estadoId, {
          id: estadoId,
          nombre: estado?.nombre ?? "Estado desconocido",
          etapa: estado ? (ETAPAS[estado.tipo] ?? ETAPAS.unstarted) : ETAPAS.unstarted,
          posicion: estado?.posicion ?? -1,
          dias: [],
        });
      }
      columnas.get(estadoId).dias.push(dias);
    }
  }

  return {
    columnas: [...columnas.values()]
      .sort((a, b) => a.posicion - b.posicion)
      .map(({ dias, posicion, ...columna }) => ({
        ...columna,
        tareas: dias.length,
        diasTotales: conUnDecimal(sumar(dias)),
        promedioDias: conUnDecimal(sumar(dias) / dias.length),
        medianaDias: conUnDecimal(mediana(dias)),
      })),
    medidas,
    sinDatos,
  };
}

// La etiqueta de Shortcut que saca a una tarea del retrabajo: la pone el equipo
// cuando una vuelta atras no fue un error. Se compara sin mayusculas ni los
// espacios de los costados.
export const ETIQUETA_SIN_RETRABAJO = "no-es-retrabajo";

// Cuanto tiene que quedarse una tarjeta en una columna para que salir de ella
// cuente como vuelta atras: antes es una tarjeta mal movida que se corrige al
// toque (en el Sprint 1 fueron seis, todas en el mismo minuto).
export const MINUTOS_DE_CORRECCION = 10;

// Lo que en el historial de una story es codigo: el push a una rama vinculada
// (Shortcut vincula la rama que lleva el numero de la story, feat-sc-63), un
// commit o un PR, y la story sumando ramas, commits o PRs.
const ENTIDADES_DE_CODIGO = new Set(["branch", "commit", "pull-request"]);
const CAMPOS_DE_CODIGO = ["branch_ids", "commit_ids", "pull_request_ids"];

// Los cambios de columna de una story, en orden: la columna con la que se creo
// (`creacion`) y cada cambio de `workflow_state_id`, con quien lo hizo.
function cambiosDeColumna(historial, storyId) {
  const cambios = [];
  for (const { cambio, accion } of accionesDeLaStory(historial, storyId)) {
    const quien = cambio.member_id ?? null;
    if (accion.action === "create" && accion.workflow_state_id != null) {
      cambios.push({ el: cambio.changed_at, quien, creacion: true, desde: null, hacia: accion.workflow_state_id });
      continue;
    }
    const estado = accion.action === "update" ? accion.changes?.workflow_state_id : null;
    if (estado) {
      cambios.push({ el: cambio.changed_at, quien, creacion: false, desde: estado.old ?? null, hacia: estado.new });
    }
  }
  return cambios;
}

// Si hubo codigo nuevo para la story entre dos instantes (`hasta` null es sin
// tope). El historial de una historia tambien trae acciones de sus subtareas:
// un cambio que nombra a otra story y no a esta no cuenta.
function huboCodigoEntre(historial, storyId, desde, hasta) {
  const inicio = Date.parse(desde);
  const fin = hasta ? Date.parse(hasta) : Infinity;
  return historial.some((cambio) => {
    const en = Date.parse(cambio.changed_at);
    if (!(en > inicio && en <= fin)) return false;
    const acciones = cambio.actions ?? [];
    const deStories = acciones.filter((a) => a.entity_type === "story");
    if (deStories.length > 0 && !deStories.some((a) => a.id === storyId)) return false;
    return acciones.some(
      (a) =>
        ENTIDADES_DE_CODIGO.has(a.entity_type) ||
        (a.entity_type === "story" && a.id === storyId && CAMPOS_DE_CODIGO.some((k) => a.changes?.[k]))
    );
  });
}

// @decision 2026-10-21 ramiro@mispichos.com
// Retrabajo (OKR): las tareas que volvieron atras despues de presentarse o de
// cerrarse, sobre las que se cerraron alguna vez. Volver atras es pasar, segun
// el historial de Shortcut, de una columna de trabajo (tipo started: In
// Progress, In Review, Ready for deploy) o de Done a una columna de trabajo
// anterior del mismo workflow: la revision encontro algo, o aparecio un error
// despues de cerrar. No cuentan:
//   - volver a To Do o Backlog (tipos unstarted y backlog): es replanificar o
//     pausar, no corregir;
//   - salir de una columna antes de MINUTOS_DE_CORRECCION: es una tarjeta mal
//     movida que se corrige al toque;
//   - las tareas con la etiqueta ETIQUETA_SIN_RETRABAJO, que el equipo pone
//     cuando una vuelta no fue un error: se listan aparte.
// Una tarea cuenta una vez aunque vuelva varias. Las que nunca se cerraron no
// entran todavia, ni arriba ni abajo: se cuentan cuando se cierran, asi el
// porcentaje es siempre sobre trabajo entregado. Las terminadas sin historial
// no entran en la cuenta y se informan. Cada vuelta dice si hubo codigo nuevo
// entre la vuelta y el nuevo cierre (o hasta ahora, si sigue abierta), que es
// la evidencia de que se rehizo algo; sin rama vinculada no se ve, y eso no
// quiere decir que no lo hubo. Se valido el 2026-10-21 contra los cinco casos
// de la primera cuenta: las tres subtareas de backend reabiertas a los cinco
// dias tienen commits despues en el repo (no vinculados en Shortcut, la rama
// era feat/maxi) y cuentan; HG-11, cerrada sin trabajarla y devuelta a
// Backlog, y HG-13, movida a una columna equivocada y corregida en el mismo
// minuto, no.
export function calcularRetrabajo(tareas, historiales, workflows, { miembros = [], ahora = null } = {}, problemas = []) {
  const estados = indexarEstados(workflows);
  const personas = new Map(miembros.map((m) => [m.id, nombreDePersona(m)]));
  const ahoraIso = ahora ? new Date(ahora).toISOString() : null;
  const etiqueta = ETIQUETA_SIN_RETRABAJO.toLowerCase();
  const casos = [];
  const excluidas = [];
  const descartadas = { replanificadas: 0, correcciones: 0 };
  let cerradas = 0;
  let sinHistorial = 0;

  for (const t of tareas) {
    const historial = historiales?.[t.id];
    if (!historial) {
      if (t.terminada) sinHistorial++;
      continue;
    }
    const cambios = cambiosDeColumna(historial, t.id);
    const esCierre = (c) => estados.get(c.hacia)?.tipo === "done";
    if (!t.terminada && !cambios.some(esCierre)) continue;
    cerradas++;

    const vueltas = [];
    const desconocidos = new Set();
    // Desde cuando esta en la columna de la que sale: sin la creacion en el
    // historial, desde que se creo la tarea.
    let entroEl = t.creadaEl ?? null;
    for (const [i, c] of cambios.entries()) {
      if (!c.creacion) {
        const de = estados.get(c.desde);
        const a = estados.get(c.hacia);
        if (c.desde != null && !de) desconocidos.add(c.desde);
        if (c.hacia != null && !a) desconocidos.add(c.hacia);
        const atras =
          de && a && de.workflowId === a.workflowId && a.posicion < de.posicion &&
          (de.tipo === "started" || de.tipo === "done");
        if (atras) {
          const minutos = entroEl ? (Date.parse(c.el) - Date.parse(entroEl)) / 60000 : Infinity;
          if (a.tipo !== "started") descartadas.replanificadas++;
          else if (minutos < MINUTOS_DE_CORRECCION) descartadas.correcciones++;
          else {
            const cierre = cambios.slice(i + 1).find(esCierre)?.el ?? ahoraIso;
            vueltas.push({
              el: c.el,
              quien: c.quien ? (personas.get(c.quien) ?? null) : null,
              desde: de.nombre,
              hacia: a.nombre,
              reapertura: de.tipo === "done",
              conCodigoNuevo: huboCodigoEntre(historial, t.id, c.el, cierre),
            });
          }
        }
      }
      entroEl = c.el;
    }
    if (desconocidos.size > 0) {
      problemas.push({
        tarea: t.id,
        campo: "historial",
        valor: [...desconocidos].join(", "),
        motivo: "el historial pasa por columnas que no están en ningún workflow: esos cambios no se miran para el retrabajo",
      });
    }
    if (vueltas.length === 0) continue;
    const caso = {
      id: t.id,
      titulo: t.titulo,
      url: t.url,
      historia: t.historia ?? null,
      responsables: t.responsables ?? [],
      terminada: t.terminada,
      vueltas,
      conCodigoNuevo: vueltas.some((v) => v.conCodigoNuevo),
    };
    const conEtiqueta = (t.etiquetas ?? []).some((e) => e.trim().toLowerCase() === etiqueta);
    (conEtiqueta ? excluidas : casos).push(caso);
  }

  // La vuelta mas reciente primero: es la que todavia se puede conversar.
  const ultima = (c) => Date.parse(c.vueltas.at(-1).el);
  const porReciente = (a, b) => ultima(b) - ultima(a) || a.id - b.id;
  return {
    cerradas,
    conRetrabajo: casos.length,
    pct: porcentaje(casos.length, cerradas),
    reabiertas: casos.filter((c) => c.vueltas.some((v) => v.reapertura)).length,
    devueltas: casos.filter((c) => c.vueltas.some((v) => !v.reapertura)).length,
    conCodigoNuevo: casos.filter((c) => c.conCodigoNuevo).length,
    vueltas: sumar(casos.map((c) => c.vueltas.length)),
    casos: casos.sort(porReciente),
    excluidas: excluidas.sort(porReciente),
    descartadas,
    sinHistorial,
    etiqueta: ETIQUETA_SIN_RETRABAJO,
    minutosDeCorreccion: MINUTOS_DE_CORRECCION,
  };
}

// La lectura mas vieja manda: si una parte del reporte salio del cache, el
// reporte entero es de esa hora.
const instante = (iso) => Date.parse(iso ?? "") || 0;

// El reporte completo de un sprint. `entrada` son las respuestas crudas de
// Shortcut: todas las iteraciones, la iteracion elegida y lo que devuelve
// obtenerSprint(). `leidoEl` son los instantes en que se leyo cada parte y
// `problemas` los que ya encontro la lectura (historiales que no se pudieron leer).
export function armarReporte(
  {
    iteraciones,
    iteracion,
    stories,
    workflows,
    miembros,
    epics,
    camposCustom = [],
    historiales,
    movidas,
    conteos = null,
  },
  { ahora, leidoEl = [], problemas: problemasDeLectura = [], equipo = EQUIPO_VACIO }
) {
  const problemas = [...problemasDeLectura];
  const tareas = normalizarTareas(
    { stories, workflows, miembros, epics, camposCustom, historiales, sprintId: iteracion.id },
    problemas
  );
  const archivadas = stories.length - tareas.length;
  const sprint = describirSprint(iteracion, ahora);
  const tareasMovidas = normalizarMovidas(
    {
      stories: movidas?.stories ?? [],
      historiales: movidas?.historiales,
      iteraciones,
      workflows,
      miembros,
      epics,
      camposCustom,
      sprintId: iteracion.id,
    },
    problemas
  );

  const terminadas = tareas
    .filter((t) => t.terminada)
    .sort((a, b) => instante(b.terminadaEl) - instante(a.terminadaEl));
  const pendientes = tareas
    .filter((t) => !t.terminada)
    .sort((a, b) => b.posicionEstado - a.posicionEstado || a.id - b.id);

  // Las horas pactadas son por proyecto: el sprint recibe la parte de sus dias
  // propios (repartirDias) sobre los del proyecto (describirProyecto). Las
  // movidas que cuentan como planificadas entran en la efectividad, igual que
  // en el cumplimiento: sacar lo pendiente no la sube.
  const configurado = equipo.horasPactadas?.finDelProyecto ?? null;
  const proyecto = describirProyecto(iteraciones, { fin: configurado });
  if (proyecto.descartado) problemas.push(problemaDeFinDescartado(configurado, proyecto.fin));
  const reparto = repartirDias(iteraciones);
  for (const s of reparto.solapados.filter((x) => x.id === iteracion.id)) problemas.push(problemaDeSolapado(s));
  const retrabajo = calcularRetrabajo(tareas, historiales, workflows, { miembros, ahora }, problemas);
  const datosDeEquipo = armarEquipo(
    tareas,
    {
      ...sprint,
      diasParaHoras: reparto.porSprint.get(iteracion.id) ?? sprint.diasTotales,
      diasDelProyecto: proyecto.dias,
      finDelReparto: proyecto.fin,
      repartoConfigurado: proyecto.configurado,
    },
    equipo,
    {
      bugsRegistrados: conteos?.bugs ?? null,
      movidas: tareasMovidas.filter((t) => estuvoEnElSprint(t, sprint)),
      retrabajo,
    }
  );
  const resumen = resumir(tareas, archivadas);

  return {
    sprint,
    sprints: listarSprints(iteraciones),
    resumen,
    porEstado: contarPorEstado(tareas, workflows),
    burndown: calcularBurndown(tareas, sprint, ahora),
    flujo: calcularFlujo(tareas, sprint, ahora),
    porIniciativa: avancePorIniciativa(tareas),
    porEspecialidad: avancePorEspecialidad(tareas, camposCustom),
    porResponsable: cargaPorResponsable(tareas),
    cumplimiento: calcularCumplimiento(tareas, tareasMovidas, sprint, ahora),
    ritmo: calcularRitmo(tareas, sprint, ahora),
    cycleTime: calcularCycleTime(tareas, problemas),
    tiempoEnSprint: calcularTiempoEnSprint(tareas, sprint),
    tiempoPorColumna: calcularTiempoPorColumna(tareas, historiales, workflows),
    // Roles, carga, horas, retrabajo y OKRs del sprint.
    equipo: datosDeEquipo,
    // El proyecto entero: todos los sprints y los bugs de todo el workspace. El
    // sprint que se mira se cuenta desde sus stories, igual que el resto de la
    // pantalla (ver progresoDelProyecto).
    proyecto: {
      progreso: progresoDelProyecto(
        iteraciones,
        { stories: conteos?.stories ?? null, desdeStories: [{ id: iteracion.id, resumen }] },
        problemas
      ),
      errores: erroresDelProyecto(conteos, datosDeEquipo.bugs, problemas),
    },
    terminadas: terminadas.map(paraLista),
    pendientes: pendientes.map(paraLista),
    version: VERSION_DE_DATOS,
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}

// @decision 2026-10-17 ramiro@mispichos.com
// Progreso del proyecto: lo terminado sobre el total de todos los sprints
// juntos (los terminados, el que esta en curso y los que no empezaron), en
// tareas y en puntos. Sale de las estadisticas que Shortcut guarda por
// iteracion, que cuentan lo mismo que esta pantalla (stories no archivadas,
// subtareas incluidas: en el Sprint 1 dan 84 de 84 y en el 2, 1 de 44), sin
// leer las stories de cada sprint. Una tarea que se movio de sprint esta en uno
// solo, asi que sumar no la cuenta dos veces. Un sprint sin estadisticas se
// cuenta en 0 y se reporta, para que el total no baje en silencio.
//
// Los sprints de los que se tienen las stories (`desdeStories`: el que se mira
// en la vista de un sprint, todos en la vista del proyecto) se cuentan desde
// ellas, no desde sus estadisticas: son dos lecturas con cache propio y, si
// difieren, la pantalla mostraria "2 de 44" arriba y "1 de 44" en este panel.
// Se usan las stories, que es lo que muestra todo lo demas, y la diferencia se
// reporta.
//
// Lo que no esta en ningun sprint (el backlog suelto) no es avance ni atraso
// del plan: no entra en el porcentaje y se informa aparte, deducido como las
// stories no archivadas de todo el workspace menos lo que suman los sprints
// (la busqueda `-has:iteration` daria lo mismo, pero ese operador no esta en
// la lista oficial). Si la resta da negativo, las dos lecturas son de momentos
// distintos: se reporta y queda sin dato.
export function progresoDelProyecto(
  iteraciones,
  { stories = null, desdeStories = [] } = {},
  problemas = []
) {
  const sprints = [...iteraciones]
    .sort(
      (a, b) =>
        fechaDeCalendario(a.start_date).localeCompare(fechaDeCalendario(b.start_date)) || a.id - b.id
    )
    .map((i) => {
      const stats = i.stats;
      if (!stats) {
        problemas.push({
          tarea: null,
          campo: "stats",
          valor: i.id,
          motivo: `el sprint "${i.name}" vino sin estadísticas: se cuenta en 0`,
        });
      }
      const n = (clave) => stats?.[clave] ?? 0;
      const terminadas = n("num_stories_done");
      const enCurso = n("num_stories_started");
      const pendientes = n("num_stories_unstarted") + n("num_stories_backlog");
      const total = terminadas + enCurso + pendientes;
      return {
        id: i.id,
        nombre: i.name,
        estado: ESTADOS_SPRINT[i.status] ?? i.status,
        inicio: fechaDeCalendario(i.start_date),
        fin: fechaDeCalendario(i.end_date),
        url: i.app_url ?? null,
        tareas: { total, terminadas, enCurso, pendientes, pct: porcentaje(terminadas, total) },
        puntos: {
          total: n("num_points"),
          terminados: n("num_points_done"),
          pct: porcentaje(n("num_points_done"), n("num_points")),
          tareasSinEstimar: n("num_stories_unestimated"),
        },
      };
    });

  for (const { id, resumen } of desdeStories) {
    const fila = sprints.find((s) => s.id === id);
    if (!fila) continue;
    const contado = {
      tareas: {
        total: resumen.tareas.total,
        terminadas: resumen.tareas.terminadas,
        enCurso: resumen.tareas.enCurso,
        pendientes: resumen.tareas.pendientes,
        pct: resumen.tareas.pct,
      },
      puntos: {
        total: resumen.puntos.total,
        terminados: resumen.puntos.terminados,
        pct: resumen.puntos.pct,
        tareasSinEstimar: resumen.puntos.tareasSinEstimar,
      },
    };
    const distinto =
      JSON.stringify(fila.tareas) !== JSON.stringify(contado.tareas) ||
      JSON.stringify(fila.puntos) !== JSON.stringify(contado.puntos);
    if (distinto) {
      problemas.push({
        tarea: null,
        campo: "stats",
        valor: id,
        motivo:
          `las estadísticas del sprint "${fila.nombre}" (${fila.tareas.terminadas} de ${fila.tareas.total} tareas, ` +
          `${fila.puntos.terminados} de ${fila.puntos.total} puntos) no coinciden con sus stories ` +
          `(${contado.tareas.terminadas} de ${contado.tareas.total}, ` +
          `${contado.puntos.terminados} de ${contado.puntos.total}): puede ser una lectura vieja ` +
          "del cache, probá «Actualizar». El progreso del proyecto usa las stories para este sprint",
      });
    }
    Object.assign(fila, contado);
  }

  const total = sumar(sprints.map((s) => s.tareas.total));
  const terminadas = sumar(sprints.map((s) => s.tareas.terminadas));
  const enCurso = sumar(sprints.map((s) => s.tareas.enCurso));
  const puntos = sumar(sprints.map((s) => s.puntos.total));
  const puntosTerminados = sumar(sprints.map((s) => s.puntos.terminados));

  let sinSprint = null;
  if (stories !== null) {
    sinSprint = stories - total;
    if (sinSprint < 0) {
      problemas.push({
        tarea: null,
        campo: "búsqueda stories",
        valor: stories,
        motivo:
          `los sprints suman ${total} tareas y la búsqueda de Shortcut cuenta ${stories} en todo el proyecto: ` +
          "son lecturas de momentos distintos, probá «Actualizar». Las tareas sin sprint quedan sin dato",
      });
      sinSprint = null;
    }
  }

  return {
    sprints,
    tareas: {
      total,
      terminadas,
      enCurso,
      pendientes: total - terminadas - enCurso,
      pct: porcentaje(terminadas, total),
    },
    puntos: {
      total: puntos,
      terminados: puntosTerminados,
      pct: porcentaje(puntosTerminados, puntos),
      tareasSinEstimar: sumar(sprints.map((s) => s.puntos.tareasSinEstimar)),
    },
    sinSprint,
  };
}

// @decision 2026-10-17 ramiro@mispichos.com
// Errores del proyecto: las stories de tipo "bug" de todo el workspace, no
// solo del sprint, contadas por la busqueda de Shortcut: reportados, resueltos
// (terminados) y abiertos, cada uno con su propia busqueda, asi el numero
// principal (abiertos) no sale de restar dos lecturas. Si los tres no cierran
// (resueltos + abiertos != reportados), son lecturas de momentos distintos: se
// reporta y el porcentaje de resueltos queda sin dato. Sin bugs reportados no
// hay nada resuelto ni abierto, aunque esas busquedas hayan fallado. Si no se
// pudo contar, queda en null: la tarjeta dice que no se leyo, no muestra un 0
// que parezca "sin errores".
//
// Lo del sprint que se mira se adjunta con el mismo vocabulario que el OKR del
// equipo: `reportados` son los bugs que entraron al sprint entre su inicio y
// su fin (el numerador del ratio) y `sinResolver` los bugs del sprint que
// todavia no se terminaron.
export function erroresDelProyecto(conteos, bugsDelSprint, problemas = []) {
  const reportados = conteos?.bugs ?? null;
  let resueltos = conteos?.bugsResueltos ?? null;
  let abiertos = conteos?.bugsAbiertos ?? null;
  if (reportados === 0) {
    resueltos = 0;
    abiertos = 0;
  }
  let pctResueltos = reportados === null || resueltos === null ? null : porcentaje(resueltos, reportados);

  const noCierra =
    reportados !== null &&
    ((resueltos !== null && resueltos > reportados) ||
      (abiertos !== null && abiertos > reportados) ||
      (resueltos !== null && abiertos !== null && resueltos + abiertos !== reportados));
  if (noCierra) {
    problemas.push({
      tarea: null,
      campo: "búsqueda bugs",
      valor: `${reportados} reportados, ${resueltos ?? "?"} resueltos, ${abiertos ?? "?"} abiertos`,
      motivo:
        "los conteos de bugs no cierran (resueltos + abiertos tendría que dar reportados): son lecturas " +
        "de momentos distintos, probá «Actualizar». El porcentaje de resueltos queda sin dato",
    });
    pctResueltos = null;
  }

  return {
    reportados,
    resueltos,
    abiertos,
    pctResueltos,
    enElSprint: {
      reportados: bugsDelSprint?.bugsAbiertosEnSprint ?? 0,
      sinResolver: (bugsDelSprint?.bugs ?? 0) - (bugsDelSprint?.bugsTerminados ?? 0),
    },
  };
}

// Los demas sprints, del que empieza primero al ultimo: en cualquiera de ellos
// puede estar una tarea que se le saco al que se mira (Shortcut la lista en el
// destino con `previous_iteration_ids`), tambien en uno anterior. Es lo mismo
// que mira el historial, asi lo planificado da igual en las dos vistas.
export function otrosSprints(iteraciones, iteracion) {
  return iteraciones
    .filter((i) => i.id !== iteracion.id)
    .sort(
      (a, b) =>
        fechaDeCalendario(a.start_date).localeCompare(fechaDeCalendario(b.start_date)) || a.id - b.id
    );
}

// Cuantos sprints entran en el historial. Cada uno cuesta una lectura de sus
// tareas mas el historial de cada una (cacheado por version), y Shortcut corta
// a los 200 requests por minuto.
export const SPRINTS_EN_HISTORIAL = 8;

// Los sprints que ya se pueden comparar (en curso o terminados), del mas viejo
// al mas nuevo, limitados a los ultimos SPRINTS_EN_HISTORIAL. Un sprint que no
// empezo no tiene nada hecho contra que medir.
export function sprintsParaHistorial(iteraciones, { maximo = SPRINTS_EN_HISTORIAL } = {}) {
  return iteraciones
    .filter((i) => i.status === "started" || i.status === "done")
    .sort((a, b) =>
      fechaDeCalendario(a.start_date).localeCompare(fechaDeCalendario(b.start_date)) || a.id - b.id
    )
    .slice(-maximo);
}

// Los sprints que no entran en el historial pero pueden tener tareas que se
// sacaron de alguno de la ventana: los que empiezan despues del mas viejo de
// la ventana (tipicamente el proximo, todavia sin empezar).
export function sprintsDestino(iteraciones, ventana) {
  if (ventana.length === 0) return [];
  const enVentana = new Set(ventana.map((i) => i.id));
  const desde = fechaDeCalendario(ventana[0].start_date);
  return iteraciones.filter(
    (i) => !enVentana.has(i.id) && fechaDeCalendario(i.start_date) >= desde
  );
}

// El historial de sprints: una fila por sprint con lo planificado, lo
// cumplido, lo terminado y lo que se fue a otro sprint. `sprints` trae, por
// cada sprint de la ventana, su iteracion, sus stories de hoy y los historiales
// de esas stories; `destinos` lo mismo para los sprints de afuera de la ventana
// a los que pudo irse una tarea (solo sirven para atribuir movidas, no tienen
// fila). Una tarea movida se atribuye al sprint de origen como no cumplida; las
// que se movieron al backlog no se ven: la API no las lista en ningun lado.
export function armarHistorial(
  { iteraciones, sprints, destinos = [], workflows, miembros, epics, camposCustom = [] },
  { ahora, leidoEl = [], problemas: problemasDeLectura = [] }
) {
  const problemas = [...problemasDeLectura];
  const filas = sprints.map(({ iteracion, stories, historiales }) => {
    const sprint = describirSprint(iteracion, ahora);
    const tareas = normalizarTareas(
      { stories, workflows, miembros, epics, camposCustom, historiales, sprintId: iteracion.id },
      problemas
    );
    const deOtros = [...sprints.filter((s) => s.iteracion.id !== iteracion.id), ...destinos];
    const movidas = normalizarMovidas(
      {
        stories: deOtros.flatMap((s) =>
          s.stories.filter((st) => (st.previous_iteration_ids ?? []).includes(iteracion.id))
        ),
        historiales: Object.assign({}, ...deOtros.map((s) => s.historiales ?? {})),
        iteraciones,
        workflows,
        miembros,
        epics,
        camposCustom,
        sprintId: iteracion.id,
      },
      problemas
    );
    const cumplimiento = calcularCumplimiento(tareas, movidas, sprint, ahora);
    const terminadas = tareas.filter((t) => t.terminada);
    return {
      id: sprint.id,
      nombre: sprint.nombre,
      estado: sprint.estado,
      inicio: sprint.inicio,
      fin: sprint.fin,
      url: sprint.url,
      planificadas: cumplimiento.planificadas.total,
      cumplidas: cumplimiento.planificadas.terminadas,
      pctCumplimiento: cumplimiento.planificadas.pct,
      movidas: cumplimiento.planificadas.movidas,
      total: tareas.length,
      terminadas: terminadas.length,
      pctTerminado: porcentaje(terminadas.length, tareas.length),
      puntosTotales: sumar(tareas.map((t) => t.puntos ?? 0)),
      puntosTerminados: sumar(terminadas.map((t) => t.puntos ?? 0)),
    };
  });
  return {
    sprints: filas.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id - b.id),
    version: VERSION_DE_DATOS,
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}
