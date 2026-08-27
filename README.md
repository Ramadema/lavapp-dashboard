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

- Node.js 20 o superior
- npm

## Cómo ejecutarlo

```bash
npm install
npm run dev
```

Abrir **http://localhost:3000**. Un solo proceso levanta el dashboard y la API;
no hace falta un segundo servidor ni configurar proxies.

Para probar el build de producción en local:

```bash
npm run build && npm start
```

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
