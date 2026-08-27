"use client";

import { useEffect, useState } from "react";
import EncabezadoSeccion from "@/components/EncabezadoSeccion";
import TarjetaKpi from "@/components/TarjetaKpi";
import { buscarSeccion } from "@/lib/secciones";

const seccion = buscarSeccion("estado");

export default function PaginaEstado() {
  const [salud, setSalud] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(seccion.endpoint)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(setSalud)
      .catch((e) => setError(e.message));
  }, []);

  // Un fallback a respaldo no rompe nada visible en el resto del backoffice: los
  // numeros siguen apareciendo, solo que viejos. Por eso esta pantalla lo marca
  // como alerta y no como un estado normal mas.
  const enRespaldo = salud?.fuente === "respaldo";

  return (
    <>
      <EncabezadoSeccion
        titulo={seccion.titulo}
        subtitulo={seccion.subtitulo}
        senal={
          salud && {
            tono: enRespaldo ? "alerta" : "ok",
            texto: enRespaldo ? "Usando respaldo" : "Leyendo la planilla",
          }
        }
      />

      <main className="contenedor">
        {error && (
          <div className="panel error">
            <strong>No se pudo consultar {seccion.endpoint}.</strong>
            <br />
            {error}
          </div>
        )}

        {!salud && !error && (
          <div className="panel cargando">Consultando {seccion.endpoint}…</div>
        )}

        {salud && (
          <>
            <div className="grilla-kpis">
              <TarjetaKpi
                etiqueta="Fuente en uso"
                valor={enRespaldo ? "Respaldo" : "Planilla"}
                detalle={
                  enRespaldo
                    ? "data/encuestas.json"
                    : "Google Sheets, cache de 60 s"
                }
                critico={enRespaldo}
              />
              <TarjetaKpi
                etiqueta="Filas cargadas"
                valor={salud.filas}
                detalle="respuestas que pasaron la validación"
              />
              <TarjetaKpi
                etiqueta="Filas rechazadas"
                valor={salud.filasRechazadas}
                detalle="descartadas por dato no reconocido"
                critico={salud.filasRechazadas > 0}
              />
              <TarjetaKpi
                etiqueta="Planilla configurada"
                valor={salud.csvConfigurado ? "Sí" : "No"}
                detalle="ENCUESTAS_CSV_URL"
                critico={!salud.csvConfigurado}
              />
            </div>

            {enRespaldo && (
              <section className="panel">
                <h2>Por qué se cayó al respaldo</h2>
                <p className="subtitulo">
                  Mientras esto pase, todo el backoffice muestra el último dato
                  conocido, no el de la planilla.
                </p>
                <p className="motivo">{salud.motivo}</p>
              </section>
            )}

            <section className="panel">
              <h2>Filas y celdas rechazadas</h2>
              <p className="subtitulo">
                {salud.problemas.length === 0
                  ? "Ninguna. Todas las filas de la fuente se entendieron."
                  : `Se muestran las primeras ${salud.problemas.length}. El número de fila es el del archivo, para ir a corregir la celda.`}
              </p>
              {salud.problemas.length > 0 && (
                <div className="contrato">
                  <table>
                    <thead>
                      <tr>
                        <th>Fila</th>
                        <th>Campo</th>
                        <th>Valor</th>
                        <th>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salud.problemas.map((p, i) => (
                        <tr key={i}>
                          <td>{p.fila}</td>
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
              )}
            </section>

            <section className="panel">
              <h2>Columnas ignoradas</h2>
              <p className="subtitulo">
                Están en la planilla pero el backoffice no las usa. No es un
                error: es lo que sobra del formulario original.
              </p>
              {salud.columnasIgnoradas.length === 0 ? (
                <p className="motivo">Ninguna.</p>
              ) : (
                <ul className="lista-columnas">
                  {salud.columnasIgnoradas.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
