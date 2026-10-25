"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import EncabezadoSeccion from "@/components/EncabezadoSeccion";
import TarjetaKpi from "@/components/TarjetaKpi";
import Lineas from "@/components/Lineas";
import BarrasApiladas from "@/components/BarrasApiladas";
import Torta from "@/components/Torta";
import Plegable from "@/components/Plegable";
import BarraDeProgreso from "@/components/BarraDeProgreso";
import Insignia from "@/components/Insignia";
import { buscarSeccion, ESTADO_SIN_FUENTE } from "@/lib/secciones";
import { ETAPAS, ZONA_HORARIA, diaLocal } from "@/lib/kpis/performance";
import {
  DIAS_DEL_RITMO,
  SIN_CLASIFICAR,
  TIPOS_DE_METRICA_DEL_CLIENTE,
  VERSION_DE_INVERSION,
} from "@/lib/kpis/inversion";

const seccion = buscarSeccion("inversion");
const performance = buscarSeccion("performance");

// Cada metrica dice si es un KPI, un OKR o las dos cosas, con los textos del
// cliente en el tooltip. Las listas (entregas, pendientes, riesgos) no llevan
// insignia: no son metricas.
const CLASES = TIPOS_DE_METRICA_DEL_CLIENTE;
const Kpi = () => <Insignia tipo="kpi" clases={CLASES} />;

// La pantalla se lee de arriba abajo como un informe al cliente: primero como
// viene el MVP y si llega a la entrega, despues en que se invirtieron las
// horas, que se entrego, que falta y que puede salir mal. Lo interno del
// equipo esta en Performance.

const FECHA_CORTA = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });
const DIA_Y_HORA = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: ZONA_HORARIA,
});
const NUMERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

// Las fechas del MVP y de los sprints son dias de calendario ("2026-10-28"):
// se formatean en UTC para que la zona del navegador no las corra un dia.
const fechaCorta = (dia) => (dia ? FECHA_CORTA.format(new Date(`${dia}T00:00:00Z`)) : "–");
// Una fecha proyectada puede caer en otro año (con poco ritmo, muy lejos): ahi
// lleva el año, para que «28 dic» no se lea como este diciembre.
const FECHA_CON_ANIO = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fechaProyectada = (dia, hoy) =>
  dia && hoy && dia.slice(0, 4) !== hoy.slice(0, 4)
    ? FECHA_CON_ANIO.format(new Date(`${dia}T00:00:00Z`))
    : fechaCorta(dia);
// La fecha de entrega, completa y con el dia de la semana: «miércoles, 28/10/2026».
const FECHA_LARGA = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const fechaLarga = (dia) => FECHA_LARGA.format(new Date(`${dia}T00:00:00Z`));
const diaYHora = (instante) => DIA_Y_HORA.format(new Date(instante));
const numero = (n) => (n === null || n === undefined ? "–" : NUMERO.format(n));
const conPorcentaje = (pct) => (pct === null || pct === undefined ? "–" : `${numero(pct)}%`);
const dias = (n) => (n === 1 ? "1 día" : `${n} días`);
const tareas = (n) => (n === 1 ? "1 tarea" : `${n} tareas`);
const listar = (items) =>
  items.length <= 2 ? items.join(" y ") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;

// "HU-23", "QA-07": el codigo con que el equipo nombra la historia, para
// listarla corta; null si no tiene. `codigo` cae al numero de Shortcut.
const codigoDe = (item) => /^\s*([A-Za-z]{2}\s*-\s*\d+)/.exec(item.titulo)?.[1].replace(/\s+/g, "") ?? null;
const codigo = (item) => codigoDe(item) ?? `sc-${item.id}`;
const enOrden = (codigos) => [...codigos].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
// El titulo sin el codigo adelante, que ya va aparte.
const sinCodigo = (titulo) => titulo.replace(/^\s*[A-Za-z]{2}\s*-\s*\d+\s*[-–—:]?\s*/, "").trim() || titulo;

// Un valor en la unidad de la respuesta: horas, o puntos si falta horasPorPunto.
function medidor(unidad) {
  return unidad === "horas" ? (n) => `${numero(n)} h` : (n) => `${numero(n)} ${n === 1 ? "punto" : "puntos"}`;
}

// La plata, si el cliente cargo el costo por hora. Una moneda que el navegador
// no conoce no rompe la pantalla: se muestra con su codigo adelante.
function enPlata(monto, moneda) {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(monto);
  } catch {
    return `${moneda} ${NUMERO.format(monto)}`;
  }
}

// Los colores de cada tipo de trabajo: lo que el cliente usa (funcionalidades)
// en el color de la marca; la gestion, el mas tenue.
const COLORES_TIPO = {
  funcionalidades: "var(--agua)",
  tecnica: "var(--tinta)",
  calidad: "var(--verde)",
  gestion: "var(--naranja)",
  [SIN_CLASIFICAR.clave]: "var(--gris-suave)",
};

const SERIES_AVANCE = [
  { clave: "Alcance del MVP", color: "var(--naranja)", grosor: 1.5 },
  { clave: "Planificado a la fecha", color: "var(--gris-suave)", punteada: true },
  { clave: "Terminado", color: "var(--verde)" },
  { clave: "Proyección", color: "var(--agua)", punteada: true },
];

const FILAS_VISIBLES = 6;

// ---- Pedido a la API -----------------------------------------------------------

