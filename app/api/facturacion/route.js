import { obtenerPlanes, obtenerSuscripciones, vencerCache } from "@/lib/gestion";
import { sinDatos } from "@/lib/gestion/respuestas";
import { armarFacturacion } from "@/lib/kpis/facturacion";

// GET /api/facturacion — planes con sus cuentas y suscripciones con sus cobros,
// leidos de la app de gestion.
export async function GET() {
  return responder({ fresco: false });
}

// POST /api/facturacion — lo mismo sin cache: el boton "Actualizar".
export async function POST() {
  return responder({ fresco: true });
}

async function responder({ fresco }) {
  const ahora = new Date();
  const [planes, suscripciones] = await Promise.all([
    obtenerPlanes({ fresco }),
    obtenerSuscripciones({ fresco }),
  ]);
  if (!planes.datos) return sinDatos("facturacion", planes);
  if (!suscripciones.datos) return sinDatos("facturacion", suscripciones);
  if (fresco) vencerCache();

  return Response.json({
    conectada: true,
    ...armarFacturacion(
      { planes: planes.datos, suscripciones: suscripciones.datos },
      { ahora, leidoEl: [planes.leidoEl, suscripciones.leidoEl] }
    ),
  });
}
