// Una tarjeta con un numero grande. `tipo` ("kpi" u "okr") le agrega la
// insignia que dice que clase de metrica es, con `meta`, `cumple` y `estado`
// para los OKR; `clases` cambia sus textos. Sin `tipo` es una tarjeta como las
// de siempre.
import Insignia from "@/components/Insignia";

export default function TarjetaKpi({ etiqueta, valor, detalle, critico, tipo, meta, cumple, estado, clases }) {
  return (
    <div className="kpi">
      <p className="etiqueta">
        {etiqueta}
        {tipo && <Insignia tipo={tipo} meta={meta} cumple={cumple} estado={estado} clases={clases} />}
      </p>
      <p className={"valor" + (critico ? " critico" : "")}>{valor}</p>
      {detalle && <p className="detalle">{detalle}</p>}
    </div>
  );
}