// La respuesta es de otra version que esta pantalla: un `next dev` que no
// recargo el codigo de lib/ o una pagina vieja abierta. Mejor decirlo que
// romperse leyendo un campo que no vino.
const ESTADO_VERSION_DISTINTA = "version";
function versionDistinta(cuerpo) {
  if (cuerpo?.version === VERSION_DE_INVERSION) return null;
  const servidorViejo = !cuerpo?.version || cuerpo.version < VERSION_DE_INVERSION;
  return servidorViejo
    ? "El servidor está respondiendo con una versión anterior del código: hay que reiniciarlo. En desarrollo, cortá «next dev» y volvé a levantarlo."
    : "Esta página es de una versión anterior a la del servidor: recargala.";
}

async function pedirReporte(metodo) {
  let res;
  try {
    res = await fetch(seccion.endpoint, { method: metodo });
  } catch {
    return {
      error: { estado: null, motivo: "No se pudo conectar con el backoffice. Revisá la conexión y probá de nuevo." },
    };
  }
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      error: { estado: res.status, motivo: cuerpo?.motivo ?? `El backoffice respondió HTTP ${res.status}.` },
    };
  }
  const distinta = versionDistinta(cuerpo);
  if (distinta) return { error: { estado: ESTADO_VERSION_DISTINTA, motivo: distinta } };
  return { reporte: cuerpo };
}

// El estado del MVP en una palabra, para la señal del encabezado.
function estadoDelMvp(reporte) {
  const alcance = reporte.okrs.find((o) => o.clave === "alcance");
  if (!reporte.mvp.configurada) return { tono: "pendiente", texto: "Sin fecha de entrega" };
  if (reporte.alcance.valor.pct === 100 || reporte.alcance.tareas.pct === 100) {
    return { tono: "ok", texto: "MVP terminado" };
  }
  if (reporte.mvp.vencida) return { tono: "alerta", texto: "Entrega vencida" };
  const horas = reporte.okrs.find((o) => o.clave === "horas");
  if (alcance?.cumple === true && horas?.cumple !== false) return { tono: "ok", texto: "En camino" };
  return { tono: "alerta", texto: "En riesgo" };
}

function senalDe(reporte, error) {
  if (error?.estado === ESTADO_SIN_FUENTE) return { tono: "pendiente", texto: "Sin conectar" };
  if (error?.estado === ESTADO_VERSION_DISTINTA) return { tono: "alerta", texto: "Versiones distintas" };
  if (error) return { tono: "alerta", texto: "Sin datos de Shortcut" };
  if (!reporte) return null;
  if (reporte.lectura.desactualizado) return { tono: "alerta", texto: "Datos desactualizados" };
  return estadoDelMvp(reporte);
}

export default function PaginaInversion() {
  const [reporte, setReporte] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  // Si la pantalla se desmonta mientras "Actualizar" espera, la respuesta no
  // tiene a quien pisar.
  const montada = useRef(true);

  useEffect(() => {
    montada.current = true;
    pedirReporte("GET").then((r) => {
      if (!montada.current) return;
      setCargando(false);
      if (r.reporte) setReporte(r.reporte);
      else setError(r.error);
    });
    return () => {
      montada.current = false;
    };
  }, []);

  async function actualizar() {
    setActualizando(true);
    const r = await pedirReporte("POST");
    if (!montada.current) return;
    setActualizando(false);
    if (r.reporte) {
      setReporte(r.reporte);
      setError(null);
      setAviso(null);
    } else if (reporte) {
      // Lo que ya estaba en pantalla sigue siendo el ultimo dato bueno.
      setAviso(r.error.motivo);
    } else {
      setError(r.error);
    }
  }

  return (
    <>
      <EncabezadoSeccion titulo={seccion.titulo} subtitulo={seccion.subtitulo} senal={senalDe(reporte, error)}>
        {(reporte || error) && (
          <div className="controles">
            <button className="chip" onClick={actualizar} disabled={cargando || actualizando}>
              {actualizando ? "Actualizando…" : "Actualizar"}
            </button>
            {reporte?.lectura.leidoEl && (
              <span className="lectura">Datos de Shortcut del {diaYHora(reporte.lectura.leidoEl)}</span>
            )}
          </div>
        )}
      </EncabezadoSeccion>

      <main className="contenedor">
        {aviso && (
          <div className="aviso" role="status">
            No se pudo actualizar: {aviso} Se siguen mostrando los datos anteriores.
          </div>
        )}
        {cargando ? (
          <div className="panel cargando">Consultando los sprints en Shortcut…</div>
        ) : error ? (
          <PanelDeError error={error} />
        ) : (
          reporte && <Informe reporte={reporte} />
        )}
      </main>
    </>
  );
}

function PanelDeError({ error }) {
  if (error.estado === ESTADO_VERSION_DISTINTA) {
    return (
      <div className="panel error">
        <strong>La pantalla y el servidor son de versiones distintas.</strong>
        <br />
        {error.motivo}
      </div>
    );
  }
  if (error.estado === ESTADO_SIN_FUENTE) {
    return (
      <div className="panel error">
        <strong>{seccion.titulo} todavía no está conectada a Shortcut.</strong>
        <br />
        {error.motivo}
      </div>
    );
  }
  return (
    <div className="panel error">
      <strong>No pudimos traer los datos de Shortcut.</strong>
      <br />
      {error.motivo}
      <br />
      Si vuelve a pasar en unos minutos, avisale al equipo técnico.
    </div>
  );
}

