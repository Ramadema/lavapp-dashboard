// Fuente de datos de la seccion Performance: la API REST v3 de Shortcut.
//
// Es el unico archivo que habla con Shortcut. El token sale de
// SHORTCUT_API_TOKEN y nunca sale del servidor: no se loguea, no viaja en
// ninguna respuesta y /api/salud solo informa si esta configurado.
//
// Las lecturas pasan por el cache de fetch de Next con stale-while-revalidate,
// porque la API corta a los 200 requests por minuto y una pantalla abierta no
// puede gastarlos. No hay respaldo en disco: inventar un sprint seria peor que
// no mostrarlo. El respaldo es el propio cache, que solo guarda respuestas 200 y
// sigue sirviendo la ultima lectura buena mientras Shortcut falla.
import { revalidateTag } from "next/cache";

const URL_BASE = "https://api.app.shortcut.com/api/v3";

// Lo que cambia durante el dia (los sprints y sus stories) se relee cada 5
// minutos; los catalogos que casi no cambian (workflows, personas, epics), cada 15.
const SEGUNDOS_CACHE = 300;
const SEGUNDOS_CACHE_CATALOGOS = 900;

// Todo lo que el boton "Actualizar" tiene que invalidar lleva este tag.
const TAG_CACHE = "shortcut";

export const shortcutConfigurado = () => Boolean(process.env.SHORTCUT_API_TOKEN);

class ErrorDeShortcut extends Error {}

// El motivo se muestra en la pantalla de Performance, que lee gente de negocio:
// primero que paso en criollo, al final el status para quien lo tenga que arreglar.
function motivoDeEstado(estado) {
  if (estado === 401 || estado === 403) {
    return `Shortcut rechazó el token de acceso: hay que revisar SHORTCUT_API_TOKEN (HTTP ${estado}).`;
  }
  if (estado === 404) return "Shortcut no encontró lo que se le pidió (HTTP 404).";
  if (estado === 429) {
    return "Shortcut está frenando las consultas porque llegaron demasiadas juntas: probá de nuevo en un minuto (HTTP 429).";
  }
  if (estado >= 500) {
    return `Shortcut está teniendo problemas: probá de nuevo en unos minutos (HTTP ${estado}).`;
  }
  return `Shortcut respondió algo inesperado (HTTP ${estado}).`;
}

// El header Date lo pone Shortcut al generar la respuesta, y el cache de Next lo
// guarda con el cuerpo. Es la unica forma de saber de cuando es un dato que se
// sirvio desde el cache.
function fechaDeRespuesta(res) {
  const instante = Date.parse(res.headers.get("date") ?? "");
  return Number.isFinite(instante) ? new Date(instante).toISOString() : null;
}

// `fresco` saltea el cache: es la lectura del boton "Actualizar".
async function pedir(ruta, { segundos, fresco }) {
  let res;
  try {
    res = await fetch(URL_BASE + ruta, {
      headers: {
        "Shortcut-Token": process.env.SHORTCUT_API_TOKEN,
        Accept: "application/json",
      },
      ...(fresco
        ? { cache: "no-store" }
        : { next: { revalidate: segundos, tags: [TAG_CACHE] } }),
    });
  } catch (e) {
    throw new ErrorDeShortcut(`No se pudo conectar con Shortcut: ${e.message}`);
  }
  if (!res.ok) throw new ErrorDeShortcut(motivoDeEstado(res.status));

  try {
    return { datos: await res.json(), leidoEl: fechaDeRespuesta(res) };
  } catch {
    throw new ErrorDeShortcut("Shortcut devolvió una respuesta que no es JSON.");
  }
}

const sinConfigurar = () => ({
  datos: null,
  fuente: "sin-configurar",
  motivo: "Falta configurar el acceso a Shortcut en el servidor (SHORTCUT_API_TOKEN).",
  problemas: [],
});

// Un error que no sea de Shortcut (un bug nuestro) no se disfraza de caida de
// la API: se relanza para que se vea como lo que es.
function conError(e) {
  if (!(e instanceof ErrorDeShortcut)) throw e;
  return { datos: null, fuente: "error", motivo: e.message, problemas: [] };
}

// Todas las iteraciones (sprints) del workspace. Devuelve el formato de loader
// del repo: `datos` es el array crudo de Shortcut, o null si no se pudo leer y
// entonces `motivo` dice por que.
export async function obtenerSprints({ fresco = false } = {}) {
  if (!shortcutConfigurado()) return sinConfigurar();
  try {
    const { datos, leidoEl } = await pedir("/iterations", {
      segundos: SEGUNDOS_CACHE,
      fresco,
    });
    return { datos, fuente: "shortcut", motivo: null, problemas: [], leidoEl };
  } catch (e) {
    return conError(e);
  }
}

// Lo necesario para el reporte de un sprint: sus stories y los catalogos que
// traducen ids a nombres (estados, personas, epics). Las cuatro lecturas van en
// paralelo. `leidoEl` es el de las stories, que es lo que envejece: los
// catalogos tienen su propio cache mas largo a proposito.
export async function obtenerSprint(id, { fresco = false } = {}) {
  if (!shortcutConfigurado()) return sinConfigurar();
  try {
    const [stories, workflows, miembros, epics] = await Promise.all([
      pedir(`/iterations/${id}/stories`, { segundos: SEGUNDOS_CACHE, fresco }),
      pedir("/workflows", { segundos: SEGUNDOS_CACHE_CATALOGOS, fresco }),
      pedir("/members", { segundos: SEGUNDOS_CACHE_CATALOGOS, fresco }),
      pedir("/epics", { segundos: SEGUNDOS_CACHE_CATALOGOS, fresco }),
    ]);
    return {
      datos: {
        stories: stories.datos,
        workflows: workflows.datos,
        miembros: miembros.datos,
        epics: epics.datos,
      },
      fuente: "shortcut",
      motivo: null,
      problemas: [],
      leidoEl: stories.leidoEl,
    };
  } catch (e) {
    return conError(e);
  }
}

// Despues de una lectura fresca, vence lo cacheado para que la proxima carga
// normal tambien lea de Shortcut en vez de servir lo de antes.
//
// Workaround: Next aplica este vencimiento recien despues de mandar la
// respuesta (waitUntil en app-route), asi que no sirve para "invalidar y
// volver a leer" dentro del mismo request. Por eso "Actualizar" lee con
// `fresco` y esto solo corre despues, para las cargas que vengan.
// { expire: 0 } y no "max": con "max" la carga siguiente todavia recibiria el
// dato viejo mientras se revalida.
export function vencerCache() {
  revalidateTag(TAG_CACHE, { expire: 0 });
}
