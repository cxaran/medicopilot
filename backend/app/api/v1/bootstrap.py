from fastapi import APIRouter, Header, Request, Response, status
from sqlalchemy.exc import IntegrityError

from backend.app.api.resource_actions import api_error
from backend.app.bootstrap.security import (
    BOOTSTRAP_TOKEN_HEADER,
    bootstrap_token_required,
    require_bootstrap_token,
)
from backend.app.bootstrap.service import (
    BootstrapAdditionalRoleInput,
    BootstrapError,
    BootstrapInitializeInput,
    BootstrapRoleInput,
    BootstrapUserInput,
    MAX_ADDITIONAL_ROLES,
    get_platform_setup_status,
    initialize_platform,
)
from backend.app.core.database import SessionDep
from backend.app.core.settings import settings
from backend.app.schemas.bootstrap import (
    BootstrapCatalogRead,
    BootstrapInitializeRead,
    BootstrapInitializeRequest,
    BootstrapLimitsRead,
    BootstrapPermissionGroupRead,
    BootstrapPermissionRead,
    BootstrapStatusRead,
)
from backend.app.security.catalog import SECURITY_GROUPS
from backend.app.security.rate_limit import limit_bootstrap_initialize

router = APIRouter(prefix="/bootstrap", tags=["bootstrap"])


@router.get("/status", response_model=BootstrapStatusRead)
def read_bootstrap_status(response: Response, session: SessionDep) -> BootstrapStatusRead:
    response.headers["Cache-Control"] = "no-store"
    return BootstrapStatusRead.model_validate(
        get_platform_setup_status(
            session,
            token_required=bootstrap_token_required(settings.bootstrap_setup_token),
        )
    )


@router.get("/catalog", response_model=BootstrapCatalogRead)
def read_bootstrap_catalog(
    response: Response,
    session: SessionDep,
    bootstrap_token: str | None = Header(default=None, alias=BOOTSTRAP_TOKEN_HEADER),
) -> BootstrapCatalogRead:
    response.headers["Cache-Control"] = "no-store"
    status_read = get_platform_setup_status(
        session, token_required=bootstrap_token_required(settings.bootstrap_setup_token)
    )
    if not status_read.setup_required:
        api_error(
            status.HTTP_409_CONFLICT,
            "bootstrap_completed",
            "Bootstrap ya fue completado.",
        )
    require_bootstrap_token(settings.bootstrap_setup_token, bootstrap_token)
    return BootstrapCatalogRead(
        permission_groups=[
            BootstrapPermissionGroupRead(
                name=group.group_name(),
                label=group.group_label(),
                permissions=[
                    BootstrapPermissionRead(
                        access=permission.permission,
                        label=permission.description or permission.permission,
                        description=permission.description,
                    )
                    for permission in group
                ],
            )
            for group in SECURITY_GROUPS
        ],
        limits=BootstrapLimitsRead(max_additional_roles=MAX_ADDITIONAL_ROLES),
    )


@router.post(
    "/initialize",
    response_model=BootstrapInitializeRead,
    status_code=status.HTTP_201_CREATED,
)
def initialize_bootstrap(
    payload: BootstrapInitializeRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    bootstrap_token: str | None = Header(default=None, alias=BOOTSTRAP_TOKEN_HEADER),
) -> BootstrapInitializeRead:
    response.headers["Cache-Control"] = "no-store"
    limit_bootstrap_initialize(request)
    require_bootstrap_token(settings.bootstrap_setup_token, bootstrap_token)
    setup_input = BootstrapInitializeInput(
        user=BootstrapUserInput(
            name=payload.user.name,
            last_name=payload.user.last_name,
            email=str(payload.user.email),
            password=payload.user.password,
        ),
        system_admin_role=BootstrapRoleInput(
            label=payload.system_admin_role.label,
            description=payload.system_admin_role.description,
        ),
        public_registration_enabled=payload.public_registration_enabled,
        institution_name=payload.institution_name,
        additional_roles=[
            BootstrapAdditionalRoleInput(
                name=role.name,
                description=role.description,
                permissions=role.permissions,
                assign_to_initial_user=role.assign_to_initial_user,
            )
            for role in payload.additional_roles
        ],
    )
    try:
        initialize_platform(session, setup_input)
        session.commit()
    except BootstrapError as exc:
        session.rollback()
        status_code = (
            status.HTTP_409_CONFLICT if exc.code == "bootstrap_unavailable" else 422
        )
        api_error(status_code, exc.code, exc.message)
    except IntegrityError:
        session.rollback()
        api_error(
            status.HTTP_409_CONFLICT,
            "bootstrap_conflict",
            "No se pudo completar Bootstrap.",
        )

    return BootstrapInitializeRead(setup_complete=True)
