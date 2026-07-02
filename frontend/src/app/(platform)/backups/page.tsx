import { requireSession } from "@/core/auth/session";
import { getDriveBackupFiles } from "@/core/backups/drive-files-data";
import { BackupDriveFilesView } from "@/components/backups/BackupDriveFilesView";

// Ruta dedicada de RESPALDOS EN DRIVE (fase inicial del explorador): lista los
// archivos reales de la carpeta de respaldos de la cuenta conectada (nombre, tipo,
// fecha, tamaño) con descarga directa. Server component: una lectura del data layer
// y render sin JS de cliente. Sólo lectura; degrada con avisos claros si Drive no
// está conectado, requiere reconexión o el rol no tiene backups:read.

export const dynamic = "force-dynamic";

export default async function BackupsPage() {
  await requireSession();
  const result = await getDriveBackupFiles();
  return <BackupDriveFilesView result={result} />;
}
