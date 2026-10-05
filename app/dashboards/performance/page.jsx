"use client";

import { useEffect, useMemo, useState } from "react";
import EncabezadoSeccion from "@/components/EncabezadoSeccion";
import TarjetaKpi from "@/components/TarjetaKpi";
import Lineas from "@/components/Lineas";
import AreasApiladas from "@/components/AreasApiladas";
import BarrasApiladas from "@/components/BarrasApiladas";
import BarrasAgrupadas from "@/components/BarrasAgrupadas";
import BarrasHorizontales from "@/components/BarrasHorizontales";
import Torta from "@/components/Torta";
import Plegable from "@/components/Plegable";
import BarraDeProgreso from "@/components/BarraDeProgreso";
import { buscarSeccion, ESTADO_SIN_FUENTE } from "@/lib/secciones";
import { diaLocal, ESTADOS_SPRINT, ETAPAS, ZONA_HORARIA } from "@/lib/kpis/performance";

const seccion = buscarSeccion("performance");

const FECHA_CORTA = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const DIA_Y_HORA = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: ZONA_HORARIA,
});

// Las fechas del sprint son dias de calendario ("2026-09-23"), no instantes: se
// formatean en UTC para que la zona del navegador no las corra un dia.
const fechaCorta = (dia) => FECHA_CORTA.format(new Date(`${dia}T00:00:00Z`));
const diaYHora = (instante) => DIA_Y_HORA.format(new Date(instante));
const conPorcentaje = (pct) => (pct === null ? "–" : `${pct}%`);
const dias = (n) => (n === 1 ? "1 día" : `${n} días`);
const textoDeTareas = (n) => (n === 1 ? "1 tarea" : `${n} tareas`);
const recortar = (texto, largo) =>
  texto.length > largo ? texto.slice(0, largo - 1).trimEnd() + "…" : texto;

// Menos de un dia se lee mejor en horas: "5 h" y no "0.2 días".
function duracion(enDias) {
  if (enDias === null) return "–";
  if (enDias < 1) {
    const horas = Math.round(enDias * 24);
    return horas < 1 ? "menos de 1 h" : `${horas} h`;
  }
  return dias(enDias);
}

// Los colores son los tokens de globals.css: Recharts los recibe como var() y
// el navegador los resuelve, asi no se repite el hex del token.
const SERIES_BURNDOWN = [
  { clave: "Pendiente", color: "var(--agua)" },
  { clave: "Ritmo ideal", color: "var(--gris-suave)", punteada: true },
  { clave: "Total del sprint", color: "var(--naranja)", grosor: 1.5 },
];

// Las tres etapas de negocio, en el orden en que se apilan: lo terminado abajo
// (o pegado al eje) y lo pendiente arriba, que es como se leen el cumulative
// flow y los desgloses de Shortcut. Las claves son los nombres de ETAPAS para
// que el grafico diga lo mismo que las tarjetas y las tablas.
const SERIES_ETAPAS = [
  { clave: ETAPAS.done, color: "var(--verde)" },
  { clave: ETAPAS.started, color: "var(--agua)" },
  { clave: ETAPAS.unstarted, color: "var(--tinta-clara)" },
];

const porEtapa = (g) => ({
  [ETAPAS.done]: g.terminadas,
  [ETAPAS.started]: g.enCurso,
  [ETAPAS.unstarted]: g.pendientes,
});

const UNIDADES = [
  { valor: "tareas", texto: "Tareas" },
  { valor: "puntos", texto: "Puntos" },
];

// Las etapas mas lo que se fue a otro sprint, que para el compromiso es un
// cuarto destino: ni terminado ni pendiente, se saco del alcance.
const MOVIDA = "Movida a otro sprint";
const SERIES_COMPROMISO = [...SERIES_ETAPAS, { clave: MOVIDA, color: "var(--naranja)" }];

// Los mismos colores de las series, indexados por nombre, para las donas.
const COLORES_ETAPAS = Object.fromEntries(SERIES_COMPROMISO.map((s) => [s.clave, s.color]));

const COMPROMETIDO = "Comprometido";
const AGREGADO = "Agregado";
const COLORES_ORIGEN = { [COMPROMETIDO]: "var(--tinta-clara)", [AGREGADO]: "var(--naranja)" };

// Para la dona de columnas del tablero, en el orden del tablero: de lo que
// espera (claros) a lo que esta en curso (agua) y lo que ya casi sale (naranja).
const PALETA_COLUMNAS = [
  "var(--tinta-clara)",
  "var(--tinta-tenue)",
  "var(--agua)",
  "var(--agua-oscura)",
  "var(--naranja)",
  "var(--gris-suave)",
];

// Cuantas filas se ven antes de pedir "Ver N mas".
const FILAS_VISIBLES = 5;
const GRUPOS_VISIBLES = 6;

const SERIES_RITMO = [
  { clave: "Entraron", color: "var(--naranja)" },
  { clave: "Terminadas", color: "var(--verde)" },
];

