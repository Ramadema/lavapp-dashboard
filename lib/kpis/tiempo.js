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

// ---- Aritmetica y dias que comparten performance.js, proyecto.js y equipo.js --

export const sumar = (valores) => valores.reduce((total, v) => total + v, 0);
export const conUnDecimal = (n) => Math.round(n * 10) / 10;

// Porcentaje con un decimal. Sin total no hay porcentaje: devolver 0 diria "no se
// avanzo nada" sobre un sprint que no tiene nada cargado.
export const porcentaje = (parte, total) =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : null;

// Shortcut manda las fechas del sprint como "2026-09-23" aunque su OpenAPI diga
// date-time. Se corta a 10 caracteres por si algun dia llegan con hora: lo que
// importa es el dia del calendario, no el instante.
export const fechaDeCalendario = (valor) => String(valor).slice(0, 10);
export const numeroDeDia = (dia) => Date.parse(`${dia}T00:00:00Z`) / MS_POR_DIA;
export const diasEntre = (desde, hasta) => numeroDeDia(hasta) - numeroDeDia(desde);
export const sumarDias = (dia, n) => new Date((numeroDeDia(dia) + n) * MS_POR_DIA).toISOString().slice(0, 10);

// @decision 2026-09-30 ramiro@mispichos.com
// Los dias restantes incluyen el de hoy: el ultimo dia del sprint todavia se
// trabaja, y decir "quedan 0 dias" esa manana suena a sprint cerrado. Son dias
// corridos, no habiles, igual que las fechas de inicio y fin de Shortcut. Antes
// de empezar quedan todos; despues del fin, ninguno. Vale para un sprint y para
// el periodo del proyecto entero (proyecto.js).
export function diasRestantesDe(inicio, fin, hoy) {
  if (hoy > fin) return 0;
  if (hoy < inicio) return diasEntre(inicio, fin) + 1;
  return diasEntre(hoy, fin) + 1;
}
