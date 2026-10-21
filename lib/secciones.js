// Registro de las secciones del backoffice.
//
// Es la unica fuente de verdad de que secciones existen, como se llaman, que
// endpoint consume cada una y que forma tiene ese endpoint. Lo leen la navegacion
// y el menu inicial (presentacion) y tambien los route.js cuando no pueden leer
// su fuente (API), asi que el nombre y la ruta de una seccion se escriben una
// sola vez. Modulo puro: sin React, sin fetch, sin process.env.

// El contrato de cada seccion describe lo que su endpoint devuelve con 200.
// Cuando la fuente no esta configurada, el endpoint responde 501 y publica este
// mismo contrato, asi la pantalla y la API no pueden prometer cosas distintas.
export const SECCIONES = [
  {
    slug: "operacion",
    grupo: "Gestión",
    titulo: "Operación",
    subtitulo: "Cola de ahora, órdenes del período y tiempos de servicio",
    resumen:
      "Lo que el lavadero mira todos los días: cuántos autos esperan ahora, cuántos entraron y cuánto se está demorando cada servicio.",
    ruta: "/dashboards/operacion",
    endpoint: "/api/operacion",
    estado: "conectada",
    origen: "app de gestión de LavApp",
    contrato: [
      {
        campo: "?dias=",
        tipo: "7 | 30 | 90",
        descripcion: "El período: cuántos días hacia atrás desde ahora (30 si no se manda)",
      },
      {
        campo: "periodo",
        tipo: "object",
        descripcion: "{ dias, desde, hasta }: el recorte aplicado, en instantes ISO",
      },
      {
        campo: "totales",
        tipo: "object",
        descripcion:
          "ordenes, entregadas y canceladas del período; enCola, enLavado y listos de este momento (aunque hayan llegado antes)",
      },
      {
        campo: "demoraPromedioMin / demoraMedianaMin / esperaPromedioMin / lavadoPromedioMin",
        tipo: "number | null",
        descripcion:
          "Minutos de la llegada a la entrega, de la llegada al inicio del lavado y del inicio al fin del lavado, de las órdenes del período; null si no hay medidas. medidas: cuántas órdenes entraron en cada promedio",
      },
      {
        campo: "porDia",
        tipo: "array",
        descripcion: "Una fila por día del período: { dia, llegaron, entregadas }",
      },
      {
        campo: "porLavadero / porServicio / porEstado",
        tipo: "array",
        descripcion:
          "{ lavadero, ordenes, entregadas, enCola, demoraPromedioMin } · { servicio, ordenes } · { estado, ordenes }",
      },
      {
        campo: "ordenes",
        tipo: "array",
        descripcion:
          "Una fila por orden, la más reciente primero: { id, lavadero, patente, servicio, estado, llegada, ingreso, finLavado, salida, esperaMin, lavadoMin, demoraMin, delPeriodo }",
      },
      {
        campo: "lectura / problemas",
        tipo: "object / array",
        descripcion:
          "{ leidoEl, desactualizado }: de cuándo es el dato. problemas: filas de la app de gestión que no se entendieron y quedaron afuera: { orden, campo, valor, motivo }",
      },
    ],
  },
  {
    slug: "lavaderos",
    grupo: "Gestión",
    titulo: "Lavaderos y sucursales",
    subtitulo: "Las cuentas que usan LavApp",
    resumen:
      "Altas, plan contratado, sucursales por cuenta y actividad reciente. El padrón de clientes del producto.",
    ruta: "/dashboards/lavaderos",
    endpoint: "/api/lavaderos",
    estado: "conectada",
    origen: "app de gestión de LavApp",
    contrato: [
      {
        campo: "totales",
        tipo: "object",
        descripcion:
          "cuentas, activas (con alguna orden en 30 días), inactivas, suspendidas, altasDelMes, sucursales",
      },
      {
        campo: "porPlan / porCiudad",
        tipo: "array",
        descripcion: "{ nombre, valor }: cuentas por plan y por ciudad, de mayor a menor",
      },
      {
        campo: "altasPorMes",
        tipo: "array",
        descripcion: "Una fila por mes de los últimos 12: { mes, altas }",
      },
      {
        campo: "lavaderos",
        tipo: "array",
        descripcion:
          "Una fila por cuenta: { id, nombre, ciudad, plan, sucursales, altaEl, ultimaActividad, diasSinActividad, estado: activa | inactiva | suspendida }",
      },
      {
        campo: "lectura / problemas",
        tipo: "object / array",
        descripcion: "De cuándo es el dato y las filas que no se entendieron",
      },
    ],
  },
  {
    slug: "clientes",
    grupo: "Gestión",
    titulo: "Clientes y vehículos",
    subtitulo: "Los clientes finales del lavadero",
    resumen:
      "Quiénes vuelven y cada cuánto. Vehículos por cliente, histórico de lavados y recurrencia.",
    ruta: "/dashboards/clientes",
    endpoint: "/api/clientes",
    estado: "conectada",
    origen: "app de gestión de LavApp",
    contrato: [
      {
        campo: "totales",
        tipo: "object",
        descripcion:
          "clientes, recurrentes (2 o más lavados en 90 días), conLavados, sinLavados, nuevosDelMes, vehiculos, lavados, lavadosPorCliente",
      },
      {
        campo: "porLavadero",
        tipo: "array",
        descripcion:
          "{ lavadero, clientes, recurrentes, ocasionales, sinLavados, vehiculos, lavados }",
      },
      {
        campo: "distribucionLavados",
        tipo: "array",
        descripcion: "{ nombre, valor }: clientes por tramo de lavados totales",
      },
      {
        campo: "clientes",
        tipo: "array",
        descripcion:
          "Una fila por cliente, de más a menos lavados: { id, lavadero, nombre, altaEl, vehiculos, lavados, lavadosRecientes, ultimoLavado, diasDesdeUltimoLavado, recurrente }",
      },
      {
        campo: "lectura / problemas",
        tipo: "object / array",
        descripcion: "De cuándo es el dato y las filas que no se entendieron",
      },
    ],
  },
  {
    slug: "facturacion",
    grupo: "Gestión",
    titulo: "Facturación y suscripciones",
    subtitulo: "Planes, cobros y morosidad",
    resumen:
      "Lo comercial del producto: qué plan tiene cada cuenta, qué se cobraría y qué está vencido.",
    ruta: "/dashboards/facturacion",
    endpoint: "/api/facturacion",
    estado: "conectada",
    origen: "app de gestión de LavApp",
    contrato: [
      {
        campo: "totales",
        tipo: "object",
        descripcion:
          "cuentasConPlan, cuentasActivas, mrrPorPlanes [{ moneda, valor }] (precio mensual del plan de cada cuenta activa), suscripciones, activas, pausadas, canceladas, vencidas (con cobros impagos), mrr [{ moneda, valor }] (de las suscripciones activas)",
      },
      {
        campo: "planes",
        tipo: "array",
        descripcion:
          "El catálogo: { id, nombre, precioBase, moneda, periodicidad, precioMensual, cuentas, cuentasActivas, mrr }",
      },
      {
        campo: "porEstado",
        tipo: "array",
        descripcion: "{ estado, suscripciones } para ACTIVA, PAUSADA y CANCELADA",
      },
      {
        campo: "suscripciones",
        tipo: "array",
        descripcion:
          "Una fila por suscripción, las impagas primero: { id, lavadero, plan, periodicidad, importe, importeMensual, moneda, estado, proximoCobro, cobrosPendientes, cobrosVencidos, vencimientoPendienteMasAntiguo, ultimoPago, impaga, mrr }. Hoy la app de gestión no crea suscripciones: la lista llega vacía",
      },
      {
        campo: "lectura / problemas",
        tipo: "object / array",
        descripcion: "De cuándo es el dato y las filas que no se entendieron",
      },
    ],
  },
  {
    slug: "encuesta-lavaderos",
    grupo: "Investigación",
    titulo: "Encuesta a lavaderos",
    subtitulo: "Gestión operativa relevada en 40 lavaderos",
    resumen:
      "El relevamiento que originó el producto: cómo registran hoy, dónde pierden clientes y qué dificultades declaran.",
    ruta: "/dashboards/encuesta-lavaderos",
    endpoint: "/api/respuestas",
    estado: "conectada",
    origen: "planilla de Google (con respaldo local)",
    contrato: [
      {
        campo: "(raíz)",
        tipo: "array",
        descripcion:
          "Una fila por respuesta normalizada, con los campos de CAMPOS en lib/normalizar.js",
      },
    ],
  },
  {
    slug: "performance",
    grupo: "Proyecto",
    titulo: "Performance",
    subtitulo: "Avance del proyecto y de cada sprint, con los datos de Shortcut",
    resumen:
      "Cómo viene el proyecto entero (los OKR, el avance total y el equipo) y cada sprint: qué se planificó y cuánto se cumplió, qué se terminó y qué falta, el ritmo día a día y cuánto tarda cada tarea. Para seguir el proyecto sin entrar a Shortcut.",
    ruta: "/dashboards/performance",
    endpoint: "/api/performance",
    estado: "conectada",
    origen: "Shortcut",
    contrato: [
      {
        campo: "sprint",
        tipo: "object",
        descripcion:
          "{ id, nombre, estado, inicio, fin, diasTotales, diasRestantes, diasParaEmpezar, url } del sprint pedido (?sprint=<id>) o del que está en curso",
      },
      {
        campo: "sprints",
        tipo: "array",
        descripcion: "Todos los sprints para el selector: { id, nombre, estado, inicio, fin }",
      },
      {
        campo: "resumen",
        tipo: "object",
        descripcion:
          "tareas: { total, terminadas, enCurso, pendientes, pct, subtareas, archivadas }; puntos: { total, terminados, pct, tareasSinEstimar }",
      },
      {
        campo: "porEstado",
        tipo: "array",
        descripcion: "Una fila por columna del tablero, en su orden: { id, nombre, etapa, tareas, puntos }",
      },
      {
        campo: "burndown",
        tipo: "object",
        descripcion:
          "dias: una fila por día del sprint { dia, tareas, puntos, alcanceTareas, alcancePuntos, idealTareas, idealPuntos }, con null en los días que no pasaron; alcance (el total de hoy, de donde baja la línea ideal), cambiosDeAlcance, ingresosEstimados",
      },
      {
        campo: "porIniciativa / porEspecialidad / porResponsable",
        tipo: "object",
        descripcion:
          "grupos: [{ nombre, total, terminadas, enCurso, pendientes, puntos, puntosTerminados, pct }] por epic, por tipo de trabajo (el campo custom Skill Set de Shortcut; «Sin tipo de trabajo» si no lo tiene) y por responsable (con compartidas: las tareas con más de uno); porEspecialidad trae además motivo: null, «sin-catalogo» (no se pudo leer /custom-fields) o «sin-campo» (el workspace no tiene Skill Set), y entonces grupos vacío",
      },
      {
        campo: "cumplimiento",
        tipo: "object",
        descripcion:
          "planificadas: { total (todo lo que pasó por el sprint: lo que está hoy más lo movido a otro), terminadas, enCurso, pendientes, movidas, pct }; sinTerminar: las planificadas no terminadas, con movidaA { id, nombre } si se fueron a otro sprint; proyeccion: { diasTranscurridos, terminadasPorDia, terminadasAlCierre, total, pct } o null si el sprint no está en curso",
      },
      {
        campo: "ritmo",
        tipo: "object",
        descripcion: "dias: una fila por día transcurrido del sprint { dia, entraron, terminadas }",
      },
      {
        campo: "cycleTime",
        tipo: "object",
        descripcion:
          "{ promedioDias, medianaDias, tareas: [{ id, titulo, dias }], sinDatos } de las tareas terminadas",
      },
      {
        campo: "tiempoEnSprint",
        tipo: "object",
        descripcion:
          "{ promedioDias, medianaDias, tareas: [{ id, titulo, dias }], sinDatos }: días de calendario desde que cada tarea terminada entró al sprint hasta que se terminó",
      },
      {
        campo: "tiempoPorColumna",
        tipo: "object",
        descripcion:
          "columnas: [{ id, nombre, etapa, tareas, promedioDias, medianaDias }] en el orden del tablero, sin las de tipo done; medidas; sinDatos",
      },
      {
        campo: "proyecto",
        tipo: "object",
        descripcion:
          "El proyecto entero, no solo el sprint. progreso: { sprints: [{ id, nombre, estado, inicio, fin, url, tareas: { total, terminadas, enCurso, pendientes, pct }, puntos: { total, terminados, pct, tareasSinEstimar } }] del primero al último (desde las stats de cada iteración; el sprint pedido, desde sus stories), tareas y puntos sumados igual, sinSprint (stories no archivadas del workspace menos lo que suman los sprints: no cuentan; null si no se pudo contar o no cierra) }; errores: { reportados, resueltos, abiertos, pctResueltos (bugs de todo el workspace, una búsqueda por cada uno; null si no se pudo contar; pctResueltos null si los conteos no cierran), enElSprint: { reportados (entraron al sprint, el numerador del OKR), sinResolver } }",
      },
      {
        campo: "equipo",
        tipo: "object",
        descripcion:
          "KPIs y OKRs del equipo con los roles, horas pactadas y metas de data/equipo.json. porRol: { grupos: [{ rol, integrantes, tareas, puntos, terminadas, puntosTerminados, pctTareas, pctPuntos }], compartidas }; wip: { maximoPorPersona, grupos: [{ rol, enCurso, personasActivas, porPersona, porEstado, sobrecargado, personas }] }; carga: { personas: [{ nombre, rol, detalle, tareas, puntos (repartidos entre los responsables de cada tarea), terminadas, puntosTerminados, enCurso, sinEstimar }], sinAsignar, sinConfigurar }; horas: { configurado, horasPorPunto, horasPactadasPorIntegrante, diasDelPeriodo (los propios: el día del cambio de sprint cuenta para el primero), diasDelProyecto, reparto: { fin, configurado } (hasta cuándo se reparten las horas y si esa fecha sale de data/equipo.json), personas: [{ nombre, rol, detalle, horasPactadas, capacidad (la parte de las horas pactadas que toca al período), demanda, dentroDeLoPactado, extras, hechas, asignadas (demanda más lo planificado que se movió a otro sprint), utilizacion, efectividad (hechas / asignadas) }], equipo: { capacidad, demanda, extras, hechas, asignadas, utilizacion, efectividad, conSobrecarga }, sinHoras }; bugs: { bugs, bugsAbiertosEnSprint, bugsTerminados, historiasTerminadas, historias, ratio (null si no hay historias terminadas o si el workspace no tiene ningún bug registrado), sinRegistro }; retrabajo: { cerradas (las tareas que se cerraron alguna vez, con historial), conRetrabajo, pct, reabiertas, devueltas, conCodigoNuevo, vueltas, casos: [{ id, titulo, url, historia, responsables, terminada, conCodigoNuevo, vueltas: [{ el, quien, desde, hacia, reapertura, conCodigoNuevo }] }] (la vuelta más reciente primero), excluidas (las mismas, con la etiqueta no-es-retrabajo), descartadas: { replanificadas, correcciones }, sinHistorial, etiqueta, minutosDeCorreccion } (volver atrás es pasar de una columna de trabajo o de Done a una columna de trabajo anterior; null si no se calculó); okrs: [{ clave, nombre, valor, meta, descripcionMeta, cumple }] (bugsRatio, retrabajo, efectividad, utilizacion); configuracion",
      },
      {
        campo: "terminadas / pendientes",
        tipo: "array",
        descripcion:
          "Las tareas del sprint: { id, titulo, url, estado, etapa, epic, responsables, puntos, historia, terminadaEl }",
      },
      {
        campo: "version",
        tipo: "string",
        descripcion:
          "La forma de los datos (VERSION_DE_DATOS de lib/kpis/performance.js, una fecha AAAA-MM-DD). La traen /api/performance, /proyecto y /historial; si no coincide con la de la pantalla, la pantalla pide reiniciar el servidor o recargar en vez de romperse",
      },
      {
        campo: "lectura",
        tipo: "object",
        descripcion: "{ leidoEl, desactualizado }: de cuándo es el dato que se está mostrando",
      },
      {
        campo: "problemas",
        tipo: "array",
        descripcion:
          "Datos de Shortcut que no se pudieron leer o traducir: { tarea, campo, valor, motivo }",
      },
      {
        campo: "GET|POST /api/performance/proyecto",
        tipo: "endpoint",
        descripcion:
          "El proyecto entero, lo que la pantalla abre por defecto: todos los sprints sumados, contados desde las stories de cada uno. ambito: \"proyecto\"; sprints (para el selector); periodo: { inicio, fin, diasTotales (de calendario, del primer sprint al último), diasTranscurridos, diasRestantes, diasParaEmpezar, diasDelProyecto (hasta horasPactadas.finDelProyecto o el fin del último sprint), finDelReparto, repartoConfigurado, sprints: { total, terminados, enCurso, proximos }, enCurso: { id, nombre } o null }; progreso y errores (como `proyecto` del reporte de un sprint); porSprint (las filas de /historial, para todos los sprints empezados); porIniciativa, porEspecialidad y porResponsable (sobre todas las tareas); equipo (como el del sprint, con las horas pactadas que tocan al período); archivadas; lectura; problemas. Sin sprints en el workspace responde 200 con todo vacío, no 404. POST = sin cache.",
      },
      {
        campo: "GET|POST /api/performance/historial",
        tipo: "endpoint",
        descripcion:
          "Aparte, por costo: sprints: una fila por sprint en curso o terminado (los últimos 8) { id, nombre, estado, inicio, fin, url, planificadas, cumplidas, pctCumplimiento, movidas, total, terminadas, pctTerminado, puntosTotales, puntosTerminados }; lectura; problemas",
      },
    ],
  },
  {
    slug: "estado",
    grupo: "Sistema",
    titulo: "Estado del sistema",
    subtitulo: "De dónde salieron los datos y qué se rechazó",
    resumen:
      "Si el backoffice cayó al respaldo o descartó filas, se ve acá. Es la única pantalla donde un fallback deja de ser silencioso.",
    ruta: "/dashboards/estado",
    endpoint: "/api/salud",
    estado: "conectada",
    origen: "el propio backoffice",
    contrato: [
      {
        campo: "fuente",
        tipo: '"planilla" | "respaldo"',
        descripcion: "Qué fuente se terminó usando en esta request",
      },
      {
        campo: "motivo",
        tipo: "string | null",
        descripcion: "Por qué se cayó al respaldo; null si se leyó la planilla",
      },
      {
        campo: "problemas",
        tipo: "array",
        descripcion: "Filas o celdas rechazadas, con fila, campo, valor y motivo",
      },
    ],
  },
];

