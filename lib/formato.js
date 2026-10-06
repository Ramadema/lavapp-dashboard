// Formatos de pantalla para las secciones de Gestion: fechas en la zona del
// negocio, minutos legibles, cantidades e importes en es-AR. Helpers puros sin
// estado: la capa de presentacion puede importarlos.
import { ZONA_HORARIA } from "@/lib/kpis/tiempo";

const DIA_Y_HORA = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: ZONA_HORARIA,
});

const FECHA_CORTA = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const MES_CORTO = new Intl.DateTimeFormat("es-AR", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

const ENTERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

// "6 oct 14:30" de un instante ISO.
export const diaYHora = (instante) => (instante ? DIA_Y_HORA.format(new Date(instante)) : "–");

// Los dias calendario ("2026-10-06") no son instantes: se formatean en UTC para
// que la zona del navegador no los corra un dia.
export const fechaCorta = (dia) => (dia ? FECHA_CORTA.format(new Date(`${dia}T00:00:00Z`)) : "–");

// "oct 26" de un mes calendario ("2026-10").
export const mesCorto = (mes) => MES_CORTO.format(new Date(`${mes}-01T00:00:00Z`));

export const cantidad = (n) => (n === null || n === undefined ? "–" : ENTERO.format(n));

// Menos de una hora se lee en minutos; de ahi en mas, horas y minutos.
export function minutos(n) {
  if (n === null || n === undefined) return "–";
  if (n < 60) return `${n} min`;
  const horas = Math.floor(n / 60);
  const resto = n % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

// Importe sin decimales en la moneda que diga la fuente ("$ 95.000").
export function dinero(valor, moneda) {
  if (valor === null || valor === undefined) return "–";
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: moneda,
      maximumFractionDigits: 0,
    }).format(valor);
  } catch {
    return `${ENTERO.format(valor)} ${moneda}`;
  }
}

export const recortar = (texto, largo) =>
  texto.length > largo ? texto.slice(0, largo - 1).trimEnd() + "…" : texto;
