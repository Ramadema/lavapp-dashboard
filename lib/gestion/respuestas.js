// La respuesta de un route.js de Gestion cuando lib/gestion.js no pudo leer:
// 501 si faltan las variables (la ruta existe, la conexion no; se publica el
// contrato como en cualquier seccion sin fuente) y 502 si la app de gestion
// fallo (el error es del servicio de atras, no de este). Esta aca y no repetido
// en cada route.js para que las cuatro secciones contesten igual.
import { cuerpoSinFuente, ESTADO_SIN_FUENTE } from "@/lib/secciones";

export function sinDatos(slug, { fuente, motivo }) {
  if (fuente === "sin-configurar") {
    return Response.json(cuerpoSinFuente(slug, motivo), { status: ESTADO_SIN_FUENTE });
  }
  return Response.json({ conectada: false, seccion: slug, fuente, motivo }, { status: 502 });
}
