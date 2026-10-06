"use client";

import { useState } from "react";
import SeccionRemota from "@/components/SeccionRemota";
import TarjetaKpi from "@/components/TarjetaKpi";
import Lineas from "@/components/Lineas";
import BarrasHorizontales from "@/components/BarrasHorizontales";
import Torta from "@/components/Torta";
import Plegable from "@/components/Plegable";
import { buscarSeccion } from "@/lib/secciones";
import { ESTADOS, ESTADOS_ABIERTOS, PERIODO_POR_DEFECTO, PERIODOS } from "@/lib/kpis/operacion";
import { cantidad, diaYHora, minutos, fechaCorta, recortar } from "@/lib/formato";

const seccion = buscarSeccion("operacion");
const FUENTE = "la app de gestión";

// Las ordenes del periodo en tres grupos para la dona: lo que ya salio, lo que
// sigue en el lavadero y lo que se cancelo. Los colores son tokens de globals.css.
const ENTREGADAS = "Entregadas";
const EN_EL_LAVADERO = "En el lavadero";
const CANCELADAS = "Canceladas";
const COLORES_GRUPOS = {
  [ENTREGADAS]: "var(--verde)",
  [EN_EL_LAVADERO]: "var(--agua)",
  [CANCELADAS]: "var(--naranja)",
};

const SERIES_DIAS = [
  { clave: "Llegaron", color: "var(--agua)" },
  { clave: "Entregadas", color: "var(--verde)" },
];

const FILAS_VISIBLES = 8;

function grupoDe(estado) {
  if (estado === "ENTREGADO") return ENTREGADAS;
  if (ESTADOS_ABIERTOS.includes(estado)) return EN_EL_LAVADERO;
  return CANCELADAS;
}

function detalleDeDemora(medianaMin, entregas) {
  if (entregas === 0) return "de la llegada a la entrega · sin entregas en el período";
  return `mediana ${minutos(medianaMin)} · de la llegada a la entrega · ${cantidad(entregas)} entregas`;
}

function detalleDeMedida(cantidadMedida, texto, sinDatos) {
  return cantidadMedida === 0 ? sinDatos : `${texto} · ${cantidad(cantidadMedida)} órdenes`;
}

export default function PaginaOperacion() {
  const [dias, setDias] = useState(PERIODO_POR_DEFECTO);

  return (
    <SeccionRemota
      seccion={seccion}
      fuente={FUENTE}
      parametros={{ dias }}
      controles={({ ocupado }) => (
        <div className="filtros" role="group" aria-label="Período">
          <span>Últimos</span>
          {PERIODOS.map((d) => (
            <button
              key={d}
              type="button"
              className={"chip" + (d === dias ? " activo" : "")}
              onClick={() => setDias(d)}
              disabled={ocupado}
              aria-pressed={d === dias}
            >
              {d} días
            </button>
          ))}
        </div>
      )}
    >
      {(datos) => <Tablero datos={datos} />}
    </SeccionRemota>
  );
}

