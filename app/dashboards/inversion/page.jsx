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
import EscalaDeHoras from "@/components/EscalaDeHoras";
import { buscarSeccion, ESTADO_SIN_FUENTE } from "@/lib/secciones";
import { ETAPAS, ZONA_HORARIA, diaLocal } from "@/lib/kpis/performance";
import {
  SIN_CLASIFICAR,
  TIPOS_DE_METRICA_DEL_CLIENTE,
  VERSION_DE_INVERSION,
} from "@/lib/kpis/inversion";

const seccion = buscarSeccion("inversion");
const performance = buscarSeccion("performance");

// Cada metrica dice si es un KPI o un OKR, nunca las dos: es OKR si tiene una
// meta para la entrega, y lo es en todos los paneles donde aparece. El tooltip
// de la insignia dice que mide ese indicador (definicionesDe) y, en los OKR, la
// meta y como esta. Las listas (entregas, pendientes, riesgos) no llevan
// insignia: no son metricas.
const CLASES = TIPOS_DE_METRICA_DEL_CLIENTE;
const Kpi = ({ indicador, definicion }) => (
  <Insignia tipo="kpi" clases={CLASES} indicador={indicador} definicion={definicion} />
);

// La pantalla se lee de arriba abajo como un informe al cliente, en tono
// formal y sin frases armadas: primero el entregable central (el MVP y su
// fecha), sus objetivos y la proyeccion de la entrega; despues la inversion de
// horas, las entregas, lo pendiente y los riesgos. Lo interno del equipo esta
// en Performance.

const FECHA_CORTA = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const DIA_Y_HORA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: ZONA_HORARIA,
});
const NUMERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

// Las fechas del MVP y de los sprints son dias de calendario ("2026-10-28"):
// se formatean en UTC para que la zona del navegador no las corra un dia. En
// tablas y listas van cortas («28/10»); la entrega y las proyecciones, con el
// año («18/11/2026»), porque una proyeccion puede caer en otro año.
const fechaCorta = (dia) => (dia ? FECHA_CORTA.format(new Date(`${dia}T00:00:00Z`)) : "–");
const FECHA_COMPLETA = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const fechaCompleta = (dia) => (dia ? FECHA_COMPLETA.format(new Date(`${dia}T00:00:00Z`)) : "–");
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

// Un valor en la unidad de la respuesta: horas, o puntos si falta la escala.
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

// Que mide cada indicador, en una o dos oraciones, para el tooltip de su
// insignia: el lector entiende el numero sin ir a la metodologia. Los de los
// OKR van por su clave (alcance, funcionalidades, horas y plan).
function definicionesDe({ supuestos }) {
  const ritmo = dias(supuestos.diasDelRitmo);
  const porPunto = supuestos.escala?.length ? ", según la escala de puntos a horas" : "";
  return {
    plazo:
      "Porcentaje de los días del MVP que ya transcurrieron, desde el inicio del primer sprint hasta la fecha de entrega.",
    alcance: `Porcentaje de las horas del MVP que corresponden a tareas terminadas. Hasta la fecha de entrega, la meta se evalúa con la proyección al ritmo del sprint en curso (${ritmo}).`,
    funcionalidades:
      "Historias de usuario (HU) del MVP terminadas sobre el total. Cada historia de usuario es una funcionalidad que usa el cliente final.",
    horas: `Horas de las tareas terminadas${porPunto}, contadas una vez por tarea aunque tenga varios responsables. Se pueden justificar más horas que el mínimo.`,
    plan: "Horas terminadas sobre las que debían estar terminadas a la fecha según la planificación de cada sprint.",
    ritmoActual: `Promedio de horas terminadas por día desde el inicio del sprint en curso (${ritmo}).`,
    pendiente: "Horas de las tareas del MVP que todavía no se terminaron, en curso o por iniciar.",
    finalizacion: "Fecha en que se completaría el alcance del MVP si se mantiene el ritmo actual.",
    avanceAcumulado:
      "Evolución diaria del alcance, de lo planificado, de lo terminado y de la proyección al ritmo actual, en horas acumuladas.",
    cumplimiento:
      "Para cada sprint, lo planificado frente a lo entregado dentro de su plazo, lo entregado después del cierre y lo pendiente.",
    enCurso: "Horas de las tareas iniciadas que todavía no se terminaron.",
    porIniciar: "Horas de las tareas planificadas en los sprints que todavía no se iniciaron.",
    comprometido: "Horas de todas las tareas del MVP: justificadas, en curso y por iniciar.",
    porTipo: "Reparto de las horas justificadas entre funcionalidades, base técnica, calidad y gestión.",
    avancePorTipo: "Para cada tipo de trabajo, las horas justificadas sobre las horas comprometidas.",
    porSprint: "Horas justificadas en cada sprint, separadas por tipo de trabajo.",
  };
}

