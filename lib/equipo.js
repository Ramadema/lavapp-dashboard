// Configuracion del equipo para los KPIs de roles, carga y OKRs de Performance:
// lo que Shortcut no sabe (rol, horas pactadas, horas por punto, metas) vive en
// data/equipo.json y lo mantiene el equipo a mano.
//
// Devuelve { datos, fuente, motivo, problemas } como los demas loaders. Un
// archivo roto no tira la pantalla: se devuelve la configuracion vacia con el
// motivo, y los paneles dicen que falta configurar. Se lee en cada pedido
// porque es un archivo chico y asi un cambio se ve sin reiniciar.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { EQUIPO_VACIO, ROLES } from "./kpis/equipo.js";

const RUTA = path.join(process.cwd(), "data", "equipo.json");

export { EQUIPO_VACIO, ROLES };

const numeroPositivo = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
const numeroONull = (v) => (v == null ? null : numeroPositivo(v) ? v : undefined);

// Valida y normaliza lo leido. Lo que no se entiende se rechaza y se anota en
// `problemas`, con el integrante y el campo, para que se vea en la pantalla.
export function normalizarEquipo(crudo) {
  const problemas = [];
  const reportar = (campo, valor, motivo) => problemas.push({ tarea: null, campo, valor, motivo });
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) {
    reportar("equipo.json", null, "el archivo no tiene un objeto en la raíz");
    return { datos: { ...EQUIPO_VACIO }, problemas };
  }

  const horasPorPunto = numeroONull(crudo.horasPorPunto);
  if (horasPorPunto === undefined) {
    reportar("horasPorPunto", crudo.horasPorPunto, "tiene que ser un número mayor que 0");
  }
  const wipMaxPorPersona = numeroONull(crudo.wipMaxPorPersona);
  if (wipMaxPorPersona === undefined) {
    reportar("wipMaxPorPersona", crudo.wipMaxPorPersona, "tiene que ser un número mayor que 0");
  }

  const metasCrudas = crudo.metas && typeof crudo.metas === "object" ? crudo.metas : {};
  const metas = {};
  for (const clave of Object.keys(EQUIPO_VACIO.metas)) {
    const valor = numeroONull(metasCrudas[clave]);
    if (valor === undefined) reportar(`metas.${clave}`, metasCrudas[clave], "tiene que ser un número mayor que 0");
    metas[clave] = valor ?? null;
  }

  const integrantes = [];
  const vistos = new Set();
  for (const [i, integrante] of (Array.isArray(crudo.integrantes) ? crudo.integrantes : []).entries()) {
    const nombre = typeof integrante?.nombre === "string" ? integrante.nombre.trim() : "";
    if (!nombre) {
      reportar(`integrantes[${i}].nombre`, integrante?.nombre ?? null, "falta el nombre");
      continue;
    }
    if (vistos.has(nombre)) {
      reportar(`integrantes[${i}].nombre`, nombre, "está repetido: se toma el primero");
      continue;
    }
    vistos.add(nombre);
    let rol = integrante.rol ?? null;
    if (rol !== null && !ROLES.includes(rol)) {
      reportar(`integrantes[${i}].rol`, rol, `rol desconocido, se admite ${ROLES.join(", ")}: se toma como sin rol`);
      rol = null;
    }
    let horasSemanales = numeroONull(integrante.horasSemanales);
    if (horasSemanales === undefined) {
      reportar(`integrantes[${i}].horasSemanales`, integrante.horasSemanales, "tiene que ser un número mayor que 0: se toma como sin horas");
      horasSemanales = null;
    }
    integrantes.push({ nombre, rol, horasSemanales });
  }
  if (!Array.isArray(crudo.integrantes)) reportar("integrantes", crudo.integrantes ?? null, "falta la lista de integrantes");

  return {
    datos: {
      horasPorPunto: horasPorPunto ?? null,
      wipMaxPorPersona: wipMaxPorPersona ?? EQUIPO_VACIO.wipMaxPorPersona,
      metas,
      integrantes,
    },
    problemas,
  };
}

export async function cargarEquipo() {
  let texto;
  try {
    texto = await readFile(RUTA, "utf8");
  } catch (e) {
    return {
      datos: { ...EQUIPO_VACIO },
      fuente: "sin-configurar",
      motivo: `No se pudo leer data/equipo.json: ${e.message}`,
      problemas: [{ tarea: null, campo: "equipo.json", valor: null, motivo: e.message }],
    };
  }
  let crudo;
  try {
    crudo = JSON.parse(texto);
  } catch (e) {
    return {
      datos: { ...EQUIPO_VACIO },
      fuente: "error",
      motivo: `data/equipo.json no es un JSON válido: ${e.message}`,
      problemas: [{ tarea: null, campo: "equipo.json", valor: null, motivo: e.message }],
    };
  }
  const { datos, problemas } = normalizarEquipo(crudo);
  return { datos, fuente: "backoffice", motivo: null, problemas };
}
