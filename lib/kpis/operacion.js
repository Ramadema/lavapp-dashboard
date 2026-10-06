// Operacion, vista desde el backoffice: cuantos vehiculos esperan ahora, cuantos
// entraron en el periodo y cuanto tarda cada etapa. Recibe las filas crudas de
// GET /backoffice/ordenes (lo que devuelve lib/gestion.js) y la hora por
// parametro, asi los tests fijan el "ahora". Puro: sin fetch, sin React, sin
// process.env; tambien lo importa la pantalla para sus constantes.
//
// Una orden trae cuatro marcas de tiempo que no se pueden sumar a ciegas:
// `llegada` es cuando se creo (el created_at de la app de gestion), `ingreso`
// se pisa cuando empieza el lavado, `finLavado` cuando termina y `salida`
// cuando el vehiculo se retira. De ahi salen la espera, el lavado y la demora.
import {
  MS_POR_DIA,
  describirLectura,
  diaLocal,
  instante,
  mediana,
  minutosEntre,
  promedio,
} from "./tiempo.js";

// Los estados de una orden en la app de gestion (EstadoOrden del backend) y
// como se leen aca. Contrato con el afuera: un estado que no este en esta lista
// se rechaza y se reporta, no se adivina.
export const ESTADOS = {
  EN_ESPERA: "En espera",
  EN_PROGRESO: "En lavado",
  LISTO: "Listo para retirar",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

// Los que todavia ocupan un lugar en el lavadero. El backend los manda aunque
// hayan llegado antes del periodo, para que la cola de ahora este completa.
export const ESTADOS_ABIERTOS = ["EN_ESPERA", "EN_PROGRESO", "LISTO"];

// Los recortes que ofrece la pantalla, en dias hacia atras desde ahora.
export const PERIODOS = [7, 30, 90];
export const PERIODO_POR_DEFECTO = 30;

const MS_POR_MINUTO = 60_000;

// Los instantes ISO del periodo: `dias` hacia atras, hasta ahora. El fin se
// redondea al minuto para que la URL que se le pide al backend sea la misma
// durante un minuto y el cache de lib/gestion.js tenga algo que guardar.
export function periodo(dias, ahora) {
  const hasta = Math.floor(ahora.getTime() / MS_POR_MINUTO) * MS_POR_MINUTO;
  return {
    desde: new Date(hasta - dias * MS_POR_DIA).toISOString(),
    hasta: new Date(hasta).toISOString(),
  };
}

const CAMPOS_OPCIONALES = ["ingreso", "finLavado", "salida"];

// Traduce las filas del backend a instantes en ms y descarta las que no se
// entienden, dejando constancia en `problemas`.
function normalizar(filas, problemas) {
  const rechazar = (fila, campo, valor, motivo) => {
    problemas.push({ orden: fila?.id ?? null, campo, valor: valor ?? null, motivo });
    return null;
  };
  return filas
    .map((fila) => {
      if (!Number.isInteger(fila?.id)) return rechazar(fila, "id", fila?.id, "no es un número");
      if (!Object.hasOwn(ESTADOS, fila.estado)) {
        return rechazar(fila, "estado", fila.estado, "estado no reconocido");
      }
      const llegada = instante(fila.llegada);
      if (llegada === null) return rechazar(fila, "llegada", fila.llegada, "no es una fecha");

      const opcionales = {};
      for (const campo of CAMPOS_OPCIONALES) {
        if (fila[campo] == null) {
          opcionales[campo] = null;
          continue;
        }
        const valor = instante(fila[campo]);
        if (valor === null) return rechazar(fila, campo, fila[campo], "no es una fecha");
        opcionales[campo] = valor;
      }

      return {
        id: fila.id,
        lavadero: fila.lavadero ?? "Sin lavadero",
        patente: fila.patente ?? "",
        servicio: fila.servicio ?? "Sin servicio",
        estado: fila.estado,
        llegada,
        ...opcionales,
      };
    })
    .filter(Boolean);
}

// @decision 2026-10-06 ramiro@mispichos.com
// La espera va de la llegada al inicio del lavado y solo se mide en las ordenes
// que ya empezaron: un vehiculo en espera todavia no tiene una espera que medir.
// El lavado va del inicio al fin del lavado. La demora total va de la llegada a
// la entrega, no desde `ingreso`: la app de gestion pisa `ingreso` al iniciar el
// lavado y medir desde ahi dejaria afuera el tiempo en cola, que es justamente
// lo que el lavadero quiere ver. Las canceladas no se miden.
function medir(fila) {
  const cancelada = fila.estado === "CANCELADO";
  const empezo = !cancelada && fila.estado !== "EN_ESPERA" && fila.ingreso !== null;
  const minutos = (desde, hasta) => Math.max(0, minutosEntre(desde, hasta));
  return {
    esperaMin: empezo ? minutos(fila.llegada, fila.ingreso) : null,
    lavadoMin:
      !cancelada && fila.ingreso !== null && fila.finLavado !== null
        ? minutos(fila.ingreso, fila.finLavado)
        : null,
    demoraMin: !cancelada && fila.salida !== null ? minutos(fila.llegada, fila.salida) : null,
  };
}

// Los dias calendario que cubre el periodo, del primero al ultimo, para que la
// serie diaria no tenga huecos en los dias sin movimiento.
function diasDelPeriodo(desdeMs, hastaMs) {
  const dias = [];
  const ultimo = diaLocal(hastaMs);
  for (let t = desdeMs; t <= hastaMs + MS_POR_DIA; t += MS_POR_DIA) {
    const dia = diaLocal(t);
    if (dias.at(-1) !== dia) dias.push(dia);
    if (dia === ultimo) break;
  }
  return dias;
}

const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());
const valores = (filas, campo) => filas.map((f) => f[campo]).filter((v) => v !== null);
const agrupar = (filas, clave) => {
  const grupos = new Map();
  for (const fila of filas) {
    const k = clave(fila);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(fila);
  }
  return grupos;
};

