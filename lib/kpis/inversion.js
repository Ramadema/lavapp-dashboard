// El MVP visto por el cliente, el que pone la plata: cuanto se avanzo, cuantas
// horas se invirtieron y en que, que se entrego en cada sprint, que falta para
// la entrega y que puede salir mal. Lo publica /api/inversion y lo muestra la
// seccion «Avance e inversion». Lo interno del equipo (roles, carga, bugs,
// retrabajo, utilizacion) queda en Performance.
//
// Funciones puras, como proyecto.js: reciben las respuestas crudas de
// lib/shortcut.js (las iteraciones y, por cada una, sus stories con sus
// historiales), la hora y la configuracion de data/equipo.json por parametro.
// Sin fetch, sin React, sin process.env. Cada tarea se lee con
// leerTareasDelProyecto, la misma traduccion que usa Performance.

import { anotarFueraDeEscala, horasDePuntos, tieneEscala } from "./escala.js";
import { EQUIPO_VACIO } from "./equipo.js";
import { ETAPAS, describirSprint, progresoDelProyecto } from "./performance.js";
import { leerTareasDelProyecto } from "./proyecto.js";
import {
  conUnDecimal,
  describirLectura,
  diaLocal,
  diasEntre,
  diasRestantesDe,
  porcentaje,
  sumar,
  sumarDias,
} from "./tiempo.js";

// La forma de /api/inversion. Se cambia (una fecha AAAA-MM-DD) cada vez que
// cambia la forma de los datos: la pantalla la compara para no romperse con un
// servidor viejo, igual que VERSION_DE_DATOS en Performance.
export const VERSION_DE_INVERSION = "2026-10-27";

// Que es un KPI y que es un OKR, contado para el cliente: la sigla y el nombre
// de las insignias de «Avance e inversion», y la linea de la leyenda
// (`resumen`). No llevan la definicion general de cada clase, como
// TIPOS_DE_METRICA en equipo.js: ahi el tooltip de cada insignia dice que mide
// su indicador.
export const TIPOS_DE_METRICA_DEL_CLIENTE = {
  kpi: { sigla: "KPI", nombre: "Indicador clave", resumen: "se sigue para conocer el estado del proyecto" },
  okr: { sigla: "OKR", nombre: "Resultado clave", resumen: "tiene una meta para la entrega del MVP" },
};

// ---- Tipo de trabajo --------------------------------------------------------

// @decision 2026-10-24 ramiro@mispichos.com
// El tipo de trabajo sale del prefijo con que el equipo nombra cada historia en
// Shortcut: HU (historia de usuario) es una funcionalidad del producto, HT
// (historia tecnica) la base tecnica, QA las pruebas, y HG (historia de
// gestion) y SM (Scrum Master) la gestion del proyecto. Se descarto el campo
// Skill Set: en el Sprint 2 el 95 % de las tareas dice «Product», asi que no
// separa nada. Lo que no tiene prefijo queda «Sin clasificar» y se cuenta aparte.
//
// @decision 2026-10-27 ramiro@mispichos.com
// Una subtarea se clasifica como su historia, aunque el titulo de la subtarea
// tenga otro prefijo. El punto esta en la historia: partirlo por subtarea
// armaba otro rubro con las mismas horas.
export const TIPOS_DE_TRABAJO = [
  { clave: "funcionalidades", nombre: "Funcionalidades", prefijos: ["HU"] },
  { clave: "tecnica", nombre: "Base técnica", prefijos: ["HT"] },
  { clave: "calidad", nombre: "Calidad", prefijos: ["QA"] },
  { clave: "gestion", nombre: "Gestión", prefijos: ["HG", "SM"] },
];
export const SIN_CLASIFICAR = { clave: "sin-clasificar", nombre: "Sin clasificar", prefijos: [] };
const TODOS_LOS_TIPOS = [...TIPOS_DE_TRABAJO, SIN_CLASIFICAR];

// "HU-07 — Registrar", "HU - 50", "QA - Probar", "Subtarea - QA - Flujo": dos
// letras al principio (despues de un "Subtarea -" opcional) que no siguen con
// otra letra. "BACK - Crear" o "DEV - Integrar" no son un prefijo.
const PREFIJO = /^\s*(?:subtarea\s*[-–—:]\s*)?([a-z]{2})(?![a-z])/i;

export function tipoPorPrefijo(titulo) {
  const m = PREFIJO.exec(titulo ?? "");
  if (!m) return null;
  const sigla = m[1].toUpperCase();
  return TIPOS_DE_TRABAJO.find((t) => t.prefijos.includes(sigla)) ?? null;
}

