import { libroDeInversion } from "@/lib/exportar/inversion";

// POST /api/inversion/exportar — el informe que ya está en pantalla, en Excel.
export async function POST(request) {
  const reporte = await request.json().catch(() => null);
  if (!reporte || typeof reporte !== "object") {
    return Response.json({ motivo: "Falta el informe para exportar." }, { status: 400 });
  }
  const buffer = await libroDeInversion(reporte);
  return excel(buffer, "avance-e-inversion");
}

function excel(buffer, nombre) {
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nombre}-${fecha}.xlsx"`,
    },
  });
}
