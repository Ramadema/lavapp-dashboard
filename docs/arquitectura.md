# Arquitectura y estructura del repo

> **Para qué sirve este documento:** entender dónde va cada cosa antes de
> escribir código. Si vas a agregar un KPI o un gráfico, leé después
> [agregar-kpis-y-graficos.md](agregar-kpis-y-graficos.md). Si vas a tocar
> código, leé también [convenciones.md](convenciones.md).

## Qué es este repo

Backoffice y API de backoffice del proyecto LavApp. La app principal es otra
cosa y vive en otro lado; acá se concentran:

1. **Dashboards de KPIs** — mediciones que el equipo necesita ver. Hoy hay uno
   (la encuesta a lavaderos) y van a haber varios más.
2. **La API REST que los alimenta** — Route Handlers bajo `app/api/`, que también
   quedan disponibles para consumo externo.

Es un solo proyecto Next.js: front y API salen del mismo dominio y del mismo
deploy. La separación cliente ↔ API se mantiene igual: el front pide por `fetch`,
nunca importa la fuente de datos directamente.

## Las cuatro capas

La regla es que **las dependencias van en una sola dirección**. Una capa puede
importar de las de abajo, nunca de las de arriba ni de sus hermanas.

```
┌─────────────────────────────────────────────────────────────┐
│ 4. PRESENTACIÓN   app/page.jsx, app/dashboards/**           │
│                   components/**                             │
│                   "use client" · pide datos por fetch        │
├─────────────────────────────────────────────────────────────┤
│ 3. API            app/api/**/route.js                        │
│                   traduce HTTP ↔ dominio. Sin lógica propia. │
├─────────────────────────────────────────────────────────────┤
│ 2. DOMINIO        lib/kpis.js                                │
│                   cálculo de indicadores. Funciones puras.   │
├─────────────────────────────────────────────────────────────┤
│ 1. DATOS          lib/encuestas.js  ← única puerta de entrada│
│                   lib/normalizar.js · lib/csv.js             │
│                   data/encuestas.json (respaldo)             │
└─────────────────────────────────────────────────────────────┘
```

**Invariantes que no se negocian:**

- La capa de presentación **nunca** importa de `lib/`, salvo helpers puros sin
  estado. Los datos entran por `fetch` a `/api/*`.
- La capa de API **no calcula nada**. Lee parámetros, llama al dominio, serializa.
  Si en un `route.js` aparece un `reduce` o un `filter` con reglas de negocio,
  está en el lugar equivocado.
- La capa de dominio **no sabe de HTTP ni de React**. Funciones puras: mismos
  datos de entrada, mismo resultado. Eso las hace testeables sin levantar nada.
- Toda lectura de datos pasa por `lib/encuestas.js`. Ningún otro archivo lee la
  planilla, el JSON ni ninguna otra fuente futura.

## Flujo de datos

```
                            ┌──▶ planilla de Google (CSV, cache 60 s)
Navegador                   │
   │  fetch /api/respuestas │
   ▼                        │
app/api/respuestas/route.js─┤
   │                        └──▶ data/encuestas.json (respaldo)
   │  obtenerEncuestas()          │
   ▼                              ▼
lib/encuestas.js ──▶ lib/csv.js ──▶ lib/normalizar.js ──▶ array canónico
                                                              │
                                                              ▼
                                                        lib/kpis.js
```