// Cada tarea con su `tipoDeTrabajo` (la clave). Una historia, por el prefijo de
// su titulo. Una subtarea, por el de su historia (aunque la subtarea traiga
// otro): la historia puede estar en otro sprint o fuera de los sprints, y
// entonces vale el titulo que trae la tarea.
export function clasificarTareas(tareas) {
  const porId = new Map(tareas.map((t) => [t.id, t]));
  const tipoDe = (tarea, vistas) => {
    if (tarea.historia && !vistas.has(tarea.historia.id)) {
      const madre = porId.get(tarea.historia.id);
      if (madre) return tipoDe(madre, new Set([...vistas, tarea.id]));
      return tipoPorPrefijo(tarea.historia.titulo) ?? SIN_CLASIFICAR;
    }
    return tipoPorPrefijo(tarea.titulo) ?? SIN_CLASIFICAR;
  };
  return tareas.map((t) => ({ ...t, tipoDeTrabajo: tipoDe(t, new Set([t.id])).clave }));
}

// ---- El MVP ---------------------------------------------------------------

const porInicio = (a, b) => a.inicio.localeCompare(b.inicio) || a.id - b.id;

// @decision 2026-10-24 ramiro@mispichos.com
// Para el cliente el proyecto es el MVP: va del inicio del primer sprint a la
// entrega (horasPactadas.finDelProyecto de data/equipo.json, el 28/10/2026),
// que es tambien la fecha limite para justificar las horas. Entran en el MVP
// los sprints que empiezan hasta ese dia; los que empiezan despues son de una
// version posterior y solo se mencionan. Sin la fecha, el MVP es todo lo
// cargado y la pantalla avisa que falta. Los dias restantes incluyen hoy, como
// en Performance (diasRestantesDe).
export function describirMvp(iteraciones, ahora, { entrega = null } = {}, problemas = []) {
  const hoy = diaLocal(ahora);
  const sprints = iteraciones.map((i) => describirSprint(i, ahora)).sort(porInicio);
  if (sprints.length === 0) {
    return {
      entrega,
      configurada: entrega !== null,
      hoy,
      inicio: null,
      fin: entrega,
      diasTotales: 0,
      diasTranscurridos: 0,
      diasRestantes: 0,
      vencida: false,
      sprints: [],
      despues: [],
      enCurso: null,
      ultimoFin: null,
    };
  }
  const inicio = sprints[0].inicio;
  let fecha = entrega;
  if (fecha !== null && fecha < inicio) {
    problemas.push({
      tarea: null,
      campo: "horasPactadas.finDelProyecto",
      valor: fecha,
      motivo: `la entrega del MVP es anterior al primer sprint (${inicio}): se toma todo lo cargado como MVP`,
    });
    fecha = null;
  }
  const delMvp = sprints.filter((s) => fecha === null || s.inicio <= fecha);
  const ultimoFin = delMvp.map((s) => s.fin).sort().at(-1);
  const fin = fecha ?? ultimoFin;
  const diasTotales = diasEntre(inicio, fin) + 1;
  const diasRestantes = diasRestantesDe(inicio, fin, hoy);
  // En curso es por calendario, no por el estado de Shortcut: un sprint que
  // vencio sigue "started" hasta que alguien lo cierra.
  const enCurso = delMvp.filter((s) => s.inicio <= hoy && hoy <= s.fin).at(-1) ?? null;
  return {
    entrega: fecha,
    configurada: fecha !== null,
    hoy,
    inicio,
    fin,
    diasTotales,
    diasTranscurridos: diasTotales - diasRestantes,
    diasRestantes,
    vencida: hoy > fin,
    sprints: delMvp,
    despues: sprints.filter((s) => !delMvp.includes(s)),
    enCurso: enCurso ? { id: enCurso.id, nombre: enCurso.nombre } : null,
    ultimoFin,
  };
}

// ---- Medidas --------------------------------------------------------------

const esEnCurso = (t) => !t.terminada && t.etapa === ETAPAS.started;

// El dia en que se termino una tarea, en hora de Buenos Aires. Una terminada
// sin fecha (ya anotada en `problemas` al traducirla) no tiene dia: no entra en
// el ritmo, no es una entrega tardia y en la curva cuenta como terminada hoy.
const diaDeTerminacion = (t) => (t.terminada && t.terminadaEl ? diaLocal(t.terminadaEl) : null);
const esPendiente = (t) => !t.terminada && t.etapa !== ETAPAS.started;

// Las tareas y su valor (horas, o puntos sin escala) partidos en
// terminado, en curso y pendiente.
function medir(tareas, valorDe) {
  const suma = (lista) => conUnDecimal(sumar(lista.map(valorDe)));
  const terminadas = tareas.filter((t) => t.terminada);
  const enCurso = tareas.filter(esEnCurso);
  const pendientes = tareas.filter(esPendiente);
  const total = suma(tareas);
  const terminado = suma(terminadas);
  return {
    tareas: {
      total: tareas.length,
      terminadas: terminadas.length,
      enCurso: enCurso.length,
      pendientes: pendientes.length,
      pct: porcentaje(terminadas.length, tareas.length),
    },
    valor: {
      total,
      terminado,
      enCurso: suma(enCurso),
      pendiente: suma(pendientes),
      pct: porcentaje(terminado, total),
    },
    // Una subtarea no se estima: el punto vive en la historia. Contarla aca
    // haria figurar como «sin estimar» trabajo que ya tiene horas en su historia.
    sinEstimar: tareas.filter((t) => !t.historia && t.puntos === null).length,
  };
}

