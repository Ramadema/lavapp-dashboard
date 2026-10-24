import { obtenerSprints, obtenerHistorialDeSprints, obtenerConteos, vencerCache } from "@/lib/shortcut";
import { cargarEquipo } from "@/lib/equipo";
import { armarInversion } from "@/lib/kpis/inversion";
import { ESTADO_SIN_FUENTE } from "@/lib/secciones";

// GET /api/inversion — el MVP para el cliente: avance, horas invertidas,
// entregas por sprint, lo que falta y los riesgos. Lee de Shortcut lo mismo que
// /api/performance/proyecto (las stories y el historial de cada sprint, mas los
// conteos del workspace) con el mismo cache, asi abrir las dos secciones no
// duplica los pedidos.
export async function GET() {
  return responder({ fresco: false });
}

// POST — lo mismo leyendo de Shortcut sin pasar por el cache, y vence el cache
// para las cargas que vengan despues. Es el boton "Actualizar".
export async function POST() {
  return responder({ fresco: true });
}

// 501 si falta el token, como una seccion sin fuente; 502 si Shortcut fallo.
function responderSinDatos({ fuente, motivo }) {
  const status = fuente === "sin-configurar" ? ESTADO_SIN_FUENTE : 502;
  return Response.json({ fuente, motivo }, { status });
}

async function responder({ fresco }) {
  const sprints = await obtenerSprints({ fresco });
  if (!sprints.datos) return responderSinDatos(sprints);

  const [historial, conteos] = await Promise.all([
    obtenerHistorialDeSprints(
      sprints.datos.map((i) => i.id),
      { fresco }
    ),
    obtenerConteos({ fresco }),
  ]);
  if (!historial.datos) return responderSinDatos(historial);

  const equipo = await cargarEquipo();

  if (fresco) vencerCache();

  const porId = new Map(sprints.datos.map((i) => [i.id, i]));
  return Response.json(
    armarInversion(
      {
        iteraciones: sprints.datos,
        sprints: historial.datos.sprints.map((s) => ({ iteracion: porId.get(s.id), ...s })),
        workflows: historial.datos.workflows,
        miembros: historial.datos.miembros,
        epics: historial.datos.epics,
        camposCustom: historial.datos.camposCustom,
        conteos: conteos.datos,
      },
      {
        ahora: new Date(),
        leidoEl: [sprints.leidoEl, historial.leidoEl, conteos.leidoEl],
        problemas: [...historial.problemas, ...conteos.problemas, ...equipo.problemas],
        equipo: equipo.datos,
      }
    )
  );
}