// El tablero de Operacion. `ordenes` son las filas crudas del backend: las que
// llegaron en el periodo mas las abiertas ahora. `leidoEl` es cuando se leyo.
export function armarOperacion(ordenes, { ahora, dias = PERIODO_POR_DEFECTO, leidoEl = [] }) {
  const problemas = [];
  const filas = normalizar(ordenes, problemas).map((fila) => ({ ...fila, ...medir(fila) }));
  const { desde, hasta } = periodo(dias, ahora);
  const desdeMs = Date.parse(desde);
  const hastaMs = Date.parse(hasta);

  const delPeriodo = filas.filter((f) => f.llegada >= desdeMs && f.llegada < hastaMs);
  const medidas = delPeriodo.filter((f) => f.estado !== "CANCELADO");
  const demoras = valores(medidas, "demoraMin");
  const esperas = valores(medidas, "esperaMin");
  const lavados = valores(medidas, "lavadoMin");
  const contarEstado = (lista, estado) => lista.filter((f) => f.estado === estado).length;

  const porDia = diasDelPeriodo(desdeMs, hastaMs).map((dia) => ({
    dia,
    llegaron: delPeriodo.filter((f) => diaLocal(f.llegada) === dia).length,
    entregadas: delPeriodo.filter((f) => f.salida !== null && diaLocal(f.salida) === dia).length,
  }));

  const porLavadero = [...agrupar(delPeriodo, (f) => f.lavadero).entries()]
    .map(([lavadero, lista]) => ({
      lavadero,
      ordenes: lista.length,
      entregadas: contarEstado(lista, "ENTREGADO"),
      enCola: filas.filter((f) => f.lavadero === lavadero && f.estado === "EN_ESPERA").length,
      demoraPromedioMin: promedio(valores(lista, "demoraMin")),
    }))
    .sort((a, b) => b.ordenes - a.ordenes || a.lavadero.localeCompare(b.lavadero));

  const porServicio = [...agrupar(delPeriodo, (f) => f.servicio).entries()]
    .map(([servicio, lista]) => ({ servicio, ordenes: lista.length }))
    .sort((a, b) => b.ordenes - a.ordenes || a.servicio.localeCompare(b.servicio));

  const porEstado = Object.keys(ESTADOS).map((estado) => ({
    estado,
    ordenes: contarEstado(delPeriodo, estado),
  }));

  return {
    periodo: { dias, desde, hasta },
    totales: {
      ordenes: delPeriodo.length,
      entregadas: contarEstado(delPeriodo, "ENTREGADO"),
      canceladas: contarEstado(delPeriodo, "CANCELADO"),
      enCola: contarEstado(filas, "EN_ESPERA"),
      enLavado: contarEstado(filas, "EN_PROGRESO"),
      listos: contarEstado(filas, "LISTO"),
    },
    demoraPromedioMin: promedio(demoras),
    demoraMedianaMin: demoras.length > 0 ? mediana(demoras) : null,
    esperaPromedioMin: promedio(esperas),
    lavadoPromedioMin: promedio(lavados),
    medidas: { demoras: demoras.length, esperas: esperas.length, lavados: lavados.length },
    porDia,
    porLavadero,
    porServicio,
    porEstado,
    ordenes: filas
      .map((f) => ({
        ...f,
        llegada: iso(f.llegada),
        ingreso: iso(f.ingreso),
        finLavado: iso(f.finLavado),
        salida: iso(f.salida),
        delPeriodo: f.llegada >= desdeMs && f.llegada < hastaMs,
      }))
      .sort((a, b) => b.llegada.localeCompare(a.llegada) || b.id - a.id),
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}
