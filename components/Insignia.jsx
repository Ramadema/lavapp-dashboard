// La insignia "KPI" u "OKR" con su tooltip, que sale al pasar el mouse y al
// enfocarla con el teclado. Sin `definicion`, el tooltip dice que clase de
// metrica es y en que se diferencia de la otra (Performance); con ella, que
// mide ese indicador (`indicador` es su nombre, de titulo). En los OKR suma la
// meta y como esta: `estado` reemplaza a "se cumple" o "no se cumple".
// `clases` cambia la sigla y el nombre de cada clase.
import { TIPOS_DE_METRICA } from "@/lib/kpis/equipo";

export default function Insignia({ tipo, meta, cumple, estado, indicador, definicion, clases = TIPOS_DE_METRICA }) {
  const clase = clases[tipo];
  if (!clase) return null;
  const situacion = estado ?? (cumple === true ? "se cumple" : cumple === false ? "no se cumple" : null);
  return (
    <span
      className={"insignia " + tipo + (cumple === true ? " cumple" : cumple === false ? " no-cumple" : "")}
      tabIndex={0}
      aria-label={`${clase.nombre} (${clase.sigla})${definicion ? `: ${definicion}` : ""}${meta ? `, meta: ${meta}${situacion ? `, ${situacion}` : ""}` : ""}`}
    >
      {clase.sigla}
      <span className="ayuda" role="tooltip">
        {definicion ? (
          <>
            {indicador && <strong>{indicador}</strong>}
            {definicion}
          </>
        ) : (
          <>
            <strong>{clase.nombre}</strong>
            {clase.ayuda}
          </>
        )}
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
