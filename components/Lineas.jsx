"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

// Una o varias series sobre el mismo eje X. Un valor `null` corta la linea en
// ese punto en vez de dibujarla en cero: sirve para no inventar los dias que
// todavia no pasaron.
export default function Lineas({ datos, series }) {
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={datos} margin={{ top: 8, right: 16, left: -16, bottom: 4 }}>
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
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
          {series.map((s) => (
            <Line
              key={s.clave}
              dataKey={s.clave}
              stroke={s.color}
              strokeWidth={s.grosor ?? (s.punteada ? 1.5 : 2.5)}
              strokeDasharray={s.punteada ? "6 4" : undefined}
              dot={false}
              connectNulls={false}
              type="linear"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
