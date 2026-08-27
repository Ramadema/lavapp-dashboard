# Convenciones de código

> **Para qué sirve este documento:** son las bases que respetamos todos los que
> trabajamos en este repo, humanos e IA. No son preferencias estéticas: cada regla
> está para evitar un problema concreto que ya pasó o que va a pasar.
>
> Complementa a [arquitectura.md](arquitectura.md) (dónde va cada cosa) y
> [agregar-kpis-y-graficos.md](agregar-kpis-y-graficos.md) (el procedimiento).

## 1. Idioma

- **Código, nombres y comentarios: español.** Es el idioma del equipo y del
  dominio. `calcularKpis`, `datos`, `problemas`, no `calculateKpis` ni `data`.
- **Los nombres del dominio se escriben como en el negocio.** El campo se llama
  `registro` porque así se llama la pregunta, no `registrationMethod`.
- **Sin acentos ni ñ en identificadores.** `normalizarFilas`, no `normalizarFilás`.
  En strings y comentarios, acentos normales.
- **Excepción: las claves que ya definió una fuente externa se dejan como están.**
  Los valores canónicos del vocabulario (`"Papel/pizarra"`, `"Mas de 50"`) van sin
  acento porque así están en `data/encuestas.json`; cambiarlos rompe los KPIs.

## 2. Nombres

| Qué | Cómo | Ejemplo |
|-----|------|---------|
| Funciones y variables | `camelCase`, verbo si hace algo | `obtenerEncuestas`, `normalizarFilas` |
| Componentes React | `PascalCase`, describe la forma no el dato | `BarrasHorizontales` |
| Archivos de componente | igual que el componente + `.jsx` | `BarrasHorizontales.jsx` |
| Archivos de `lib/` | `kebab-case` o una palabra, `.js` | `kpis.js`, `normalizar.js` |
| Constantes de módulo | `SCREAMING_SNAKE_CASE` | `VOCABULARIO`, `SEGUNDOS_CACHE` |
| Rutas y slugs | `kebab-case` | `app/dashboards/encuesta-lavaderos/` |
| Claves de salida de la API | `camelCase`, del negocio | `gestionManualONula` |

**Nunca abreviar** salvo que la abreviatura sea el término del dominio: `kpis` sí,
`cfg`, `res2`, `tmp` no. `res` para un `Response` de `fetch` es aceptado porque es
idiomático.

## 3. Comentarios

La regla es: **el código dice qué hace, el comentario dice por qué**. Un
comentario que parafrasea la línea siguiente es ruido y se borra.

```js
// MAL: repite el código
// filtra las respuestas por registro
const datos = encuestas.filter((r) => r.registro === registro);

// BIEN: explica una decisión que el código no puede expresar
// Las tres escalas de frecuencia admiten los seis niveles completos, no solo los
// que aparecen en las 40 respuestas actuales: una respuesta nueva puede traer un
// nivel todavia no observado y no seria un error.
const FRECUENCIA = [...];
```

### Cuándo un comentario es obligatorio

1. **Encabezado de módulo.** Todo archivo de `lib/` arranca con un bloque de 2 a 6
   líneas: qué resuelve y qué decisión no obvia toma. Mirá `lib/encuestas.js`.
2. **Toda función exportada** que no sea trivial: qué recibe, qué devuelve y qué
   pasa cuando algo falla.
3. **Cualquier constante que sea un contrato con el afuera.** `VOCABULARIO`,
   `PATRONES_PREGUNTA` y `ALIAS` existen porque una fuente externa escribe así;
   eso hay que dejarlo escrito.
4. **Todo workaround.** Si hay código que existe por un bug de una librería o una
   rareza de una fuente de datos, se explica y se linkea. Ejemplo real en
   `lib/encuestas.js`: el chequeo de `startsWith("<")` está porque Google devuelve
   HTML con status 200 cuando la planilla no está publicada.

### Cuándo no

- Para marcar secciones (`// ---- helpers ----`) si el archivo es corto.
- Para explicar sintaxis del lenguaje.
- Código comentado. Se borra: para eso está git.

## 4. Firma de autor en decisiones de lógica

Cuando cambiás **qué significa un número**, dejás firma. Esto no es para repartir
culpas: es para que en seis meses se pueda reconstruir por qué un KPI mide lo que
mide, sin arqueología de git.

### Formato

