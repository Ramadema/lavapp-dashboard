import obtenerEncuestas from "@/lib/encuestas";
import { shortcutConfigurado } from "@/lib/shortcut";
import { gestionConfigurada } from "@/lib/gestion";

// GET /api/salud — health check y estado de la fuente de datos.
// De Shortcut y de la app de gestion solo dice si el acceso esta configurado,
// nunca el token ni la clave: el estado de cada conexion lo informa la seccion
// que la usa (/api/performance, /api/operacion y las otras tres de Gestion).
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
    gestionConfigurada: gestionConfigurada(),
  });
}
