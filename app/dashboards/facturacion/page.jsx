"use client";

import SeccionRemota from "@/components/SeccionRemota";
import TarjetaKpi from "@/components/TarjetaKpi";
import BarrasHorizontales from "@/components/BarrasHorizontales";
import Torta from "@/components/Torta";
import Plegable from "@/components/Plegable";
import { buscarSeccion } from "@/lib/secciones";
import { ESTADOS_SUSCRIPCION } from "@/lib/kpis/facturacion";
import { cantidad, dinero, fechaCorta } from "@/lib/formato";

const seccion = buscarSeccion("facturacion");
const FUENTE = "la app de gestión";

// Un color por estado de suscripcion; son tokens de globals.css.
const COLORES_ESTADO = {
  [ESTADOS_SUSCRIPCION.ACTIVA]: "var(--verde)",
  [ESTADOS_SUSCRIPCION.PAUSADA]: "var(--naranja)",
  [ESTADOS_SUSCRIPCION.CANCELADA]: "var(--tinta-clara)",
};

const PERIODICIDADES = { MENSUAL: "mensual", ANUAL: "anual" };

const FILAS_VISIBLES = 10;

// Los importes vienen sumados por moneda: el principal es el mayor, el resto se
// lista aparte para no sumar pesos con dolares.
const principal = (totales) => (totales[0] ? dinero(totales[0].valor, totales[0].moneda) : "–");
const otrasMonedas = (totales) =>
  totales
    .slice(1)
    .map((t) => dinero(t.valor, t.moneda))
    .join(" · ");

export default function PaginaFacturacion() {
  return (
    <SeccionRemota seccion={seccion} fuente={FUENTE}>
      {(datos) => <Tablero datos={datos} />}
    </SeccionRemota>
  );
}

function Tablero({ datos }) {
  const { totales, planes, porEstado, suscripciones } = datos;
  const cuentasPorPlan = planes.map((p) => ({ nombre: p.nombre, valor: p.cuentasActivas }));
  const estados = porEstado.map((e) => ({
    nombre: ESTADOS_SUSCRIPCION[e.estado],
    valor: e.suscripciones,
  }));
  const extraPlanes = otrasMonedas(totales.mrrPorPlanes);
  const extraSuscripciones = otrasMonedas(totales.mrr);

  return (
    <>
      <div className="grilla-kpis">
        <TarjetaKpi
          etiqueta="MRR por planes asignados"
          valor={principal(totales.mrrPorPlanes)}
          detalle={
            extraPlanes
              ? `más ${extraPlanes} · mensual, cuentas activas`
              : "mensual, según el plan de cada cuenta activa"
          }
        />
        <TarjetaKpi
          etiqueta="Cuentas con plan"
          valor={cantidad(totales.cuentasConPlan)}
          detalle={`${cantidad(totales.cuentasActivas)} activas`}
        />
        <TarjetaKpi
          etiqueta="Suscripciones registradas"
          valor={cantidad(totales.suscripciones)}
          detalle={`${cantidad(totales.activas)} activas · ${cantidad(totales.pausadas)} pausadas · ${cantidad(totales.canceladas)} canceladas`}
        />
        <TarjetaKpi
          etiqueta="Con cobros impagos"
          valor={cantidad(totales.vencidas)}
          detalle="suscripciones con un cobro vencido, fallido o pendiente atrasado"
          critico={totales.vencidas > 0}
        />
        <TarjetaKpi
          etiqueta="MRR de suscripciones"
          valor={principal(totales.mrr)}
          detalle={
            extraSuscripciones
              ? `más ${extraSuscripciones} · suscripciones activas`
              : "mensual, de las suscripciones activas"
          }
        />
      </div>

      {suscripciones.length === 0 && (
        <div className="aviso" role="status">
          La app de gestión todavía no genera suscripciones ni cobros: asigna el plan directo a
          cada cuenta. Por eso el MRR que tiene datos es el de los planes asignados; las
          suscripciones van a aparecer acá cuando exista esa funcionalidad.
        </div>
      )}

      <div className="dos-columnas">
        <section className="panel">
          <h2>Cuentas activas por plan</h2>
          {cuentasPorPlan.length === 0 ? (
            <p className="motivo">Todavía no hay planes cargados en la app de gestión.</p>
          ) : (
            <BarrasHorizontales datos={cuentasPorPlan} color="var(--agua)" etiquetaValor="Cuentas" />
          )}
        </section>
        <section className="panel">
          <h2>Suscripciones por estado</h2>
          {suscripciones.length === 0 ? (
            <p className="motivo">Sin suscripciones registradas.</p>
          ) : (
            <Torta
              datos={estados}
              colores={COLORES_ESTADO}
              centro={cantidad(totales.suscripciones)}
              detalle="suscripciones"
            />
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Los planes</h2>
        <p className="subtitulo">El catálogo de la app de gestión y cuántas cuentas tiene cada uno.</p>
        {planes.length === 0 ? (
          <p className="motivo">Todavía no hay planes cargados en la app de gestión.</p>
        ) : (
          <div className="contrato">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Precio</th>
                  <th>Cuentas</th>
                  <th>Activas</th>
                  <th>MRR</th>
                </tr>
              </thead>
              <tbody>
                {planes.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nombre}</td>
                    <td>
                      {dinero(p.precioBase, p.moneda)}
                      <span className="subtexto">{PERIODICIDADES[p.periodicidad]}</span>
                    </td>
                    <td>{cantidad(p.cuentas)}</td>
                    <td>{cantidad(p.cuentasActivas)}</td>
                    <td>{dinero(p.mrr, p.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Las suscripciones</h2>
        <p className="subtitulo">Primero las que tienen cobros impagos.</p>
        {suscripciones.length === 0 ? (
          <p className="motivo">Sin suscripciones registradas.</p>
        ) : (
          <Plegable items={suscripciones} visibles={FILAS_VISIBLES}>
            {(porcion) => <TablaDeSuscripciones suscripciones={porcion} />}
          </Plegable>
        )}
      </section>
    </>
  );
}

function TablaDeSuscripciones({ suscripciones }) {
  return (
    <div className="contrato">
      <table>
        <thead>
          <tr>
            <th>Lavadero</th>
            <th>Plan</th>
            <th>Importe</th>
            <th>Estado</th>
            <th>Próximo cobro</th>
            <th>Pendientes</th>
            <th>Vencidos</th>
            <th>Último pago</th>
          </tr>
        </thead>
        <tbody>
          {suscripciones.map((s) => (
            <tr key={s.id}>
              <td>
                {s.lavadero}
                {s.impaga && <span className="subtexto">con cobros impagos</span>}
              </td>
              <td>{s.plan}</td>
              <td>
                {dinero(s.importe, s.moneda)}
                <span className="subtexto">{PERIODICIDADES[s.periodicidad]}</span>
              </td>
              <td>
                <span className={"senal " + (s.impaga ? "alerta" : s.estado === "ACTIVA" ? "ok" : "pendiente")}>
                  {ESTADOS_SUSCRIPCION[s.estado]}
                </span>
              </td>
              <td>{fechaCorta(s.proximoCobro)}</td>
              <td>
                {cantidad(s.cobrosPendientes)}
                {s.vencimientoPendienteMasAntiguo && (
                  <span className="subtexto">vence {fechaCorta(s.vencimientoPendienteMasAntiguo)}</span>
                )}
              </td>
              <td>{cantidad(s.cobrosVencidos)}</td>
              <td>{fechaCorta(s.ultimoPago)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
