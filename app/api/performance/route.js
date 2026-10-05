import { obtenerSprints, obtenerSprint, obtenerMovidas, vencerCache } from "@/lib/shortcut";
import { armarReporte, elegirSprintPorDefecto, sprintsPosteriores } from "@/lib/kpis/performance";
import { ESTADO_SIN_FUENTE } from "@/lib/secciones";

// GET /api/performance[?sprint=<id>] — avance de un sprint, leido de Shortcut.
// Sin ?sprint= devuelve el sprint en curso.
export async function GET(request) {
  return responder(request, { fresco: false });
}

// POST /api/performance[?sprint=<id>] — lo mismo, pero leyendo de Shortcut sin
// pasar por el cache. Es lo que dispara el boton "Actualizar". Es POST porque
// tiene un efecto: vence el cache para las cargas que vengan despues.
export async function POST(request) {
  return responder(request, { fresco: true });
}

// 501 si falta el token, como una seccion sin fuente: la ruta existe, la conexion
// no. 502 si Shortcut fallo: el error es del servicio de atras, no de este.
function responderSinDatos({ fuente, motivo }) {
  const status = fuente === "sin-configurar" ? ESTADO_SIN_FUENTE : 502;
  return Response.json({ fuente, motivo }, { status });
}

async function responder(request, { fresco }) {
  const pedido = request.nextUrl.searchParams.get("sprint");
  if (pedido !== null && !/^\d+$/.test(pedido)) {
    return Response.json(
      { fuente: "backoffice", motivo: "El parámetro sprint tiene que ser el número de un sprint." },
      { status: 400 }
    );
  }

  const sprints = await obtenerSprints({ fresco });
  if (!sprints.datos) return responderSinDatos(sprints);

  const id = pedido !== null ? Number(pedido) : elegirSprintPorDefecto(sprints.datos);
  const iteracion = sprints.datos.find((i) => i.id === id);
  if (!iteracion) {
    const motivo =
      pedido !== null
        ? `No hay ningún sprint con el número ${pedido} en Shortcut.`
        : "Todavía no hay sprints cargados en Shortcut.";
    return Response.json({ fuente: "shortcut", motivo }, { status: 404 });
  }

  const sprint = await obtenerSprint(id, { fresco });
  if (!sprint.datos) return responderSinDatos(sprint);

  // Las tareas que se le sacaron a este sprint estan en los que empiezan despues.
  const movidas = await obtenerMovidas(
    id,
    sprintsPosteriores(sprints.datos, iteracion).map((i) => i.id),
    { fresco }
  );

  if (fresco) vencerCache();

  return Response.json(
    armarReporte(
      { iteraciones: sprints.datos, iteracion, ...sprint.datos, movidas: movidas.datos },
      {
        ahora: new Date(),
        leidoEl: [sprints.leidoEl, sprint.leidoEl, movidas.leidoEl],
        problemas: [...sprint.problemas, ...movidas.problemas],
      }
    )
  );
}