const SERIES_HISTORIAL = [
  { clave: "Comprometidas", color: "var(--tinta-clara)" },
  { clave: "Cumplidas", color: "var(--verde)" },
  { clave: "Agregadas", color: "var(--naranja)" },
];

// Dias de calendario enteros o con un decimal (promedios): 0 es "el mismo dia".
function diasDeCalendario(n) {
  if (n === null) return "–";
  if (n === 0) return "el mismo día";
  return dias(n);
}

async function pedirReporte(sprint, metodo) {
  const url = seccion.endpoint + (sprint ? `?sprint=${sprint}` : "");
  let res;
  try {
    res = await fetch(url, { method: metodo });
  } catch {
    return {
      error: {
        estado: null,
        motivo: "No se pudo conectar con el backoffice. Revisá la conexión y probá de nuevo.",
      },
    };
  }
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      error: {
        estado: res.status,
        motivo: cuerpo?.motivo ?? `El backoffice respondió HTTP ${res.status}.`,
      },
    };
  }
  return { reporte: cuerpo };
}

function senalDe(reporte, error) {
  if (error?.estado === ESTADO_SIN_FUENTE) return { tono: "pendiente", texto: "Sin conectar" };
  if (error) return { tono: "alerta", texto: "Sin datos de Shortcut" };
  if (!reporte) return null;
  if (reporte.lectura.desactualizado) return { tono: "alerta", texto: "Datos desactualizados" };
  return {
    tono: reporte.sprint.estado === ESTADOS_SPRINT.unstarted ? "pendiente" : "ok",
    texto: `Sprint ${reporte.sprint.estado.toLowerCase()}`,
  };
}

function tarjetaDeDias(sprint) {
  if (sprint.diasParaEmpezar > 0) {
    return {
      etiqueta: "Empieza en",
      valor: dias(sprint.diasParaEmpezar),
      detalle: `el ${fechaCorta(sprint.inicio)} · dura ${dias(sprint.diasTotales)}`,
    };
  }
  if (sprint.diasRestantes === 0) {
    return { etiqueta: "Días restantes", valor: 0, detalle: `terminó el ${fechaCorta(sprint.fin)}` };
  }
  return {
    etiqueta: "Días restantes",
    valor: sprint.diasRestantes,
    detalle: `de ${sprint.diasTotales} · termina el ${fechaCorta(sprint.fin)}`,
  };
}

function detalleDePuntos({ total, terminados, tareasSinEstimar }) {
  if (total === 0) return "ninguna tarea tiene puntos cargados";
  const sinEstimar =
    tareasSinEstimar === 0 ? "" : ` · ${textoDeTareas(tareasSinEstimar)} sin estimar`;
  return `${terminados} de ${total} puntos${sinEstimar}`;
}

export default function PaginaPerformance() {
  const [sprintPedido, setSprintPedido] = useState(null);
  const [reporte, setReporte] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  // El historial de sprints se pide aparte (es mas caro); "Actualizar" lo
  // vuelve a pedir sin cache, igual que al reporte.
  const [pedidoDeHistorial, setPedidoDeHistorial] = useState({ n: 0, metodo: "GET" });

  useEffect(() => {
    let vigente = true;
    pedirReporte(sprintPedido, "GET").then((r) => {
      if (!vigente) return;
      setCargando(false);
      setAviso(null);
      if (r.reporte) {
        setReporte(r.reporte);
        setError(null);
      } else {
        setError(r.error);
      }
    });
    return () => {
      vigente = false;
    };
  }, [sprintPedido]);

  function elegirSprint(id) {
    setCargando(true);
    setSprintPedido(id);
  }

  async function actualizar() {
    setActualizando(true);
    setPedidoDeHistorial((p) => ({ n: p.n + 1, metodo: "POST" }));
    const r = await pedirReporte(sprintPedido ?? reporte?.sprint.id, "POST");
    setActualizando(false);
    if (r.reporte) {
      setReporte(r.reporte);
      setError(null);
      setAviso(null);
    } else if (reporte && !error) {
      // Si Shortcut falla al actualizar, lo que ya estaba en pantalla sigue
      // siendo el ultimo dato bueno: se deja y se avisa, no se borra.
      setAviso(r.error.motivo);
    } else {
      setError(r.error);
    }
  }

  return (
    <>
      <EncabezadoSeccion
        titulo={seccion.titulo}
        subtitulo={seccion.subtitulo}
        senal={senalDe(reporte, error)}
      >
        {reporte && (
          <div className="controles">
            <label className="selector">
              Sprint
              <select
                value={sprintPedido ?? reporte.sprint.id}
                onChange={(e) => elegirSprint(Number(e.target.value))}
                disabled={cargando || actualizando}
              >
                {reporte.sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} · {s.estado.toLowerCase()} · {fechaCorta(s.inicio)} al{" "}
                    {fechaCorta(s.fin)}
                  </option>
                ))}
              </select>
            </label>
            <button className="chip" onClick={actualizar} disabled={cargando || actualizando}>
              {actualizando ? "Actualizando…" : "Actualizar"}
            </button>
            {reporte.lectura.leidoEl && (
              <span className="lectura">
                Datos de Shortcut del {diaYHora(reporte.lectura.leidoEl)}
              </span>
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
          <div className="panel cargando">Consultando Shortcut…</div>
        ) : error ? (
          <PanelDeError error={error} />
        ) : (
          reporte && <Reporte reporte={reporte} pedidoDeHistorial={pedidoDeHistorial} />
        )}
      </main>
    </>
  );
}

