// Firma y lectura del token de sesion del backoffice.
//
// La sesion no se guarda en ningun lado: el token lleva adentro usuario, rol y
// vencimiento, firmados con HMAC-SHA256. Si alguien lo toca, la firma deja de
// coincidir y se descarta. Alcanza porque son dos usuarios fijos y no hay nada
// que revocar de a uno: cambiar el secreto cierra todas las sesiones a la vez.
// Usa Web Crypto (y no el modulo crypto de Node) porque es lo que esta
// disponible en todos los runtimes donde corre Next, incluido el proxy.
// Modulo puro: el secreto y la hora llegan por parametro para que los tests los
// fijen.

// Como viaja la sesion desde el proxy hasta las paginas: el proxy valida el
// token una sola vez y pasa usuario y rol en estos headers internos, que antes
// borra del pedido entrante para que no se puedan inventar desde afuera.
export const HEADER_USUARIO = "x-backoffice-usuario";
export const HEADER_ROL = "x-backoffice-rol";

const codificador = new TextEncoder();

const aBase64Url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const deBase64Url = (texto) => {
  const base64 = texto.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(base64 + relleno), (c) => c.charCodeAt(0));
};

async function firmar(texto, secreto) {
  const clave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", clave, codificador.encode(texto)));
}

// Compara dos textos recorriendolos siempre enteros, para que el tiempo de
// respuesta no diga cuantos caracteres acerto quien esta probando contraseñas.
export function igualesEnTiempoConstante(a, b) {
  const x = codificador.encode(String(a));
  const y = codificador.encode(String(b));
  let distinto = x.length ^ y.length;
  const largo = Math.max(x.length, y.length);
  for (let i = 0; i < largo; i++) distinto |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return distinto === 0;
}

// Arma el token de una sesion { usuario, rol } que vence a los duracionMs.
export async function firmarSesion({ usuario, rol }, { secreto, ahora, duracionMs }) {
  const vence = ahora.getTime() + duracionMs;
  const cuerpo = aBase64Url(codificador.encode(JSON.stringify({ usuario, rol, vence })));
  const firma = aBase64Url(await firmar(cuerpo, secreto));
  return `${cuerpo}.${firma}`;
}

// Lee un token. Devuelve { usuario, rol, vence } o null si el token no esta,
// esta mal formado, no fue firmado con este secreto o ya vencio. No distingue
// los casos a proposito: para quien lo manda, todos significan "volvé a entrar".
export async function leerSesion(token, { secreto, ahora }) {
  if (typeof token !== "string" || !secreto) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [cuerpo, firma] = partes;

  const esperada = aBase64Url(await firmar(cuerpo, secreto));
  if (!igualesEnTiempoConstante(firma, esperada)) return null;

  let sesion;
  try {
    sesion = JSON.parse(new TextDecoder().decode(deBase64Url(cuerpo)));
  } catch {
    return null;
  }
  if (
    !sesion ||
    typeof sesion.usuario !== "string" ||
    typeof sesion.rol !== "string" ||
    typeof sesion.vence !== "number"
  )
    return null;
  if (sesion.vence <= ahora.getTime()) return null;
  return sesion;
}
