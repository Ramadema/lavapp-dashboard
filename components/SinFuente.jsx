"use client";

import { useEffect, useState } from "react";
import { ESTADO_SIN_FUENTE } from "@/lib/secciones";

// Estado de una seccion que todavia no tiene datos.
//
// No pinta el contrato desde el registro local: lo pide al endpoint y muestra lo
// que el endpoint contesta. Asi la pantalla no puede prometer un contrato que la
// API no esta publicando, y el dia que alguien conecte la fuente de verdad esta
// pantalla se entera sola en vez de seguir diciendo "sin conectar".
export default function SinFuente({ seccion }) {
  const [respuesta, setRespuesta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    fetch(seccion.endpoint)
      .then(async (res) => {
        const cuerpo = await res.json().catch(() => null);
        if (vigente) setRespuesta({ estado: res.status, cuerpo });
      })
      .catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [seccion.endpoint]);

  if (error)
    return (
      <div className="panel error">
        <strong>No se pudo consultar {seccion.endpoint}.</strong>
        <br />
        {error}
      </div>
    );

  if (!respuesta)
    return <div className="panel cargando">Consultando {seccion.endpoint}…</div>;

  // El endpoint dejo de responder 501: alguien conecto la fuente y esta pantalla
  // quedo vieja. Se avisa en vez de seguir mostrando el cartel de "sin conectar".
  if (respuesta.estado === 200)
    return (
      <div className="panel">
        <div className="sin-fuente">
          <span className="senal ok">Fuente conectada</span>
          <h2>{seccion.endpoint} ya está devolviendo datos</h2>
          <p>
            El endpoint respondió 200. Falta construir la pantalla que los
            muestre: esta sección todavía tiene el estado vacío.
          </p>
        </div>
      </div>
    );

  if (respuesta.estado !== ESTADO_SIN_FUENTE)
    return (
      <div className="panel error">
        <strong>
          {seccion.endpoint} respondió HTTP {respuesta.estado}.
        </strong>
        <br />
        No es la respuesta esperada para una sección sin fuente ({ESTADO_SIN_FUENTE}).
      </div>
    );

  const { motivo, contrato } = respuesta.cuerpo ?? {};

  return (
    <div className="panel">
      <div className="sin-fuente">
        <span className="senal pendiente">Sin fuente conectada</span>
        <h2>Esta sección va a consumir {seccion.endpoint}</h2>
        <p>{motivo}</p>
      </div>

      {contrato?.length > 0 && (
        <div className="contrato">
          <p className="subtitulo">
            Contrato esperado — propuesta a acordar con quien construya la{" "}
            {seccion.origen}
          </p>
          <table>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Tipo</th>
                <th>Qué trae</th>
              </tr>
            </thead>
            <tbody>
              {contrato.map((c) => (
                <tr key={c.campo}>
                  <td>
                    <code>{c.campo}</code>
                  </td>
                  <td className="tipo">{c.tipo}</td>
                  <td>{c.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
