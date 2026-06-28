export interface BrowserSession {
  id: string;
  // Identidad propagada desde el ticket de FastAPI (MG-002): userId = claim `sub`,
  // sessionRef = claim `sid` (versión de sesión del usuario). No autoriza nada
  // clínico por sí misma; la autoridad clínica sigue siendo FastAPI vía cookie.
  userId: string;
  sessionRef: string;
  createdAt: Date;
  expiresAt: Date;
}
