import "./globals.css";

export const metadata = {
  title: "LavApp · Dashboard de encuesta",
  description:
    "Indicadores de la encuesta a 40 lavaderos de autos sobre gestión operativa.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