```js
// @decision 2026-08-27 ramiro@mispichos.com
// "Excel/Sheets" cuenta como gestion manual porque la planilla no da trazabilidad
// ni estado en tiempo real, que es lo que el KPI quiere medir. Decidido con el
// equipo del seminario el 2026-08-26.
const manualONulo = registro["Papel/pizarra"] + registro["Excel/Sheets"] + ...;
```

Tres partes, siempre:

1. `@decision <YYYY-MM-DD> <tu-email>` — greppable con
   `grep -rn "@decision" lib app`.
2. **Qué se decidió**, en una frase.
3. **Por qué**, con la alternativa que se descartó si hubo discusión.

### Cuándo corresponde

| Cambio | ¿Firma? |
|--------|---------|
| Un umbral o un corte (`>= 3 dias` pasa a `>= 2 dias`) | **Sí** |
| Qué valores entran en un agrupamiento (`Excel/Sheets` cuenta como manual) | **Sí** |
| La fórmula de un KPI (promedio pasa a mediana) | **Sí** |
| Agregar o quitar un valor del `VOCABULARIO` | **Sí** |
| Cambiar el denominador de un porcentaje | **Sí** |
| Renombrar una variable | No |
| Extraer una función, mover código | No |
| Agregar un gráfico que muestra datos que ya se calculaban | No |
| Cambiar un color, un texto, el layout | No |

**La misma explicación va en la descripción del PR.** El comentario es para quien
lee el código; el PR es para quien revisa el cambio.

## 5. Bad smells: la lista concreta

Estos son los que aplican a este repo. Si tu cambio introduce uno, no pasa
revisión.

### 5.1 Lógica de negocio duplicada

