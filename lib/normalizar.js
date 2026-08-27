// Traduce lo que llega de la planilla al vocabulario exacto que espera lib/kpis.js.
// Sin esta capa, las etiquetas largas del formulario ("Papel, cuaderno o pizarra")
// o un acento de mas ("Mas de 50" vs "Más de 50") hacen que el KPI cuente 0 sin
// tirar ningun error.

// @decision 2026-08-27 ramiro@mispichos.com
// Las tres escalas de frecuencia (consultasTiempo, desvioEstimacion,
// abandonoCliente) admiten los SEIS niveles, no solo los 4 que aparecen en las 40
// respuestas actuales. Se descarto restringir al set observado porque una
// respuesta nueva con un nivel todavia no visto se rechazaria por error, y el
// conjunto observado es una muestra, no el dominio de la pregunta.
const FRECUENCIA = [
  "Nunca",
  "Casi nunca",
  "A veces",
  "Frecuentemente",
  "Casi siempre",
  "Siempre",
];

// Valores canonicos, los unicos que ve lib/kpis.js.
const VOCABULARIO = {
  frecuenciaAltaDemanda: ["1-2 dias/sem", "3-4 dias/sem", "Todos los dias"],
  volumenPico: ["Menos de 10", "Entre 10 y 20", "Entre 20 y 50", "Mas de 50"],
  registro: ["Papel/pizarra", "Excel/Sheets", "Sistema de gestion", "Sin registro"],
  criterioOrden: ["Orden de llegada", "Turnos/reservas", "Tipo de servicio"],
  consultasTiempo: FRECUENCIA,
  desvioEstimacion: FRECUENCIA,
  abandonoCliente: FRECUENCIA,
  mayorDificultad: [
    "Registrar vehiculos",
    "Organizar el orden",
    "Estimar tiempos",
    "Informar al cliente",
    "Coordinar empleados",
    "Administrar turnos",
    "Ninguna",
  ],
};

// Etiquetas tal cual las escribe el formulario, mapeadas al valor canonico.
// Los acentos y los espacios no hacen falta acertarlos: se normalizan igual.
//
// @decision 2026-08-27 ramiro@mispichos.com
// Se conservan las etiquetas cortas de data/encuestas.json como vocabulario
// canonico y se traducen las largas del formulario, en vez de adoptar las largas.
// Motivo: las cortas ya estan en los filtros del dashboard, en las leyendas de los
// graficos y en lib/kpis.js; migrar a las largas tocaba los tres lugares y
// alargaba las etiquetas de los ejes. Se verifico que la traduccion es 1 a 1
// comparando las distribuciones de la planilla contra el JSON: coinciden exacto
// (registro 14/14/8/4, alta demanda 23/15/2, etc.) y los KPIs salen identicos.
const ALIAS = {
  frecuenciaAltaDemanda: {
    "Entre 1 y 2 dias por semana": "1-2 dias/sem",
    "Entre 3 y 4 dias por semana": "3-4 dias/sem",
    "Practicamente todos los dias": "Todos los dias",
  },
  volumenPico: {
    "Mas de 50 vehiculos": "Mas de 50",
  },
  registro: {
    "Papel, cuaderno o pizarra": "Papel/pizarra",
    "Excel o Google Sheets": "Excel/Sheets",
    "No realizamos un registro": "Sin registro",
  },
  criterioOrden: {
    "Por orden de llegada": "Orden de llegada",
    "Mediante turnos o reservas": "Turnos/reservas",
    "Segun el tipo de servicio / vehiculo": "Tipo de servicio",
  },
  mayorDificultad: {
    "Registrar los vehiculos y servicios realizados": "Registrar vehiculos",
    "Organizar el orden de atencion de los vehiculos": "Organizar el orden",
    "Estimar los tiempos de atencion": "Estimar tiempos",
    "Informar al cliente cuando estara listo su vehiculo": "Informar al cliente",
    "Coordinar el trabajo entre empleados": "Coordinar empleados",
    "Administrar turnos o reservas": "Administrar turnos",
    "Ninguno representa una dificultad significativa": "Ninguna",
  },
};

