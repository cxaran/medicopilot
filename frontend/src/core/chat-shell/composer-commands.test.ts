import test from "node:test";
import assert from "node:assert/strict";

import { COMPOSER_COMMANDS, parseComposerPalette } from "./composer-commands.ts";

// Paletas "/" del composer (D1): el parser es PURO y determina qué dropdown abrir. Estos tests fijan
// el contrato de disparo y filtrado que consume el CopilotPanel.

test("parseComposerPalette: texto normal no abre ninguna paleta", () => {
  assert.deepEqual(parseComposerPalette("hola doctor"), { mode: "none" });
  assert.deepEqual(parseComposerPalette(""), { mode: "none" });
});

test("parseComposerPalette: '/' solo lista todos los comandos", () => {
  const result = parseComposerPalette("/");
  assert.equal(result.mode, "commands");
  if (result.mode !== "commands") return;
  assert.equal(result.matches.length, COMPOSER_COMMANDS.length);
});

test("parseComposerPalette: filtra por prefijo del nombre del comando", () => {
  const result = parseComposerPalette("/res");
  assert.equal(result.mode, "commands");
  if (result.mode !== "commands") return;
  assert.deepEqual(
    result.matches.map((command) => command.name),
    ["/resumen"],
  );
});

test("parseComposerPalette: prefijo sin coincidencias devuelve lista vacía (no inventa)", () => {
  const result = parseComposerPalette("/zzz");
  assert.equal(result.mode, "commands");
  if (result.mode !== "commands") return;
  assert.equal(result.matches.length, 0);
});

test("parseComposerPalette: '/paciente' entra en modo búsqueda con el término", () => {
  const exact = parseComposerPalette("/paciente");
  assert.deepEqual(exact, { mode: "patient_search", query: "" });

  const withQuery = parseComposerPalette("/paciente juan perez");
  assert.deepEqual(withQuery, { mode: "patient_search", query: "juan perez" });
});

test("parseComposerPalette: '/pac' (parcial) sigue siendo lista de comandos, no búsqueda", () => {
  const result = parseComposerPalette("/pac");
  assert.equal(result.mode, "commands");
  if (result.mode !== "commands") return;
  // El comando de búsqueda aparece como sugerencia mientras se escribe su nombre.
  assert.deepEqual(
    result.matches.map((command) => command.name),
    ["/paciente"],
  );
});

test("COMPOSER_COMMANDS: hay exactamente un comando de búsqueda de paciente", () => {
  const searchCommands = COMPOSER_COMMANDS.filter((command) => command.kind === "patient_search");
  assert.equal(searchCommands.length, 1);
  assert.equal(searchCommands[0]?.name, "/paciente");
});

test("COMPOSER_COMMANDS: todo comando 'prompt' trae un prompt no vacío", () => {
  for (const command of COMPOSER_COMMANDS) {
    if (command.kind === "prompt") {
      assert.ok(command.prompt && command.prompt.trim().length > 0, `${command.name} sin prompt`);
    }
  }
});
