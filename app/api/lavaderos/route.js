import { obtenerLavaderos, vencerCache } from "@/lib/gestion";
import { sinDatos } from "@/lib/gestion/respuestas";
import { armarLavaderos } from "@/lib/kpis/lavaderos";

// GET /api/lavaderos — el padron de cuentas, leido de la app de gestion.
export async function GET() {
  return responder({ fresco: false });
}

// POST /api/lavaderos — lo mismo sin cache: el boton "Actualizar".
export async function POST() {
  return responder({ fresco: true });
}

async function responder({ fresco }) {
  const ahora = new Date();
  const lavaderos = await obtenerLavaderos({ fresco });
  if (!lavaderos.datos) return sinDatos("lavaderos", lavaderos);
  if (fresco) vencerCache();

  return Response.json({
    conectada: true,
    ...armarLavaderos(lavaderos.datos, { ahora, leidoEl: [lavaderos.leidoEl] }),
  });
}