// ---- Pedido a la API -----------------------------------------------------------

// La respuesta es de otra version que esta pantalla: un `next dev` que no
// recargo el codigo de lib/ o una pagina vieja abierta. Mejor decirlo que
// romperse leyendo un campo que no vino.
const ESTADO_VERSION_DISTINTA = "version";
function versionDistinta(cuerpo) {
  if (cuerpo?.version === VERSION_DE_INVERSION) return null;
  const servidorViejo = !cuerpo?.version || cuerpo.version < VERSION_DE_INVERSION;
  return servidorViejo
    ? "El servidor responde con una versión anterior de esta pantalla: hay que reiniciarlo o volver a publicarlo. Si persiste, avisale al equipo técnico."
    : "Esta página es de una versión anterior a la del servidor: recargala para ver la actual.";
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
  if (!reporte.mvp.configurada) return { tono: "pendiente", texto: "Sin fecha de entrega" };
  if (reporte.alcance.valor.pct === 100 || reporte.alcance.tareas.pct === 100) {
    return { tono: "ok", texto: "MVP completo" };
  }
  if (reporte.mvp.vencida) return { tono: "ok", texto: "En cierre" };
  return { tono: "ok", texto: "En curso" };
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
      <strong>No se pudieron obtener los datos de Shortcut.</strong>
      <br />
      {error.motivo}
      <br />
      Si el problema persiste, avisale al equipo técnico.
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
          Estos datos son del {diaYHora(reporte.lectura.leidoEl)}. Se pidió una lectura más reciente a
          Shortcut: usá «Actualizar» para verla.
        </div>
      )}
      <PanelEntregable reporte={reporte} medida={medida} />
      <PanelObjetivos reporte={reporte} medida={medida} />
      <PanelLlegada reporte={reporte} medida={medida} />
      <PanelInversion reporte={reporte} medida={medida} />
      <PanelEntregas entregas={reporte.entregas} medida={medida} />
      <PanelPendientes pendientes={reporte.pendientes} despues={reporte.despuesDelMvp} medida={medida} />
      <PanelRiesgos riesgos={reporte.riesgos.filter((r) => r.categoria === "entrega")} medida={medida} />
      <NotasSobreLosDatos
        notas={reporte.riesgos.filter((r) => r.categoria === "datos")}
        problemas={reporte.problemas}
        medida={medida}
      />
      <Metodologia reporte={reporte} />
    </>
  );
}

