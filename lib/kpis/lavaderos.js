// Lavaderos y sucursales: el padron de cuentas que usan LavApp, visto desde el
// backoffice. Recibe las filas crudas de GET /backoffice/lavaderos (lo que
// devuelve lib/gestion.js) y la hora por parametro. Puro: sin fetch, sin React,
// sin process.env; la pantalla lo importa para sus constantes.
import { MS_POR_DIA, contar, describirLectura, instante, mesLocal } from "./tiempo.js";

// @decision 2026-10-06 ramiro@mispichos.com
// Una cuenta esta activa si tocó alguna orden (alta o cambio de estado) en los
// ultimos 30 dias. Es la medida de "usa la app": un lavadero que no cargo nada
// en un mes dejo de usarla aunque siga dado de alta. Se descarto mirar
// `ultima_actividad` de la base porque hoy nadie la escribe.
export const DIAS_ACTIVA = 30;

// Los tres estados de una cuenta para el backoffice. "Suspendida" es `activo:
// false` en la app de gestion; las dadas de baja no vienen en la lista.
export const ESTADOS_CUENTA = {
  activa: "Activa",
  inactiva: "Sin actividad",
  suspendida: "Suspendida",
};

// Cuantos meses hacia atras se dibujan las altas.
export const MESES_DE_ALTAS = 12;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Los ultimos `cantidad` meses ("2026-10"), del mas viejo al actual.
export function ultimosMeses(ahora, cantidad = MESES_DE_ALTAS) {
  const [anio, mes] = mesLocal(ahora).split("-").map(Number);
  const meses = [];
  for (let i = cantidad - 1; i >= 0; i--) {
    const fecha = new Date(Date.UTC(anio, mes - 1 - i, 1));
    meses.push(`${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return meses;
}

function normalizar(filas, problemas, ahora) {
  const rechazar = (fila, campo, valor, motivo) => {
    problemas.push({ lavadero: fila?.id ?? null, campo, valor: valor ?? null, motivo });
    return null;
  };
  const limiteActiva = ahora.getTime() - DIAS_ACTIVA * MS_POR_DIA;
  return filas
    .map((fila) => {
      if (!Number.isInteger(fila?.id)) return rechazar(fila, "id", fila?.id, "no es un número");
      if (typeof fila.nombre !== "string" || fila.nombre === "") {
        return rechazar(fila, "nombre", fila.nombre, "sin nombre");
      }
      if (!FECHA.test(fila.altaEl ?? "")) return rechazar(fila, "altaEl", fila.altaEl, "no es una fecha");
      if (typeof fila.activo !== "boolean") return rechazar(fila, "activo", fila.activo, "no es sí o no");
      if (!Number.isInteger(fila.sucursales) || fila.sucursales < 0) {
        return rechazar(fila, "sucursales", fila.sucursales, "no es una cantidad");
      }
      let actividad = null;
      if (fila.ultimaActividad != null) {
        actividad = instante(fila.ultimaActividad);
        if (actividad === null) {
          return rechazar(fila, "ultimaActividad", fila.ultimaActividad, "no es una fecha");
        }
      }
      const estado = !fila.activo
        ? "suspendida"
        : actividad !== null && actividad >= limiteActiva
          ? "activa"
          : "inactiva";
      return {
        id: fila.id,
        nombre: fila.nombre,
        ciudad: fila.ciudad ?? null,
        plan: fila.plan ?? "Sin plan",
        sucursales: fila.sucursales,
        altaEl: fila.altaEl,
        ultimaActividad: actividad === null ? null : new Date(actividad).toISOString(),
        diasSinActividad:
          actividad === null ? null : Math.max(0, Math.floor((ahora.getTime() - actividad) / MS_POR_DIA)),
        estado,
      };
    })
    .filter(Boolean);
}

// El tablero de Lavaderos y sucursales. `lavaderos` son las filas crudas del
// backend; `leidoEl` es cuando se leyeron.
export function armarLavaderos(lavaderos, { ahora, leidoEl = [] }) {
  const problemas = [];
  const cuentas = normalizar(lavaderos, problemas, ahora);
  const mesActual = mesLocal(ahora);
  const contarEstado = (estado) => cuentas.filter((c) => c.estado === estado).length;

  const altasPorMes = ultimosMeses(ahora).map((mes) => ({
    mes,
    altas: cuentas.filter((c) => c.altaEl.startsWith(mes)).length,
  }));

  return {
    totales: {
      cuentas: cuentas.length,
      activas: contarEstado("activa"),
      inactivas: contarEstado("inactiva"),
      suspendidas: contarEstado("suspendida"),
      altasDelMes: cuentas.filter((c) => c.altaEl.startsWith(mesActual)).length,
      sucursales: cuentas.reduce((total, c) => total + c.sucursales, 0),
    },
    porPlan: contar(cuentas, (c) => c.plan),
    porCiudad: contar(cuentas, (c) => c.ciudad ?? "Sin ciudad"),
    altasPorMes,
    lavaderos: [...cuentas].sort(
      (a, b) =>
        (b.ultimaActividad ?? "").localeCompare(a.ultimaActividad ?? "") ||
        a.nombre.localeCompare(b.nombre)
    ),
    lectura: describirLectura(leidoEl, ahora),
    problemas,
  };
}
