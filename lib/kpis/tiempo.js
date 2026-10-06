// Tiempo y estadistica que comparten los modulos de KPIs: la zona horaria del
// negocio, el dia y el mes calendario de un instante, promedios y medianas, y
// de cuando es la lectura que se esta mostrando. Puro: sin fetch, sin React,
// sin process.env. Vive aparte para que Performance y las secciones de Gestion
// corten los dias y midan lo mismo con el mismo codigo.

// Los dias se cortan en la hora de Buenos Aires, no en UTC: una orden entregada
// a las 22 h de Argentina es de ese dia aunque en UTC ya sea el siguiente.
export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

// Mas viejo que esto, el dato se marca como desactualizado en la pantalla. Los
// caches de las fuentes se renuevan a los pocos minutos de cada visita; pasar de
// 30 quiere decir que nadie miro en un rato o que la fuente no esta respondiendo.
export const MINUTOS_PARA_DESACTUALIZADO = 30;

export const MS_POR_DIA = 86_400_000;

const PARTES_DE_FECHA = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partesLocales = (instante) =>
  Object.fromEntries(
    PARTES_DE_FECHA.formatToParts(new Date(instante)).map((p) => [p.type, p.value])
  );

// Dia calendario de Buenos Aires ("2026-09-28") de un instante ISO o en ms.
export function diaLocal(instante) {
  const partes = partesLocales(instante);
  return `${partes.year}-${partes.month}-${partes.day}`;
}

// Mes calendario de Buenos Aires ("2026-09") de un instante ISO o en ms.
export function mesLocal(instante) {
  const partes = partesLocales(instante);
  return `${partes.year}-${partes.month}`;
}

// El instante en ms de una fecha ISO, o null si no se puede leer. Es la unica
// forma de validar una fecha que llega de afuera: Date.parse devuelve NaN y
// nadie se entera.
export function instante(iso) {
  const n = Date.parse(iso ?? "");
  return Number.isFinite(n) ? n : null;
}

// Minutos enteros entre dos instantes en ms.
export const minutosEntre = (desde, hasta) => Math.round((hasta - desde) / 60_000);

// Promedio redondeado a `decimales`; null si no hay valores, que no es lo mismo
// que 0 (0 diria "tarda nada").
export function promedio(valores, decimales = 0) {
  if (valores.length === 0) return null;
  const factor = 10 ** decimales;
  return Math.round((valores.reduce((total, v) => total + v, 0) / valores.length) * factor) / factor;
}

// Mediana de una lista no vacia; con una lista vacia devuelve NaN, como siempre
// lo hizo en Performance: quien llama se fija antes si tiene valores.
export function mediana(valores) {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

// De cuando es lo que se muestra: el mas viejo de los instantes en que se leyo
// cada parte, y si ya paso el umbral para avisarlo en pantalla.
export function describirLectura(leidos, ahora) {
  const instantes = leidos.map((l) => Date.parse(l ?? "")).filter((n) => Number.isFinite(n));
  if (instantes.length === 0) return { leidoEl: null, desactualizado: false };
  const masViejo = Math.min(...instantes);
  return {
    leidoEl: new Date(masViejo).toISOString(),
    desactualizado: ahora.getTime() - masViejo > MINUTOS_PARA_DESACTUALIZADO * 60_000,
  };
}

// Cuenta cuantas filas caen en cada clave y las ordena de mayor a menor.
export function contar(filas, clave) {
  const conteo = new Map();
  for (const fila of filas) {
    const k = clave(fila);
    conteo.set(k, (conteo.get(k) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre));
}
