// Barra de 0 a 100 con el porcentaje al lado, para leer un avance en una
// tabla sin comparar numeros. `pct` null se muestra como "–" y la barra vacia.
export default function BarraDeProgreso({ pct, color = "var(--verde)", texto }) {
  const ancho = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const etiqueta = texto ?? (pct === null ? "–" : `${pct}%`);
  return (
    <div className="progreso" role="img" aria-label={etiqueta}>
      <div className="progreso-pista">
        <div className="progreso-relleno" style={{ width: `${ancho}%`, background: color }} />
      </div>
      <span>{etiqueta}</span>
    </div>
  );
}
