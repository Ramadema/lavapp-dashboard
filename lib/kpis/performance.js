// Avance de un sprint de Shortcut, en los terminos que lee el area de negocio:
// el resumen, las listas de tareas, el burndown y el cycle time.
//
// Funciones puras: reciben las respuestas crudas de la API (lo que devuelve
// lib/shortcut.js) y la hora actual por parametro, asi los tests fijan el "hoy"
// y los mismos datos dan siempre el mismo resultado. Sin fetch, sin React, sin
// process.env: tambien la importa la pantalla para sus constantes.
//
// "Story" es el termino de Shortcut; en la salida y en la pantalla se dice "tarea".

// Los dias del sprint se cortan en la hora de Buenos Aires, no en UTC: una tarea
// terminada a las 22 h de Argentina es de ese dia aunque en UTC ya sea el siguiente.
export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

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
export const ESTADOS_SPRINT = {
  unstarted: "Próximo",
  started: "En curso",
  done: "Terminado",
};

// Mas viejo que esto, el dato se marca como desactualizado en la pantalla. El
// cache de lib/shortcut.js se renueva a los 5 minutos de cada visita; pasar de 30
// quiere decir que nadie miro en un rato o que Shortcut no esta respondiendo.
export const MINUTOS_PARA_DESACTUALIZADO = 30;

const MS_POR_DIA = 86_400_000;

// Porcentaje con un decimal. Sin total no hay porcentaje: devolver 0 diria "no se
// avanzo nada" sobre un sprint que no tiene nada cargado.
const porcentaje = (parte, total) =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : null;

const sumar = (valores) => valores.reduce((total, v) => total + v, 0);

