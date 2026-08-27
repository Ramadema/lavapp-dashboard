# LavApp · Dashboard de encuesta

Dashboard de KPIs sobre la encuesta a 40 lavaderos de autos (gestión operativa), desarrollado para el Seminario de Integración Profesional.

## Arquitectura

Aplicación Next.js (App Router) desplegada en Vercel. El front y la API son el
mismo proyecto y salen del mismo dominio, pero la separación cliente ↔ API REST
se mantiene: el dashboard consume los endpoints por `fetch`, no accede al dato
directo.

- **`/app`** — el dashboard (`page.jsx`, componente de cliente) y los Route Handlers bajo `/app/api`, que exponen la API REST.
- **`/lib`** — lógica del lado del servidor: `encuestas.js` resuelve la fuente de datos, `csv.js` parsea el CSV, `normalizar.js` valida y traduce los valores, `kpis.js` calcula los indicadores.
- **`/components`** — tarjetas de KPI y gráficos (Recharts).
- **`/data`** — `encuestas.json`, las 40 respuestas originales, que además funcionan como respaldo.

```
                                    ┌─▶ planilla de Google (CSV, cache 60 s)
Navegador ──fetch /api/*──▶ lib/encuestas.js ─┤
   (React + Recharts)       (Node, en Vercel) └─▶ data/encuestas.json (respaldo)
                                     │
                                     ▼
                          lib/normalizar.js ──▶ lib/kpis.js
```

La fuente de datos es un único punto de cambio: `lib/encuestas.js` devuelve
siempre un array de respuestas con el mismo esquema, así que ni los Route
Handlers ni el dashboard saben de dónde salió el dato.

## Requisitos

| Herramienta | Versión | Verificar con |
|-------------|---------|---------------|
| Node.js | 20 o superior | `node -v` |
| npm | la que viene con Node (probado con 11.13) | `npm -v` |

