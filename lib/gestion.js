// Fuente de datos de las secciones de Gestion (Operacion, Lavaderos y
// sucursales, Clientes y vehiculos, Facturacion y suscripciones): la API de
// backoffice de la app de gestion de LavApp (lavapp-backend, GET /backoffice/*).
//
// Es el unico archivo que habla con esa API. La URL sale de GESTION_API_URL y
// la clave de GESTION_API_KEY (el mismo valor que BACKOFFICE_API_KEY en el
// backend). La clave viaja en el header X-Backoffice-Key y solo desde el
// servidor: no se loguea, no viaja en ninguna respuesta y /api/salud solo
// informa si esta configurada.
//
// Las lecturas pasan por el cache de fetch de Next (60 segundos) para que una
// pantalla abierta no pegue al backend en cada carga; el boton "Actualizar" lee
// sin cache y lo vence. No hay respaldo en disco: inventar ordenes seria peor
// que no mostrarlas. Si la app de gestion no responde, el endpoint contesta 502
// con el motivo y la pantalla lo dice (y si fallo al actualizar, conserva lo que
// ya mostraba).
import { revalidateTag } from "next/cache";

const SEGUNDOS_CACHE = 60;
const TAG_CACHE = "gestion";
const HEADER_CLAVE = "X-Backoffice-Key";

export const VARIABLES = ["GESTION_API_URL", "GESTION_API_KEY"];

// Que variables faltan para leer la app de gestion. Vacio si esta todo.
export const variablesFaltantes = () => VARIABLES.filter((variable) => !process.env[variable]);
export const gestionConfigurada = () => variablesFaltantes().length === 0;

class ErrorDeGestion extends Error {
  constructor(motivo, estado = null) {
    super(motivo);
    this.estado = estado;
  }
}

// El motivo se muestra en la pantalla, que lee gente de negocio: primero que
// paso en criollo, al final el status para quien lo tenga que arreglar. El
// backend contesta problem+json y su `detail` ya viene pensado para mostrarse.
function motivoDeEstado(estado, detalle) {
  const conDetalle = detalle ? `: ${detalle}` : "";
  if (estado === 401) {
    return "La app de gestión rechazó la clave del backoffice: GESTION_API_KEY tiene que ser la misma que BACKOFFICE_API_KEY en el servidor (HTTP 401).";
  }
  if (estado === 503) return `La app de gestión no tiene habilitado el backoffice${conDetalle} (HTTP 503).`;
  if (estado === 404) {
    return "La app de gestión no tiene esta ruta: la versión desplegada no incluye la API de backoffice (HTTP 404).";
  }
  if (estado === 400) return `La app de gestión rechazó la consulta${conDetalle} (HTTP 400).`;
  if (estado >= 500) {
    return `La app de gestión está teniendo problemas: probá de nuevo en unos minutos (HTTP ${estado}).`;
  }
  return `La app de gestión respondió algo inesperado (HTTP ${estado}).`;
}

// El header Date lo pone el backend al generar la respuesta, y el cache de Next
// lo guarda con el cuerpo. Es la unica forma de saber de cuando es un dato que
// se sirvio desde el cache.
function fechaDeRespuesta(res) {
  const instante = Date.parse(res.headers.get("date") ?? "");
  return Number.isFinite(instante) ? new Date(instante).toISOString() : null;
}

function urlDe(ruta, parametros) {
  const base = process.env.GESTION_API_URL.replace(/\/+$/, "");
  const consulta = new URLSearchParams(
    Object.entries(parametros).filter(([, valor]) => valor != null)
  ).toString();
  return base + ruta + (consulta ? `?${consulta}` : "");
}

// `fresco` saltea el cache: es la lectura del boton "Actualizar".
async function pedir(ruta, { parametros = {}, fresco }) {
  let res;
  try {
    res = await fetch(urlDe(ruta, parametros), {
      headers: { [HEADER_CLAVE]: process.env.GESTION_API_KEY, Accept: "application/json" },
      ...(fresco
        ? { cache: "no-store" }
        : { next: { revalidate: SEGUNDOS_CACHE, tags: [TAG_CACHE] } }),
    });
  } catch (e) {
    throw new ErrorDeGestion(`No se pudo conectar con la app de gestión: ${e.message}`);
  }
  if (!res.ok) {
    const detalle = await res
      .json()
      .then((cuerpo) => (typeof cuerpo?.detail === "string" ? cuerpo.detail : null))
      .catch(() => null);
    throw new ErrorDeGestion(motivoDeEstado(res.status, detalle), res.status);
  }

  let datos;
  try {
    datos = await res.json();
  } catch {
    throw new ErrorDeGestion("La app de gestión devolvió una respuesta que no es JSON.");
  }
  if (!Array.isArray(datos)) {
    throw new ErrorDeGestion("La app de gestión devolvió algo que no es una lista.");
  }
  return { datos, leidoEl: fechaDeRespuesta(res) };
}

const sinConfigurar = () => ({
  datos: null,
  fuente: "sin-configurar",
  motivo: `Falta configurar el acceso a la app de gestión en el servidor (${variablesFaltantes().join(" y ")}).`,
  problemas: [],
});

// Un error que no sea de la app de gestion (un bug nuestro) no se disfraza de
// caida de la API: se relanza para que se vea como lo que es.
function conError(e) {
  if (!(e instanceof ErrorDeGestion)) throw e;
  return { datos: null, fuente: "error", motivo: e.message, problemas: [] };
}

// Formato de loader del repo: `datos` es el array crudo del backend, o null si
// no se pudo leer y entonces `motivo` dice por que.
async function leer(ruta, opciones) {
  if (!gestionConfigurada()) return sinConfigurar();
  try {
    const { datos, leidoEl } = await pedir(ruta, opciones);
    return { datos, fuente: "gestion", motivo: null, problemas: [], leidoEl };
  } catch (e) {
    return conError(e);
  }
}

// Las ordenes que llegaron en [desde, hasta) mas las abiertas ahora. Instantes ISO.
export const obtenerOrdenes = ({ desde, hasta, fresco = false } = {}) =>
  leer("/backoffice/ordenes", { parametros: { desde, hasta }, fresco });

export const obtenerLavaderos = ({ fresco = false } = {}) =>
  leer("/backoffice/lavaderos", { fresco });

// `desde` es la fecha de corte de los lavados recientes de cada cliente.
export const obtenerClientes = ({ desde, fresco = false } = {}) =>
  leer("/backoffice/clientes", { parametros: { desde }, fresco });

export const obtenerPlanes = ({ fresco = false } = {}) => leer("/backoffice/planes", { fresco });

export const obtenerSuscripciones = ({ fresco = false } = {}) =>
  leer("/backoffice/suscripciones", { fresco });

// Vence todo lo cacheado de la app de gestion: la proxima carga de cualquier
// seccion vuelve a leer.
export function vencerCache() {
  revalidateTag(TAG_CACHE, { expire: 0 });
}
