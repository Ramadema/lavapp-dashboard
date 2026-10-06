import { cookieDeSalida } from "@/lib/auth";

// POST /api/auth/logout — cierra la sesion borrando la cookie. 204 siempre:
// cerrar una sesion que no existe no es un error.
export async function POST() {
  return new Response(null, { status: 204, headers: { "Set-Cookie": cookieDeSalida() } });
}