// ---- El informe, de lo mas importante a lo menos ------------------------------------

function Informe({ reporte }) {
  const medida = medidor(reporte.unidad);
  return (
    <>
      {reporte.lectura.desactualizado && (
        <div className="aviso" role="status">
          Estos datos son del {diaYHora(reporte.lectura.leidoEl)}. Ya se le pidió una lectura nueva a
          Shortcut: tocá «Actualizar» para verla.
        </div>
      )}
      <PanelEntregable reporte={reporte} medida={medida} />
      <PanelObjetivos reporte={reporte} medida={medida} />
      <PanelLlegada reporte={reporte} medida={medida} />
      <PanelInversion reporte={reporte} medida={medida} />
      <PanelEntregas entregas={reporte.entregas} medida={medida} />
      <PanelPendientes pendientes={reporte.pendientes} despues={reporte.despuesDelMvp} medida={medida} />
      <PanelRiesgos riesgos={reporte.riesgos.filter((r) => r.categoria === "entrega")} medida={medida} hoy={reporte.mvp.hoy} />
      <NotasSobreLosDatos
        notas={reporte.riesgos.filter((r) => r.categoria === "datos")}
        problemas={reporte.problemas}
        medida={medida}
        hoy={reporte.mvp.hoy}
      />
      <ComoSeCalcula reporte={reporte} />
    </>
  );
}

// 1. El entregable central: el MVP y su fecha de entrega comprometida, y cuanto
// del plazo paso contra cuanto del alcance esta terminado. Sin frases: se lee
// de un vistazo y el detalle sigue abajo.
function PanelEntregable({ reporte, medida }) {
  const { mvp, alcance } = reporte;
  const pct = alcance.valor.pct ?? alcance.tareas.pct;
  const plazo =
    mvp.diasTotales > 0 ? Math.round((Math.min(mvp.diasTranscurridos, mvp.diasTotales) / mvp.diasTotales) * 1000) / 10 : null;
  return (
    <section className="panel entregable">
      <p className="entregable-rotulo">Entregable central</p>
      <h2>MVP de LavApp</h2>
      <FechaDeEntrega mvp={mvp} />
      <div className="entregable-barras">
        <div>
          <p className="titulo-barra">
            Plazo transcurrido <Kpi />
          </p>
          <BarraDeProgreso
            pct={plazo}
            color="var(--tinta-tenue)"
            texto={plazo === null ? "–" : `${conPorcentaje(plazo)} · ${mvp.diasTranscurridos} de ${mvp.diasTotales} días`}
          />
        </div>
        <div>
          <p className="titulo-barra">
            Alcance terminado <Kpi />
          </p>
          <BarraDeProgreso
            pct={pct}
            color="var(--verde)"
            texto={`${conPorcentaje(pct)} · ${medida(alcance.valor.terminado)} de ${medida(alcance.valor.total)}`}
          />
        </div>
      </div>
      <LeyendaMetricas />
    </section>
  );
}

// Que es un KPI y que es un OKR, una sola vez, debajo del entregable.
function LeyendaMetricas() {
  return (
    <p className="leyenda-metricas">
      {Object.entries(CLASES).map(([tipo, clase]) => (
        <span key={tipo}>
          <Insignia tipo={tipo} clases={CLASES} />
          {clase.nombre}: {clase.resumen}
        </span>
      ))}
      <span>Los objetivos del MVP llevan las dos: son indicadores con meta.</span>
    </p>
  );
}

function FechaDeEntrega({ mvp }) {
  if (!mvp.configurada) return <p className="entregable-fecha">Fecha de entrega sin definir</p>;
  const cuando = mvp.vencida
    ? "vencida"
    : mvp.diasRestantes === 1
      ? "la entrega es hoy"
      : `${dias(mvp.diasRestantes)} restantes`;
  return (
    <p className="entregable-fecha">
      Entrega comprometida: <strong>{fechaLarga(mvp.entrega)}</strong> ·{" "}
      <span title="Días corridos hasta la entrega, hoy incluido">{cuando}</span>
    </p>
  );
}

// 2. Los resultados clave que el cliente espera del MVP, contra su meta.
function detalleDeOkr(okr, { mvp, ritmo, plan, funcionalidades, inversion, alcance }, medida) {
  if (okr.clave === "alcance") {
    if (okr.valor === 100) return "todo el alcance está terminado";
    if (!mvp.configurada) return "sin fecha de entrega no se puede juzgar";
    if (mvp.vencida) return `la entrega fue el ${fechaCorta(mvp.entrega)}`;
    if (!ritmo.proyeccion) return `nada terminado en los últimos ${dias(ritmo.dias)}`;
    const alaEntrega = ritmo.proyeccion.alaEntrega;
    const total = alcance.valor.total;
    return alaEntrega === null || total === 0
      ? `al ritmo actual termina el ${fechaProyectada(ritmo.proyeccion.fin, mvp.hoy)}`
      : `al ritmo actual llega al ${conPorcentaje(Math.round((alaEntrega / total) * 1000) / 10)} el ${fechaCorta(mvp.entrega)}`;
  }
  if (okr.clave === "funcionalidades") {
    if (funcionalidades.total === 0) return "no hay historias de usuario en los sprints";
    const faltan = enOrden(funcionalidades.faltan.map(codigo));
    return `${funcionalidades.entregadas} de ${funcionalidades.total}${faltan.length > 0 ? ` · faltan ${listar(faltan)}` : ""}`;
  }
  if (okr.clave === "horas") {
    const { horas } = inversion;
    if (!horas.configurado) return "falta horasPorPunto en data/equipo.json";
    if (horas.minimo === null) return "falta cliente.horasMinimas en data/equipo.json";
    const pactadas = horas.pactadas === null ? "" : ` · pactadas ${numero(horas.pactadas)} h`;
    return `${conPorcentaje(horas.pctDelMinimo)} del mínimo${pactadas}`;
  }
  if (plan.pct === null) return "todavía no hay nada planificado";
  return `${medida(plan.terminado)} terminadas de ${medida(plan.planificado)} previstas a hoy`;
}

