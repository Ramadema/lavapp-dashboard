export default function EncabezadoSeccion({ titulo, subtitulo, senal, children }) {
  return (
    <header className="encabezado">
      <div className="contenedor">
        <div className="encabezado-titulo">
          <h1>{titulo}</h1>
          {senal && <span className={"senal " + senal.tono}>{senal.texto}</span>}
        </div>
        {subtitulo && <p className="encabezado-subtitulo">{subtitulo}</p>}
        {children}
      </div>
    </header>
  );
}
