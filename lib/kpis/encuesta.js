// Calculo de los KPIs de la encuesta. Vive aparte de las rutas para que lo
// puedan usar tanto los Route Handlers como cualquier import del lado del server.
const contar = (arr, campo) =>
  arr.reduce((acc, r) => {
    acc[r[campo]] = (acc[r[campo]] || 0) + 1;
    return acc;
  }, {});

const pct = (n, total) => Math.round((n / total) * 1000) / 10;

export function calcularKpis(datos) {
  const n = datos.length;
  const registro = contar(datos, "registro");
  const manualONulo =
    (registro["Papel/pizarra"] || 0) +
    (registro["Excel/Sheets"] || 0) +
    (registro["Sin registro"] || 0);

  const altaDemanda = datos.filter((r) =>
    ["3-4 dias/sem", "Todos los dias"].includes(r.frecuenciaAltaDemanda)
  ).length;

  const picosAltos = datos.filter((r) =>
    ["Entre 20 y 50", "Mas de 50"].includes(r.volumenPico)
  ).length;

  const pierdenClientes = datos.filter((r) =>
    ["A veces", "Casi siempre"].includes(r.abandonoCliente)
  ).length;

  const pierdenSiempre = datos.filter(
    (r) => r.abandonoCliente === "Casi siempre"
  ).length;

  const estimacionFalla = datos.filter((r) =>
    ["A veces", "Casi siempre"].includes(r.desvioEstimacion)
  ).length;

  const consultasFrecuentes = datos.filter((r) =>
    ["Frecuentemente", "Siempre"].includes(r.consultasTiempo)
  ).length;

  const conDificultad = datos.filter(
    (r) => r.mayorDificultad !== "Ninguna"
  ).length;

  const promedio = (campo) =>
    Math.round((datos.reduce((s, r) => s + r[campo], 0) / n) * 10) / 10;

  return {
    n,
    gestionManualONula: { valor: manualONulo, pct: pct(manualONulo, n) },
    altaDemanda3MasDias: { valor: altaDemanda, pct: pct(altaDemanda, n) },
    picos20MasVehiculos: { valor: picosAltos, pct: pct(picosAltos, n) },
    pierdenClientesPorEspera: {
      valor: pierdenClientes,
      pct: pct(pierdenClientes, n),
      casiSiempre: { valor: pierdenSiempre, pct: pct(pierdenSiempre, n) },
    },
    estimacionesQueFallan: {
      valor: estimacionFalla,
      pct: pct(estimacionFalla, n),
    },
    consultasFrecuentesDeEspera: {
      valor: consultasFrecuentes,
      pct: pct(consultasFrecuentes, n),
    },
    reportanAlgunaDificultad: {
      valor: conDificultad,
      pct: pct(conDificultad, n),
    },
    dificultadOrdenPromedio: promedio("dificultadOrden"),
    dificultadEstimarPromedio: promedio("dificultadEstimar"),
    distribuciones: {
      registro,
      frecuenciaAltaDemanda: contar(datos, "frecuenciaAltaDemanda"),
      volumenPico: contar(datos, "volumenPico"),
      criterioOrden: contar(datos, "criterioOrden"),
      mayorDificultad: contar(datos, "mayorDificultad"),
      consultasTiempo: contar(datos, "consultasTiempo"),
      desvioEstimacion: contar(datos, "desvioEstimacion"),
      abandonoCliente: contar(datos, "abandonoCliente"),
    },
  };
}
