"use client";

import SeccionRemota from "@/components/SeccionRemota";
import TarjetaKpi from "@/components/TarjetaKpi";
import Torta from "@/components/Torta";
import BarrasHorizontales from "@/components/BarrasHorizontales";
import BarrasAgrupadas from "@/components/BarrasAgrupadas";
import Plegable from "@/components/Plegable";
import { buscarSeccion } from "@/lib/secciones";
import { DIAS_ACTIVA, ESTADOS_CUENTA } from "@/lib/kpis/lavaderos";
import { cantidad, diaYHora, fechaCorta, mesCorto, recortar } from "@/lib/formato";

const seccion = buscarSeccion("lavaderos");
const FUENTE = "la app de gestión";

// Un color por plan, en el orden en que vienen (de mas cuentas a menos). Son
// tokens de globals.css.
const PALETA_PLANES = [
  "var(--agua)",
  "var(--naranja)",
  "var(--tinta-clara)",
  "var(--verde)",
  "var(--agua-oscura)",
  "var(--gris-suave)",
];
const MAXIMO_PARA_DONA = 4;

const SERIES_ALTAS = [{ clave: "Altas", color: "var(--agua)" }];

// El tono de la señal con que se pinta cada estado de cuenta.
const TONOS_ESTADO = { activa: "ok", inactiva: "pendiente", suspendida: "alerta" };

const FILAS_VISIBLES = 10;

export default function PaginaLavaderos() {
  return (
    <SeccionRemota seccion={seccion} fuente={FUENTE}>
      {(datos) => <Tablero datos={datos} />}
    </SeccionRemota>
  );
}

function Tablero({ datos }) {
  const { totales, porPlan, porCiudad, altasPorMes, lavaderos } = datos;
  const coloresPlanes = Object.fromEntries(
    porPlan.map((p, i) => [p.nombre, PALETA_PLANES[i % PALETA_PLANES.length]])
  );
  const ciudades = porCiudad.map((c) => ({ nombre: recortar(c.nombre, 28), valor: c.valor }));
  const altas = altasPorMes.map((m) => ({ nombre: mesCorto(m.mes), Altas: m.altas }));

  return (
    <>
      <div className="grilla-kpis">
        <TarjetaKpi
          etiqueta="Cuentas"
          valor={cantidad(totales.cuentas)}
          detalle={`${cantidad(totales.sucursales)} sucursales declaradas`}
        />
        <TarjetaKpi
          etiqueta="Activas"
          valor={cantidad(totales.activas)}
          detalle={`con alguna orden en los últimos ${DIAS_ACTIVA} días`}
        />
        <TarjetaKpi
          etiqueta="Sin actividad"
          valor={cantidad(totales.inactivas)}
          detalle={`dadas de alta pero sin órdenes en ${DIAS_ACTIVA} días`}
        />
        <TarjetaKpi
          etiqueta="Suspendidas"
          valor={cantidad(totales.suspendidas)}
          detalle="desactivadas en la app de gestión"
          critico={totales.suspendidas > 0}
        />
        <TarjetaKpi
          etiqueta="Altas del mes"
          valor={cantidad(totales.altasDelMes)}
          detalle="cuentas creadas en el mes corriente"
        />
      </div>

      <div className="dos-columnas">
        <section className="panel">
          <h2>Cuentas por plan</h2>
          {porPlan.length === 0 ? (
            <p className="motivo">Todavía no hay cuentas en la app de gestión.</p>
          ) : porPlan.length <= MAXIMO_PARA_DONA ? (
            <Torta
              datos={porPlan}
              colores={coloresPlanes}
              centro={cantidad(totales.cuentas)}
              detalle="cuentas"
            />
          ) : (
            <BarrasHorizontales datos={porPlan} color="var(--agua)" etiquetaValor="Cuentas" />
          )}
        </section>
        <section className="panel">
          <h2>Cuentas por ciudad</h2>
          {ciudades.length === 0 ? (
            <p className="motivo">Todavía no hay cuentas en la app de gestión.</p>
          ) : (
            <BarrasHorizontales datos={ciudades} color="var(--naranja)" etiquetaValor="Cuentas" />
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Altas por mes</h2>
        <p className="subtitulo">Cuentas creadas en cada uno de los últimos {altas.length} meses.</p>
        <BarrasAgrupadas datos={altas} series={SERIES_ALTAS} />
      </section>

      <section className="panel">
        <h2>Las cuentas</h2>
        <p className="subtitulo">De la que usó la app más recientemente a la que hace más que no la usa.</p>
        {lavaderos.length === 0 ? (
          <p className="motivo">Todavía no hay cuentas en la app de gestión.</p>
        ) : (
          <Plegable items={lavaderos} visibles={FILAS_VISIBLES}>
            {(porcion) => <TablaDeCuentas cuentas={porcion} />}
          </Plegable>
        )}
      </section>
    </>
  );
}

function TablaDeCuentas({ cuentas }) {
  return (
    <div className="contrato">
      <table>
        <thead>
          <tr>
            <th>Cuenta</th>
            <th>Ciudad</th>
            <th>Plan</th>
            <th>Sucursales</th>
            <th>Alta</th>
            <th>Última actividad</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {cuentas.map((c) => (
            <tr key={c.id}>
              <td>{c.nombre}</td>
              <td>{c.ciudad ?? "–"}</td>
              <td>{c.plan}</td>
              <td>{cantidad(c.sucursales)}</td>
              <td>{fechaCorta(c.altaEl)}</td>
              <td>
                {c.ultimaActividad ? diaYHora(c.ultimaActividad) : "nunca"}
                {c.diasSinActividad !== null && c.diasSinActividad > 0 && (
                  <span className="subtexto">hace {c.diasSinActividad} días</span>
                )}
              </td>
              <td>
                <span className={"senal " + TONOS_ESTADO[c.estado]}>{ESTADOS_CUENTA[c.estado]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