const paraLista = (t) => ({
  id: t.id,
  titulo: t.titulo,
  url: t.url,
  etapa: t.etapa,
  estado: t.estado,
  sprint: t.sprint,
});

// Las funcionalidades son las historias de usuario: las tareas sin historia
// madre de tipo Funcionalidades. Sus subtareas no cuentan aparte.
export function resumirFuncionalidades(tareas) {
  const lista = tareas.filter((t) => !t.historia && t.tipoDeTrabajo === "funcionalidades");
  const entregadas = lista.filter((t) => t.terminada).length;
  return {
    total: lista.length,
    entregadas,
    pct: porcentaje(entregadas, lista.length),
    faltan: lista.filter((t) => !t.terminada).map(paraLista),
  };
}

// ---- Avance contra el plan --------------------------------------------------

// Que parte de un sprint esta planificada para un dia: nada antes de empezar,
// todo desde su ultimo dia, y en el medio, parejo por dia (el primero ya cuenta).
const fraccionDelSprint = (sprint, dia) =>
  !sprint || dia < sprint.inicio
    ? 0
    : dia >= sprint.fin
      ? 1
      : (diasEntre(sprint.inicio, dia) + 1) / sprint.diasTotales;

// @decision 2026-10-24 ramiro@mispichos.com
// Lo planificado a un dia: el valor de cada tarea que ya estaba en un sprint
// ese dia, por la parte de su sprint que corresponde a ese dia (un sprint
// terminado aporta todo; uno que no empezo, nada). Cada tarea cuenta en el
// sprint en que esta hoy, asi que es el plan vigente y no el original. El
// avance contra el plan es lo terminado sobre lo planificado a hoy: 100 % es ir
// al dia, menos es atraso y mas es ir adelantado.
function planificadoAl(dia, tareas, sprintsPorId, valorDe) {
  return sumar(
    tareas
      .filter((t) => diaLocal(t.ingresoEl) <= dia)
      .map((t) => valorDe(t) * fraccionDelSprint(sprintsPorId.get(t.sprint.id), dia))
  );
}

export function avanceContraElPlan(tareas, sprintsPorId, hoy, valorDe) {
  const planificado = conUnDecimal(planificadoAl(hoy, tareas, sprintsPorId, valorDe));
  const terminado = conUnDecimal(sumar(tareas.filter((t) => t.terminada).map(valorDe)));
  return { planificado, terminado, pct: porcentaje(terminado, planificado) };
}

// ---- Ritmo y proyeccion ----------------------------------------------------------

// @decision 2026-10-24 ramiro@mispichos.com
// El ritmo para proyectar es el de los ultimos 14 dias (un sprint), hoy
// incluido: lo terminado en esos dias sobre 14. Se descarto el ritmo de todo
// el proyecto, que arrastra el Sprint 1 (235 puntos en dos semanas, mucho de
// gestion) y prometeria una fecha que el ritmo de hoy no sostiene. Con ese
// ritmo se proyecta desde lo terminado hasta ahora, sumando un dia de ritmo por
// cada dia que pasa: cuando se termina lo que falta del MVP y cuanto estaria
// terminado el dia de la entrega (lo mismo que dibuja avanceAcumulado). Sin
// nada terminado en esos dias no hay fecha: no se inventa. Lo necesario es lo
// que falta repartido en los dias que quedan, hoy incluido.
export const DIAS_DEL_RITMO = 14;

// Lo terminado en los ultimos DIAS_DEL_RITMO dias y el ritmo por dia, sin
// redondear: lo usan la proyeccion y la curva, asi dicen el mismo numero.
export function ritmoReciente(tareas, hoy, valorDe) {
  const desde = sumarDias(hoy, -(DIAS_DEL_RITMO - 1));
  const recientes = tareas.filter((t) => {
    const dia = diaDeTerminacion(t);
    return dia !== null && dia >= desde && dia <= hoy;
  });
  return { desde, recientes, porDia: sumar(recientes.map(valorDe)) / DIAS_DEL_RITMO };
}

