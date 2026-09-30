"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

// Barras horizontales apiladas: una barra por categoria, partida en las series,
// para ver a la vez el total de cada una y como se compone. Se apilan en el
// orden de `series`: la primera queda pegada al eje. El alto se calcula solo
// segun la cantidad de filas.
export default function BarrasApiladas({ datos, series, anchoEtiquetas = 170 }) {
  const alto = Math.max(180, datos.length * 42 + 60);
  return (
    <div style={{ width: "100%", height: alto }}>
      <ResponsiveContainer>
        <BarChart
          data={datos}
          layout="vertical"
          margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
        >
          <CartesianGrid horizontal={false} stroke="#e8eef1" />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "#8fa0aa" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="nombre"
            width={anchoEtiquetas}
            tick={{ fontSize: 12, fill: "#5c6b76" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: "rgba(16,49,75,0.05)" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={10} />
          {series.map((s, i) => (
            <Bar
              key={s.clave}
              dataKey={s.clave}
              stackId="pila"
              fill={s.color}
              barSize={20}
              radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
