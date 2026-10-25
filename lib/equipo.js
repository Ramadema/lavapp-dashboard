// Configuracion del equipo para los KPIs de roles, carga y OKRs de Performance,
// y lo que el cliente pide del MVP para «Avance e inversion»: lo que Shortcut no
// sabe (rol, horas pactadas, horas por punto, metas, horas minimas, costo por
// hora) vive en data/equipo.json y lo mantiene el equipo a mano.
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

  // Horas pactadas por persona para todo el proyecto, y hasta cuando va el
  // proyecto (para prorratearlas por sprint). Sin fin, el proyecto termina con
  // el ultimo sprint cargado.
  const pactadasCrudas = objetoONada(crudo.horasPactadas, "horasPactadas", reportar);
  const porIntegrante = numeroONull(pactadasCrudas.porIntegrante);
  if (porIntegrante === undefined) {
    reportar("horasPactadas.porIntegrante", pactadasCrudas.porIntegrante, "tiene que ser un número mayor que 0");
  }
  let finDelProyecto = pactadasCrudas.finDelProyecto ?? null;
  if (finDelProyecto !== null && !esDia(finDelProyecto)) {
    reportar("horasPactadas.finDelProyecto", finDelProyecto, "tiene que ser una fecha AAAA-MM-DD: se toma el fin del último sprint");
    finDelProyecto = null;
  }

  const metasCrudas = objetoONada(crudo.metas, "metas", reportar);
  const metas = {};
  for (const clave of Object.keys(EQUIPO_VACIO.metas)) {
    const valor = numeroONull(metasCrudas[clave]);
    if (valor === undefined) reportar(`metas.${clave}`, metasCrudas[clave], "tiene que ser un número mayor que 0");
    metas[clave] = valor ?? null;
  }

  // Lo que el cliente pide del MVP: los numeros, mayores que 0 o null; la
  // moneda, un texto corto (ARS, USD). Una moneda sin costo no molesta; un costo
  // sin moneda no se puede mostrar y se anota.
  const clienteCrudo = objetoONada(crudo.cliente, "cliente", reportar);
  const cliente = { ...EQUIPO_VACIO.cliente };
  for (const clave of ["horasMinimas", "avanceContraElPlanMin", "costoPorHora"]) {
    const valor = numeroONull(clienteCrudo[clave]);
    if (valor === undefined) reportar(`cliente.${clave}`, clienteCrudo[clave], "tiene que ser un número mayor que 0");
    cliente[clave] = valor ?? null;
  }
  const moneda = typeof clienteCrudo.moneda === "string" ? clienteCrudo.moneda.trim() : "";
  if (clienteCrudo.moneda != null && !moneda) {
    reportar("cliente.moneda", clienteCrudo.moneda, "tiene que ser un texto, como ARS o USD");
  }
  cliente.moneda = moneda || null;
  if (cliente.costoPorHora !== null && cliente.moneda === null) {
    reportar("cliente.moneda", null, "falta la moneda del costo por hora: se muestran solo horas");
    cliente.costoPorHora = null;
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
    // Lo que la persona hace ademas de su rol principal (BA, Scrum Master, la
    // especialidad): se muestra, no agrupa.
    const detalle = typeof integrante.detalle === "string" && integrante.detalle.trim() ? integrante.detalle.trim() : null;
    let horasPactadas = numeroONull(integrante.horasPactadas);
    if (horasPactadas === undefined) {
      reportar(`integrantes[${i}].horasPactadas`, integrante.horasPactadas, "tiene que ser un número mayor que 0: se toma la cifra por defecto");
      horasPactadas = null;
    }
    integrantes.push({ nombre, rol, detalle, horasPactadas });
  }
  if (!Array.isArray(crudo.integrantes)) reportar("integrantes", crudo.integrantes ?? null, "falta la lista de integrantes");

  return {
    datos: {
      horasPorPunto: horasPorPunto ?? null,
      wipMaxPorPersona: wipMaxPorPersona ?? EQUIPO_VACIO.wipMaxPorPersona,
      horasPactadas: { porIntegrante: porIntegrante ?? null, finDelProyecto },
      metas,
      cliente,
      integrantes,
    },
    problemas,
  };
}

// Un dia de calendario real: "2026-11-31" tiene la forma pero no existe (Date
// lo pasaria al 1/12), asi que se pide que vuelva igual.
function esDia(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const instante = Date.parse(`${valor}T00:00:00Z`);
  return !Number.isNaN(instante) && new Date(instante).toISOString().slice(0, 10) === valor;
}

// Un bloque de la configuracion que tiene que ser un objeto: si falta, se toma
// vacio; si esta pero es otra cosa (un numero, una lista), se anota.
function objetoONada(valor, campo, reportar) {
  if (valor == null) return {};
  if (typeof valor === "object" && !Array.isArray(valor)) return valor;
  reportar(campo, valor, "tiene que ser un objeto: se toman los valores por defecto");
  return {};
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
