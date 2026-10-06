import { NextResponse } from "next/server";
import { NOMBRE_COOKIE, leerSesion } from "@/lib/auth";
import { puedeVer, rutaInicial } from "@/lib/auth/permisos";
import { HEADER_ROL, HEADER_USUARIO } from "@/lib/auth/sesion";

// Puerta de entrada del backoffice: nada se sirve sin sesion, y cada rol ve
// solo lo suyo. Corre antes de cualquier pagina o endpoint (ver el matcher al
// final). Valida la cookie una sola vez y le pasa usuario y rol a la app por
// dos headers internos; las paginas no vuelven a mirar la cookie.
//
// Lo unico publico es la pantalla de login y los endpoints que la sirven.
const RUTAS_PUBLICAS = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const sesion = await leerSesion(request.cookies.get(NOMBRE_COOKIE)?.value);
  const esApi = pathname.startsWith("/api/");

  if (RUTAS_PUBLICAS.includes(pathname)) {
    // Quien ya entro no tiene nada que hacer en el login.
    if (sesion && pathname === "/login") return irA(rutaInicial(sesion.rol), request);
    return seguir(request, sesion);
  }

  if (!sesion) {
    if (esApi) return Response.json({ motivo: "Hace falta iniciar sesión." }, { status: 401 });
    const login = new URL("/login", request.url);
    // Para volver a donde iba despues de entrar. El inicio no hace falta
    // guardarlo: es a donde se va solo.
    if (pathname !== "/") login.searchParams.set("volver", pathname + search);
    return NextResponse.redirect(login);
  }

  if (!puedeVer(sesion.rol, pathname)) {
    if (esApi)
      return Response.json(
        { motivo: `El usuario ${sesion.usuario} no tiene acceso a ${pathname}.` },
        { status: 403 }
      );
    return irA(rutaInicial(sesion.rol), request);
  }

  return seguir(request, sesion);
}

const irA = (ruta, request) => NextResponse.redirect(new URL(ruta, request.url));

// Deja pasar el pedido con la sesion en los headers internos. Los borra antes
// de ponerlos: un cliente no puede mandarlos y hacerse pasar por alguien.
function seguir(request, sesion) {
  const headers = new Headers(request.headers);
  headers.delete(HEADER_USUARIO);
  headers.delete(HEADER_ROL);
  if (sesion) {
    headers.set(HEADER_USUARIO, sesion.usuario);
    headers.set(HEADER_ROL, sesion.rol);
  }
  return NextResponse.next({ request: { headers } });
}

// Todo salvo los assets: el JS y el CSS compilados, la optimizacion de imagenes
// y el icono. Si el proxy los cortara, el login no podria ni dibujarse.
export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