// Fragmentos que identifican cada pregunta cuando la cabecera es el texto
// completo del formulario en vez del nombre del campo. Elegidos para no
// solaparse entre si: "alta demanda" a secas aparece en dos preguntas.
const PATRONES_PREGUNTA = {
  frecuenciaAltaDemanda: /frecuencia tienen dias o momentos/,
  volumenPico: /cuantos vehiculos llegan a atender/,
  registro: /como registran actualmente/,
  criterioOrden: /orden en que se atienden/,
  dificultadOrden: /mantener organizado el orden/,
  consultasTiempo: /consultan cuanto tiempo falta/,
  desvioEstimacion: /difiere del tiempo/,
  abandonoCliente: /no dejar el vehiculo/,
  dificultadEstimar: /dificil resulta estimar/,
  mayorDificultad: /mayor dificultad en la gestion/,
};

const NUMERICOS = ["dificultadOrden", "dificultadEstimar"];

export const CAMPOS = [
  "frecuenciaAltaDemanda",
  "volumenPico",
  "registro",
  "criterioOrden",
  "dificultadOrden",
  "consultasTiempo",
  "desvioEstimacion",
  "abandonoCliente",
  "dificultadEstimar",
  "mayorDificultad",
];

const sinAcentos = (v) =>
  String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Clave de comparacion de valores: sin acentos, en minusculas, sin espacios
