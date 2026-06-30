"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// Render SEGURO de Markdown de la salida del agente. react-markdown mapea el texto a elementos
// React: NUNCA se inyecta HTML/JS crudo del modelo (sin ``rehype-raw``, cualquier HTML embebido se
// ESCAPA, no se ejecuta), en línea con el principio del producto. Soporta GFM (tablas, tachado,
// listas de tareas), saltos de línea simples del chat (``remark-breaks``) y fórmulas LaTeX en línea
// ($...$) y en bloque ($$...$$) vía KaTeX. Los estilos usan los tokens del tema del copiloto.
//
// react-markdown ya sanea las URLs por defecto (descarta esquemas peligrosos como javascript:); los
// enlaces se abren en una pestaña nueva con rel seguro.
const COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--tx)]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="opacity-70">{children}</del>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--accent-tx)]"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-[18px] font-semibold tracking-tight text-[var(--tx)] first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-[16px] font-semibold tracking-tight text-[var(--tx)] first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-2.5 text-[14.5px] font-semibold text-[var(--tx)] first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-2 text-[14px] font-semibold text-[var(--tx)] first:mt-0">{children}</h4>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0 marker:text-[var(--tx3)]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0 marker:text-[var(--tx3)]">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-[1.55]">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-[3px] border-[var(--accent-bd)] pl-3 italic text-[var(--tx2)]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-[var(--border2)]" />,
  // Código: estilo "pill" en línea por defecto. El bloque (dentro de <pre>) se neutraliza con el
  // selector descendiente del contenedor (más abajo) para que no lleve fondo ni padding doble.
  code: ({ className, children }) => (
    <code
      className={`rounded-[5px] bg-[var(--panel2)] px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--tx)] ${className ?? ""}`}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-[10px] border border-[var(--border2)] bg-[var(--panel2)] p-3 font-mono text-[12.5px] leading-[1.5] text-[var(--tx)]">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[var(--border2)] bg-[var(--bg2)] px-2.5 py-1.5 text-left font-semibold text-[var(--tx)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-[var(--border2)] px-2.5 py-1.5 align-top text-[var(--tx)]">{children}</td>
  ),
};

export function Markdown({ content }: Readonly<{ content: string }>) {
  return (
    <div className="text-[14px] leading-[1.62] text-[var(--tx)] [word-break:break-word] [&_pre_code]:!bg-transparent [&_pre_code]:!px-0 [&_pre_code]:!py-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
