from datetime import datetime

from backend.app.schemas.base import ApiSchema


class ConnectionTicketRead(ApiSchema):
    """Ticket de conexión al Agent Gateway emitido a un usuario con sesión válida.

    ``ticket`` es un JWT HS256 corto y firmado; ``expires_at`` es su vencimiento
    (UTC). No incluye datos clínicos, permisos ni secretos.
    """

    ticket: str
    expires_at: datetime
