# Arquitectura y estructura del repo

> **Para qué sirve este documento:** entender dónde va cada cosa antes de
> escribir código. Si vas a agregar un KPI o un gráfico, leé después
> [agregar-kpis-y-graficos.md](agregar-kpis-y-graficos.md). Si vas a tocar
> código, leé también [convenciones.md](convenciones.md).

## Qué es este repo

Backoffice y API de backoffice del proyecto LavApp. La app principal es otra
cosa y vive en otro lado; acá se concentran:

1. **Dashboards de KPIs** — mediciones que el equipo necesita ver, organizados
   en secciones bajo `app/dashboards/`. Todas tienen fuente: la encuesta a
   lavaderos (una planilla), Performance (el avance del sprint desde Shortcut),
   las cuatro de Gestión (la API de backoffice de la app de gestión de LavApp) y
   el estado del sistema.
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
│                   "use client" · pide datos por fetch       │
├─────────────────────────────────────────────────────────────┤
│ 3. API            app/api/**/route.js                       │
│                   traduce HTTP ↔ dominio. Sin lógica propia.│
├─────────────────────────────────────────────────────────────┤
│ 2. DOMINIO        lib/kpis/encuesta.js                      │
│                   lib/kpis/performance.js                   │
│                   lib/kpis/{operacion,lavaderos,clientes,   │
│                     facturacion}.js · lib/kpis/tiempo.js    │
│                   cálculo de indicadores. Funciones puras.  │
├─────────────────────────────────────────────────────────────┤
│ 1. DATOS          una sola puerta de entrada por fuente:    │
│                   lib/encuestas.js  ← la encuesta           │
│                   lib/shortcut.js   ← Shortcut              │
│                   lib/gestion.js    ← la app de gestión     │
│                   lib/normalizar.js · lib/csv.js            │
│                   data/encuestas.json (respaldo)            │
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
- Cada fuente tiene un único loader: la encuesta `lib/encuestas.js`, Shortcut
  `lib/shortcut.js`, la app de gestión `lib/gestion.js`. Ningún otro archivo lee
  la planilla, el JSON, la API de Shortcut, la API de backoffice ni ninguna otra
  fuente futura.

## Acceso

No es una capa más: corre **antes** de todas. `proxy.js` atiende cada pedido
(salvo los assets), lee la cookie de sesión y decide: sin sesión, las pantallas
van a `/login` y la API responde `401`; con sesión de un rol que no ve esa ruta,
la pantalla redirige a lo que sí ve y la API responde `403`. Si pasa, deja
usuario y rol en dos headers internos (que antes borra del pedido entrante) y
los server components los leen con `sesionDelPedido()`. Nadie más valida la
cookie.

```
Navegador ──cookie lavapp_backoffice──▶ proxy.js
                                          │  leerSesion()        lib/auth.js  (lee BACKOFFICE_*)
                                          │  puedeVer(rol, ruta) lib/auth/permisos.js
                                          ▼
                       x-backoffice-usuario / x-backoffice-rol
                                          │
                        ┌─────────────────┴──────────────────┐
                        ▼                                    ▼
             app/layout.jsx · app/page.jsx          app/api/**/route.js
             (barra y menú según el rol)            (ya no miran la sesión)
```

