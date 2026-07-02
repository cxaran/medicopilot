// Vista de los ARCHIVOS de respaldo guardados en Google Drive (server component, sólo
// lectura). Fase inicial del explorador: nombre, tipo, fecha, tamaño y descarga — sin
// exploración todavía. La descarga es un <a> al endpoint de streaming del backend
// (mismo origen: la cookie de sesión viaja sola); sin JS de cliente.

import Link from "next/link";

import {
  artifactKindLabel,
  downloadHref,
  formatBytes,
  formatCreatedTime,
  type DriveFilesResult,
} from "@/core/backups/drive-files";

function Notice({
  title,
  text,
  action,
}: Readonly<{ title: string; text: string; action?: React.ReactNode }>) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-[14px] border border-[var(--border2)] bg-[var(--panel)] p-6">
      <h2 className="text-sm font-semibold text-[var(--tx)]">{title}</h2>
      <p className="text-sm text-[var(--tx2)]">{text}</p>
      {action}
    </section>
  );
}

function SettingsLink({ label }: Readonly<{ label: string }>) {
  return (
    <Link
      href="/resources/backup_settings"
      className="rounded-[8px] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--on-accent)] transition hover:opacity-90"
    >
      {label}
    </Link>
  );
}

function KindBadge({ kind }: Readonly<{ kind: "restore" | "explorer" }>) {
  const tone =
    kind === "restore"
      ? "bg-[var(--accent-soft,rgba(59,130,246,0.12))] text-[var(--accent)]"
      : "bg-[var(--panel2)] text-[var(--tx2)]";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {artifactKindLabel(kind)}
    </span>
  );
}

export function BackupDriveFilesView({ result }: Readonly<{ result: DriveFilesResult }>) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--tx)]">
            Respaldos en Google Drive
          </h1>
          <p className="text-sm text-[var(--tx2)]">
            Archivos guardados en la carpeta de respaldos de la cuenta conectada. Los
            respaldos se restauran con pg_restore; los archivos de exploración podrán
            abrirse desde aquí en una fase futura.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/backups"
            className="rounded-[8px] border border-[var(--border2)] bg-[var(--panel2)] px-3 py-2 text-xs font-semibold text-[var(--tx)] transition hover:opacity-90"
          >
            Actualizar
          </Link>
          <SettingsLink label="Configuración" />
        </div>
      </div>

      {result.status === "not_connected" && (
        <Notice
          title="Google Drive no está conectado"
          text="Conecta la cuenta de Google Drive desde la configuración de respaldos para ver los archivos guardados."
          action={<SettingsLink label="Ir a configuración" />}
        />
      )}
      {result.status === "needs_reauth" && (
        <Notice
          title="Google Drive requiere reconexión"
          text="La cuenta de Google Drive dejó de aceptar la credencial guardada. Reconéctala desde la configuración de respaldos."
          action={<SettingsLink label="Reconectar" />}
        />
      )}
      {result.status === "error" && (
        <Notice title="No se pudo consultar Google Drive" text={result.message} />
      )}

      {result.status === "ok" && result.files.length === 0 && (
        <Notice
          title="Aún no hay respaldos"
          text="La carpeta de respaldos está vacía. Usa «Respaldar ahora» en la configuración o espera a la siguiente ventana programada."
          action={<SettingsLink label="Ir a configuración" />}
        />
      )}

      {result.status === "ok" && result.files.length > 0 && (
        <section className="overflow-x-auto rounded-[14px] border border-[var(--border2)] bg-[var(--panel)]">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border2)] text-left text-xs text-[var(--tx3)]">
                <th className="px-4 py-3 font-medium">Archivo</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Tamaño</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {result.files.map((file) => (
                <tr
                  key={file.fileId}
                  className="border-b border-[var(--border2)] last:border-b-0"
                >
                  <td className="px-4 py-3 font-mono text-xs text-[var(--tx)]">{file.name}</td>
                  <td className="px-4 py-3">
                    <KindBadge kind={file.artifactKind} />
                  </td>
                  <td className="px-4 py-3 text-[var(--tx2)]">
                    {formatCreatedTime(file.createdTime)}
                  </td>
                  <td className="px-4 py-3 text-[var(--tx2)]">{formatBytes(file.sizeBytes)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {file.artifactKind === "explorer" && (
                        <Link
                          href={`/backups/explore?file=${encodeURIComponent(file.fileId)}&name=${encodeURIComponent(file.name)}`}
                          className="rounded-[8px] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] transition hover:opacity-90"
                        >
                          Explorar
                        </Link>
                      )}
                      <a
                        href={downloadHref(file.fileId)}
                        className="rounded-[8px] border border-[var(--border2)] bg-[var(--panel2)] px-3 py-1.5 text-xs font-semibold text-[var(--tx)] transition hover:opacity-90"
                        download
                      >
                        Descargar
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
