export default function TarjetaKpi({ etiqueta, valor, detalle, critico }) {
  return (
    <div className="kpi">
      <p className="etiqueta">{etiqueta}</p>
      <p className={"valor" + (critico ? " critico" : "")}>{valor}</p>
      {detalle && <p className="detalle">{detalle}</p>}
    </div>
  );
}
