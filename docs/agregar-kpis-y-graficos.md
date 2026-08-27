# Cómo agregar KPIs y gráficos

> **Para qué sirve este documento:** es el procedimiento operativo. Cada receta
> es una lista cerrada de archivos a tocar, en orden, con la verificación que
> confirma que salió bien.
>
> **Antes de empezar** leé [arquitectura.md](arquitectura.md) (dónde va cada cosa)
> y [convenciones.md](convenciones.md) (cómo se escribe).

## Índice de recetas

| Quiero… | Receta | Archivos que toca |
|---------|--------|-------------------|
| Una tarjeta con un número nuevo | [A](#receta-a-agregar-un-kpi-numérico) | `lib/kpis.js`, `app/page.jsx` |
| Un gráfico nuevo con datos que ya tengo | [B](#receta-b-agregar-un-gráfico) | `app/page.jsx` |
| Un tipo de gráfico que todavía no existe | [C](#receta-c-agregar-un-tipo-de-gráfico-nuevo) | `components/`, `app/page.jsx` |
| Usar una pregunta de la encuesta que no está modelada | [D](#receta-d-agregar-un-campo-de-la-encuesta) | `lib/normalizar.js`, `data/encuestas.json` |
| Un dashboard entero nuevo | [E](#receta-e-agregar-un-dashboard-nuevo) | `app/dashboards/`, `lib/kpis/`, `app/api/` |

## Vocabulario: qué es cada cosa

- **Campo** — una columna de la encuesta, ya normalizada. Ej. `registro`,
  `dificultadOrden`. Definidos en `CAMPOS` de `lib/normalizar.js`.
- **Valor canónico** — el string exacto que puede tener un campo. Ej.
  `"Papel/pizarra"`. Definidos en `VOCABULARIO` de `lib/normalizar.js`.
- **KPI** — un número derivado del conjunto de respuestas. Ej. "80 % gestiona
  manual".
- **Distribución** — un conteo por valor de un campo. Es lo que alimenta los
  gráficos.

## Contratos de los componentes

Respetalos literalmente. Si tus datos no tienen esta forma, transformalos antes
de pasarlos, no cambies el componente.

### `TarjetaKpi`

```jsx
<TarjetaKpi
  etiqueta="Gestión manual o nula"   // string, obligatorio
  valor="80%"                         // string o number, obligatorio
  detalle="papel, planilla o sin registro"  // string, opcional
  critico                             // boolean, opcional: pinta el valor en rojo
/>
```

### `BarrasHorizontales`

Para rankear categorías. El alto se calcula solo según la cantidad de filas.

```jsx
<BarrasHorizontales
  datos={[{ nombre: "Papel/pizarra", valor: 14 }, ...]}  // [{nombre: string, valor: number}]
  color="#0fa3b1"                                        // string, un solo color
/>
```

### `BarrasAgrupadas`

Para comparar varias series sobre las mismas categorías.

```jsx
<BarrasAgrupadas
  datos={[
    { nombre: "Nunca", "Consultan tiempo": 1, "Estimación falla": 1 },
    { nombre: "A veces", "Consultan tiempo": 17, "Estimación falla": 24 },
  ]}
  series={[
    { clave: "Consultan tiempo", color: "#0fa3b1" },
    { clave: "Estimación falla", color: "#eb6834" },
  ]}
/>
```

**Regla del contrato:** cada `clave` de `series` tiene que existir como propiedad
en **todas** las filas de `datos`, incluso cuando el valor es `0`. Si falta,
Recharts dibuja el eje pero no la barra, y no avisa.

---

## Receta A: agregar un KPI numérico

Ejemplo: agregar **"% que usa sistema de gestión"**.

> **Por qué son dos lugares:** hoy el cálculo está duplicado entre servidor y
> cliente. Es deuda conocida, está explicada en
> [arquitectura.md](arquitectura.md#1-el-cálculo-de-kpis-está-duplicado). Hay que
> tocar los dos o el dashboard y la API van a decir cosas distintas.

### Paso 1 — calcularlo en el servidor

Archivo: `lib/kpis.js`, dentro de `calcularKpis`.

Agregá el conteo antes del `return` y la salida dentro del objeto que se
devuelve. Usá el helper `pct(n, total)` que ya está en el archivo; no reimplementes
el redondeo.

```js
// lib/kpis.js — dentro de calcularKpis, antes del return
const conSistema = datos.filter((r) => r.registro === "Sistema de gestion").length;

// ...dentro del objeto que devuelve la función:
  usanSistemaDeGestion: { valor: conSistema, pct: pct(conSistema, n) },
```

**Convención de nombres de salida:** `camelCase`, descriptivo del negocio, y con
la forma `{ valor, pct }` cuando es un porcentaje sobre `n`. No devuelvas un
número pelado si el resto de los KPIs devuelven objetos.

### Paso 2 — calcularlo en el cliente

Archivo: `app/page.jsx`, dentro del `useMemo` que arma `kpis`.

Ahí ya existe el helper local `entre(campo, valores)`, que cuenta cuántas filas
tienen alguno de esos valores. Usalo.

```jsx
// app/page.jsx — dentro del useMemo de kpis, en el objeto que devuelve
  usanSistema: pct(entre("registro", ["Sistema de gestion"]), n),
```

### Paso 3 — mostrarlo

Archivo: `app/page.jsx`, en uno de los `<div className="grilla-kpis">`.

La grilla es de 4 columnas. **Agregá la tarjeta a una grilla que tenga menos de
4, o abrí una grilla nueva.** No dejes una grilla con 5 tarjetas: se desarma el
layout.

```jsx
<TarjetaKpi
  etiqueta="Usan sistema de gestión"
  valor={`${kpis.usanSistema}%`}
  detalle="ya digitalizados"
/>
```

### Paso 4 — verificar

```bash
npm run dev
curl -s "http://localhost:3000/api/kpis" | python3 -m json.tool | grep -A2 usanSistema
```

Y en el navegador: la tarjeta aparece, el número coincide con el de la API, y
**cambia al hacer clic en los chips de filtro**. Si no cambia con el filtro, lo
calculaste sobre `respuestas` en vez de sobre `datos`.

---

## Receta B: agregar un gráfico

Ejemplo: agregar un gráfico de **criterio de orden de atención**.

### Paso 1 — armar la distribución

Archivo: `app/page.jsx`, al lado de los otros `useMemo`.

El patrón está en los `useMemo` de `registros` y `dificultades`: contar y mapear
a `{nombre, valor}`.

```jsx
const criterios = useMemo(() => {
  const c = contar(datos, "criterioOrden");
  return Object.entries(c)
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor);
}, [datos]);
```

**Siempre `[datos]` como dependencia, nunca `[respuestas]`.** `datos` es el
conjunto ya filtrado por el chip activo; usar `respuestas` hace que el gráfico
ignore el filtro.

**Ordenar sí o no:** para categorías sin orden natural (métodos, dificultades),
ordenar por valor descendente. Para escalas con orden propio (frecuencia, Likert
1-5), **respetar el orden de la escala**, no el del conteo — mirá el `useMemo` de
`friccion`, que recorre `ORDEN_FRECUENCIA`.

### Paso 2 — renderizarlo

Archivo: `app/page.jsx`, dentro del `<main>`.

Un gráfico va siempre dentro de un `<section className="panel">` con `<h2>` y
`<p className="subtitulo">`. Para dos gráficos lado a lado, envolvelos en
`<div className="dos-columnas">`.

```jsx
<section className="panel">
  <h2>Criterio de orden de atención</h2>
  <p className="subtitulo">Cómo deciden a quién atender primero</p>
  <BarrasHorizontales datos={criterios} color="#0fa3b1" />
</section>
```

### Paso 3 — verificar

Abrí el dashboard y confirmá que **se ven las barras**, no solo los ejes. Si ves
los ejes con la escala correcta pero ninguna barra, el problema casi siempre es
el contrato de `datos`: una clave de `series` que falta en alguna fila.

Si estás capturando la página con un browser headless y las barras no salen, leé
[Problemas conocidos](../README.md#los-gráficos-salen-vacíos-en-capturas-con-un-browser-headless):
es un artefacto de la captura, no un bug.

---

## Receta C: agregar un tipo de gráfico nuevo

Solo si ninguno de los dos existentes sirve. Un gráfico de torta para mostrar 7
categorías, por ejemplo, es peor que las barras horizontales que ya hay.

### Paso 1 — crear el componente

Archivo nuevo: `components/<Nombre>.jsx`. Nombre en `PascalCase` y en español,
describiendo la **forma** del gráfico, no el dato: `BarrasApiladas`, `Lineas`,
`Dispersion`. Nunca `GraficoDeRegistro`.

Copiá la estructura de `components/BarrasHorizontales.jsx`:

```jsx
"use client";

import { ResponsiveContainer, /* ... */ } from "recharts";

export default function Lineas({ datos, series }) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        {/* ... */}
      </ResponsiveContainer>
    </div>
  );
}
```

Requisitos del componente:

1. **`"use client"`** en la primera línea. Recharts no funciona en el servidor.
2. **Alto explícito** en el `<div>` contenedor. `ResponsiveContainer` necesita un
   padre con alto definido o no dibuja nada.
3. **Genérico:** recibe `datos` y `series`/`color` por props. No importa nada de
   `lib/`, no conoce los campos de la encuesta, no tiene strings del dominio
   adentro.
4. **Colores por props**, nunca hardcodeados en el componente.

### Paso 2 — documentar el contrato

Agregá el componente a [Contratos de los componentes](#contratos-de-los-componentes)
en este mismo documento, con un ejemplo de `datos` real. Un componente sin
contrato documentado se usa mal.

### Paso 3 — usarlo y verificar

Igual que la Receta B.

---

## Receta D: agregar un campo de la encuesta

Necesario cuando querés usar una pregunta que todavía no está modelada, o cuando
el formulario agrega una opción nueva.

### Caso D.1 — una opción nueva en un campo que ya existe

Ejemplo: el formulario ahora ofrece `"App de gestión propia"` en la pregunta de
registro.

Archivo: `lib/normalizar.js`.

1. Agregá el valor canónico a `VOCABULARIO.registro`.
2. Si la etiqueta del formulario es más larga, agregá el alias en `ALIAS.registro`.
3. Si el KPI de "gestión manual" tiene que contarla o no, actualizá `lib/kpis.js`
   **y** `app/page.jsx` (Receta A), y firmá la decisión (ver
   [convenciones.md](convenciones.md#4-firma-de-autor-en-decisiones-de-lógica)).
4. Si el valor aparece en los chips de filtro, agregalo a `FILTROS_REGISTRO` en
   `app/page.jsx`.

```js
// lib/normalizar.js
const VOCABULARIO = {
  registro: [..., "App propia"],
};

const ALIAS = {
  registro: {
    ...
    "App de gestion propia": "App propia",
  },
};
```

**Verificación:** `curl -s localhost:3000/api/salud | python3 -m json.tool`.
`filasRechazadas` tiene que ser `0`. Si el valor no está en el vocabulario, esas
filas aparecen en `problemas` con motivo `"valor no reconocido"` — **no se cuentan
mal en silencio, se rechazan**.

### Caso D.2 — una pregunta nueva

Archivo: `lib/normalizar.js`.

1. Agregá el nombre del campo a `CAMPOS`.
2. Si es categórico: agregá su lista a `VOCABULARIO`, y los alias en `ALIAS` si el
   formulario usa etiquetas largas.
3. Si es numérico (Likert 1-5): agregalo a `NUMERICOS` y **no** a `VOCABULARIO`.
4. Agregá un fragmento distintivo de la pregunta a `PATRONES_PREGUNTA`.

> **El patrón tiene que ser único.** Verificá que no matchee la pregunta de otro
> campo: `"alta demanda"` aparece en dos preguntas distintas del formulario
> actual. Si dos campos matchean la misma columna, el loader corta con
> `"cabeceras ambiguas"` en lugar de adivinar.

5. **Agregá el campo a las 40 filas de `data/encuestas.json`.** Es obligatorio: el
   respaldo no pasa por la normalización, así que si el campo falta ahí, cuando la
   app caiga al respaldo va a llegar `undefined` al dashboard sin ningún error.

**Verificación:**

```bash
curl -s localhost:3000/api/salud | python3 -m json.tool   # filasRechazadas: 0, faltantes: []
curl -s localhost:3000/api/respuestas | python3 -c "import sys,json; print(json.load(sys.stdin)[0])"
```

El campo nuevo tiene que aparecer en la primera respuesta.

---

## Receta E: agregar un dashboard nuevo

La estructura de carpetas y las reglas están en
[arquitectura.md](arquitectura.md#cómo-se-agrega-un-dashboard-nuevo). El orden de
trabajo es:

1. **Fuente de datos.** Si el dashboard nuevo no usa la encuesta, agregá su loader
   en `lib/` siguiendo el patrón de `lib/encuestas.js`: una función `async` que
   devuelve `{ datos, fuente, motivo, problemas }` y **siempre tiene respaldo**.
2. **Módulo de cálculo** en `lib/kpis/<dominio>.js`, con funciones puras.
3. **Ruta de API** en `app/api/<dominio>/route.js`. Solo traduce HTTP.
4. **Página** en `app/dashboards/<slug>/page.jsx`, reusando `components/`.
5. **Índice.** Agregá el dashboard nuevo a la lista de `app/page.jsx`.
6. **Documentá** la fuente y los KPIs nuevos en el README.

---

## Checklist antes de dar por terminado

Copiá esto en la descripción del PR y marcá cada punto.

```
[ ] El KPI/gráfico cambia al usar los chips de filtro (usé `datos`, no `respuestas`)
[ ] Si toqué un KPI, lo actualicé en lib/kpis.js Y en app/page.jsx
[ ] Los números de /api/kpis coinciden con los que muestra el dashboard
[ ] Si agregué un campo, está también en data/encuestas.json
[ ] curl /api/salud → filasRechazadas: 0, faltantes: []
[ ] npm test pasa (obligatorio si toqué lib/csv.js o lib/normalizar.js)
[ ] npm run build pasa sin errores ni warnings nuevos
[ ] Vi el gráfico con barras dibujadas en el navegador, no solo los ejes
[ ] Cero errores en la consola del navegador
[ ] Si cambié una regla de negocio, dejé la firma @decision (ver convenciones.md)
[ ] Actualicé el README si cambió la lista de KPIs o los endpoints
```

## Comandos de verificación de referencia

```bash
npm run dev                  # dev server en :3000
npm test                     # tests de csv.js y normalizar.js
npm run build                # tiene que compilar sin errores
npm start                    # server de producción, lo que corre en Vercel

curl -s localhost:3000/api/salud | python3 -m json.tool
curl -s localhost:3000/api/kpis | python3 -m json.tool
curl -s "localhost:3000/api/kpis?registro=Papel/pizarra" | python3 -m json.tool

lsof -ti:3000 -sTCP:LISTEN | xargs kill    # bajar el server
```
