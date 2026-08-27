import obtenerEncuestas from "@/lib/encuestas";
import { calcularKpis } from "@/lib/kpis";

// GET /api/kpis[?registro=...] — KPIs agregados, opcionalmente de un segmento
export async function GET(request) {
  const { datos: encuestas } = await obtenerEncuestas();
  const registro = request.nextUrl.searchParams.get("registro");
  const datos = registro
    ? encuestas.filter((r) => r.registro === registro)
    : encuestas;

  if (datos.length === 0) {
    return Response.json({ error: "Sin datos para ese filtro" }, { status: 404 });
  }
  return Response.json(calcularKpis(datos));
}
