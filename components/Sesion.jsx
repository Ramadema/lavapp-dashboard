"use client";

import { useState } from "react";
import { describirRol } from "@/lib/auth/permisos";

// Quien esta adentro y el boton para salir. Va al pie de la barra lateral.
export default function Sesion({ usuario, rol }) {
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Carga completa: la barra lateral se arma en el servidor segun la sesion y
    // tiene que desaparecer, no solo cambiar de pagina.
    window.location.assign("/login");
  }

  return (
    <div className="sesion">
      <p className="sesion-usuario">
        <strong>{usuario}</strong>
        <span>{describirRol(rol)}</span>
      </p>
      <button type="button" className="sesion-salir" onClick={salir} disabled={saliendo}>
        {saliendo ? "Saliendo…" : "Salir"}
      </button>
    </div>
  );
}