function PanelDeError({ error }) {
  if (error.estado === ESTADO_SIN_FUENTE) {
    return (
      <div className="panel error">
        <strong>Performance todavía no está conectada a Shortcut.</strong>
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

function Reporte({ reporte, pedidoDeHistorial }) {
  const {
    sprint,
    resumen,
    porEstado,
    burndown,
    flujo,
    porIniciativa,
    porResponsable,
    compromiso,
    ritmo,
    cycleTime,
    tiempoEnSprint,
    tiempoPorColumna,
    terminadas,
    pendientes,
    lectura,
    problemas,
  } = reporte;
  const tarjeta = tarjetaDeDias(sprint);

  return (
    <>
      {lectura.desactualizado && (
        <div className="aviso" role="status">
          Estos datos son del {diaYHora(lectura.leidoEl)}. Ya se le pidió una lectura
          nueva a Shortcut: tocá «Actualizar» para verla.
        </div>
      )}

      <div className="grilla-kpis">
        <TarjetaKpi
          etiqueta="Avance en tareas"
          valor={conPorcentaje(resumen.tareas.pct)}
          detalle={`${resumen.tareas.terminadas} de ${resumen.tareas.total} terminadas${
            resumen.tareas.subtareas > 0 ? ", subtareas incluidas" : ""
          }`}
        />
        <TarjetaKpi
          etiqueta="Avance en puntos"
          valor={conPorcentaje(resumen.puntos.pct)}
          detalle={detalleDePuntos(resumen.puntos)}
        />
        <TarjetaKpi etiqueta={tarjeta.etiqueta} valor={tarjeta.valor} detalle={tarjeta.detalle} />
        <TarjetaKpi
          etiqueta="En curso"
          valor={resumen.tareas.enCurso}
          detalle={`${resumen.tareas.pendientes} sin empezar`}
        />
      </div>

      <ResumenVisual resumen={resumen} compromiso={compromiso} />

      <PanelCompromiso compromiso={compromiso} sprint={sprint} />

      <PanelBurndown burndown={burndown} sprint={sprint} hayPuntos={resumen.puntos.total > 0} />

      <PanelRitmo ritmo={ritmo} sprint={sprint} />

      <PanelHistorial pedido={pedidoDeHistorial} sprintActual={sprint.id} />

      <PanelFlujo flujo={flujo} sprint={sprint} />

      <PanelPorIniciativa porIniciativa={porIniciativa} />

      <PanelPorResponsable porResponsable={porResponsable} />

      <section className="panel">
        <h2>Tareas por estado</h2>
        <p className="subtitulo">En qué columna del tablero está hoy cada tarea del sprint</p>
        {porEstado.length === 0 ? (
          <p className="motivo">El sprint todavía no tiene tareas cargadas.</p>
        ) : (
          <div className="grilla-kpis">
            {porEstado.map((e) => (
              <TarjetaKpi
                key={e.id}
                etiqueta={e.nombre}
                valor={e.tareas}
                detalle={e.puntos > 0 ? `${e.etapa} · ${e.puntos} puntos` : e.etapa}
              />
            ))}
          </div>
        )}
      </section>

      <PanelTiempoEnSprint tiempoEnSprint={tiempoEnSprint} tiempoPorColumna={tiempoPorColumna} />

      <PanelCycleTime cycleTime={cycleTime} />

      <section className="panel">
        <h2>Terminadas ({terminadas.length})</h2>
        <p className="subtitulo">Las tareas cerradas del sprint, la más reciente primero</p>
        <Plegable items={terminadas} visibles={FILAS_VISIBLES}>
          {(porcion) => (
            <TablaDeTareas tareas={porcion} vacia="Todavía no se terminó ninguna tarea." />
          )}
        </Plegable>
      </section>

      <section className="panel">
        <h2>Pendientes ({pendientes.length})</h2>
        <p className="subtitulo">Lo que falta terminar, empezando por lo más avanzado</p>
        <Plegable items={pendientes} visibles={FILAS_VISIBLES}>
          {(porcion) => <TablaDeTareas tareas={porcion} vacia="No queda nada pendiente." />}
        </Plegable>
      </section>

      {problemas.length > 0 && <Problemas problemas={problemas} />}

      <p className="nota">
        Fuente: Shortcut. Cada tarea es una story de Shortcut, subtareas incluidas; la
        iniciativa es el epic al que pertenece y los puntos son la estimación de
        esfuerzo que carga el equipo. Lo comprometido es lo que ya estaba en el sprint
        al cierre de su primer día; una tarea que se movió a otro sprint sigue
        contando como comprometida y no cumplida. Los datos se releen solos cada pocos
        minutos y «Actualizar» los trae de Shortcut en el momento.
        {resumen.tareas.archivadas > 0 &&
          ` No se cuentan ${resumen.tareas.archivadas} tareas archivadas.`}
      </p>
    </>
  );
}

function PanelBurndown({ burndown, sprint, hayPuntos }) {
  const [unidad, setUnidad] = useState("tareas");
  const enPuntos = hayPuntos && unidad === "puntos";

  const datos = useMemo(
    () =>
      burndown.dias.map((d) => ({
        nombre: fechaCorta(d.dia),
        Pendiente: enPuntos ? d.puntos : d.tareas,
        "Ritmo ideal": enPuntos ? d.idealPuntos : d.idealTareas,
        "Total del sprint": enPuntos ? d.alcancePuntos : d.alcanceTareas,
      })),
    [burndown, enPuntos]
  );

  const cambios = burndown.cambiosDeAlcance.map((c) => {
    const puntos = c.puntos > 0 ? ` (${c.puntos} puntos)` : "";
    const verbo = c.tareas === 1 ? "entró" : "entraron";
    return `el ${fechaCorta(c.dia)} ${verbo} ${textoDeTareas(c.tareas)}${puntos}`;
  });

  return (
    <section className="panel">
      <h2>Trabajo pendiente día a día</h2>
      <p className="subtitulo">
        Cuánto faltaba terminar al cierre de cada día, contra el ritmo que hace falta
        para cerrar el sprint a tiempo (burndown)
      </p>
      {hayPuntos && (
        <div className="filtros" role="group" aria-label="Medir el trabajo en">
          <span>Medir en:</span>
          {UNIDADES.map((u) => (
            <button
              key={u.valor}
              className={"chip" + (unidad === u.valor ? " activo" : "")}
              aria-pressed={unidad === u.valor}
              onClick={() => setUnidad(u.valor)}
            >
              {u.texto}
            </button>
          ))}
        </div>
      )}
      <Lineas datos={datos} series={SERIES_BURNDOWN} />
      {sprint.diasParaEmpezar > 0 && (
        <p className="motivo">
          El sprint todavía no empezó: la línea de lo pendiente aparece desde el{" "}
          {fechaCorta(sprint.inicio)}.
        </p>
      )}
      {cambios.length > 0 && (
        <p className="motivo">
          El total del sprint cambió: {cambios.join("; ")}. Esas tareas se sumaron con
          el sprint empezado.
        </p>
      )}
      {burndown.ingresosEstimados > 0 && (
        <p className="motivo">
          {burndown.ingresosEstimados === 1
            ? "De 1 tarea no se pudo saber cuándo entró al sprint: se toma su fecha de creación."
            : `De ${burndown.ingresosEstimados} tareas no se pudo saber cuándo entraron al sprint: se toma su fecha de creación.`}
        </p>
      )}
    </section>
  );
}

function PanelFlujo({ flujo, sprint }) {
  const datos = useMemo(
    () =>
      flujo.dias.map((d) => ({
        nombre: fechaCorta(d.dia),
        [ETAPAS.done]: d.terminadas,
        [ETAPAS.started]: d.enCurso,
        [ETAPAS.unstarted]: d.pendientes,
      })),
    [flujo]
  );

  return (
    <section className="panel">
      <h2>Flujo del trabajo día a día</h2>
      <p className="subtitulo">
        Cuántas tareas había en cada etapa al cierre de cada día (cumulative flow).
        Si la franja «En curso» se ensancha, el trabajo se está acumulando antes de
        cerrarse.
      </p>
      <AreasApiladas datos={datos} series={SERIES_ETAPAS} />
      {sprint.diasParaEmpezar > 0 && (
        <p className="motivo">
          El sprint todavía no empezó: las franjas aparecen desde el {fechaCorta(sprint.inicio)}.
        </p>
      )}
    </section>
  );
}

// Un desglose por grupo (iniciativa o persona): la barra apilada y, debajo, el
// avance de cada grupo en una linea. Los nombres largos se recortan para que
// entren en el eje.
function Desglose({ grupos }) {
  const datos = useMemo(
    () => grupos.map((g) => ({ nombre: recortar(g.nombre, 24), ...porEtapa(g) })),
    [grupos]
  );
  return (
    <>
      <BarrasApiladas datos={datos} series={SERIES_ETAPAS} anchoEtiquetas={190} />
      <ul className="lista-avance">
        {grupos.map((g) => (
          <li key={g.nombre}>
            <strong>{g.nombre}</strong>: {g.terminadas} de {textoDeTareas(g.total)} terminadas
            {g.pct !== null && ` (${g.pct}%)`}
            {g.puntos > 0 && ` · ${g.puntosTerminados} de ${g.puntos} puntos`}
          </li>
        ))}
      </ul>
    </>
  );
}

function PanelPorIniciativa({ porIniciativa }) {
  return (
    <section className="panel">
      <h2>Avance por iniciativa</h2>
      <p className="subtitulo">
        Cómo viene cada epic del sprint: cuánto se terminó, qué está en curso y qué falta
      </p>
      {porIniciativa.grupos.length === 0 ? (
        <p className="motivo">El sprint todavía no tiene tareas cargadas.</p>
      ) : (
        <Plegable items={porIniciativa.grupos} visibles={GRUPOS_VISIBLES}>
          {(porcion) => <Desglose grupos={porcion} />}
        </Plegable>
      )}
    </section>
  );
}

function PanelPorResponsable({ porResponsable }) {
  const { grupos, compartidas } = porResponsable;
  return (
    <section className="panel">
      <h2>Carga por responsable</h2>
      <p className="subtitulo">
        Cuántas tareas tiene cada persona y en qué etapa están
      </p>
      {grupos.length === 0 ? (
        <p className="motivo">El sprint todavía no tiene tareas cargadas.</p>
      ) : (
        <Plegable items={grupos} visibles={GRUPOS_VISIBLES}>
          {(porcion) => <Desglose grupos={porcion} />}
        </Plegable>
      )}
      {compartidas > 0 && (
        <p className="motivo">
          {compartidas === 1
            ? "1 tarea tiene más de un responsable y cuenta para cada uno."
            : `${compartidas} tareas tienen más de un responsable y cuentan para cada uno.`}{" "}
          Por eso las barras pueden sumar más que el total del sprint.
        </p>
      )}
    </section>
  );
}

function PanelCycleTime({ cycleTime }) {
  const { promedioDias, medianaDias, tareas, sinDatos } = cycleTime;
  const barras = useMemo(
    // Con el eje de 240 px entran unos 30 caracteres por renglon; mas largo,
    // Recharts parte la etiqueta en dos y se pisa con la barra de al lado.
    () => tareas.map((t) => ({ nombre: recortar(`sc-${t.id} ${t.titulo}`, 30), valor: t.dias })),
    [tareas]
  );

  return (
    <section className="panel">
      <h2>Tiempo de resolución</h2>
      <p className="subtitulo">
        Cuánto tardó cada tarea terminada, desde que se empezó hasta que se cerró
        (cycle time)
      </p>
      {tareas.length === 0 ? (
        <p className="motivo">Todavía no hay tareas terminadas para medir.</p>
      ) : (
        <>
          <div className="grilla-kpis">
            <TarjetaKpi
              etiqueta="Promedio"
              valor={duracion(promedioDias)}
              detalle={
                tareas.length === 1 ? "sobre 1 tarea terminada" : `sobre ${tareas.length} tareas terminadas`
              }
            />
            <TarjetaKpi
              etiqueta="Mediana"
              valor={duracion(medianaDias)}
              detalle="la mitad de las tareas tardó menos que esto"
            />
          </div>
          <Plegable items={barras} visibles={FILAS_VISIBLES}>
            {(porcion) => (
              <BarrasHorizontales
                datos={porcion}
                color="var(--agua)"
                etiquetaValor="Días"
                anchoEtiquetas={240}
              />
            )}
          </Plegable>
        </>
      )}
      {sinDatos > 0 && (
        <p className="motivo">
          {sinDatos === 1
            ? "1 tarea terminada no tiene fecha de inicio y no se midió."
            : `${sinDatos} tareas terminadas no tienen fecha de inicio y no se midieron.`}
        </p>
      )}
    </section>
  );
}

// Las tres donas de arriba: lo que se lee en diez segundos.
function ResumenVisual({ resumen, compromiso }) {
  const { comprometidas, agregadas, alcance } = compromiso;
  const avance = [
    { nombre: ETAPAS.done, valor: resumen.tareas.terminadas },
    { nombre: ETAPAS.started, valor: resumen.tareas.enCurso },
    { nombre: ETAPAS.unstarted, valor: resumen.tareas.pendientes },
  ];
  const cumplimiento = [
    { nombre: ETAPAS.done, valor: comprometidas.terminadas },
    { nombre: ETAPAS.started, valor: comprometidas.enCurso },
    { nombre: ETAPAS.unstarted, valor: comprometidas.pendientes },
    { nombre: MOVIDA, valor: comprometidas.movidas },
  ];
  const origen = [
    { nombre: COMPROMETIDO, valor: comprometidas.total },
    { nombre: AGREGADO, valor: agregadas.total },
  ];
  return (
    <section className="panel">
      <h2>El sprint de un vistazo</h2>
      <p className="subtitulo">
        Cuánto está terminado, cuánto de lo prometido se cumplió y cuánto del trabajo se sumó
        con el sprint ya empezado
      </p>
      <div className="tres-columnas">
        <div>
          <p className="titulo-grafico">Avance del sprint</p>
          <Torta
            datos={avance}
            colores={COLORES_ETAPAS}
            centro={conPorcentaje(resumen.tareas.pct)}
            detalle={`${resumen.tareas.terminadas} de ${textoDeTareas(resumen.tareas.total)}`}
          />
        </div>
        <div>
          <p className="titulo-grafico">Compromiso cumplido</p>
          <Torta
            datos={cumplimiento}
            colores={COLORES_ETAPAS}
            centro={conPorcentaje(comprometidas.pct)}
            detalle={`${comprometidas.terminadas} de ${textoDeTareas(comprometidas.total)}`}
          />
        </div>
        <div>
          <p className="titulo-grafico">De dónde salió el trabajo</p>
          <Torta
            datos={origen}
            colores={COLORES_ORIGEN}
            centro={conPorcentaje(alcance.pctAgregado)}
            detalle="se sumó después"
          />
        </div>
      </div>
    </section>
  );
}

function PanelCompromiso({ compromiso, sprint }) {
  const { comprometidas, agregadas, sinTerminar, proyeccion } = compromiso;
  const datos = useMemo(
    () => [
      { nombre: "Comprometido", ...porEtapa(comprometidas), [MOVIDA]: comprometidas.movidas },
      { nombre: "Agregado", ...porEtapa(agregadas), [MOVIDA]: agregadas.movidas },
    ],
    [comprometidas, agregadas]
  );
  const movidas = comprometidas.movidas + agregadas.movidas;

  return (
    <section className="panel">
      <h2>Compromiso del sprint</h2>
      <p className="subtitulo">
        Qué se planificó al cierre del primer día ({fechaCorta(sprint.inicio)}), cuánto de
        eso se cumplió, y qué se sumó o se sacó con el sprint empezado
      </p>
      <div className="grilla-kpis">
        <TarjetaKpi
          etiqueta="Comprometidas"
          valor={comprometidas.total}
          detalle={`tareas al cierre del ${fechaCorta(sprint.inicio)}`}
        />
        <TarjetaKpi
          etiqueta="Cumplidas"
          valor={conPorcentaje(comprometidas.pct)}
          detalle={`${comprometidas.terminadas} de ${textoDeTareas(comprometidas.total)} comprometidas`}
          critico={comprometidas.pct !== null && sprint.diasRestantes === 0 && comprometidas.pct < 100}
        />
        <TarjetaKpi
          etiqueta="Agregadas en el sprint"
          valor={agregadas.total}
          detalle={
            agregadas.total === 0
              ? "no se sumó nada con el sprint empezado"
              : `${agregadas.terminadas} terminadas · ${conPorcentaje(agregadas.pct)}`
          }
        />
        <TarjetaKpi
          etiqueta="Movidas a otro sprint"
          valor={movidas}
          detalle={
            movidas === 0
              ? "nada se sacó del sprint"
              : `${comprometidas.movidas} eran comprometidas`
          }
        />
        {proyeccion && (
          <TarjetaKpi
            etiqueta="Proyección al cierre"
            valor={`${proyeccion.terminadasAlCierre} de ${proyeccion.total}`}
            detalle={`estimación: ${proyeccion.terminadasPorDia} por día en ${dias(
              proyeccion.diasTranscurridos
            )} transcurridos`}
            critico={proyeccion.pct !== null && proyeccion.pct < 100}
          />
        )}
      </div>
      <BarrasApiladas datos={datos} series={SERIES_COMPROMISO} anchoEtiquetas={120} />
      {proyeccion && (
        <p className="motivo">
          La proyección es una regla de tres con el ritmo de los días que ya pasaron, no un
          dato de Shortcut: sirve para ver si el sprint llega, no para prometerlo.
        </p>
      )}
      <h3 className="subtitulo">Comprometidas sin terminar ({sinTerminar.length})</h3>
      <Plegable items={sinTerminar} visibles={FILAS_VISIBLES}>
        {(porcion) => (
          <TablaDeTareas
            tareas={porcion}
            vacia="Todo lo comprometido está terminado."
            mostrarDestino
          />
        )}
      </Plegable>
    </section>
  );
}

function PanelRitmo({ ritmo, sprint }) {
  const datos = useMemo(
    () =>
      ritmo.dias.map((d) => ({
        nombre: fechaCorta(d.dia),
        Entraron: d.entraron,
        Terminadas: d.terminadas,
      })),
    [ritmo]
  );
  return (
    <section className="panel">
      <h2>Ritmo de resolución día a día</h2>
      <p className="subtitulo">
        Cuántas tareas entraron al sprint y cuántas se terminaron cada día. La primera
        barra de «Entraron» es con lo que arrancó el sprint.
      </p>
      {datos.length === 0 ? (
        <p className="motivo">
          El sprint todavía no empezó: las barras aparecen desde el {fechaCorta(sprint.inicio)}.
        </p>
      ) : (
        <BarrasAgrupadas datos={datos} series={SERIES_RITMO} />
      )}
    </section>
  );
}

async function pedirHistorial(metodo) {
  let res;
  try {
    res = await fetch(seccion.endpoint + "/historial", { method: metodo });
  } catch {
    return { error: "No se pudo conectar con el backoffice." };
  }
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) return { error: cuerpo?.motivo ?? `El backoffice respondió HTTP ${res.status}.` };
  return { historial: cuerpo };
}

// El historial de sprints se pide a su propio endpoint: lee las tareas y el
// historial de cada sprint, y no tiene por que frenar la carga del sprint actual.
function PanelHistorial({ pedido, sprintActual }) {
  const [historial, setHistorial] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    pedirHistorial(pedido.metodo).then((r) => {
      if (!vigente) return;
      setCargando(false);
      if (r.historial) {
        setHistorial(r.historial);
        setError(null);
      } else {
        setError(r.error);
      }
    });
    return () => {
      vigente = false;
    };
  }, [pedido]);

  const datos = useMemo(
    () =>
      (historial?.sprints ?? []).map((s) => ({
        nombre: recortar(s.nombre, 18),
        Comprometidas: s.comprometidas,
        Cumplidas: s.cumplidas,
        Agregadas: s.agregadas,
      })),
    [historial]
  );

  return (
    <section className="panel">
      <h2>Historial de sprints</h2>
      <p className="subtitulo">
        Sprint por sprint: cuánto se comprometió, cuánto de eso se cumplió y cuánto se sumó
        en el camino. Para ver si lo planificado se termina en el período previsto.
      </p>
      {cargando ? (
        <p className="motivo">Consultando los sprints en Shortcut…</p>
      ) : error ? (
        <p className="motivo">No se pudo armar el historial: {error}</p>
      ) : historial.sprints.length === 0 ? (
        <p className="motivo">Todavía no hay sprints empezados para comparar.</p>
      ) : (
        <>
          <BarrasAgrupadas datos={datos} series={SERIES_HISTORIAL} />
          <div className="contrato">
            <table>
              <thead>
                <tr>
                  <th>Sprint</th>
                  <th>Comprometidas</th>
                  <th>Cumplimiento</th>
                  <th>Agregadas</th>
                  <th>Movidas</th>
                  <th>Terminadas</th>
                  <th>Puntos</th>
                </tr>
              </thead>
              <tbody>
                {historial.sprints.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.id === sprintActual ? <strong>{s.nombre}</strong> : s.nombre}
                      <span className="subtexto">
                        {s.estado.toLowerCase()} · {fechaCorta(s.inicio)} al {fechaCorta(s.fin)}
                      </span>
                    </td>
                    <td className="sin-corte">{s.comprometidas}</td>
                    <td>
                      <BarraDeProgreso
                        pct={s.pctCumplimiento}
                        color={
                          s.estado === ESTADOS_SPRINT.done && s.pctCumplimiento !== null && s.pctCumplimiento < 100
                            ? "var(--alerta)"
                            : "var(--verde)"
                        }
                        texto={`${s.cumplidas} de ${s.comprometidas}${
                          s.pctCumplimiento !== null ? ` · ${s.pctCumplimiento}%` : ""
                        }`}
                      />
                    </td>
                    <td className="sin-corte">
                      {s.agregadas}
                      {s.agregadas > 0 && (
                        <span className="subtexto">{s.agregadasTerminadas} terminadas</span>
                      )}
                    </td>
                    <td className="sin-corte">{s.movidas}</td>
                    <td className="sin-corte">
                      {s.terminadas} de {s.total} {s.pctTerminado !== null && `(${s.pctTerminado}%)`}
                    </td>
                    <td className="sin-corte">
                      {s.puntosTotales > 0 ? `${s.puntosTerminados} de ${s.puntosTotales}` : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {historial.problemas.length > 0 && (
            <p className="motivo">
              {historial.problemas.length === 1
                ? "1 dato de Shortcut no se pudo leer o traducir al armar el historial."
                : `${historial.problemas.length} datos de Shortcut no se pudieron leer o traducir al armar el historial.`}
            </p>
          )}
          <p className="motivo">
            Una tarea que se movió de un sprint a otro cuenta en el de origen como no cumplida.
            Las que se sacaron al backlog no se ven: Shortcut no las lista en ningún sprint.
          </p>
        </>
      )}
    </section>
  );
}

function PanelTiempoEnSprint({ tiempoEnSprint, tiempoPorColumna }) {
  const { promedioDias, medianaDias, tareas, sinDatos } = tiempoEnSprint;
  const barras = useMemo(
    () => tareas.map((t) => ({ nombre: recortar(`sc-${t.id} ${t.titulo}`, 30), valor: t.dias })),
    [tareas]
  );
  const columnas = useMemo(
    () => tiempoPorColumna.columnas.map((c) => ({ nombre: c.nombre, valor: c.promedioDias })),
    [tiempoPorColumna]
  );
  // Donde se acumulan los dias de espera: los dias totales de cada columna.
  const reparto = useMemo(
    () => ({
      datos: tiempoPorColumna.columnas.map((c) => ({ nombre: c.nombre, valor: c.diasTotales })),
      colores: Object.fromEntries(
        tiempoPorColumna.columnas.map((c, i) => [c.nombre, PALETA_COLUMNAS[i % PALETA_COLUMNAS.length]])
      ),
      total: tiempoPorColumna.columnas.reduce((t, c) => t + c.diasTotales, 0),
      mayor: [...tiempoPorColumna.columnas].sort((a, b) => b.diasTotales - a.diasTotales)[0],
    }),
    [tiempoPorColumna]
  );

  return (
    <section className="panel">
      <h2>Tiempo en el sprint</h2>
      <p className="subtitulo">
        Cuántos días pasaron desde que cada tarea entró al sprint hasta que se terminó, y en
        qué columnas del tablero se queda el trabajo
      </p>
      {tareas.length === 0 ? (
        <p className="motivo">Todavía no hay tareas terminadas para medir.</p>
      ) : (
        <>
          <div className="grilla-kpis">
            <TarjetaKpi
              etiqueta="Promedio"
              valor={diasDeCalendario(promedioDias)}
              detalle={
                tareas.length === 1 ? "sobre 1 tarea terminada" : `sobre ${tareas.length} tareas terminadas`
              }
            />
            <TarjetaKpi
              etiqueta="Mediana"
              valor={diasDeCalendario(medianaDias)}
              detalle="la mitad de las tareas tardó menos que esto"
            />
          </div>
          <Plegable items={barras} visibles={FILAS_VISIBLES}>
            {(porcion) => (
              <BarrasHorizontales
                datos={porcion}
                color="var(--agua)"
                etiquetaValor="Días en el sprint"
                anchoEtiquetas={240}
              />
            )}
          </Plegable>
        </>
      )}
      {sinDatos > 0 && (
        <p className="motivo">
          {sinDatos === 1
            ? "1 tarea terminada no tiene fecha de terminación y no se midió."
            : `${sinDatos} tareas terminadas no tienen fecha de terminación y no se midieron.`}
        </p>
      )}
      {columnas.length > 0 && (
        <>
          <h3 className="subtitulo">Dónde espera el trabajo</h3>
          <div className="dos-columnas">
            <div>
              <p className="titulo-grafico">Reparto de los días entre columnas</p>
              <Torta
                datos={reparto.datos}
                colores={reparto.colores}
                centro={reparto.mayor ? reparto.mayor.nombre : "–"}
                detalle={
                  reparto.total > 0 && reparto.mayor
                    ? `${Math.round((reparto.mayor.diasTotales / reparto.total) * 100)}% de los días`
                    : "sin datos"
                }
              />
            </div>
            <div>
              <p className="titulo-grafico">Días promedio en cada columna</p>
              <BarrasHorizontales datos={columnas} color="var(--naranja)" etiquetaValor="Días promedio" />
            </div>
          </div>
          <ul className="lista-avance">
            {tiempoPorColumna.columnas.map((c) => (
              <li key={c.id}>
                <strong>{c.nombre}</strong>: {c.promedioDias} días en promedio, mediana {c.medianaDias},
                sobre {textoDeTareas(c.tareas)}
              </li>
            ))}
          </ul>
          <p className="motivo">
            Reconstruido del historial de cada tarea terminada, desde que se creó hasta que se
            terminó. Sirve aunque las tarjetas salten directo a Done, que es cuando el cycle
            time de abajo da cero.
            {tiempoPorColumna.sinDatos > 0 &&
              ` ${textoDeTareas(tiempoPorColumna.sinDatos)} sin historial legible no se midieron.`}
          </p>
        </>
      )}
    </section>
  );
}

function TablaDeTareas({ tareas, vacia, mostrarDestino = false }) {
  if (tareas.length === 0) return <p className="motivo">{vacia}</p>;
  return (
    <div className="contrato">
      <table>
        <thead>
          <tr>
            <th>Tarea</th>
            <th>Estado</th>
            <th>Iniciativa</th>
            <th>Responsable</th>
            <th>Puntos</th>
            {mostrarDestino && <th>Sprint</th>}
          </tr>
        </thead>
        <tbody>
          {tareas.map((t) => (
            <tr key={t.id}>
              <td>
                {t.titulo}
                <a className="id-tarea" href={t.url} target="_blank" rel="noreferrer">
                  sc-{t.id}
                </a>
                {t.historia && (
                  <span className="subtexto">
                    Subtarea de {t.historia.titulo ?? `sc-${t.historia.id}`}
                  </span>
                )}
              </td>
              <td className="sin-corte">
                {t.estado}
                {t.terminadaEl && (
                  <span className="subtexto">{fechaCorta(diaLocal(t.terminadaEl))}</span>
                )}
              </td>
              <td className="sin-corte">{t.epic ?? "–"}</td>
              <td>{t.responsables.length > 0 ? t.responsables.join(", ") : "Sin asignar"}</td>
              <td className="sin-corte">{t.puntos ?? "–"}</td>
              {mostrarDestino && (
                <td className="sin-corte">
                  {t.movidaA ? `Movida a ${t.movidaA.nombre ?? `sprint ${t.movidaA.id}`}` : "Este"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Lo que no se pudo traducir se muestra, plegado para no ensuciar la vista de
// negocio: un dato que no se entiende nunca se esconde.
function Problemas({ problemas }) {
  return (
    <details className="panel">
      <summary>
        {problemas.length === 1
          ? "1 dato de Shortcut no se pudo traducir"
          : `${problemas.length} datos de Shortcut no se pudieron traducir`}
      </summary>
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
                <td>sc-{p.tarea}</td>
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
    </details>
  );
}
