import { obtenerSprints, obtenerHistorialDeSprints, vencerCache } from "@/lib/shortcut";
import { armarHistorial, sprintsDestino, sprintsParaHistorial } from "@/lib/kpis/performance";
import { ESTADO_SIN_FUENTE } from "@/lib/secciones";

// GET /api/performance/historial — una fila por sprint (en curso o terminado,
// los ultimos SPRINTS_EN_HISTORIAL) con lo comprometido, lo agregado, lo
// terminado y lo que se movio a otro sprint. Es mas caro que /api/performance
// (lee las tareas y el historial de cada sprint), por eso va aparte.
export async function GET(request) {
  return responder(request, { fresco: false });
}

// POST — lo mismo sin pasar por el cache, para el boton "Actualizar".
export async function POST(request) {
  return responder(request, { fresco: true });
}

function responderSinDatos({ fuente, motivo }) {
  const status = fuente === "sin-configurar" ? ESTADO_SIN_FUENTE : 502;
  return Response.json({ fuente, motivo }, { status });
}

async function responder(request, { fresco }) {
  const sprints = await obtenerSprints({ fresco });
  if (!sprints.datos) return responderSinDatos(sprints);

  const iteraciones = sprintsParaHistorial(sprints.datos);
  const destinos = sprintsDestino(sprints.datos, iteraciones);
  const historial = await obtenerHistorialDeSprints(
    iteraciones.map((i) => i.id),
    { destinos: destinos.map((i) => i.id), fresco }
  );
  if (!historial.datos) return responderSinDatos(historial);

  if (fresco) vencerCache();

  const porId = new Map([...iteraciones, ...destinos].map((i) => [i.id, i]));
  return Response.json(
    armarHistorial(
      {
        iteraciones: sprints.datos,
        sprints: historial.datos.sprints.map((s) => ({ iteracion: porId.get(s.id), ...s })),
        destinos: historial.datos.destinos.map((s) => ({ iteracion: porId.get(s.id), ...s })),
        workflows: historial.datos.workflows,
        miembros: historial.datos.miembros,
        epics: historial.datos.epics,
      },
      {
        ahora: new Date(),
        leidoEl: [sprints.leidoEl, historial.leidoEl],
        problemas: historial.problemas,
      }
    )
  );
}
