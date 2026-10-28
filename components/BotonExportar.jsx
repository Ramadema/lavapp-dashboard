"use client";

import { useState } from "react";

// Baja el informe que ya está en pantalla. El servidor arma el Excel con los
// mismos números; el botón no vuelve a pedir Shortcut.
export default function BotonExportar({ href, reporte, nombre }) {
  const [ocupado, setOcupado] = useState(false);
  const [falla, setFalla] = useState(false);

  async function exportar() {
    setOcupado(true);
    setFalla(false);
    try {
      const res = await fetch(href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reporte),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setFalla(true);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <button type="button" className="chip" onClick={exportar} disabled={ocupado || !reporte}>
      {ocupado ? "Exportando…" : falla ? "No se pudo exportar" : "Exportar Excel"}
    </button>
  );
}
