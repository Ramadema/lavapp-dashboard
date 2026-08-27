import encuestas from "@/lib/encuestas";

// GET /api/respuestas — las respuestas crudas de la encuesta
export function GET() {
  return Response.json(encuestas);
}