El detalle de la fuente en vivo, el cache y el respaldo está en el
[README](../README.md#datos-en-vivo-desde-google-sheets).

## Mapa de archivos

### Capa de datos

| Archivo | Responsabilidad | Cuándo lo tocás |
|---------|-----------------|-----------------|
| `lib/encuestas.js` | Resuelve de dónde salen los datos: planilla o respaldo. Decide el fallback y arma el diagnóstico. | Al agregar una fuente de datos nueva. |
| `lib/csv.js` | Parser CSV (RFC 4180). No sabe nada de encuestas. **No filtra filas vacías**: el índice de cada fila tiene que seguir siendo el número de línea del archivo, porque `/api/salud` lo reporta para ir a corregir la celda. Lanza si encuentra una comilla sin cerrar. | Casi nunca. Es genérico. |
| `lib/normalizar.js` | Traduce la planilla al vocabulario canónico y valida. `CAMPOS`, `VOCABULARIO`, `ALIAS`, `PATRONES_PREGUNTA`. | Al agregar una pregunta, una opción nueva o una etiqueta nueva del formulario. |
| `data/encuestas.json` | Las 40 respuestas originales. Doble función: dato inicial y respaldo. | Ver la advertencia de abajo. |

> **Cuidado con `data/encuestas.json`:** se importa directo en
> `lib/encuestas.js` y **no pasa por la normalización**. Si agregás un campo a
> `CAMPOS` en `lib/normalizar.js` y no lo agregás también a este JSON, cuando la
> app caiga al respaldo ese campo va a llegar `undefined` al dashboard, sin ningún
> error. Los dos esquemas se mantienen sincronizados a mano.

### Tests

| Archivo | Qué cubre |
|---------|-----------|
| `test/normalizar.test.mjs` | `lib/csv.js` y `lib/normalizar.js`. Sin framework, se corre con `npm test`. Incluye regresiones de los cuatro bugs de la revisión del 2026-08-27. |

Son las dos piezas puras del repo: entran datos, salen datos, sin red ni React.
Por eso son las únicas con tests hoy, y las que más los necesitan porque cuando
fallan lo hacen en silencio.

### Capa de dominio

| Archivo | Responsabilidad |
|---------|-----------------|
| `lib/kpis.js` | `calcularKpis(datos)` → objeto de indicadores. Funciones puras, sin efectos. |

### Capa de API

| Ruta | Archivo | Devuelve |
|------|---------|----------|
| `GET /api/respuestas` | `app/api/respuestas/route.js` | Array de respuestas normalizadas. **Es la que consume el dashboard.** |
| `GET /api/kpis[?registro=]` | `app/api/kpis/route.js` | KPIs calculados en el servidor. Para consumo externo. |
| `GET /api/salud` | `app/api/salud/route.js` | Health check + qué fuente se usó y qué filas se rechazaron. |

### Capa de presentación

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/layout.jsx` | Layout raíz, `metadata`, importa `globals.css`. |
| `app/page.jsx` | El dashboard de la encuesta. `"use client"`. |
| `app/globals.css` | Tokens de color (`--tinta`, `--agua`, …) y todas las clases. Sin CSS-in-JS. |
| `components/TarjetaKpi.jsx` | Tarjeta de un indicador numérico. |
| `components/BarrasHorizontales.jsx` | Gráfico de barras horizontales (ranking de categorías). |
| `components/BarrasAgrupadas.jsx` | Gráfico de barras verticales agrupadas (comparar series). |

Los contratos de props de los tres componentes están en
[agregar-kpis-y-graficos.md](agregar-kpis-y-graficos.md#contratos-de-los-componentes).

## Cómo se agrega un dashboard nuevo

Hoy hay un solo dashboard y vive en `app/page.jsx`, en la raíz. Cuando entre el
segundo, la estructura es esta:

```
app/
  page.jsx                      → índice: lista de dashboards disponibles
  dashboards/
    encuesta-lavaderos/
      page.jsx                  → el dashboard actual, movido acá
    <nuevo-dashboard>/
      page.jsx
  api/
    <nuevo-dominio>/
      route.js
lib/
  kpis.js                       → renombrar a lib/kpis/encuesta.js
  kpis/
    <nuevo-dominio>.js          → un módulo de cálculo por dominio
```

Reglas para el dashboard nuevo:

1. **Una carpeta por dashboard** bajo `app/dashboards/<slug>/`, con `page.jsx`.
   El slug en kebab-case y descriptivo del dominio, no del gráfico.
2. **Un módulo de cálculo por dominio** en `lib/kpis/<dominio>.js`. No metas
   KPIs de dominios distintos en el mismo archivo.
3. **Una ruta de API por dominio** bajo `app/api/<dominio>/`.
4. **Reusá los componentes de `components/`.** Si necesitás un tipo de gráfico
   que no existe, creá el componente genérico en `components/` — no un componente
   específico de ese dashboard.
5. **No dupliques `globals.css`.** Las clases `.panel`, `.grilla-kpis`,
   `.dos-columnas`, `.contenedor` y `.chip` son compartidas.

## Deuda conocida

Anotada acá para que no se descubra a los golpes, y para que quien la arregle
sepa qué se esperaba.

### 1. El cálculo de KPIs está duplicado

`lib/kpis.js` y el `useMemo` de `app/page.jsx` calculan **los mismos
indicadores dos veces**, con lógica copiada y nombres de salida distintos
(`gestionManualONula.pct` en el server, `kpis.manual` en el cliente).

El dashboard usa la versión del cliente; `/api/kpis` usa la del server.

**Consecuencia práctica:** hoy, agregar o cambiar un KPI obliga a editar los dos
lugares, y si te olvidás de uno, el dashboard y la API dicen cosas distintas sin
que nada falle.

**Arreglo previsto:** `lib/kpis.js` no tiene dependencias de servidor, así que el
componente de cliente puede importar `calcularKpis` directamente y borrar su
copia. Requiere unificar los nombres de salida y ajustar el JSX.

### 2. Los colores de los gráficos están hardcodeados

`app/globals.css` define los tokens (`--agua: #0fa3b1`), pero `app/page.jsx` pasa
los hex literales a los componentes (`color="#0fa3b1"`). El mismo color vive en
dos lugares.

**Arreglo previsto:** exportar la paleta desde un módulo JS y que el CSS la
consuma, o leer las variables CSS desde JS.