// 1. El entregable central: el MVP y su fecha de entrega comprometida, y cuanto
// del plazo paso contra cuanto del alcance esta terminado. Sin frases: se lee
// de un vistazo y el detalle sigue abajo.
function PanelEntregable({ reporte, medida }) {
  const { mvp, alcance } = reporte;
  const okrDeAlcance = reporte.okrs.find((o) => o.clave === "alcance");
  const def = definicionesDe(reporte);
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
            Plazo transcurrido <Kpi indicador="Plazo transcurrido" definicion={def.plazo} />
          </p>
          <BarraDeProgreso
            pct={plazo}
            color="var(--tinta-tenue)"
            texto={plazo === null ? "–" : `${conPorcentaje(plazo)} · ${mvp.diasTranscurridos} de ${mvp.diasTotales} días`}
          />
        </div>
        <div>
          <p className="titulo-barra">
            Alcance terminado{" "}
            {okrDeAlcance ? (
              <Insignia
                tipo="okr"
                clases={CLASES}
                indicador="Alcance terminado"
                definicion={def.alcance}
                meta={metaDeOkr(okrDeAlcance, mvp)}
                cumple={okrDeAlcance.cumple}
                estado={estadoDeOkr(okrDeAlcance, mvp)}
              />
            ) : (
              <Kpi indicador="Alcance terminado" definicion={def.alcance} />
            )}
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

// Que es un KPI y que es un OKR, una sola vez, debajo del entregable. Las
// insignias de la leyenda son muestras, sin tooltip: lo que mide cada
// indicador lo dice la insignia de cada metrica.
function LeyendaMetricas() {
  return (
    <p className="leyenda-metricas">
      {Object.entries(CLASES).map(([tipo, clase]) => (
        <span key={tipo}>
          <span className={`insignia ${tipo} muestra`}>{clase.sigla}</span>
          {clase.nombre}: {clase.resumen}
        </span>
      ))}
      <span>Cada insignia explica qué mide su indicador.</span>
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

// 2. Los resultados clave del MVP, cada uno contra su meta.
function detalleDeOkr(okr, { mvp, ritmo, plan, funcionalidades, inversion, alcance }, medida) {
  if (okr.clave === "alcance") {
    const hecho = `${medida(alcance.valor.terminado)} de ${medida(alcance.valor.total)}`;
    if (okr.valor === 100) return `${hecho} · alcance completo`;
    if (!mvp.configurada) return `${hecho} · sin fecha de entrega definida`;
    if (mvp.vencida) return `${hecho} · fecha de entrega vencida`;
    if (!ritmo.proyeccion) return `${hecho} · sin avance en los últimos ${dias(ritmo.dias)}`;
    const alaEntrega = ritmo.proyeccion.alaEntrega;
    const total = alcance.valor.total;
    return alaEntrega === null || total === 0
      ? `${hecho} · fin estimado: ${fechaCompleta(ritmo.proyeccion.fin)}`
      : `${hecho} · proyección al ${fechaCorta(mvp.entrega)}: ${conPorcentaje(Math.round((alaEntrega / total) * 1000) / 10)}`;
  }
  if (okr.clave === "funcionalidades") {
    if (funcionalidades.total === 0) return "no hay historias de usuario en los sprints";
    const faltan = enOrden(funcionalidades.faltan.map(codigo));
    return faltan.length > 0 ? `pendientes: ${listar(faltan)}` : "todas las historias de usuario entregadas";
  }
  if (okr.clave === "horas") {
    const { horas } = inversion;
    if (!horas.configurado) return "sin equivalencia definida entre puntos y horas";
    if (horas.minimo === null) return "sin mínimo de horas definido";
    const pactadas = horas.pactadas === null ? "" : ` · ${numero(horas.pactadas)} h comprometidas por el equipo`;
    return `${conPorcentaje(horas.pctDelMinimo)} del mínimo${pactadas}`;
  }
  if (plan.pct === null) return "sin trabajo planificado a la fecha";
  return `${medida(plan.terminado)} terminadas de ${medida(plan.planificado)} previstas a la fecha`;
}

function valorDeOkr(okr) {
  if (okr.valor === null) return "–";
  if (okr.clave === "horas") return `${numero(okr.valor)} h`;
  if (okr.clave === "funcionalidades") return `${okr.entregadas} de ${okr.total}`;
  return conPorcentaje(okr.valor);
}

function metaDeOkr(okr, mvp) {
  if (okr.meta === null) return null;
  const al = mvp.configurada ? ` al ${fechaCompleta(mvp.entrega)}` : "";
  if (okr.clave === "alcance") return `100%${al}`;
  if (okr.clave === "funcionalidades") return `todas${al}`;
  if (okr.clave === "horas") return `al menos ${numero(okr.meta)} h${al}`;
  return `al menos ${numero(okr.meta)}%`;
}

// Como esta cada OKR, para el tooltip de su insignia. Antes de la entrega, un
// alcance o unas horas que no llegan es lo que dice la proyeccion, no un
// incumplimiento.
function estadoDeOkr(okr, mvp) {
  if (okr.cumple === true) return "cumplido";
  if (okr.cumple === false) {
    if (okr.clave === "plan") return "por debajo de la meta";
    return mvp.vencida ? "fecha de entrega superada" : "proyección posterior a la fecha";
  }
  return okr.clave === "funcionalidades" && !mvp.vencida ? "en curso" : "sin evaluar";
}

function PanelObjetivos({ reporte, medida }) {
  const def = definicionesDe(reporte);
  return (
    <section className="panel okrs-principales">
      <h2>Objetivos del MVP</h2>
      <p className="subtitulo">
        Resultados clave comprometidos para la entrega, cada uno frente a su meta. Hasta la fecha de
        entrega, el alcance y las horas se evalúan con la proyección al ritmo del sprint en curso.
      </p>
      <div className="grilla-kpis">
        {reporte.okrs.map((okr) => (
          <TarjetaKpi
            key={okr.clave}
            tipo="okr"
            clases={CLASES}
            definicion={def[okr.clave]}
            etiqueta={okr.nombre}
            valor={valorDeOkr(okr)}
            meta={metaDeOkr(okr, reporte.mvp)}
            cumple={okr.cumple}
            estado={estadoDeOkr(okr, reporte.mvp)}
            detalle={detalleDeOkr(okr, reporte, medida)}
          />
        ))}
      </div>
    </section>
  );
}

// 3. La proyeccion de la entrega: el ritmo de hoy contra el requerido, la curva
// del avance y cada sprint, cuanto entrego dentro de su plazo.
function PanelLlegada({ reporte, medida }) {
  const { mvp, ritmo, avanceAcumulado, entregas, unidad } = reporte;
  const def = definicionesDe(reporte);
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
  return (
    <section className="panel">
      <h2>Proyección de la entrega</h2>
      <p className="subtitulo">
        Ritmo desde el inicio del sprint ({fechaCorta(ritmo.desde)}), lo que falta del alcance y la
        fecha estimada de finalización, en {unidad}
      </p>
      <div className="grilla-kpis">
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          definicion={def.ritmoActual}
          etiqueta="Ritmo actual"
          valor={`${medida(ritmo.porDia)} por día`}
          detalle={`promedio diario · ${tareas(ritmo.tareasTerminadas)} ${ritmo.tareasTerminadas === 1 ? "terminada" : "terminadas"} desde el ${fechaCorta(ritmo.desde)}`}
        />
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          definicion={def.pendiente}
          etiqueta="Pendiente"
          valor={medida(ritmo.restante)}
          detalle="del alcance del MVP"
        />
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          definicion={def.finalizacion}
          etiqueta="Fecha estimada de finalización"
          valor={p?.terminado ? "Completo" : p ? fechaCompleta(p.fin) : "–"}
          detalle={
            p === null
              ? `sin avance en los últimos ${dias(ritmo.dias)}`
              : p.terminado
                ? "sin trabajo pendiente"
                : p.llegaALaEntrega === false
                  ? `${dias(p.diasDeAtraso)} después de la fecha comprometida`
                  : p.llegaALaEntrega
                    ? "antes de la fecha comprometida"
                    : "al ritmo actual"
          }
        />
      </div>
      {datos.length === 0 ? (
        <p className="motivo">No hay sprints cargados en Shortcut.</p>
      ) : (
        <>
          <p className="titulo-grafico">
            Avance acumulado del MVP <Kpi indicador="Avance acumulado del MVP" definicion={def.avanceAcumulado} />
          </p>
          <Lineas datos={datos} series={SERIES_AVANCE} />
        </>
      )}
      <p className="motivo">
        Alcance: trabajo incluido en los sprints a cada fecha. Planificado: lo que debía estar
        terminado según cada sprint, distribuido en partes iguales entre sus días. Proyección:
        continuación desde hoy al ritmo actual, sin superar el alcance.
      </p>
      <h3 className="subtitulo">
        Cumplimiento por sprint <Kpi indicador="Cumplimiento por sprint" definicion={def.cumplimiento} />
      </h3>
      <TablaDeSprints entregas={entregas} medida={medida} hoy={mvp.hoy} />
    </section>
  );
}

function TablaDeSprints({ entregas, medida, hoy }) {
  if (entregas.length === 0) return <p className="motivo">No hay sprints en el MVP.</p>;
  return (
    <div className="contrato">
      <table>
        <thead>
          <tr>
            <th>Sprint</th>
            <th>Planificado</th>
            <th>Entregado en el sprint</th>
            <th>Entregado después del cierre</th>
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

// 4. La inversion de horas: lo justificado, lo que esta en curso y lo que
// falta, por tipo de trabajo y por sprint.
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
  const def = definicionesDe(reporte);
  return (
    <section className="panel">
      <h2>Inversión de horas</h2>
      <p className="subtitulo">
        Horas justificadas por las tareas terminadas, y su distribución por tipo de trabajo según el
        código de cada historia
      </p>
      <EscalaDeHoras
        escala={horas.escala}
        aclaracion="Cada historia se estima en puntos. Cada valor de la escala corresponde a una cantidad de horas de trabajo."
      />
      {!horas.configurado && (
        <p className="motivo">
          La equivalencia entre puntos y horas no está definida: los valores se muestran en puntos.
        </p>
      )}
      <div className="grilla-kpis">
        <TarjetaKpi
          tipo={okrDeHoras?.meta ? "okr" : "kpi"}
          clases={CLASES}
          meta={okrDeHoras ? metaDeOkr(okrDeHoras, reporte.mvp) : null}
          cumple={okrDeHoras?.cumple}
          estado={okrDeHoras ? estadoDeOkr(okrDeHoras, reporte.mvp) : null}
          definicion={def.horas}
          etiqueta="Horas justificadas"
          valor={medida(horas.justificadas ?? reporte.alcance.valor.terminado)}
          detalle={plata ? enPlata(plata.justificadas, plata.moneda) : "tareas terminadas"}
        />
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          definicion={def.enCurso}
          etiqueta="En curso"
          valor={medida(horas.enCurso ?? reporte.alcance.valor.enCurso)}
          detalle="tareas iniciadas, sin terminar"
        />
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          definicion={def.porIniciar}
          etiqueta="Por iniciar"
          valor={medida(horas.pendientes ?? reporte.alcance.valor.pendiente)}
          detalle="tareas planificadas, sin iniciar"
        />
        <TarjetaKpi
          tipo="kpi"
          clases={CLASES}
          definicion={def.comprometido}
          etiqueta="Total comprometido"
          valor={medida(horas.comprometidas ?? reporte.alcance.valor.total)}
          detalle={
            plata
              ? enPlata(plata.comprometidas, plata.moneda)
              : horas.minimo !== null && unidad === "horas"
                ? `alcance del MVP · mínimo requerido: ${numero(horas.minimo)} h`
                : "alcance del MVP"
          }
        />
      </div>
      <div className="dos-columnas">
        <div>
          <p className="titulo-grafico">
            Horas justificadas por tipo de trabajo{" "}
            <Kpi indicador="Horas justificadas por tipo de trabajo" definicion={def.porTipo} />
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
            Avance por tipo de trabajo: justificado sobre comprometido{" "}
            <Kpi indicador="Avance por tipo de trabajo" definicion={def.avancePorTipo} />
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
                  {medida(t.valor.enCurso)} en curso · {medida(t.valor.pendiente)} por iniciar
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
            Horas justificadas por sprint y tipo de trabajo{" "}
            <Kpi indicador="Horas justificadas por sprint y tipo de trabajo" definicion={def.porSprint} />
          </p>
          <BarrasApiladas datos={porSprint} series={seriesTipo} anchoEtiquetas={160} />
        </>
      )}
      <p className="motivo">
        Funcionalidades: historias de usuario (HU), lo que utiliza el cliente final. Base técnica:
        historias técnicas (HT). Calidad: pruebas (QA). Gestión: planificación, seguimiento y
        ceremonias del proyecto (HG y SM). Las horas son las de la historia: una subtarea no suma.
        {plata ? ` Valorizado a ${enPlata(plata.porHora, plata.moneda)} por hora.` : ""}
      </p>
    </section>
  );
}

// 5. Lo que se entrego en cada sprint, como notas de version: las historias de
// usuario primero, con su fecha.
function PanelEntregas({ entregas, medida }) {
  return (
    <section className="panel">
      <h2>Entregas por sprint</h2>
      <p className="subtitulo">
        Trabajo terminado en cada sprint, del más reciente al primero. Se listan las historias. Las
        horas son las de cada historia; sus subtareas no suman
      </p>
      {entregas.length === 0 && <p className="motivo">No hay sprints en el MVP.</p>}
      {entregas.map((s) => {
        const terminadas = s.enElSprint.tareas + s.despues.tareas;
        const resumen = [
          terminadas === 0
            ? "Sin tareas terminadas"
            : `${tareas(terminadas)} ${terminadas === 1 ? "terminada" : "terminadas"} (${medida(s.enElSprint.valor + s.despues.valor)})${
                s.despues.tareas > 0
                  ? `, ${s.despues.tareas === 1 ? "1 de ellas" : `${s.despues.tareas} de ellas`} después del cierre del sprint`
                  : ""
              }`,
          s.pendiente.tareas > 0 &&
            `${tareas(s.pendiente.tareas)} ${s.pendiente.tareas === 1 ? "pendiente" : "pendientes"} (${medida(s.pendiente.valor)})`,
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
                              {i.terminadaEl ? fechaCorta(diaLocal(i.terminadaEl)) : "sin fecha registrada"}
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
      <h2>Pendiente para el MVP</h2>
      <p className="subtitulo">
        {pendientes.length === 0
          ? "No hay trabajo pendiente para el MVP"
          : `${medida(total)} por completar, primero lo que está en curso. El valor es el de la historia`}
      </p>
      {pendientes.map((g) => (
        <div key={g.clave} className="entrega-grupo">
          <p className="titulo-grupo">
            <span className="punto-tipo" style={{ background: COLORES_TIPO[g.clave] }} />
            {g.nombre} · {g.enCurso} en curso, {g.sinEmpezar} sin iniciar · {medida(g.valor)}
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
                      <th>Pendiente</th>
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
                        <td className="sin-corte">{i.sinEstimar && i.valor === 0 ? "Sin estimar" : medida(i.valor)}</td>
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
          ? "no hay sprints planificados después de la entrega"
          : `${despues.sprints.map((s) => s.nombre).join(", ")}, con ${tareas(despues.tareas)} (${medida(despues.valor)})`}
        {despues.fueraDeSprints !== null && despues.fueraDeSprints > 0
          ? `; ${despues.fueraDeSprints === 1 ? "1 historia fuera de los sprints no se cuenta" : `${despues.fueraDeSprints} historias fuera de los sprints no se cuentan`} en el MVP.`
          : "."}
      </p>
    </section>
  );
}

// 7. Lo que puede afectar la entrega y, aparte, las notas sobre los datos:
// cada riesgo en una oracion formal, con sus numeros.
function textoDelRiesgo(r, medida) {
  // Las horas entre parentesis, salvo que sean 0: tareas sin estimar.
  const enHoras = (valor) => (valor > 0 ? ` (${medida(valor)})` : "");
  switch (r.clave) {
    case "sin-entrega":
      return "No hay una fecha de entrega definida para el MVP: sin ella no se puede evaluar el plazo.";
    case "sin-horas-por-punto":
      return "No está definida la escala que pasa los puntos a horas: los valores se expresan en puntos y no hay horas justificadas.";
    case "sin-ritmo":
      return `No se completaron tareas desde el inicio del sprint (${dias(r.dias)}): sin ritmo de avance no es posible estimar la finalización.`;
    case "no-llega":
      return `Al ritmo del sprint (${medida(r.porDia)} por día), el alcance se completaría el ${fechaCompleta(r.fin)}, ${dias(r.diasDeAtraso)} después de la fecha comprometida.${
        r.necesarioPorDia !== null ? ` Cumplir la fecha requiere ${medida(r.necesarioPorDia)} por día.` : ""
      }`;
    case "entrega-vencida":
      return `La fecha de entrega venció con ${medida(r.restante)} pendientes.`;
    case "horas-bajo-el-minimo":
      return `Faltan ${numero(r.faltan)} h para alcanzar el mínimo de horas justificadas requerido.`;
    case "sin-sprint-en-curso":
      return `No hay un sprint en curso desde el ${fechaCorta(r.desde)}: el trabajo pendiente no tiene un sprint asignado.`;
    case "sprint-cerrado-con-pendientes":
      return `${r.sprint.nombre} cerró el ${fechaCorta(r.sprint.fin)} con ${tareas(r.tareas)} sin completar${enHoras(r.valor)}.`;
    case "entregas-despues-del-cierre":
      return `${tareas(r.tareas)} de ${r.sprint.nombre}${enHoras(r.valor)} se ${r.tareas === 1 ? "completó" : "completaron"} después del cierre del sprint, el ${fechaCorta(r.sprint.fin)}.`;
    case "sin-estimar":
      return `${r.tareas === 1 ? "1 tarea no tiene" : `${r.tareas} tareas no tienen`} estimación: no ${r.tareas === 1 ? "suma" : "suman"} al avance ni a las horas justificadas.`;
    case "sin-clasificar":
      return `${r.tareas === 1 ? "1 tarea no tiene" : `${r.tareas} tareas no tienen`} tipo de trabajo (código HU, HT, QA, HG o SM): ${r.tareas === 1 ? "se agrupa" : "se agrupan"} como «Sin clasificar».`;
    case "sprint-cruza-la-entrega":
      return `${r.sprint.nombre} termina el ${fechaCorta(r.sprint.fin)}, después de la entrega, y se cuenta completo en el MVP.`;
    default:
      return r.clave;
  }
}

const NOMBRE_NIVEL = { alto: "Alto", medio: "Medio", bajo: "Bajo" };

function PanelRiesgos({ riesgos, medida }) {
  return (
    <section className="panel">
      <h2>Para la entrega</h2>
      <p className="subtitulo">Lo que queda mirando la fecha comprometida y los objetivos</p>
      {riesgos.length === 0 ? (
        <p className="motivo">No hay observaciones para la entrega.</p>
      ) : (
        <ul className="riesgos">
          {riesgos.map((r, i) => (
            <li key={`${r.clave}-${i}`} className="riesgo bajo">
              <span>{textoDelRiesgo(r, medida)}</span>
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
function NotasSobreLosDatos({ notas, problemas, medida }) {
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
              <span>{textoDelRiesgo(n, medida)}</span>
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
          ? "1 dato de Shortcut no se pudo interpretar:"
          : `${problemas.length} datos de Shortcut no se pudieron interpretar:`}
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

// 8. La metodologia: de donde sale cada numero, para que el cliente sepa que
// esta mirando. Sin nombres de archivos ni de campos de configuracion.
function Metodologia({ reporte }) {
  const { supuestos, inversion, mvp } = reporte;
  const { horas } = inversion;
  const plata = horas.plata;
  return (
    <p className="nota">
      <strong>Metodología.</strong> Fuente: Shortcut, la herramienta de gestión del equipo. El MVP
      comprende los sprints que comienzan hasta la fecha de entrega
      {mvp.configurada ? ` (${fechaCompleta(mvp.entrega)})` : ""}; el trabajo fuera de los sprints no se
      cuenta. Las horas se calculan a partir de los puntos de cada historia, con la escala de puntos a horas,
      porque Shortcut no registra horas. Se justifican las horas de las historias terminadas, una vez
      por historia aunque tenga varios responsables.
      {horas.minimo !== null &&
        ` El mínimo requerido para la entrega es de ${numero(horas.minimo)} h${
          horas.pactadas !== null
            ? `; el equipo comprometió ${numero(horas.pactadas)} h (${numero(supuestos.horasPactadasPorIntegrante)} h por persona)`
            : ""
        } y puede justificar más.`}
      {plata && ` Las horas se valorizan a ${enPlata(plata.porHora, plata.moneda)} por hora.`} El ritmo es el
      promedio de lo terminado desde el inicio del sprint en curso, y la proyección lo extiende
      desde hoy. Una entrega es el trabajo terminado en un sprint; se considera posterior al cierre si se
      completó después de su último día, en hora de Buenos Aires. El tipo de trabajo surge del código de
      cada historia ({supuestos.tipos.map((t) => `${t.prefijos.join(" y ")}: ${t.nombre.toLowerCase()}`).join("; ")}).
      La información interna del equipo (roles, carga, errores y retrabajo) está en{" "}
      <Link href={performance.ruta} prefetch={false}>
        {performance.titulo}
      </Link>
      .
    </p>
  );
}
