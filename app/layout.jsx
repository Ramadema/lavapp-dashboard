import "./globals.css";
import Navegacion from "@/components/Navegacion";

export const metadata = {
  title: "LavApp · Backoffice",
  description:
    "Backoffice de LavApp: KPIs de operación, cuentas, facturación e investigación de mercado.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <div className="aplicacion">
          <aside className="barra-lateral">
            <div className="marca">
              <p>
                Lav<span>App</span>
              </p>
              <small>Backoffice</small>
            </div>
            <Navegacion />
          </aside>
          <div className="area">{children}</div>
        </div>
      </body>
    </html>
  );
}
