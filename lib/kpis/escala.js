// La escala que pasa los puntos de una historia a horas. Shortcut no registra
// horas: cada valor de estimate tiene las suyas, y no hay un factor unico.
// Una historia se convierte entera; si la comparten, se reparten esas horas.
// Un valor que no esta en la escala no se inventa: devuelve null y quien llama
// lo anota. Una tarea sin estimar vale 0.

// True cuando hay al menos un par puntos-horas para convertir.
export const tieneEscala = (escala) => Array.isArray(escala) && escala.length > 0;

// Horas del valor de puntos, o null si ese valor no esta en la escala.
// Sin puntos (null) son 0 horas: la tarea no se estimo.
export function horasDePuntos(puntos, escala) {
  if (puntos == null) return 0;
  const fila = (escala ?? []).find((e) => e.puntos === puntos);
  return fila ? fila.horas : null;
}

// Horas de una tarea ya normalizada. Una subtarea aporta 0: el punto vive en
// su historia. Sin estimar, 0. Fuera de la escala, null.
export function horasDeTarea(tarea, escala) {
  if (tarea?.historia) return 0;
  return horasDePuntos(tarea?.puntos, escala);
}

// Anota en `problemas` las historias cuyo estimate no esta en la escala.
// Esas historias no suman horas. Las subtareas y las sin estimar no entran.
export function anotarFueraDeEscala(tareas, escala, problemas) {
  if (!tieneEscala(escala)) return;
  const vistos = new Set();
  for (const t of tareas) {
    if (t.historia || t.puntos == null || vistos.has(t.id)) continue;
    if (horasDePuntos(t.puntos, escala) != null) continue;
    vistos.add(t.id);
    problemas.push({
      tarea: t.id ?? null,
      campo: "estimate",
      valor: t.puntos,
      motivo: "el valor no está en la escala de horas: esa historia no suma horas",
    });
  }
}