export function calcularRitmo(tareas, hoy, { valorDe, diasRestantes, entrega }) {
  const { desde, recientes, porDia } = ritmoReciente(tareas, hoy, valorDe);
  const total = sumar(tareas.map(valorDe));
  const terminado = sumar(tareas.filter((t) => t.terminada).map(valorDe));
  const restante = total - terminado;

  let proyeccion = null;
  if (restante <= 0) {
    proyeccion = { terminado: true, fin: null, llegaALaEntrega: true, alaEntrega: conUnDecimal(total) };
  } else if (porDia > 0) {
    const fin = sumarDias(hoy, Math.ceil(restante / porDia));
    const enPlazo = entrega !== null && hoy <= entrega;
    proyeccion = {
      terminado: false,
      fin,
      llegaALaEntrega: entrega === null ? null : fin <= entrega,
      diasDeAtraso: entrega !== null && fin > entrega ? diasEntre(entrega, fin) : 0,
      // Cuanto estaria terminado el dia de la entrega a este ritmo.
      alaEntrega: enPlazo
        ? conUnDecimal(Math.min(total, terminado + porDia * diasEntre(hoy, entrega)))
        : null,
    };
  }
  return {
    dias: DIAS_DEL_RITMO,
    desde,
    porDia: conUnDecimal(porDia),
    tareasTerminadas: recientes.length,
    restante: conUnDecimal(Math.max(0, restante)),
    necesarioPorDia: restante > 0 && diasRestantes > 0 ? conUnDecimal(restante / diasRestantes) : null,
    proyeccion,
  };
}

// ---- Avance acumulado dia a dia ---------------------------------------------------

// Una fila por dia del MVP (o hasta hoy, si la entrega ya paso): el alcance que
// ya estaba en algun sprint, lo planificado a ese dia, lo terminado (null en los
// dias que no pasaron) y la proyeccion desde hoy al ritmo de calcularRitmo
// (null antes de hoy), que no pasa del alcance.
export function avanceAcumulado(tareas, sprintsPorId, mvp, { valorDe, porDia }) {
  if (!mvp.inicio) return [];
  const ultimo = mvp.hoy > mvp.fin ? mvp.hoy : mvp.fin;
  const total = sumar(tareas.map(valorDe));
  const terminadoAl = (dia) =>
    sumar(tareas.filter((t) => t.terminada && (diaDeTerminacion(t) ?? mvp.hoy) <= dia).map(valorDe));
  const terminadoHoy = terminadoAl(mvp.hoy);
  const filas = [];
  for (let dia = mvp.inicio; dia <= ultimo; dia = sumarDias(dia, 1)) {
    filas.push({
      dia,
      alcance: conUnDecimal(sumar(tareas.filter((t) => diaLocal(t.ingresoEl) <= dia).map(valorDe))),
      planificado: conUnDecimal(planificadoAl(dia, tareas, sprintsPorId, valorDe)),
      terminado: dia <= mvp.hoy ? conUnDecimal(terminadoAl(dia)) : null,
      proyeccion:
        dia >= mvp.hoy && porDia > 0
          ? conUnDecimal(Math.min(total, terminadoHoy + porDia * diasEntre(mvp.hoy, dia)))
          : null,
    });
  }
  return filas;
}

// ---- Horas ------------------------------------------------------------------

// Las horas pactadas del equipo: las de cada integrante de data/equipo.json (la
// propia o la cifra por defecto). null si nadie tiene horas.
function horasPactadasDelEquipo(equipo) {
  const porDefecto = equipo.horasPactadas?.porIntegrante ?? null;
  const horas = equipo.integrantes.map((i) => i.horasPactadas ?? porDefecto).filter((h) => h !== null);
  return horas.length === 0 ? null : conUnDecimal(sumar(horas));
}

// @decision 2026-10-24 ramiro@mispichos.com
// Las horas justificadas son las de las tareas terminadas: sus puntos por
// la escala, sumados para todo el equipo (una tarea compartida cuenta una
// vez; repartirla entre sus responsables solo importa persona por persona, en
// Performance). Lo en curso y lo pendiente se muestran aparte y no se
// justifican todavia. El minimo que pide el cliente (cliente.horasMinimas, 680
// h para la entrega) es la meta; las pactadas (70 por persona, 700 h) son lo
// que se propuso el equipo. Ninguna es un tope: se pueden justificar mas.
//
// @decision 2026-10-27 ramiro@mispichos.com
// Esos puntos son los de la historia, no los de sus subtareas. Una subtarea
// aporta 0. Las horas salen de la escala: cada valor de puntos tiene las suyas
// (1 son 2 h, 2 son 4 h, 3 son 8 h, 5 son 15 h y 8 son 25 h). Un valor que no
// esta en la escala no suma.
export function horasInvertidas(alcance, equipo, unidad) {
  const cliente = equipo.cliente ?? EQUIPO_VACIO.cliente;
  const base = {
    configurado: unidad === "horas",
    escala: equipo.escalaDeHoras ?? null,
    minimo: cliente.horasMinimas,
    pactadas: horasPactadasDelEquipo(equipo),
    integrantes: equipo.integrantes.length,
  };
  if (unidad !== "horas") return base;
  const { terminado, enCurso, pendiente, total } = alcance.valor;
  const costo = cliente.costoPorHora;
  const enPlata = (h) => Math.round(h * costo);
  return {
    ...base,
    justificadas: terminado,
    enCurso,
    pendientes: pendiente,
    comprometidas: total,
    pctDelMinimo: base.minimo === null ? null : porcentaje(terminado, base.minimo),
    faltanParaElMinimo: base.minimo === null ? null : conUnDecimal(Math.max(0, base.minimo - terminado)),
    plata:
      costo === null
        ? null
        : {
            moneda: cliente.moneda,
            porHora: costo,
            justificadas: enPlata(terminado),
            comprometidas: enPlata(total),
            minimo: base.minimo === null ? null : enPlata(base.minimo),
          },
  };
}

