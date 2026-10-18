"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import Insignia from "@/components/Insignia";
import { buscarSeccion, ESTADO_SIN_FUENTE } from "@/lib/secciones";
import { diaLocal, ESTADOS_SPRINT, ETAPAS, ZONA_HORARIA } from "@/lib/kpis/performance";
import { SIN_ASIGNAR, SIN_ROL, TIPOS_DE_METRICA } from "@/lib/kpis/equipo";
import { AMBITO_PROYECTO } from "@/lib/kpis/proyecto";

const seccion = buscarSeccion("performance");

// Que se esta mirando: el proyecto entero (lo que se abre por defecto) o un
// sprint. Los paneles que se comparten entre las dos vistas cambian sus textos
// con esto, asi "del sprint" no aparece en el proyecto.
const ALCANCES = {
  [AMBITO_PROYECTO]: {
    del: "del proyecto",
    en: "en el proyecto",
    durante: "en los sprints del proyecto",
    semanas: "que suman todos los sprints",
    okrs: "Los tres resultados clave de todo el proyecto, con todos los sprints sumados, contra la meta que acordó el equipo",
    sinTareas: "El proyecto todavía no tiene tareas cargadas en ningún sprint.",
    sinBugs:
      "El proyecto no tiene ninguna story de tipo «bug» en Shortcut. El ratio empieza a decir algo cuando los defectos se carguen con ese tipo, no como feature.",
  },
  sprint: {
    del: "del sprint",
    en: "en el sprint",
    durante: "durante el sprint",
    semanas: "del sprint",
    okrs: "Los tres resultados clave del sprint contra la meta que acordó el equipo",
    sinTareas: "El sprint todavía no tiene tareas cargadas.",
    sinBugs:
      "El sprint no tiene ninguna story de tipo «bug» en Shortcut. El ratio empieza a decir algo cuando los defectos se carguen con ese tipo, no como feature.",
  },
};

// El anillo de puntos del proyecto solo reparte terminados y pendientes: los
// puntos "en curso" no son un dato de Shortcut.
const PUNTOS_TERMINADOS = "Terminados";
const PUNTOS_PENDIENTES = "Pendientes";
const COLORES_PUNTOS = {
  [PUNTOS_TERMINADOS]: "var(--verde)",
  [PUNTOS_PENDIENTES]: "var(--tinta-clara)",
};

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
// formatean en UTC para que la zona del navegador no las corra un dia. Sin
// fecha (un proyecto sin sprints) se muestra "–", no se tira la pantalla.
const fechaCorta = (dia) => (dia ? FECHA_CORTA.format(new Date(`${dia}T00:00:00Z`)) : "–");
const diaYHora = (instante) => DIA_Y_HORA.format(new Date(instante));
const conPorcentaje = (pct) => (pct === null ? "–" : `${pct}%`);
const dias = (n) => (n === 1 ? "1 día" : `${n} días`);
const textoDeTareas = (n) => (n === 1 ? "1 tarea" : `${n} tareas`);
// "1 de 1 tarea terminada", "3 de 5 tareas terminadas": concuerda con el total.
const terminadasDe = (n, total) =>
  `${n} de ${textoDeTareas(total)} ${total === 1 ? "terminada" : "terminadas"}`;
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

// Paneles de equipo: tareas y puntos por rol, y horas dentro de lo pactado
// contra las que lo exceden.
const SERIES_POR_ROL = [
  { clave: "Tareas", color: "var(--agua)" },
  { clave: "Puntos", color: "var(--tinta-tenue)" },
];
const DENTRO_DE_LO_PACTADO = "Dentro de lo pactado";
const EXTRAS = "Horas extras";
const SERIES_HORAS = [
  { clave: DENTRO_DE_LO_PACTADO, color: "var(--agua)" },
  { clave: EXTRAS, color: "var(--alerta)" },
];
const INTEGRANTES_VISIBLES = 10;
const horas = (n) => (n === null || n === undefined ? "–" : `${n} h`);
const listar = (nombres) =>
  nombres.length <= 2 ? nombres.join(" y ") : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;

// Dias de calendario enteros o con un decimal (promedios): 0 es "el mismo dia".
function diasDeCalendario(n) {
  if (n === null) return "–";
  if (n === 0) return "el mismo día";
  return dias(n);
}

// El proyecto entero y cada sprint tienen su endpoint: el del proyecto lee las
// tareas de todos los sprints.
async function pedirReporte(ambito, metodo) {
  const url =
    ambito === AMBITO_PROYECTO
      ? `${seccion.endpoint}/proyecto`
      : `${seccion.endpoint}?sprint=${ambito}`;
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
  if (reporte.ambito === AMBITO_PROYECTO) return { tono: "ok", texto: "Todo el proyecto" };
  return {
    tono: reporte.sprint.estado === ESTADOS_SPRINT.unstarted ? "pendiente" : "ok",
    texto: `Sprint ${reporte.sprint.estado.toLowerCase()}`,
  };
}

// El ambito viene de la URL (?sprint=<id>) para que un enlace se comparta con
// el sprint puesto; sin parametro se abre el proyecto entero. Se lee en el
// navegador, despues del primer render, para no desacordar con el servidor. Un
// valor que no es un numero no se traga en silencio: `invalido` lo devuelve
// para avisarlo y limpiar la URL.
function ambitoDeLaUrl() {
  const sprint = new URLSearchParams(window.location.search).get("sprint");
  if (sprint === null) return { ambito: AMBITO_PROYECTO, invalido: null };
  if (/^\d+$/.test(sprint)) return { ambito: Number(sprint), invalido: null };
  return { ambito: AMBITO_PROYECTO, invalido: sprint };
}

