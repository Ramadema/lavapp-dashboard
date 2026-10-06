// Acceso al backoffice: los dos usuarios, sus contraseñas y la cookie de sesion.
//
// Es el unico archivo que lee las variables de acceso (las contraseñas y el
// secreto de firma). Las contraseñas viven solo en el entorno: .env.local en
// desarrollo y las variables del proyecto en Vercel. Nunca se loguean ni se
// devuelven. Las reglas de quien ve que estan en lib/auth/permisos.js y la
// firma del token en lib/auth/sesion.js; aca se juntan con el entorno y con la
// cookie.

import { ROLES } from "@/lib/auth/permisos";
import {
  firmarSesion,
  igualesEnTiempoConstante,
  leerSesion as leerToken,
} from "@/lib/auth/sesion";

export const NOMBRE_COOKIE = "lavapp_backoffice";

// @decision 2026-10-05 ramiro@mispichos.com
// La sesion dura 7 dias: el backoffice se mira seguido y pedir la contraseña
// todos los dias molesta mas de lo que protege. Si hace falta cerrar todas las
// sesiones de golpe, se cambia el secreto.
const DURACION_MS = 7 * 24 * 60 * 60 * 1000;

// Los usuarios son fijos: lo que se escribe en el login es el nombre del rol.
const USUARIOS = {
  admin: { rol: ROLES.ADMIN, variable: "BACKOFFICE_ADMIN_PASSWORD" },
  visitors: { rol: ROLES.VISITORS, variable: "BACKOFFICE_VISITORS_PASSWORD" },
};
const VARIABLE_SECRETO = "BACKOFFICE_SESSION_SECRET";

// Que variables faltan para que el login funcione. Vacio si esta todo.
export function variablesFaltantes() {
  return [VARIABLE_SECRETO, ...Object.values(USUARIOS).map((u) => u.variable)].filter(
    (variable) => !process.env[variable]
  );
}

// Valida usuario y contraseña. Devuelve { sesion: { usuario, rol } } si
// coinciden, { motivo } si no, y { sinConfigurar: [variables] } si al
// backoffice le faltan las variables de acceso: eso no es culpa de quien entra
// y se dice (los nombres de las variables, nunca sus valores).
export function autenticar(usuario, contrasena) {
  const faltan = variablesFaltantes();
  if (faltan.length > 0) return { sinConfigurar: faltan };

  const definicion = Object.hasOwn(USUARIOS, usuario) ? USUARIOS[usuario] : null;
  // Se compara siempre, exista o no el usuario, para que el tiempo de respuesta
  // no diga cuales existen.
  const esperada = definicion ? process.env[definicion.variable] : "";
  const coincide = igualesEnTiempoConstante(contrasena, esperada);
  if (!definicion || !coincide) return { motivo: "Usuario o contraseña incorrectos." };
  return { sesion: { usuario, rol: definicion.rol } };
}

// El header Set-Cookie que abre la sesion.
export async function cookieDeSesion(sesion, { ahora = new Date() } = {}) {
  const token = await firmarSesion(sesion, {
    secreto: process.env[VARIABLE_SECRETO],
    ahora,
    duracionMs: DURACION_MS,
  });
  return serializar(token, Math.floor(DURACION_MS / 1000));
}

// El header Set-Cookie que la cierra.
export const cookieDeSalida = () => serializar("", 0);

// La sesion que trae una cookie, o null si no hay sesion valida.
export function leerSesion(token, { ahora = new Date() } = {}) {
  return leerToken(token, { secreto: process.env[VARIABLE_SECRETO], ahora });
}

// HttpOnly: el JS del navegador no puede leerla. SameSite=Lax: no viaja en
// pedidos que arrancan en otro sitio, salvo que sea una navegacion. Secure solo
// en produccion, porque en desarrollo se entra por http.
function serializar(valor, maxAgeSegundos) {
  const partes = [
    `${NOMBRE_COOKIE}=${valor}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSegundos}`,
  ];
  if (process.env.NODE_ENV === "production") partes.push("Secure");
  return partes.join("; ");
}