// En que tipo de trabajo se invirtio: por tipo, lo terminado, en curso y
// pendiente, y que parte de lo terminado se llevo cada uno. Sin los tipos que
// no tienen tareas.
export function inversionPorTipo(tareas, valorDe) {
  const terminadoTotal = sumar(tareas.filter((t) => t.terminada).map(valorDe));
  return TODOS_LOS_TIPOS.flatMap((tipo) => {
    const propias = tareas.filter((t) => t.tipoDeTrabajo === tipo.clave);
    if (propias.length === 0) return [];
    const m = medir(propias, valorDe);
    return [
      {
        clave: tipo.clave,
        nombre: tipo.nombre,
        ...m,
        pctDeLoTerminado: porcentaje(m.valor.terminado, terminadoTotal),
      },
    ];
  });
}

// ---- Entregas por sprint --------------------------------------------------------

// @decision 2026-10-24 ramiro@mispichos.com
// Una entrega es lo que se termino en un sprint: el incremento que se le
// muestra al cliente al cierre. No hay releases etiquetadas (la etiqueta
// «release 1.0» de Shortcut no la tiene ninguna tarea). Cada tarea cuenta en el
// sprint en que esta, y se marca si se termino despues del ultimo dia del
// sprint, en hora de Buenos Aires. Se listan las historias, no sus subtareas.
// Las horas son las de la historia; la subtarea se cuenta al lado, sin sumar.
export function entregasPorSprint(tareas, sprints, valorDe) {
  const ids = new Set(tareas.map((t) => t.id));
  const suma = (lista) => conUnDecimal(sumar(lista.map(valorDe)));
  return [...sprints].sort(porInicio).reverse().map((sprint) => {
    const propias = tareas.filter((t) => t.sprint.id === sprint.id);
    const terminadas = propias.filter((t) => t.terminada);
    const despuesDelCierre = (t) => (diaDeTerminacion(t) ?? sprint.fin) > sprint.fin;
    const dentro = terminadas.filter((t) => !despuesDelCierre(t));
    const despues = terminadas.filter(despuesDelCierre);
    const pendientes = propias.filter((t) => !t.terminada);
    const subtareasDe = (t) => terminadas.filter((s) => s.historia?.id === t.id).length;
    const entregas = TODOS_LOS_TIPOS.flatMap((tipo) => {
      const delTipo = terminadas.filter((t) => t.tipoDeTrabajo === tipo.clave);
      if (delTipo.length === 0) return [];
      const items = delTipo
        .filter((t) => !t.historia || !ids.has(t.historia.id))
        .sort((a, b) => (a.terminadaEl ?? "").localeCompare(b.terminadaEl ?? "") || a.id - b.id)
        .map((t) => ({
          id: t.id,
          titulo: t.titulo,
          url: t.url,
          terminadaEl: t.terminadaEl,
          despuesDelCierre: despuesDelCierre(t),
          subtareas: subtareasDe(t),
        }));
      return [{ clave: tipo.clave, nombre: tipo.nombre, tareas: delTipo.length, valor: suma(delTipo), items }];
    });
    const valorTotal = suma(propias);
    return {
      id: sprint.id,
      nombre: sprint.nombre,
      estado: sprint.estado,
      inicio: sprint.inicio,
      fin: sprint.fin,
      url: sprint.url,
      planificado: { tareas: propias.length, valor: valorTotal },
      enElSprint: { tareas: dentro.length, valor: suma(dentro) },
      despues: { tareas: despues.length, valor: suma(despues) },
      pendiente: { tareas: pendientes.length, valor: suma(pendientes) },
      // Sin estimaciones, se cuenta por tareas.
      pctEnElSprint:
        valorTotal > 0 ? porcentaje(suma(dentro), valorTotal) : porcentaje(dentro.length, propias.length),
      pctTerminado:
        valorTotal > 0
          ? porcentaje(suma(terminadas), valorTotal)
          : porcentaje(terminadas.length, propias.length),
      entregas,
    };
  });
}

