"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { gruposVisibles, puedeVer, seccionesVisibles } from "@/lib/auth/permisos";

// Dibuja solo lo que el rol puede abrir. Para quien ve una sola seccion el
// inicio no existe (va derecho a ella), asi que tampoco se le ofrece.
//
// `prefetch={false}` apaga la precarga automatica de Next: por defecto pide en
// segundo plano todas las secciones que esten a la vista, y la barra lateral
// las tiene todas. Eso llenaba la pestaña Red de pedidos que no se usan y
// tapaba los de verdad. Next igual precarga al pasar el mouse por encima, asi
// que la navegacion sigue siendo instantanea.
export default function Navegacion({ rol }) {
  const ruta = usePathname();

  return (
    <nav className="navegacion" aria-label="Secciones del backoffice">
      {puedeVer(rol, "/") && (
        <Link href="/" prefetch={false} className={"nav-enlace" + (ruta === "/" ? " activo" : "")}>
          Inicio
        </Link>
      )}

      {gruposVisibles(rol).map((grupo) => (
        <div key={grupo} className="nav-grupo">
          <p className="nav-titulo">{grupo}</p>
          {seccionesVisibles(rol, grupo).map((seccion) => (
            <Link
              key={seccion.slug}
              href={seccion.ruta}
              prefetch={false}
              className={"nav-enlace" + (ruta === seccion.ruta ? " activo" : "")}
            >
              <span>{seccion.titulo}</span>
              {seccion.estado === "pendiente" && (
                <span className="punto" title="Sin fuente conectada" />
              )}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
