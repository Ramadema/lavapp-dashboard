"use client";

import SeccionRemota from "@/components/SeccionRemota";
import TarjetaKpi from "@/components/TarjetaKpi";
import BarrasHorizontales from "@/components/BarrasHorizontales";
import BarrasApiladas from "@/components/BarrasApiladas";
import Plegable from "@/components/Plegable";
import { buscarSeccion } from "@/lib/secciones";
import { DIAS_RECURRENCIA, LAVADOS_PARA_RECURRENTE } from "@/lib/kpis/clientes";
import { cantidad, diaYHora, recortar } from "@/lib/formato";

const seccion = buscarSeccion("clientes");
const FUENTE = "la app de gestión";

// Los clientes de cada lavadero apilados por tipo; los colores son tokens de
// globals.css.
const SERIES_TIPOS = [
  { clave: "Recurrentes", color: "var(--verde)" },
  { clave: "Ocasionales", color: "var(--agua)" },
  { clave: "Sin lavados", color: "var(--tinta-clara)" },
];

const FILAS_VISIBLES = 10;

export default function PaginaClientes() {
  return (
    <SeccionRemota seccion={seccion} fuente={FUENTE}>
      {(datos) => <Tablero datos={datos} />}
    </SeccionRemota>
  );
}

function Tablero({ datos }) {
  const { totales, porLavadero, distribucionLavados, clientes } = datos;
  const porTipo = porLavadero.map((l) => ({
    nombre: recortar(l.lavadero, 24),
    Recurrentes: l.recurrentes,
    Ocasionales: l.ocasionales,
    "Sin lavados": l.sinLavados,
  }));

  return (
    <>
      <div className="grilla-kpis">
        <TarjetaKpi
          etiqueta="Clientes"
          valor={cantidad(totales.clientes)}
          detalle={`${cantidad(totales.vehiculos)} vehículos registrados`}
        />
        <TarjetaKpi
          etiqueta="Recurrentes"
          valor={cantidad(totales.recurrentes)}
          detalle={`${LAVADOS_PARA_RECURRENTE} o más lavados en los últimos ${DIAS_RECURRENCIA} días`}
        />
        <TarjetaKpi
          etiqueta="Nuevos del mes"
          valor={cantidad(totales.nuevosDelMes)}
          detalle="dados de alta en el mes corriente"
        />
        <TarjetaKpi
          etiqueta="Lavados por cliente"
          valor={cantidad(totales.lavadosPorCliente)}
          detalle={`${cantidad(totales.lavados)} lavados en total, históricos`}
        />
        <TarjetaKpi
          etiqueta="Sin lavados"
          valor={cantidad(totales.sinLavados)}
          detalle="clientes cargados que nunca lavaron"
        />
      </div>

      <div className="dos-columnas">
        <section className="panel">
          <h2>Cuántas veces vuelven</h2>
          <p className="subtitulo">Clientes según su cantidad total de lavados.</p>
          <BarrasHorizontales
            datos={distribucionLavados}
            color="var(--agua)"
            etiquetaValor="Clientes"
          />
        </section>
        <section className="panel">
          <h2>Clientes por lavadero</h2>
          <p className="subtitulo">
            Recurrentes, ocasionales (al menos un lavado) y sin lavados, por cuenta.
          </p>
          {porTipo.length === 0 ? (
            <p className="motivo">Todavía no hay clientes en la app de gestión.</p>
          ) : (
            <BarrasApiladas datos={porTipo} series={SERIES_TIPOS} anchoEtiquetas={190} />
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Los clientes</h2>
        <p className="subtitulo">De más a menos lavados.</p>
        {clientes.length === 0 ? (
          <p className="motivo">Todavía no hay clientes en la app de gestión.</p>
        ) : (
          <Plegable items={clientes} visibles={FILAS_VISIBLES}>
            {(porcion) => <TablaDeClientes clientes={porcion} />}
          </Plegable>
        )}
      </section>
    </>
  );
}

function TablaDeClientes({ clientes }) {
  return (
    <div className="contrato">
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Lavadero</th>
            <th>Vehículos</th>
            <th>Lavados</th>
            <th>Últimos {DIAS_RECURRENCIA} días</th>
            <th>Último lavado</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td>
                {c.nombre}
                {c.recurrente && <span className="subtexto">recurrente</span>}
              </td>
              <td>{c.lavadero}</td>
              <td>{cantidad(c.vehiculos)}</td>
              <td>{cantidad(c.lavados)}</td>
              <td>{cantidad(c.lavadosRecientes)}</td>
              <td>
                {c.ultimoLavado ? diaYHora(c.ultimoLavado) : "nunca"}
                {c.diasDesdeUltimoLavado !== null && c.diasDesdeUltimoLavado > 0 && (
                  <span className="subtexto">hace {c.diasDesdeUltimoLavado} días</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
