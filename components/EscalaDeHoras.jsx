// La relacion entre los puntos de una historia y las horas que representan.
// El ancho de cada barra es proporcional a las horas, para ver que un valor
// alto concentra mas horas que el anterior.

export default function EscalaDeHoras({ escala, aclaracion }) {
  if (!escala?.length) return null;
  const maximo = Math.max(...escala.map((e) => e.horas));
  return (
    <figure className="escala-horas">
      <figcaption>
        <p className="titulo-grafico">Puntos y horas</p>
        {aclaracion && <p className="subtexto">{aclaracion}</p>}
      </figcaption>
      <ol>
        {escala.map((e) => (
          <li key={e.puntos}>
            <span className="escala-puntos">{e.puntos === 1 ? "1 punto" : `${e.puntos} puntos`}</span>
            <span className="escala-riel" aria-hidden="true">
              <span style={{ width: `${Math.max(8, Math.round((e.horas / maximo) * 100))}%` }} />
            </span>
            <span className="escala-valor">{e.horas} h</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