function valorDeOkr(okr) {
  if (okr.valor === null) return "–";
  if (okr.clave === "horas") return `${numero(okr.valor)} h`;
  return conPorcentaje(okr.valor);
}

function metaDeOkr(okr, mvp) {
  if (okr.meta === null) return null;
  const el = mvp.configurada ? ` el ${fechaCorta(mvp.entrega)}` : "";
  if (okr.clave === "alcance") return `100%${el}`;
  if (okr.clave === "funcionalidades") return `todas${el}`;
  if (okr.clave === "horas") return `al menos ${numero(okr.meta)} h${el}`;
  return `al menos ${numero(okr.meta)}%`;
}

// Como esta cada OKR, para el tooltip de su insignia. Antes de la entrega, un
// alcance o unas horas que no llegan es lo que dice la proyeccion, no un
// incumplimiento.
function estadoDeOkr(okr, mvp) {
  if (okr.cumple === true) return "cumplido";
  if (okr.cumple === false) {
    if (okr.clave === "plan") return "por debajo de la meta";
    return mvp.vencida ? "no cumplido" : "en riesgo según la proyección";
  }
  return okr.clave === "funcionalidades" && !mvp.vencida ? "en curso" : "sin evaluar";
}

function PanelObjetivos({ reporte, medida }) {
  return (
    <section className="panel okrs-principales">
      <h2>Objetivos del MVP</h2>
      <p className="subtitulo">
        Lo que el cliente espera de la entrega, cada resultado contra su meta. Antes de la entrega, el
        alcance y las horas se juzgan con el ritmo de los últimos {dias(DIAS_DEL_RITMO)}.
      </p>
      <div className="grilla-kpis">
        {reporte.okrs.map((okr) => (
          <TarjetaKpi
            key={okr.clave}
            tipo={["kpi", "okr"]}
            clases={CLASES}
            etiqueta={okr.nombre}
            valor={valorDeOkr(okr)}
            meta={metaDeOkr(okr, reporte.mvp)}
            cumple={okr.cumple}
            estado={estadoDeOkr(okr, reporte.mvp)}
            critico={okr.cumple === false}
            detalle={detalleDeOkr(okr, reporte, medida)}
          />
        ))}
      </div>
    </section>
  );
}

// 3. ¿Llegamos? El ritmo de hoy contra el que hace falta, la curva del avance y
// cada sprint: cuanto entrego dentro de su plazo.
function PanelLlegada({ reporte, medida }) {
  const { mvp, ritmo, avanceAcumulado, entregas, unidad } = reporte;
  const p = ritmo.proyeccion;
  const datos = useMemo(
    () =>
      avanceAcumulado.map((d) => ({
        nombre: fechaCorta(d.dia),
        "Alcance del MVP": d.alcance,
        "Planificado a la fecha": d.planificado,
        Terminado: d.terminado,
        Proyección: d.proyeccion,
      })),
    [avanceAcumulado]
  );
  const titulo = mvp.configurada ? `¿Llegamos al ${fechaCorta(mvp.entrega)}?` : "¿Cuándo se termina?";
  return (
    <section className="panel">
      <h2>{titulo}</h2>
      <p className="subtitulo">
        El ritmo de los últimos {dias(ritmo.dias)} contra el que hace falta para terminar lo que queda,
        y el avance acumulado día a día, en {unidad}
      </p>
      <div className="grilla-kpis">
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          etiqueta="Ritmo actual"
          valor={`${medida(ritmo.porDia)} por día`}
          detalle={`${tareas(ritmo.tareasTerminadas)} ${ritmo.tareasTerminadas === 1 ? "terminada" : "terminadas"} desde el ${fechaCorta(ritmo.desde)}`}
        />
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          etiqueta="Ritmo necesario"
          valor={ritmo.necesarioPorDia === null ? "–" : `${medida(ritmo.necesarioPorDia)} por día`}
          critico={ritmo.necesarioPorDia !== null && ritmo.necesarioPorDia > ritmo.porDia}
          detalle={
            ritmo.restante === 0
              ? "no falta nada"
              : ritmo.necesarioPorDia === null
                ? mvp.configurada
                  ? "ya no quedan días"
                  : "sin fecha de entrega"
                : `para terminar en ${dias(mvp.diasRestantes)}, hoy incluido`
          }
        />
        <TarjetaKpi tipo="kpi" clases={CLASES} etiqueta="Falta" valor={medida(ritmo.restante)} detalle="del alcance del MVP" />
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          etiqueta="Fin proyectado"
          valor={p?.terminado ? "Terminado" : p ? fechaProyectada(p.fin, mvp.hoy) : "–"}
          critico={p !== null && p.llegaALaEntrega === false}
          detalle={
            p === null
              ? `nada terminado en ${dias(ritmo.dias)}`
              : p.terminado
                ? "no queda nada pendiente"
                : p.llegaALaEntrega === false
                  ? `${dias(p.diasDeAtraso)} después de la entrega`
                  : p.llegaALaEntrega
                    ? "antes de la entrega"
                    : "al ritmo actual"
          }
        />
      </div>
      {datos.length === 0 ? (
        <p className="motivo">Todavía no hay sprints cargados en Shortcut.</p>
      ) : (
        <>
          <p className="titulo-grafico">
            Avance acumulado <Kpi />
          </p>
          <Lineas datos={datos} series={SERIES_AVANCE} />
        </>
      )}
      <p className="motivo">
        Alcance: lo que ya estaba en algún sprint ese día. Planificado: lo que tendría que estar
        terminado según cada sprint, repartido parejo entre sus días. La proyección sigue desde hoy al
        ritmo actual y no pasa del alcance.
      </p>
      <h3 className="subtitulo">
        Cada sprint, contra su plazo <Kpi />
      </h3>
      <TablaDeSprints entregas={entregas} medida={medida} hoy={mvp.hoy} />
    </section>
  );
}

