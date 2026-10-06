import { autenticar, cookieDeSesion } from "@/lib/auth";

// POST /api/auth/login — abre la sesion. Recibe { usuario, contrasena } y
// responde 200 con { usuario, rol } mas la cookie; 401 si no coinciden; 503 si
// al backoffice le faltan las variables de acceso (no es culpa de quien entra,
// y se dice cuales faltan: son nombres de variables, no valores).
export async function POST(request) {
  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo || typeof cuerpo.usuario !== "string" || typeof cuerpo.contrasena !== "string") {
    return Response.json({ motivo: "Hacen falta usuario y contraseña." }, { status: 400 });
  }

  const resultado = autenticar(cuerpo.usuario, cuerpo.contrasena);
  if (resultado.sinConfigurar) {
    return Response.json(
      { motivo: "Al backoffice le faltan variables de acceso.", faltan: resultado.sinConfigurar },
      { status: 503 }
    );
  }
  if (!resultado.sesion) return Response.json({ motivo: resultado.motivo }, { status: 401 });

  return Response.json(resultado.sesion, {
    status: 200,
    headers: { "Set-Cookie": await cookieDeSesion(resultado.sesion) },
  });
}
