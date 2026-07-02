/*
 * ProviderIcon — glifo de marca por proveedor de IA para el selector de modelo del copiloto.
 * Fiel a los iconos de `modelList()` de MediCopilot.dc.html (Anthropic/OpenAI/Google) y extendido a
 * los demás proveedores que el gateway puede exponer. El proveedor se infiere de una clave libre
 * (etiqueta del modelo + protocolo + id), por lo que no depende de un catálogo fijo.
 */
type ProviderMeta = { color: string; paths: string[] };

const PROVIDERS: { match: RegExp; meta: ProviderMeta }[] = [
  // Anthropic / Claude — ráfaga del diseño.
  { match: /anthropic|claude|sonnet|opus|haiku|fable/, meta: { color: "#c96442", paths: ["M12 3v18M5 7l14 10M19 7L5 17"] } },
  // OpenAI / GPT — nudo del diseño.
  { match: /openai|gpt|chatgpt|o\d|codex/, meta: { color: "#10a37f", paths: ["M12 4a4 4 0 013.5 6 4 4 0 01-3.5 6 4 4 0 01-3.5-6A4 4 0 0112 4z", "M12 4v16"] } },
  // Google / Gemini — destello del diseño.
  { match: /google|gemini|palm|bison/, meta: { color: "#4f8ef7", paths: ["M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"] } },
  // DeepSeek.
  { match: /deepseek/, meta: { color: "#4d6bfe", paths: ["M4 8c5 0 7 8 16 8", "M4 8a2 2 0 100-.01"] } },
  // Mistral.
  { match: /mistral|mixtral|codestral/, meta: { color: "#fa520f", paths: ["M4 5h4v4H4zM10 5h4v4h-4zM16 5h4v4h-4zM4 11h4v4H4zM16 11h4v4h-4zM4 17h16v2H4z"] } },
  // Meta / Llama.
  { match: /meta|llama/, meta: { color: "#0866ff", paths: ["M4 16c0-5 2-8 4-8s3 3 4 6 2 6 4 6 4-3 4-8"] } },
  // xAI / Grok.
  { match: /xai|grok/, meta: { color: "#111111", paths: ["M5 19L19 5M9 5h5v5"] } },
];

const DEFAULT_META: ProviderMeta = {
  color: "var(--accent)",
  paths: ["M12 3l1.9 5.8L20 9l-4.7 3.6L17 19l-5-3.4L7 19l1.7-6.4L4 9l6.1-.2z"],
};

export function providerMeta(key: string): ProviderMeta {
  const k = key.toLowerCase();
  for (const provider of PROVIDERS) {
    if (provider.match.test(k)) return provider.meta;
  }
  return DEFAULT_META;
}

export function ProviderIcon({
  modelKey,
  size = 15,
}: Readonly<{ modelKey: string; size?: number }>) {
  const meta = providerMeta(modelKey);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={meta.color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {meta.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
