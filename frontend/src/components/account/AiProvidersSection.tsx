"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ResourceActionConfirmDialog } from "@/components/resources/ResourceActionConfirmDialog";
import { ApiRequestError } from "@/core/api/api-error";
import type {
  AiProvider,
  AiProviderCredentialRead,
  OAuthStatusResponse,
} from "@/core/api/contracts";
import {
  createAiProvider,
  deleteAiProvider,
  disconnectOpenAiOAuth,
  getOpenAiOAuthStatus,
  listAiProviders,
  startOpenAiOAuth,
} from "@/core/ai-providers/ai-providers-client";
import {
  PROVIDER_OPTIONS,
  deleteCredentialConfirmation,
  disconnectOAuthConfirmation,
  maskedKeyLabel,
  oauthStatusLabel,
  providerDisplayName,
} from "@/core/ai-providers/ai-providers-view";

type PendingConfirm =
  | { kind: "delete"; credential: AiProviderCredentialRead }
  | { kind: "disconnect" };

export function AiProvidersSection() {
  const [credentials, setCredentials] = useState<AiProviderCredentialRead[]>([]);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [oauthMessage, setOauthMessage] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState(false);

  // Carga en cadena ``.then``: los setState quedan en callbacks asíncronos (no en el
  // cuerpo síncrono del efecto), evitando renders en cascada al montar.
  const reload = useCallback(() => {
    return Promise.all([listAiProviders(), getOpenAiOAuthStatus()])
      .then(([list, status]) => {
        setCredentials(list);
        setOauthStatus(status);
        setLoadError(null);
      })
      .catch(() => {
        setLoadError("No se pudieron cargar tus proveedores de IA.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setFormError(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const provider = String(data.get("provider") ?? "") as AiProvider;
    const label = String(data.get("label") ?? "").trim();
    const secret = String(data.get("secret") ?? "");
    const defaultModel = String(data.get("default_model") ?? "").trim();

    try {
      await createAiProvider({
        provider,
        label,
        secret,
        default_model: defaultModel || null,
      });
      // El secreto NUNCA se conserva en el cliente: se limpia el formulario tras guardar.
      form.reset();
      await reload();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 422) {
        setFormError("Revisa los datos: el proveedor, la etiqueta y la API key son obligatorios.");
      } else {
        setFormError("No se pudo guardar la credencial. Inténtalo nuevamente.");
      }
    } finally {
      setCreating(false);
    }
  }

  async function onConfirm() {
    if (!confirm || confirmPending) return;
    setConfirmPending(true);
    setConfirmError(null);
    try {
      if (confirm.kind === "delete") {
        await deleteAiProvider(confirm.credential.id);
      } else {
        await disconnectOpenAiOAuth();
      }
      setConfirm(null);
      await reload();
    } catch {
      setConfirmError("No se pudo completar la acción. Inténtalo nuevamente.");
    } finally {
      setConfirmPending(false);
    }
  }

  async function onConnectChatGpt() {
    if (oauthPending) return;
    setOauthPending(true);
    setOauthMessage(null);
    try {
      const { authorize_url } = await startOpenAiOAuth();
      // Redirige al proveedor; al volver, /account/oauth/callback completa el flujo.
      window.location.assign(authorize_url);
    } catch (error) {
      // En QA el OAuth real no está configurado (503): el botón inicia el flujo sin
      // crashear y se informa que no está disponible / sigue sin conectar.
      if (error instanceof ApiRequestError && error.status === 503) {
        setOauthMessage("La conexión con ChatGPT no está disponible en este entorno.");
      } else {
        setOauthMessage("No se pudo iniciar la conexión con ChatGPT. Inténtalo nuevamente.");
      }
      setOauthPending(false);
    }
  }

  const confirmation =
    confirm?.kind === "delete"
      ? deleteCredentialConfirmation(confirm.credential)
      : confirm?.kind === "disconnect"
        ? disconnectOAuthConfirmation()
        : null;

  return (
    <section
      aria-label="Proveedores de IA"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Proveedores de IA</h2>
        <p className="mt-1 text-sm text-slate-500">
          Gestiona las API keys de tus proveedores y conecta tu cuenta de ChatGPT. Las
          claves se guardan cifradas y nunca se muestran de nuevo.
        </p>
      </div>

      {/* Conexión OAuth de ChatGPT (B10) */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--tx)]">ChatGPT (OAuth)</p>
            <p className="text-xs text-[var(--tx2)]">{oauthStatusLabel(oauthStatus)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={oauthStatus?.connected ? "ok" : "neutral"}>
              {oauthStatus?.connected ? "Conectado" : "No conectado"}
            </Badge>
            {oauthStatus?.connected ? (
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-500"
                onClick={() => {
                  setConfirmError(null);
                  setConfirm({ kind: "disconnect" });
                }}
              >
                Desconectar
              </Button>
            ) : (
              <Button type="button" onClick={onConnectChatGpt} disabled={oauthPending}>
                {oauthPending ? "Conectando..." : "Conectar ChatGPT"}
              </Button>
            )}
          </div>
        </div>
        {oauthMessage ? (
          <p role="status" className="text-xs text-[var(--warn)]">
            {oauthMessage}
          </p>
        ) : null}
      </Card>

      {/* Alta de credencial API key (B3) */}
      <form
        onSubmit={onCreate}
        aria-label="Agregar proveedor de IA"
        className="space-y-3 rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-5"
      >
        <p className="text-sm font-semibold text-[var(--tx)]">Agregar API key</p>
        {formError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--tx)]">Proveedor</span>
            <Select name="provider" defaultValue="opencode_zen" required>
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--tx)]">Etiqueta</span>
            <Input name="label" required maxLength={120} placeholder="Mi clave de OpenCode" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--tx)]">API key</span>
            <Input
              name="secret"
              type="password"
              required
              autoComplete="off"
              placeholder="sk-..."
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--tx)]">Modelo por defecto (opcional)</span>
            <Input name="default_model" maxLength={160} placeholder="gpt-4o" />
          </label>
        </div>
        <Button type="submit" disabled={creating}>
          {creating ? "Guardando..." : "Guardar credencial"}
        </Button>
      </form>

      {/* Lista de credenciales */}
      <div className="space-y-2" aria-label="Credenciales guardadas">
        {loading ? (
          <p className="text-sm text-[var(--tx2)]">Cargando...</p>
        ) : loadError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </div>
        ) : credentials.length === 0 ? (
          <p className="text-sm text-[var(--tx2)]">Aún no has agregado proveedores de IA.</p>
        ) : (
          credentials.map((credential) => (
            <Card
              key={credential.id}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--tx)]">{credential.label}</span>
                  <Badge tone="accent">{providerDisplayName(credential.provider)}</Badge>
                  <Badge tone={credential.is_active ? "ok" : "neutral"}>
                    {credential.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                  {credential.credential_type === "oauth" ? (
                    <Badge tone="info">OAuth</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-[var(--tx2)]">
                  {credential.credential_type === "oauth"
                    ? "Conexión gestionada desde ChatGPT (OAuth)."
                    : `API key: ${maskedKeyLabel()}`}
                  {credential.default_model ? ` · Modelo: ${credential.default_model}` : ""}
                </p>
              </div>
              {credential.credential_type === "api_key" ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmError(null);
                    setConfirm({ kind: "delete", credential });
                  }}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
                >
                  Eliminar
                </button>
              ) : null}
            </Card>
          ))
        )}
      </div>

      {confirmation ? (
        <ResourceActionConfirmDialog
          confirmation={confirmation}
          pending={confirmPending}
          error={confirmError}
          onConfirm={() => void onConfirm()}
          onCancel={() => {
            if (!confirmPending) {
              setConfirm(null);
              setConfirmError(null);
            }
          }}
        />
      ) : null}
    </section>
  );
}
