"use client";

import { useEffect, useState } from "react";
import EncabezadoSeccion from "@/components/EncabezadoSeccion";
import { ESTADO_SIN_FUENTE } from "@/lib/secciones";
import { diaYHora } from "@/lib/formato";

// Una seccion que pide sus datos a su propio endpoint y los muestra con el mismo
// comportamiento que Performance: "Actualizar" relee la fuente sin cache, se
// dice de cuando es el dato, y si la fuente falla al actualizar se deja lo que
// ya estaba en pantalla con un aviso en vez de borrarlo.
//
// `parametros` van en la query string y al cambiar se vuelve a pedir;
// `controles` dibuja los filtros propios de la seccion en el encabezado y
// recibe si hay un pedido en curso; `children` recibe la respuesta del endpoint
// y dibuja el tablero. `fuente` es como se la nombra en los textos ("la app de
// gestión").
async function pedirSeccion(url, metodo) {
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
  return { datos: cuerpo };
}

function senalDe(datos, error, fuente) {
  if (error?.estado === ESTADO_SIN_FUENTE) return { tono: "pendiente", texto: "Sin conectar" };
  if (error) return { tono: "alerta", texto: `Sin datos de ${fuente}` };
  if (!datos) return null;
  if (datos.lectura?.desactualizado) return { tono: "alerta", texto: "Datos desactualizados" };
  return { tono: "ok", texto: "Conectada" };
}

function PanelDeError({ error, seccion, fuente }) {
  if (error.estado === ESTADO_SIN_FUENTE) {
    return (
      <div className="panel error">
        <strong>
          {seccion.titulo} todavía no está conectada a {fuente}.
        </strong>
        <br />
        {error.motivo}
      </div>
    );
  }
  return (
    <div className="panel error">
      <strong>No pudimos traer los datos de {fuente}.</strong>
      <br />
      {error.motivo}
      <br />
      Si vuelve a pasar en unos minutos, avisale al equipo técnico.
    </div>
  );
}

export default function SeccionRemota({ seccion, fuente, parametros = {}, controles, children }) {
  const consulta = new URLSearchParams(parametros).toString();
  const url = seccion.endpoint + (consulta ? `?${consulta}` : "");
  // La respuesta guarda la URL que la produjo: si la URL pedida cambio (otro
  // periodo), lo que hay es viejo y se esta cargando, sin un estado aparte.
  const [respuesta, setRespuesta] = useState({ url: null, datos: null, error: null });
  const [aviso, setAviso] = useState(null);
  const [actualizando, setActualizando] = useState(false);
  const cargando = respuesta.url !== url;
  const { datos, error } = cargando ? { datos: null, error: null } : respuesta;

  useEffect(() => {
    let vigente = true;
    pedirSeccion(url, "GET").then((r) => {
      if (!vigente) return;
      setRespuesta({ url, datos: r.datos ?? null, error: r.error ?? null });
      setAviso(null);
    });
    return () => {
      vigente = false;
    };
  }, [url]);

  async function actualizar() {
    setActualizando(true);
    const r = await pedirSeccion(url, "POST");
    setActualizando(false);
    if (r.datos) {
      setRespuesta({ url, datos: r.datos, error: null });
      setAviso(null);
    } else if (datos) {
      // Si la fuente falla al actualizar, lo que ya estaba en pantalla sigue
      // siendo el ultimo dato bueno: se deja y se avisa, no se borra.
      setAviso(r.error.motivo);
    } else {
      setRespuesta({ url, datos: null, error: r.error });
    }
  }

  const ocupado = cargando || actualizando;

  return (
    <>
      <EncabezadoSeccion
        titulo={seccion.titulo}
        subtitulo={seccion.subtitulo}
        senal={cargando ? null : senalDe(datos, error, fuente)}
      >
        <div className="controles">
          {controles?.({ ocupado })}
          {datos && (
            <button className="chip" onClick={actualizar} disabled={ocupado}>
              {actualizando ? "Actualizando…" : "Actualizar"}
            </button>
          )}
          {datos?.lectura?.leidoEl && (
            <span className="lectura">
              Datos de {fuente} del {diaYHora(datos.lectura.leidoEl)}
            </span>
          )}
        </div>
      </EncabezadoSeccion>

      <main className="contenedor">
        {aviso && (
          <div className="aviso" role="status">
            No se pudo actualizar: {aviso} Se siguen mostrando los datos anteriores.
          </div>
        )}

        {cargando ? (
          <div className="panel cargando">Consultando {fuente}…</div>
        ) : error ? (
          <PanelDeError error={error} seccion={seccion} fuente={fuente} />
        ) : (
          <>
            {datos.lectura?.desactualizado && (
              <div className="aviso" role="status">
                Estos datos son del {diaYHora(datos.lectura.leidoEl)}. Ya se le pidió una
                lectura nueva a {fuente}: tocá «Actualizar» para verla.
              </div>
            )}
            {datos.problemas?.length > 0 && (
              <div className="aviso" role="status">
                {datos.problemas.length === 1
                  ? "Una fila"
                  : `${datos.problemas.length} filas`}{" "}
                de {fuente} no se entendieron y quedaron afuera de estos números. El
                detalle está en <code>{seccion.endpoint}</code>, campo{" "}
                <code>problemas</code>.
              </div>
            )}
            {children(datos)}
          </>
        )}
      </main>
    </>
  );
}
