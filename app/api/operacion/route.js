import { obtenerOrdenes, vencerCache } from "@/lib/gestion";
import { sinDatos } from "@/lib/gestion/respuestas";
import { armarOperacion, periodo, PERIODO_POR_DEFECTO, PERIODOS } from "@/lib/kpis/operacion";

// GET /api/operacion[?dias=7|30|90] — la operacion de los lavaderos, leida de la
// app de gestion. Sin ?dias= son los ultimos 30.
export async function GET(request) {
  return responder(request, { fresco: false });
}

// POST /api/operacion[?dias=] — lo mismo, leyendo la app de gestion sin pasar por
// el cache. Es el boton "Actualizar". Es POST porque tiene un efecto: vence el
// cache para las cargas que vengan despues.
export async function POST(request) {
  return responder(request, { fresco: true });
}

async function responder(request, { fresco }) {
  const pedido = request.nextUrl.searchParams.get("dias");
  const dias = pedido === null ? PERIODO_POR_DEFECTO : Number(pedido);
  if (!PERIODOS.includes(dias)) {
    return Response.json(
      {
        conectada: false,
        seccion: "operacion",
        motivo: `El parámetro dias tiene que ser uno de ${PERIODOS.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  const ahora = new Date();
  const ordenes = await obtenerOrdenes({ ...periodo(dias, ahora), fresco });
  if (!ordenes.datos) return sinDatos("operacion", ordenes);
  if (fresco) vencerCache();

  return Response.json({
    conectada: true,
    ...armarOperacion(ordenes.datos, { ahora, dias, leidoEl: [ordenes.leidoEl] }),
  });
}
