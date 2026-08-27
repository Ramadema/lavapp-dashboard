// Registro de las secciones del backoffice.
//
// Es la unica fuente de verdad de que secciones existen, como se llaman, que
// endpoint consume cada una y que forma tiene ese endpoint. Lo leen la navegacion
// y el menu inicial (presentacion) y tambien los route.js de las areas que
// todavia no tienen datos (API), asi que el nombre y la ruta de una seccion se
// escriben una sola vez. Modulo puro: sin React, sin fetch, sin process.env.

// El contrato de las secciones `pendiente` es una propuesta, no un acuerdo: lo
// escribimos desde el backoffice para tener algo concreto que discutir con quien
// construya la app de gestion. Cuando se acuerde de verdad, se corrige aca y la
// pantalla y el endpoint se enteran solos.
export const SECCIONES = [
  {
    slug: "operacion",
    grupo: "Gestión",
    titulo: "Operación",
    subtitulo: "Turnos, cola del día y tiempos de servicio",
    resumen:
      "Lo que el lavadero mira todos los días: qué autos entraron, cuántos esperan y cuánto se está demorando cada servicio.",
    ruta: "/dashboards/operacion",
    endpoint: "/api/operacion",
    estado: "pendiente",
    origen: "app de gestión de LavApp",
    contrato: [
      {
        campo: "ordenes",
        tipo: "array",
        descripcion:
          "Una fila por orden de trabajo del período: { id, lavadero, patente, servicio, estado, ingreso, salida }",
      },
      {
        campo: "enCola",
        tipo: "number",
        descripcion: "Vehículos esperando en este momento",
      },
      {
        campo: "demoraPromedioMin",
        tipo: "number",
        descripcion: "Minutos promedio entre ingreso y entrega, del período pedido",
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
    estado: "pendiente",
    origen: "app de gestión de LavApp",
    contrato: [
      {
        campo: "lavaderos",
        tipo: "array",
        descripcion:
          "Una fila por cuenta: { id, nombre, ciudad, plan, sucursales, altaEl, ultimaActividad }",
      },
      {
        campo: "activos",
        tipo: "number",
        descripcion: "Cuentas con al menos una orden en los últimos 30 días",
      },
      {
        campo: "altasDelMes",
        tipo: "number",
        descripcion: "Cuentas dadas de alta en el mes corriente",
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
    estado: "pendiente",
    origen: "app de gestión de LavApp",
    contrato: [
      {
        campo: "clientes",
        tipo: "array",
        descripcion:
          "Una fila por cliente final: { id, lavadero, nombre, vehiculos, lavados, ultimoLavado }",
      },
      {
        campo: "recurrentes",
        tipo: "number",
        descripcion: "Clientes con dos o más lavados en los últimos 90 días",
      },
    ],
  },
  {
    slug: "facturacion",
    grupo: "Gestión",
    titulo: "Facturación y suscripciones",
    subtitulo: "Planes, cobros y morosidad",
    resumen:
      "Lo comercial del producto: qué plan tiene cada cuenta, qué se cobró y qué está vencido.",
    ruta: "/dashboards/facturacion",
    endpoint: "/api/facturacion",
    estado: "pendiente",
    origen: "app de gestión de LavApp",
    contrato: [
      {
        campo: "suscripciones",
        tipo: "array",
        descripcion:
          "Una fila por suscripción: { lavadero, plan, importe, moneda, estado, proximoCobro }",
      },
      {
        campo: "mrr",
        tipo: "number",
        descripcion: "Ingreso mensual recurrente en la moneda de la cuenta",
      },
      {
        campo: "vencidas",
        tipo: "number",
        descripcion: "Suscripciones con al menos un cobro impago",
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
export const GRUPOS = ["Gestión", "Investigación", "Sistema"];

export const buscarSeccion = (slug) => SECCIONES.find((s) => s.slug === slug);

export const seccionesDelGrupo = (grupo) =>
  SECCIONES.filter((s) => s.grupo === grupo);

// 501 Not Implemented: el endpoint existe y esta ruteado, pero todavia no hay
// fuente detras. No es 404 (eso diria "esta ruta no existe", y existe) ni 200 con
// un array vacio (eso diria "no hay datos", que es mentira: hay datos, no hay
// conexion). La pantalla distingue los tres casos.
export const ESTADO_SIN_FUENTE = 501;

// Cuerpo unico de las areas todavia no conectadas. Vive aca y no en cada route.js
// para que el contrato que publica la API y el que muestra la pantalla no puedan
// separarse.
export function cuerpoSinFuente(slug) {
  const seccion = buscarSeccion(slug);
  if (!seccion) throw new Error(`Seccion desconocida: ${slug}`);
  return {
    conectada: false,
    seccion: seccion.slug,
    titulo: seccion.titulo,
    motivo: `El backoffice todavía no está conectado a la ${seccion.origen}.`,
    contrato: seccion.contrato,
  };
}
