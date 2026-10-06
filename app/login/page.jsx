"use client";

import { useState } from "react";
import { puedeVer, rutaInicial } from "@/lib/auth/permisos";

// A donde ir despues de entrar: a donde iba (si lo puede ver) o a su inicio.
// Solo rutas propias: un "volver" con otro dominio se ignora, para que un link
// armado no pueda sacar a alguien del backoffice despues de poner su contraseña.
function destinoDespuesDeEntrar(rol) {
  const volver = new URLSearchParams(window.location.search).get("volver");
  const esPropia = volver?.startsWith("/") && !volver.startsWith("//");
  if (esPropia && puedeVer(rol, volver.split("?")[0])) return volver;
  return rutaInicial(rol);
}

export default function PaginaLogin() {
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [estado, setEstado] = useState({ enviando: false, error: null, faltan: null });

  async function entrar(evento) {
    evento.preventDefault();
    setEstado({ enviando: true, error: null, faltan: null });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usuario.trim(), contrasena }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstado({
          enviando: false,
          error: cuerpo.motivo ?? `El login respondió HTTP ${res.status}.`,
          faltan: cuerpo.faltan ?? null,
        });
        return;
      }
      // Carga completa y no navegacion de Next: la barra lateral se arma en el
      // servidor segun la sesion, y recien con la cookie puesta aparece.
      window.location.assign(destinoDespuesDeEntrar(cuerpo.rol));
    } catch (e) {
      setEstado({ enviando: false, error: e.message, faltan: null });
    }
  }

  return (
    <main className="login">
      <form className="login-tarjeta" onSubmit={entrar}>
        <div className="login-marca">
          <p>
            Lav<span>App</span>
          </p>
          <small>Backoffice</small>
        </div>
        <h1>Iniciar sesión</h1>
        <p className="login-ayuda">
          Acceso interno. Las credenciales las da quien administra el backoffice.
        </p>

        <label>
          Usuario
          <input
            name="usuario"
            autoComplete="username"
            autoFocus
            required
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            name="contrasena"
            autoComplete="current-password"
            required
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
        </label>

        {estado.error && (
          <p className="aviso" role="alert">
            {estado.error}
            {estado.faltan && (
              <>
                {" "}
                Faltan: <code>{estado.faltan.join(", ")}</code>. Ver <code>.env.example</code>.
              </>
            )}
          </p>
        )}

        <button type="submit" className="boton" disabled={estado.enviando}>
          {estado.enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
