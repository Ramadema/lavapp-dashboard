// Una tarjeta con un numero grande. `tipo` ("kpi", "okr" o los dos en una
// lista, para un indicador que ademas tiene meta) le agrega las insignias que
// dicen que clase de metrica es; `meta`, `cumple` y `estado` van a la de OKR y
// `clases` cambia sus textos. Sin `tipo` es una tarjeta como las de siempre.
import Insignia from "@/components/Insignia";

export default function TarjetaKpi({ etiqueta, valor, detalle, critico, tipo, meta, cumple, estado, clases }) {
  const tipos = tipo ? [].concat(tipo) : [];
  return (
    <div className="kpi">
      <p className="etiqueta">
        {etiqueta}
        {tipos.map((t) =>
          t === "okr" ? (
            <Insignia key={t} tipo={t} meta={meta} cumple={cumple} estado={estado} clases={clases} />
          ) : (
            <Insignia key={t} tipo={t} clases={clases} />
          )
        )}
      </p>
      <p className={"valor" + (critico ? " critico" : "")}>{valor}</p>
      {detalle && <p className="detalle">{detalle}</p>}
    </div>
  );
}
