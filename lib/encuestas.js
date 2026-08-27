// Fuente de datos de la encuesta.
//
// Si ENCUESTAS_CSV_URL apunta a una planilla de Google publicada como CSV, se lee
// de ahi en cada request con cache de 60 segundos. Si la variable no esta puesta o
// la planilla no se puede leer, se cae a data/encuestas.json para que el dashboard
// nunca quede en blanco. La razon de la caida viaja en el resultado y la expone
// /api/salud, asi que un fallback nunca pasa desapercibido.
import respaldo from "@/data/encuestas.json";
import { parsearCsv } from "@/lib/csv";
import { detectarCabecera, normalizarFilas } from "@/lib/normalizar";

const SEGUNDOS_CACHE = 60;

const conRespaldo = (motivo) => ({
  datos: respaldo,
  fuente: "respaldo",
  motivo,
  problemas: [],
  columnasIgnoradas: [],
  filasRechazadas: 0,
});

export default async function obtenerEncuestas() {
  const url = process.env.ENCUESTAS_CSV_URL;
  if (!url) return conRespaldo("ENCUESTAS_CSV_URL no esta configurada");

  let texto;
  try {
    const res = await fetch(url, { next: { revalidate: SEGUNDOS_CACHE } });
    if (!res.ok) return conRespaldo(`la planilla respondio HTTP ${res.status}`);
    texto = await res.text();
  } catch (e) {
    return conRespaldo(`no se pudo leer la planilla: ${e.message}`);
  }

  // Si la planilla no esta publicada, Google devuelve HTML (login o error) con
  // status 200. Sin este chequeo el parser lo tomaria como datos.
  if (texto.trimStart().startsWith("<")) {
    return conRespaldo("la planilla devolvio HTML en vez de CSV: revisar que este publicada");
  }

  let filas;
  try {
    filas = parsearCsv(texto);
  } catch (e) {
    return conRespaldo(`la planilla no se pudo parsear: ${e.message}`);
  }
  if (filas.length === 0) return conRespaldo("la planilla esta vacia");

  // La cabecera no siempre es la primera fila: el export de Excel mete una fila
  // de relleno ("Columna1", "Columna2", ...) antes del texto de las preguntas.
  const { fila, indices, faltantes, ignoradas, ambiguas } = detectarCabecera(filas);
  // Ojo con el orden: un campo ambiguo queda sin indice y por lo tanto aparece
  // tambien en `faltantes`. Si se chequeara `faltantes` primero, el diagnostico
  // diria "faltan columnas" sobre una columna que si esta, solo que matcheada
  // dos veces, y mandaria a buscar algo que existe.
  if (ambiguas.length > 0) {
    const detalle = ambiguas
      .map((a) => `${a.campo} (columnas ${a.columnas.join(" y ")})`)
      .join("; ");
    return conRespaldo(`cabeceras ambiguas: ${detalle}`);
  }
  if (faltantes.length > 0) {
    return conRespaldo(`faltan columnas en la planilla: ${faltantes.join(", ")}`);
  }

  const { datos, problemas, filasRechazadas } = normalizarFilas(
    filas.slice(fila + 1),
    indices,
    fila + 2 // +1 para pasar de indice a numero de fila, +1 para saltar la cabecera
  );
  if (datos.length === 0) {
    return conRespaldo("ninguna fila de la planilla paso la validacion");
  }

  return {
    datos,
    fuente: "planilla",
    motivo: null,
    problemas,
    columnasIgnoradas: ignoradas,
    filaCabecera: fila + 1,
    filasRechazadas,
  };
}
