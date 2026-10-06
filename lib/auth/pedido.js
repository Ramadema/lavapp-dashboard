// La sesion del pedido que se esta atendiendo, para los server components.
//
// El proxy ya valido la cookie y dejo usuario y rol en dos headers internos;
// aca solo se leen. Esta aparte de lib/auth.js para que el proxy, que importa
// ese modulo, no arrastre next/headers, que no se puede usar ahi.

import { headers } from "next/headers";
import { HEADER_ROL, HEADER_USUARIO } from "./sesion.js";

// { usuario, rol } o null si el pedido llego sin sesion (solo pasa en /login).
export async function sesionDelPedido() {
  const cabeceras = await headers();
  const usuario = cabeceras.get(HEADER_USUARIO);
  const rol = cabeceras.get(HEADER_ROL);
  return usuario && rol ? { usuario, rol } : null;
}
