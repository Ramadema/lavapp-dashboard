// Tests de las secciones de Gestion: lib/kpis/tiempo.js, operacion.js,
// lavaderos.js, clientes.js y facturacion.js. Sin framework: node los corre
// directo.
//
//   npm test
//
// Las filas tienen la forma exacta de GET /backoffice/* de la app de gestion y
// el "ahora" es fijo: nada depende del reloj de la maquina. lib/gestion.js (el
// que lee la API) no se testea aca: es la union con fetch y process.env, y se
// verifica con curl segun el README.

import {
  contar,
  describirLectura,
  diaLocal,
  instante,
  mediana,
  mesLocal,
  promedio,
} from "../lib/kpis/tiempo.js";
import { armarOperacion, periodo } from "../lib/kpis/operacion.js";
import { armarLavaderos, ultimosMeses } from "../lib/kpis/lavaderos.js";
import { armarClientes, desdeRecurrencia } from "../lib/kpis/clientes.js";
import { armarFacturacion } from "../lib/kpis/facturacion.js";

let ok = 0;
let fail = 0;
const check = (nombre, real, esperado) => {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    ok++;
  } else {
    fail++;
    console.error(`✗ ${nombre}\n   esperado: ${b}\n   real:     ${a}`);
  }
};

// 12:00:30 del 6 de octubre en Buenos Aires.
const AHORA = new Date("2026-10-06T15:00:30Z");

// --- tiempo ---------------------------------------------------------------

check("diaLocal corta el día en Buenos Aires", diaLocal("2026-10-07T01:30:00Z"), "2026-10-06");
check("mesLocal corta el mes en Buenos Aires", mesLocal("2026-11-01T01:00:00Z"), "2026-10");
check("instante: una fecha que no se entiende es null", instante("ayer"), null);
check("instante: ISO válido", instante("2026-10-06T15:00:00Z"), 1791298800000);
check("promedio vacío es null, no 0", promedio([]), null);
check("promedio con un decimal", promedio([1, 2], 1), 1.5);
check("promedio entero redondea", promedio([10, 30, 5]), 15);
check("mediana de lista par", mediana([1, 3, 2, 10]), 2.5);
check(
  "contar ordena de mayor a menor y por nombre",
  contar([{ p: "b" }, { p: "a" }, { p: "a" }], (f) => f.p),
  [
    { nombre: "a", valor: 2 },
    { nombre: "b", valor: 1 },
  ]
);
check(
  "lectura: más vieja que 30 minutos es desactualizada",
  describirLectura(["2026-10-06T14:00:00Z", "2026-10-06T14:59:00Z"], AHORA),
  { leidoEl: "2026-10-06T14:00:00.000Z", desactualizado: true }
);
check("lectura: sin instantes", describirLectura([null], AHORA), {
  leidoEl: null,
  desactualizado: false,
});

// --- operacion ------------------------------------------------------------

check("periodo: 7 días hacia atrás, redondeado al minuto", periodo(7, AHORA), {
  desde: "2026-09-29T15:00:00.000Z",
  hasta: "2026-10-06T15:00:00.000Z",
});

const orden = (extra) => ({
  id: 1,
  lavaderoId: 2,
  lavadero: "Norte",
  patente: "AB123CD",
  servicio: "Lavado completo",
  estado: "ENTREGADO",
  llegada: "2026-10-06T12:00:00Z",
  ingreso: "2026-10-06T12:10:00Z",
  finLavado: "2026-10-06T12:40:00Z",
  salida: "2026-10-06T13:00:00Z",
  ...extra,
});
const ordenes = [
  // Entregada hoy: espera 10, lavado 30, demora 60.
  orden({ id: 1 }),
  // Entregada ayer en otro lavadero: espera 30, lavado 30, demora 80.
  orden({
    id: 2,
    lavadero: "Sur",
    servicio: "Encerado",
    llegada: "2026-10-05T10:00:00Z",
    ingreso: "2026-10-05T10:30:00Z",
    finLavado: "2026-10-05T11:00:00Z",
    salida: "2026-10-05T11:20:00Z",
  }),
  // En espera desde septiembre: abierta, fuera del período, sin espera medible.
  orden({
    id: 3,
    estado: "EN_ESPERA",
    llegada: "2026-09-01T10:00:00Z",
    ingreso: "2026-09-01T10:00:00Z",
    finLavado: null,
    salida: null,
  }),
  // En lavado ahora: espera 5.
  orden({
    id: 4,
    estado: "EN_PROGRESO",
    llegada: "2026-10-06T14:00:00Z",
    ingreso: "2026-10-06T14:05:00Z",
    finLavado: null,
    salida: null,
  }),
  // Cancelada: cuenta como orden del período, no se mide.
  orden({
    id: 5,
    estado: "CANCELADO",
    llegada: "2026-10-04T09:00:00Z",
    ingreso: "2026-10-04T09:00:00Z",
    finLavado: null,
    salida: null,
  }),
  // Rechazadas: estado desconocido y llegada ilegible.
  orden({ id: 6, estado: "INVENTADO" }),
  orden({ id: 7, llegada: "ayer" }),
];
const op = armarOperacion(ordenes, { ahora: AHORA, dias: 7, leidoEl: ["2026-10-06T14:59:00Z"] });

