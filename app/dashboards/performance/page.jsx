"use client";

import { useEffect, useMemo, useState } from "react";
import EncabezadoSeccion from "@/components/EncabezadoSeccion";
import TarjetaKpi from "@/components/TarjetaKpi";
import Lineas from "@/components/Lineas";
import BarrasHorizontales from "@/components/BarrasHorizontales";
import { buscarSeccion, ESTADO_SIN_FUENTE } from "@/lib/secciones";
import { diaLocal, ESTADOS_SPRINT, ZONA_HORARIA } from "@/lib/kpis/performance";

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

const UNIDADES = [
  { valor: "tareas", texto: "Tareas" },
  { valor: "puntos", texto: "Puntos" },
];

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
          reporte && <Reporte reporte={reporte} />
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

function Reporte({ reporte }) {
  const { sprint, resumen, porEstado, burndown, cycleTime, terminadas, pendientes, lectura, problemas } =
    reporte;
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

      <PanelBurndown burndown={burndown} sprint={sprint} hayPuntos={resumen.puntos.total > 0} />

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

      <PanelCycleTime cycleTime={cycleTime} />

      <section className="panel">
        <h2>Terminadas ({terminadas.length})</h2>
        <p className="subtitulo">Las tareas cerradas del sprint, la más reciente primero</p>
        <TablaDeTareas tareas={terminadas} vacia="Todavía no se terminó ninguna tarea." />
      </section>

      <section className="panel">
        <h2>Pendientes ({pendientes.length})</h2>
        <p className="subtitulo">Lo que falta terminar, empezando por lo más avanzado</p>
        <TablaDeTareas tareas={pendientes} vacia="No queda nada pendiente." />
      </section>

      {problemas.length > 0 && <Problemas problemas={problemas} />}

      <p className="nota">
        Fuente: Shortcut. Cada tarea es una story de Shortcut, subtareas incluidas; la
        iniciativa es el epic al que pertenece y los puntos son la estimación de
        esfuerzo que carga el equipo. Los datos se releen solos cada pocos minutos y
        «Actualizar» los trae de Shortcut en el momento.
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
          <BarrasHorizontales
            datos={barras}
            color="var(--agua)"
            etiquetaValor="Días"
            anchoEtiquetas={240}
          />
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

function TablaDeTareas({ tareas, vacia }) {
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
