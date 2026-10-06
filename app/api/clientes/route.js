import { obtenerClientes, vencerCache } from "@/lib/gestion";
import { sinDatos } from "@/lib/gestion/respuestas";
import { armarClientes, desdeRecurrencia } from "@/lib/kpis/clientes";

// GET /api/clientes — los clientes finales de los lavaderos, leidos de la app de
// gestion, con sus lavados de los ultimos 90 dias para medir recurrencia.
export async function GET() {
  return responder({ fresco: false });
}

// POST /api/clientes — lo mismo sin cache: el boton "Actualizar".
export async function POST() {
  return responder({ fresco: true });
}

async function responder({ fresco }) {
  const ahora = new Date();
  const clientes = await obtenerClientes({ desde: desdeRecurrencia(ahora), fresco });
  if (!clientes.datos) return sinDatos("clientes", clientes);
  if (fresco) vencerCache();

  return Response.json({
    conectada: true,
    ...armarClientes(clientes.datos, { ahora, leidoEl: [clientes.leidoEl] }),
  });
}
