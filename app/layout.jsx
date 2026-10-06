import "./globals.css";
import Navegacion from "@/components/Navegacion";
import Sesion from "@/components/Sesion";
import { sesionDelPedido } from "@/lib/auth/pedido";

export const metadata = {
  title: "LavApp · Backoffice",
  description:
    "Backoffice de LavApp: KPIs de operación, cuentas, facturación e investigación de mercado.",
};

// Sin sesion no hay barra lateral: lo unico que se sirve sin sesion es el
// login, y el proxy ya se ocupo de que sea asi.
export default async function RootLayout({ children }) {
  const sesion = await sesionDelPedido();

  return (
    <html lang="es">
      <body>
        {sesion ? (
          <div className="aplicacion">
            <aside className="barra-lateral">
              <div className="marca">
                <p>
                  Lav<span>App</span>
                </p>
                <small>Backoffice</small>
              </div>
              <Navegacion rol={sesion.rol} />
              <Sesion usuario={sesion.usuario} rol={sesion.rol} />
            </aside>
            <div className="area">{children}</div>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