// El orden en que la navegacion dibuja los grupos. Explicito y no derivado de
// SECCIONES: el orden de los grupos es una decision de diseno, no un efecto del
// orden en que se fueron agregando las secciones.
export const GRUPOS = ["Gestión", "Investigación", "Proyecto", "Sistema"];

export const buscarSeccion = (slug) => SECCIONES.find((s) => s.slug === slug);

export const seccionesDelGrupo = (grupo) =>
  SECCIONES.filter((s) => s.grupo === grupo);

// 501 Not Implemented: el endpoint existe y esta ruteado, pero no hay fuente
// detras (no esta configurada). No es 404 (eso diria "esta ruta no existe", y
// existe) ni 200 con un array vacio (eso diria "no hay datos", que es mentira:
// hay datos, no hay conexion). La pantalla distingue los tres casos.
export const ESTADO_SIN_FUENTE = 501;

// Cuerpo unico de un endpoint que no pudo conectar con su fuente. Vive aca y no
// en cada route.js para que el contrato que publica la API y el que muestra la
// pantalla no puedan separarse. `motivo` dice que falta; sin el, el generico.
export function cuerpoSinFuente(slug, motivo = null) {
  const seccion = buscarSeccion(slug);
  if (!seccion) throw new Error(`Seccion desconocida: ${slug}`);
  return {
    conectada: false,
    seccion: seccion.slug,
    titulo: seccion.titulo,
    motivo: motivo ?? `El backoffice todavía no está conectado a la ${seccion.origen}.`,
    contrato: seccion.contrato,
  };
}
