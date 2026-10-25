// La insignia "KPI" u "OKR" con su tooltip: que clase de metrica es, en que se
// diferencia de la otra y, en los OKR, la meta y si se cumple. Sale al pasar el
// mouse y al enfocarla con el teclado. La usan las tarjetas y los titulos de
// los paneles. `clases` cambia los textos (Avance e inversion usa los del
// cliente) y `estado`, lo que sigue a la meta en vez de "se cumple".
import { TIPOS_DE_METRICA } from "@/lib/kpis/equipo";

export default function Insignia({ tipo, meta, cumple, estado, clases = TIPOS_DE_METRICA }) {
  const clase = clases[tipo];
  if (!clase) return null;
  const situacion = estado ?? (cumple === true ? "se cumple" : cumple === false ? "no se cumple" : null);
  return (
    <span
      className={"insignia " + tipo + (cumple === true ? " cumple" : cumple === false ? " no-cumple" : "")}
      tabIndex={0}
      aria-label={`${clase.nombre} (${clase.sigla})${meta ? `, meta: ${meta}${situacion ? `, ${situacion}` : ""}` : ""}`}
    >
      {clase.sigla}
      <span className="ayuda" role="tooltip">
        <strong>{clase.nombre}</strong>
        {clase.ayuda}
        {meta && (
          <>
            <br />
            <strong>Meta de este OKR:</strong> {meta}
            {situacion && ` · ${situacion}`}
          </>
        )}
      </span>
    </span>
  );
}