check("operacion: totales del período y de ahora", op.totales, {
  ordenes: 4,
  entregadas: 2,
  canceladas: 1,
  enCola: 1,
  enLavado: 1,
  listos: 0,
});
check("operacion: demora promedio de llegada a entrega", op.demoraPromedioMin, 70);
check("operacion: demora mediana", op.demoraMedianaMin, 70);
check("operacion: espera promedio de las que empezaron", op.esperaPromedioMin, 15);
check("operacion: lavado promedio", op.lavadoPromedioMin, 30);
check("operacion: cuántas órdenes entraron en cada medida", op.medidas, {
  demoras: 2,
  esperas: 3,
  lavados: 2,
});
check(
  "operacion: las filas que no se entienden se reportan",
  op.problemas.map((p) => [p.orden, p.campo]),
  [
    [6, "estado"],
    [7, "llegada"],
  ]
);
check("operacion: un día por cada día del período", op.porDia.length, 8);
check("operacion: el último día", op.porDia.at(-1), {
  dia: "2026-10-06",
  llegaron: 2,
  entregadas: 1,
});
check("operacion: por lavadero", op.porLavadero, [
  { lavadero: "Norte", ordenes: 3, entregadas: 1, enCola: 1, demoraPromedioMin: 60 },
  { lavadero: "Sur", ordenes: 1, entregadas: 1, enCola: 0, demoraPromedioMin: 80 },
]);
check("operacion: por servicio", op.porServicio, [
  { servicio: "Lavado completo", ordenes: 3 },
  { servicio: "Encerado", ordenes: 1 },
]);
check("operacion: por estado, los cinco siempre", op.porEstado, [
  { estado: "EN_ESPERA", ordenes: 0 },
  { estado: "EN_PROGRESO", ordenes: 1 },
  { estado: "LISTO", ordenes: 0 },
  { estado: "ENTREGADO", ordenes: 2 },
  { estado: "CANCELADO", ordenes: 1 },
]);
check(
  "operacion: la más reciente primero",
  op.ordenes.map((o) => o.id),
  [4, 1, 2, 5, 3]
);
check("operacion: la abierta vieja se marca fuera del período", op.ordenes.at(-1).delPeriodo, false);
const entregada = op.ordenes.find((o) => o.id === 1);
check(
  "operacion: minutos de una orden",
  [entregada.esperaMin, entregada.lavadoMin, entregada.demoraMin],
  [10, 30, 60]
);
check("operacion: en espera no tiene espera", op.ordenes.find((o) => o.id === 3).esperaMin, null);
check("operacion: lectura", op.lectura, {
  leidoEl: "2026-10-06T14:59:00.000Z",
  desactualizado: false,
});

// --- lavaderos ------------------------------------------------------------

const lavadero = (extra) => ({
  id: 1,
  nombre: "Norte",
  ciudad: "Córdoba",
  plan: "Básico",
  sucursales: 1,
  altaEl: "2026-10-02",
  ultimaActividad: "2026-10-05T12:00:00Z",
  activo: true,
  ...extra,
});
const lavaderos = [
  // Activa, dada de alta este mes.
  lavadero({ id: 1 }),
  // Sin actividad hace 47 días, sin ciudad.
  lavadero({
    id: 2,
    nombre: "Sur",
    ciudad: null,
    plan: "Pro",
    sucursales: 0,
    altaEl: "2026-08-15",
    ultimaActividad: "2026-08-20T12:00:00Z",
  }),
  // Suspendida y sin órdenes nunca.
  lavadero({ id: 3, nombre: "Este", activo: false, altaEl: "2025-12-01", ultimaActividad: null }),
  // Rechazadas: sin nombre y con sucursales negativas.
  lavadero({ id: 4, nombre: "" }),
  lavadero({ id: 5, nombre: "Oeste", sucursales: -1 }),
];
const lv = armarLavaderos(lavaderos, { ahora: AHORA });

