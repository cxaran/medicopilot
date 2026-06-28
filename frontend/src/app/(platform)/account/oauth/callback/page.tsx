"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { completeOpenAiOAuth } from "@/core/ai-providers/ai-providers-client";

type CallbackState =
  | { kind: "working" }
  | { kind: "success"; accountId: string | null }
  | { kind: "error"; message: string };

function OAuthCallbackInner() {
  const params = useSearchParams();
  const [state, setState] = useState<CallbackState>({ kind: "working" });
  // El callback puede re-renderizar; el intercambio se ejecuta una sola vez.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = params.get("code");
    const stateParam = params.get("state");
    const error = params.get("error");

    // Todo el resultado se resuelve en una promesa; el único setState vive en su
    // ``.then`` (callback asíncrono), no en el cuerpo síncrono del efecto.
    const run = async (): Promise<CallbackState> => {
      if (error) {
        return { kind: "error", message: "El proveedor rechazó la autorización." };
      }
      if (!code || !stateParam) {
        return { kind: "error", message: "Faltan parámetros del callback (code/state)." };
      }
      try {
        const status = await completeOpenAiOAuth({ code, state: stateParam });
        return { kind: "success", accountId: status.account_id ?? null };
      } catch {
        return { kind: "error", message: "No se pudo completar la conexión con ChatGPT." };
      }
    };

    void run().then(setState);
  }, [params]);

  return (
    <Card className="max-w-md space-y-4">
      <h1 className="text-lg font-semibold text-[var(--tx)]">Conexión con ChatGPT</h1>
      {state.kind === "working" ? (
        <p className="text-sm text-[var(--tx2)]">Completando la conexión...</p>
      ) : state.kind === "success" ? (
        <p className="text-sm text-[var(--ok)]">
          Conectado correctamente
          {state.accountId ? ` (cuenta ${state.accountId})` : ""}.
        </p>
      ) : (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {state.message}
        </p>
      )}
      <Link href="/account">
        <Button type="button">Volver a Mi cuenta</Button>
      </Link>
    </Card>
  );
}

/**
 * Callback del flujo OAuth de ChatGPT: lee ``code``/``state`` de la query y completa el
 * intercambio contra el backend (B10). ``useSearchParams`` exige un límite de Suspense.
 */
export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--tx2)]">Cargando...</p>}>
      <OAuthCallbackInner />
    </Suspense>
  );
}
