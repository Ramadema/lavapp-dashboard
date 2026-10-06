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

1. **Cada fuente entra por un solo lugar.** La encuesta por `lib/encuestas.js`,
   Shortcut por `lib/shortcut.js`. Ningún componente ni `route.js` lee una fuente
   externa por su cuenta.
2. **Los `route.js` no calculan.** Leen parámetros, llaman a `lib/`, serializan.
3. **Los módulos de `lib/kpis/` son puros.** Sin `fetch`, sin React, sin `process.env`.
4. **Nada falla en silencio.** Un dato que no se entiende se rechaza y se reporta:
   los de la encuesta en `/api/salud`, los de Shortcut en `problemas` de
   `/api/performance`. Nunca se ignora calladamente.
5. **Los valores del dominio viven en `VOCABULARIO`** (exportado desde
   `lib/normalizar.js`), no sueltos por el código. Ojo:
   `app/dashboards/encuesta-lavaderos/page.jsx` todavía repite parte del
   vocabulario en `FILTROS_REGISTRO` y `ORDEN_FRECUENCIA`. Es deuda: no agregues
   copias nuevas, importá `VOCABULARIO`.
   Lo mismo para las secciones del backoffice: viven en `lib/secciones.js` y no
   se escriben a mano en un `.jsx`.
6. **El dashboard filtra sobre `datos`, no sobre `respuestas`.** Usar
   `respuestas` hace que el gráfico ignore el filtro activo.
7. **El acceso entra por un solo lugar.** `proxy.js` decide qué pedido pasa y
   `lib/auth.js` es el único que lee las contraseñas y el secreto
   (`BACKOFFICE_*`). Qué ve cada rol vive en `lib/auth/permisos.js`. Ningún
   `route.js` ni componente valida la sesión por su cuenta, y una contraseña o
   un token no se loguea ni se devuelve nunca.

## Deuda conocida: no la arregles sin permiso

`lib/kpis/encuesta.js` y el `useMemo` de `app/dashboards/encuesta-lavaderos/page.jsx`
**duplican el cálculo de los KPIs**. Está documentado en
[docs/arquitectura.md](docs/arquitectura.md#deuda-conocida). Consecuencia
práctica: **si tocás un KPI, tenés que editar los dos archivos.**

## Verificación mínima antes de decir que terminaste

Sin server:

```bash
npm test          # obligatorio si tocaste lib/csv.js, lib/normalizar.js, lib/kpis/performance.js o lib/auth/*
npm run build
```

Con server (`npm run dev` bloquea la terminal: dejalo en una y usá otra). La API
pide sesión, así que el primer `curl` es el login, que guarda la cookie:

```bash
curl -s -c /tmp/sesion.txt -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"usuario":"admin","contrasena":"<BACKOFFICE_ADMIN_PASSWORD>"}'
curl -s -b /tmp/sesion.txt localhost:3000/api/salud | python3 -m json.tool
curl -s -b /tmp/sesion.txt localhost:3000/api/performance | python3 -m json.tool
```

Sin cookie, cualquier endpoint responde `401`. Con la cookie de `visitors`, los
que no son `/api/performance*` responden `403`.

Con la planilla configurada tiene que decir `fuente: "planilla"`, `motivo: null` y
`filasRechazadas: 0`. Si dice `fuente: "respaldo"`, la planilla no se leyó y el
resto del diagnóstico no significa nada.

Con `SHORTCUT_API_TOKEN` configurado, `/api/performance` responde 200 con
`problemas: []`. Un 501 es que falta el token; un 502 trae en `motivo` lo que
contestó Shortcut.

Y mirar el backoffice en el navegador:

- Sin sesión, `/` redirige a `/login`. Con `visitors`, la barra lateral muestra
  solo Performance, `/dashboards/estado` redirige a Performance y "Salir" vuelve
  al login. Con `admin` se ve todo.
- `/` lista las secciones y ninguna queda sin tarjeta.
- `/dashboards/encuesta-lavaderos`: el gráfico tiene **barras dibujadas**, no solo
  ejes, y los números cambian al usar los chips de filtro. Ojo al sacar
  conclusiones de un screenshot inmediato: Recharts anima las barras desde cero,
  así que una captura apurada las muestra cortas y parece un bug que no está.
- Una sección sin fuente (`/dashboards/operacion`) muestra el contrato y **ningún
  número**.
- `/dashboards/performance` muestra el sprint en curso, cambia al elegir otro en el
  selector y "Actualizar" cambia la hora de "Datos de Shortcut del…".

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