| Archivo | Responsabilidad |
|---------|-----------------|
| `proxy.js` | La puerta. Rutas públicas (`/login`, `/api/auth/*`), redirecciones y `401`/`403`. Matcher: todo salvo `_next/static`, `_next/image` y el icono. |
| `lib/auth.js` | **Único lector de las contraseñas y del secreto** (`BACKOFFICE_ADMIN_PASSWORD`, `BACKOFFICE_VISITORS_PASSWORD`, `BACKOFFICE_SESSION_SECRET`). `autenticar`, `cookieDeSesion`, `cookieDeSalida`, `leerSesion`, `variablesFaltantes`. Los usuarios fijos viven en `USUARIOS`. |
| `lib/auth/permisos.js` | Puro. `ROLES`, qué secciones ve cada rol (`SLUGS_POR_ROL`, con `@decision`), `seccionesVisibles`, `gruposVisibles`, `rutaInicial`, `describirRol`, `puedeVer(rol, ruta)`. Lo leen el proxy, la barra, el menú y el login: una sola fuente de verdad. |
| `lib/auth/sesion.js` | Puro. Firma y lectura del token (HMAC-SHA256 con Web Crypto), comparación en tiempo constante y los nombres de los headers internos. Secreto y hora por parámetro. |
| `lib/auth/pedido.js` | `sesionDelPedido()`: la sesión que dejó el proxy en los headers, para `app/layout.jsx` y `app/page.jsx`. Aparte de `lib/auth.js` para que el proxy no arrastre `next/headers`. |