function TablaDeSprints({ entregas, medida, hoy }) {
  if (entregas.length === 0) return <p className="motivo">Todavía no hay sprints en el MVP.</p>;
  return (
    <div className="contrato">
      <table>
        <thead>
          <tr>
            <th>Sprint</th>
            <th>Planificado</th>
            <th>Entregado en el sprint</th>
            <th>Después del cierre</th>
            <th>Pendiente</th>
          </tr>
        </thead>
        <tbody>
          {entregas.map((s) => (
            <tr key={s.id}>
              <td>
                {s.nombre}
                <span className="subtexto">
                  {fechaCorta(s.inicio)} al {fechaCorta(s.fin)}
                </span>
              </td>
              <td className="sin-corte">
                {medida(s.planificado.valor)}
                <span className="subtexto">{tareas(s.planificado.tareas)}</span>
              </td>
              <td>
                <BarraDeProgreso
                  pct={s.pctEnElSprint}
                  color={s.fin < hoy && s.pctEnElSprint < 100 ? "var(--alerta)" : "var(--verde)"}
                  texto={`${medida(s.enElSprint.valor)} · ${conPorcentaje(s.pctEnElSprint)}`}
                />
              </td>
              <td className="sin-corte">
                {medida(s.despues.valor)}
                <span className="subtexto">{tareas(s.despues.tareas)}</span>
              </td>
              <td className="sin-corte">
                {medida(s.pendiente.valor)}
                <span className="subtexto">{tareas(s.pendiente.tareas)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 4. En que se invirtieron las horas: lo justificado, lo que esta en marcha y lo
// que falta, por tipo de trabajo y por sprint.
function PanelInversion({ reporte, medida }) {
  const { inversion, entregas, unidad } = reporte;
  const { horas, porTipo } = inversion;
  const conTerminado = porTipo.filter((t) => t.valor.terminado > 0);
  const dona = conTerminado.map((t) => ({ nombre: t.nombre, valor: t.valor.terminado }));
  const colores = Object.fromEntries(porTipo.map((t) => [t.nombre, COLORES_TIPO[t.clave]]));
  const tiposConValor = porTipo.filter((t) => t.valor.total > 0);
  const seriesTipo = tiposConValor.map((t) => ({ clave: t.nombre, color: COLORES_TIPO[t.clave] }));
  // El sprint mas viejo arriba, como se leen las barras.
  const porSprint = [...entregas].reverse().map((s) => ({
    nombre: s.nombre,
    ...Object.fromEntries(
      tiposConValor.map((t) => [t.nombre, s.entregas.find((g) => g.clave === t.clave)?.valor ?? 0])
    ),
  }));
  const plata = horas.plata;
  const okrDeHoras = reporte.okrs.find((o) => o.clave === "horas");
  return (
    <section className="panel">
      <h2>¿En qué se invirtieron las horas?</h2>
      <p className="subtitulo">
        Las horas justificadas son las de las tareas terminadas
        {horas.horasPorPunto ? `, a ${numero(horas.horasPorPunto)} h por punto` : ""}. El tipo de trabajo
        sale del código de cada historia en Shortcut
      </p>
      {!horas.configurado && (
        <p className="motivo">
          Falta <code>horasPorPunto</code> en data/equipo.json: todo se muestra en puntos.
        </p>
      )}
      <div className="grilla-kpis">
        <TarjetaKpi
          tipo={okrDeHoras?.meta ? ["kpi", "okr"] : "kpi"}
          clases={CLASES}
          meta={okrDeHoras ? metaDeOkr(okrDeHoras, reporte.mvp) : null}
          cumple={okrDeHoras?.cumple}
          estado={okrDeHoras ? estadoDeOkr(okrDeHoras, reporte.mvp) : null}
          etiqueta="Justificadas"
          valor={medida(horas.justificadas ?? reporte.alcance.valor.terminado)}
          detalle={plata ? enPlata(plata.justificadas, plata.moneda) : "lo terminado"}
        />
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          etiqueta="En curso"
          valor={medida(horas.enCurso ?? reporte.alcance.valor.enCurso)}
          detalle="en marcha, sin terminar"
        />
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          etiqueta="Por empezar"
          valor={medida(horas.pendientes ?? reporte.alcance.valor.pendiente)}
          detalle="planificado, sin empezar"
        />
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          etiqueta="Comprometidas en el MVP"
          valor={medida(horas.comprometidas ?? reporte.alcance.valor.total)}
          detalle={
            plata
              ? enPlata(plata.comprometidas, plata.moneda)
              : horas.minimo !== null && unidad === "horas"
                ? `mínimo pedido: ${numero(horas.minimo)} h`
                : "todo lo planificado"
          }
        />
      </div>
      <div className="dos-columnas">
        <div>
          <p className="titulo-grafico">
            Lo justificado, por tipo de trabajo <Kpi />
          </p>
          <Torta
            datos={dona}
            colores={colores}
            centro={medida(horas.justificadas ?? reporte.alcance.valor.terminado)}
            detalle="justificadas"
            alto={280}
          />
        </div>
        <div>
          <p className="titulo-grafico">
            Cada tipo de trabajo: justificado sobre lo comprometido <Kpi />
          </p>
          <ul className="avance-por-tipo">
            {tiposConValor.map((t) => (
              <li key={t.clave}>
                <p className="titulo-grupo">
                  <span className="punto-tipo" style={{ background: COLORES_TIPO[t.clave] }} />
                  {t.nombre}
                </p>
                <BarraDeProgreso
                  pct={t.valor.pct}
                  color={COLORES_TIPO[t.clave]}
                  texto={`${medida(t.valor.terminado)} de ${medida(t.valor.total)} · ${conPorcentaje(t.valor.pct)}`}
                />
                <span className="subtexto">
                  {medida(t.valor.enCurso)} en curso · {medida(t.valor.pendiente)} por empezar
                  {plata && t.valor.terminado > 0 && ` · ${enPlata(t.valor.terminado * plata.porHora, plata.moneda)} justificados`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {porSprint.length > 0 && (
        <>
          <p className="titulo-grafico">
            Lo justificado en cada sprint, por tipo de trabajo <Kpi />
          </p>
          <BarrasApiladas datos={porSprint} series={seriesTipo} anchoEtiquetas={160} />
        </>
      )}
      <p className="motivo">
        Funcionalidades son las historias de usuario (HU), lo que el cliente usa; base técnica, las
        historias técnicas (HT); calidad, las pruebas (QA); y gestión, la planificación, el seguimiento y
        las ceremonias del proyecto (HG y SM). Cada subtarea suma al tipo de su historia.
        {plata
          ? ` La plata sale de ${enPlata(plata.porHora, plata.moneda)} por hora.`
          : " Con un costo por hora en data/equipo.json (cliente.costoPorHora), también se ve en plata."}
      </p>
    </section>
  );
}

// 5. Lo que se entrego en cada sprint, como notas de version: las historias de
// usuario primero, con su fecha.
function PanelEntregas({ entregas, medida }) {
  return (
    <section className="panel">
      <h2>¿Qué se entregó?</h2>
      <p className="subtitulo">
        Lo terminado en cada sprint, del más reciente al primero. Se listan las historias; sus subtareas
        suman horas a la entrega
      </p>
      {entregas.length === 0 && <p className="motivo">Todavía no hay sprints en el MVP.</p>}
      {entregas.map((s) => {
        const terminadas = s.enElSprint.tareas + s.despues.tareas;
        const resumen = [
          terminadas === 0
            ? "Todavía no se terminó nada de este sprint"
            : `${tareas(terminadas)} ${terminadas === 1 ? "terminada" : "terminadas"} (${medida(s.enElSprint.valor + s.despues.valor)})${
                s.despues.tareas > 0
                  ? `, ${s.despues.tareas === 1 ? "1 de ellas" : `${s.despues.tareas} de ellas`} después del cierre`
                  : ""
              }`,
          s.pendiente.tareas > 0 && `quedan ${tareas(s.pendiente.tareas)} (${medida(s.pendiente.valor)})`,
        ].filter(Boolean);
        return (
          <div key={s.id} className="entrega">
            <h3>
              {s.nombre}
              <span className="subtexto">
                {fechaCorta(s.inicio)} al {fechaCorta(s.fin)}
              </span>
            </h3>
            <p className="motivo">{resumen.join("; ")}.</p>
            <div className="entregas-grupos">
              {s.entregas.map((g) => (
                <div key={g.clave} className="entrega-grupo">
                  <p className="titulo-grupo">
                    <span className="punto-tipo" style={{ background: COLORES_TIPO[g.clave] }} />
                    {g.nombre} · {g.items.length === 1 ? "1 entrega" : `${g.items.length} entregas`} · {medida(g.valor)}
                  </p>
                  <Plegable items={g.items} visibles={FILAS_VISIBLES}>
                    {(porcion) => (
                      <ul className="lista-entregas">
                        {porcion.map((i) => (
                          <li key={i.id}>
                            {codigoDe(i) ? (
                              <>
                                <strong>{codigoDe(i)}</strong> {sinCodigo(i.titulo)}
                              </>
                            ) : (
                              i.titulo
                            )}
                            <a className="id-tarea" href={i.url} target="_blank" rel="noreferrer">
                              sc-{i.id}
                            </a>
                            <span className="fecha-entrega">
                              {i.terminadaEl ? fechaCorta(diaLocal(i.terminadaEl)) : "sin fecha"}
                              {i.subtareas > 0 && ` · ${i.subtareas === 1 ? "1 subtarea" : `${i.subtareas} subtareas`}`}
                            </span>
                            {i.despuesDelCierre && <span className="tarde">después del cierre</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Plegable>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// 6. Lo que falta para la entrega, por tipo de trabajo, y lo que queda para
// despues del MVP, apenas mencionado.
function PanelPendientes({ pendientes, despues, medida }) {
  const total = pendientes.reduce((t, g) => t + g.valor, 0);
  return (
    <section className="panel">
      <h2>¿Qué falta para el MVP?</h2>
      <p className="subtitulo">
        {pendientes.length === 0
          ? "No queda nada pendiente del MVP"
          : `${medida(total)} por terminar, lo que está en curso primero. Cada historia trae lo que le queda, con sus subtareas`}
      </p>
      {pendientes.map((g) => (
        <div key={g.clave} className="entrega-grupo">
          <p className="titulo-grupo">
            <span className="punto-tipo" style={{ background: COLORES_TIPO[g.clave] }} />
            {g.nombre} · {g.enCurso} en curso, {g.sinEmpezar} sin empezar · {medida(g.valor)}
          </p>
          <Plegable items={g.items} visibles={FILAS_VISIBLES}>
            {(porcion) => (
              <div className="contrato">
                <table className="tabla-pendientes">
                  <thead>
                    <tr>
                      <th>Tarea</th>
                      <th>Estado</th>
                      <th>Sprint</th>
                      <th>Falta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porcion.map((i) => (
                      <tr key={i.id}>
                        <td>
                          {i.titulo}
                          <a className="id-tarea" href={i.url} target="_blank" rel="noreferrer">
                            sc-{i.id}
                          </a>
                          {i.subtareasPendientes > 0 && (
                            <span className="subtexto">
                              con {i.subtareasPendientes === 1 ? "1 subtarea pendiente" : `${i.subtareasPendientes} subtareas pendientes`}
                            </span>
                          )}
                        </td>
                        <td className={"sin-corte" + (i.etapa === ETAPAS.started ? " en-curso" : "")}>{i.estado}</td>
                        <td className="sin-corte">{i.sprint.nombre}</td>
                        <td className="sin-corte">{i.sinEstimar && i.valor === 0 ? "sin estimar" : medida(i.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Plegable>
        </div>
      ))}
      <p className="motivo">
        Después del MVP:{" "}
        {despues.sprints.length === 0
          ? "no hay sprints cargados después de la entrega"
          : `${despues.sprints.map((s) => s.nombre).join(", ")}, con ${tareas(despues.tareas)} (${medida(despues.valor)})`}
        {despues.fueraDeSprints !== null && despues.fueraDeSprints > 0
          ? `; ${despues.fueraDeSprints === 1 ? "1 story está" : `${despues.fueraDeSprints} stories están`} fuera de los sprints y no cuenta${despues.fueraDeSprints === 1 ? "" : "n"} para el MVP.`
          : "."}
      </p>
    </section>
  );
}

// 7. Lo que puede salir mal o hacer que un numero no diga lo que parece.
function textoDelRiesgo(r, medida, hoy) {
  switch (r.clave) {
    case "sin-entrega":
      return "No hay fecha de entrega del MVP: cargala en horasPactadas.finDelProyecto de data/equipo.json. Sin ella no se puede decir si se llega.";
    case "sin-horas-por-punto":
      return "Falta horasPorPunto en data/equipo.json: todo se cuenta en puntos y no hay horas justificadas.";
    case "sin-ritmo":
      return `En los últimos ${dias(r.dias)} no se terminó ninguna tarea: a este ritmo lo que falta no se termina.`;
    case "no-llega":
      return `Al ritmo de los últimos ${dias(DIAS_DEL_RITMO)} (${medida(r.porDia)} por día), lo que falta se termina el ${fechaProyectada(r.fin, hoy)}, ${dias(r.diasDeAtraso)} después de la entrega.${
        r.necesarioPorDia !== null ? ` Para llegar hacen falta ${medida(r.necesarioPorDia)} por día.` : ""
      }`;
    case "entrega-vencida":
      return `La entrega ya pasó y quedan ${medida(r.restante)} sin terminar.`;
    case "horas-bajo-el-minimo":
      return `Faltan ${numero(r.faltan)} h para el mínimo de horas justificadas que pide el cliente.`;
    case "sin-sprint-en-curso":
      return `No hay un sprint en curso desde el ${fechaCorta(r.desde)}: lo que falta del MVP no tiene un sprint con plazo.`;
    case "sprint-cerrado-con-pendientes":
      return `${r.sprint.nombre} cerró el ${fechaCorta(r.sprint.fin)} con ${tareas(r.tareas)} sin terminar (${medida(r.valor)}).`;
    case "entregas-despues-del-cierre":
      return `${r.tareas === 1 ? "1 tarea" : `${r.tareas} tareas`} de ${r.sprint.nombre} (${medida(r.valor)}) se ${r.tareas === 1 ? "terminó" : "terminaron"} después de su cierre, el ${fechaCorta(r.sprint.fin)}.`;
    case "sin-estimar":
      return `${r.tareas === 1 ? "1 tarea no tiene" : `${r.tareas} tareas no tienen`} estimación: sus horas no se cuentan en el avance ni en lo justificado.`;
    case "sin-clasificar":
      return `${r.tareas === 1 ? "1 tarea no tiene" : `${r.tareas} tareas no tienen`} tipo de trabajo (ni código HU, HT, QA, HG o SM, ni historia): ${r.tareas === 1 ? "cuenta" : "cuentan"} como «Sin clasificar».`;
    case "sprint-cruza-la-entrega":
      return `${r.sprint.nombre} termina después de la entrega (el ${fechaCorta(r.sprint.fin)}) y se cuenta entero en el MVP.`;
    default:
      return r.clave;
  }
}

const NOMBRE_NIVEL = { alto: "Alto", medio: "Medio", bajo: "Bajo" };

function PanelRiesgos({ riesgos, medida, hoy }) {
  return (
    <section className="panel">
      <h2>Riesgos y alertas</h2>
      <p className="subtitulo">Lo que puede demorar la entrega o hacer que un número no diga lo que parece</p>
      {riesgos.length === 0 ? (
        <p className="motivo">No hay riesgos a la vista.</p>
      ) : (
        <ul className="riesgos">
          {riesgos.map((r, i) => (
            <li key={`${r.clave}-${i}`} className={`riesgo ${r.nivel}`}>
              <span className="nivel">{NOMBRE_NIVEL[r.nivel]}</span>
              <span>{textoDelRiesgo(r, medida, hoy)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Las notas sobre los datos: lo que dice cuanto creerle a un numero (tareas sin
// estimar o sin tipo, configuracion que falta) y lo que no se pudo traducir de
// Shortcut. Van plegadas, salvo que alguna sea grave: un dato que no se
// entiende nunca se esconde.
function NotasSobreLosDatos({ notas, problemas, medida, hoy }) {
  const total = notas.length + problemas.length;
  if (total === 0) return null;
  return (
    <details className="panel" open={notas.some((n) => n.nivel === "alto")}>
      <summary>{total === 1 ? "1 nota sobre los datos" : `${total} notas sobre los datos`}</summary>
      {notas.length > 0 && (
        <ul className="riesgos">
          {notas.map((n, i) => (
            <li key={`${n.clave}-${i}`} className={`riesgo ${n.nivel}`}>
              <span className="nivel">{NOMBRE_NIVEL[n.nivel]}</span>
              <span>{textoDelRiesgo(n, medida, hoy)}</span>
            </li>
          ))}
        </ul>
      )}
      {problemas.length > 0 && <Problemas problemas={problemas} />}
    </details>
  );
}

function Problemas({ problemas }) {
  return (
    <>
      <p className="motivo">
        {problemas.length === 1
          ? "1 dato de Shortcut no se pudo traducir:"
          : `${problemas.length} datos de Shortcut no se pudieron traducir:`}
      </p>
      <div className="contrato">
        <table>
          <thead>
            <tr>
              <th>Tarea</th>
              <th>Campo</th>
              <th>Valor</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {problemas.map((p, i) => (
              <tr key={i}>
                <td>{p.tarea === null ? "–" : `sc-${p.tarea}`}</td>
                <td>
                  <code>{p.campo}</code>
                </td>
                <td className="tipo">{String(p.valor)}</td>
                <td>{p.motivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// 8. Como se calcula: los supuestos de cada numero, para que el cliente sepa
// que esta mirando.
function ComoSeCalcula({ reporte }) {
  const { supuestos, inversion, mvp } = reporte;
  const { horas } = inversion;
  return (
    <p className="nota">
      Fuente: Shortcut. El MVP son los sprints que empiezan hasta la entrega
      {mvp.configurada ? ` (el ${fechaCorta(mvp.entrega)})` : ""}; lo que no está en ningún sprint no
      cuenta. Las horas salen de los puntos de cada tarea
      {supuestos.horasPorPunto ? `, a ${numero(supuestos.horasPorPunto)} h por punto` : ""}: Shortcut no
      registra horas. Se justifican las tareas terminadas, una vez por tarea aunque tenga varios
      responsables.
      {horas.minimo !== null &&
        ` El cliente pide al menos ${numero(horas.minimo)} h para la entrega${
          horas.pactadas !== null
            ? `; el equipo pactó ${numero(horas.pactadas)} h (${numero(supuestos.horasPactadasPorIntegrante)} por persona)`
            : ""
        }, y se pueden justificar más.`}{" "}
      El ritmo es lo terminado en los últimos {dias(supuestos.diasDelRitmo)}, y la proyección lo sigue
      desde hoy. Una entrega es lo que se terminó en un sprint; cuenta como después del cierre si se
      terminó pasado su último día, en hora de Buenos Aires. El tipo de trabajo sale del código de cada
      historia ({supuestos.tipos.map((t) => `${t.prefijos.join(" y ")}: ${t.nombre.toLowerCase()}`).join("; ")}).
      Las horas pactadas, el mínimo, la fecha de entrega y el costo por hora salen de{" "}
      <code>data/equipo.json</code>. Lo interno del equipo (roles, carga, bugs y retrabajo) está en{" "}
      <Link href={performance.ruta} prefetch={false}>
        {performance.titulo}
      </Link>
      .
    </p>
  );
}
