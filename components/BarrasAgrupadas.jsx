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

export default function BarrasAgrupadas({ datos, series }) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={datos} margin={{ top: 4, right: 12, left: -16, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="#e8eef1" />
          <XAxis
            dataKey="nombre"
            tick={{ fontSize: 12, fill: "#5c6b76" }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "#8fa0aa" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: "rgba(16,49,75,0.05)" }} />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="square"
            iconSize={10}
          />
          {series.map((s) => (
            <Bar
              key={s.clave}
              dataKey={s.clave}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              barSize={16}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}