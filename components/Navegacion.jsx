"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GRUPOS, seccionesDelGrupo } from "@/lib/secciones";

export default function Navegacion() {
  const ruta = usePathname();

  return (
    <nav className="navegacion" aria-label="Secciones del backoffice">
      <Link href="/" className={"nav-enlace" + (ruta === "/" ? " activo" : "")}>
        Inicio
      </Link>

      {GRUPOS.map((grupo) => (
        <div key={grupo} className="nav-grupo">
          <p className="nav-titulo">{grupo}</p>
          {seccionesDelGrupo(grupo).map((seccion) => (
            <Link
              key={seccion.slug}
              href={seccion.ruta}
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
