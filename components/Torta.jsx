"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

// Alto que reserva la leyenda abajo: el centro de la dona queda ese medio alto
// mas arriba que el centro del contenedor, y el texto del centro lo compensa.
const ALTO_LEYENDA = 30;

// Dona para repartir un total entre pocas categorias (2 a 4: con mas, usar
// barras). En el centro va el numero que importa (`centro`) y debajo una
// aclaracion (`detalle`). Sin animacion: las capturas y las primeras lecturas
// la ven entera desde el primer frame.
export default function Torta({ datos, colores, centro, detalle, alto = 220 }) {
  const total = datos.reduce((t, d) => t + d.valor, 0);
  const porciones = datos.filter((d) => d.valor > 0);
  return (
    <div className="torta" style={{ width: "100%", height: alto }}>
      <ResponsiveContainer>
        <PieChart>
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
            formatter={(valor, nombre) => [
              `${valor} (${total > 0 ? Math.round((valor / total) * 100) : 0}%)`,
              nombre,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="circle"
            iconSize={8}
            verticalAlign="bottom"
            height={ALTO_LEYENDA}
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
