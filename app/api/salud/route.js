import obtenerEncuestas from "@/lib/encuestas";
import { shortcutConfigurado } from "@/lib/shortcut";

// GET /api/salud — health check y estado de la fuente de datos.
// De Shortcut solo dice si el token esta configurado, nunca el token: el estado
// de la conexion lo informa /api/performance, que es la que la usa.
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
    shortcutConfigurado: shortcutConfigurado(),
  });
}