function Tablero({ datos }) {
  const {
    periodo,
    totales,
    demoraPromedioMin,
    demoraMedianaMin,
    esperaPromedioMin,
    lavadoPromedioMin,
    medidas,
    porDia,
    porLavadero,
    porServicio,
    porEstado,
    ordenes,
  } = datos;

  const serieDias = porDia.map((d) => ({
    nombre: fechaCorta(d.dia),
    Llegaron: d.llegaron,
    Entregadas: d.entregadas,
  }));
  const servicios = porServicio.map((s) => ({ nombre: recortar(s.servicio, 28), valor: s.ordenes }));
  const grupos = [ENTREGADAS, EN_EL_LAVADERO, CANCELADAS].map((nombre) => ({
    nombre,
    valor: porEstado
      .filter((e) => grupoDe(e.estado) === nombre)
      .reduce((total, e) => total + e.ordenes, 0),
  }));

  return (
    <>
      <div className="grilla-kpis">
        <TarjetaKpi
          etiqueta="En cola ahora"
          valor={cantidad(totales.enCola)}
          detalle="vehículos esperando que empiece su lavado"
        />
        <TarjetaKpi
          etiqueta="En lavado ahora"
          valor={cantidad(totales.enLavado)}
          detalle={`${cantidad(totales.listos)} listos para retirar`}
        />
        <TarjetaKpi
          etiqueta={`Órdenes en ${periodo.dias} días`}
          valor={cantidad(totales.ordenes)}
          detalle={`${cantidad(totales.entregadas)} entregadas · ${cantidad(totales.canceladas)} canceladas`}
        />
        <TarjetaKpi
          etiqueta="Demora promedio"
          valor={minutos(demoraPromedioMin)}
          detalle={detalleDeDemora(demoraMedianaMin, medidas.demoras)}
        />
        <TarjetaKpi
          etiqueta="Espera promedio"
          valor={minutos(esperaPromedioMin)}
          detalle={detalleDeMedida(
            medidas.esperas,
            "de la llegada al inicio del lavado",
            "ninguna orden del período empezó a lavarse"
          )}
        />
        <TarjetaKpi
          etiqueta="Lavado promedio"
          valor={minutos(lavadoPromedioMin)}
          detalle={detalleDeMedida(
            medidas.lavados,
            "del inicio al fin del lavado",
            "ninguna orden del período terminó de lavarse"
          )}
        />
      </div>

      <section className="panel">
        <h2>Llegadas y entregas por día</h2>
        <p className="subtitulo">
          Órdenes que llegaron cada día del período y cuántas de ellas se entregaron ese día.
        </p>
        <Lineas datos={serieDias} series={SERIES_DIAS} />
      </section>

      <div className="dos-columnas">
        <section className="panel">
          <h2>Servicios más pedidos</h2>
          {servicios.length === 0 ? (
            <p className="motivo">Sin órdenes en el período.</p>
          ) : (
            <BarrasHorizontales
              datos={servicios}
              color="var(--agua)"
              etiquetaValor="Órdenes"
              anchoEtiquetas={200}
            />
          )}
        </section>
        <section className="panel">
          <h2>Las órdenes del período, de un vistazo</h2>
          <Torta
            datos={grupos}
            colores={COLORES_GRUPOS}
            centro={cantidad(totales.ordenes)}
            detalle="órdenes"
          />
        </section>
      </div>

      <section className="panel">
        <h2>Por lavadero</h2>
        {porLavadero.length === 0 ? (
          <p className="motivo">Sin órdenes en el período.</p>
        ) : (
          <div className="contrato">
            <table>
              <thead>
                <tr>
                  <th>Lavadero</th>
                  <th>Órdenes</th>
                  <th>Entregadas</th>
                  <th>En cola ahora</th>
                  <th>Demora promedio</th>
                </tr>
              </thead>
              <tbody>
                {porLavadero.map((l) => (
                  <tr key={l.lavadero}>
                    <td>{l.lavadero}</td>
                    <td>{cantidad(l.ordenes)}</td>
                    <td>{cantidad(l.entregadas)}</td>
                    <td>{cantidad(l.enCola)}</td>
                    <td>{minutos(l.demoraPromedioMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Últimas órdenes</h2>
        <p className="subtitulo">
          Las del período más las que siguen en el lavadero aunque hayan llegado antes.
        </p>
        {ordenes.length === 0 ? (
          <p className="motivo">Todavía no hay órdenes cargadas en la app de gestión.</p>
        ) : (
          <Plegable items={ordenes} visibles={FILAS_VISIBLES}>
            {(porcion) => <TablaDeOrdenes ordenes={porcion} />}
          </Plegable>
        )}
      </section>
    </>
  );
}

function TablaDeOrdenes({ ordenes }) {
  return (
    <div className="contrato">
      <table>
        <thead>
          <tr>
            <th>Llegada</th>
            <th>Lavadero</th>
            <th>Patente</th>
            <th>Servicio</th>
            <th>Estado</th>
            <th>Espera</th>
            <th>Lavado</th>
            <th>Demora</th>
          </tr>
        </thead>
        <tbody>
          {ordenes.map((o) => (
            <tr key={o.id}>
              <td>
                {diaYHora(o.llegada)}
                {!o.delPeriodo && <span className="subtexto">antes del período</span>}
              </td>
              <td>{o.lavadero}</td>
              <td>{o.patente}</td>
              <td>{o.servicio}</td>
              <td>{ESTADOS[o.estado]}</td>
              <td>{minutos(o.esperaMin)}</td>
              <td>{minutos(o.lavadoMin)}</td>
              <td>{minutos(o.demoraMin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
