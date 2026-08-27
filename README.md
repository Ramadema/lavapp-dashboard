# LavApp · Dashboard de encuesta

Dashboard de KPIs sobre la encuesta a 40 lavaderos de autos (gestión operativa), desarrollado para el Seminario de Integración Profesional.

## Arquitectura

Aplicación Next.js (App Router) desplegada en Vercel. El front y la API son el
mismo proyecto y salen del mismo dominio, pero la separación cliente ↔ API REST
se mantiene: el dashboard consume los endpoints por `fetch`, no accede al dato
directo.

- **`/app`** — el dashboard (`page.jsx`, componente de cliente) y los Route Handlers bajo `/app/api`, que exponen la API REST.
- **`/lib`** — lógica de negocio del lado del servidor: `kpis.js` calcula los indicadores, `encuestas.js` es la fuente de datos.
- **`/components`** — tarjetas de KPI y gráficos (Recharts).
- **`/data`** — `encuestas.json`, las 40 respuestas de la encuesta.

```
Navegador ──fetch /api/*──▶ Route Handlers ──▶ lib/kpis.js ──▶ data/encuestas.json
   (React + Recharts)         (Node, en Vercel)
```

## Requisitos

| Herramienta | Versión | Verificar con |
|-------------|---------|---------------|
| Node.js | 20 o superior | `node -v` |
| npm | la que viene con Node (probado con 11.13) | `npm -v` |

No hace falta base de datos, Docker ni variables de entorno: los datos viven en
`data/encuestas.json` y se leen desde el servidor.

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
| GET | `/api/salud` | Health check |

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

Reemplazar `data/encuestas.json` respetando el mismo esquema de campos. Los KPIs y gráficos se recalculan automáticamente.