const PARTES_DE_FECHA = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Dia calendario de Buenos Aires ("2026-09-28") de un instante ISO de Shortcut.
export function diaLocal(instante) {
  const partes = Object.fromEntries(
    PARTES_DE_FECHA.formatToParts(new Date(instante)).map((p) => [p.type, p.value])
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
}

// Shortcut manda las fechas del sprint como "2026-09-23" aunque su OpenAPI diga
// date-time. Se corta a 10 caracteres por si algun dia llegan con hora: lo que
// importa es el dia del calendario, no el instante.
const fechaDeCalendario = (valor) => String(valor).slice(0, 10);

const numeroDeDia = (dia) => Date.parse(`${dia}T00:00:00Z`) / MS_POR_DIA;
const diasEntre = (desde, hasta) => numeroDeDia(hasta) - numeroDeDia(desde);

export function describirSprint(iteracion, ahora) {
  const inicio = fechaDeCalendario(iteracion.start_date);
  const fin = fechaDeCalendario(iteracion.end_date);
  const hoy = diaLocal(ahora);
  const diasTotales = diasEntre(inicio, fin) + 1;

  // @decision 2026-09-30 ramiro@mispichos.com
  // Los dias restantes incluyen el de hoy: el ultimo dia del sprint todavia se
  // trabaja, y decir "quedan 0 dias" esa manana suena a sprint cerrado. Son dias
  // corridos, no habiles, igual que las fechas de inicio y fin de Shortcut.
  let diasRestantes;
  if (hoy > fin) diasRestantes = 0;
  else if (hoy < inicio) diasRestantes = diasTotales;
  else diasRestantes = diasEntre(hoy, fin) + 1;

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
function armarCatalogos({ workflows, miembros, epics, stories }) {
  return {
    estados: indexarEstados(workflows),
    personas: new Map(miembros.map((m) => [m.id, nombreDePersona(m)])),
    nombresDeEpic: new Map(epics.map((e) => [e.id, e.name.trim()])),
    titulos: new Map(stories.map((s) => [s.id, s.name])),
  };
}

// Lleva una story cruda al formato interno, sin las fechas de sprint (esas
// dependen de si la story esta hoy en el sprint o se fue a otro). Nada se
// descarta en silencio: un id que no se puede traducir (un estado, una persona
// o un epic creados despues de la ultima lectura de los catalogos) deja la tarea
// adentro con un nombre generico y queda anotado en `problemas`.
function traducirStory(s, { estados, personas, nombresDeEpic, titulos }, problemas) {
  const reportar = (campo, valor, motivo) => problemas.push({ tarea: s.id, campo, valor, motivo });

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
    puntos: s.estimate,
    epic,
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

// Las stories que hoy estan en el sprint, con la fecha en que entraron.
function normalizarTareas({ stories, workflows, miembros, epics, historiales, sprintId }, problemas) {
  const catalogos = armarCatalogos({ workflows, miembros, epics, stories });
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
  { stories, historiales, iteraciones, workflows, miembros, epics, sprintId },
  problemas
) {
  const catalogos = armarCatalogos({ workflows, miembros, epics, stories });
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
function resumir(tareas, archivadas) {
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

const conUnDecimal = (n) => Math.round(n * 10) / 10;

// @decision 2026-09-30 ramiro@mispichos.com
// El burndown se reconstruye dia por dia con tres fechas de cada tarea: cuando
// entro al sprint (del historial de Shortcut), cuando se termino (completed_at o
// su override) y el corte de dia de Buenos Aires. El pendiente de un dia es lo
// que ya estaba en el sprint al cierre de ese dia y todavia no estaba terminado;
// lo que entro antes del inicio cuenta desde el primer dia. La linea ideal baja
// en linea recta, por dias corridos, del alcance al cierre del primer dia hasta 0
// el ultimo. Los dias que todavia no pasaron van en null: no se proyecta nada.
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

  const inicial = dias.length > 0 ? medir(dias[0]) : { alcanceTareas: 0, alcancePuntos: 0 };
  const tramos = Math.max(dias.length - 1, 1);
  const SIN_MEDIR = { tareas: null, puntos: null, alcanceTareas: null, alcancePuntos: null };

  const serie = dias.map((dia, i) => ({
    dia,
    ...(dia <= hoy ? medir(dia) : SIN_MEDIR),
    idealTareas: conUnDecimal(inicial.alcanceTareas * (1 - i / tramos)),
    idealPuntos: conUnDecimal(inicial.alcancePuntos * (1 - i / tramos)),
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
    alcanceInicial: { tareas: inicial.alcanceTareas, puntos: inicial.alcancePuntos },
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

function mediana(valores) {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
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
// "Comprometida" es la tarea que ya estaba en el sprint al cierre de su primer
// dia (hora de Buenos Aires): la misma regla con la que el burndown fija el
// alcance inicial, asi los dos paneles cuentan lo mismo. Se descarto el instante
// exacto de inicio porque el primer dia el equipo termina de armar el tablero
// (el 23/9 entraron 10 tareas durante el dia) y quedarian como agregadas.
// "Agregada" es la que entro despues. Una tarea que se movio a otro sprint sigue
// contando como comprometida (o agregada) y no cumplida: sacarla del sprint no
// la vuelve cumplida. Una que entro y salio el mismo primer dia nunca estuvo
// comprometida.
function estabaAlCierreDelPrimerDia(tarea, sprint) {
  if (diaLocal(tarea.ingresoEl) > sprint.inicio) return false;
  return tarea.salioEl == null || diaLocal(tarea.salioEl) > sprint.inicio;
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

// Lo comprometido contra lo hecho. `tareas` son las que hoy estan en el sprint
// y `movidas` las que pasaron por el y hoy estan en otro.
export function calcularCompromiso(tareas, movidas, sprint, ahora) {
  // Una movida que entro y salio dentro del primer dia no es ni comprometida ni
  // agregada: nunca llego a ser alcance del sprint.
  const partir = (lista) => ({
    comprometidas: lista.filter((t) => estabaAlCierreDelPrimerDia(t, sprint)),
    agregadas: lista.filter((t) => diaLocal(t.ingresoEl) > sprint.inicio),
  });
  const propias = partir(tareas);
  const idas = partir(movidas);

  const contar = (adentro, afuera) => {
    const terminadas = adentro.filter((t) => t.terminada).length;
    const enCurso = adentro.filter((t) => !t.terminada && t.etapa === ETAPAS.started).length;
    const total = adentro.length + afuera.length;
    return {
      total,
      terminadas,
      enCurso,
      pendientes: adentro.length - terminadas - enCurso,
      movidas: afuera.length,
      pct: porcentaje(terminadas, total),
    };
  };

  // Lo que se prometio y no esta hecho, lo mas avanzado primero y al final lo
  // que se fue a otro sprint: es la lista que se mira en la retrospectiva.
  const sinTerminar = [
    ...propias.comprometidas
      .filter((t) => !t.terminada)
      .sort((a, b) => b.posicionEstado - a.posicionEstado || a.id - b.id)
      .map((t) => ({ ...paraLista(t), movidaA: null })),
    ...idas.comprometidas
      .sort((a, b) => a.id - b.id)
      .map((t) => ({ ...paraLista(t), movidaA: t.movidaA })),
  ];

  const comprometidas = contar(propias.comprometidas, idas.comprometidas);
  const agregadas = contar(propias.agregadas, idas.agregadas);
  return {
    comprometidas,
    agregadas,
    // De donde salio el trabajo del sprint: que parte se planifico y que parte
    // se sumo despues (movidas incluidas, porque tambien fueron alcance).
    alcance: {
      total: comprometidas.total + agregadas.total,
      pctAgregado: porcentaje(agregadas.total, comprometidas.total + agregadas.total),
    },
    sinTerminar,
    proyeccion: proyectar(tareas, sprint, ahora),
  };
}

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

// La lectura mas vieja manda: si una parte del reporte salio del cache, el
// reporte entero es de esa hora.
function describirLectura(leidos, ahora) {
  const instantes = leidos
    .map((l) => Date.parse(l ?? ""))
    .filter((n) => Number.isFinite(n));
  if (instantes.length === 0) return { leidoEl: null, desactualizado: false };
  const masViejo = Math.min(...instantes);
  return {
    leidoEl: new Date(masViejo).toISOString(),
    desactualizado: ahora.getTime() - masViejo > MINUTOS_PARA_DESACTUALIZADO * 60_000,
  };
}

const instante = (iso) => Date.parse(iso ?? "") || 0;

// El reporte completo de un sprint. `entrada` son las respuestas crudas de
// Shortcut: todas las iteraciones, la iteracion elegida y lo que devuelve
// obtenerSprint(). `leidoEl` son los instantes en que se leyo cada parte y
// `problemas` los que ya encontro la lectura (historiales que no se pudieron leer).
export function armarReporte(
  { iteraciones, iteracion, stories, workflows, miembros, epics, historiales, movidas },
  { ahora, leidoEl = [], problemas: problemasDeLectura = [] }
) {
  const problemas = [...problemasDeLectura];
  const tareas = normalizarTareas(
    { stories, workflows, miembros, epics, historiales, sprintId: iteracion.id },
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

  return {
    sprint,
    sprints: listarSprints(iteraciones),
    resumen: resumir(tareas, archivadas),
    porEstado: contarPorEstado(tareas, workflows),
    burndown: calcularBurndown(tareas, sprint, ahora),
    flujo: calcularFlujo(tareas, sprint, ahora),
    porIniciativa: avancePorIniciativa(tareas),
    porResponsable: cargaPorResponsable(tareas),
    compromiso: calcularCompromiso(tareas, tareasMovidas, sprint, ahora),
    ritmo: calcularRitmo(tareas, sprint, ahora),
    cycleTime: calcularCycleTime(tareas, problemas),
    tiempoEnSprint: calcularTiempoEnSprint(tareas, sprint),
    tiempoPorColumna: calcularTiempoPorColumna(tareas, historiales, workflows),
    terminadas: terminadas.map(paraLista),
    pendientes: pendientes.map(paraLista),
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}

// Los sprints que empiezan despues del que se mira: ahi pueden estar las
// tareas que se le sacaron (Shortcut las lista en el destino con
// `previous_iteration_ids`). Del mas cercano al mas lejano.
export function sprintsPosteriores(iteraciones, iteracion) {
  const inicio = fechaDeCalendario(iteracion.start_date);
  return iteraciones
    .filter(
      (i) =>
        i.id !== iteracion.id &&
        (fechaDeCalendario(i.start_date) > inicio ||
          (fechaDeCalendario(i.start_date) === inicio && i.id > iteracion.id))
    )
    .sort((a, b) => fechaDeCalendario(a.start_date).localeCompare(fechaDeCalendario(b.start_date)));
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

// El historial de sprints: una fila por sprint con lo comprometido, lo
// agregado, lo terminado y lo que se fue a otro sprint. `sprints` trae, por
// cada sprint de la ventana, su iteracion, sus stories de hoy y los historiales
// de esas stories; `destinos` lo mismo para los sprints de afuera de la ventana
// a los que pudo irse una tarea (solo sirven para atribuir movidas, no tienen
// fila). Una tarea movida se atribuye al sprint de origen como no cumplida; las
// que se movieron al backlog no se ven: la API no las lista en ningun lado.
export function armarHistorial(
  { iteraciones, sprints, destinos = [], workflows, miembros, epics },
  { ahora, leidoEl = [], problemas: problemasDeLectura = [] }
) {
  const problemas = [...problemasDeLectura];
  const filas = sprints.map(({ iteracion, stories, historiales }) => {
    const sprint = describirSprint(iteracion, ahora);
    const tareas = normalizarTareas(
      { stories, workflows, miembros, epics, historiales, sprintId: iteracion.id },
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
        sprintId: iteracion.id,
      },
      problemas
    );
    const compromiso = calcularCompromiso(tareas, movidas, sprint, ahora);
    const terminadas = tareas.filter((t) => t.terminada);
    return {
      id: sprint.id,
      nombre: sprint.nombre,
      estado: sprint.estado,
      inicio: sprint.inicio,
      fin: sprint.fin,
      url: sprint.url,
      comprometidas: compromiso.comprometidas.total,
      cumplidas: compromiso.comprometidas.terminadas,
      pctCumplimiento: compromiso.comprometidas.pct,
      agregadas: compromiso.agregadas.total,
      agregadasTerminadas: compromiso.agregadas.terminadas,
      movidas: compromiso.comprometidas.movidas + compromiso.agregadas.movidas,
      total: tareas.length,
      terminadas: terminadas.length,
      pctTerminado: porcentaje(terminadas.length, tareas.length),
      puntosTotales: sumar(tareas.map((t) => t.puntos ?? 0)),
      puntosTerminados: sumar(terminadas.map((t) => t.puntos ?? 0)),
    };
  });
  return {
    sprints: filas.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id - b.id),
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}
