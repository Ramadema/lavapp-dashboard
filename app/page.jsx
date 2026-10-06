import Link from "next/link";
import EncabezadoSeccion from "@/components/EncabezadoSeccion";
import { gruposVisibles, seccionesVisibles } from "@/lib/auth/permisos";
import { sesionDelPedido } from "@/lib/auth/pedido";

// El menu muestra solo las secciones que el rol puede abrir: ofrecer una
// tarjeta que termina en un redirect seria un boton roto.
export default async function Inicio() {
  const rol = (await sesionDelPedido())?.rol;

  return (
    <>
      <EncabezadoSeccion
        titulo="Backoffice de LavApp"
        subtitulo="Tableros internos del producto. La app de gestión que usan los lavaderos vive aparte; acá se mira lo que esa app produce."
      />

      <main className="contenedor">
        {gruposVisibles(rol).map((grupo) => (
          <section key={grupo} className="grupo">
            <h2>{grupo}</h2>
            <div className="grilla-secciones">
              {seccionesVisibles(rol, grupo).map((seccion) => (
                <Link
                  key={seccion.slug}
                  href={seccion.ruta}
                  className="tarjeta-seccion"
                >
                  <div className="tarjeta-titulo">
                    <h3>{seccion.titulo}</h3>
                    <span
                      className={
                        "senal " +
                        (seccion.estado === "conectada" ? "ok" : "pendiente")
                      }
                    >
                      {seccion.estado === "conectada" ? "Con datos" : "Sin fuente"}
                    </span>
                  </div>
                  <p className="tarjeta-resumen">{seccion.resumen}</p>
                  <p className="tarjeta-origen">
                    <code>{seccion.endpoint}</code> · {seccion.origen}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <p className="nota">
          Cada sección lee su fuente al abrirse. Si la fuente no está configurada
          en este servidor o no responde, la pantalla lo dice en vez de mostrar
          números: ninguna muestra un dato inventado.
        </p>
      </main>
    </>
  );
}
