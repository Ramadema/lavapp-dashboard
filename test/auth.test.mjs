// Tests de lib/auth/permisos.js y lib/auth/sesion.js. Sin framework: node los
// corre directo.
//
//   npm test
//
// El secreto y el "ahora" se fijan en cada caso: nada depende del entorno ni
// del reloj de la maquina. lib/auth.js (el que lee las variables) no se testea
// aca: es la union de estas dos piezas con process.env y la cookie, y se
// verifica a mano con curl segun el README.

import {
  ROLES,
  describirRol,
  esRol,
  gruposVisibles,
  puedeVer,
  rutaInicial,
  seccionesVisibles,
} from "../lib/auth/permisos.js";
import {
  HEADER_ROL,
  HEADER_USUARIO,
  firmarSesion,
  igualesEnTiempoConstante,
  leerSesion,
} from "../lib/auth/sesion.js";
import { SECCIONES } from "../lib/secciones.js";

let ok = 0, fail = 0;
const check = (nombre, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log("  OK   " + nombre); }
  else { fail++; console.log("  FALLA " + nombre + "\n        real:     " + a + "\n        esperado: " + b); }
};

console.log("Permisos: roles");
{
  check("hay exactamente dos roles", Object.values(ROLES).sort(), ["admin", "visitors"]);
  check("un rol desconocido no es rol", [esRol("admin"), esRol("root"), esRol(undefined)], [true, false, false]);
}

console.log("\nPermisos: que ve cada rol");
{
  check("admin ve todas las secciones del registro", seccionesVisibles("admin").map((s) => s.slug), SECCIONES.map((s) => s.slug));
  check("visitors ve solo performance", seccionesVisibles("visitors").map((s) => s.slug), ["performance"]);
  check("un rol desconocido no ve ninguna", seccionesVisibles("root"), []);
  check("seccionesVisibles filtra por grupo", seccionesVisibles("admin", "Proyecto").map((s) => s.slug), ["performance"]);
  check("admin tiene todos los grupos", gruposVisibles("admin"), ["Gestión", "Investigación", "Proyecto", "Sistema"]);
  check("visitors tiene solo el grupo de performance", gruposVisibles("visitors"), ["Proyecto"]);
  check("la descripcion de admin", describirRol("admin"), "Acceso completo");
  check("la descripcion de visitors nombra su seccion", describirRol("visitors"), "Solo Performance");
  check("la descripcion de un rol desconocido", describirRol("root"), "Sin acceso");
}

console.log("\nPermisos: a donde entra cada uno");
{
  check("admin entra al menu", rutaInicial("admin"), "/");
  check("visitors entra derecho a performance", rutaInicial("visitors"), "/dashboards/performance");
}

console.log("\nPermisos: que rutas puede abrir cada rol");
{
  const rutas = ["/", "/dashboards/performance", "/dashboards/estado", "/api/performance", "/api/performance/historial", "/api/salud", "/api/kpis"];
  check("admin abre todo, incluso lo que no es una seccion", rutas.map((r) => puedeVer("admin", r)), rutas.map(() => true));
  check("visitors abre performance y sus endpoints", ["/dashboards/performance", "/api/performance", "/api/performance/historial"].map((r) => puedeVer("visitors", r)), [true, true, true]);
  check("visitors no abre el menu ni otras secciones ni sus endpoints", ["/", "/dashboards/estado", "/dashboards/operacion", "/api/salud", "/api/kpis", "/api/respuestas"].map((r) => puedeVer("visitors", r)), [false, false, false, false, false, false]);
  check("el prefijo se compara por segmento, no por texto", [puedeVer("visitors", "/dashboards/performance-privada"), puedeVer("visitors", "/api/performancex")], [false, false]);
  check("un rol desconocido no abre nada", puedeVer("root", "/dashboards/performance"), false);
}

console.log("\nSesion: firma y lectura");
{
  const secreto = "un-secreto-de-prueba-largo-y-aburrido";
  const ahora = new Date("2026-10-05T12:00:00Z");
  const duracionMs = 60 * 60 * 1000;
  const token = await firmarSesion({ usuario: "admin", rol: "admin" }, { secreto, ahora, duracionMs });

  check("el token tiene cuerpo y firma", token.split(".").length, 2);
  check("el token no lleva el secreto ni nada legible", token.includes(secreto) || token.includes("admin"), false);
  check("se lee lo mismo que se firmo, con vencimiento", await leerSesion(token, { secreto, ahora }), { usuario: "admin", rol: "admin", vence: ahora.getTime() + duracionMs });
  check("firmar dos veces lo mismo da el mismo token", await firmarSesion({ usuario: "admin", rol: "admin" }, { secreto, ahora, duracionMs }), token);

  const [cuerpo, firma] = token.split(".");
  const cuerpoAjeno = Buffer.from(JSON.stringify({ usuario: "visitors", rol: "admin", vence: ahora.getTime() + duracionMs })).toString("base64url");
  check("un cuerpo cambiado no pasa", await leerSesion(`${cuerpoAjeno}.${firma}`, { secreto, ahora }), null);
  check("una firma cambiada no pasa", await leerSesion(`${cuerpo}.${firma.slice(0, -2)}xx`, { secreto, ahora }), null);
  check("otro secreto no pasa", await leerSesion(token, { secreto: "otro", ahora }), null);
  check("sin secreto configurado nada pasa", await leerSesion(token, { secreto: undefined, ahora }), null);
  check("vencido no pasa", await leerSesion(token, { secreto, ahora: new Date(ahora.getTime() + duracionMs) }), null);
  check("un segundo antes de vencer todavia pasa", (await leerSesion(token, { secreto, ahora: new Date(ahora.getTime() + duracionMs - 1000) }))?.usuario, "admin");
  check("basura no pasa", await Promise.all(["", "a", "a.b", "a.b.c", null, undefined, 42].map((t) => leerSesion(t, { secreto, ahora }))), [null, null, null, null, null, null, null]);

  const cuerpoSinRol = Buffer.from(JSON.stringify({ usuario: "admin", vence: ahora.getTime() + duracionMs })).toString("base64url");
  const firmaSinRol = (await firmarSesion({ usuario: "x", rol: "x" }, { secreto, ahora, duracionMs })).split(".")[1];
  check("un cuerpo bien firmado pero incompleto no pasa", await leerSesion(`${cuerpoSinRol}.${firmaSinRol}`, { secreto, ahora }), null);
}

console.log("\nSesion: comparacion en tiempo constante y headers internos");
{
  check("iguales", igualesEnTiempoConstante("contraseña", "contraseña"), true);
  check("distintos del mismo largo", igualesEnTiempoConstante("abc", "abd"), false);
  check("distinto largo", igualesEnTiempoConstante("abc", "abcd"), false);
  check("vacio contra vacio", igualesEnTiempoConstante("", ""), true);
  check("undefined no es igual a vacio por accidente", igualesEnTiempoConstante(undefined, ""), false);
  check("los headers internos tienen prefijo propio", [HEADER_USUARIO, HEADER_ROL].every((h) => h.startsWith("x-backoffice-")), true);
}

console.log("\n" + ok + " OK, " + fail + " fallas");
process.exit(fail ? 1 : 0);
