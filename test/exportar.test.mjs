import ExcelJS from "exceljs";
import JSZip from "jszip";
import { libroDeInversion } from "../lib/exportar/inversion.js";
import { libroDePerformance } from "../lib/exportar/performance.js";

let ok = 0, fail = 0;
const check = (nombre, real, esperado) => {
  if (real === esperado) { ok++; console.log("  OK   " + nombre); }
  else { fail++; console.log("  FALLA " + nombre + "\n        real:     " + real + "\n        esperado: " + esperado); }
};

async function hojas(buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  return libro;
}

const INVERSION = {
  lectura: { leidoEl: "2026-10-28T03:00:00Z" },
  mvp: { configurada: true, entrega: "2026-10-28", diasRestantes: 1 },
  alcance: { valor: { total: 666, terminado: 541, enCurso: 85, pendiente: 40, pct: 81.2 } },
  okrs: [{ nombre: "Alcance", valor: 81.2, meta: 100, cumple: false }],
  ritmo: { porDia: 10, desde: "2026-10-07", dias: 22, restante: 30, tareasTerminadas: 41, proyeccion: { fin: "2026-10-30", terminado: false } },
  avanceAcumulado: [{ dia: "2026-10-07", alcance: 100, planificado: 80, terminado: 40, proyeccion: null }],
  inversion: {
    horas: { justificadas: 541, enCurso: 85, pendientes: 40, comprometidas: 666, minimo: 680, pactadas: 700, escala: [{ puntos: 1, horas: 2 }, { puntos: 8, horas: 25 }] },
    porTipo: [{ nombre: "Funcionalidades", valor: { total: 200, terminado: 150, enCurso: 30, pendiente: 20 }, pctDeLoTerminado: 40 }],
  },
  entregas: [{ nombre: "Spring 2", inicio: "2026-10-07", fin: "2026-10-21", planificado: { valor: 267, tareas: 59 }, enElSprint: { valor: 20 }, pctEnElSprint: 7.5, despues: { valor: 209 }, pendiente: { valor: 38 }, entregas: [{ clave: "funcionalidades", nombre: "Funcionalidades", valor: 20 }] }],
  pendientes: [{ nombre: "Funcionalidades", enCurso: 1, sinEmpezar: 2, valor: 30 }],
  riesgos: [{ clave: "horas-bajo-el-minimo", faltan: 139 }],
};

const PERFORMANCE = {
  ambito: "proyecto",
  periodo: { inicio: "2026-09-23", fin: "2026-10-28", diasTotales: 36, diasRestantes: 1, sprints: { total: 2 }, enCurso: { nombre: "Spring 2" } },
  lectura: { leidoEl: "2026-10-28T03:00:00Z" },
  equipo: {
    okrs: [{ nombre: "Efectividad", valor: 77.4, descripcionMeta: "al menos 80%", cumple: false }],
    horas: {
      equipo: { capacidad: 564, demanda: 735, hechas: 569, asignadas: 735, utilizacion: 130.4, efectividad: 77.4 },
      escala: [{ puntos: 5, horas: 15 }],
      personas: [{ nombre: "Ana", rol: "Dev", capacidad: 70, demanda: 40, hechas: 30, asignadas: 40, utilizacion: 57, efectividad: 75 }],
    },
    porRol: { grupos: [{ rol: "Dev", tareas: 10, puntos: 40, pctTareas: 50 }] },
    configuracion: {},
  },
  porSprint: [{ nombre: "Spring 2", estado: "Terminado", inicio: "2026-10-07", fin: "2026-10-21", planificadas: 49, cumplidas: 20, pctCumplimiento: 40, movidas: 0, puntosTotales: 100 }],
  porEspecialidad: { grupos: [{ nombre: "Backend", total: 8, puntos: 20, terminadas: 5 }] },
  porIniciativa: { grupos: [{ nombre: "Sin iniciativa", total: 4, puntos: 10, puntosTerminados: 6 }] },
  errores: { reportados: 0, resueltos: 0, abiertos: 0, pctResueltos: null },
  retrabajo: { pct: 3.4, conRetrabajo: 3, casos: [{ titulo: "HU-01", responsables: ["Ana"], vueltas: [{}, {}] }] },
};

console.log("Avance e inversión");
{
  const libro = await hojas(await libroDeInversion(INVERSION));
  check("cinco hojas", libro.worksheets.map((h) => h.name).join(", "), "Resumen, Proyección, Horas, Entregas, Pendiente");
  check("el título", libro.getWorksheet("Resumen").getCell("A1").value, "Avance e inversión");
  check("las horas justificadas viajan", libro.getWorksheet("Horas").getCell("B8").value !== undefined, true);
  check("la escala de 8 puntos", [...libro.getWorksheet("Horas").getColumn(2).values].includes(25), true);
  const zip = await JSZip.loadAsync(await libroDeInversion(INVERSION));
  const charts = Object.keys(zip.files).filter((n) => n.startsWith("xl/charts/chart"));
  check("tres gráficos", charts.length, 3);
  const xml = await Promise.all(charts.map((n) => zip.file(n).async("string")));
  const titulos = xml.map((t) => t.match(/<a:t>([^<]*)<\/a:t>/)?.[1]).sort().join(" | ");
  check(
    "los títulos de los gráficos",
    titulos,
    "Avance acumulado | Horas justificadas por sprint y tipo de trabajo | Horas justificadas por tipo de trabajo"
  );
}

console.log("Performance");
{
  const libro = await hojas(await libroDePerformance(PERFORMANCE));
  check("cinco hojas", libro.worksheets.map((h) => h.name).join(", "), "Resumen, Planificación, Equipo, Roles, Calidad");
  check("el título nombra el proyecto", libro.getWorksheet("Resumen").getCell("A1").value, "Performance · todo el proyecto");
  const zipP = await JSZip.loadAsync(await libroDePerformance(PERFORMANCE));
  const chartP = Object.keys(zipP.files).filter((n) => n.startsWith("xl/charts/chart"));
  check("el gráfico de cumplimiento", chartP.length, 1);
  check("el título del gráfico", (await zipP.file(chartP[0]).async("string")).includes("Planificadas y cumplidas por sprint"), true);
  const sprintBuf = await libroDePerformance({ sprint: { nombre: "Spring 2", inicio: "2026-10-07", fin: "2026-10-21", estado: "Terminado" }, resumen: { tareas: { total: 49, terminadas: 20, pct: 40 }, puntos: { total: 100, terminados: 40, pct: 40 } }, cumplimiento: { planificadas: { total: 49, terminadas: 20, enCurso: 5, movidas: 1 } }, equipo: { okrs: [], horas: { personas: [] } }, terminadas: [{ titulo: "HU-01", estado: "Done", responsables: ["Ana"], puntos: 5, terminadaEl: "2026-10-20" }], pendientes: [] });
  const sprint = await hojas(sprintBuf);
  check("un sprint trae sus tareas", sprint.worksheets.map((h) => h.name).join(", "), "Sprint, Equipo, Tareas");
  check("el nombre del sprint", sprint.getWorksheet("Sprint").getCell("A1").value, "Spring 2");
  const zipS = await JSZip.loadAsync(sprintBuf);
  check("el sprint también tiene su gráfico", Object.keys(zipS.files).some((n) => n.startsWith("xl/charts/chart")), true);
}

console.log(`\n${ok} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
