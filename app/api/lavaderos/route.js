import { cuerpoSinFuente, ESTADO_SIN_FUENTE } from "@/lib/secciones";

// GET /api/lavaderos — todavia sin fuente detras.
//
// Responde 501 con el contrato que va a cumplir cuando se conecte la app de
// gestion. Devolver 200 con un array vacio seria peor: la pantalla no podria
// distinguir "no hay datos" de "no hay conexion" y el tablero mostraria ceros
// como si fueran una medicion.
export async function GET() {
  return Response.json(cuerpoSinFuente("lavaderos"), { status: ESTADO_SIN_FUENTE });
}