// ---- Lo que falta para el MVP -------------------------------------------------------

// Lo que falta, por tipo de trabajo: las historias sin terminar con lo que les
// queda (ellas y sus subtareas pendientes), y las subtareas pendientes cuya
// historia ya se termino o no esta en ningun sprint. En curso primero, de lo
// mas avanzado a lo menos.
export function pendientesDelMvp(tareas, valorDe) {
  const porId = new Map(tareas.map((t) => [t.id, t]));
  const madrePendiente = (t) => t.historia && porId.has(t.historia.id) && !porId.get(t.historia.id).terminada;
  const visibles = tareas.filter((t) => !t.terminada && !madrePendiente(t));
  const subtareasPendientes = (t) => tareas.filter((s) => !s.terminada && s.historia?.id === t.id);
  const orden = (a, b) =>
    Number(esPendiente(a)) - Number(esPendiente(b)) || b.posicionEstado - a.posicionEstado || a.id - b.id;
  return TODOS_LOS_TIPOS.flatMap((tipo) => {
    const items = visibles
      .filter((t) => t.tipoDeTrabajo === tipo.clave)
      .sort(orden)
      .map((t) => {
        const subtareas = subtareasPendientes(t);
        return {
          ...paraLista(t),
          valor: conUnDecimal(valorDe(t) + sumar(subtareas.map(valorDe))),
          subtareasPendientes: subtareas.length,
          sinEstimar: !t.historia && t.puntos === null,
        };
      });
    if (items.length === 0) return [];
    return [
      {
        clave: tipo.clave,
        nombre: tipo.nombre,
        enCurso: items.filter((i) => i.etapa === ETAPAS.started).length,
        sinEmpezar: items.filter((i) => i.etapa !== ETAPAS.started).length,
        valor: conUnDecimal(sumar(items.map((i) => i.valor))),
        items,
      },
    ];
  });
}

// ---- OKR del cliente -----------------------------------------------------------

// @decision 2026-10-24 ramiro@mispichos.com
// El objetivo del cliente es recibir el MVP el dia de la entrega con las horas
// justificadas, y se mide con cuatro resultados clave:
// - alcance del MVP terminado: la meta es 100 % el dia de la entrega. Antes de
//   esa fecha se cumple si, al ritmo de los ultimos 14 dias, se llega; despues,
//   si se llego.
// - funcionalidades entregadas: todas las historias de usuario. Antes de la
//   entrega no se juzga (null) salvo que ya esten todas.
// - horas justificadas: al menos cliente.horasMinimas. Antes de la entrega se
//   cumple si ya estan o si al ritmo actual se llega.
// - avance contra el plan: al menos cliente.avanceContraElPlanMin.
// `cumple` es null cuando no hay con que medirlo, como en los OKR del equipo.
export function okrsDelCliente({ alcance, funcionalidades, horas, plan, ritmo, mvp, cliente, unidad }) {
  const okrs = [];
  const alcancePct = alcance.valor.pct ?? alcance.tareas.pct;
  okrs.push({
    clave: "alcance",
    nombre: "Alcance del MVP terminado",
    valor: alcancePct,
    meta: 100,
    cumple:
      alcancePct === 100
        ? true
        : alcancePct === null || !mvp.configurada
          ? null
          : mvp.vencida
            ? false
            : (ritmo.proyeccion?.llegaALaEntrega ?? false),
  });
  okrs.push({
    clave: "funcionalidades",
    nombre: "Funcionalidades entregadas",
    valor: funcionalidades.pct,
    meta: 100,
    entregadas: funcionalidades.entregadas,
    total: funcionalidades.total,
    cumple:
      funcionalidades.total === 0
        ? null
        : funcionalidades.entregadas === funcionalidades.total
          ? true
          : mvp.configurada && mvp.vencida
            ? false
            : null,
  });
  const minimo = horas.minimo;
  const justificadas = horas.justificadas ?? null;
  // Las horas que habria el dia de la entrega al ritmo actual: las de la
  // proyeccion del alcance (que no pasa de lo comprometido); sin ritmo, las de hoy.
  const alaEntrega = ritmo.proyeccion?.alaEntrega ?? justificadas;
  okrs.push({
    clave: "horas",
    nombre: "Horas justificadas",
    valor: justificadas,
    meta: minimo,
    cumple:
      justificadas === null || minimo === null || unidad !== "horas"
        ? null
        : justificadas >= minimo
          ? true
          : !mvp.configurada
            ? null
            : alaEntrega >= minimo,
  });
  const planMin = cliente.avanceContraElPlanMin;
  okrs.push({
    clave: "plan",
    nombre: "Avance contra el plan",
    valor: plan.pct,
    meta: planMin,
    cumple: plan.pct === null || planMin === null ? null : plan.pct >= planMin,
  });
  return okrs;
}

