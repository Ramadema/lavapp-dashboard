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

// Lleva cada story cruda al formato interno. Nada se descarta en silencio: un id
// que no se puede traducir (un estado, una persona o un epic creados despues de
// la ultima lectura de los catalogos) deja la tarea adentro con un nombre
// generico y queda anotado en `problemas`.
// Cuando entro una story al sprint, segun su historial. La API no lo da como
// campo: se reconstruye con los cambios de `iteration_id`, que Shortcut anota
// como `changes.iteration_id: { old, new }` (sin `old` si no tenia sprint). Si
// entro, salio y volvio, cuenta la ultima entrada, que es la que la tiene hoy en
// el sprint. El historial de una historia tambien trae la creacion de sus
// subtareas: por eso se filtra por el id de la story. Devuelve el instante o
// null si el historial no lo dice.
export function fechaDeIngreso(historial, storyId, sprintId) {
  let ingreso = null;
  const cambios = [...historial].sort(
    (a, b) => Date.parse(a.changed_at) - Date.parse(b.changed_at)
  );
  for (const cambio of cambios) {
    for (const accion of cambio.actions ?? []) {
      if (accion.entity_type !== "story" || accion.id !== storyId) continue;
      if (accion.action === "create" && accion.iteration_id === sprintId) {
        ingreso = cambio.changed_at;
      }
      const iteracion = accion.action === "update" ? accion.changes?.iteration_id : null;
      if (iteracion?.new === sprintId) ingreso = cambio.changed_at;
      else if (iteracion?.old === sprintId) ingreso = null;
    }
  }
  return ingreso;
}

function normalizarTareas({ stories, workflows, miembros, epics, historiales, sprintId }, problemas) {
  const estados = indexarEstados(workflows);
  const personas = new Map(miembros.map((m) => [m.id, nombreDePersona(m)]));
  const nombresDeEpic = new Map(epics.map((e) => [e.id, e.name.trim()]));
  const titulos = new Map(stories.map((s) => [s.id, s.name]));

  const reportar = (tarea, campo, valor, motivo) =>
    problemas.push({ tarea, campo, valor, motivo });

  return stories
    .filter((s) => !s.archived)
    .map((s) => {
      const estado = estados.get(s.workflow_state_id);
      if (!estado) {
        reportar(s.id, "workflow_state_id", s.workflow_state_id, "estado que no esta en ningun workflow");
      }

      const responsables = s.owner_ids.map((id) => {
        if (personas.get(id)) return personas.get(id);
        reportar(s.id, "owner_ids", id, "persona que no esta entre los miembros");
        return "Persona sin nombre";
      });

      let epic = null;
      if (s.epic_id != null) {
        epic = nombresDeEpic.get(s.epic_id) ?? null;
        if (!epic) {
          reportar(s.id, "epic_id", s.epic_id, "epic que no esta en la lista de epics");
          epic = "Epic sin nombre";
        }
      }

      const terminadaEl = s.completed ? (s.completed_at_override ?? s.completed_at) : null;
      if (s.completed && !terminadaEl) {
        reportar(s.id, "completed_at", null, "tarea terminada sin fecha de terminacion");
      }

      // Sin historial (no se pudo leer: lib/shortcut.js ya lo reporto) o sin la
      // entrada en el historial, la fecha de creacion es la mejor cota: antes de
      // existir no pudo estar en el sprint. Queda marcada como estimada.
      const historial = historiales?.[s.id];
      let ingresoEl = historial ? fechaDeIngreso(historial, s.id, sprintId) : null;
      if (historial && !ingresoEl) {
        reportar(s.id, "iteration_id", sprintId, "el historial no dice cuando entro al sprint: se toma la fecha de creacion");
      }
      const ingresoEstimado = !ingresoEl;
      if (ingresoEstimado) ingresoEl = s.created_at;

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
        ingresoEl,
        ingresoEstimado,
        empezadaEl: s.started_at_override ?? s.started_at,
        terminadaEl,
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
  { iteraciones, iteracion, stories, workflows, miembros, epics, historiales },
  { ahora, leidoEl = [], problemas: problemasDeLectura = [] }
) {
  const problemas = [...problemasDeLectura];
  const tareas = normalizarTareas(
    { stories, workflows, miembros, epics, historiales, sprintId: iteracion.id },
    problemas
  );
  const archivadas = stories.length - tareas.length;
  const sprint = describirSprint(iteracion, ahora);

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
    cycleTime: calcularCycleTime(tareas, problemas),
    terminadas: terminadas.map(paraLista),
    pendientes: pendientes.map(paraLista),
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}
