// La insignia "KPI" u "OKR" con su tooltip: que clase de metrica es, en que se
// diferencia de la otra y, en los OKR, la meta y si se cumple. Sale al pasar el
// mouse y al enfocarla con el teclado. La usan las tarjetas y los titulos de
// los paneles de equipo.
import { TIPOS_DE_METRICA } from "@/lib/kpis/equipo";

export default function Insignia({ tipo, meta, cumple }) {
  const clase = TIPOS_DE_METRICA[tipo];
  if (!clase) return null;
  return (
    <span
      className={"insignia " + tipo + (cumple === true ? " cumple" : cumple === false ? " no-cumple" : "")}
      tabIndex={0}
      aria-label={`${clase.nombre} (${clase.sigla})${meta ? `, meta: ${meta}` : ""}`}
    >
      {clase.sigla}
      <span className="ayuda" role="tooltip">
        <strong>{clase.nombre}</strong>
        {clase.ayuda}
        {meta && (
          <>
            <br />
            <strong>Meta de este OKR:</strong> {meta}
            {cumple === true && " · se cumple"}
            {cumple === false && " · no se cumple"}
          </>
        )}
      </span>
    </span>
  );
}