// ---- Riesgos ------------------------------------------------------------------

const NIVELES = ["alto", "medio", "bajo"];

// @decision 2026-10-25 ramiro@mispichos.com
// Los riesgos son de dos clases. Los de la entrega pueden hacer que el MVP no
// llegue a la fecha o al minimo de horas, y el cliente los ve en «Riesgos».
// Las notas sobre los datos son configuracion que falta, tareas sin estimar o
// sin tipo, o un sprint que cruza la entrega: dicen cuanto creerle a un
// numero y van plegadas al final de la pantalla. Ninguno se esconde.
export const CATEGORIA_DEL_RIESGO = {
  "sin-entrega": "datos",
  "sin-horas-por-punto": "datos",
  "sin-ritmo": "entrega",
  "no-llega": "entrega",
  "entrega-vencida": "entrega",
  "horas-bajo-el-minimo": "entrega",
  "sin-sprint-en-curso": "entrega",
  "sprint-cerrado-con-pendientes": "entrega",
  "entregas-despues-del-cierre": "entrega",
  "sin-estimar": "datos",
  "sin-clasificar": "datos",
  "sprint-cruza-la-entrega": "datos",
};

// Lo que puede hacer que el MVP no llegue o que un numero de esta pantalla no
// diga lo que parece, del mas grave al menos. Cada riesgo trae su clave, su
// categoria y sus datos; la pantalla los cuenta en palabras.
export function riesgosDelMvp({ mvp, ritmo, horas, entregas, alcance, tareas, unidad }) {
  const riesgos = [];
  const agregar = (clave, nivel, datos = {}) =>
    riesgos.push({ clave, nivel, categoria: CATEGORIA_DEL_RIESGO[clave], ...datos });
  const falta = ritmo.restante > 0;

  if (!mvp.configurada) agregar("sin-entrega", "alto");
  if (unidad !== "horas") agregar("sin-horas-por-punto", "alto");
  if (falta && mvp.configurada && !mvp.vencida) {
    if (ritmo.proyeccion === null) {
      agregar("sin-ritmo", "alto", { dias: ritmo.dias });
    } else if (ritmo.proyeccion.llegaALaEntrega === false) {
      agregar("no-llega", "alto", {
        fin: ritmo.proyeccion.fin,
        diasDeAtraso: ritmo.proyeccion.diasDeAtraso,
        necesarioPorDia: ritmo.necesarioPorDia,
        porDia: ritmo.porDia,
      });
    }
  }
  if (falta && mvp.configurada && mvp.vencida) {
    agregar("entrega-vencida", "alto", { restante: ritmo.restante });
  }
  if (horas.configurado && horas.minimo !== null && horas.justificadas < horas.minimo) {
    agregar("horas-bajo-el-minimo", mvp.vencida ? "alto" : "medio", {
      faltan: horas.faltanParaElMinimo,
    });
  }
  if (falta && mvp.inicio && !mvp.enCurso && !mvp.vencida && mvp.hoy > mvp.ultimoFin) {
    agregar("sin-sprint-en-curso", "medio", { desde: mvp.ultimoFin });
  }
  for (const sprint of entregas) {
    if (sprint.fin < mvp.hoy && sprint.pendiente.tareas > 0) {
      agregar("sprint-cerrado-con-pendientes", "medio", {
        sprint: { id: sprint.id, nombre: sprint.nombre, fin: sprint.fin },
        tareas: sprint.pendiente.tareas,
        valor: sprint.pendiente.valor,
      });
    }
  }
  for (const sprint of entregas) {
    if (sprint.despues.tareas > 0) {
      agregar("entregas-despues-del-cierre", "bajo", {
        sprint: { id: sprint.id, nombre: sprint.nombre, fin: sprint.fin },
        tareas: sprint.despues.tareas,
        valor: sprint.despues.valor,
      });
    }
  }
  if (alcance.sinEstimar > 0) agregar("sin-estimar", "bajo", { tareas: alcance.sinEstimar });
  const sinClasificar = tareas.filter((t) => t.tipoDeTrabajo === SIN_CLASIFICAR.clave).length;
  if (sinClasificar > 0) agregar("sin-clasificar", "bajo", { tareas: sinClasificar });
  if (mvp.configurada) {
    for (const s of mvp.sprints.filter((s) => s.fin > mvp.entrega)) {
      agregar("sprint-cruza-la-entrega", "bajo", { sprint: { id: s.id, nombre: s.nombre, fin: s.fin } });
    }
  }
  return riesgos.sort((a, b) => NIVELES.indexOf(a.nivel) - NIVELES.indexOf(b.nivel));
}

// ---- Todo junto -----------------------------------------------------------------