El caso vivo es `lib/kpis.js` vs. el `useMemo` de `app/page.jsx`
([deuda conocida](arquitectura.md#1-el-cálculo-de-kpis-está-duplicado)). **No
agregues duplicaciones nuevas.** Si necesitás el mismo cálculo en dos lugares,
extraelo a una función pura en `lib/` y llamala desde los dos.

### 5.2 Strings del dominio sueltos

Un valor como `"Papel/pizarra"` escrito a mano en tres archivos es una bomba de
tiempo: el día que cambie, uno se va a quedar viejo y **el KPI va a contar 0 sin
tirar ningún error**. Los valores canónicos viven en `VOCABULARIO`, exportado
desde `lib/normalizar.js`. Si un componente necesita la lista, importala:

```js
import { VOCABULARIO } from "@/lib/normalizar";
const FILTROS_REGISTRO = ["Todos", ...VOCABULARIO.registro];
```

El caso vivo es `app/page.jsx`, que todavía repite el vocabulario en
`FILTROS_REGISTRO` y `ORDEN_FRECUENCIA`. **No agregues copias nuevas.**

### 5.3 Fallar en silencio

**La regla más importante del repo.** Un dato que no se entiende nunca se ignora
calladamente: se rechaza y se reporta.

```js
// MAL: la fila entra con un campo undefined y el KPI cuenta mal
if (!VALIDOS.includes(valor)) return;

// BIEN: la fila no entra, y queda registro de por qué
if (!VALIDOS.includes(valor)) {
  problemas.push({ fila, campo, valor, motivo: "valor no reconocido" });
  return;
}
```

Todo lo rechazado tiene que llegar a `/api/salud`. Un dashboard que muestra un
número equivocado es peor que uno que muestra un error.

### 5.4 Números y colores mágicos

Los colores salen de los tokens de `app/globals.css`. Los umbrales de negocio son
constantes con nombre, arriba del archivo, no literales enterrados en un `filter`.

### 5.5 Funciones que hacen dos cosas

Si el nombre necesita un "y" (`leerYValidar`), son dos funciones. `lib/csv.js`
parsea y **no** valida; `lib/normalizar.js` valida y **no** lee. Esa separación es
la que permite testear el parser con 7 casos raros sin tocar la encuesta.

### 5.6 Lógica en la capa de API

Un `route.js` que filtra, agrupa o promedia está haciendo el trabajo del dominio.
Lee parámetros, llama a `lib/`, serializa. Nada más.

### 5.7 Dependencias nuevas sin justificar

Hoy son cuatro: `next`, `react`, `react-dom`, `recharts`. Agregar una se discute
en el PR: qué problema resuelve, cuánto pesa, y por qué no alcanza con 40 líneas
propias. `lib/csv.js` es un parser hecho a mano justamente por esto.

### 5.8 `useEffect` para derivar estado

Si un valor se calcula a partir de otros, va en `useMemo`, no en un `useEffect`
que hace `setState`. `useEffect` es solo para efectos de verdad: pedir datos,
suscribirse, tocar el DOM.

## 6. Datos y validación

- **Una sola puerta de entrada.** Todo dato externo pasa por un loader en `lib/`
  que devuelve `{ datos, fuente, motivo, problemas, filasRechazadas,
  columnasIgnoradas }`. Ningún componente ni `route.js` lee una fuente externa por
  su cuenta.
- **Siempre con respaldo.** Un dashboard que no puede leer su fuente muestra el
  último dato conocido y dice que lo está haciendo. Nunca una pantalla en blanco.
- **El diagnóstico se expone.** Si hubo fallback o filas rechazadas, tiene que
  verse en `/api/salud`.
- **Nunca loguear ni devolver credenciales ni URLs con token.** `/api/salud`
  informa `csvConfigurado: true/false`, jamás la URL.

## 7. Git

- **Nunca commitear a `main` directamente.** Rama por cambio:
  `feat/kpi-tiempo-de-espera`, `fix/normalizar-acentos`, `docs/guia-kpis`.
- **Commits en imperativo y en español**, una línea de 72 caracteres o menos:
  `Agregar KPI de uso de sistema de gestión`.
- **Un commit, un cambio.** Si el mensaje necesita un "y", son dos commits.
- **El PR describe el porqué**, no el qué. El diff ya dice qué cambió.
- **Checklist obligatorio en el PR:** el de
  [agregar-kpis-y-graficos.md](agregar-kpis-y-graficos.md#checklist-antes-de-dar-por-terminado).
- **`.env.local` no se commitea nunca.** Si agregás una variable, va a
  `.env.example` con un valor de ejemplo y un comentario.
- **`AGENTS.md` lo comparte `next dev` con nosotros.** Next mantiene solo el
  bloque entre `<!-- BEGIN:nextjs-agent-rules -->` y `<!-- END:... -->` y preserva
  todo lo que está afuera, que es donde viven nuestras reglas. Si el bloque
  aparece modificado sin que lo tocaras, commiteá el cambio con tu trabajo:
  borrarlo del diff solo lo vuelve a crear.
  `CLAUDE.md` es una sola línea (`@AGENTS.md`) y **no tiene marcadores**: Next lo
  deja intacto mientras `AGENTS.md` hospede el bloque.

## 8. Antes de abrir el PR

```bash
npm test          # tests de lib/csv.js y lib/normalizar.js
npm run build     # sin errores ni warnings nuevos
```

Más el checklist de
[agregar-kpis-y-graficos.md](agregar-kpis-y-graficos.md#checklist-antes-de-dar-por-terminado).

> **Sobre tests:** hoy hay suite solo para las dos piezas puras
> (`lib/csv.js` y `lib/normalizar.js`), en `test/normalizar.test.mjs`, sin
> framework. **Si tocás alguna de esas dos, agregá el caso al test.** Para el
> resto la verificación es manual y está en las recetas; cuando algo se vuelva
> puro y testeable, sumale tests en vez de solo verificar a mano.
>
> Cuando arregles un bug de estas dos piezas, dejá el test que lo cubre marcado
> con `REGRESION` y la fecha, como los que ya están.

## 9. Para agentes de IA

Si estás leyendo esto como asistente, además de todo lo anterior:

1. **Leé los archivos antes de editarlos.** Este repo tiene convenciones propias
   que no se deducen del nombre de las cosas.
2. **No inventes estructura.** Si una receta de
   [agregar-kpis-y-graficos.md](agregar-kpis-y-graficos.md) cubre lo que te
   pidieron, seguila al pie de la letra en vez de proponer un diseño nuevo.
3. **Respetá el alcance.** Si de paso ves un bad smell que no es parte del pedido,
   mencionalo y no lo arregles sin permiso. La deuda conocida está listada en
   [arquitectura.md](arquitectura.md#deuda-conocida) a propósito.
4. **Verificá de verdad.** Corré los comandos de las recetas y mirá la salida. No
   declares que algo funciona porque compiló.
5. **Si un KPI cambia de significado, dejá la firma `@decision`** con el email de
   quien te lo pidió, no con el tuyo.
6. **Nunca inventes datos.** Si la planilla no tiene un campo, no lo simules:
   decilo.
