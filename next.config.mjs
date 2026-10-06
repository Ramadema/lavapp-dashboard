/** @type {import('next').NextConfig} */
const nextConfig = {
  // El badge de desarrollo de Next va abajo a la izquierda, justo sobre el
  // bloque de sesion de la barra lateral. Solo existe en `next dev`.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
