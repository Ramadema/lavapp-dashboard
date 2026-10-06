# LavApp · Backoffice

Backoffice del proyecto LavApp, desarrollado para el Seminario de Integración
Profesional. Reúne los tableros internos del producto: la encuesta a 40 lavaderos
de autos sobre gestión operativa (con datos), **Performance**, el avance del
sprint del equipo leído en vivo de Shortcut, y las áreas de gestión —operación,
cuentas, clientes y facturación— que van a alimentarse desde la app de gestión.

## Arquitectura

Aplicación Next.js (App Router) desplegada en Vercel. El front y la API son el
mismo proyecto y salen del mismo dominio, pero la separación cliente ↔ API REST
se mantiene: cada pantalla consume los endpoints por `fetch`, no accede al dato
directo.

- **`/app`** — el menú inicial (`page.jsx`), las secciones bajo `/app/dashboards/<slug>/` y los Route Handlers bajo `/app/api`, que exponen la API REST.
- **`/lib`** — lógica del lado del servidor: `encuestas.js` resuelve la fuente de datos, `csv.js` parsea el CSV, `normalizar.js` valida y traduce los valores, `kpis/encuesta.js` calcula los indicadores, `secciones.js` declara qué secciones existen y qué contrato tiene cada endpoint. Para Performance, `shortcut.js` lee la API de Shortcut y `kpis/performance.js` arma el reporte del sprint.
- **`proxy.js` y `/lib/auth`** — el acceso: dos usuarios fijos (`admin` y `visitors`), la sesión en una cookie firmada y qué sección ve cada rol. Ver [Acceso](#acceso-usuarios-y-roles).
- **`/components`** — navegación, encabezado de sección, estado vacío, bloque de sesión, tarjetas de KPI y gráficos (Recharts).
- **`/data`** — `encuestas.json`, las 40 respuestas originales, que además funcionan como respaldo.

```
Navegador ──fetch /api/*──▶ lib/encuestas.js ──┐
   (React + Recharts)       (Node, en Vercel)  │
                                               ├─▶ planilla de Google (CSV, 60 s)
                                               │      └─▶ csv.js ─▶ normalizar.js ─┐
                                               │           (valida y traduce)      │
                                               │                                   ▼
                                               │                          array canónico ─▶ kpis/encuesta.js
                                               │                                   ▲
                                               └─▶ data/encuestas.json ────────────┘
                                                     (respaldo: entra tal cual,
                                                      sin validar ni traducir)
```

La fuente de datos es un único punto de cambio: `lib/encuestas.js` devuelve
siempre un array de respuestas con el mismo esquema, así que ni los Route
Handlers ni el dashboard saben de dónde salió el dato.

## Requisitos

| Herramienta | Versión | Verificar con |
|-------------|---------|---------------|
| Node.js | 20 o superior | `node -v` |
| npm | la que viene con Node (probado con 11.13) | `npm -v` |

No hace falta base de datos ni Docker. Para entrar hacen falta tres variables
de entorno: las contraseñas de los dos usuarios y el secreto de la sesión, ver
[Acceso](#acceso-usuarios-y-roles). Para los datos no hace falta configurar
nada: sin planilla, la app usa las 40 respuestas de `data/encuestas.json`. Para conectar una planilla de Google y tener datos en
vivo, ver [Datos en vivo desde Google Sheets](#datos-en-vivo-desde-google-sheets).
Performance necesita el token de Shortcut; sin él, la sección avisa que falta
configurarlo. Ver [Performance](#performance-avance-del-sprint-desde-shortcut).

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

### 3. Configurar el acceso y levantar el servidor de desarrollo

```bash
cp .env.example .env.local   # y completar las tres variables BACKOFFICE_*
npm run dev
```

Las variables están explicadas en [Acceso](#acceso-usuarios-y-roles). Next lee
`.env.local` solo al arrancar: si se cambia, reiniciar `npm run dev`.

Salida esperada:

```
▲ Next.js 16.3.3 (Turbopack)
- Local:        http://localhost:3000
✓ Ready in 259ms
```

### 4. Abrir el backoffice

Ir a **http://localhost:3000**. La primera pantalla es el login: entrar con
`admin` y la contraseña de `BACKOFFICE_ADMIN_PASSWORD`. Con `visitors` se ve
únicamente Performance.

Un solo proceso sirve el front y la API: no hace falta un segundo servidor ni
configurar proxies. La raíz es el menú, con una tarjeta por sección y su estado:
**Con datos** o **Sin fuente**.

Las secciones marcadas *Sin fuente* (Operación, Lavaderos, Clientes,
Facturación) ya tienen ruta y endpoint, pero el endpoint responde `501` hasta que
se conecte la app de gestión. Muestran el contrato que van a consumir, no números
inventados.

Para ver datos de verdad, entrar a **Encuesta a lavaderos**. La página arranca
mostrando *"Cargando encuesta…"* mientras hace el `fetch` a `/api/respuestas`, y
después dibuja las 8 tarjetas de KPI y los 4 gráficos. Para comprobar que el
filtrado funciona, hacer clic en el chip **Papel/pizarra**: el KPI "Respuestas en
el segmento" pasa de 40 a 14 y "Gestión manual o nula" sube a 100 %.

**Performance** muestra el sprint en curso de Shortcut: avance en tareas y en
puntos, días restantes, tres donas de un vistazo (avance, compromiso cumplido y
de dónde salió el trabajo), el compromiso del sprint (qué se planificó y cuánto
se cumplió), el burndown, el ritmo de entradas y salidas por día, el historial
sprint a sprint, el flujo acumulado, tareas por estado, el avance por
iniciativa, la carga por responsable, el tiempo en el sprint y por columna, el
cycle time y las listas de terminadas y pendientes. Arriba hay un
selector para ver otros sprints y el botón
**Actualizar**, que trae los datos de Shortcut en el momento. Sin
`SHORTCUT_API_TOKEN` la sección muestra que falta conectarla.

**Estado del sistema** es `/api/salud` con interfaz: dice si los datos salieron
de la planilla o del respaldo, y qué filas se rechazaron.

### 5. Verificar la API (opcional)

La API pide la misma sesión que las pantallas. Primero el login, guardando la
cookie en un archivo, y después cada pedido con esa cookie:

```bash
curl -c /tmp/sesion.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"usuario":"admin","contrasena":"<BACKOFFICE_ADMIN_PASSWORD>"}'
# {"usuario":"admin","rol":"admin"}

curl -b /tmp/sesion.txt http://localhost:3000/api/salud
# {"ok":true,"fuente":"respaldo","motivo":"ENCUESTAS_CSV_URL no esta configurada",
#  "filas":40,"csvConfigurado":false,"filasRechazadas":0,...

curl -b /tmp/sesion.txt http://localhost:3000/api/kpis
# {"n":40,"gestionManualONula":{"valor":32,"pct":80},...

curl -b /tmp/sesion.txt "http://localhost:3000/api/kpis?registro=Papel/pizarra"
# {"n":14,"gestionManualONula":{"valor":14,"pct":100},...

# Las areas todavia no conectadas responden 501 con su contrato:
curl -i -b /tmp/sesion.txt http://localhost:3000/api/operacion
# HTTP/1.1 501 Not Implemented
# {"conectada":false,"seccion":"operacion","motivo":"El backoffice todavia no...

# Performance (necesita SHORTCUT_API_TOKEN):
curl -b /tmp/sesion.txt http://localhost:3000/api/performance
# {"sprint":{"id":29,"nombre":"Sprint 1 - Backlog","estado":"En curso",...
#  "resumen":{"tareas":{"total":56,"terminadas":4,...

# Sin cookie, cualquier endpoint responde 401; con la sesion de visitors, los
# que no son de Performance responden 403.
curl -i http://localhost:3000/api/salud
# HTTP/1.1 401 Unauthorized
```

### 6. Detener el servidor

`Ctrl+C` en la terminal donde está corriendo. Si quedó en segundo plano:

```bash
lsof -ti:3000 -sTCP:LISTEN | xargs kill
```

## Acceso: usuarios y roles

El backoffice pide usuario y contraseña. Hay dos usuarios fijos y no hay base
de datos de usuarios: las contraseñas viven en variables de entorno.

| Usuario | Qué ve | A dónde entra |
|---------|--------|---------------|
| `admin` | Todo: las secciones, el menú y toda la API. | El menú inicial. |
| `visitors` | Solo **Performance** y sus endpoints (`/api/performance*`). Para compartir el avance del proyecto con gente de afuera del equipo. | Directo a Performance. En la barra lateral no ve ninguna otra sección. |

### Variables

| Variable | Qué es |
|----------|--------|
| `BACKOFFICE_ADMIN_PASSWORD` | La contraseña de `admin`. |
| `BACKOFFICE_VISITORS_PASSWORD` | La contraseña de `visitors`. |
| `BACKOFFICE_SESSION_SECRET` | Con qué se firma la cookie de sesión. Un texto largo y aleatorio: `openssl rand -base64 32`. Cambiarlo cierra todas las sesiones abiertas. |

En desarrollo van en `.env.local` (gitignoreado; reiniciar `npm run dev` después
de tocarlo). En Vercel: **Project Settings › Environment Variables**, las tres,
marcadas para **Production y Preview**, y redeployar. Sin ellas los previews no
dejan entrar. Si falta alguna, el login responde `503` y la pantalla dice cuál
(el nombre de la variable, nunca el valor).

Cambiar una contraseña es cambiar la variable y redeployar. Las sesiones ya
abiertas siguen válidas hasta vencer; para cerrarlas todas, cambiar también el
secreto.

### Cómo funciona

- `proxy.js` corre antes de cualquier pantalla o endpoint. Sin sesión, las
  pantallas redirigen a `/login` (y vuelven a donde iban después de entrar) y
  la API responde `401`. Con sesión de un rol que no ve esa sección, la pantalla
  redirige a lo que sí ve y la API responde `403`.
- La sesión es una cookie `lavapp_backoffice` firmada con HMAC-SHA256
  (`HttpOnly`, `SameSite=Lax`, `Secure` en producción) que dura 7 días. No se
  guarda nada en el servidor: lo que hace que Vercel no necesite ninguna base ni
  Redis. Una cookie manipulada o vencida equivale a no tener sesión.
- Las contraseñas las lee únicamente `lib/auth.js`, en el servidor. Se comparan
  en tiempo constante y un login fallido no dice si el usuario existe. Nunca se
  loguean ni aparecen en una respuesta.
- Qué ve cada rol está en un solo lugar, `lib/auth/permisos.js`, y de ahí lo
  leen el proxy, la barra lateral, el menú y el login. Agregar un usuario es
  agregarlo a `USUARIOS` en `lib/auth.js` con su variable; cambiar lo que ve un
  rol es tocar `SLUGS_POR_ROL` en `lib/auth/permisos.js`, con firma `@decision`.

### Endpoints de acceso

| Método | Ruta | Respuesta |
|--------|------|-----------|
| POST | `/api/auth/login` | Recibe `{ "usuario", "contrasena" }`. `200` con `{ usuario, rol }` y la cookie; `401` si no coinciden; `400` si falta un campo; `503` si al backoffice le faltan variables. |
| POST | `/api/auth/logout` | Borra la cookie. `204` siempre. |

## Probar el build de producción en local

Reproduce lo que corre en Vercel:

```bash
npm run build
npm start
```

El build tiene que terminar con esta tabla de rutas:

```
Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /api/auth/login
├ ƒ /api/auth/logout
├ ƒ /api/clientes
├ ƒ /api/facturacion
├ ƒ /api/kpis
├ ƒ /api/lavaderos
├ ƒ /api/operacion
├ ƒ /api/performance
├ ƒ /api/performance/historial
├ ƒ /api/respuestas
├ ƒ /api/salud
├ ƒ /dashboards/clientes
├ ƒ /dashboards/encuesta-lavaderos
├ ƒ /dashboards/estado
├ ƒ /dashboards/facturacion
├ ƒ /dashboards/lavaderos
├ ƒ /dashboards/operacion
├ ƒ /dashboards/performance
├ ○ /icon.svg
└ ƒ /login
ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Las rutas de API tienen que aparecer como dinámicas (`ƒ`): en Vercel se
convierten en serverless functions. Si alguna sale como estática (`○`), quedó
resuelta en tiempo de build y devolvería siempre los mismos datos, ignorando los
parámetros `?registro=` y `?sprint=` y **congelando la lectura de la planilla y de
Shortcut en el momento del deploy**.

Las páginas también salen dinámicas (`ƒ`) desde que hay login: el layout lee la
sesión de cada pedido para armar la barra lateral según el rol. El HTML sigue
sin traer datos adentro: los pide por `fetch` al abrirse en el navegador. La
línea `ƒ Proxy (Middleware)` es `proxy.js`, el que pide la sesión.

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

Vocabulario canónico por campo, que es lo que finalmente ve `lib/kpis/encuesta.js`:

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

`/api/salud` dice qué fuente se usó y qué se rechazó (con la cookie de sesión,
ver [Acceso](#acceso-usuarios-y-roles)):

```bash
curl -b /tmp/sesion.txt http://localhost:3000/api/salud
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
  "columnasIgnoradas": ["Marca temporal"],
  "shortcutConfigurado": true
}
```

- **`fuente`** — `"planilla"` si leyó el CSV, `"respaldo"` si cayó a
  `data/encuestas.json`.
- **`motivo`** — por qué cayó al respaldo, cuando corresponde.
- **`filasRechazadas`** y **`problemas`** — filas que no pasaron la validación,
  con número de fila, campo, valor recibido y motivo. Las filas válidas se sirven
  igual: una celda mal tipeada no tira abajo todo el dashboard.
- **`shortcutConfigurado`** — si `SHORTCUT_API_TOKEN` está puesto. Nunca el token.
  El estado de la conexión con Shortcut lo informa `/api/performance`.

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

## Performance: avance del sprint desde Shortcut

La sección **Performance** (`/dashboards/performance`) muestra el avance de los
sprints de Shortcut para la gente de negocio, que en el plan Free de Shortcut no
puede tener usuarios de solo lectura. Todo lo que se ve sale de la API REST v3 de
Shortcut, leída desde el servidor.

### 1. Crear el token

En Shortcut: **Settings › Account › API Tokens**
(https://app.shortcut.com/settings/account/api-tokens). Alcanza con un token de
solo lectura. El token es personal: ve lo mismo que ve quien lo generó.

### 2. Configurarlo

En local, en `.env.local` (está gitignoreado; si no existe, crearlo en la raíz
del repo):

```bash
SHORTCUT_API_TOKEN=<el token>
```

Y reiniciar `npm run dev`: Next lee `.env.local` solo al arrancar.

En Vercel: **Project Settings › Environment Variables**, agregar
`SHORTCUT_API_TOKEN` y redeployar.

El token nunca llega al navegador: lo lee únicamente `lib/shortcut.js`, en el
servidor, y no aparece en ninguna respuesta ni en los logs. `/api/salud` solo
dice `shortcutConfigurado: true/false`.

### 3. Verificar

Con la cookie de sesión de [Acceso](#acceso-usuarios-y-roles):

```bash
curl -b /tmp/sesion.txt http://localhost:3000/api/performance            # el sprint en curso
curl -b /tmp/sesion.txt "http://localhost:3000/api/performance?sprint=29" # un sprint puntual
curl -b /tmp/sesion.txt -X POST http://localhost:3000/api/performance     # lo que hace "Actualizar"
curl -b /tmp/sesion.txt http://localhost:3000/api/performance/historial   # el historial de sprints
```

| Respuesta | Qué quiere decir |
|-----------|------------------|
| `200` | Reporte del sprint. `problemas` tiene que ser `[]`. |
| `501` | Falta `SHORTCUT_API_TOKEN`. |
| `502` | Shortcut falló o rechazó el token; `motivo` dice qué contestó. |
| `404` | No existe ese sprint, o el workspace todavía no tiene sprints. |
| `400` | `?sprint=` no es un número. |

### Qué se calcula

- **Avance en tareas**: tareas terminadas sobre el total del sprint. Cada story de
  Shortcut es una tarea, subtareas incluidas, que es como las cuenta Shortcut.
  Las archivadas no cuentan.
- **Avance en puntos**: puntos de las tareas terminadas sobre el total estimado.
  Una tarea sin estimar suma 0, y la tarjeta dice cuántas hay.
- **Días restantes**: días corridos hasta el fin del sprint, contando hoy.
- **Tareas por estado**: una tarjeta por columna del tablero, en su orden.
- **Terminadas y pendientes**: título, estado, iniciativa (el epic),
  responsables y puntos.
- **Trabajo pendiente día a día (burndown)**: cuánto faltaba terminar al cierre
  de cada día, en tareas o en puntos, contra la línea ideal que baja del alcance
  del primer día a 0 el último. Se reconstruye con tres fechas de cada tarea:
  cuándo entró al sprint, cuándo se terminó y el corte de día. La API no da la
  fecha de ingreso como campo: sale del historial de cada story. La línea del
  total del sprint muestra lo que se sumó con el sprint empezado.
- **Flujo del trabajo día a día (cumulative flow)**: cuántas tareas había en
  cada etapa —terminada, en curso, pendiente— al cierre de cada día. Usa las
  mismas fechas y el mismo corte de día que el burndown, más `started_at` para
  saber cuándo se empezó cada una, así las dos curvas cuentan lo mismo. Si la
  franja "En curso" se ensancha, el trabajo se está acumulando antes de cerrarse.
- **Avance por iniciativa**: las tareas de cada epic partidas por etapa, con el
  porcentaje terminado y los puntos. Las que no tienen epic van en "Sin
  iniciativa".
- **Carga por responsable**: lo mismo por persona. Una tarea con dos
  responsables cuenta entera para cada uno (se informa cuántas están así), y
  las que no tienen responsable van en "Sin asignar".
- **Tiempo de resolución (cycle time)**: de `started_at` a `completed_at` de
  cada tarea terminada, con promedio y mediana del sprint. Es la misma cuenta
  que el `cycle_time` de Shortcut.
- **Compromiso del sprint**: lo *comprometido* es lo que ya estaba en el sprint
  al cierre de su primer día (hora de Buenos Aires), la misma regla con la que el
  burndown fija el alcance inicial; lo *agregado* es lo que entró después. De
  cada grupo: total, terminadas, en curso, pendientes y *movidas* a otro sprint.
  Una tarea que se sacó del sprint sigue contando como comprometida (o agregada)
  y no cumplida: se la encuentra en el sprint de destino por
  `previous_iteration_ids` y su historial dice cuándo entró y cuándo salió. Las
  que se movieron al backlog no se ven (Shortcut no las lista en ningún sprint).
  La lista "Comprometidas sin terminar" es lo que se mira en la retrospectiva.
- **Proyección al cierre**: una regla de tres, las terminadas por día completo
  transcurrido por los días que quedan, con tope en el total. Es una
  estimación, no un dato de Shortcut; la pantalla lo dice. Solo para un sprint
  en curso con al menos un día completo.
- **Ritmo de resolución**: por cada día transcurrido, cuántas tareas entraron al
  sprint y cuántas se terminaron. Lo anterior al inicio entra el primer día.
- **Historial de sprints** (`/api/performance/historial`): una fila por sprint
  en curso o terminado, los últimos 8, con comprometidas, cumplidas, agregadas,
  movidas, terminadas sobre el total y puntos. Lee las tareas y el historial de
  cada sprint, por eso es un endpoint aparte y la pantalla lo carga por
  separado. Las tareas movidas entre sprints de la ventana se atribuyen al de
  origen como no cumplidas.
- **Tiempo en el sprint**: días de calendario desde que cada tarea terminada
  entró al sprint (o desde el inicio del sprint, si entró antes) hasta que se
  terminó; 0 es "el mismo día". Mide lo que ve negocio aunque la tarjeta haya
  saltado de "To Do" a "Done" sin pasar por "In Progress", que es cuando el
  cycle time da cero.
- **Listas plegadas**: las tablas y las barras por tarea muestran 5 filas y un
  botón «Ver N más»; los desgloses por iniciativa y por responsable, 6 grupos.
- **Días por columna**: cuánto estuvo cada tarea terminada en cada columna del
  tablero, reconstruido de los cambios de `workflow_state_id` del historial,
  desde que se creó hasta que se terminó. Promedio, mediana y cuántas tareas
  pasaron por cada una. Las columnas de tipo done no se miden.

Las reglas exactas están firmadas con `@decision` en `lib/kpis/performance.js`.
Una limitación de la API: solo lista las tareas que hoy están en el sprint, así
que una que se sacó a mitad de camino no aparece en el burndown.
Los días se cortan en hora de Buenos Aires.

### Cómo se comporta el cache

La API de Shortcut acepta 200 requests por minuto. Para no gastarlas en cada
carga de página, `lib/shortcut.js` cachea con *stale-while-revalidate*: los
sprints y sus stories se releen cada 5 minutos, y los workflows, las personas y
los epics cada 15. Un reporte leído en frío cuesta 5 requests más uno por
story para el historial (el Sprint 1, con 56 stories, son 61 requests y unos 4
segundos). Los historiales se piden de a 5 y quedan guardados por versión: cada
uno se cachea con el `updated_at` de su story, así que en las lecturas
siguientes solo se vuelve a pedir el de las stories que cambiaron. Si Shortcut
corta con un 429 a mitad de camino, las stories que quedaron sin historial se
informan y usan su fecha de creación.

**Actualizar** lee de Shortcut sin pasar por el cache y después lo vence, así
que la próxima carga de cualquiera también trae el dato nuevo. La pantalla
siempre dice de cuándo es el dato ("Datos de Shortcut del…") y avisa si tiene
más de 30 minutos.

### Si Shortcut falla

No hay respaldo en disco: inventar un sprint sería peor que no mostrarlo. El
respaldo es el cache, que solo guarda respuestas 200: mientras Shortcut falla se
sigue sirviendo la última lectura buena. Si no hay ninguna, la pantalla muestra
el motivo en lugar de los números. Si falla "Actualizar", quedan en pantalla los
datos anteriores con un aviso.

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

Las variables de entorno (`ENCUESTAS_CSV_URL`, `SHORTCUT_API_TOKEN` y las tres
`BACKOFFICE_*` de [Acceso](#acceso-usuarios-y-roles)) se cargan en **Project
Settings › Environment Variables**. Las de acceso tienen que estar marcadas para
Production y Preview: sin ellas, un preview muestra el login pero no deja entrar.

## Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/respuestas` | Las 40 respuestas de la encuesta en JSON |
| GET | `/api/kpis` | KPIs agregados calculados en el servidor |
| GET | `/api/kpis?registro=Papel/pizarra` | KPIs del segmento filtrado por método de registro |
| GET | `/api/salud` | Health check y estado de la fuente de datos (ver [Datos en vivo](#datos-en-vivo-desde-google-sheets)) |
| GET | `/api/performance` | Reporte del sprint en curso de Shortcut (ver [Performance](#performance-avance-del-sprint-desde-shortcut)) |
| GET | `/api/performance?sprint=29` | Reporte de un sprint puntual |
| POST | `/api/performance?sprint=29` | Lo mismo leyendo de Shortcut sin cache: es el botón "Actualizar" |
| POST | `/api/auth/login` | Abre la sesión: `{ "usuario", "contrasena" }` → cookie (ver [Acceso](#acceso-usuarios-y-roles)) |
| POST | `/api/auth/logout` | Cierra la sesión |

Todos los endpoints salvo los de `/api/auth` piden la cookie de sesión: `401`
sin ella y `403` si el rol no ve esa sección.

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

En **Performance**, por sprint de Shortcut:

- % de avance en tareas y en puntos, con las tareas sin estimar informadas aparte
- Días restantes (o días para empezar, si es un sprint próximo)
- Tareas y puntos por columna del tablero
- Listas de tareas terminadas y pendientes, con estado, iniciativa y responsables
- Burndown diario en tareas o puntos, con línea ideal y cambios de alcance
- Flujo acumulado diario: tareas terminadas, en curso y pendientes
- Avance por iniciativa (epic) y carga por responsable, partidos por etapa
- Cycle time por tarea terminada, con promedio y mediana

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
