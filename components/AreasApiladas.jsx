"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

// Varias series apiladas sobre el mismo eje X, para ver como se reparte un
// total en el tiempo. Se apilan en el orden de `series`: la primera queda abajo.
// Un `null` corta la pila en ese punto: sirve para no inventar los dias que
// todavia no pasaron.
export default function AreasApiladas({ datos, series }) {
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <AreaChart data={datos} margin={{ top: 8, right: 16, left: -16, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="#e8eef1" />
          <XAxis
            dataKey="nombre"
            tick={{ fontSize: 12, fill: "#5c6b76" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "#8fa0aa" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={10} />
          {series.map((s) => (
            <Area
              key={s.clave}
              dataKey={s.clave}
              stackId="pila"
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.85}
              strokeWidth={1}
              connectNulls={false}
              type="linear"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
