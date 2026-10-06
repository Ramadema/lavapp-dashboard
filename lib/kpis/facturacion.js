// Facturacion y suscripciones: lo comercial del producto, visto desde el
// backoffice. Recibe las filas crudas de GET /backoffice/planes y
// GET /backoffice/suscripciones (lo que devuelve lib/gestion.js) y la hora por
// parametro. Puro: sin fetch, sin React, sin process.env.
//
// Hoy la app de gestion asigna el plan directo al lavadero y no crea
// suscripciones ni cobros, asi que la lista de suscripciones llega vacia. Por
// eso el tablero muestra dos cosas: lo que se cobraria segun los planes
// asignados (que si tiene datos) y las suscripciones registradas (que no, hasta
// que exista esa historia). Ninguna de las dos se inventa a partir de la otra.
import { describirLectura, diaLocal } from "./tiempo.js";

// Como paga cada plan (Periodicidad del backend) y cuantos meses cubre un pago.
export const MESES_POR_PERIODICIDAD = { MENSUAL: 1, ANUAL: 12 };

// Los estados de una suscripcion en la app de gestion (EstadoSuscripcion).
export const ESTADOS_SUSCRIPCION = {
  ACTIVA: "Activa",
  PAUSADA: "Pausada",
  CANCELADA: "Cancelada",
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esCantidad = (v) => Number.isInteger(v) && v >= 0;
const esImporte = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const redondear = (v) => Math.round(v * 100) / 100;

// @decision 2026-10-06 ramiro@mispichos.com
// El ingreso mensual recurrente se mide en importe mensual: un plan anual
// aporta su precio dividido 12. Se calcula dos veces y se muestran las dos:
// "por planes asignados" suma el precio del plan de cada cuenta activa (no
// suspendida), que es lo unico con datos hoy; "de suscripciones" suma el
// importe de las suscripciones ACTIVA, que es lo que va a valer cuando la app
// de gestion las genere. Se suman por moneda, nunca entre monedas.
const importeMensual = (importe, periodicidad) =>
  redondear(importe / MESES_POR_PERIODICIDAD[periodicidad]);

function sumarPorMoneda(filas) {
  const totales = new Map();
  for (const fila of filas) {
    totales.set(fila.moneda, redondear((totales.get(fila.moneda) ?? 0) + fila.mrr));
  }
  return [...totales.entries()]
    .map(([moneda, valor]) => ({ moneda, valor }))
    .sort((a, b) => b.valor - a.valor);
}

function normalizarPlanes(filas, problemas) {
  const rechazar = (fila, campo, valor, motivo) => {
    problemas.push({ plan: fila?.id ?? null, campo, valor: valor ?? null, motivo });
    return null;
  };
  return filas
    .map((fila) => {
      if (!Number.isInteger(fila?.id)) return rechazar(fila, "id", fila?.id, "no es un número");
      if (typeof fila.nombre !== "string" || fila.nombre === "") {
        return rechazar(fila, "nombre", fila.nombre, "sin nombre");
      }
      if (!esImporte(fila.precioBase)) return rechazar(fila, "precioBase", fila.precioBase, "no es un importe");
      if (!Object.hasOwn(MESES_POR_PERIODICIDAD, fila.periodicidad)) {
        return rechazar(fila, "periodicidad", fila.periodicidad, "periodicidad no reconocida");
      }
      for (const campo of ["cuentas", "cuentasActivas"]) {
        if (!esCantidad(fila[campo])) return rechazar(fila, campo, fila[campo], "no es una cantidad");
      }
      const precioMensual = importeMensual(fila.precioBase, fila.periodicidad);
      return {
        id: fila.id,
        nombre: fila.nombre,
        precioBase: fila.precioBase,
        moneda: fila.moneda ?? "ARS",
        periodicidad: fila.periodicidad,
        precioMensual,
        cuentas: fila.cuentas,
        cuentasActivas: fila.cuentasActivas,
        mrr: redondear(precioMensual * fila.cuentasActivas),
      };
    })
    .filter(Boolean);
}

// @decision 2026-10-06 ramiro@mispichos.com
// Una suscripcion esta vencida (con cobros impagos) si tiene algun cobro que la
// app de gestion ya marco VENCIDO o FALLIDO, o un cobro PENDIENTE cuya fecha de
// vencimiento ya paso: la app no reclasifica los pendientes sola, asi que si no
// se mira la fecha un cobro atrasado parece al dia.
function normalizarSuscripciones(filas, problemas, hoy) {
  const rechazar = (fila, campo, valor, motivo) => {
    problemas.push({ suscripcion: fila?.id ?? null, campo, valor: valor ?? null, motivo });
    return null;
  };
  return filas
    .map((fila) => {
      if (!Number.isInteger(fila?.id)) return rechazar(fila, "id", fila?.id, "no es un número");
      if (!Object.hasOwn(ESTADOS_SUSCRIPCION, fila.estado)) {
        return rechazar(fila, "estado", fila.estado, "estado no reconocido");
      }
      if (!esImporte(fila.importe)) return rechazar(fila, "importe", fila.importe, "no es un importe");
      if (!Object.hasOwn(MESES_POR_PERIODICIDAD, fila.periodicidad)) {
        return rechazar(fila, "periodicidad", fila.periodicidad, "periodicidad no reconocida");
      }
      for (const campo of ["cobrosPendientes", "cobrosVencidos"]) {
        if (!esCantidad(fila[campo])) return rechazar(fila, campo, fila[campo], "no es una cantidad");
      }
      for (const campo of ["proximoCobro", "vencimientoPendienteMasAntiguo", "ultimoPago"]) {
        if (fila[campo] != null && !FECHA.test(fila[campo])) {
          return rechazar(fila, campo, fila[campo], "no es una fecha");
        }
      }
      const mensual = importeMensual(fila.importe, fila.periodicidad);
      const pendienteAtrasado =
        fila.vencimientoPendienteMasAntiguo != null && fila.vencimientoPendienteMasAntiguo < hoy;
      return {
        id: fila.id,
        lavadero: fila.lavadero ?? "Sin lavadero",
        plan: fila.plan ?? "Sin plan",
        periodicidad: fila.periodicidad,
        importe: fila.importe,
        importeMensual: mensual,
        moneda: fila.moneda ?? "ARS",
        estado: fila.estado,
        proximoCobro: fila.proximoCobro ?? null,
        cobrosPendientes: fila.cobrosPendientes,
        cobrosVencidos: fila.cobrosVencidos,
        vencimientoPendienteMasAntiguo: fila.vencimientoPendienteMasAntiguo ?? null,
        ultimoPago: fila.ultimoPago ?? null,
        impaga: fila.cobrosVencidos > 0 || pendienteAtrasado,
        mrr: fila.estado === "ACTIVA" ? mensual : 0,
      };
    })
    .filter(Boolean);
}

// El tablero de Facturacion y suscripciones. `planes` y `suscripciones` son las
// filas crudas del backend; `leidoEl` es cuando se leyo cada una.
export function armarFacturacion({ planes, suscripciones }, { ahora, leidoEl = [] }) {
  const problemas = [];
  const hoy = diaLocal(ahora);
  const catalogo = normalizarPlanes(planes, problemas);
  const filas = normalizarSuscripciones(suscripciones, problemas, hoy);
  const contarEstado = (estado) => filas.filter((f) => f.estado === estado).length;

  return {
    totales: {
      cuentasConPlan: catalogo.reduce((total, p) => total + p.cuentas, 0),
      cuentasActivas: catalogo.reduce((total, p) => total + p.cuentasActivas, 0),
      mrrPorPlanes: sumarPorMoneda(catalogo),
      suscripciones: filas.length,
      activas: contarEstado("ACTIVA"),
      pausadas: contarEstado("PAUSADA"),
      canceladas: contarEstado("CANCELADA"),
      vencidas: filas.filter((f) => f.impaga).length,
      mrr: sumarPorMoneda(filas),
    },
    planes: catalogo,
    porEstado: Object.keys(ESTADOS_SUSCRIPCION).map((estado) => ({
      estado,
      suscripciones: contarEstado(estado),
    })),
    suscripciones: [...filas].sort(
      (a, b) => Number(b.impaga) - Number(a.impaga) || a.lavadero.localeCompare(b.lavadero)
    ),
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}
