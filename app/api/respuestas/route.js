import obtenerEncuestas from "@/lib/encuestas";

// GET /api/respuestas — las respuestas crudas de la encuesta
export async function GET() {
  const { datos } = await obtenerEncuestas();
  return Response.json(datos);
}
