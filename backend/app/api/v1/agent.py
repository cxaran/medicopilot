from fastapi import APIRouter

from backend.app.agent.ticket import issue_connection_ticket
from backend.app.auth.auth_dependencies import CurrentUserOrm
from backend.app.schemas.agent import ConnectionTicketRead

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/connection-ticket", response_model=ConnectionTicketRead)
def create_connection_ticket(current_user: CurrentUserOrm) -> ConnectionTicketRead:
    """Emite un ticket corto y firmado para conectar al Agent Gateway.

    Requiere sesión válida (cualquier usuario autenticado puede solicitarlo). FastAPI
    es la autoridad clínica y NO almacena credenciales del proveedor de IA: este ticket
    es el único puente FastAPI<->Gateway y solo prueba que un usuario con sesión vigente
    autorizó abrir la conexión (queda atado a su versión de sesión actual).

    TODO: en una rebanada posterior esto podría gatearse por un permiso 'ai_copilot'.
    """
    ticket, expires_at = issue_connection_ticket(current_user)
    return ConnectionTicketRead(ticket=ticket, expires_at=expires_at)