check("lavaderos: totales", lv.totales, {
  cuentas: 3,
  activas: 1,
  inactivas: 1,
  suspendidas: 1,
  altasDelMes: 1,
  sucursales: 2,
});
check(
  "lavaderos: estado y días sin actividad, la más reciente primero",
  lv.lavaderos.map((l) => [l.id, l.estado, l.diasSinActividad]),
  [
    [1, "activa", 1],
    [2, "inactiva", 47],
    [3, "suspendida", null],
  ]
);
check("lavaderos: por plan", lv.porPlan, [
  { nombre: "Básico", valor: 2 },
  { nombre: "Pro", valor: 1 },
]);
check("lavaderos: por ciudad", lv.porCiudad, [
  { nombre: "Córdoba", valor: 2 },
  { nombre: "Sin ciudad", valor: 1 },
]);
check("lavaderos: los últimos 12 meses", ultimosMeses(AHORA), [
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
]);
check(
  "lavaderos: altas por mes",
  lv.altasPorMes.filter((m) => m.altas > 0),
  [
    { mes: "2025-12", altas: 1 },
    { mes: "2026-08", altas: 1 },
    { mes: "2026-10", altas: 1 },
  ]
);
check(
  "lavaderos: problemas",
  lv.problemas.map((p) => [p.lavadero, p.campo]),
  [
    [4, "nombre"],
    [5, "sucursales"],
  ]
);

// --- clientes -------------------------------------------------------------

check("clientes: la fecha de corte son 90 días atrás", desdeRecurrencia(AHORA), "2026-07-08T15:00:00.000Z");

const cliente = (extra) => ({
  id: 1,
  lavaderoId: 2,
  lavadero: "Norte",
  nombre: "Ana",
  altaEl: "2026-10-01",
  vehiculos: 2,
  lavados: 5,
  ultimoLavado: "2026-10-04T12:00:00Z",
  lavadosRecientes: 3,
  ...extra,
});
const clientes = [
  // Recurrente y nueva del mes.
  cliente({ id: 1 }),
  // Un solo lavado: ocasional.
  cliente({ id: 2, nombre: "Beto", lavados: 1, lavadosRecientes: 1, altaEl: "2026-09-01", vehiculos: 1 }),
  // Cargada sin lavados, en otro lavadero.
  cliente({
    id: 3,
    nombre: "Carla",
    lavadero: "Sur",
    lavados: 0,
    lavadosRecientes: 0,
    ultimoLavado: null,
    altaEl: "2026-09-10",
    vehiculos: 0,
  }),
  // Justo en el umbral: recurrente.
  cliente({ id: 4, nombre: "Dani", lavados: 2, lavadosRecientes: 2, altaEl: "2026-08-01", vehiculos: 1 }),
  // Rechazada: lavados que no son una cantidad.
  cliente({ id: 5, nombre: "Eva", lavados: "muchos" }),
];
const cl = armarClientes(clientes, { ahora: AHORA });

check("clientes: totales", cl.totales, {
  clientes: 4,
  recurrentes: 2,
  conLavados: 3,
  sinLavados: 1,
  nuevosDelMes: 1,
  vehiculos: 4,
  lavados: 8,
  lavadosPorCliente: 2,
});
check("clientes: por lavadero", cl.porLavadero, [
  { lavadero: "Norte", clientes: 3, recurrentes: 2, ocasionales: 1, sinLavados: 0, vehiculos: 4, lavados: 8 },
  { lavadero: "Sur", clientes: 1, recurrentes: 0, ocasionales: 0, sinLavados: 1, vehiculos: 0, lavados: 0 },
]);
check("clientes: distribución por lavados", cl.distribucionLavados, [
  { nombre: "Sin lavados", valor: 1 },
  { nombre: "1 lavado", valor: 1 },
  { nombre: "2 a 4 lavados", valor: 1 },
  { nombre: "5 o más", valor: 1 },
]);
check(
  "clientes: de más a menos lavados",
  cl.clientes.map((c) => c.id),
  [1, 4, 2, 3]
);
check("clientes: días desde el último lavado", cl.clientes[0].diasDesdeUltimoLavado, 2);
check(
  "clientes: problemas",
  cl.problemas.map((p) => [p.cliente, p.campo]),
  [[5, "lavados"]]
);

