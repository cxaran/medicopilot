// Hook de resolución ESM SÓLO para el harness de tests unitarios (node --test).
// Resuelve el alias de imports "@/..." a "src/..." replicando lo que hace el
// bundler de Next (tsconfig paths "@/*" -> "./src/*"), incluyendo la resolución de
// extensión (.ts/.tsx) e índice de carpeta. No afecta al runtime de la app: sólo se
// registra cuando los scripts test:* lo cargan con --import.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC_DIR = path.resolve(import.meta.dirname, "..", "src");

function resolveAliasTarget(subpath) {
  const base = path.join(SRC_DIR, subpath);
  if (path.extname(base)) {
    return base;
  }
  for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
    if (existsSync(base + ext)) {
      return base + ext;
    }
  }
  for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
    const indexed = path.join(base, `index${ext}`);
    if (existsSync(indexed)) {
      return indexed;
    }
  }
  return base;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const target = resolveAliasTarget(specifier.slice(2));
    return next(pathToFileURL(target).href, context);
  }
  return next(specifier, context);
}