function escribirAmbitoEnLaUrl(ambito) {
  const url = new URL(window.location.href);
  if (ambito === AMBITO_PROYECTO) url.searchParams.delete("sprint");
  else url.searchParams.set("sprint", String(ambito));
  window.history.replaceState(null, "", url);
}

// "2 sprints · 23 sept al 21 oct": la opcion del proyecto en el selector.
function textoDelProyecto(sprints) {
  if (sprints.length === 0) return "sin sprints todavía";
  const inicio = sprints.map((s) => s.inicio).sort()[0];
  const fin = sprints.map((s) => s.fin).sort().at(-1);
  return `${textoDeSprints(sprints.length)} · ${fechaCorta(inicio)} al ${fechaCorta(fin)}`;
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
  // null hasta leer la URL en el navegador; despues, el proyecto o un sprint.
  const [ambito, setAmbito] = useState(null);
  const [reporte, setReporte] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [avisoDeUrl, setAvisoDeUrl] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  // El historial de sprints de la vista de un sprint se pide aparte (es mas
  // caro); "Actualizar" lo vuelve a pedir sin cache, igual que al reporte.
  const [pedidoDeHistorial, setPedidoDeHistorial] = useState({ n: 0, metodo: "GET" });
  // Lo ultimo que se eligio: una respuesta de "Actualizar" que llega despues de
  // cambiar de vista se descarta en vez de pisar lo nuevo.
  const ambitoVigente = useRef(null);

  useEffect(() => {
    const { ambito: pedido, invalido } = ambitoDeLaUrl();
    if (invalido !== null) {
      escribirAmbitoEnLaUrl(AMBITO_PROYECTO);
      setAvisoDeUrl(`«${invalido}» no es el número de un sprint: se muestra el proyecto entero.`);
    }
    ambitoVigente.current = pedido;
    setAmbito(pedido);
  }, []);

  useEffect(() => {
    if (ambito === null) return;
    let vigente = true;
    pedirReporte(ambito, "GET").then((r) => {
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
  }, [ambito]);

  function elegirAmbito(valor) {
    ambitoVigente.current = valor;
    setActualizando(false);
    setAvisoDeUrl(null);
    setCargando(true);
    setAmbito(valor);
    escribirAmbitoEnLaUrl(valor);
  }

  async function actualizar() {
    const pedido = ambito;
    setActualizando(true);
    // El historial solo existe en la vista de un sprint; en el proyecto no hay
    // nada que volver a pedir.
    if (pedido !== AMBITO_PROYECTO) setPedidoDeHistorial((p) => ({ n: p.n + 1, metodo: "POST" }));
    const r = await pedirReporte(pedido, "POST");
    if (ambitoVigente.current !== pedido) return;
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
        {/* Con un error y nada cargado (un ?sprint= que no existe) el selector
            igual se muestra, con el proyecto solo, para poder volver. */}
        {ambito !== null && (reporte || error) && (
          <div className="controles">
            <label className="selector">
              Ver
              <select
                value={String(ambito)}
                onChange={(e) =>
                  elegirAmbito(
                    e.target.value === AMBITO_PROYECTO ? AMBITO_PROYECTO : Number(e.target.value)
                  )
                }
                disabled={cargando || actualizando}
              >
                <option value={AMBITO_PROYECTO}>
                  Todo el proyecto{reporte ? ` · ${textoDelProyecto(reporte.sprints)}` : ""}
                </option>
                {/* Sin reporte, el sprint pedido tiene que figurar como opcion
                    (deshabilitada) para que elegir el proyecto sea un cambio. */}
                {!reporte && ambito !== AMBITO_PROYECTO && (
                  <option value={String(ambito)} disabled>
                    Sprint {ambito} (no existe)
                  </option>
                )}
                {(reporte?.sprints ?? []).map((s) => (
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
            {reporte?.lectura.leidoEl && (
              <span className="lectura">
                Datos de Shortcut del {diaYHora(reporte.lectura.leidoEl)}
              </span>
            )}
          </div>
        )}
      </EncabezadoSeccion>

      <main className="contenedor">
        {avisoDeUrl && (
          <div className="aviso" role="status">
            {avisoDeUrl}
          </div>
        )}
        {aviso && (
          <div className="aviso" role="status">
            No se pudo actualizar: {aviso} Se siguen mostrando los datos anteriores.
          </div>
        )}

        {cargando ? (
          <div className="panel cargando">
            {ambito === AMBITO_PROYECTO
              ? "Consultando todos los sprints en Shortcut…"
              : "Consultando Shortcut…"}
          </div>
        ) : error ? (
          <PanelDeError
            error={error}
            volver={ambito !== AMBITO_PROYECTO ? () => elegirAmbito(AMBITO_PROYECTO) : null}
          />
        ) : reporte?.ambito === AMBITO_PROYECTO ? (
          <Proyecto reporte={reporte} />
        ) : (
          reporte && (
            <Reporte
              reporte={reporte}
              pedidoDeHistorial={pedidoDeHistorial}
              verProyecto={() => elegirAmbito(AMBITO_PROYECTO)}
              ocupado={actualizando}
            />
          )
        )}
      </main>
    </>
  );
}

// `volver` es el camino de vuelta al proyecto cuando el error es de un sprint
// pedido en la URL (por ejemplo uno que no existe).
function PanelDeError({ error, volver }) {
  const volverAlProyecto = volver && (
    <p>
      <button type="button" className="chip" onClick={volver}>
        Volver al proyecto
      </button>
    </p>
  );
  if (error.estado === ESTADO_SIN_FUENTE) {
    return (
      <div className="panel error">
        <strong>Performance todavía no está conectada a Shortcut.</strong>
        <br />
        {error.motivo}
        {volverAlProyecto}
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
      {volverAlProyecto}
    </div>
  );
}

// La vista por defecto: el proyecto entero. Primero los OKR, despues el avance
// total con los anillos, el detalle sprint por sprint y los KPIs del equipo
// sobre todas las tareas, de a dos paneles por fila.
function Proyecto({ reporte }) {
  const {
    periodo,
    progreso,
    errores,
    porSprint,
    porIniciativa,
    porResponsable,
    equipo,
    archivadas,
    lectura,
    problemas,
  } = reporte;
  const alcance = ALCANCES[AMBITO_PROYECTO];

  return (
    <>
      {lectura.desactualizado && (
        <div className="aviso" role="status">
          Estos datos son del {diaYHora(lectura.leidoEl)}. Ya se le pidió una lectura
          nueva a Shortcut: tocá «Actualizar» para verla.
        </div>
      )}

      <PanelOkrs equipo={equipo} alcance={alcance} />

      <PanelAvanceTotal progreso={progreso} errores={errores} periodo={periodo} />

      <PanelPorSprint porSprint={porSprint} enCurso={periodo.enCurso} />

      <div className="tablero">
        <PanelPorIniciativa porIniciativa={porIniciativa} alcance={alcance} />
        <PanelPorResponsable porResponsable={porResponsable} alcance={alcance} />
        <PanelPorRol porRol={equipo.porRol} alcance={alcance} />
        <PanelWip wip={equipo.wip} />
        <PanelCargaPorIntegrante carga={equipo.carga} alcance={alcance} />
        <PanelHoras horas={equipo.horas} alcance={alcance} />
      </div>

      <PanelEfectividad horas={equipo.horas} metas={equipo.configuracion.metas} />

      {problemas.length > 0 && <Problemas problemas={problemas} />}

      <p className="nota">
        Fuente: Shortcut. El proyecto es la suma de todos sus sprints, los terminados, el que
        está en curso y los que todavía no empezaron; lo que no está en ningún sprint no cuenta.
        Cada tarea es una story de Shortcut, subtareas incluidas, contada desde las stories de
        su sprint; lo comprometido es lo que ya estaba en cada sprint al cierre de su primer
        día. Los errores son las stories de tipo «bug» de todo el proyecto. El rol y las horas
        pactadas de cada integrante, las horas por punto y las metas de los OKR salen de{" "}
        <code>data/equipo.json</code>; la capacidad suma las semanas de todos los sprints. Los
        datos se releen solos cada pocos minutos y «Actualizar» los trae de Shortcut en el
        momento.
        {archivadas > 0 && ` No se cuentan ${archivadas} tareas archivadas.`}
      </p>
    </>
  );
}

// La vista de un sprint: los OKR primero, las cuatro tarjetas, el proyecto en
// una linea y el detalle del sprint, con los graficos de a dos por fila.
function Reporte({ reporte, pedidoDeHistorial, verProyecto, ocupado }) {
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
    equipo,
    proyecto,
    terminadas,
    pendientes,
    lectura,
    problemas,
  } = reporte;
  const tarjeta = tarjetaDeDias(sprint);
  const alcance = ALCANCES.sprint;

  return (
    <>
      {lectura.desactualizado && (
        <div className="aviso" role="status">
          Estos datos son del {diaYHora(lectura.leidoEl)}. Ya se le pidió una lectura
          nueva a Shortcut: tocá «Actualizar» para verla.
        </div>
      )}

      <PanelOkrs equipo={equipo} alcance={alcance} />

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

      <FranjaProyecto proyecto={proyecto} verProyecto={verProyecto} ocupado={ocupado} />

      <ResumenVisual resumen={resumen} compromiso={compromiso} />

      <PanelCompromiso compromiso={compromiso} sprint={sprint} />

      <div className="tablero">
        <PanelBurndown burndown={burndown} sprint={sprint} hayPuntos={resumen.puntos.total > 0} />
        <PanelFlujo flujo={flujo} sprint={sprint} />
        <PanelRitmo ritmo={ritmo} sprint={sprint} />
        <PanelPorIniciativa porIniciativa={porIniciativa} alcance={alcance} />
        <PanelPorResponsable porResponsable={porResponsable} alcance={alcance} />
        <PanelPorRol porRol={equipo.porRol} alcance={alcance} />
        <PanelWip wip={equipo.wip} />
        <PanelCargaPorIntegrante carga={equipo.carga} alcance={alcance} />
        <PanelHoras horas={equipo.horas} alcance={alcance} />
        <section className="panel">
          <h2>Tareas por estado</h2>
          <p className="subtitulo">En qué columna del tablero está hoy cada tarea del sprint</p>
          {porEstado.length === 0 ? (
            <p className="motivo">{alcance.sinTareas}</p>
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
      </div>

      <PanelHistorial pedido={pedidoDeHistorial} sprintActual={sprint.id} />

      <PanelEfectividad horas={equipo.horas} metas={equipo.configuracion.metas} />

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
        contando como comprometida y no cumplida. El progreso del proyecto suma las
        estadísticas de todos los sprints, y los errores son las stories de tipo «bug»
        de todo el proyecto. El rol y las horas pactadas de cada
        integrante, las horas por punto y las metas de los OKR salen de{" "}
        <code>data/equipo.json</code>, que mantiene el equipo. Los datos se releen solos cada
        pocos minutos y «Actualizar» los trae de Shortcut en el momento.
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
            <strong>{g.nombre}</strong>: {terminadasDe(g.terminadas, g.total)}
            {g.pct !== null && ` (${g.pct}%)`}
            {g.puntos > 0 && ` · ${g.puntosTerminados} de ${g.puntos} puntos`}
          </li>
        ))}
      </ul>
    </>
  );
}

function PanelPorIniciativa({ porIniciativa, alcance }) {
  return (
    <section className="panel">
      <h2>Avance por iniciativa</h2>
      <p className="subtitulo">
        Cómo viene cada epic {alcance.del}: cuánto se terminó, qué está en curso y qué falta
      </p>
      {porIniciativa.grupos.length === 0 ? (
        <p className="motivo">{alcance.sinTareas}</p>
      ) : (
        <Plegable items={porIniciativa.grupos} visibles={GRUPOS_VISIBLES}>
          {(porcion) => <Desglose grupos={porcion} />}
        </Plegable>
      )}
    </section>
  );
}

function PanelPorResponsable({ porResponsable, alcance }) {
  const { grupos, compartidas } = porResponsable;
  return (
    <section className="panel">
      <h2>Carga por responsable</h2>
      <p className="subtitulo">
        Cuántas tareas tiene cada persona {alcance.en} y en qué etapa están
      </p>
      {grupos.length === 0 ? (
        <p className="motivo">{alcance.sinTareas}</p>
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
          Por eso las barras pueden sumar más que el total {alcance.del}.
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
        <BarrasAgrupadas datos={datos} series={SERIES_RITMO} intervalo="preserveStartEnd" />
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
  // El POST de "Actualizar" se usa una sola vez: el panel se monta de nuevo con
  // cada sprint que se elige, y ahi lee con GET aunque el ultimo pedido haya
  // sido un POST.
  const atendido = useRef(pedido.n);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    const metodo = atendido.current === pedido.n ? "GET" : pedido.metodo;
    atendido.current = pedido.n;
    pedirHistorial(metodo).then((r) => {
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
      ) : (
        <>
          <ComparacionDeSprints sprints={historial.sprints} sprintActual={sprintActual} />
          {historial.problemas.length > 0 && (
            <p className="motivo">
              {historial.problemas.length === 1
                ? "1 dato de Shortcut no se pudo leer o traducir al armar el historial."
                : `${historial.problemas.length} datos de Shortcut no se pudieron leer o traducir al armar el historial.`}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// En la vista del proyecto las filas por sprint ya vienen en la respuesta: no
// hay nada que pedir aparte.
function PanelPorSprint({ porSprint, enCurso }) {
  return (
    <section className="panel">
      <h2>
        Sprint por sprint <Insignia tipo="kpi" />
      </h2>
      <p className="subtitulo">
        Cuánto se comprometió cada sprint, cuánto de eso se cumplió y cuánto se sumó en el
        camino. Para ver si lo planificado se termina en el período previsto.
      </p>
      <ComparacionDeSprints sprints={porSprint} sprintActual={enCurso?.id ?? null} />
    </section>
  );
}

// Las barras y la tabla de comprometido, cumplido, agregado y movido por
// sprint, que comparten el historial de la vista de un sprint y la vista del
// proyecto. El sprint actual va en negrita.
function ComparacionDeSprints({ sprints, sprintActual }) {
  const datos = useMemo(
    () =>
      sprints.map((s) => ({
        nombre: recortar(s.nombre, 18),
        Comprometidas: s.comprometidas,
        Cumplidas: s.cumplidas,
        Agregadas: s.agregadas,
      })),
    [sprints]
  );
  if (sprints.length === 0) {
    return <p className="motivo">Todavía no hay sprints empezados para comparar.</p>;
  }
  return (
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
            {sprints.map((s) => (
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
      <p className="motivo">
        Una tarea que se movió de un sprint a otro cuenta en el de origen como no cumplida.
        Las que se sacaron al backlog no se ven: Shortcut no las lista en ningún sprint.
      </p>
    </>
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
    </details>
  );
}

// ---- Equipo: KPIs y OKRs sobre roles, carga y horas -------------------------

function AvisoDeConfiguracion({ configuracion }) {
  const { integrantes, sinRol, sinHoras, fueraDeLaConfiguracion, horasPorPunto } = configuracion;
  const avisos = [];
  if (integrantes === 0) {
    avisos.push("No hay integrantes cargados en data/equipo.json: todos salen como sin rol.");
  } else {
    if (sinRol.length > 0) avisos.push(`Sin rol en data/equipo.json: ${listar(sinRol)}.`);
    if (sinHoras.length > 0) avisos.push(`Sin horas semanales pactadas: ${listar(sinHoras)}.`);
  }
  if (fueraDeLaConfiguracion.length > 0) {
    avisos.push(`Con tareas en Shortcut pero fuera de data/equipo.json: ${listar(fueraDeLaConfiguracion)}.`);
  }
  if (!horasPorPunto) avisos.push("Falta horasPorPunto: no se calculan horas, utilización ni efectividad.");
  if (avisos.length === 0) return null;
  return <p className="motivo">{avisos.join(" ")}</p>;
}

function Leyenda() {
  return (
    <p className="leyenda-metricas">
      {Object.entries(TIPOS_DE_METRICA).map(([tipo, clase]) => (
        <span key={tipo}>
          <Insignia tipo={tipo} />
          {clase.nombre}: {tipo === "okr" ? "tiene una meta acordada" : "se mira, no tiene meta"}
        </span>
      ))}
    </p>
  );
}

function detalleDeOkr(okr, { bugs, horas: h }, alcance) {
  if (okr.clave === "bugsRatio") {
    if (bugs.historiasTerminadas === 0) return "todavía no hay historias terminadas para comparar";
    return `${bugs.bugsAbiertosEnSprint} ${
      bugs.bugsAbiertosEnSprint === 1 ? "bug reportado" : "bugs reportados"
    } ${alcance.durante} sobre ${bugs.historiasTerminadas} ${
      bugs.historiasTerminadas === 1 ? "historia terminada" : "historias terminadas"
    }`;
  }
  if (!h.configurado) return "falta horasPorPunto en data/equipo.json";
  if (okr.clave === "efectividad") {
    if (h.equipo.comprometidas === 0) return "no hay horas comprometidas al cierre del primer día";
    return `${horas(h.equipo.hechas)} hechas de ${horas(h.equipo.comprometidas)} comprometidas`;
  }
  if (h.equipo.capacidad === 0) return "nadie tiene horas semanales pactadas";
  return `${horas(h.equipo.demanda)} de demanda sobre ${horas(h.equipo.capacidad)} de capacidad`;
}

const valorDeOkr = (okr) =>
  okr.valor === null ? "–" : okr.clave === "bugsRatio" ? String(okr.valor) : `${okr.valor}%`;

// Los OKR van primero en las dos vistas: son lo que el equipo acordó medir.
function PanelOkrs({ equipo, alcance }) {
  const { okrs, bugs, horas: horasDelEquipo, configuracion } = equipo;
  return (
    <section className="panel okrs-principales">
      <h2>OKRs principales</h2>
      <p className="subtitulo">{alcance.okrs}</p>
      <Leyenda />
      <div className="grilla-kpis">
        {okrs.map((okr) => (
          <TarjetaKpi
            key={okr.clave}
            tipo="okr"
            etiqueta={okr.nombre}
            valor={valorDeOkr(okr)}
            meta={okr.descripcionMeta}
            cumple={okr.cumple}
            critico={okr.cumple === false}
            detalle={detalleDeOkr(okr, { bugs, horas: horasDelEquipo }, alcance)}
          />
        ))}
      </div>
      {bugs.bugs === 0 && <p className="motivo">{alcance.sinBugs}</p>}
      <AvisoDeConfiguracion configuracion={configuracion} />
    </section>
  );
}

function PanelPorRol({ porRol, alcance }) {
  const { grupos, compartidas, totalTareas } = porRol;
  const datos = useMemo(
    () => grupos.map((g) => ({ nombre: g.rol, Tareas: g.tareas, Puntos: g.puntos })),
    [grupos]
  );
  return (
    <section className="panel">
      <h2>
        Distribución por rol <Insignia tipo="kpi" />
      </h2>
      <p className="subtitulo">
        Cuántas tareas y puntos {alcance.del} tiene cada rol: UX, Dev, QA y PM
      </p>
      {totalTareas === 0 ? (
        <p className="motivo">{alcance.sinTareas}</p>
      ) : (
        <>
          <BarrasAgrupadas datos={datos} series={SERIES_POR_ROL} />
          <ul className="lista-avance">
            {grupos.map((g) => (
              <li key={g.rol}>
                <strong>{g.rol}</strong>
                {g.rol !== SIN_ASIGNAR &&
                  ` (${g.integrantes === 1 ? "1 integrante" : `${g.integrantes} integrantes`})`}
                : {textoDeTareas(g.tareas)}
                {g.pctTareas !== null && ` (${g.pctTareas}%)`}
                {g.puntos > 0 && ` · ${g.puntos} puntos${g.pctPuntos !== null ? ` (${g.pctPuntos}%)` : ""}`}
                {g.terminadas > 0 && ` · ${g.terminadas} terminadas`}
              </li>
            ))}
          </ul>
        </>
      )}
      {compartidas > 0 && (
        <p className="motivo">
          {compartidas === 1
            ? "1 tarea tiene responsables de más de un rol y cuenta para cada uno."
            : `${compartidas} tareas tienen responsables de más de un rol y cuentan para cada uno.`}{" "}
          Por eso los porcentajes pueden sumar más de 100.
        </p>
      )}
    </section>
  );
}

function PanelWip({ wip }) {
  const { grupos, maximoPorPersona } = wip;
  const sobrecargadas = grupos.flatMap((g) =>
    g.personas.filter((p) => p.sobrecargada).map((p) => ({ ...p, rol: g.rol }))
  );
  return (
    <section className="panel">
      <h2>
        Trabajo en curso por rol <Insignia tipo="kpi" />
      </h2>
      <p className="subtitulo">
        Tareas en In Progress, In Review o Ready for deploy que tiene cada rol hoy (WIP). Un rol
        se marca cuando alguien tiene más de {maximoPorPersona} a la vez.
      </p>
      {grupos.length === 0 ? (
        <p className="motivo">No hay roles configurados ni tareas en curso.</p>
      ) : (
        <div className="grilla-kpis">
          {grupos.map((g) => (
            <TarjetaKpi
              key={g.rol}
              etiqueta={g.rol}
              valor={g.enCurso}
              critico={g.sobrecargado}
              detalle={
                g.enCurso === 0
                  ? "nada en curso"
                  : [
                      g.personasActivas === 1 ? "1 persona" : `${g.personasActivas} personas`,
                      `${g.porPersona} por persona`,
                      ...g.porEstado.map((e) => `${e.estado} ${e.tareas}`),
                    ].join(" · ")
              }
            />
          ))}
        </div>
      )}
      {sobrecargadas.length > 0 && (
        <p className="motivo">
          Sobrecarga:{" "}
          {sobrecargadas
            .map((p) => `${p.nombre} (${p.rol}) tiene ${textoDeTareas(p.enCurso)} en curso`)
            .join("; ")}
          . El máximo configurado es {maximoPorPersona} por persona.
        </p>
      )}
    </section>
  );
}

function PanelCargaPorIntegrante({ carga, alcance }) {
  const { personas, sinAsignar } = carga;
  const barras = useMemo(
    () =>
      personas.map((p) => ({
        // Con el eje de 200 px (va en medio panel) entran unos 26 caracteres.
        nombre: recortar(p.rol === SIN_ROL ? p.nombre : `${p.nombre} · ${p.rol}`, 26),
        valor: p.puntos,
      })),
    [personas]
  );
  const sinEstimar = personas.reduce((total, p) => total + p.sinEstimar, 0);
  return (
    <section className="panel">
      <h2>
        Carga por integrante <Insignia tipo="kpi" />
      </h2>
      <p className="subtitulo">Los story points asignados a cada persona {alcance.en}</p>
      {personas.length === 0 ? (
        <p className="motivo">No hay integrantes configurados ni tareas asignadas.</p>
      ) : (
        <Plegable items={barras} visibles={INTEGRANTES_VISIBLES}>
          {(porcion) => (
            <BarrasHorizontales
              datos={porcion}
              color="var(--agua)"
              etiquetaValor="Puntos"
              anchoEtiquetas={200}
            />
          )}
        </Plegable>
      )}
      {(sinAsignar.tareas > 0 || sinEstimar > 0) && (
        <p className="motivo">
          {sinAsignar.tareas > 0 &&
            `${textoDeTareas(sinAsignar.tareas)} sin responsable (${sinAsignar.puntos} puntos) no se reparten. `}
          {sinEstimar > 0 &&
            `${textoDeTareas(sinEstimar)} asignadas no tienen estimación y suman 0 puntos.`}
        </p>
      )}
    </section>
  );
}

function PanelHoras({ horas: datosDeHoras, alcance }) {
  const { configurado, personas, sinHoras, semanas, horasPorPunto, equipo } = datosDeHoras;
  const conCapacidad = personas.filter((p) => p.capacidad !== null);
  const datos = useMemo(
    () =>
      conCapacidad.map((p) => ({
        nombre: recortar(p.nombre, 24),
        [DENTRO_DE_LO_PACTADO]: p.dentroDeLoPactado,
        [EXTRAS]: p.extras,
      })),
    [conCapacidad]
  );
  return (
    <section className="panel">
      <h2>
        Horas pactadas vs. extras <Insignia tipo="kpi" />
      </h2>
      <p className="subtitulo">
        Las horas que demanda lo asignado a cada persona contra sus horas semanales pactadas
        {semanas === null
          ? ` ${alcance.en}`
          : ` por las ${semanas} semanas ${alcance.semanas}`}
        {horasPorPunto ? `, a ${horasPorPunto} h por punto` : ""}
      </p>
      {!configurado ? (
        <p className="motivo">
          Falta <code>horasPorPunto</code> en data/equipo.json: sin eso no hay forma de pasar los
          puntos a horas.
        </p>
      ) : conCapacidad.length === 0 ? (
        <p className="motivo">
          Nadie tiene horas semanales pactadas en data/equipo.json: no hay capacidad contra qué
          comparar.
        </p>
      ) : (
        <>
          <div className="grilla-kpis">
            <TarjetaKpi
              etiqueta={`Capacidad ${alcance.del}`}
              valor={horas(equipo.capacidad)}
              detalle={`${conCapacidad.length === 1 ? "1 persona" : `${conCapacidad.length} personas`} con horas pactadas`}
            />
            <TarjetaKpi
              etiqueta="Demanda asignada"
              valor={horas(equipo.demanda)}
              detalle="puntos asignados pasados a horas"
            />
            <TarjetaKpi
              etiqueta="Horas extras"
              valor={horas(equipo.extras)}
              critico={equipo.extras > 0}
              detalle={
                equipo.conSobrecarga === 0
                  ? "nadie excede lo pactado"
                  : equipo.conSobrecarga === 1
                    ? "1 persona excede lo pactado"
                    : `${equipo.conSobrecarga} personas exceden lo pactado`
              }
            />
          </div>
          <BarrasApiladas datos={datos} series={SERIES_HORAS} anchoEtiquetas={160} />
        </>
      )}
      {configurado && sinHoras.length > 0 && (
        <p className="motivo">Sin horas pactadas, fuera de la comparación: {listar(sinHoras)}.</p>
      )}
    </section>
  );
}

function PanelEfectividad({ horas: datosDeHoras, metas }) {
  const { configurado, personas } = datosDeHoras;
  const fueraDeRango = (u) =>
    u !== null &&
    ((metas.utilizacionMin !== null && u < metas.utilizacionMin) ||
      (metas.utilizacionMax !== null && u > metas.utilizacionMax));
  const bajaEfectividad = (e) => e !== null && metas.efectividadMin !== null && e < metas.efectividadMin;
  return (
    <section className="panel">
      <h2>
        Utilización y efectividad por integrante <Insignia tipo="kpi" />
      </h2>
      <p className="subtitulo">
        Utilización = demanda / capacidad. Efectividad de entrega = horas hechas / horas
        comprometidas al cierre del primer día. Las mismas cuentas que los OKR, persona por
        persona.
      </p>
      {!configurado ? (
        <p className="motivo">Falta <code>horasPorPunto</code> en data/equipo.json.</p>
      ) : personas.length === 0 ? (
        <p className="motivo">No hay integrantes configurados ni tareas asignadas.</p>
      ) : (
        <div className="contrato">
          <table className="tabla-equipo">
            <thead>
              <tr>
                <th>Integrante</th>
                <th>Rol</th>
                <th className="numero">Capacidad</th>
                <th className="numero">Demanda</th>
                <th className="numero">Utilización</th>
                <th className="numero">Hechas</th>
                <th className="numero">Comprometidas</th>
                <th className="numero">Efectividad</th>
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => (
                <tr key={p.nombre}>
                  <td>{p.nombre}</td>
                  <td>{p.rol}</td>
                  <td className="numero">{horas(p.capacidad)}</td>
                  <td className="numero">{horas(p.demanda)}</td>
                  <td className={"numero" + (fueraDeRango(p.utilizacion) ? " critico" : "")}>
                    {conPorcentaje(p.utilizacion)}
                  </td>
                  <td className="numero">{horas(p.hechas)}</td>
                  <td className="numero">{horas(p.comprometidas)}</td>
                  <td className={"numero" + (bajaEfectividad(p.efectividad) ? " critico" : "")}>
                    {conPorcentaje(p.efectividad)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {configurado && personas.length > 0 && (
        <p className="motivo">
          Se marca en rojo la utilización fuera de
          {metas.utilizacionMin !== null && metas.utilizacionMax !== null
            ? ` ${metas.utilizacionMin}% a ${metas.utilizacionMax}%`
            : " rango"}{" "}
          y la efectividad por debajo de
          {metas.efectividadMin !== null ? ` ${metas.efectividadMin}%` : " la meta"}. Quien no
          tiene horas pactadas muestra demanda pero no utilización.
        </p>
      )}
    </section>
  );
}

// ---- Proyecto: progreso de todos los sprints y errores ------------------------

const textoDeSprints = (n) => (n === 1 ? "1 sprint" : `${n} sprints`);
const concordar = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

function detalleDeErrores(errores) {
  if (errores.abiertos === null) return "no se pudieron contar los bugs en Shortcut";
  const partes = [
    `${concordar(errores.resueltos, "resuelto", "resueltos")} de ${concordar(
      errores.reportados,
      "reportado",
      "reportados"
    )} en el proyecto`,
  ];
  if (errores.enElSprint.reportados > 0 || errores.enElSprint.sinResolver > 0) {
    partes.push(`${errores.enElSprint.sinResolver} sin resolver en los sprints`);
  }
  return partes.join(" · ");
}

// En la vista de un sprint, el proyecto entero en una linea: como va el total
// del que este sprint es una parte. El detalle esta en la vista del proyecto.
function FranjaProyecto({ proyecto, verProyecto, ocupado }) {
  const { progreso, errores } = proyecto;
  const { tareas, puntos, sprints } = progreso;
  return (
    <div className="franja-proyecto">
      <strong>Todo el proyecto</strong>
      <span>
        {sprints.length === 0
          ? "todavía no hay sprints en Shortcut"
          : `${conPorcentaje(tareas.pct)} de las tareas · ${terminadasDe(
              tareas.terminadas,
              tareas.total
            )} en ${textoDeSprints(sprints.length)}`}
      </span>
      {puntos.total > 0 && (
        <span>
          {conPorcentaje(puntos.pct)} de los puntos · {puntos.terminados} de {puntos.total}
        </span>
      )}
      <span className={errores.abiertos !== null && errores.abiertos > 0 ? "critico" : ""}>
        {errores.abiertos === null
          ? "errores sin contar"
          : concordar(errores.abiertos, "error abierto", "errores abiertos")}
      </span>
      <button type="button" className="chip" onClick={verProyecto} disabled={ocupado}>
        Ver el proyecto completo
      </button>
    </div>
  );
}

// "1 terminado · 1 en curso · 0 por empezar"
function detalleDeSprints({ terminados, enCurso, proximos }) {
  return [
    concordar(terminados, "terminado", "terminados"),
    `${enCurso} en curso`,
    `${proximos} por empezar`,
  ].join(" · ");
}

function tarjetaDeDiasDelProyecto(periodo) {
  if (periodo.fin === null) return { valor: "–", detalle: "sin sprints" };
  if (periodo.diasRestantes === 0) {
    return { valor: 0, detalle: `terminó el ${fechaCorta(periodo.fin)}` };
  }
  return {
    valor: periodo.diasRestantes,
    detalle: `de ${periodo.diasCalendario} · termina el ${fechaCorta(periodo.fin)}`,
  };
}

// El panel principal de la vista del proyecto: dos anillos con el avance total
// (en tareas y en puntos), las tarjetas del periodo y el desglose por sprint.
function PanelAvanceTotal({ progreso, errores, periodo }) {
  const { sprints, tareas, puntos, sinSprint } = progreso;
  const porSprint = useMemo(
    () => sprints.map((s) => ({ nombre: recortar(s.nombre, 24), ...porEtapa(s.tareas) })),
    [sprints]
  );
  const anilloDeTareas = [
    { nombre: ETAPAS.done, valor: tareas.terminadas },
    { nombre: ETAPAS.started, valor: tareas.enCurso },
    { nombre: ETAPAS.unstarted, valor: tareas.pendientes },
  ];
  const anilloDePuntos = [
    { nombre: PUNTOS_TERMINADOS, valor: puntos.terminados },
    { nombre: PUNTOS_PENDIENTES, valor: puntos.total - puntos.terminados },
  ];
  const diasDelProyecto = tarjetaDeDiasDelProyecto(periodo);

  return (
    <section className="panel">
      <h2>
        Avance total del proyecto <Insignia tipo="kpi" />
      </h2>
      <p className="subtitulo">
        Lo terminado sobre todo lo planificado en los sprints, del primero al último
        {periodo.inicio &&
          `: ${textoDeSprints(periodo.sprints.total)}, del ${fechaCorta(periodo.inicio)} al ${fechaCorta(periodo.fin)}`}
      </p>
      {sprints.length === 0 ? (
        <p className="motivo">Todavía no hay sprints cargados en Shortcut.</p>
      ) : (
        <>
          <div className="anillos">
            <div>
              <p className="titulo-grafico">Avance en tareas</p>
              <Torta
                datos={anilloDeTareas}
                colores={COLORES_ETAPAS}
                centro={conPorcentaje(tareas.pct)}
                detalle={`${tareas.terminadas} de ${textoDeTareas(tareas.total)}`}
                alto={260}
              />
            </div>
            <div>
              <p className="titulo-grafico">Avance en puntos</p>
              <Torta
                datos={anilloDePuntos}
                colores={COLORES_PUNTOS}
                centro={conPorcentaje(puntos.pct)}
                detalle={
                  puntos.total === 0 ? "ninguna tarea tiene puntos" : `${puntos.terminados} de ${puntos.total} puntos`
                }
                alto={260}
              />
            </div>
            <div className="grilla-kpis">
              <TarjetaKpi
                etiqueta="Sprints"
                valor={periodo.sprints.total}
                detalle={detalleDeSprints(periodo.sprints)}
              />
              <TarjetaKpi
                etiqueta="Días restantes"
                valor={diasDelProyecto.valor}
                detalle={diasDelProyecto.detalle}
              />
              <TarjetaKpi
                etiqueta="En curso hoy"
                valor={tareas.enCurso}
                detalle={`${tareas.pendientes} sin empezar${
                  puntos.tareasSinEstimar > 0
                    ? ` · ${textoDeTareas(puntos.tareasSinEstimar)} sin estimar`
                    : ""
                }`}
              />
              <TarjetaKpi
                etiqueta="Errores abiertos"
                valor={errores.abiertos === null ? "–" : errores.abiertos}
                critico={errores.abiertos !== null && errores.abiertos > 0}
                detalle={detalleDeErrores(errores)}
              />
            </div>
          </div>
          <h3 className="subtitulo">Por sprint</h3>
          <BarrasApiladas datos={porSprint} series={SERIES_ETAPAS} anchoEtiquetas={160} />
          <ul className="lista-avance">
            {sprints.map((s) => (
              <li key={s.id}>
                <strong>{s.nombre}</strong> ({s.estado}, {fechaCorta(s.inicio)} – {fechaCorta(s.fin)}):{" "}
                {terminadasDe(s.tareas.terminadas, s.tareas.total)}
                {s.tareas.pct !== null && ` (${s.tareas.pct}%)`}
                {s.puntos.total > 0 && ` · ${s.puntos.terminados} de ${s.puntos.total} puntos`}
              </li>
            ))}
          </ul>
        </>
      )}
      {sinSprint !== null && sinSprint > 0 && (
        <p className="motivo">
          {sinSprint === 1
            ? "1 tarea no está en ningún sprint y no cuenta en el avance."
            : `${sinSprint} tareas no están en ningún sprint y no cuentan en el avance.`}
        </p>
      )}
      {errores.reportados === 0 && (
        <p className="motivo">
          El proyecto no tiene ninguna story de tipo «bug» en Shortcut: los errores se cuentan
          cuando los defectos se carguen con ese tipo, no como feature.
        </p>
      )}
    </section>
  );
}