// alrededor de "/" y "-", y con los espacios internos colapsados.
const claveValor = (v) =>
  sinAcentos(v)
    .toLowerCase()
    .replace(/\s*([/-])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

// Clave de comparacion de cabeceras: ignora todo lo que no sea alfanumerico para
// que "Mayor dificultad" matchee "mayorDificultad".
const claveCabecera = (v) => sinAcentos(v).toLowerCase().replace(/[^a-z0-9]/g, "");

// Texto de pregunta normalizado, para los patrones.
const clavePregunta = (v) =>
  sinAcentos(v).toLowerCase().replace(/\s+/g, " ").trim();

const BUSQUEDA = Object.fromEntries(
  Object.entries(VOCABULARIO).map(([campo, valores]) => {
    const mapa = new Map(valores.map((v) => [claveValor(v), v]));
    for (const [alias, canonico] of Object.entries(ALIAS[campo] ?? {})) {
      mapa.set(claveValor(alias), canonico);
    }
    return [campo, mapa];
  })
);

const CABECERAS = new Map([...CAMPOS, "id"].map((c) => [claveCabecera(c), c]));

const esFilaVacia = (fila) =>
  !fila.some((v) => String(v ?? "").trim() !== "");

// Mapea una fila de cabeceras a indices de columna. Primero por nombre de campo;
// para las que no matchean, por el texto de la pregunta del formulario.
export function mapearCabeceras(cabeceras) {
  const indices = {};
  const asignadas = new Set();
  const ambiguas = [];

  cabeceras.forEach((bruta, i) => {
    const campo = CABECERAS.get(claveCabecera(bruta));
    if (campo && indices[campo] === undefined) {
      indices[campo] = i;
      asignadas.add(i);
    }
  });

  for (const campo of CAMPOS) {
    if (indices[campo] !== undefined) continue;
    const patron = PATRONES_PREGUNTA[campo];
    if (!patron) continue;

    const coincidencias = cabeceras
      .map((bruta, i) => ({ i, texto: clavePregunta(bruta) }))
      .filter(({ i, texto }) => !asignadas.has(i) && patron.test(texto))
      .map(({ i }) => i);

    if (coincidencias.length === 1) {
      indices[campo] = coincidencias[0];
      asignadas.add(coincidencias[0]);
    } else if (coincidencias.length > 1) {
      ambiguas.push({ campo, columnas: coincidencias.map((i) => i + 1) });
    }
  }

  const ignoradas = cabeceras
    .map((bruta, i) => ({ bruta: String(bruta).trim(), i }))
    .filter(({ bruta, i }) => bruta !== "" && !asignadas.has(i))
    .map(({ bruta }) => (bruta.length > 60 ? bruta.slice(0, 60) + "…" : bruta));

  return {
    indices,
    faltantes: CAMPOS.filter((c) => indices[c] === undefined),
    ignoradas,
    ambiguas,
  };
}

// La planilla exportada desde Excel trae una primera fila de relleno
// ("Columna1", "Columna2", ...) y la cabecera real en la segunda. Se prueban las
// primeras filas y gana la que reconoce mas campos.
export function detectarCabecera(filas, maxFilasAProbar = 5) {
  let mejor = null;
  let probadas = 0;

  for (let i = 0; i < filas.length && probadas < maxFilasAProbar; i++) {
    // Una fila en blanco arriba de la cabecera no consume un intento.
    if (esFilaVacia(filas[i])) continue;
    probadas++;
    const intento = mapearCabeceras(filas[i]);
    const reconocidos = CAMPOS.length - intento.faltantes.length;
    if (!mejor || reconocidos > mejor.reconocidos) {
      mejor = { fila: i, reconocidos, ...intento };
    }
    if (intento.faltantes.length === 0) break;
  }

  return mejor ?? { fila: 0, reconocidos: 0, indices: {}, faltantes: CAMPOS, ignoradas: [], ambiguas: [] };
}

// Convierte las filas de datos al esquema interno. Nunca descarta en silencio:
// lo que no matchea vuelve en `problemas` para que /api/salud lo exponga.
// `filaInicial` es el numero de fila real de la planilla de la primera fila de datos.
export function normalizarFilas(filas, indices, filaInicial = 2) {
  const datos = [];
  const problemas = [];
  const filasMalas = new Set();

  filas.forEach((fila, i) => {
    const numeroFila = filaInicial + i;

    // Una fila totalmente en blanco no es un error: la planilla las tiene.
    if (esFilaVacia(fila)) return;

    const registro = {};
    let valida = true;

    for (const campo of CAMPOS) {
      const bruto = (fila[indices[campo]] ?? "").trim();

      if (bruto === "") {
        problemas.push({ fila: numeroFila, campo, valor: bruto, motivo: "vacio" });
        filasMalas.add(numeroFila);
        valida = false;
        continue;
      }

      if (NUMERICOS.includes(campo)) {
        const n = Number(bruto.replace(",", "."));
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          problemas.push({
            fila: numeroFila,
            campo,
            valor: bruto,
            motivo: "se esperaba un entero de 1 a 5",
          });
          filasMalas.add(numeroFila);
          valida = false;
          continue;
        }
        registro[campo] = n;
        continue;
      }

      const canonico = BUSQUEDA[campo].get(claveValor(bruto));
      if (!canonico) {
        problemas.push({
          fila: numeroFila,
          campo,
          valor: bruto,
          motivo: "valor no reconocido",
          esperado: VOCABULARIO[campo],
        });
        filasMalas.add(numeroFila);
        valida = false;
        continue;
      }
      registro[campo] = canonico;
    }

    if (!valida) return;

    const idBruto = indices.id !== undefined ? (fila[indices.id] ?? "").trim() : "";
    const id = Number(idBruto);
    registro.id = Number.isFinite(id) && idBruto !== "" ? id : datos.length + 1;

    datos.push(registro);
  });

  // Se cuentan FILAS, no problemas: una fila con 10 campos invalidos es una sola
  // respuesta rechazada, y reportar 10 hace creer que se perdieron 10 respuestas.
  return { datos, problemas, filasRechazadas: filasMalas.size };
}
