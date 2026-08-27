# LavApp · backoffice

Backoffice y API de backoffice del proyecto LavApp. Contiene dashboards de KPIs y
los Route Handlers que los alimentan. Next.js 16 (App Router), JavaScript puro sin
TypeScript, Recharts para gráficos, sin librería de estado ni de CSS.

## Leé esto antes de escribir código

| Documento | Para qué |
|-----------|----------|
| [docs/arquitectura.md](docs/arquitectura.md) | Las 4 capas, la regla de dependencia, dónde va cada archivo, cómo se agrega un dashboard. |
| [docs/agregar-kpis-y-graficos.md](docs/agregar-kpis-y-graficos.md) | El procedimiento paso a paso. **Si te piden un KPI o un gráfico, seguí la receta que corresponde.** |
| [docs/convenciones.md](docs/convenciones.md) | Nombres, comentarios, bad smells, firma `@decision`, git. |
| [README.md](README.md) | Cómo ejecutarlo, la fuente de datos en vivo, problemas conocidos. |

## Invariantes del repo

Romper cualquiera de estos es un error, no una decisión de diseño:

1. **Los datos entran por un solo lugar.** Todo pasa por `lib/encuestas.js`.
   Ningún componente ni `route.js` lee una fuente externa por su cuenta.
2. **Los `route.js` no calculan.** Leen parámetros, llaman a `lib/`, serializan.
3. **`lib/kpis.js` es puro.** Sin `fetch`, sin React, sin `process.env`.
4. **Nada falla en silencio.** Un dato que no se entiende se rechaza y se reporta
   en `/api/salud`. Nunca se ignora calladamente.
5. **Los valores del dominio viven en `VOCABULARIO`** (exportado desde
   `lib/normalizar.js`), no sueltos por el código. Ojo: `app/page.jsx` todavía
   repite parte del vocabulario en `FILTROS_REGISTRO` y `ORDEN_FRECUENCIA`. Es
   deuda: no agregues copias nuevas, importá `VOCABULARIO`.
6. **El dashboard filtra sobre `datos`, no sobre `respuestas`.** Usar
   `respuestas` hace que el gráfico ignore el filtro activo.

## Deuda conocida: no la arregles sin permiso

`lib/kpis.js` y el `useMemo` de `app/page.jsx` **duplican el cálculo de los
KPIs**. Está documentado en
[docs/arquitectura.md](docs/arquitectura.md#deuda-conocida). Consecuencia
práctica: **si tocás un KPI, tenés que editar los dos archivos.**

## Verificación mínima antes de decir que terminaste

Sin server:

```bash
npm test          # obligatorio si tocaste lib/csv.js o lib/normalizar.js
npm run build
```

Con server (`npm run dev` bloquea la terminal: dejalo en una y usá otra):

```bash
curl -s localhost:3000/api/salud | python3 -m json.tool
```

Con la planilla configurada tiene que decir `fuente: "planilla"`, `motivo: null` y
`filasRechazadas: 0`. Si dice `fuente: "respaldo"`, la planilla no se leyó y el
resto del diagnóstico no significa nada.

Y mirar el dashboard en el navegador: que el gráfico tenga **barras dibujadas**,
no solo ejes, y que los números cambien al usar los chips de filtro.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
