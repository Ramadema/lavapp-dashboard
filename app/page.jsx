"use client";

import { useEffect, useMemo, useState } from "react";
import TarjetaKpi from "@/components/TarjetaKpi";
import BarrasHorizontales from "@/components/BarrasHorizontales";
import BarrasAgrupadas from "@/components/BarrasAgrupadas";

const FILTROS_REGISTRO = [
  "Todos",
  "Papel/pizarra",
  "Excel/Sheets",
  "Sistema de gestion",
  "Sin registro",
];

const ORDEN_FRECUENCIA = [
  "Nunca",
  "Casi nunca",
  "A veces",
  "Frecuentemente",
  "Casi siempre",
  "Siempre",
];

const contar = (arr, campo) =>
  arr.reduce((acc, r) => {
    acc[r[campo]] = (acc[r[campo]] || 0) + 1;
    return acc;
  }, {});

const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0);

export default function Dashboard() {
  const [respuestas, setRespuestas] = useState(null);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("Todos");

  useEffect(() => {
    fetch("/api/respuestas")
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(setRespuestas)
      .catch(() => setError(true));
  }, []);

  const datos = useMemo(() => {
    if (!respuestas) return [];
    return filtro === "Todos"
      ? respuestas
      : respuestas.filter((r) => r.registro === filtro);
  }, [respuestas, filtro]);

  const kpis = useMemo(() => {
    const n = datos.length;
    if (!n) return null;
    const entre = (campo, valores) =>
      datos.filter((r) => valores.includes(r[campo])).length;
    const manual = entre("registro", [
      "Papel/pizarra",
      "Excel/Sheets",
      "Sin registro",
    ]);
    return {
      n,
      manual: pct(manual, n),
      altaDemanda: pct(
        entre("frecuenciaAltaDemanda", ["3-4 dias/sem", "Todos los dias"]),
        n
      ),
      picos: pct(entre("volumenPico", ["Entre 20 y 50", "Mas de 50"]), n),
      pierden: pct(entre("abandonoCliente", ["A veces", "Casi siempre"]), n),
      pierdenSiempre: pct(entre("abandonoCliente", ["Casi siempre"]), n),
      fallan: pct(entre("desvioEstimacion", ["A veces", "Casi siempre"]), n),
      consultan: pct(entre("consultasTiempo", ["Frecuentemente", "Siempre"]), n),
      conDificultad: pct(
        n - entre("mayorDificultad", ["Ninguna"]),
        n
      ),
      promOrden:
        Math.round(
          (datos.reduce((s, r) => s + r.dificultadOrden, 0) / n) * 10
        ) / 10,
      promEstimar:
        Math.round(
          (datos.reduce((s, r) => s + r.dificultadEstimar, 0) / n) * 10
        ) / 10,
    };
  }, [datos]);

  const dificultades = useMemo(() => {
    const c = contar(datos, "mayorDificultad");
    return Object.entries(c)
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [datos]);

  const registros = useMemo(() => {
    const c = contar(datos, "registro");
    return Object.entries(c)
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [datos]);

  const friccion = useMemo(() => {
    const c1 = contar(datos, "consultasTiempo");
    const c2 = contar(datos, "desvioEstimacion");
    const c3 = contar(datos, "abandonoCliente");
    return ORDEN_FRECUENCIA.filter(
      (f) => c1[f] || c2[f] || c3[f]
    ).map((f) => ({
      nombre: f,
      "Consultan tiempo": c1[f] || 0,
      "Estimación falla": c2[f] || 0,
      "Cliente se va": c3[f] || 0,
    }));
  }, [datos]);

  const likert = useMemo(() => {
    const filas = [1, 2, 3, 4, 5].map((nivel) => ({
      nombre: String(nivel),
      "Orden en picos": datos.filter((r) => r.dificultadOrden === nivel).length,
      "Estimar tiempos": datos.filter((r) => r.dificultadEstimar === nivel)
        .length,
    }));
    return filas;
  }, [datos]);

  if (error)
    return (
      <div className="contenedor error">
        <strong>No se pudo conectar con la API.</strong>
        <br />
        No se pudieron cargar las respuestas de la encuesta. Probá recargar la
        página.
      </div>
    );

  if (!respuestas) return <div className="contenedor cargando">Cargando encuesta…</div>;

  return (
    <>
      <header className="cabecera">
        <div className="contenedor">
          <div className="marca">
            <h1>
              Lav<span>App</span>
            </h1>
            <small>Encuesta a lavaderos · n = {respuestas.length}</small>
          </div>
          <p>
            Indicadores de la encuesta sobre gestión operativa de lavaderos de
            autos. Los KPIs se recalculan al filtrar por método de registro
            actual.
          </p>
        </div>
      </header>

      <main className="contenedor">
        <div className="filtros" role="group" aria-label="Filtrar por método de registro">
          <span>Método de registro:</span>
          {FILTROS_REGISTRO.map((f) => (
            <button
              key={f}
              className={"chip" + (filtro === f ? " activo" : "")}
              onClick={() => setFiltro(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {kpis && (
          <>
            <div className="grilla-kpis">
              <TarjetaKpi
                etiqueta="Respuestas en el segmento"
                valor={kpis.n}
                detalle={`de ${respuestas.length} totales`}
              />
              <TarjetaKpi
                etiqueta="Gestión manual o nula"
                valor={`${kpis.manual}%`}
                detalle="papel, planilla o sin registro"
              />
              <TarjetaKpi
                etiqueta="Pierden clientes por espera"
                valor={`${kpis.pierden}%`}
                detalle={`${kpis.pierdenSiempre}% casi siempre`}
                critico
              />
              <TarjetaKpi
                etiqueta="Estimaciones que fallan"
                valor={`${kpis.fallan}%`}
                detalle='desvían al menos "a veces"'
              />
            </div>
            <div className="grilla-kpis">
              <TarjetaKpi
                etiqueta="Alta demanda 3+ días/sem"
                valor={`${kpis.altaDemanda}%`}
              />
              <TarjetaKpi
                etiqueta="Picos de 20+ vehículos"
                valor={`${kpis.picos}%`}
              />
              <TarjetaKpi
                etiqueta="Consultas frecuentes de espera"
                valor={`${kpis.consultan}%`}
              />
              <TarjetaKpi
                etiqueta="Reportan alguna dificultad"
                valor={`${kpis.conDificultad}%`}
              />
            </div>
          </>
        )}

        <div className="dos-columnas">
          <section className="panel">
            <h2>Método de registro</h2>
            <p className="subtitulo">Cómo registran hoy los vehículos</p>
            <BarrasHorizontales datos={registros} color="#0fa3b1" />
          </section>
          <section className="panel">
            <h2>Principal dificultad declarada</h2>
            <p className="subtitulo">Mayor problema de la gestión diaria</p>
            <BarrasHorizontales datos={dificultades} color="#10314b" />
          </section>
        </div>

        <section className="panel">
          <h2>Fricción con el cliente</h2>
          <p className="subtitulo">
            Frecuencia de consultas de espera, desvíos de estimación y abandono
          </p>
          <BarrasAgrupadas
            datos={friccion}
            series={[
              { clave: "Consultan tiempo", color: "#0fa3b1" },
              { clave: "Estimación falla", color: "#eb6834" },
              { clave: "Cliente se va", color: "#d85a30" },
            ]}
          />
        </section>

        <section className="panel">
          <h2>Dificultad percibida (escala 1–5)</h2>
          <p className="subtitulo">
            Mantener el orden en picos (prom. {kpis?.promOrden ?? "–"}) vs.
            estimar tiempos (prom. {kpis?.promEstimar ?? "–"})
          </p>
          <BarrasAgrupadas
            datos={likert}
            series={[
              { clave: "Orden en picos", color: "#0fa3b1" },
              { clave: "Estimar tiempos", color: "#10314b" },
            ]}
          />
        </section>

        <p className="nota">
          Fuente: encuesta propia a 40 lavaderos (agosto 2026). Muestreo no
          probabilístico; los porcentajes describen la muestra y no son
          generalizables al mercado. Las escalas de frecuencia difieren entre
          preguntas del instrumento original.
        </p>
      </main>
    </>
  );
}