No hace falta base de datos ni Docker. Tampoco variables de entorno para
arrancar: sin configurar nada, la app usa las 40 respuestas de
`data/encuestas.json`. Para conectar una planilla de Google y tener datos en
vivo, ver [Datos en vivo desde Google Sheets](#datos-en-vivo-desde-google-sheets).

## Cómo ejecutarlo paso a paso

### 1. Clonar el repositorio

```bash
git clone https://github.com/Ramadema/lavapp-dashboard.git
cd lavapp-dashboard
```

### 2. Instalar las dependencias

```bash
npm install
```

Instala Next.js 16, React 19 y Recharts. Descarga además el binario nativo de
SWC (~85 MB) que corresponde a tu sistema operativo; si eso falla, ver
[Problemas conocidos](#problemas-conocidos).

### 3. Levantar el servidor de desarrollo

```bash
npm run dev
```

Salida esperada:

```
▲ Next.js 16.3.3 (Turbopack)
- Local:        http://localhost:3000
✓ Ready in 259ms
```

### 4. Abrir el dashboard

Ir a **http://localhost:3000**.

Un solo proceso sirve el dashboard y la API: no hace falta un segundo servidor
ni configurar proxies. La página arranca mostrando *"Cargando encuesta…"*
mientras hace el `fetch` a `/api/kpis`, y después dibuja las 8 tarjetas de KPI y
los 4 gráficos.

Para comprobar que el filtrado funciona, hacer clic en el chip
**Papel/pizarra**: el KPI "Respuestas en el segmento" pasa de 40 a 14 y
"Gestión manual o nula" sube a 100 %.

### 5. Verificar la API (opcional)

```bash
curl http://localhost:3000/api/salud
# {"ok":true}

curl http://localhost:3000/api/kpis
# {"n":40,"gestionManualONula":{"valor":32,"pct":80},...

curl "http://localhost:3000/api/kpis?registro=Papel/pizarra"
# {"n":14,"gestionManualONula":{"valor":14,"pct":100},...
```

### 6. Detener el servidor

`Ctrl+C` en la terminal donde está corriendo. Si quedó en segundo plano:

```bash
lsof -ti:3000 -sTCP:LISTEN | xargs kill
```

## Probar el build de producción en local

Reproduce lo que corre en Vercel:

```bash
npm run build
npm start
```

El build tiene que terminar con esta tabla de rutas:

```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/kpis
├ ƒ /api/respuestas
├ ƒ /api/salud
└ ○ /icon.svg

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Las tres rutas de API tienen que aparecer como dinámicas (`ƒ`): en Vercel se
convierten en serverless functions. Si alguna sale como estática (`○`), quedó
resuelta en tiempo de build y devolvería siempre los mismos datos, ignorando el
parámetro `?registro=`.

## Datos en vivo desde Google Sheets

Por defecto la app lee `data/encuestas.json`, que viaja dentro del bundle: para
cambiar los datos hay que redeployar. Para que el dashboard tome los datos de una
planilla y se actualice sin redeploy, se configura `ENCUESTAS_CSV_URL`.

### 1. Subir el Excel a Google Sheets

Subir el `.xlsx` a Google Drive y abrirlo con Google Sheets (si sigue siendo un
archivo de Excel: **Archivo › Guardar como Hoja de cálculo de Google**).

### 2. La planilla se lee tal como la exporta el formulario

No hace falta reacomodar nada. La capa de normalización maneja lo que trae el
export real:

- **Cabecera en la fila 2.** El export de Excel mete una primera fila de relleno
  (`Columna1`, `Columna2`, …) y deja las preguntas en la segunda. `detectarCabecera`
  prueba las primeras filas y se queda con la que reconoce más campos.
- **Cabeceras con el texto completo de la pregunta.** Cada campo se identifica por
  un fragmento distintivo de su pregunta (`PATRONES_PREGUNTA` en
  `lib/normalizar.js`). También se aceptan los nombres de campo directos
  (`mayorDificultad`, `Mayor dificultad`, `MAYOR_DIFICULTAD` son equivalentes).
- **Etiquetas largas de las opciones.** `"Papel, cuaderno o pizarra"` se traduce a
  `"Papel/pizarra"`, `"Registrar los vehículos y servicios realizados"` a
  `"Registrar vehiculos"`, y así con el resto (`ALIAS` en `lib/normalizar.js`).
- **Acentos y espacios.** `"Más de 50"`, `"Papel / pizarra"` y `"3-4 días/sem"`
  entran sin problema.
- **Columnas de más.** La `Marca temporal` se ignora y se reporta en `/api/salud`.
- **La columna `id` es opcional**: si no está, se numera por orden de fila.

Vocabulario canónico por campo, que es lo que finalmente ve `lib/kpis.js`:

| Columna | Valores canónicos |
|---------|-------------------|
| `frecuenciaAltaDemanda` | `1-2 dias/sem`, `3-4 dias/sem`, `Todos los dias` |
| `volumenPico` | `Menos de 10`, `Entre 10 y 20`, `Entre 20 y 50`, `Mas de 50` |
| `registro` | `Papel/pizarra`, `Excel/Sheets`, `Sistema de gestion`, `Sin registro` |
| `criterioOrden` | `Orden de llegada`, `Turnos/reservas`, `Tipo de servicio` |
| `dificultadOrden` | entero de 1 a 5 |
| `consultasTiempo` | `Nunca`, `Casi nunca`, `A veces`, `Frecuentemente`, `Casi siempre`, `Siempre` |
| `desvioEstimacion` | ídem escala de frecuencia |
| `abandonoCliente` | ídem escala de frecuencia |
| `dificultadEstimar` | entero de 1 a 5 |
| `mayorDificultad` | `Registrar vehiculos`, `Organizar el orden`, `Estimar tiempos`, `Informar al cliente`, `Coordinar empleados`, `Administrar turnos`, `Ninguna` |

### 3. Obtener la URL del CSV

Si la planilla ya está compartida como **"cualquiera con el enlace puede ver"**,
alcanza con la URL de export, que se arma con el ID y el `gid` que ya están en la
URL de edición:

```
https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>
```

Es decir, de esto:

```
https://docs.google.com/spreadsheets/d/1AbC.../edit?gid=1958604005#gid=1958604005
```

sale esto:

```
https://docs.google.com/spreadsheets/d/1AbC.../export?format=csv&gid=1958604005
```

La alternativa, más estable para acceso programático, es
**Archivo › Compartir › Publicar en la web** con formato CSV, que devuelve una URL
del tipo `.../spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv`.

> **Ojo con la privacidad:** cualquiera de las dos vías deja las respuestas crudas
> legibles por quien tenga la URL. Para datos de encuesta anonimizados suele estar
> bien, pero conviene tenerlo presente. Si la planilla tiene que seguir privada, el
> camino es la API de Google Sheets con una cuenta de servicio, que ya necesita
> credenciales.

### 4. Configurar la variable

En local:

```bash
cp .env.example .env.local
# editar .env.local y pegar la URL
npm run dev
```

En Vercel: **Project Settings › Environment Variables**, agregar
`ENCUESTAS_CSV_URL` con la URL, y redeployar una vez para que la tome.

### 5. Verificar de dónde están saliendo los datos

`/api/salud` dice qué fuente se usó y qué se rechazó:

```bash
curl http://localhost:3000/api/salud
```

```json
{
  "ok": true,
  "fuente": "planilla",
  "motivo": null,
  "filas": 40,
  "csvConfigurado": true,
  "filasRechazadas": 0,
  "problemas": [],
  "columnasIgnoradas": ["Marca temporal"]
}
```

- **`fuente`** — `"planilla"` si leyó el CSV, `"respaldo"` si cayó a
  `data/encuestas.json`.
- **`motivo`** — por qué cayó al respaldo, cuando corresponde.
- **`filasRechazadas`** y **`problemas`** — filas que no pasaron la validación,
  con número de fila, campo, valor recibido y motivo. Las filas válidas se sirven
  igual: una celda mal tipeada no tira abajo todo el dashboard.

### Cómo se comporta el cache

La lectura del CSV se cachea 60 segundos con `revalidate`, con semántica
*stale-while-revalidate*: la primera request después de que expira el cache
todavía devuelve el dato viejo y dispara la actualización en segundo plano; la
siguiente ya trae el dato nuevo. En la práctica un cambio en la planilla aparece
en el dashboard en poco más de un minuto.

A eso se le suma el cache propio de Google sobre las hojas publicadas, que puede
demorar algunos minutos más. Si necesitás ver un cambio al instante para una
demo, conviene editar la planilla unos minutos antes.

### Si la planilla falla, el dashboard no se cae

Ante URL mal puesta, planilla despublicada, error de red o una planilla donde
ninguna fila es válida, `lib/encuestas.js` cae a `data/encuestas.json` y deja el
motivo en `/api/salud`. El dashboard nunca queda en blanco, y el fallback nunca
pasa desapercibido.

## Problemas conocidos

### macOS Apple Silicon: "Turbopack is not supported on this platform"

```
⚠ Attempted to load @next/swc-darwin-arm64, but an error occurred: ...
Error: Turbopack is not supported on this platform (darwin/arm64)
because native bindings are not available.
```

El binario nativo de SWC no quedó instalado: el directorio
`node_modules/@next/swc-darwin-arm64/` existe pero le falta el archivo
`next-swc.darwin-arm64.node` (~85 MB). Next cae al fallback WASM, que no alcanza
para Turbopack.

Volver a correr `npm install` a secas **no** lo arregla, porque npm considera el
paquete ya instalado. Hay que borrar el directorio primero:

```bash
rm -rf node_modules/@next/swc-darwin-arm64
npm install
```

Y verificar que el binario cargue:

```bash
node -e "require('./node_modules/@next/swc-darwin-arm64/next-swc.darwin-arm64.node'); console.log('OK')"
```

Si el problema persiste, Next sugiere evitar Turbopack con
`npm run dev -- --webpack`, a costa de un arranque más lento.

### El puerto 3000 está ocupado

```bash
npm run dev -- -p 3001
```

### Los gráficos salen vacíos en capturas con un browser headless

No es un bug de la aplicación. Recharts anima las barras desde ancho 0, y
`ResponsiveContainer` reinicia la animación cada vez que cambia el tamaño del
viewport. Si la captura se toma en el frame inicial —o con
`--virtual-time-budget`, que no deja avanzar el `requestAnimationFrame`— se ven
los ejes y las leyendas pero ninguna barra. Hay que esperar unos segundos de
tiempo real después de fijar el viewport.

## Deploy

Está en Vercel, que detecta Next.js sin configuración: no hay `vercel.json` ni
build custom. Cada push publica una preview y `main` va a producción.

```bash
vercel --prod    # deploy manual desde la terminal
```

## Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/respuestas` | Las 40 respuestas de la encuesta en JSON |
| GET | `/api/kpis` | KPIs agregados calculados en el servidor |
| GET | `/api/kpis?registro=Papel/pizarra` | KPIs del segmento filtrado por método de registro |
| GET | `/api/salud` | Health check y estado de la fuente de datos (ver [Datos en vivo](#datos-en-vivo-desde-google-sheets)) |

El dashboard consume **`/api/respuestas`** y calcula los KPIs en el cliente para
que el filtro por método de registro no pegue al servidor en cada clic.
`/api/kpis` expone el mismo cálculo hecho del lado del servidor, para consumo
externo.

## KPIs incluidos

- % de gestión manual o nula (papel, planilla o sin registro) — brecha de digitalización
- % que pierde clientes por la espera al menos "a veces" (y % "casi siempre") — impacto en el negocio
- % de estimaciones de tiempo que se desvían — problema de predicción
- % con alta demanda 3+ días/semana y picos de 20+ vehículos — dimensión del segmento objetivo
- % de consultas frecuentes de tiempo de espera — fricción con el cliente
- Promedios Likert (1–5) de dificultad para mantener el orden y estimar tiempos
- Distribuciones: método de registro, principal dificultad declarada, criterio de orden

## Nota metodológica

Muestreo no probabilístico (n = 40, agosto 2026). Los porcentajes describen la muestra y no son generalizables al mercado. Las escalas de frecuencia no son idénticas entre todas las preguntas del instrumento original; se conservaron tal cual para no distorsionar los datos.

## Cómo actualizar los datos

**Con la planilla conectada** (`ENCUESTAS_CSV_URL` configurada): editar la hoja de
Google. El dashboard toma el cambio en poco más de un minuto, sin redeploy. Ver
[Datos en vivo desde Google Sheets](#datos-en-vivo-desde-google-sheets).

**Sin planilla:** reemplazar `data/encuestas.json` respetando el mismo esquema de
campos, y hacer commit y push. Los KPIs y gráficos se recalculan solos, pero hace
falta el redeploy porque el JSON se resuelve en tiempo de build.

Si aparece un valor nuevo en alguna pregunta (por ejemplo una opción de
`mayorDificultad` que antes no existía), hay que agregarlo al `VOCABULARIO` de
`lib/normalizar.js`. Hasta que se agregue, esas filas se rechazan y aparecen en
`/api/salud`, no se cuentan mal en silencio.