// --- facturacion ----------------------------------------------------------

const planes = [
  { id: 1, nombre: "Básico", precioBase: 95000, moneda: "ARS", periodicidad: "MENSUAL", cuentas: 3, cuentasActivas: 2 },
  { id: 2, nombre: "Pro", precioBase: 1200000, moneda: "ARS", periodicidad: "ANUAL", cuentas: 1, cuentasActivas: 1 },
  // Rechazado: periodicidad desconocida.
  { id: 3, nombre: "Raro", precioBase: 10, moneda: "ARS", periodicidad: "SEMANAL", cuentas: 0, cuentasActivas: 0 },
];
const suscripcion = (extra) => ({
  id: 1,
  lavaderoId: 2,
  lavadero: "Norte",
  plan: "Básico",
  periodicidad: "MENSUAL",
  importe: 95000,
  moneda: "ARS",
  estado: "ACTIVA",
  proximoCobro: "2026-11-01",
  cobrosPendientes: 1,
  cobrosVencidos: 0,
  vencimientoPendienteMasAntiguo: "2026-11-01",
  ultimoPago: "2026-10-01",
  ...extra,
});
const suscripciones = [
  // Al día.
  suscripcion({ id: 1 }),
  // Impaga: un cobro ya marcado vencido.
  suscripcion({ id: 2, lavadero: "Sur", cobrosVencidos: 1 }),
  // Impaga: un pendiente cuya fecha ya pasó (hoy es 6 de octubre).
  suscripcion({ id: 3, lavadero: "Este", vencimientoPendienteMasAntiguo: "2026-10-05" }),
  // Pausada y anual: no suma al MRR.
  suscripcion({ id: 4, lavadero: "Oeste", estado: "PAUSADA", importe: 1200000, periodicidad: "ANUAL" }),
  // Activa, anual y en otra moneda: suma 100.000 por mes, aparte.
  suscripcion({ id: 5, lavadero: "Centro", importe: 1200000, periodicidad: "ANUAL", moneda: "USD" }),
  // Rechazada: estado desconocido.
  suscripcion({ id: 6, estado: "RARA" }),
];
const fa = armarFacturacion({ planes, suscripciones }, { ahora: AHORA });

check("facturacion: el MRR por planes mensualiza el anual", fa.totales.mrrPorPlanes, [
  { moneda: "ARS", valor: 290000 },
]);
check(
  "facturacion: cuentas con plan y activas",
  [fa.totales.cuentasConPlan, fa.totales.cuentasActivas],
  [4, 3]
);
check(
  "facturacion: suscripciones por estado y vencidas",
  [fa.totales.suscripciones, fa.totales.activas, fa.totales.pausadas, fa.totales.canceladas, fa.totales.vencidas],
  [5, 4, 1, 0, 2]
);
check("facturacion: MRR de suscripciones por moneda, sin mezclar", fa.totales.mrr, [
  { moneda: "ARS", valor: 285000 },
  { moneda: "USD", valor: 100000 },
]);
check(
  "facturacion: las impagas primero, después por lavadero",
  fa.suscripciones.map((s) => [s.id, s.impaga]),
  [
    [3, true],
    [2, true],
    [5, false],
    [1, false],
    [4, false],
  ]
);
check(
  "facturacion: planes con precio mensual y MRR",
  fa.planes.map((p) => [p.nombre, p.precioMensual, p.mrr]),
  [
    ["Básico", 95000, 190000],
    ["Pro", 100000, 100000],
  ]
);
check("facturacion: por estado, los tres siempre", fa.porEstado, [
  { estado: "ACTIVA", suscripciones: 4 },
  { estado: "PAUSADA", suscripciones: 1 },
  { estado: "CANCELADA", suscripciones: 0 },
]);
check(
  "facturacion: problemas de planes y suscripciones",
  fa.problemas.map((p) => [p.plan ?? p.suscripcion, p.campo]),
  [
    [3, "periodicidad"],
    [6, "estado"],
  ]
);

console.log(`\n${ok} ok, ${fail} fallidos`);
if (fail > 0) process.exit(1);
