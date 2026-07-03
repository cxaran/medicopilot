import type { NextConfig } from "next";

const apiProxyTarget = process.env.API_PROXY_TARGET;

const nextConfig: NextConfig = {
  output: "standalone",
  // Orígenes de DEV permitidos para los recursos internos de Next (HMR, /_next). Necesario cuando el
  // dev server se abre desde un host distinto a localhost —p. ej. `host.docker.internal` desde un
  // navegador en contenedor para pruebas E2E—; sin esto la app no hidrata por ese origen. Sólo dev.
  allowedDevOrigins: ["host.docker.internal"],
  // transformers.js (Whisper local) corre SÓLO en el navegador, dentro de un Web Worker cargado
  // de forma perezosa. Se excluye del bundling del servidor para que el build no intente empaquetar
  // onnxruntime-web/WASM del lado servidor.
  serverExternalPackages: ["@huggingface/transformers"],
  // Los watchers nativos NO reciben eventos de archivos a través del bind mount de Docker
  // Desktop en Windows: sin polling, el dev server del contenedor sirve un bundle viejo hasta
  // reiniciarlo. Esta opción aplica a ambos bundlers, pero en Turbopack 16.2 el polling no
  // funciona (vercel/next.js#80665), por eso compose.dev.yml arranca el contenedor con
  // `next dev --webpack` (+ WATCHPACK_POLLING). Solo afecta a `next dev`.
  watchOptions: { pollIntervalMs: 500 },
  // sql.js (visor de respaldos) corre SÓLO en el navegador (WASM en /sql-wasm.wasm),
  // pero su bundle referencia módulos de Node: se apagan en el bundle de cliente.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
  async rewrites() {
    if (!apiProxyTarget) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
