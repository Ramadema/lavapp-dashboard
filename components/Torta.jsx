"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

// Alto que reserva la leyenda abajo (entra en dos renglones si hay cuatro
// categorias): el centro de la dona queda ese medio alto mas arriba que el
// centro del contenedor, y el texto del centro lo compensa.
const ALTO_LEYENDA = 44;

// Dona para repartir un total entre pocas categorias (2 a 4: con mas, usar
// barras). En el centro va el numero que importa (`centro`) y debajo una
// aclaracion (`detalle`). Al pasar el mouse, el tooltip de Recharts flota
// sobre el grafico; va por encima del texto del centro (ver .torta-centro y
// .recharts-tooltip-wrapper en globals.css) para que, si se cruzan, lo tape
// entero y no se mezclen los textos. La leyenda tambien trae cantidad y
// porcentaje, para leerla sin mouse. Sin capa de accesibilidad de Recharts:
// hacia enfocable el SVG y el navegador le dibujaba un recuadro al hacer clic.
// Sin animacion: las capturas y las primeras lecturas la ven entera.
export default function Torta({ datos, colores, centro, detalle, alto = 230 }) {
  const total = datos.reduce((t, d) => t + d.valor, 0);
  const porciones = datos.filter((d) => d.valor > 0);
  const valorDe = Object.fromEntries(datos.map((d) => [d.nombre, d.valor]));
  const porcentajeDe = (valor) => (total > 0 ? Math.round((valor / total) * 100) : 0);
  const conPorcentaje = (nombre, valor) => `${nombre} ${valor} (${porcentajeDe(valor)}%)`;

  return (
    <div className="torta" style={{ width: "100%", height: alto }}>
      <ResponsiveContainer>
        <PieChart accessibilityLayer={false}>
          <Pie
            data={porciones}
            dataKey="valor"
            nameKey="nombre"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={porciones.length > 1 ? 2 : 0}
            stroke="none"
            isAnimationActive={false}
          >
            {porciones.map((d) => (
              <Cell key={d.nombre} fill={colores[d.nombre]} />
            ))}
          </Pie>
          <Tooltip
            wrapperStyle={{ zIndex: 2 }}
            formatter={(valor, nombre) => [`${valor} (${porcentajeDe(valor)}%)`, nombre]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, lineHeight: "20px" }}
            iconType="circle"
            iconSize={8}
            verticalAlign="bottom"
            height={ALTO_LEYENDA}
            formatter={(nombre) => conPorcentaje(nombre, valorDe[nombre] ?? 0)}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="torta-centro" style={{ top: `calc(50% - ${ALTO_LEYENDA / 2}px)` }}>
        <strong>{total > 0 ? centro : "–"}</strong>
        {detalle && <span>{total > 0 ? detalle : "sin datos"}</span>}
      </div>
    </div>
  );
}
