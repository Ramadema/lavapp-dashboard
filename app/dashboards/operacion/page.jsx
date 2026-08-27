import EncabezadoSeccion from "@/components/EncabezadoSeccion";
import SinFuente from "@/components/SinFuente";
import { buscarSeccion } from "@/lib/secciones";

const seccion = buscarSeccion("operacion");

export const metadata = {
  title: `${seccion.titulo} · LavApp`,
  description: seccion.resumen,
};

export default function PaginaOperacion() {
  return (
    <>
      <EncabezadoSeccion
        titulo={seccion.titulo}
        subtitulo={seccion.subtitulo}
      />
      <main className="contenedor">
        <SinFuente seccion={seccion} />
      </main>
    </>
  );
}
