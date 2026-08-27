// GET /api/salud — health check
export function GET() {
  return Response.json({ ok: true });
}
