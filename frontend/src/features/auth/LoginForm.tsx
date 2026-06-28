"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthAlert, AuthLabel } from "@/features/auth/PublicAuthShell";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
      await browserApi("/api/v1/auth/login", {
        method: "POST",
        body: { email, password },
      });

      startTransition(() => {
        router.replace("/");
        router.refresh();
      });
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setError(caught.body.message);
        return;
      }
      setError("No se pudo iniciar sesión");
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-1.5">
        <AuthLabel htmlFor="email">Correo electrónico</AuthLabel>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <AuthLabel htmlFor="password">Contraseña</AuthLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? (
        <AuthAlert tone="danger" role="alert">
          {error}
        </AuthAlert>
      ) : null}
      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
