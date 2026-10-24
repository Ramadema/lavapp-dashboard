// Que puede ver cada rol del backoffice.
//
// Es la unica fuente de verdad de los roles y de que secciones ve cada uno. La
// lee el proxy (para cortar un pedido antes de que llegue a la pagina o a la
// API), la navegacion y el menu inicial (para no ofrecer lo que no se puede
// abrir) y la pantalla de login (para saber a donde mandar a cada uno).
// Modulo puro: sin React, sin fetch, sin process.env. Importa el registro de
// secciones con ruta relativa para que los tests lo corran con Node pelado.

import { GRUPOS, SECCIONES } from "../secciones.js";

export const ROLES = { ADMIN: "admin", VISITORS: "visitors" };

// @decision 2026-10-05 ramiro@mispichos.com
// El backoffice tiene dos usuarios fijos. "visitors" existe para compartir el
// avance del proyecto con gente de afuera del equipo, asi que ve solo
// Performance; "admin" ve todo. Se descarto un esquema de permisos por seccion
// configurable: con dos usuarios es mas de lo que hace falta y seria otra cosa
// que mantener.
//
// @decision 2026-10-24 ramiro@mispichos.com
// "visitors" ve tambien «Avance e inversion», la seccion para el cliente, y
// entra por ella: es lo que mira quien pone la plata. Performance le sigue
// abierta, para quien quiera ver como trabaja el equipo.
const SLUGS_POR_ROL = {
  [ROLES.ADMIN]: SECCIONES.map((s) => s.slug),
  [ROLES.VISITORS]: ["inversion", "performance"],
};

// Por donde entra un rol que no usa el menu: el slug de su primera pantalla.
const INICIO_POR_ROL = {
  [ROLES.VISITORS]: "inversion",
};

export const esRol = (rol) => Object.hasOwn(SLUGS_POR_ROL, rol);

// Las secciones que ve un rol, en el orden del registro, opcionalmente solo las
// de un grupo. Un rol desconocido no ve ninguna: ante la duda, nada.
export function seccionesVisibles(rol, grupo) {
  if (!esRol(rol)) return [];
  const slugs = SLUGS_POR_ROL[rol];
  return SECCIONES.filter(
    (s) => slugs.includes(s.slug) && (grupo === undefined || s.grupo === grupo)
  );
}

// Los grupos que tienen al menos una seccion visible, en el orden de GRUPOS.
export const gruposVisibles = (rol) =>
  GRUPOS.filter((grupo) => seccionesVisibles(rol, grupo).length > 0);

// A donde entra cada rol despues de iniciar sesion. El inicio es el menu de
// todas las secciones; quien tiene una entrada propia (INICIO_POR_ROL) va
// derecho a ella, y quien ve una sola seccion, a la unica que tiene.
export function rutaInicial(rol) {
  const visibles = seccionesVisibles(rol);
  const propia = visibles.find((s) => s.slug === INICIO_POR_ROL[rol]);
  if (propia) return propia.ruta;
  return visibles.length === 1 ? visibles[0].ruta : "/";
}

// Como se describe el acceso de un rol, para mostrarlo al lado del usuario.
export function describirRol(rol) {
  const visibles = seccionesVisibles(rol);
  if (visibles.length === SECCIONES.length) return "Acceso completo";
  if (visibles.length === 0) return "Sin acceso";
  const titulos = visibles.map((s) => s.titulo);
  return "Solo " + (titulos.length === 1 ? titulos[0] : `${titulos.slice(0, -1).join(", ")} y ${titulos.at(-1)}`);
}

// Si una ruta esta dentro de una base: la base misma o algo colgado de ella.
// "/dashboards/performance-x" no esta dentro de "/dashboards/performance".
const dentroDe = (ruta, base) => ruta === base || ruta.startsWith(base + "/");

// Si el rol puede abrir esa ruta (el pathname, sin query): una pantalla o un
// endpoint. Admin ve todo, incluso lo que no cuelga de una seccion (como
// /api/kpis). Los demas ven las pantallas y los endpoints de sus secciones, y el
// inicio solo si tienen algo que elegir ahi.
export function puedeVer(rol, ruta) {
  if (!esRol(rol)) return false;
  if (rol === ROLES.ADMIN) return true;
  if (ruta === "/") return rutaInicial(rol) === "/";
  return seccionesVisibles(rol).some(
    (s) => dentroDe(ruta, s.ruta) || dentroDe(ruta, s.endpoint)
  );
}