// Lo que publica /api/inversion. Recibe lo mismo que armarProyecto: por cada
// iteracion, sus stories de hoy y sus historiales (obtenerHistorialDeSprints),
// y los conteos del workspace para saber cuanto quedo fuera de los sprints.
export function armarInversion(
  { iteraciones, sprints, workflows, miembros, epics, camposCustom = [], conteos = null },
  { ahora, leidoEl = [], problemas: problemasDeLectura = [], equipo = EQUIPO_VACIO }
) {
  const problemas = [...problemasDeLectura];
  const { tareas: leidas, contados } = leerTareasDelProyecto(
    { iteraciones, sprints, workflows, miembros, epics, camposCustom },
    { ahora },
    problemas
  );
  const tareas = clasificarTareas(leidas);
  const mvp = describirMvp(iteraciones, ahora, { entrega: equipo.horasPactadas?.finDelProyecto ?? null }, problemas);
  const sprintsPorId = new Map([...mvp.sprints, ...mvp.despues].map((s) => [s.id, s]));
  const idsDelMvp = new Set(mvp.sprints.map((s) => s.id));
  const delMvp = tareas.filter((t) => idsDelMvp.has(t.sprint.id));
  const posteriores = tareas.filter((t) => !idsDelMvp.has(t.sprint.id));

  // Todo se mide en horas; sin escala, en puntos, y la pantalla lo dice.
  // Una subtarea no aporta: el valor es el de su historia (ver horasInvertidas).
  const escala = equipo.escalaDeHoras ?? null;
  const unidad = tieneEscala(escala) ? "horas" : "puntos";
  anotarFueraDeEscala(tareas, escala, problemas);
  const valorDe = (t) => {
    if (t.historia) return 0;
    if (!tieneEscala(escala)) return t.puntos ?? 0;
    if (t.puntos == null) return 0;
    return horasDePuntos(t.puntos, escala) ?? 0;
  };

  const alcance = medir(delMvp, valorDe);
  const funcionalidades = resumirFuncionalidades(delMvp);
  const plan = avanceContraElPlan(delMvp, sprintsPorId, mvp.hoy, valorDe);
  const ritmo = calcularRitmo(delMvp, mvp.hoy, {
    valorDe,
    diasRestantes: mvp.diasRestantes,
    entrega: mvp.entrega,
  });
  const horas = horasInvertidas(alcance, equipo, unidad);
  const cliente = equipo.cliente ?? EQUIPO_VACIO.cliente;
  const entregas = entregasPorSprint(delMvp, mvp.sprints, valorDe);
  // Solo para saber cuanto quedo fuera de los sprints: el progreso en si ya se
  // cuenta arriba, desde las mismas stories.
  const { sinSprint } = progresoDelProyecto(
    iteraciones,
    { stories: conteos?.stories ?? null, desdeStories: contados },
    problemas
  );

  return {
    version: VERSION_DE_INVERSION,
    unidad,
    mvp: {
      hoy: mvp.hoy,
      entrega: mvp.entrega,
      configurada: mvp.configurada,
      inicio: mvp.inicio,
      fin: mvp.fin,
      diasTotales: mvp.diasTotales,
      diasTranscurridos: mvp.diasTranscurridos,
      diasRestantes: mvp.diasRestantes,
      vencida: mvp.vencida,
      enCurso: mvp.enCurso,
      sprints: mvp.sprints.map(({ id, nombre, estado, inicio, fin, url }) => ({ id, nombre, estado, inicio, fin, url })),
    },
    alcance,
    funcionalidades,
    plan,
    ritmo,
    okrs: okrsDelCliente({ alcance, funcionalidades, horas, plan, ritmo, mvp, cliente, unidad }),
    avanceAcumulado: avanceAcumulado(delMvp, sprintsPorId, mvp, {
      valorDe,
      porDia: ritmoReciente(delMvp, mvp.hoy, valorDe).porDia,
    }),
    inversion: { horas, porTipo: inversionPorTipo(delMvp, valorDe) },
    entregas,
    pendientes: pendientesDelMvp(delMvp, valorDe),
    despuesDelMvp: {
      sprints: mvp.despues.map(({ id, nombre, estado, inicio, fin, url }) => ({ id, nombre, estado, inicio, fin, url })),
      tareas: posteriores.length,
      valor: conUnDecimal(sumar(posteriores.map(valorDe))),
      fueraDeSprints: sinSprint,
    },
    riesgos: riesgosDelMvp({ mvp, ritmo, horas, entregas, alcance, tareas: delMvp, unidad }),
    supuestos: {
      escala,
      horasPactadasPorIntegrante: equipo.horasPactadas?.porIntegrante ?? null,
      diasDelRitmo: DIAS_DEL_RITMO,
      tipos: TIPOS_DE_TRABAJO.map(({ nombre, prefijos }) => ({ nombre, prefijos })),
    },
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}