El detalle para el usuario (variables, Vercel, cómo entra cada rol) está en el
[README](../README.md#acceso-usuarios-y-roles).

## Flujo de datos

```
Navegador
   │  fetch /api/respuestas
   ▼
app/api/respuestas/route.js
   │  obtenerEncuestas()
   ▼
lib/encuestas.js
   │
   ├─ hay ENCUESTAS_CSV_URL y se pudo leer?
   │     SI ──▶ planilla de Google (CSV, cache 60 s)
   │              └──▶ lib/csv.js ──▶ lib/normalizar.js ──┐
   │                                   (valida y traduce)  │
   │                                                       ▼
   │                                                array canónico ──▶ lib/kpis/encuesta.js
   │                                                       ▲
   └─ NO ──▶ data/encuestas.json ─────────────────────────┘
                (respaldo: NO pasa por csv.js ni normalizar.js,
                 entra tal cual está escrito en el archivo)
```

El detalle de la fuente en vivo, el cache y el respaldo está en el
[README](../README.md#datos-en-vivo-desde-google-sheets).

La sección Performance tiene su propia fuente, con el mismo esquema:

```
Navegador
   │  fetch /api/performance[?sprint=]      (POST = botón "Actualizar")
   ▼
app/api/performance/route.js
   │  obtenerSprints() · elegirSprintPorDefecto() · obtenerSprint(id)
   │  obtenerMovidas(id, posteriores)   ← las tareas que se le sacaron al sprint
   │  (/historial: sprintsParaHistorial() · obtenerHistorialDeSprints(ids))
   ▼
lib/shortcut.js ──▶ API REST v3 de Shortcut (token en SHORTCUT_API_TOKEN)
   │                 cache de Next: 5 min sprints y stories, 15 min catálogos,
   │                 historial de cada story guardado por versión
   ▼
respuestas crudas ──▶ lib/kpis/performance.js ──▶ armarReporte() · armarHistorial()
                         resumen · compromiso · burndown · ritmo · cycle time
```

Shortcut no tiene respaldo en disco: el respaldo es el propio cache, que solo
guarda respuestas 200. El detalle está en el
[README](../README.md#performance-avance-del-sprint-desde-shortcut).

Las cuatro secciones de Gestión leen la app de gestión con el mismo esquema, una
ruta de la API de backoffice por sección:

```
Navegador
   │  fetch /api/operacion?dias=      (POST = botón "Actualizar")
   │  fetch /api/lavaderos · /api/clientes · /api/facturacion
   ▼
app/api/<seccion>/route.js
   │  obtenerOrdenes() · obtenerLavaderos() · obtenerClientes() · obtenerPlanes() + obtenerSuscripciones()
   ▼
lib/gestion.js ──▶ GET {GESTION_API_URL}/backoffice/{ordenes,lavaderos,clientes,planes,suscripciones}
   │                 header X-Backoffice-Key (GESTION_API_KEY) · cache de fetch de Next, 60 s
   ▼
filas crudas (una por entidad, con contadores) ──▶ lib/kpis/{operacion,lavaderos,clientes,facturacion}.js
                                                      armar<Seccion>(filas, { ahora, leidoEl })
                                                      totales · series · tablas · lectura · problemas
```

El backend no calcula KPIs: qué es una cuenta activa, un cliente recurrente o
el MRR se decide acá, en los módulos puros, con firma `@decision`. Si faltan
las variables, `lib/gestion/respuestas.js` contesta `501` con el contrato; si
la app de gestión falla, `502` con el motivo. El detalle está en el
[README](../README.md#gestión-las-secciones-que-leen-la-app-de-gestión).

## Mapa de archivos

### Capa de datos

| Archivo | Responsabilidad | Cuándo lo tocás |
|---------|-----------------|-----------------|
| `lib/encuestas.js` | Resuelve de dónde salen los datos: planilla o respaldo. Decide el fallback y arma el diagnóstico. | Al agregar una fuente de datos nueva. |
| `lib/csv.js` | Parser CSV (RFC 4180). No sabe nada de encuestas. **No filtra filas vacías**: el índice de cada fila tiene que seguir siendo el número de línea del archivo, porque `/api/salud` lo reporta para ir a corregir la celda. Lanza si encuentra una comilla sin cerrar. | Casi nunca. Es genérico. |
| `lib/normalizar.js` | Traduce la planilla al vocabulario canónico y valida. `CAMPOS`, `VOCABULARIO`, `ALIAS`, `PATRONES_PREGUNTA`. | Al agregar una pregunta, una opción nueva o una etiqueta nueva del formulario. |
| `data/encuestas.json` | Las 40 respuestas originales. Doble función: dato inicial y respaldo. | Ver la advertencia de abajo. |
| `lib/shortcut.js` | Único archivo que habla con la API de Shortcut. Lee `SHORTCUT_API_TOKEN`, cachea con tag `shortcut`, traduce los errores HTTP a un `motivo` legible y devuelve las respuestas crudas. Pide el historial de cada story (para saber cuándo entró al sprint) de a 5 y cacheado por versión: con el `updated_at` de la story en un header, solo se vuelve a pedir el de las que cambiaron. El token no sale nunca de acá. | Al pedir un dato nuevo a Shortcut o cambiar los tiempos de cache. |
| `lib/gestion.js` | Único archivo que habla con la API de backoffice de la app de gestión. Lee `GESTION_API_URL` y `GESTION_API_KEY`, manda la clave en `X-Backoffice-Key`, cachea 60 s con tag `gestion`, traduce los errores HTTP (y el `detail` del `problem+json` del backend) a un `motivo` legible y devuelve las filas crudas. `obtenerOrdenes`, `obtenerLavaderos`, `obtenerClientes`, `obtenerPlanes`, `obtenerSuscripciones`, `vencerCache`, `gestionConfigurada`. La clave no sale nunca de acá. | Al pedir un dato nuevo al backend o cambiar el cache. |
| `lib/gestion/respuestas.js` | `sinDatos(slug, resultado)`: la respuesta común de los cuatro `route.js` de Gestión cuando el loader no pudo leer (`501` sin variables, `502` si la app de gestión falló). | Al cambiar cómo se informa un fallo de la app de gestión. |

> **Cuidado con `data/encuestas.json`:** se importa directo en
> `lib/encuestas.js` y **no pasa por la normalización**. Si agregás un campo a
> `CAMPOS` en `lib/normalizar.js` y no lo agregás también a este JSON, cuando la
> app caiga al respaldo ese campo va a llegar `undefined` al dashboard, sin ningún
> error. Los dos esquemas se mantienen sincronizados a mano.

### Tests

| Archivo | Qué cubre |
|---------|-----------|
| `test/normalizar.test.mjs` | `lib/csv.js` y `lib/normalizar.js`. Sin framework, se corre con `npm test`. Incluye regresiones de los cuatro bugs de la revisión del 2026-08-27. |
| `test/performance.test.mjs` | `lib/kpis/performance.js`, con payloads que tienen la forma exacta de la API de Shortcut y un "ahora" fijo. También corre con `npm test`. |
| `test/auth.test.mjs` | `lib/auth/permisos.js` (qué ve y qué abre cada rol) y `lib/auth/sesion.js` (firma, token manipulado, vencido, otro secreto). Secreto y hora fijos. `lib/auth.js` no: es la unión con `process.env` y se verifica con `curl`. |
| `test/gestion.test.mjs` | `lib/kpis/tiempo.js` y los cuatro módulos de Gestión (`operacion`, `lavaderos`, `clientes`, `facturacion`), con filas que tienen la forma exacta de `GET /backoffice/*` y un "ahora" fijo: períodos, totales, minutos por orden, recurrencia, MRR, impagos y las filas rechazadas. También corre con `npm test`. |

Son las piezas puras del repo: entran datos, salen datos, sin red ni React.
Por eso son las que tienen tests, y las que más los necesitan porque cuando
fallan lo hacen en silencio.

### Capa de dominio

| Archivo | Responsabilidad |
|---------|-----------------|
| `lib/kpis/encuesta.js` | `calcularKpis(datos)` → objeto de indicadores. Funciones puras, sin efectos. |
| `lib/kpis/performance.js` | `armarReporte(respuestasDeShortcut, { ahora })` → el reporte del sprint: resumen, tareas por estado, listas, burndown (`calcularBurndown`, con la fecha de ingreso de cada tarea sacada de su historial por `fechaDeIngreso`), compromiso (`calcularCompromiso`: comprometidas, agregadas, movidas, proyección), ritmo diario (`calcularRitmo`), cycle time (`calcularCycleTime`), tiempo en el sprint (`calcularTiempoEnSprint`) y por columna (`calcularTiempoPorColumna`, del historial). `armarHistorial` arma la fila de cada sprint para `/historial`. También `elegirSprintPorDefecto`, `sprintsPosteriores`, `sprintsParaHistorial`, `ETAPAS` y `diaLocal`, que usa la pantalla. Recibe la hora por parámetro para que los tests la fijen. |
| `lib/kpis/tiempo.js` | Lo que comparten los módulos de KPIs: `ZONA_HORARIA`, `diaLocal`, `mesLocal`, `instante` (una fecha que no se entiende es `null`), `promedio`, `mediana`, `contar`, `describirLectura` y `MINUTOS_PARA_DESACTUALIZADO`. `performance.js` los reexporta. |
| `lib/kpis/operacion.js` | `armarOperacion(ordenes, { ahora, dias, leidoEl })` → el tablero de Operación: `periodo` (`periodo(dias, ahora)`, redondeado al minuto para que el cache sirva), `totales` (del período y de ahora), demora/espera/lavado promedio, `porDia`, `porLavadero`, `porServicio`, `porEstado`, `ordenes` con sus minutos y `problemas`. `ESTADOS`, `ESTADOS_ABIERTOS` y `PERIODOS` son el contrato con el backend y la pantalla. |
| `lib/kpis/lavaderos.js` | `armarLavaderos(lavaderos, { ahora, leidoEl })` → cuentas activas (`DIAS_ACTIVA`, con `@decision`), inactivas y suspendidas, altas del mes y por mes (`ultimosMeses`), por plan y por ciudad, el padrón ordenado por actividad. |
| `lib/kpis/clientes.js` | `armarClientes(clientes, { ahora, leidoEl })` → recurrentes (`DIAS_RECURRENCIA`, `LAVADOS_PARA_RECURRENTE`, con `@decision`), nuevos del mes, vehículos, lavados por cliente, `distribucionLavados` (`TRAMOS_DE_LAVADOS`), por lavadero y la lista. `desdeRecurrencia(ahora)` es la fecha de corte que se le pide al backend. |
| `lib/kpis/facturacion.js` | `armarFacturacion({ planes, suscripciones }, { ahora, leidoEl })` → MRR por planes asignados y de suscripciones, por moneda y mensualizado (`MESES_POR_PERIODICIDAD`, con `@decision`), suscripciones impagas (con `@decision`), el catálogo y la lista. |
| `lib/secciones.js` | `SECCIONES`, `GRUPOS`, `buscarSeccion`, `cuerpoSinFuente(slug, motivo)`. Declara qué secciones existen, su ruta, su endpoint y el contrato de ese endpoint. Puro: sin React, sin `fetch`, sin `process.env`. |

> `lib/secciones.js` lo leen las dos capas de arriba: la presentación para dibujar
> la navegación y el menú, y los `route.js` de las áreas sin conectar para
> serializar su contrato. Es la razón de que el nombre de una sección, su ruta y
> su contrato se escriban una sola vez. Si agregás una sección, empezá por acá.

### Capa de API

| Ruta | Archivo | Devuelve |
|------|---------|----------|
| `GET /api/respuestas` | `app/api/respuestas/route.js` | Array de respuestas normalizadas. **Es la que consume el dashboard de la encuesta.** |
| `GET /api/kpis[?registro=]` | `app/api/kpis/route.js` | KPIs calculados en el servidor. Para consumo externo. |
| `GET /api/salud` | `app/api/salud/route.js` | Health check + qué fuente se usó y qué filas se rechazaron. |
| `POST /api/auth/login` | `app/api/auth/login/route.js` | `{ usuario, rol }` + la cookie de sesión. `401` si no coinciden, `400` si falta un campo, `503` si faltan variables de acceso. |
| `POST /api/auth/logout` | `app/api/auth/logout/route.js` | `204` y la cookie borrada. |
| `GET /api/performance[?sprint=]` | `app/api/performance/route.js` | Reporte de un sprint de Shortcut (sin `?sprint=`, el que está en curso). `501` sin token, `502` si Shortcut falló, `404` si el sprint no existe. |
| `POST /api/performance[?sprint=]` | `app/api/performance/route.js` | Lo mismo leyendo de Shortcut sin cache, y vence el cache para las cargas siguientes. Es el botón "Actualizar". |
| `GET|POST /api/performance/historial` | `app/api/performance/historial/route.js` | Una fila por sprint (en curso o terminado, los últimos 8) con lo comprometido, lo cumplido, lo agregado y lo movido a otro sprint. Aparte porque lee las tareas y el historial de cada sprint. `POST` = sin cache. |
| `GET\|POST /api/operacion[?dias=7\|30\|90]` | `app/api/operacion/route.js` | Operación leída de la app de gestión (30 días sin `?dias=`). `400` con otro valor de `dias`, `501` sin `GESTION_*`, `502` si la app de gestión falló. `POST` = sin cache. |
| `GET\|POST /api/lavaderos` | `app/api/lavaderos/route.js` | El padrón de cuentas. Mismos códigos. |
| `GET\|POST /api/clientes` | `app/api/clientes/route.js` | Los clientes finales, con los lavados de los últimos 90 días. Mismos códigos. |
| `GET\|POST /api/facturacion` | `app/api/facturacion/route.js` | Planes y suscripciones (dos lecturas al backend, en paralelo). Mismos códigos. |

Todos salvo los de `/api/auth` llegan ya con sesión: el proxy corta antes con
`401` o `403`, así que ningún `route.js` mira la cookie.

**Por qué `501` y no otra cosa.** Un `404` diría "esta ruta no existe", y existe.
Un `200` con un array vacío diría "no hay datos", y es mentira: datos hay, lo que
falta es la conexión — y la pantalla no podría distinguir los dos casos, así que
mostraría ceros como si fueran una medición. `501 Not Implemented` dice lo único
cierto: la ruta está, la fuente no. Es la [regla de no fallar en
silencio](convenciones.md#53-fallar-en-silencio) aplicada a una sección entera.
Hoy pasa cuando faltan `GESTION_API_URL` o `GESTION_API_KEY`; si las variables
están pero la app de gestión no responde, es `502` con el motivo: el error es
del servicio de atrás, no de este.

### Capa de presentación

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/layout.jsx` | Layout raíz. Lee la sesión del pedido: con sesión, barra lateral con la marca, la navegación del rol y el bloque de sesión; sin sesión (solo pasa en `/login`), el contenido solo. `metadata`, importa `globals.css`. |
| `app/page.jsx` | El menú inicial: una tarjeta por sección que el rol puede abrir, agrupadas. Server component. |
| `app/login/page.jsx` | El formulario de acceso. `"use client"`. Pide a `/api/auth/login` y recarga la página entera para que el layout arme la barra; respeta `?volver=` solo si es una ruta propia que el rol puede ver. |
| `app/dashboards/encuesta-lavaderos/page.jsx` | El dashboard de la encuesta. `"use client"`. |
| `app/dashboards/estado/page.jsx` | `/api/salud` con interfaz: fuente en uso, filas rechazadas, columnas ignoradas. `"use client"`. |
| `app/dashboards/performance/page.jsx` | El avance del sprint para negocio: selector de sprint, "Actualizar", resumen, burndown en tareas o puntos, flujo acumulado, tareas por estado, avance por iniciativa, carga por responsable, cycle time y listas. Si Shortcut falla, muestra el motivo y no números. `"use client"`. |
| `app/dashboards/{operacion,lavaderos,clientes,facturacion}/page.jsx` | Las secciones de Gestión. Cada una envuelve su tablero en `SeccionRemota` y dibuja tarjetas, gráficos y tablas con lo que devuelve su endpoint; Operación suma los chips de período (7, 30, 90 días). `"use client"`. |
| `app/globals.css` | Tokens de color (`--tinta`, `--agua`, …) y todas las clases. Sin CSS-in-JS. |
| `components/Navegacion.jsx` | Barra lateral. Recibe el rol y dibuja solo lo que puede abrir (sin "Inicio" para quien ve una sola sección). `"use client"` porque marca el enlace activo con `usePathname`. |
| `components/Sesion.jsx` | Quién está adentro, qué ve y el botón "Salir". `"use client"`. |
| `components/EncabezadoSeccion.jsx` | Encabezado de página: título, subtítulo y señal de estado opcional. |
| `components/SeccionRemota.jsx` | Una sección que pide sus datos a su propio endpoint: encabezado con señal (Conectada, Sin conectar, Sin datos, Datos desactualizados), controles propios, «Actualizar» (`POST`), «Datos de … del …», el panel de carga, el de error (`501` dice qué falta, otro error dice el motivo) y el aviso de filas rechazadas. `children` recibe la respuesta y dibuja el tablero. Si «Actualizar» falla, deja lo que ya estaba con un aviso. `"use client"`. |
| `components/TarjetaKpi.jsx` | Tarjeta de un indicador numérico. |
| `components/BarrasHorizontales.jsx` | Gráfico de barras horizontales (ranking de categorías). |
| `components/BarrasAgrupadas.jsx` | Gráfico de barras verticales agrupadas (comparar series). |
| `components/Lineas.jsx` | Gráfico de líneas (evolución en el tiempo). Un `null` corta la línea: es lo que usa el burndown para los días que no pasaron. |
| `components/AreasApiladas.jsx` | Áreas apiladas (cómo se reparte un total en el tiempo). Es el flujo acumulado de Performance. |
| `components/BarrasApiladas.jsx` | Barras horizontales apiladas (total y composición por categoría). Avance por iniciativa y carga por responsable de Performance. |
| `components/Torta.jsx` | Dona para repartir un total entre 2 a 4 categorías, con el número clave en el centro. "El sprint de un vistazo" de Performance. |
| `components/Plegable.jsx` | Muestra los primeros N elementos y un botón para ver el resto. Envuelve tablas, listas y barras largas de Performance. |
| `components/BarraDeProgreso.jsx` | Avance de 0 a 100 con el porcentaje al lado, para tablas. El cumplimiento por sprint del historial. |

Los contratos de props de los componentes están en
[agregar-kpis-y-graficos.md](agregar-kpis-y-graficos.md#contratos-de-los-componentes).

## Cómo se agrega un dashboard nuevo

La estructura ya es esta:

```
app/
  page.jsx                      → menú inicial: una tarjeta por sección
  dashboards/
    encuesta-lavaderos/page.jsx
    performance/page.jsx
    estado/page.jsx
    <nueva-seccion>/page.jsx
  api/
    performance/route.js
    <nuevo-dominio>/route.js
lib/
  secciones.js                  → declarar la seccion acá primero
  encuestas.js, shortcut.js,
  gestion.js                    → un loader por fuente de datos
  kpis/
    encuesta.js                 → los KPIs de la encuesta
    performance.js              → el avance del sprint de Shortcut
    operacion.js, lavaderos.js,
    clientes.js, facturacion.js → las secciones de Gestión
    tiempo.js                   → zona horaria, días, promedios: compartido
    <nuevo-dominio>.js          → un módulo de cálculo por dominio
```

Reglas para el dashboard nuevo:

0. **Declaralo primero en `lib/secciones.js`.** De ahí salen la navegación, la
   tarjeta del menú y el contrato que publica su endpoint. Si el nombre de la
   sección aparece escrito a mano en un `.jsx`, está mal.
1. **Una carpeta por dashboard** bajo `app/dashboards/<slug>/`, con `page.jsx`.
   El slug en kebab-case y descriptivo del dominio, no del gráfico. Tiene que
   coincidir con el `slug` del registro.
2. **Un módulo de cálculo por dominio** en `lib/kpis/<dominio>.js`. No metas
   KPIs de dominios distintos en el mismo archivo.
3. **Una ruta de API por dominio** bajo `app/api/<dominio>/`. Si la fuente no
   está configurada, que devuelva `cuerpoSinFuente(slug, motivo)` con
   `ESTADO_SIN_FUENTE` (las de Gestión lo hacen con `lib/gestion/respuestas.js`).
4. **Reusá los componentes de `components/`.** Si necesitás un tipo de gráfico
   que no existe, creá el componente genérico en `components/` — no un componente
   específico de ese dashboard.
5. **No dupliques `globals.css`.** Las clases `.panel`, `.grilla-kpis`,
   `.dos-columnas`, `.contenedor` y `.chip` son compartidas.

## Deuda conocida

Anotada acá para que no se descubra a los golpes, y para que quien la arregle
sepa qué se esperaba.

### 1. El cálculo de KPIs está duplicado

`lib/kpis/encuesta.js` y el `useMemo` de `app/dashboards/encuesta-lavaderos/page.jsx` calculan **los mismos
indicadores dos veces**, con lógica copiada y nombres de salida distintos
(`gestionManualONula.pct` en el server, `kpis.manual` en el cliente).

El dashboard usa la versión del cliente; `/api/kpis` usa la del server.

**Consecuencia práctica:** hoy, agregar o cambiar un KPI obliga a editar los dos
lugares, y si te olvidás de uno, el dashboard y la API dicen cosas distintas sin
que nada falle.

**Arreglo previsto:** `lib/kpis/encuesta.js` no tiene dependencias de servidor, así que el
componente de cliente puede importar `calcularKpis` directamente y borrar su
copia. Requiere unificar los nombres de salida y ajustar el JSX.

### 2. Los colores de los gráficos están hardcodeados

`app/globals.css` define los tokens (`--agua: #0fa3b1`), pero el dashboard de
la encuesta pasa
los hex literales a los componentes (`color="#0fa3b1"`). El mismo color vive en
dos lugares.

**Arreglo previsto:** exportar la paleta desde un módulo JS y que el CSS la
consuma, o leer las variables CSS desde JS.
