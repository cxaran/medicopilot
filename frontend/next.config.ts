import type { NextConfig } from "next";

const apiProxyTarget = process.env.API_PROXY_TARGET;

const nextConfig: NextConfig = {
  output: "standalone",
  // transformers.js (Whisper local) corre SÓLO en el navegador, dentro de un Web Worker cargado
  // de forma perezosa. Se excluye del bundling del servidor para que el build no intente empaquetar
  // onnxruntime-web/WASM del lado servidor.
  serverExternalPackages: ["@huggingface/transformers"],
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
