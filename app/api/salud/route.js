import obtenerEncuestas from "@/lib/encuestas";

// GET /api/salud — health check y estado de la fuente de datos
export async function GET() {
  const { datos, fuente, motivo, problemas, columnasIgnoradas, filasRechazadas } =
    await obtenerEncuestas();

  return Response.json({
    ok: true,
    fuente,
    motivo,
    filas: datos.length,
    csvConfigurado: Boolean(process.env.ENCUESTAS_CSV_URL),
    filasRechazadas,
    problemas: problemas.slice(0, 20),
    columnasIgnoradas,
  });
}
