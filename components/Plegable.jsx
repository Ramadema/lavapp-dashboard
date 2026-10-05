"use client";

import { useState } from "react";

// Muestra los primeros `visibles` elementos de `items` y un boton para ver el
// resto. `children` es una funcion que recibe la porcion a dibujar, asi sirve
// para una tabla, una lista o un grafico de barras. Siempre arranca plegado:
// la pantalla se lee de un vistazo y el detalle se abre a pedido.
export default function Plegable({ items, visibles = 5, children }) {
  const [abierto, setAbierto] = useState(false);
  const ocultos = items.length - visibles;
  const porcion = abierto || ocultos <= 0 ? items : items.slice(0, visibles);
  return (
    <>
      {children(porcion)}
      {ocultos > 0 && (
        <button
          type="button"
          className="chip plegable"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
        >
          {abierto ? "Mostrar menos" : `Ver ${ocultos} más`}
        </button>
      )}
    </>
  );
}
