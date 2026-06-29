// Generado automáticamente por scripts/generate-openapi.mjs. No editar manualmente.

export interface paths {
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["health_api_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readiness */
        get: operations["readiness_api_ready_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent/connection-ticket": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Connection Ticket
         * @description Emite un ticket corto y firmado para conectar al Agent Gateway.
         *
         *     Requiere sesión válida (cualquier usuario autenticado puede solicitarlo). FastAPI
         *     es la autoridad clínica y NO almacena credenciales del proveedor de IA: este ticket
         *     es el único puente FastAPI<->Gateway y solo prueba que un usuario con sesión vigente
         *     autorizó abrir la conexión (queda atado a su versión de sesión actual).
         *
         *     TODO: en una rebanada posterior esto podría gatearse por un permiso 'ai_copilot'.
         */
        post: operations["create_connection_ticket_api_v1_agent_connection_ticket_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent/templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Agent Templates */
        get: operations["list_agent_templates_api_v1_agent_templates_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/agent/templates/{template_id}/prefill": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Open Template Prefill
         * @description Valida y resuelve una propuesta de apertura de plantilla con prellenado. READ-ONLY.
         *
         *     No persiste nada: valida ``template_id``/modo/campos contra el catálogo + RBAC y devuelve el
         *     plan que el frontend renderiza PRELLENADO; la aceptación del médico va por la ruta P1.
         */
        post: operations["open_template_prefill_api_v1_agent_templates__template_id__prefill_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/internal/agent/credential-lease": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Lease Credential */
        post: operations["lease_credential_api_v1_internal_agent_credential_lease_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/agent-memories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Memories */
        get: operations["list_memories_api_v1_users_me_agent_memories_get"];
        put?: never;
        /** Create Memory */
        post: operations["create_memory_api_v1_users_me_agent_memories_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/agent-memories/{memory_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Memory */
        delete: operations["delete_memory_api_v1_users_me_agent_memories__memory_id__delete"];
        options?: never;
        head?: never;
        /** Update Memory */
        patch: operations["update_memory_api_v1_users_me_agent_memories__memory_id__patch"];
        trace?: never;
    };
    "/api/v1/users/me/ai-providers/oauth/openai/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Start Oauth */
        post: operations["start_oauth_api_v1_users_me_ai_providers_oauth_openai_start_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/ai-providers/oauth/openai/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Complete Oauth */
        post: operations["complete_oauth_api_v1_users_me_ai_providers_oauth_openai_complete_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/ai-providers/oauth/openai/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Oauth Status */
        get: operations["oauth_status_api_v1_users_me_ai_providers_oauth_openai_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/ai-providers/oauth/openai": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Disconnect Oauth */
        delete: operations["disconnect_oauth_api_v1_users_me_ai_providers_oauth_openai_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/agent-persona": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Persona */
        get: operations["get_persona_api_v1_users_me_agent_persona_get"];
        /** Upsert Persona */
        put: operations["upsert_persona_api_v1_users_me_agent_persona_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/ai-providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Credentials */
        get: operations["list_credentials_api_v1_users_me_ai_providers_get"];
        put?: never;
        /** Create Credential */
        post: operations["create_credential_api_v1_users_me_ai_providers_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/me/ai-providers/{credential_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Credential */
        delete: operations["delete_credential_api_v1_users_me_ai_providers__credential_id__delete"];
        options?: never;
        head?: never;
        /** Update Credential */
        patch: operations["update_credential_api_v1_users_me_ai_providers__credential_id__patch"];
        trace?: never;
    };
    "/api/v1/appointments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Appointments */
        get: operations["list_appointments_api_v1_appointments_get"];
        put?: never;
        /** Create Appointment */
        post: operations["create_appointment_api_v1_appointments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/appointments/{appointment_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Appointment */
        get: operations["get_appointment_api_v1_appointments__appointment_id__get"];
        put?: never;
        post?: never;
        /** Delete Appointment */
        delete: operations["delete_appointment_api_v1_appointments__appointment_id__delete"];
        options?: never;
        head?: never;
        /** Update Appointment */
        patch: operations["update_appointment_api_v1_appointments__appointment_id__patch"];
        trace?: never;
    };
    "/api/v1/appointments/{appointment_id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirm Appointment */
        post: operations["confirm_appointment_api_v1_appointments__appointment_id__confirm_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/appointments/{appointment_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel Appointment */
        post: operations["cancel_appointment_api_v1_appointments__appointment_id__cancel_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/appointments/{appointment_id}/no-show": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** No Show Appointment */
        post: operations["no_show_appointment_api_v1_appointments__appointment_id__no_show_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/appointments/{appointment_id}/reschedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reschedule Appointment */
        post: operations["reschedule_appointment_api_v1_appointments__appointment_id__reschedule_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/audit-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Audit Events */
        get: operations["list_audit_events_api_v1_audit_events_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/audit-events/{event_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Audit Event */
        get: operations["get_audit_event_api_v1_audit_events__event_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read Auth Policy
         * @description Política pública de auth. El frontend la consume; no infiere de settings.
         */
        get: operations["read_auth_policy_api_v1_auth_policy_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Current User */
        get: operations["read_current_user_api_v1_auth_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login */
        post: operations["login_api_v1_auth_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Logout
         * @description Cierra la sesión actual borrando la cookie httponly.
         *
         *     Requiere sesión válida; no rota ``User.token`` (no es un cierre de sesión en
         *     todos los dispositivos, solo el actual).
         */
        post: operations["logout_api_v1_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Request Registration */
        post: operations["request_registration_api_v1_auth_register_request_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Complete Registration */
        post: operations["complete_registration_api_v1_auth_register_complete_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/unlock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Unlock Account */
        post: operations["unlock_account_api_v1_auth_unlock_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/password/forgot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Request Password Reset */
        post: operations["request_password_reset_api_v1_auth_password_forgot_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/password/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Complete Password Reset */
        post: operations["complete_password_reset_api_v1_auth_password_reset_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bootstrap/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Bootstrap Status */
        get: operations["read_bootstrap_status_api_v1_bootstrap_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bootstrap/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Bootstrap Catalog */
        get: operations["read_bootstrap_catalog_api_v1_bootstrap_catalog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bootstrap/initialize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Initialize Bootstrap */
        post: operations["initialize_bootstrap_api_v1_bootstrap_initialize_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-codes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Clinical Codes */
        get: operations["list_clinical_codes_api_v1_clinical_codes_get"];
        put?: never;
        /** Create Clinical Code */
        post: operations["create_clinical_code_api_v1_clinical_codes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-codes/{code_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Clinical Code */
        get: operations["get_clinical_code_api_v1_clinical_codes__code_id__get"];
        put?: never;
        post?: never;
        /** Delete Clinical Code */
        delete: operations["delete_clinical_code_api_v1_clinical_codes__code_id__delete"];
        options?: never;
        head?: never;
        /** Update Clinical Code */
        patch: operations["update_clinical_code_api_v1_clinical_codes__code_id__patch"];
        trace?: never;
    };
    "/api/v1/clinical-documents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Clinical Documents */
        get: operations["list_clinical_documents_api_v1_clinical_documents_get"];
        put?: never;
        /** Upload Clinical Document */
        post: operations["upload_clinical_document_api_v1_clinical_documents_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-documents/{document_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Clinical Document */
        get: operations["get_clinical_document_api_v1_clinical_documents__document_id__get"];
        put?: never;
        post?: never;
        /** Delete Clinical Document */
        delete: operations["delete_clinical_document_api_v1_clinical_documents__document_id__delete"];
        options?: never;
        head?: never;
        /** Update Clinical Document */
        patch: operations["update_clinical_document_api_v1_clinical_documents__document_id__patch"];
        trace?: never;
    };
    "/api/v1/clinical-documents/{document_id}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Clinical Document Content
         * @description Contenido EXTRAÍBLE del documento para que el agente lo interprete (F-MEDIOS fase 1).
         *
         *     Mismo RBAC y visibilidad que la lectura del documento (eliminado lógico → 404). Para
         *     imágenes devuelve la referencia de visión (``download_url``); para PDFs, el texto. El
         *     servidor NO interpreta valores clínicos: solo superficie el contenido.
         */
        get: operations["get_clinical_document_content_api_v1_clinical_documents__document_id__content_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-documents/{document_id}/transcript": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Clinical Document Transcript
         * @description Transcripción de un documento de AUDIO (F-MEDIOS fase 2).
         *
         *     Mismo RBAC y visibilidad que la lectura (eliminado lógico → 404). Usa el proveedor STT
         *     configurado; si no hay proveedor, responde ``available=false`` y ``transcript=null``
         *     (nunca fabrica). El servidor devuelve exactamente lo que el proveedor entrega.
         */
        get: operations["get_clinical_document_transcript_api_v1_clinical_documents__document_id__transcript_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-documents/{document_id}/download": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download Clinical Document */
        get: operations["download_clinical_document_api_v1_clinical_documents__document_id__download_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-documents/{document_id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Archive Clinical Document */
        post: operations["archive_clinical_document_api_v1_clinical_documents__document_id__archive_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-documents/{document_id}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Restore Clinical Document */
        post: operations["restore_clinical_document_api_v1_clinical_documents__document_id__restore_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Clinical Events */
        get: operations["list_clinical_events_api_v1_clinical_events_get"];
        put?: never;
        /** Create Clinical Event */
        post: operations["create_clinical_event_api_v1_clinical_events_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-events/{event_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Clinical Event */
        get: operations["get_clinical_event_api_v1_clinical_events__event_id__get"];
        put?: never;
        post?: never;
        /** Delete Clinical Event */
        delete: operations["delete_clinical_event_api_v1_clinical_events__event_id__delete"];
        options?: never;
        head?: never;
        /** Update Clinical Event */
        patch: operations["update_clinical_event_api_v1_clinical_events__event_id__patch"];
        trace?: never;
    };
    "/api/v1/clinical-notes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Clinical Notes */
        get: operations["list_clinical_notes_api_v1_clinical_notes_get"];
        put?: never;
        /** Create Clinical Note */
        post: operations["create_clinical_note_api_v1_clinical_notes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-notes/{note_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Clinical Note */
        get: operations["get_clinical_note_api_v1_clinical_notes__note_id__get"];
        put?: never;
        post?: never;
        /** Delete Clinical Note */
        delete: operations["delete_clinical_note_api_v1_clinical_notes__note_id__delete"];
        options?: never;
        head?: never;
        /** Update Clinical Note */
        patch: operations["update_clinical_note_api_v1_clinical_notes__note_id__patch"];
        trace?: never;
    };
    "/api/v1/clinical-notes/medical-certificate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Medical Certificate
         * @description Crea una CONSTANCIA/justificante de asistencia EN BORRADOR, compuesta de la consulta.
         */
        post: operations["create_medical_certificate_api_v1_clinical_notes_medical_certificate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-notes/sick-leave": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Sick Leave
         * @description Crea una INCAPACIDAD/justificante de reposo EN BORRADOR.
         *
         *     El número de días de reposo es decisión médica EXPLÍCITA (``rest_days`` obligatorio, ≥1 por
         *     schema): nunca se asume ni se inventa.
         */
        post: operations["create_sick_leave_api_v1_clinical_notes_sick_leave_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-notes/referral": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create Referral
         * @description Crea una REFERENCIA o CONTRARREFERENCIA EN BORRADOR, compuesta de la consulta.
         *
         *     El destino de una referencia es decisión médica explícita (lo valida el schema): no se
         *     inventa. El servidor toma de la consulta el paciente y el médico + cédula.
         */
        post: operations["create_referral_api_v1_clinical_notes_referral_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-scales": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Clinical Scales
         * @description Lista las escalas registradas con sus insumos requeridos y fuente citada.
         */
        get: operations["list_clinical_scales_api_v1_clinical_scales_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-scales/{scale_id}/compute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Compute Clinical Scale
         * @description Computa el puntaje de una escala. 422 (nombrando campos) si faltan/invalidan insumos.
         */
        post: operations["compute_clinical_scale_api_v1_clinical_scales__scale_id__compute_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-tasks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Clinical Tasks */
        get: operations["list_clinical_tasks_api_v1_clinical_tasks_get"];
        put?: never;
        /** Create Clinical Task */
        post: operations["create_clinical_task_api_v1_clinical_tasks_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/clinical-tasks/{task_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Clinical Task */
        get: operations["get_clinical_task_api_v1_clinical_tasks__task_id__get"];
        put?: never;
        post?: never;
        /** Delete Clinical Task */
        delete: operations["delete_clinical_task_api_v1_clinical_tasks__task_id__delete"];
        options?: never;
        head?: never;
        /** Update Clinical Task */
        patch: operations["update_clinical_task_api_v1_clinical_tasks__task_id__patch"];
        trace?: never;
    };
    "/api/v1/consultation-diagnoses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Consultation Diagnoses */
        get: operations["list_consultation_diagnoses_api_v1_consultation_diagnoses_get"];
        put?: never;
        /** Create Consultation Diagnosis */
        post: operations["create_consultation_diagnosis_api_v1_consultation_diagnoses_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/consultation-diagnoses/{diagnosis_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Consultation Diagnosis */
        get: operations["get_consultation_diagnosis_api_v1_consultation_diagnoses__diagnosis_id__get"];
        put?: never;
        post?: never;
        /** Delete Consultation Diagnosis */
        delete: operations["delete_consultation_diagnosis_api_v1_consultation_diagnoses__diagnosis_id__delete"];
        options?: never;
        head?: never;
        /** Update Consultation Diagnosis */
        patch: operations["update_consultation_diagnosis_api_v1_consultation_diagnoses__diagnosis_id__patch"];
        trace?: never;
    };
    "/api/v1/consultations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Consultations */
        get: operations["list_consultations_api_v1_consultations_get"];
        put?: never;
        /** Create Consultation */
        post: operations["create_consultation_api_v1_consultations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/consultations/{consultation_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Consultation */
        get: operations["get_consultation_api_v1_consultations__consultation_id__get"];
        put?: never;
        post?: never;
        /** Delete Consultation */
        delete: operations["delete_consultation_api_v1_consultations__consultation_id__delete"];
        options?: never;
        head?: never;
        /** Update Consultation */
        patch: operations["update_consultation_api_v1_consultations__consultation_id__patch"];
        trace?: never;
    };
    "/api/v1/consultations/{consultation_id}/finalize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Finalize Consultation */
        post: operations["finalize_consultation_api_v1_consultations__consultation_id__finalize_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/doctors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Doctors */
        get: operations["list_doctors_api_v1_doctors_get"];
        put?: never;
        /** Create Doctor */
        post: operations["create_doctor_api_v1_doctors_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/doctors/{doctor_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Doctor */
        get: operations["get_doctor_api_v1_doctors__doctor_id__get"];
        put?: never;
        post?: never;
        /** Delete Doctor */
        delete: operations["delete_doctor_api_v1_doctors__doctor_id__delete"];
        options?: never;
        head?: never;
        /** Update Doctor */
        patch: operations["update_doctor_api_v1_doctors__doctor_id__patch"];
        trace?: never;
    };
    "/api/v1/follow-ups/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Follow Ups Summary
         * @description Reúne los pendientes de seguimiento del médico. Sólo lectura; no muta nada.
         */
        get: operations["get_follow_ups_summary_api_v1_follow_ups_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/institutional-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Institutional Settings */
        get: operations["list_institutional_settings_api_v1_institutional_settings_get"];
        put?: never;
        /** Create Institutional Setting */
        post: operations["create_institutional_setting_api_v1_institutional_settings_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/institutional-settings/{setting_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Institutional Setting */
        get: operations["get_institutional_setting_api_v1_institutional_settings__setting_id__get"];
        put?: never;
        post?: never;
        /** Delete Institutional Setting */
        delete: operations["delete_institutional_setting_api_v1_institutional_settings__setting_id__delete"];
        options?: never;
        head?: never;
        /** Update Institutional Setting */
        patch: operations["update_institutional_setting_api_v1_institutional_settings__setting_id__patch"];
        trace?: never;
    };
    "/api/v1/lab-results": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Lab Results */
        get: operations["list_lab_results_api_v1_lab_results_get"];
        put?: never;
        /** Create Lab Result */
        post: operations["create_lab_result_api_v1_lab_results_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/lab-results/{result_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Lab Result */
        get: operations["get_lab_result_api_v1_lab_results__result_id__get"];
        put?: never;
        post?: never;
        /** Delete Lab Result */
        delete: operations["delete_lab_result_api_v1_lab_results__result_id__delete"];
        options?: never;
        head?: never;
        /** Update Lab Result */
        patch: operations["update_lab_result_api_v1_lab_results__result_id__patch"];
        trace?: never;
    };
    "/api/v1/medical-history-versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Medical History Versions */
        get: operations["list_medical_history_versions_api_v1_medical_history_versions_get"];
        put?: never;
        /** Create Medical History Version */
        post: operations["create_medical_history_version_api_v1_medical_history_versions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/medical-history-versions/{history_version_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Medical History Version */
        get: operations["get_medical_history_version_api_v1_medical_history_versions__history_version_id__get"];
        put?: never;
        post?: never;
        /** Delete Medical History Version */
        delete: operations["delete_medical_history_version_api_v1_medical_history_versions__history_version_id__delete"];
        options?: never;
        head?: never;
        /** Update Medical History Version */
        patch: operations["update_medical_history_version_api_v1_medical_history_versions__history_version_id__patch"];
        trace?: never;
    };
    "/api/v1/medical-history-versions/{history_version_id}/finalize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Finalize Medical History Version */
        post: operations["finalize_medical_history_version_api_v1_medical_history_versions__history_version_id__finalize_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/patients/{patient_id}/medication-reconciliation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Reconcile Patient Medications
         * @description Concilia la medicación del paciente. Sólo lectura; no muta nada.
         */
        get: operations["reconcile_patient_medications_api_v1_patients__patient_id__medication_reconciliation_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/medication-templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Medication Templates */
        get: operations["list_medication_templates_api_v1_medication_templates_get"];
        put?: never;
        /** Create Medication Template */
        post: operations["create_medication_template_api_v1_medication_templates_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/medication-templates/{template_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Medication Template */
        get: operations["get_medication_template_api_v1_medication_templates__template_id__get"];
        put?: never;
        post?: never;
        /** Delete Medication Template */
        delete: operations["delete_medication_template_api_v1_medication_templates__template_id__delete"];
        options?: never;
        head?: never;
        /** Update Medication Template */
        patch: operations["update_medication_template_api_v1_medication_templates__template_id__patch"];
        trace?: never;
    };
    "/api/v1/patient-clinical-items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Patient Clinical Items */
        get: operations["list_patient_clinical_items_api_v1_patient_clinical_items_get"];
        put?: never;
        /** Create Patient Clinical Item */
        post: operations["create_patient_clinical_item_api_v1_patient_clinical_items_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/patient-clinical-items/{item_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Patient Clinical Item */
        get: operations["get_patient_clinical_item_api_v1_patient_clinical_items__item_id__get"];
        put?: never;
        post?: never;
        /** Delete Patient Clinical Item */
        delete: operations["delete_patient_clinical_item_api_v1_patient_clinical_items__item_id__delete"];
        options?: never;
        head?: never;
        /** Update Patient Clinical Item */
        patch: operations["update_patient_clinical_item_api_v1_patient_clinical_items__item_id__patch"];
        trace?: never;
    };
    "/api/v1/patient-history-items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Patient History Items */
        get: operations["list_patient_history_items_api_v1_patient_history_items_get"];
        put?: never;
        /** Create Patient History Item */
        post: operations["create_patient_history_item_api_v1_patient_history_items_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/patient-history-items/{item_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Patient History Item */
        get: operations["get_patient_history_item_api_v1_patient_history_items__item_id__get"];
        put?: never;
        post?: never;
        /** Delete Patient History Item */
        delete: operations["delete_patient_history_item_api_v1_patient_history_items__item_id__delete"];
        options?: never;
        head?: never;
        /** Update Patient History Item */
        patch: operations["update_patient_history_item_api_v1_patient_history_items__item_id__patch"];
        trace?: never;
    };
    "/api/v1/patient-immunizations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Patient Immunizations */
        get: operations["list_patient_immunizations_api_v1_patient_immunizations_get"];
        put?: never;
        /** Create Patient Immunization */
        post: operations["create_patient_immunization_api_v1_patient_immunizations_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/patient-immunizations/{item_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Patient Immunization */
        get: operations["get_patient_immunization_api_v1_patient_immunizations__item_id__get"];
        put?: never;
        post?: never;
        /** Delete Patient Immunization */
        delete: operations["delete_patient_immunization_api_v1_patient_immunizations__item_id__delete"];
        options?: never;
        head?: never;
        /** Update Patient Immunization */
        patch: operations["update_patient_immunization_api_v1_patient_immunizations__item_id__patch"];
        trace?: never;
    };
    "/api/v1/patients": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Patients */
        get: operations["list_patients_api_v1_patients_get"];
        put?: never;
        /** Create Patient */
        post: operations["create_patient_api_v1_patients_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/patients/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search Patients
         * @description Busca pacientes existentes por señales de identidad y devuelve candidatos ORDENADOS por un
         *     puntaje determinista, para que el médico ELIJA una coincidencia o cree un expediente nuevo.
         *
         *     Sirve también para DEDUPLICAR antes de crear: pasando los datos propuestos (nombre + fecha +
         *     teléfono/CURP), ``has_strong_match`` indica si ya existe un posible duplicado. Sólo lectura:
         *     nunca crea ni modifica, y por debajo del umbral devuelve vacío (no fabrica coincidencias).
         *     Excluye expedientes eliminados y expone únicamente campos seguros para la tarjeta de selección.
         */
        get: operations["search_patients_api_v1_patients_search_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/patients/{patient_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Patient */
        get: operations["get_patient_api_v1_patients__patient_id__get"];
        put?: never;
        post?: never;
        /** Delete Patient */
        delete: operations["delete_patient_api_v1_patients__patient_id__delete"];
        options?: never;
        head?: never;
        /** Update Patient */
        patch: operations["update_patient_api_v1_patients__patient_id__patch"];
        trace?: never;
    };
    "/api/v1/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Permissions */
        get: operations["list_permissions_api_v1_permissions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/population/cohort": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Query Cohort */
        post: operations["query_cohort_api_v1_population_cohort_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/prescription-items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Prescription Items */
        get: operations["list_prescription_items_api_v1_prescription_items_get"];
        put?: never;
        /** Create Prescription Item */
        post: operations["create_prescription_item_api_v1_prescription_items_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/prescription-items/{item_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Prescription Item */
        get: operations["get_prescription_item_api_v1_prescription_items__item_id__get"];
        put?: never;
        post?: never;
        /** Delete Prescription Item */
        delete: operations["delete_prescription_item_api_v1_prescription_items__item_id__delete"];
        options?: never;
        head?: never;
        /** Update Prescription Item */
        patch: operations["update_prescription_item_api_v1_prescription_items__item_id__patch"];
        trace?: never;
    };
    "/api/v1/prescriptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Prescriptions */
        get: operations["list_prescriptions_api_v1_prescriptions_get"];
        put?: never;
        /** Create Prescription */
        post: operations["create_prescription_api_v1_prescriptions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/prescriptions/{prescription_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Prescription */
        get: operations["get_prescription_api_v1_prescriptions__prescription_id__get"];
        put?: never;
        post?: never;
        /** Delete Prescription */
        delete: operations["delete_prescription_api_v1_prescriptions__prescription_id__delete"];
        options?: never;
        head?: never;
        /** Update Prescription */
        patch: operations["update_prescription_api_v1_prescriptions__prescription_id__patch"];
        trace?: never;
    };
    "/api/v1/prescriptions/{prescription_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve Prescription */
        post: operations["approve_prescription_api_v1_prescriptions__prescription_id__approve_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/prescriptions/{prescription_id}/void": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Void Prescription */
        post: operations["void_prescription_api_v1_prescriptions__prescription_id__void_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/quality/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Quality Check
         * @description Ejecuta las verificaciones deterministas sobre el objetivo. Sólo lectura; no muta nada.
         */
        post: operations["run_quality_check_api_v1_quality_check_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Report Activity */
        get: operations["report_activity_api_v1_reports_activity_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/top-diagnoses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Report Top Diagnoses */
        get: operations["report_top_diagnoses_api_v1_reports_top_diagnoses_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/unsigned-notes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Report Unsigned Notes */
        get: operations["report_unsigned_notes_api_v1_reports_unsigned_notes_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/reports/attendance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Report Attendance */
        get: operations["report_attendance_api_v1_reports_attendance_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/research/pubmed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search Pubmed */
        get: operations["search_pubmed_api_v1_research_pubmed_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/research/pubmed/{pmid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Pubmed Article */
        get: operations["get_pubmed_article_api_v1_research_pubmed__pmid__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Resources */
        get: operations["list_resources_api_v1_resources_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources/{resource_name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Resource Capability */
        get: operations["get_resource_capability_api_v1_resources__resource_name__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Roles */
        get: operations["list_roles_api_v1_roles_get"];
        put?: never;
        /** Create Role */
        post: operations["create_role_api_v1_roles_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/roles/{role_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Role */
        get: operations["get_role_api_v1_roles__role_id__get"];
        put?: never;
        post?: never;
        /** Delete Role */
        delete: operations["delete_role_api_v1_roles__role_id__delete"];
        options?: never;
        head?: never;
        /** Update Role */
        patch: operations["update_role_api_v1_roles__role_id__patch"];
        trace?: never;
    };
    "/api/v1/roles/{role_id}/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Role Permissions
         * @description Selección actual de permisos del rol (lectura para el editor relacional).
         */
        get: operations["get_role_permissions_api_v1_roles__role_id__permissions_get"];
        /** Replace Role Permissions */
        put: operations["replace_role_permissions_api_v1_roles__role_id__permissions_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scale-results": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Scale Results */
        get: operations["list_scale_results_api_v1_scale_results_get"];
        put?: never;
        /** Create Scale Result */
        post: operations["create_scale_result_api_v1_scale_results_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scale-results/{result_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Scale Result */
        get: operations["get_scale_result_api_v1_scale_results__result_id__get"];
        put?: never;
        post?: never;
        /** Delete Scale Result */
        delete: operations["delete_scale_result_api_v1_scale_results__result_id__delete"];
        options?: never;
        head?: never;
        /** Update Scale Result */
        patch: operations["update_scale_result_api_v1_scale_results__result_id__patch"];
        trace?: never;
    };
    "/api/v1/study-orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Study Orders */
        get: operations["list_study_orders_api_v1_study_orders_get"];
        put?: never;
        /** Create Study Order */
        post: operations["create_study_order_api_v1_study_orders_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/study-orders/{order_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Study Order */
        get: operations["get_study_order_api_v1_study_orders__order_id__get"];
        put?: never;
        post?: never;
        /** Delete Study Order */
        delete: operations["delete_study_order_api_v1_study_orders__order_id__delete"];
        options?: never;
        head?: never;
        /** Update Study Order */
        patch: operations["update_study_order_api_v1_study_orders__order_id__patch"];
        trace?: never;
    };
    "/api/v1/users/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read Profile */
        get: operations["read_profile_api_v1_users_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Profile */
        patch: operations["update_profile_api_v1_users_me_patch"];
        trace?: never;
    };
    "/api/v1/users/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Change Password */
        post: operations["change_password_api_v1_users_me_password_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Users */
        get: operations["list_users_api_v1_users_get"];
        put?: never;
        /** Create User */
        post: operations["create_user_api_v1_users_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get User */
        get: operations["get_user_api_v1_users__user_id__get"];
        put?: never;
        post?: never;
        /** Delete User */
        delete: operations["delete_user_api_v1_users__user_id__delete"];
        options?: never;
        head?: never;
        /** Update User */
        patch: operations["update_user_api_v1_users__user_id__patch"];
        trace?: never;
    };
    "/api/v1/users/{user_id}/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List User Roles */
        get: operations["list_user_roles_api_v1_users__user_id__roles_get"];
        /** Replace User Roles */
        put: operations["replace_user_roles_api_v1_users__user_id__roles_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/users/{user_id}/revoke-sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke User Sessions */
        post: operations["revoke_user_sessions_api_v1_users__user_id__revoke_sessions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/vital-signs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Vital Signs */
        get: operations["list_vital_signs_api_v1_vital_signs_get"];
        put?: never;
        /** Create Vital Sign */
        post: operations["create_vital_sign_api_v1_vital_signs_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/vital-signs/{vital_sign_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Vital Sign */
        get: operations["get_vital_sign_api_v1_vital_signs__vital_sign_id__get"];
        put?: never;
        post?: never;
        /** Delete Vital Sign */
        delete: operations["delete_vital_sign_api_v1_vital_signs__vital_sign_id__delete"];
        options?: never;
        head?: never;
        /** Update Vital Sign */
        patch: operations["update_vital_sign_api_v1_vital_signs__vital_sign_id__patch"];
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * ActionCondition
         * @description Condición de estado de una acción: conjunción (``all``) de predicados.
         *
         *     Sólo se soporta ``all`` (todos los predicados deben cumplirse). El permiso es una
         *     propiedad aparte (``permission`` en el registro) y nunca se expresa aquí. El backend
         *     sigue siendo la autoridad final: si el frontend no puede evaluar la condición, debe
         *     comportarse de forma conservadora.
         */
        ActionCondition: {
            /** All */
            all: components["schemas"]["ActionConditionPredicate"][];
        };
        /**
         * ActionConditionOperator
         * @description Operadores del DSL serializable de condiciones (``visible_when``/``enabled_when``).
         *
         *     Es un contrato de datos, no un lenguaje evaluable: nunca se publican expresiones,
         *     JavaScript, Python ni lambdas.
         * @enum {string}
         */
        ActionConditionOperator: "eq" | "neq" | "in" | "not_in" | "is_null" | "not_null";
        /**
         * ActionConditionPredicate
         * @description Predicado atómico: compara el campo ``field`` del item con ``value``.
         *
         *     ``value`` es escalar para ``eq``/``neq``, una lista para ``in``/``not_in`` y se
         *     omite para ``is_null``/``not_null``. La validez se comprueba al construir el
         *     predicado (en el registro de la acción), no al evaluarlo.
         */
        ActionConditionPredicate: {
            /** Field */
            field: string;
            operator: components["schemas"]["ActionConditionOperator"];
            /** Value */
            value?: unknown | null;
        };
        /** ActionConfirmation */
        ActionConfirmation: {
            /** Required */
            required: boolean;
            /** Title */
            title: string;
            /** Message */
            message: string;
            /** Confirm Label */
            confirm_label: string;
            /** Destructive */
            destructive: boolean;
        };
        /**
         * ActionInputSchema
         * @description Formulario declarado de entrada de una acción (B2).
         *
         *     Sólo se publica cuando la acción declara un ``input_schema`` (en vez de un cuerpo
         *     fijo). Reusa exactamente la misma proyección de formularios que ``create``/``update``:
         *     cada campo es un ``ResourceFormFieldCapability`` (label, tipo, widget, obligatoriedad
         *     y opciones). Nunca se serializan defaults, validadores ni la clase Python.
         */
        ActionInputSchema: {
            /** Fields */
            fields: components["schemas"]["ResourceFormFieldCapability"][];
        };
        /**
         * ActionRequestSpec
         * @description Cuerpo fijo declarado por backend para una acción.
         *
         *     El frontend envía exactamente ``fixed_body`` (o vacío si no hay request): no
         *     puede agregar, quitar ni modificar campos, ni reutilizar la acción para otro
         *     payload.
         */
        ActionRequestSpec: {
            /** Content Type */
            content_type: string;
            /** Fixed Body */
            fixed_body: {
                [key: string]: unknown;
            };
        };
        /**
         * ActionScope
         * @enum {string}
         */
        ActionScope: "resource" | "item";
        /**
         * ActionSuccessBehavior
         * @enum {string}
         */
        ActionSuccessBehavior: "refresh";
        /**
         * ActiveInactiveStatus
         * @description Estado reusable para catálogos simples activables.
         * @enum {string}
         */
        ActiveInactiveStatus: "active" | "inactive";
        /**
         * ActivityPoint
         * @description Actividad de un mes: consultas y citas en el periodo (``YYYY-MM``).
         */
        ActivityPoint: {
            /** Period */
            period: string;
            /** Consultations */
            consultations: number;
            /** Appointments */
            appointments: number;
        };
        /**
         * AgeRangeCriterion
         * @description Rango de edad (años cumplidos) calculado desde la fecha de nacimiento.
         *
         *     Requiere al menos uno de ``min_age``/``max_age``. Ambos límites son inclusivos.
         */
        AgeRangeCriterion: {
            /** Min Age */
            min_age?: number | null;
            /** Max Age */
            max_age?: number | null;
        };
        /**
         * AgentMemoryCreate
         * @description Alta de una memoria del agente del usuario autenticado.
         *
         *     ``content`` es el contenido EN CLARO (entrada): se cifra antes de guardar. La
         *     auditoría y el soft-delete los gobierna el servidor.
         */
        AgentMemoryCreate: {
            /** Título */
            title: string;
            /**
             * Contenido
             * @description Contenido de la memoria (puede ser clínico sensible).
             */
            content: string;
            /**
             * Tipo
             * @default nota
             */
            kind: components["schemas"]["AgentMemoryKind"];
            /** Paciente relacionado */
            patient_id?: string | null;
            /** Consulta relacionada */
            consultation_id?: string | null;
        };
        /**
         * AgentMemoryKind
         * @description Tipo de memoria persistente que el agente acumula para el usuario médico.
         * @enum {string}
         */
        AgentMemoryKind: "nota" | "preferencia" | "hecho_clinico" | "recordatorio";
        /**
         * AgentMemoryRead
         * @description Representación de una memoria para su DUEÑO: incluye el ``content`` descifrado.
         *
         *     A diferencia de las API keys, es la propia memoria del usuario, así que el dueño sí
         *     recibe el contenido en claro. NUNCA se devuelve a otro usuario (las rutas son
         *     owner-only y filtran por dueño).
         */
        AgentMemoryRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Title */
            title: string;
            /** Content */
            content: string;
            kind: components["schemas"]["AgentMemoryKind"];
            /** Patient Id */
            patient_id?: string | null;
            /** Consultation Id */
            consultation_id?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * AgentMemoryUpdate
         * @description Actualización parcial de una memoria (owner-only).
         *
         *     Solo se aplican los campos enviados. ``content`` (si viene) reemplaza y recifra el
         *     contenido. ``user_id`` es inmutable (no se declara).
         */
        AgentMemoryUpdate: {
            /** Title */
            title?: string | null;
            /** Content */
            content?: string | null;
            kind?: components["schemas"]["AgentMemoryKind"] | null;
            /** Patient Id */
            patient_id?: string | null;
            /** Consultation Id */
            consultation_id?: string | null;
        };
        /**
         * AgentPersonaRead
         * @description Persona del copiloto para su dueño (config en claro, owner-only).
         */
        AgentPersonaRead: {
            /** Tone */
            tone?: string | null;
            /** Specialty Focus */
            specialty_focus?: string | null;
            /** Language Locale */
            language_locale?: string | null;
            /** Consultation Style */
            consultation_style?: string | null;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * AgentPersonaUpdate
         * @description Actualización (upsert) de la persona del copiloto del usuario autenticado.
         *
         *     Todos los campos son opcionales: se aplican solo los enviados. Es config NO
         *     secreta (tono/especialidad/idioma/estilo); la capa de seguridad clínica es fija
         *     y NO se declara aquí (la posee el código).
         */
        AgentPersonaUpdate: {
            /** Tono */
            tone?: string | null;
            /** Enfoque de especialidad */
            specialty_focus?: string | null;
            /** Idioma / locale */
            language_locale?: string | null;
            /** Estilo de consulta */
            consultation_style?: string | null;
        };
        /**
         * AgentTemplate
         * @description Una plantilla registrada que el agente puede proponer abrir (con prellenado).
         */
        AgentTemplate: {
            /**
             * Id
             * @description Id estable de la plantilla (= nombre del recurso del registry, p. ej. 'patients').
             */
            id: string;
            /**
             * Label
             * @description Etiqueta legible en español.
             */
            label: string;
            /**
             * Resource
             * @description Recurso del registry al que mapea la plantilla.
             */
            resource: string;
            /**
             * Modes
             * @description Modos de apertura permitidos al usuario: create | edit | review.
             */
            modes?: string[];
            /** @description Contrato de prellenado de la plantilla. */
            prefill: components["schemas"]["AgentTemplatePrefill"];
            /**
             * Actions
             * @description Acciones permitidas (filtradas por el RBAC del usuario).
             */
            actions?: string[];
            /**
             * Create Path
             * @description Ruta de creación (POST) cuando el modo create está permitido.
             */
            create_path?: string | null;
            /**
             * Detail Path
             * @description Plantilla de ruta de detalle (GET) cuando el modo review está permitido.
             */
            detail_path?: string | null;
        };
        /**
         * AgentTemplatePrefill
         * @description Contrato de prellenado: qué campos acepta el agente sugerir y cuáles confirmar.
         *
         *     Derivado del esquema de creación/edición ya declarado (los campos del formulario). El médico
         *     SIEMPRE revisa y aprueba; ``fields_requiring_confirmation`` son los obligatorios que no pueden
         *     quedar vacíos al guardar.
         */
        AgentTemplatePrefill: {
            /**
             * Prefillable Fields
             * @description Campos cuyo valor puede sugerir el agente (se prellenan para revisión).
             */
            prefillable_fields?: string[];
            /**
             * Fields Requiring Confirmation
             * @description Campos obligatorios que el médico debe confirmar antes de guardar.
             */
            fields_requiring_confirmation?: string[];
        };
        /**
         * AiCredentialType
         * @description Tipo de credencial de proveedor de IA almacenada por el usuario.
         *
         *     ``api_key`` guarda un secreto estático (API key). ``oauth`` guarda un perfil
         *     OAuth cifrado {access, refresh, expires, account_id} obtenido por el flujo
         *     browser-callback PKCE (p. ej. ChatGPT Plus/Codex).
         * @enum {string}
         */
        AiCredentialType: "api_key" | "oauth";
        /**
         * AiProvider
         * @description Proveedor de IA de una credencial registrada por el usuario.
         * @enum {string}
         */
        AiProvider: "opencode_zen" | "opencode_go" | "openai" | "anthropic" | "gemini" | "openrouter" | "ollama";
        /**
         * AiProviderCredentialCreate
         * @description Alta de una credencial de proveedor de IA del usuario autenticado.
         *
         *     ``secret`` es el secreto EN CLARO (entrada): se cifra antes de guardar y nunca
         *     se devuelve. La auditoría y el soft-delete los gobierna el servidor.
         */
        AiProviderCredentialCreate: {
            /** Proveedor */
            provider: components["schemas"]["AiProvider"];
            /** Etiqueta */
            label: string;
            /**
             * Secreto
             * @description Secreto del proveedor (solo entrada).
             */
            secret: string;
            /** Modelo por defecto */
            default_model?: string | null;
        };
        /**
         * AiProviderCredentialRead
         * @description Representación pública de una credencial. NUNCA expone el secreto en claro.
         */
        AiProviderCredentialRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            provider: components["schemas"]["AiProvider"];
            credential_type: components["schemas"]["AiCredentialType"];
            /** Label */
            label: string;
            /** Is Active */
            is_active: boolean;
            /** Default Model */
            default_model?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * AiProviderCredentialUpdate
         * @description Actualización parcial de una credencial (owner-only).
         *
         *     Solo se aplican los campos enviados. ``secret`` (si viene) reemplaza y recifra
         *     el secreto; nunca se devuelve. ``provider`` es inmutable (no se declara).
         */
        AiProviderCredentialUpdate: {
            /** Label */
            label?: string | null;
            /** Secret */
            secret?: string | null;
            /** Default Model */
            default_model?: string | null;
            /** Is Active */
            is_active?: boolean | null;
        };
        /**
         * AppointmentCancel
         * @description Cuerpo de la cancelación: motivo opcional, no vacío si se envía.
         */
        AppointmentCancel: {
            /** Motivo de cancelación */
            reason?: string | null;
        };
        /**
         * AppointmentConfirm
         * @description Cuerpo de la confirmación: vacío por diseño.
         */
        AppointmentConfirm: Record<string, never>;
        /**
         * AppointmentCreate
         * @description Alta de una cita; siempre nace en ``pending``.
         *
         *     El estado, ``rescheduled_from_id``, la auditoría y el soft-delete los gobierna el
         *     servidor; no se aceptan.
         */
        AppointmentCreate: {
            /**
             * Paciente
             * Format: uuid
             * @description Paciente de la cita (inmutable).
             */
            patient_id: string;
            /**
             * Médico
             * Format: uuid
             */
            doctor_id: string;
            /**
             * Fecha y hora
             * Format: date-time
             */
            scheduled_at: string;
            /** Duración (min) */
            duration_minutes: number;
            /** Motivo */
            reason: string;
            /** Notas internas */
            internal_notes?: string | null;
        };
        /**
         * AppointmentListItem
         * @description Versión de listado compatible con ``ResourceQuery`` (sin notas internas).
         */
        AppointmentListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /**
             * Médico
             * Format: uuid
             */
            doctor_id: string;
            /**
             * Programada
             * Format: date-time
             */
            scheduled_at: string;
            /** Duración (min) */
            duration_minutes: number;
            /** Motivo */
            reason: string;
            /** Estado */
            status: components["schemas"]["AppointmentStatus"];
            /** Reprogramada de */
            rescheduled_from_id?: string | null;
            /**
             * Creada
             * Format: date-time
             */
            created_at: string;
            /** Actualizada */
            updated_at?: string | null;
        };
        /**
         * AppointmentNoShow
         * @description Cuerpo del marcado de inasistencia: vacío por diseño.
         */
        AppointmentNoShow: Record<string, never>;
        /**
         * AppointmentNoShowCriterion
         * @description Tuvo una cita marcada como inasistencia (``no_show``).
         *
         *     La ventana de fechas, opcional, se aplica sobre ``scheduled_at`` de forma
         *     inclusiva.
         */
        AppointmentNoShowCriterion: {
            /** Date From */
            date_from?: string | null;
            /** Date To */
            date_to?: string | null;
        };
        /**
         * AppointmentRead
         * @description Representación completa de una cita médica.
         */
        AppointmentRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /**
             * Doctor Id
             * Format: uuid
             */
            doctor_id: string;
            /**
             * Scheduled At
             * Format: date-time
             */
            scheduled_at: string;
            /** Duration Minutes */
            duration_minutes: number;
            /** Reason */
            reason: string;
            /** Internal Notes */
            internal_notes?: string | null;
            status: components["schemas"]["AppointmentStatus"];
            /** Rescheduled From Id */
            rescheduled_from_id?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * AppointmentReschedule
         * @description Cuerpo de la reprogramación.
         *
         *     El paciente se conserva (no se acepta ``patient_id``). ``doctor_id``,
         *     ``scheduled_at``, ``duration_minutes``, ``reason`` e ``internal_notes`` se heredan
         *     de la cita original cuando no se envían (semántica de PATCH).
         */
        AppointmentReschedule: {
            /** Médico */
            doctor_id?: string | null;
            /** Fecha y hora */
            scheduled_at?: string | null;
            /** Duración (min) */
            duration_minutes?: number | null;
            /** Motivo */
            reason?: string | null;
            /** Notas internas */
            internal_notes?: string | null;
        };
        /**
         * AppointmentStatus
         * @description Estado operativo de una cita médica.
         * @enum {string}
         */
        AppointmentStatus: "pending" | "confirmed" | "attended" | "cancelled" | "rescheduled" | "no_show";
        /**
         * AppointmentUpdate
         * @description Edición parcial (PATCH), permitida sólo sobre citas ``pending`` o ``confirmed``.
         *
         *     ``patient_id``, ``status``, ``rescheduled_from_id``, la auditoría y el borrado no
         *     se declaran aquí: enviarlos da 422 (extra forbid).
         */
        AppointmentUpdate: {
            /** Médico */
            doctor_id?: string | null;
            /** Fecha y hora */
            scheduled_at?: string | null;
            /** Duración (min) */
            duration_minutes?: number | null;
            /** Motivo */
            reason?: string | null;
            /** Notas internas */
            internal_notes?: string | null;
        };
        /**
         * AttendanceReport
         * @description Resultados de citas en una ventana: asistencia vs inasistencia vs cancelación.
         *
         *     Las tasas son fracciones (0..1) sobre el total de citas resueltas
         *     (``attended + no_show + cancelled``); 0 cuando no hay citas resueltas.
         */
        AttendanceReport: {
            /** Attended */
            attended: number;
            /** No Show */
            no_show: number;
            /** Cancelled */
            cancelled: number;
            /** Total */
            total: number;
            /** Attended Rate */
            attended_rate: number;
            /** No Show Rate */
            no_show_rate: number;
            /** Cancelled Rate */
            cancelled_rate: number;
        };
        /**
         * AuditEventListItem
         * @description Versión de listado compatible con ``ResourceQuery``.
         *
         *     Sólo campos factuales de la bitácora. ``changed_fields`` no se proyecta en el
         *     listado (puede ser voluminoso y contener detalle sensible); se ve en el detalle.
         */
        AuditEventListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Fecha y hora
             * Format: date-time
             */
            occurred_at: string;
            /** Acción */
            action: string;
            /** Tipo de entidad */
            entity_type: string;
            /**
             * Entidad
             * Format: uuid
             */
            entity_id: string;
            /** Usuario */
            actor_user_id?: string | null;
            /** Motivo */
            reason?: string | null;
        };
        /**
         * AuditEventRead
         * @description Representación completa de un evento de auditoría (sólo lectura).
         */
        AuditEventRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Entity Type */
            entity_type: string;
            /**
             * Entity Id
             * Format: uuid
             */
            entity_id: string;
            /** Action */
            action: string;
            /** Actor User Id */
            actor_user_id?: string | null;
            /** Changed Fields */
            changed_fields?: {
                [key: string]: unknown;
            } | null;
            /** Reason */
            reason?: string | null;
            /**
             * Occurred At
             * Format: date-time
             */
            occurred_at: string;
        };
        /**
         * AuthPolicyRead
         * @description Política pública de auth que el frontend consume (no infiere de settings).
         */
        AuthPolicyRead: {
            /** Registration Enabled */
            registration_enabled: boolean;
            /** Password Reset Enabled */
            password_reset_enabled: boolean;
        };
        /** Body_upload_clinical_document_api_v1_clinical_documents_post */
        Body_upload_clinical_document_api_v1_clinical_documents_post: {
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            document_type: components["schemas"]["ClinicalDocumentType"];
            /** File */
            file: string;
            /** Consultation Id */
            consultation_id?: string | null;
            /** Document Date */
            document_date?: string | null;
            /** Description */
            description?: string | null;
        };
        /** BootstrapAdditionalRole */
        BootstrapAdditionalRole: {
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Permissions */
            permissions?: string[];
            /**
             * Assign To Initial User
             * @default false
             */
            assign_to_initial_user: boolean;
        };
        /** BootstrapCatalogRead */
        BootstrapCatalogRead: {
            /** Permission Groups */
            permission_groups: components["schemas"]["BootstrapPermissionGroupRead"][];
            limits: components["schemas"]["BootstrapLimitsRead"];
        };
        /** BootstrapInitialUser */
        BootstrapInitialUser: {
            /** Name */
            name: string;
            /** Last Name */
            last_name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Confirm Password
             * Format: password
             */
            confirm_password: string;
        };
        /** BootstrapInitializeRead */
        BootstrapInitializeRead: {
            /** Setup Complete */
            setup_complete: boolean;
        };
        /** BootstrapInitializeRequest */
        BootstrapInitializeRequest: {
            user: components["schemas"]["BootstrapInitialUser"];
            system_admin_role?: components["schemas"]["BootstrapSystemAdminRole"];
            /** Additional Roles */
            additional_roles?: components["schemas"]["BootstrapAdditionalRole"][];
        };
        /** BootstrapLimitsRead */
        BootstrapLimitsRead: {
            /** Max Additional Roles */
            max_additional_roles: number;
        };
        /** BootstrapPermissionGroupRead */
        BootstrapPermissionGroupRead: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Permissions */
            permissions: components["schemas"]["BootstrapPermissionRead"][];
        };
        /** BootstrapPermissionRead */
        BootstrapPermissionRead: {
            /** Access */
            access: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
        };
        /** BootstrapStatusRead */
        BootstrapStatusRead: {
            /** Setup Required */
            setup_required: boolean;
            /** Token Required */
            token_required: boolean;
        };
        /** BootstrapSystemAdminRole */
        BootstrapSystemAdminRole: {
            /**
             * Label
             * @default Administrador de plataforma
             */
            label: string;
            /**
             * Description
             * @default Administración inicial de la plataforma
             */
            description: string | null;
        };
        /**
         * ClinicalCodeCreate
         * @description Alta de un código clínico en el catálogo de apoyo.
         */
        ClinicalCodeCreate: {
            /** Sistema */
            system: components["schemas"]["ClinicalCodeSystem"];
            /** Código */
            code: string;
            /** Término */
            display_term: string;
            /** Código padre */
            parent_code?: string | null;
        };
        /**
         * ClinicalCodeListItem
         * @description Versión para listados (declara los campos filtrables/buscables).
         */
        ClinicalCodeListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Sistema */
            system: components["schemas"]["ClinicalCodeSystem"];
            /** Código */
            code: string;
            /** Término */
            display_term: string;
            /** Código padre */
            parent_code?: string | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * ClinicalCodeRead
         * @description Representación pública de un código clínico.
         */
        ClinicalCodeRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            system: components["schemas"]["ClinicalCodeSystem"];
            /** Code */
            code: string;
            /** Display Term */
            display_term: string;
            /** Parent Code */
            parent_code?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * ClinicalCodeSystem
         * @description Sistema de codificación clínica de un código del catálogo de apoyo.
         *
         *     ``cie10`` para diagnósticos (CIE-10/ICD-10 de la OMS), ``loinc`` para analitos y
         *     observaciones de laboratorio (LOINC) y ``atc`` para medicamentos (clasificación
         *     ATC de la OMS). La cobertura sembrada es LIMITADA y extensible.
         * @enum {string}
         */
        ClinicalCodeSystem: "cie10" | "loinc" | "atc";
        /**
         * ClinicalCodeUpdate
         * @description Actualización parcial de un código clínico (PATCH).
         */
        ClinicalCodeUpdate: {
            /** Término */
            display_term?: string | null;
            /** Código padre */
            parent_code?: string | null;
        };
        /**
         * ClinicalDocumentContentRead
         * @description Contenido EXTRAÍBLE de un documento para que el agente lo interprete (F-MEDIOS fase 1).
         *
         *     No incluye el binario crudo ni interpreta valores clínicos. ``content_kind`` indica cómo
         *     consumirlo: ``image`` (interpretar por visión vía ``download_url``), ``text`` (texto del
         *     PDF en ``text``; ``null`` si el PDF no tiene capa de texto extraíble) o ``unsupported``.
         *     ``notes`` guía al agente (incl. no inventar valores ilegibles).
         */
        ClinicalDocumentContentRead: {
            /**
             * Document Id
             * Format: uuid
             */
            document_id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /** Consultation Id */
            consultation_id?: string | null;
            document_type: components["schemas"]["ClinicalDocumentType"];
            /** Mime Type */
            mime_type: string;
            /**
             * Content Kind
             * @enum {string}
             */
            content_kind: "image" | "text" | "unsupported";
            /** Download Url */
            download_url: string;
            /** Text */
            text?: string | null;
            /**
             * Text Truncated
             * @default false
             */
            text_truncated: boolean;
            /** Notes */
            notes?: string | null;
        };
        /**
         * ClinicalDocumentListItem
         * @description Versión de listado compatible con ``ResourceQuery``: metadata segura, sin binario.
         */
        ClinicalDocumentListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /** Consulta */
            consultation_id?: string | null;
            /** Tipo */
            document_type: components["schemas"]["ClinicalDocumentType"];
            /** Estado */
            status: components["schemas"]["ClinicalDocumentStatus"];
            /** Archivo */
            original_filename: string;
            /** Tipo MIME */
            mime_type: string;
            /** Tamaño (bytes) */
            size_bytes: number;
            /** Fecha del documento */
            document_date?: string | null;
            /**
             * Cargado
             * Format: date-time
             */
            uploaded_at: string;
        };
        /**
         * ClinicalDocumentMetadataUpdate
         * @description Actualización parcial de **metadata** (PATCH). No reemplaza el archivo.
         *
         *     En v1 solo se editan ``document_type``, ``document_date`` y ``description``. El
         *     binario, el nombre original, el hash, el tamaño, el MIME, el estado y la auditoría
         *     los gobierna el servidor; enviarlos da 422 (extra forbid). Sustituir el archivo se
         *     hace cargando un documento nuevo, no sobrescribiendo bytes.
         */
        ClinicalDocumentMetadataUpdate: {
            /** Tipo */
            document_type?: components["schemas"]["ClinicalDocumentType"] | null;
            /** Fecha del documento */
            document_date?: string | null;
            /** Descripción */
            description?: string | null;
        };
        /**
         * ClinicalDocumentRead
         * @description Representación pública completa de un documento clínico: solo metadata segura.
         *
         *     No incluye ``file_content`` ni ninguna forma del binario. ``sha256`` se publica como
         *     huella de integridad; no es un control de autorización.
         */
        ClinicalDocumentRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /** Consultation Id */
            consultation_id?: string | null;
            document_type: components["schemas"]["ClinicalDocumentType"];
            status: components["schemas"]["ClinicalDocumentStatus"];
            /** Original Filename */
            original_filename: string;
            /** Mime Type */
            mime_type: string;
            /** Size Bytes */
            size_bytes: number;
            /** Sha256 */
            sha256: string;
            /** Document Date */
            document_date?: string | null;
            /** Description */
            description?: string | null;
            /**
             * Uploaded At
             * Format: date-time
             */
            uploaded_at: string;
            /** Uploaded By */
            uploaded_by?: string | null;
            /** Updated At */
            updated_at?: string | null;
            /** Updated By */
            updated_by?: string | null;
            /** Deleted At */
            deleted_at?: string | null;
            /** Deleted By */
            deleted_by?: string | null;
        };
        /**
         * ClinicalDocumentStatus
         * @description Estado operativo de un archivo clínico.
         * @enum {string}
         */
        ClinicalDocumentStatus: "active" | "archived" | "deleted";
        /**
         * ClinicalDocumentTranscriptRead
         * @description Transcripción de un documento de AUDIO para que el agente la use (F-MEDIOS fase 2).
         *
         *     La transcripción es un BORRADOR NO CONFIABLE que el médico revisa. ``available`` indica
         *     si hubo un proveedor STT configurado y respondió; si es ``false``, ``transcript`` es
         *     ``null`` y ``notes`` explica el motivo (p. ej. "no disponible"). El servidor devuelve
         *     EXACTAMENTE lo que el proveedor entrega: no inventa ni "mejora" texto. ``provider``
         *     etiqueta la procedencia (incl. el stub de prueba).
         */
        ClinicalDocumentTranscriptRead: {
            /**
             * Document Id
             * Format: uuid
             */
            document_id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            document_type: components["schemas"]["ClinicalDocumentType"];
            /** Mime Type */
            mime_type: string;
            /** Available */
            available: boolean;
            /** Transcript */
            transcript?: string | null;
            /** Provider */
            provider?: string | null;
            /** Notes */
            notes?: string | null;
        };
        /**
         * ClinicalDocumentType
         * @description Tipo de archivo clínico asociado al expediente del paciente.
         * @enum {string}
         */
        ClinicalDocumentType: "laboratory" | "study" | "image" | "pdf" | "external_prescription" | "clinical_photography" | "consent" | "reference" | "audio" | "other";
        /**
         * ClinicalDocumentUploadResponse
         * @description Respuesta de la carga (POST multipart). Misma metadata segura que la lectura;
         *     nombre distinto para dejar explícito en el contrato que es el resultado de un
         *     upload (nunca devuelve el binario).
         */
        ClinicalDocumentUploadResponse: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /** Consultation Id */
            consultation_id?: string | null;
            document_type: components["schemas"]["ClinicalDocumentType"];
            status: components["schemas"]["ClinicalDocumentStatus"];
            /** Original Filename */
            original_filename: string;
            /** Mime Type */
            mime_type: string;
            /** Size Bytes */
            size_bytes: number;
            /** Sha256 */
            sha256: string;
            /** Document Date */
            document_date?: string | null;
            /** Description */
            description?: string | null;
            /**
             * Uploaded At
             * Format: date-time
             */
            uploaded_at: string;
            /** Uploaded By */
            uploaded_by?: string | null;
            /** Updated At */
            updated_at?: string | null;
            /** Updated By */
            updated_by?: string | null;
            /** Deleted At */
            deleted_at?: string | null;
            /** Deleted By */
            deleted_by?: string | null;
        };
        /**
         * ClinicalEventCreate
         * @description Registro de un evento clínico en la línea de tiempo del paciente.
         *
         *     Registrar un evento es una ESCRITURA clínica: el médico aprueba el payload
         *     exacto (protocolo P1 en el copiloto). La auditoría y el borrado los gobierna el
         *     servidor; no se aceptan como entrada.
         */
        ClinicalEventCreate: {
            /**
             * Paciente
             * Format: uuid
             * @description Paciente al que pertenece el evento.
             */
            patient_id: string;
            /** Tipo de evento */
            event_type: components["schemas"]["ClinicalEventType"];
            /** Título */
            title: string;
            /** Descripción */
            description?: string | null;
            /** Inicio */
            started_at?: string | null;
            /** Fin */
            ended_at?: string | null;
            /** Severidad */
            severity?: components["schemas"]["ClinicalSeverity"] | null;
            /** Especialidad */
            specialty?: string | null;
            /** Destino */
            destination?: string | null;
            /** Estado */
            status?: components["schemas"]["ClinicalEventStatus"] | null;
        };
        /**
         * ClinicalEventListItem
         * @description Versión de listado de un evento clínico.
         *
         *     Declara los campos de filtro (``patient_id``, ``event_type``, ``status``,
         *     ``started_at``) que el motor de query exige presentes en el schema de listado.
         */
        ClinicalEventListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /** Tipo */
            event_type: components["schemas"]["ClinicalEventType"];
            /** Título */
            title: string;
            /**
             * Inicio
             * Format: date-time
             */
            started_at: string;
            /** Fin */
            ended_at?: string | null;
            /** Severidad */
            severity?: components["schemas"]["ClinicalSeverity"] | null;
            /** Especialidad */
            specialty?: string | null;
            /** Destino */
            destination?: string | null;
            /** Estado */
            status?: components["schemas"]["ClinicalEventStatus"] | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * ClinicalEventRead
         * @description Representación pública completa de un evento clínico.
         */
        ClinicalEventRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            event_type: components["schemas"]["ClinicalEventType"];
            /** Title */
            title: string;
            /** Description */
            description?: string | null;
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            /** Ended At */
            ended_at?: string | null;
            severity?: components["schemas"]["ClinicalSeverity"] | null;
            /** Specialty */
            specialty?: string | null;
            /** Destination */
            destination?: string | null;
            status?: components["schemas"]["ClinicalEventStatus"] | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * ClinicalEventStatus
         * @description Estado de un evento clínico.
         * @enum {string}
         */
        ClinicalEventStatus: "active" | "resolved" | "cancelled";
        /**
         * ClinicalEventType
         * @description Tipo de evento clínico de la línea de tiempo del paciente.
         * @enum {string}
         */
        ClinicalEventType: "hospitalization" | "emergency" | "referral" | "procedure" | "other";
        /**
         * ClinicalEventUpdate
         * @description Edición parcial de un evento (PATCH).
         *
         *     ``patient_id``, la auditoría y el borrado no se declaran aquí: enviarlos da 422.
         */
        ClinicalEventUpdate: {
            /** Tipo de evento */
            event_type?: components["schemas"]["ClinicalEventType"] | null;
            /** Título */
            title?: string | null;
            /** Descripción */
            description?: string | null;
            /** Inicio */
            started_at?: string | null;
            /** Fin */
            ended_at?: string | null;
            /** Severidad */
            severity?: components["schemas"]["ClinicalSeverity"] | null;
            /** Especialidad */
            specialty?: string | null;
            /** Destino */
            destination?: string | null;
            /** Estado */
            status?: components["schemas"]["ClinicalEventStatus"] | null;
        };
        /**
         * ClinicalItemStatus
         * @description Estado reusable para datos clínicos importantes del paciente.
         * @enum {string}
         */
        ClinicalItemStatus: "active" | "inactive" | "resolved" | "suspended";
        /**
         * ClinicalNoteCreate
         * @description Alta de una nota SOAP (borrador que el médico aprueba, P1).
         *
         *     Sólo se aceptan ``consultation_id`` y las cuatro secciones: el servidor deriva el
         *     paciente de la consulta y fija ``status='draft'``. Enviar patient_id/status da 422
         *     (extra forbid). Debe traer al menos una sección con contenido.
         */
        ClinicalNoteCreate: {
            /**
             * Consulta
             * Format: uuid
             * @description Consulta de la que se compone la nota.
             */
            consultation_id: string;
            /** S — Subjetivo */
            subjective?: string | null;
            /** O — Objetivo */
            objective?: string | null;
            /** A — Análisis */
            assessment?: string | null;
            /** P — Plan */
            plan?: string | null;
        };
        /**
         * ClinicalNoteKind
         * @description Tipo de documento clínico estructurado almacenado como ``ClinicalNote``.
         *
         *     ``nota_soap`` es la nota SOAP (fase 1); ``constancia`` es la constancia/justificante de
         *     asistencia; ``incapacidad`` es el justificante de reposo laboral; ``referencia`` es la carta
         *     de referencia a otra unidad/especialidad y ``contrarreferencia`` la respuesta de vuelta a la
         *     unidad que refirió. Todos se componen de datos REALES de la consulta y se guardan como
         *     borrador (nunca autofirmados).
         * @enum {string}
         */
        ClinicalNoteKind: "nota_soap" | "constancia" | "incapacidad" | "referencia" | "contrarreferencia";
        /**
         * ClinicalNoteListItem
         * @description Versión de listado.
         *
         *     Declara los campos de filtro (``patient_id``, ``consultation_id``, ``status``) que el
         *     motor de query exige presentes en el schema de listado.
         */
        ClinicalNoteListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /**
             * Consulta
             * Format: uuid
             */
            consultation_id: string;
            /** Tipo */
            kind: components["schemas"]["ClinicalNoteKind"];
            /** Estado */
            status: components["schemas"]["ClinicalNoteStatus"];
            /**
             * Creada
             * Format: date-time
             */
            created_at: string;
            /** Actualizada */
            updated_at?: string | null;
        };
        /**
         * ClinicalNoteRead
         * @description Representación pública completa de una nota (incluye render Markdown).
         */
        ClinicalNoteRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /**
             * Consultation Id
             * Format: uuid
             */
            consultation_id: string;
            kind: components["schemas"]["ClinicalNoteKind"];
            /** Subjective */
            subjective?: string | null;
            /** Objective */
            objective?: string | null;
            /** Assessment */
            assessment?: string | null;
            /** Plan */
            plan?: string | null;
            /** Details */
            details?: {
                [key: string]: unknown;
            } | null;
            status: components["schemas"]["ClinicalNoteStatus"];
            /** Content Markdown */
            content_markdown: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * ClinicalNoteStatus
         * @description Estado de una nota clínica estructurada (p. ej. nota SOAP).
         *
         *     Una nota se compone a partir de los datos REALES de la consulta y se guarda como
         *     ``draft``; NUNCA se finaliza de forma autónoma. El médico la aprueba (``approved``).
         * @enum {string}
         */
        ClinicalNoteStatus: "draft" | "approved";
        /**
         * ClinicalNoteUpdate
         * @description Edición parcial de las secciones de la nota (PATCH).
         *
         *     ``consultation_id``, ``status`` y la auditoría no se declaran: enviarlos da 422.
         */
        ClinicalNoteUpdate: {
            /** S — Subjetivo */
            subjective?: string | null;
            /** O — Objetivo */
            objective?: string | null;
            /** A — Análisis */
            assessment?: string | null;
            /** P — Plan */
            plan?: string | null;
        };
        /**
         * ClinicalSeverity
         * @description Severidad clínica reusable cuando aplica a un dato del paciente.
         * @enum {string}
         */
        ClinicalSeverity: "low" | "moderate" | "high" | "critical";
        /**
         * ClinicalTaskCreate
         * @description Creación de una tarea clínica de seguimiento.
         *
         *     ``owner_id`` es opcional: si se omite, el servidor asigna al usuario actual como
         *     dueño. Crear una tarea es una ESCRITURA: en el copiloto pasa por el protocolo de
         *     aprobación P1. La auditoría y el borrado los gobierna el servidor.
         */
        ClinicalTaskCreate: {
            /**
             * Responsable
             * @description Usuario dueño de la tarea; por defecto, el usuario actual.
             */
            owner_id?: string | null;
            /** Paciente */
            patient_id?: string | null;
            /** Título */
            title: string;
            /** Descripción */
            description?: string | null;
            /** Vencimiento */
            due_at?: string | null;
            /**
             * Prioridad
             * @default medium
             */
            priority: components["schemas"]["ClinicalTaskPriority"];
            /**
             * Estado
             * @default open
             */
            status: components["schemas"]["ClinicalTaskStatus"];
        };
        /**
         * ClinicalTaskListItem
         * @description Versión de listado de una tarea clínica.
         *
         *     Declara los campos de filtro (``owner_id``, ``patient_id``, ``status``,
         *     ``priority``, ``due_at``) que el motor de query exige presentes en el listado.
         */
        ClinicalTaskListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Responsable
             * Format: uuid
             */
            owner_id: string;
            /** Paciente */
            patient_id?: string | null;
            /** Título */
            title: string;
            /** Vencimiento */
            due_at?: string | null;
            /** Prioridad */
            priority: components["schemas"]["ClinicalTaskPriority"];
            /** Estado */
            status: components["schemas"]["ClinicalTaskStatus"];
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * ClinicalTaskPriority
         * @description Prioridad de una tarea clínica de seguimiento.
         * @enum {string}
         */
        ClinicalTaskPriority: "low" | "medium" | "high";
        /**
         * ClinicalTaskRead
         * @description Representación pública completa de una tarea clínica.
         */
        ClinicalTaskRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Owner Id
             * Format: uuid
             */
            owner_id: string;
            /** Patient Id */
            patient_id?: string | null;
            /** Title */
            title: string;
            /** Description */
            description?: string | null;
            /** Due At */
            due_at?: string | null;
            priority: components["schemas"]["ClinicalTaskPriority"];
            status: components["schemas"]["ClinicalTaskStatus"];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * ClinicalTaskStatus
         * @description Estado de una tarea clínica de seguimiento.
         * @enum {string}
         */
        ClinicalTaskStatus: "open" | "done" | "cancelled";
        /**
         * ClinicalTaskUpdate
         * @description Edición parcial de una tarea (PATCH). ``owner_id`` no es editable aquí.
         */
        ClinicalTaskUpdate: {
            /** Paciente */
            patient_id?: string | null;
            /** Título */
            title?: string | null;
            /** Descripción */
            description?: string | null;
            /** Vencimiento */
            due_at?: string | null;
            /** Prioridad */
            priority?: components["schemas"]["ClinicalTaskPriority"] | null;
            /** Estado */
            status?: components["schemas"]["ClinicalTaskStatus"] | null;
        };
        /**
         * CohortCriteria
         * @description Criterios componibles (AND) de la consulta de cohorte.
         *
         *     Sin criterios, la cohorte abarca a todos los pacientes vigentes (no eliminados).
         *     ``limit``/``offset`` paginan únicamente la muestra; ``count`` siempre es el total.
         */
        CohortCriteria: {
            has_diagnosis?: components["schemas"]["HasDiagnosisCriterion"] | null;
            lab_abnormal?: components["schemas"]["LabAbnormalCriterion"] | null;
            vital_threshold?: components["schemas"]["VitalThresholdCriterion"] | null;
            pregnancy_status?: components["schemas"]["PregnancyStatus"] | null;
            age_range?: components["schemas"]["AgeRangeCriterion"] | null;
            appointment_no_show?: components["schemas"]["AppointmentNoShowCriterion"] | null;
            /**
             * Limit
             * @description Tamaño de la muestra.
             * @default 20
             */
            limit: number;
            /**
             * Offset
             * @description Desplazamiento de la muestra.
             * @default 0
             */
            offset: number;
        };
        /**
         * CohortPatient
         * @description Paciente de la muestra: mínimo identificable, sin PHI adicional.
         */
        CohortPatient: {
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /** Full Name */
            full_name: string;
        };
        /**
         * CohortResult
         * @description Resultado agregado: conteo total más una muestra paginada para revisión médica.
         */
        CohortResult: {
            /** Count */
            count: number;
            /** Sample */
            sample: components["schemas"]["CohortPatient"][];
        };
        /**
         * Comparator
         * @description Comparador numérico para un umbral de signo vital.
         * @enum {string}
         */
        Comparator: "gte" | "lte" | "gt" | "lt" | "eq";
        /**
         * ConnectionTicketRead
         * @description Ticket de conexión al Agent Gateway emitido a un usuario con sesión válida.
         *
         *     ``ticket`` es un JWT HS256 corto y firmado; ``expires_at`` es su vencimiento
         *     (UTC). No incluye datos clínicos, permisos ni secretos.
         */
        ConnectionTicketRead: {
            /** Ticket */
            ticket: string;
            /**
             * Expires At
             * Format: date-time
             */
            expires_at: string;
        };
        /**
         * ConsolidatedMedicationRead
         * @description Una entrada de la lista única de medicación activa.
         */
        ConsolidatedMedicationRead: {
            /**
             * Key
             * @description Clave de agrupación (ingrediente/clase o nombre normalizado).
             */
            key: string;
            /**
             * Display Name
             * @description Nombre legible del medicamento.
             */
            display_name: string;
            /**
             * Ingredient Or Class
             * @description Ingrediente o clase resuelto, si la fuente de farmacología lo dio.
             */
            ingredient_or_class?: string | null;
            /**
             * Resolver Status
             * @description Cómo se agrupó: por ingrediente/clase, por nombre, o sin fuente (no disponible).
             * @enum {string}
             */
            resolver_status: "resolved" | "name_only" | "no_disponible";
            /**
             * Prescribed Refs
             * @description Registros prescritos que aportan a esta entrada.
             */
            prescribed_refs?: string[];
            /**
             * Reported Refs
             * @description Registros reportados por el paciente para esta entrada.
             */
            reported_refs?: string[];
        };
        /**
         * ConsultationCreate
         * @description Alta de una consulta en borrador.
         *
         *     El estado, los datos de finalización, la auditoría y el soft-delete los gobierna
         *     el servidor. ``consulted_at`` es opcional: si no llega, el servidor usa ``now()``.
         */
        ConsultationCreate: {
            /**
             * Paciente
             * Format: uuid
             * @description Paciente atendido (inmutable tras la creación).
             */
            patient_id: string;
            /**
             * Médico tratante
             * Format: uuid
             */
            attending_doctor_id: string;
            /**
             * Cita de origen
             * @description Cita pending/confirmed que origina la consulta; se vincula sólo al crear y la marca como atendida. El paciente y el médico deben coincidir.
             */
            appointment_id?: string | null;
            /** Fecha de atención */
            consulted_at?: string | null;
            /** Motivo de consulta */
            reason_for_visit: string;
            /** Padecimiento actual */
            current_illness?: string | null;
            /** Interrogatorio */
            interrogation?: string | null;
            /** Exploración física */
            physical_examination?: string | null;
            /** Valoración clínica */
            clinical_assessment?: string | null;
            /** Tratamiento */
            treatment?: string | null;
            /** Indicaciones */
            instructions?: string | null;
            /** Pronóstico */
            prognosis?: string | null;
            /** Plan de seguimiento */
            follow_up_plan?: string | null;
            /** Próxima cita sugerida */
            next_appointment_at?: string | null;
            /** Observaciones */
            observations?: string | null;
        };
        /**
         * ConsultationDiagnosisCreate
         * @description Alta de un diagnóstico o impresión diagnóstica en una consulta.
         *
         *     El paciente y el médico se derivan de la consulta. El estado, la auditoría y el
         *     borrado los gobierna el servidor; no se aceptan.
         */
        ConsultationDiagnosisCreate: {
            /**
             * Consulta
             * Format: uuid
             * @description Consulta a la que pertenece el diagnóstico (inmutable).
             */
            consultation_id: string;
            /** Tipo */
            diagnosis_kind: components["schemas"]["ConsultationDiagnosisKind"];
            /**
             * Diagnóstico
             * @description Texto del diagnóstico o impresión diagnóstica.
             */
            diagnosis_text: string;
            /** Sistema de codificación */
            coding_system?: string | null;
            /** Código */
            code?: string | null;
            /**
             * Código clínico (catálogo)
             * @description Código clínico validado del catálogo (CIE-10), si se eligió uno.
             */
            clinical_code_id?: string | null;
            /** Notas */
            notes?: string | null;
        };
        /**
         * ConsultationDiagnosisKind
         * @description Tipo clínico de un diagnóstico o impresión diagnóstica de la consulta.
         * @enum {string}
         */
        ConsultationDiagnosisKind: "primary" | "secondary" | "suspected";
        /**
         * ConsultationDiagnosisListItem
         * @description Versión de listado compatible con ``ResourceQuery`` (sin ``notes``).
         */
        ConsultationDiagnosisListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Consulta
             * Format: uuid
             */
            consultation_id: string;
            /** Tipo */
            diagnosis_kind: components["schemas"]["ConsultationDiagnosisKind"];
            /** Diagnóstico */
            diagnosis_text: string;
            /** Sistema */
            coding_system?: string | null;
            /** Código */
            code?: string | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * ConsultationDiagnosisRead
         * @description Representación completa de un diagnóstico de consulta.
         */
        ConsultationDiagnosisRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Consultation Id
             * Format: uuid
             */
            consultation_id: string;
            diagnosis_kind: components["schemas"]["ConsultationDiagnosisKind"];
            /** Diagnosis Text */
            diagnosis_text: string;
            /** Coding System */
            coding_system?: string | null;
            /** Code */
            code?: string | null;
            /** Clinical Code Id */
            clinical_code_id?: string | null;
            /** Notes */
            notes?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * ConsultationDiagnosisUpdate
         * @description Edición parcial de un diagnóstico (PATCH), sólo si la consulta es draft.
         *
         *     ``consultation_id``, la auditoría y el borrado no se declaran aquí: enviarlos da
         *     422 (extra forbid).
         */
        ConsultationDiagnosisUpdate: {
            /** Tipo */
            diagnosis_kind?: components["schemas"]["ConsultationDiagnosisKind"] | null;
            /** Diagnóstico */
            diagnosis_text?: string | null;
            /** Sistema de codificación */
            coding_system?: string | null;
            /** Código */
            code?: string | null;
            /**
             * Código clínico (catálogo)
             * @description Código clínico validado del catálogo (CIE-10), si se eligió uno.
             */
            clinical_code_id?: string | null;
            /** Notas */
            notes?: string | null;
        };
        /**
         * ConsultationFinalize
         * @description Cuerpo de la finalización: vacío por diseño.
         *
         *     El médico se deriva del usuario autenticado; el cliente no envía ``doctor_id``,
         *     ``status``, ``finalized_by_doctor_id`` ni ``finalized_at``. ``extra="forbid"``
         *     rechaza cualquiera.
         */
        ConsultationFinalize: Record<string, never>;
        /**
         * ConsultationListItem
         * @description Versión de listado compatible con ``ResourceQuery`` (sin el cuerpo narrativo).
         */
        ConsultationListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /**
             * Médico tratante
             * Format: uuid
             */
            attending_doctor_id: string;
            /**
             * Atención
             * Format: date-time
             */
            consulted_at: string;
            /** Motivo */
            reason_for_visit: string;
            /** Estado */
            status: components["schemas"]["ConsultationStatus"];
            /** Finalizada por */
            finalized_by_doctor_id?: string | null;
            /** Finalizada */
            finalized_at?: string | null;
            /**
             * Creada
             * Format: date-time
             */
            created_at: string;
            /** Actualizada */
            updated_at?: string | null;
        };
        /**
         * ConsultationRead
         * @description Representación completa de una consulta médica.
         */
        ConsultationRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /**
             * Attending Doctor Id
             * Format: uuid
             */
            attending_doctor_id: string;
            /** Appointment Id */
            appointment_id?: string | null;
            /**
             * Consulted At
             * Format: date-time
             */
            consulted_at: string;
            /** Reason For Visit */
            reason_for_visit: string;
            /** Current Illness */
            current_illness?: string | null;
            /** Interrogation */
            interrogation?: string | null;
            /** Physical Examination */
            physical_examination?: string | null;
            /** Clinical Assessment */
            clinical_assessment?: string | null;
            /** Treatment */
            treatment?: string | null;
            /** Instructions */
            instructions?: string | null;
            /** Prognosis */
            prognosis?: string | null;
            /** Follow Up Plan */
            follow_up_plan?: string | null;
            /** Next Appointment At */
            next_appointment_at?: string | null;
            /** Observations */
            observations?: string | null;
            status: components["schemas"]["ConsultationStatus"];
            /** Finalized By Doctor Id */
            finalized_by_doctor_id?: string | null;
            /** Finalized At */
            finalized_at?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * ConsultationStatus
         * @description Estado clínico-operativo de una consulta médica.
         * @enum {string}
         */
        ConsultationStatus: "draft" | "finalized";
        /**
         * ConsultationUpdate
         * @description Edición parcial de un borrador (PATCH).
         *
         *     ``patient_id``, ``status``, los datos de finalización, la auditoría y el borrado
         *     no se declaran aquí: enviarlos da 422 (extra forbid).
         */
        ConsultationUpdate: {
            /** Médico tratante */
            attending_doctor_id?: string | null;
            /** Fecha de atención */
            consulted_at?: string | null;
            /** Motivo de consulta */
            reason_for_visit?: string | null;
            /** Padecimiento actual */
            current_illness?: string | null;
            /** Interrogatorio */
            interrogation?: string | null;
            /** Exploración física */
            physical_examination?: string | null;
            /** Valoración clínica */
            clinical_assessment?: string | null;
            /** Tratamiento */
            treatment?: string | null;
            /** Indicaciones */
            instructions?: string | null;
            /** Pronóstico */
            prognosis?: string | null;
            /** Plan de seguimiento */
            follow_up_plan?: string | null;
            /** Próxima cita sugerida */
            next_appointment_at?: string | null;
            /** Observaciones */
            observations?: string | null;
        };
        /**
         * CredentialLeaseRequest
         * @description Solicitud server-to-server de arriendo de credencial (endpoint interno).
         */
        CredentialLeaseRequest: {
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
            provider: components["schemas"]["AiProvider"];
        };
        /**
         * CredentialLeaseResponse
         * @description Arriendo de credencial: el ``secret`` es la API key DESCIFRADA, de vida corta.
         *
         *     Solo lo consume el Agent Gateway por el puente interno; nunca el navegador. El
         *     secreto nunca se loguea.
         */
        CredentialLeaseResponse: {
            /**
             * Lease Id
             * Format: uuid
             */
            lease_id: string;
            /** Secret */
            secret: string;
            /**
             * Expires At
             * Format: date-time
             */
            expires_at: string;
            /** Default Model */
            default_model?: string | null;
        };
        /**
         * DoctorCreate
         * @description Creación administrativa de un perfil médico.
         */
        DoctorCreate: {
            /**
             * Usuario
             * Format: uuid
             * @description Usuario al que pertenece este perfil médico (uno por usuario).
             */
            user_id: string;
            /** Nombre profesional */
            professional_name: string;
            /** Título profesional */
            professional_title?: string | null;
            /** Cédula profesional */
            professional_license_number: string;
            /** Especialidad */
            specialty?: string | null;
            /** Cédula de especialidad */
            specialty_license_number?: string | null;
            /** Teléfono profesional */
            professional_phone?: string | null;
            /** Correo profesional */
            professional_email?: string | null;
            /** Consultorio o clínica */
            clinic_name?: string | null;
            /** Dirección del consultorio */
            office_address?: string | null;
            /** Teléfono del consultorio */
            office_phone?: string | null;
            /** Pie de receta */
            prescription_footer?: string | null;
            /**
             * Estado
             * @default active
             */
            status: components["schemas"]["RecordStatus"];
        };
        /**
         * DoctorListItem
         * @description Versión de listado compatible con ``ResourceQuery``.
         */
        DoctorListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Nombre profesional */
            professional_name: string;
            /** Cédula */
            professional_license_number: string;
            /** Especialidad */
            specialty?: string | null;
            /** Estado */
            status: components["schemas"]["RecordStatus"];
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * DoctorRead
         * @description Representación completa de un perfil médico.
         */
        DoctorRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * User Id
             * Format: uuid
             */
            user_id: string;
            /** Professional Name */
            professional_name: string;
            /** Professional Title */
            professional_title?: string | null;
            /** Professional License Number */
            professional_license_number: string;
            /** Specialty */
            specialty?: string | null;
            /** Specialty License Number */
            specialty_license_number?: string | null;
            /** Professional Phone */
            professional_phone?: string | null;
            /** Professional Email */
            professional_email?: string | null;
            /** Clinic Name */
            clinic_name?: string | null;
            /** Office Address */
            office_address?: string | null;
            /** Office Phone */
            office_phone?: string | null;
            /** Prescription Footer */
            prescription_footer?: string | null;
            status: components["schemas"]["RecordStatus"];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * DoctorUpdate
         * @description Actualización parcial de un perfil médico (PATCH).
         *
         *     ``user_id`` es inmutable tras la creación: el vínculo con el usuario no se
         *     reasigna desde aquí.
         */
        DoctorUpdate: {
            /** Nombre profesional */
            professional_name?: string | null;
            /** Título profesional */
            professional_title?: string | null;
            /** Cédula profesional */
            professional_license_number?: string | null;
            /** Especialidad */
            specialty?: string | null;
            /** Cédula de especialidad */
            specialty_license_number?: string | null;
            /** Teléfono profesional */
            professional_phone?: string | null;
            /** Correo profesional */
            professional_email?: string | null;
            /** Consultorio o clínica */
            clinic_name?: string | null;
            /** Dirección del consultorio */
            office_address?: string | null;
            /** Teléfono del consultorio */
            office_phone?: string | null;
            /** Pie de receta */
            prescription_footer?: string | null;
            /** Estado */
            status?: components["schemas"]["RecordStatus"] | null;
        };
        /**
         * FamilyRelationship
         * @description Parentesco del familiar en un antecedente familiar (opcional).
         * @enum {string}
         */
        FamilyRelationship: "padre" | "madre" | "hermano" | "hermana" | "abuelo" | "abuela" | "hijo" | "hija" | "otro";
        /**
         * FieldValueType
         * @enum {string}
         */
        FieldValueType: "string" | "email" | "uuid" | "integer" | "decimal" | "boolean" | "date" | "time" | "datetime" | "enum" | "array";
        /**
         * FilterOperator
         * @enum {string}
         */
        FilterOperator: "eq" | "ne" | "contains" | "starts_with" | "ends_with" | "gte" | "lte" | "on" | "before" | "after" | "between" | "in" | "isnull";
        /**
         * FilterValueShape
         * @enum {string}
         */
        FilterValueShape: "single" | "range" | "multiple" | "none";
        /**
         * FilterableFieldCapability
         * @description Campo filtrable y los operadores que expone (contrato visible de filtros).
         *
         *     Fuente declarativa única: los operadores se derivan del plan compilado del recurso
         *     (``QueryOptions``/``field_operators``); el frontend no infiere parámetros ni sufijos.
         */
        FilterableFieldCapability: {
            /** Key */
            key: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
            value_type: components["schemas"]["FieldValueType"];
            /** Operators */
            operators: components["schemas"]["FilterableOperatorCapability"][];
        };
        /**
         * FilterableOperatorCapability
         * @description Un operador concreto que un campo expone como filtro visible.
         *
         *     ``parameter_name`` (operadores de un solo parámetro) y ``parameters`` (rango) son
         *     mutuamente excluyentes. ``value_shape`` indica cómo capturar el valor; ``widget``,
         *     cómo renderizarlo. Los flags opcionales describen la semántica que el frontend debe
         *     respetar pero no inferir (case-sensitivity, zona horaria de calendario, inclusión
         *     del extremo superior del rango, multiplicidad).
         */
        FilterableOperatorCapability: {
            key: components["schemas"]["FilterOperator"];
            /** Label */
            label: string;
            value_shape: components["schemas"]["FilterValueShape"];
            widget: components["schemas"]["WidgetType"];
            /** Parameter Name */
            parameter_name?: string | null;
            parameters?: components["schemas"]["FilterableRangeParameters"] | null;
            /** Case Sensitive */
            case_sensitive?: boolean | null;
            /** Calendar Timezone */
            calendar_timezone?: string | null;
            /** Range End Inclusive */
            range_end_inclusive?: boolean | null;
            /** Multiple */
            multiple?: boolean | null;
            /** Options */
            options?: components["schemas"]["ResourceFilterOption"][] | null;
            /** Max Values */
            max_values?: number | null;
            /** Placeholder */
            placeholder?: string | null;
        };
        /**
         * FilterableRangeParameters
         * @description Nombres de parámetro de los dos extremos de un operador de rango (``between``).
         */
        FilterableRangeParameters: {
            /** From */
            from: string;
            /** To */
            to: string;
        };
        /**
         * FollowUpSummaryResponse
         * @description Resumen de pendientes de seguimiento: tres grupos con su conteo y los registros citados.
         *
         *     Toda salida es para la REVISIÓN del médico; no es una acción ni una corrección automática.
         */
        FollowUpSummaryResponse: {
            /**
             * Generated At
             * Format: date-time
             */
            generated_at: string;
            /**
             * Appointment Lookback Days
             * @description Ventana (días) usada para las citas no asistidas/canceladas.
             */
            appointment_lookback_days: number;
            /** Pending Tasks Count */
            pending_tasks_count: number;
            /** Pending Tasks */
            pending_tasks: components["schemas"]["PendingTaskRead"][];
            /** Missed Appointments Count */
            missed_appointments_count: number;
            /** Missed Appointments */
            missed_appointments: components["schemas"]["MissedAppointmentRead"][];
            /** Unreviewed Abnormal Labs Count */
            unreviewed_abnormal_labs_count: number;
            /** Unreviewed Abnormal Labs */
            unreviewed_abnormal_labs: components["schemas"]["UnreviewedAbnormalLabRead"][];
        };
        /** ForgotPasswordRequest */
        ForgotPasswordRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /**
         * FormTransport
         * @enum {string}
         */
        FormTransport: "json" | "multipart";
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /**
         * HasDiagnosisCriterion
         * @description Coincidencia por código o por texto sobre los diagnósticos de consulta.
         *
         *     Requiere al menos uno de los dos. Si se indican ambos, se exigen ambos (AND).
         *     El código se compara de forma exacta sin distinguir mayúsculas; el texto se
         *     compara como subcadena (ILIKE).
         */
        HasDiagnosisCriterion: {
            /** Code */
            code?: string | null;
            /** Text */
            text?: string | null;
        };
        /** HealthRead */
        HealthRead: {
            /**
             * Status
             * @constant
             */
            status: "ok";
        };
        /**
         * HttpMethod
         * @enum {string}
         */
        HttpMethod: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
        /**
         * ImmunizationRoute
         * @description Vía de administración de una vacuna (opcional).
         * @enum {string}
         */
        ImmunizationRoute: "intramuscular" | "subcutanea" | "intradermica" | "oral" | "intranasal";
        /**
         * ImmunizationStatus
         * @description Estado de registro de una inmunización.
         * @enum {string}
         */
        ImmunizationStatus: "aplicada" | "no_aplicada" | "contraindicada";
        /**
         * InstitutionalSettingCreate
         * @description Alta de una configuración institucional.
         */
        InstitutionalSettingCreate: {
            /** Key */
            key: string;
            category: components["schemas"]["SettingCategory"];
            /**
             * Value
             * @description Valor JSON; su forma depende de la categoría.
             */
            value: {
                [key: string]: unknown;
            };
            /** Description */
            description: string;
        };
        /**
         * InstitutionalSettingListItem
         * @description Versión para listados (declara todos los campos filtrables/buscables).
         */
        InstitutionalSettingListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Key */
            key: string;
            category: components["schemas"]["SettingCategory"];
            /** Value */
            value: {
                [key: string]: unknown;
            };
            /** Description */
            description: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * InstitutionalSettingRead
         * @description Representación pública de una configuración institucional.
         */
        InstitutionalSettingRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Key */
            key: string;
            category: components["schemas"]["SettingCategory"];
            /** Value */
            value: {
                [key: string]: unknown;
            };
            /** Description */
            description: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * InstitutionalSettingUpdate
         * @description Actualización parcial de una configuración institucional.
         */
        InstitutionalSettingUpdate: {
            /** Key */
            key?: string | null;
            category?: components["schemas"]["SettingCategory"] | null;
            /** Value */
            value?: {
                [key: string]: unknown;
            } | null;
            /** Description */
            description?: string | null;
        };
        /**
         * ItemReference
         * @description Referencia pública y estable de un item de listado.
         *
         *     No se llama ``primary_key`` ni expone bindings ORM: declara qué campo de cada
         *     item identifica el recurso (``field``), qué token usan las plantillas de URL
         *     (``placeholder``, p. ej. ``{id}``) y su tipo. El frontend nunca asume ``id``.
         */
        ItemReference: {
            /** Field */
            field: string;
            /** Placeholder */
            placeholder: string;
            type: components["schemas"]["FieldValueType"];
        };
        /**
         * LabAbnormalCriterion
         * @description Resultado de laboratorio anormal (low/high/critical) para un analito.
         *
         *     El analito se compara contra el nombre (subcadena) o el código (exacto). La
         *     ventana de fechas, opcional, se aplica sobre ``measured_at`` de forma inclusiva.
         */
        LabAbnormalCriterion: {
            /** Analyte */
            analyte: string;
            /** Date From */
            date_from?: string | null;
            /** Date To */
            date_to?: string | null;
        };
        /**
         * LabResultAbnormalFlag
         * @description Marca de anormalidad de un resultado de laboratorio/observación.
         *
         *     ``unknown`` cubre los resultados aún sin clasificar (p. ej. extraídos de un
         *     archivo sin rango de referencia). Los valores fuera de rango clínico son
         *     ``low``/``high``; ``critical`` señala un valor de alerta que exige revisión.
         * @enum {string}
         */
        LabResultAbnormalFlag: "normal" | "low" | "high" | "critical" | "unknown";
        /**
         * LabResultCreate
         * @description Registro de un resultado de laboratorio/observación estructurado.
         *
         *     Registrar un resultado es una ESCRITURA clínica: el médico aprueba el payload
         *     exacto (protocolo P1 en el copiloto). La auditoría, la revisión y el borrado
         *     los gobierna el servidor; no se aceptan como entrada.
         */
        LabResultCreate: {
            /**
             * Paciente
             * Format: uuid
             * @description Paciente al que pertenece el resultado.
             */
            patient_id: string;
            /**
             * Consulta
             * @description Consulta asociada, si aplica.
             */
            consultation_id?: string | null;
            /**
             * Documento de origen
             * @description Archivo clínico del que se extrajo el resultado, si aplica.
             */
            clinical_document_id?: string | null;
            /**
             * Analito o prueba
             * @description Nombre del analito o prueba (p. ej. 'HbA1c').
             */
            analyte_name: string;
            /** Código (LOINC) */
            analyte_code?: string | null;
            /** Valor numérico */
            value_numeric?: number | null;
            /** Valor cualitativo */
            value_text?: string | null;
            /** Unidad */
            unit?: string | null;
            /** Rango de referencia (mín.) */
            reference_range_low?: number | null;
            /** Rango de referencia (máx.) */
            reference_range_high?: number | null;
            /**
             * Marca de anormalidad
             * @default unknown
             */
            abnormal_flag: components["schemas"]["LabResultAbnormalFlag"];
            /** Fecha de medición */
            measured_at?: string | null;
            /** Laboratorio / fuente */
            source_name?: string | null;
            /** Método */
            method?: string | null;
        };
        /**
         * LabResultListItem
         * @description Versión de listado de un resultado de laboratorio.
         *
         *     Declara los campos de filtro (``patient_id``, ``consultation_id``,
         *     ``analyte_name``, ``abnormal_flag``, ``measured_at``) que el motor de query
         *     exige presentes en el schema de listado.
         */
        LabResultListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /** Consulta */
            consultation_id?: string | null;
            /** Analito */
            analyte_name: string;
            /** Código */
            analyte_code?: string | null;
            /** Valor */
            value_numeric?: number | null;
            /** Valor (texto) */
            value_text?: string | null;
            /** Unidad */
            unit?: string | null;
            /** Ref. mín. */
            reference_range_low?: number | null;
            /** Ref. máx. */
            reference_range_high?: number | null;
            /** Anormalidad */
            abnormal_flag: components["schemas"]["LabResultAbnormalFlag"];
            /**
             * Medición
             * Format: date-time
             */
            measured_at: string;
            /** Fuente */
            source_name?: string | null;
            /** Revisado */
            reviewed_at?: string | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * LabResultRead
         * @description Representación pública completa de un resultado de laboratorio.
         */
        LabResultRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /** Consultation Id */
            consultation_id?: string | null;
            /** Clinical Document Id */
            clinical_document_id?: string | null;
            /** Analyte Name */
            analyte_name: string;
            /** Analyte Code */
            analyte_code?: string | null;
            /** Value Numeric */
            value_numeric?: number | null;
            /** Value Text */
            value_text?: string | null;
            /** Unit */
            unit?: string | null;
            /** Reference Range Low */
            reference_range_low?: number | null;
            /** Reference Range High */
            reference_range_high?: number | null;
            abnormal_flag: components["schemas"]["LabResultAbnormalFlag"];
            /**
             * Measured At
             * Format: date-time
             */
            measured_at: string;
            /** Source Name */
            source_name?: string | null;
            /** Method */
            method?: string | null;
            /** Reviewed At */
            reviewed_at?: string | null;
            /** Reviewed By */
            reviewed_by?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * LabResultUpdate
         * @description Edición parcial de un resultado (PATCH).
         *
         *     ``patient_id``, la auditoría, la revisión y el borrado no se declaran aquí:
         *     enviarlos da 422 (extra forbid).
         */
        LabResultUpdate: {
            /** Consulta */
            consultation_id?: string | null;
            /** Documento de origen */
            clinical_document_id?: string | null;
            /** Analito o prueba */
            analyte_name?: string | null;
            /** Código (LOINC) */
            analyte_code?: string | null;
            /** Valor numérico */
            value_numeric?: number | null;
            /** Valor cualitativo */
            value_text?: string | null;
            /** Unidad */
            unit?: string | null;
            /** Rango de referencia (mín.) */
            reference_range_low?: number | null;
            /** Rango de referencia (máx.) */
            reference_range_high?: number | null;
            /** Marca de anormalidad */
            abnormal_flag?: components["schemas"]["LabResultAbnormalFlag"] | null;
            /** Fecha de medición */
            measured_at?: string | null;
            /** Laboratorio / fuente */
            source_name?: string | null;
            /** Método */
            method?: string | null;
        };
        /** LoginRequest */
        LoginRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Password
             * Format: password
             */
            password: string;
        };
        /**
         * MedicalCertificateCreate
         * @description Alta de una constancia/justificante de asistencia (borrador P1).
         *
         *     Sólo se acepta la consulta y un motivo opcional: el servidor toma de la consulta la
         *     identidad del paciente, la fecha de asistencia y el médico + cédula (snapshot), y fija
         *     ``kind='constancia'`` y ``status='draft'``. No inventa hechos de asistencia.
         */
        MedicalCertificateCreate: {
            /**
             * Consulta
             * Format: uuid
             * @description Consulta a la que asistió el paciente.
             */
            consultation_id: string;
            /**
             * Motivo
             * @description Motivo/diagnóstico a declarar, si aplica.
             */
            motivo?: string | null;
        };
        /**
         * MedicalHistoryVersionCreate
         * @description Alta de un borrador de historia clínica.
         *
         *     Sólo se aceptan ``patient_id`` y los campos narrativos. El servidor asigna
         *     ``version_number``, ``status`` y ``based_on_version_id``; cuando ya existe una
         *     versión vigente, su contenido se copia y estos campos se aplican encima.
         */
        MedicalHistoryVersionCreate: {
            /**
             * Paciente
             * Format: uuid
             * @description Paciente al que pertenece la historia clínica (inmutable).
             */
            patient_id: string;
            /** Antecedentes heredofamiliares */
            family_history?: string | null;
            /** Antecedentes personales patológicos */
            pathological_history?: string | null;
            /** Antecedentes personales no patológicos */
            non_pathological_history?: string | null;
            /** Cirugías previas */
            previous_surgeries?: string | null;
            /** Hospitalizaciones */
            hospitalizations?: string | null;
            /** Hábitos relevantes */
            relevant_habits?: string | null;
            /** Antecedentes gineco-obstétricos */
            gyneco_obstetric_history?: string | null;
            /** Observaciones clínicas */
            clinical_observations?: string | null;
        };
        /**
         * MedicalHistoryVersionFinalize
         * @description Cuerpo de la finalización: vacío por diseño.
         *
         *     El médico se deriva del usuario autenticado; el cliente no envía ``doctor_id``,
         *     ``status``, auditoría ni campos clínicos. ``extra="forbid"`` rechaza cualquiera.
         */
        MedicalHistoryVersionFinalize: Record<string, never>;
        /**
         * MedicalHistoryVersionListItem
         * @description Versión de listado compatible con ``ResourceQuery`` (sin campos narrativos).
         */
        MedicalHistoryVersionListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /** Versión */
            version_number: number;
            /** Estado */
            status: components["schemas"]["MedicalHistoryVersionStatus"];
            /** Basada en */
            based_on_version_id?: string | null;
            /** Revisada por */
            reviewed_by_doctor_id?: string | null;
            /** Revisada */
            reviewed_at?: string | null;
            /**
             * Creada
             * Format: date-time
             */
            created_at: string;
            /** Actualizada */
            updated_at?: string | null;
        };
        /**
         * MedicalHistoryVersionRead
         * @description Representación completa de una versión de historia clínica.
         */
        MedicalHistoryVersionRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /** Version Number */
            version_number: number;
            status: components["schemas"]["MedicalHistoryVersionStatus"];
            /** Based On Version Id */
            based_on_version_id?: string | null;
            /** Family History */
            family_history?: string | null;
            /** Pathological History */
            pathological_history?: string | null;
            /** Non Pathological History */
            non_pathological_history?: string | null;
            /** Previous Surgeries */
            previous_surgeries?: string | null;
            /** Hospitalizations */
            hospitalizations?: string | null;
            /** Relevant Habits */
            relevant_habits?: string | null;
            /** Gyneco Obstetric History */
            gyneco_obstetric_history?: string | null;
            /** Clinical Observations */
            clinical_observations?: string | null;
            /** Reviewed By Doctor Id */
            reviewed_by_doctor_id?: string | null;
            /** Reviewed At */
            reviewed_at?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * MedicalHistoryVersionStatus
         * @description Estado de una versión de historia clínica.
         * @enum {string}
         */
        MedicalHistoryVersionStatus: "draft" | "current" | "superseded";
        /**
         * MedicalHistoryVersionUpdate
         * @description Edición parcial de un borrador (PATCH).
         *
         *     Sólo procede mientras la versión sea ``draft``. ``patient_id``,
         *     ``version_number``, ``status``, ``based_on_version_id``, los datos de revisión,
         *     la auditoría y el borrado no se declaran aquí: enviarlos da 422 (extra forbid).
         */
        MedicalHistoryVersionUpdate: {
            /** Antecedentes heredofamiliares */
            family_history?: string | null;
            /** Antecedentes personales patológicos */
            pathological_history?: string | null;
            /** Antecedentes personales no patológicos */
            non_pathological_history?: string | null;
            /** Cirugías previas */
            previous_surgeries?: string | null;
            /** Hospitalizaciones */
            hospitalizations?: string | null;
            /** Hábitos relevantes */
            relevant_habits?: string | null;
            /** Antecedentes gineco-obstétricos */
            gyneco_obstetric_history?: string | null;
            /** Observaciones clínicas */
            clinical_observations?: string | null;
        };
        /**
         * MedicationReconciliationResponse
         * @description Resultado de la conciliación: lista consolidada + discrepancias.
         */
        MedicationReconciliationResponse: {
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /** Consolidated */
            consolidated: components["schemas"]["ConsolidatedMedicationRead"][];
            /** Flags */
            flags: components["schemas"]["ReconciliationFlagRead"][];
            /**
             * Flag Count
             * @description Número de discrepancias.
             */
            flag_count: number;
            /**
             * Resolver Available
             * @description Si la fuente de farmacología respondió (false -> emparejamiento por nombre).
             */
            resolver_available: boolean;
        };
        /**
         * MedicationTemplateCreate
         * @description Alta de una plantilla de medicamento frecuente de un médico.
         *
         *     ``use_count``, la auditoría y el soft-delete los gobierna el servidor; no se
         *     aceptan (``extra="forbid"``). ``status`` es el estado operativo del catálogo
         *     (activa/inactiva), distinto de la baja lógica.
         */
        MedicationTemplateCreate: {
            /**
             * Médico
             * Format: uuid
             * @description Médico propietario de la plantilla (inmutable tras la creación).
             */
            doctor_id: string;
            /** Medicamento */
            medication_name: string;
            /** Presentación */
            presentation?: string | null;
            /** Dosis sugerida */
            default_dose?: string | null;
            /** Frecuencia sugerida */
            default_frequency?: string | null;
            /** Duración sugerida */
            default_duration?: string | null;
            /** Indicaciones sugeridas */
            default_instructions?: string | null;
            /**
             * Estado
             * @default active
             */
            status: components["schemas"]["ActiveInactiveStatus"];
        };
        /**
         * MedicationTemplateListItem
         * @description Versión de listado compatible con ``ResourceQuery``.
         */
        MedicationTemplateListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Médico
             * Format: uuid
             */
            doctor_id: string;
            /** Medicamento */
            medication_name: string;
            /** Presentación */
            presentation?: string | null;
            /** Dosis */
            default_dose?: string | null;
            /** Frecuencia */
            default_frequency?: string | null;
            /** Duración */
            default_duration?: string | null;
            /** Indicaciones */
            default_instructions?: string | null;
            /** Usos */
            use_count: number;
            /** Estado */
            status: components["schemas"]["ActiveInactiveStatus"];
            /**
             * Creada
             * Format: date-time
             */
            created_at: string;
            /** Actualizada */
            updated_at?: string | null;
        };
        /**
         * MedicationTemplateRead
         * @description Representación completa de una plantilla de medicamento.
         */
        MedicationTemplateRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Doctor Id
             * Format: uuid
             */
            doctor_id: string;
            /** Medication Name */
            medication_name: string;
            /** Presentation */
            presentation?: string | null;
            /** Default Dose */
            default_dose?: string | null;
            /** Default Frequency */
            default_frequency?: string | null;
            /** Default Duration */
            default_duration?: string | null;
            /** Default Instructions */
            default_instructions?: string | null;
            /** Use Count */
            use_count: number;
            status: components["schemas"]["ActiveInactiveStatus"];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * MedicationTemplateUpdate
         * @description Edición parcial de una plantilla (PATCH).
         *
         *     ``doctor_id`` es inmutable tras la creación: el dueño de la plantilla no se
         *     reasigna desde aquí. ``use_count`` y los campos gobernados por el servidor no
         *     se declaran: enviarlos da 422 (extra forbid).
         */
        MedicationTemplateUpdate: {
            /** Medicamento */
            medication_name?: string | null;
            /** Presentación */
            presentation?: string | null;
            /** Dosis sugerida */
            default_dose?: string | null;
            /** Frecuencia sugerida */
            default_frequency?: string | null;
            /** Duración sugerida */
            default_duration?: string | null;
            /** Indicaciones sugeridas */
            default_instructions?: string | null;
            /** Estado */
            status?: components["schemas"]["ActiveInactiveStatus"] | null;
        };
        /** MessageResponse */
        MessageResponse: {
            /** Message */
            message: string;
        };
        /**
         * MissedAppointmentRead
         * @description Una cita reciente a la que el paciente no asistió (no_show) o que se canceló.
         */
        MissedAppointmentRead: {
            /**
             * Appointment Id
             * Format: uuid
             */
            appointment_id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /** Patient Label */
            patient_label?: string | null;
            /**
             * Doctor Id
             * Format: uuid
             */
            doctor_id: string;
            /**
             * Scheduled At
             * Format: date-time
             */
            scheduled_at: string;
            /**
             * Status
             * @enum {string}
             */
            status: "no_show" | "cancelled";
            /** Reason */
            reason: string;
        };
        /**
         * OAuthCompleteRequest
         * @description Callback del flujo OAuth: ``code`` y ``state`` recibidos del proveedor.
         */
        OAuthCompleteRequest: {
            /** Código de autorización */
            code: string;
            /** State */
            state: string;
        };
        /**
         * OAuthStartResponse
         * @description Inicio del flujo OAuth: URL de autorización y ``state`` anti-CSRF.
         *
         *     El navegador redirige a ``authorize_url``; al volver con el ``code`` debe enviar
         *     el mismo ``state`` a ``/complete``. No incluye el ``code_verifier`` (server-side).
         */
        OAuthStartResponse: {
            /** Authorize Url */
            authorize_url: string;
            /** State */
            state: string;
        };
        /**
         * OAuthStatusResponse
         * @description Estado de la conexión OAuth del usuario. NUNCA incluye tokens.
         */
        OAuthStatusResponse: {
            /** Connected */
            connected: boolean;
            /** Account Id */
            account_id?: string | null;
            /** Expires At */
            expires_at?: string | null;
        };
        /** OffsetPage[AppointmentListItem] */
        OffsetPage_AppointmentListItem_: {
            /** Items */
            items: components["schemas"]["AppointmentListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[AuditEventListItem] */
        OffsetPage_AuditEventListItem_: {
            /** Items */
            items: components["schemas"]["AuditEventListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[ClinicalCodeListItem] */
        OffsetPage_ClinicalCodeListItem_: {
            /** Items */
            items: components["schemas"]["ClinicalCodeListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[ClinicalDocumentListItem] */
        OffsetPage_ClinicalDocumentListItem_: {
            /** Items */
            items: components["schemas"]["ClinicalDocumentListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[ClinicalEventListItem] */
        OffsetPage_ClinicalEventListItem_: {
            /** Items */
            items: components["schemas"]["ClinicalEventListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[ClinicalNoteListItem] */
        OffsetPage_ClinicalNoteListItem_: {
            /** Items */
            items: components["schemas"]["ClinicalNoteListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[ClinicalTaskListItem] */
        OffsetPage_ClinicalTaskListItem_: {
            /** Items */
            items: components["schemas"]["ClinicalTaskListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[ConsultationDiagnosisListItem] */
        OffsetPage_ConsultationDiagnosisListItem_: {
            /** Items */
            items: components["schemas"]["ConsultationDiagnosisListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[ConsultationListItem] */
        OffsetPage_ConsultationListItem_: {
            /** Items */
            items: components["schemas"]["ConsultationListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[DoctorListItem] */
        OffsetPage_DoctorListItem_: {
            /** Items */
            items: components["schemas"]["DoctorListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[InstitutionalSettingListItem] */
        OffsetPage_InstitutionalSettingListItem_: {
            /** Items */
            items: components["schemas"]["InstitutionalSettingListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[LabResultListItem] */
        OffsetPage_LabResultListItem_: {
            /** Items */
            items: components["schemas"]["LabResultListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[MedicalHistoryVersionListItem] */
        OffsetPage_MedicalHistoryVersionListItem_: {
            /** Items */
            items: components["schemas"]["MedicalHistoryVersionListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[MedicationTemplateListItem] */
        OffsetPage_MedicationTemplateListItem_: {
            /** Items */
            items: components["schemas"]["MedicationTemplateListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[PatientClinicalItemListItem] */
        OffsetPage_PatientClinicalItemListItem_: {
            /** Items */
            items: components["schemas"]["PatientClinicalItemListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[PatientHistoryItemListItem] */
        OffsetPage_PatientHistoryItemListItem_: {
            /** Items */
            items: components["schemas"]["PatientHistoryItemListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[PatientImmunizationListItem] */
        OffsetPage_PatientImmunizationListItem_: {
            /** Items */
            items: components["schemas"]["PatientImmunizationListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[PatientListItem] */
        OffsetPage_PatientListItem_: {
            /** Items */
            items: components["schemas"]["PatientListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[PrescriptionItemListItem] */
        OffsetPage_PrescriptionItemListItem_: {
            /** Items */
            items: components["schemas"]["PrescriptionItemListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[PrescriptionListItem] */
        OffsetPage_PrescriptionListItem_: {
            /** Items */
            items: components["schemas"]["PrescriptionListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[RoleListItem] */
        OffsetPage_RoleListItem_: {
            /** Items */
            items: components["schemas"]["RoleListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[RoleRead] */
        OffsetPage_RoleRead_: {
            /** Items */
            items: components["schemas"]["RoleRead"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[ScaleResultListItem] */
        OffsetPage_ScaleResultListItem_: {
            /** Items */
            items: components["schemas"]["ScaleResultListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[StudyOrderListItem] */
        OffsetPage_StudyOrderListItem_: {
            /** Items */
            items: components["schemas"]["StudyOrderListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[UserAdminListItem] */
        OffsetPage_UserAdminListItem_: {
            /** Items */
            items: components["schemas"]["UserAdminListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPage[VitalSignListItem] */
        OffsetPage_VitalSignListItem_: {
            /** Items */
            items: components["schemas"]["VitalSignListItem"][];
            pagination: components["schemas"]["OffsetPagination"];
        };
        /** OffsetPagination */
        OffsetPagination: {
            /**
             * Limit
             * @default 20
             */
            limit: number;
            /**
             * Offset
             * @default 0
             */
            offset: number;
            /** Has Next */
            has_next: boolean;
            /** Total */
            total: number;
        };
        /**
         * OpenTemplateRequest
         * @description Lo que el agente PROPONE al abrir una plantilla (paso 3 de la UI híbrida).
         *
         *     Es una propuesta para PRELLENAR un formulario registrado; NO guarda nada. La plataforma valida
         *     contra el catálogo + RBAC, descarta campos que no existan en el esquema (no inventa) y deja que
         *     el médico revise/edite/apruebe por la ruta P1.
         */
        OpenTemplateRequest: {
            /**
             * Mode
             * @description Modo de apertura: create | edit | review.
             */
            mode: string;
            /**
             * Prefilled
             * @description Valores en los que el agente confía (se prellenan para revisión).
             */
            prefilled?: {
                [key: string]: unknown;
            };
            /**
             * Suggested
             * @description Valores de menor confianza (se muestran marcados como sugerencia).
             */
            suggested?: {
                [key: string]: unknown;
            };
            /**
             * Source Fragments
             * @description Fragmento de origen (transcripción/fuente) que respalda cada campo.
             */
            source_fragments?: {
                [key: string]: string;
            };
            /**
             * Source Overall
             * @description Fragmento de origen general que respalda la propuesta (trazabilidad).
             */
            source_overall?: string | null;
            /**
             * Allowed Actions
             * @description Acciones que el agente sugiere habilitar tras la revisión (se filtran por RBAC).
             */
            allowed_actions?: string[];
        };
        /**
         * OpenTemplateResolved
         * @description Plan resuelto y validado para abrir una plantilla PRELLENADA (read-only, nada guardado).
         *
         *     El frontend resuelve ``resource``/``mode`` al formulario registrado (capability) y lo renderiza
         *     con ``values`` como valores iniciales, marcando los campos sugeridos y a confirmar y mostrando
         *     los fragmentos de origen. La aceptación del médico se enruta por la ruta P1 existente.
         */
        OpenTemplateResolved: {
            /**
             * Template Id
             * @description Id de la plantilla (recurso del registry).
             */
            template_id: string;
            /**
             * Resource
             * @description Recurso destino.
             */
            resource: string;
            /**
             * Label
             * @description Etiqueta legible en español.
             */
            label: string;
            /**
             * Mode
             * @description Modo resuelto: create | edit | review.
             */
            mode: string;
            /**
             * Method
             * @description Método HTTP del envío tras aprobación (POST/PATCH/GET).
             */
            method: string;
            /**
             * Url Template
             * @description Ruta (o plantilla de ruta) del envío tras aprobación.
             */
            url_template: string;
            /**
             * Values
             * @description Valores aceptados (prefilled+suggested) SÓLO de campos del esquema.
             */
            values?: {
                [key: string]: unknown;
            };
            /**
             * Prefilled Fields
             * @description Campos prellenados (alta confianza).
             */
            prefilled_fields?: string[];
            /**
             * Suggested Fields
             * @description Campos sugeridos (menor confianza; a revisar).
             */
            suggested_fields?: string[];
            /**
             * Fields Requiring Confirmation
             * @description Campos obligatorios que el médico debe confirmar.
             */
            fields_requiring_confirmation?: string[];
            /**
             * Dropped Fields
             * @description Campos propuestos que NO existen en el esquema: se descartan (no se inventan).
             */
            dropped_fields?: string[];
            /**
             * Source Fragments
             * @description Fragmentos de origen, sólo de campos aceptados.
             */
            source_fragments?: {
                [key: string]: string;
            };
            /**
             * Source Overall
             * @description Fragmento de origen general (trazabilidad).
             */
            source_overall?: string | null;
            /**
             * Allowed Actions
             * @description Acciones permitidas tras la revisión (filtradas por RBAC).
             */
            allowed_actions?: string[];
        };
        /**
         * OptionsSourceType
         * @enum {string}
         */
        OptionsSourceType: "list" | "grouped_catalog";
        /** PaginationCapability */
        PaginationCapability: {
            /** Default Limit */
            default_limit: number;
            /** Max Limit */
            max_limit: number;
        };
        /**
         * PatientClinicalItemCreate
         * @description Alta de un dato clínico importante del resumen del paciente.
         *
         *     ``patient_id`` se fija en la creación y es inmutable después (no se edita por PATCH).
         */
        PatientClinicalItemCreate: {
            /**
             * Paciente
             * Format: uuid
             * @description Paciente al que pertenece el dato clínico (no se reasigna después).
             */
            patient_id: string;
            /** Tipo */
            item_type: components["schemas"]["PatientClinicalItemType"];
            /** Nombre */
            title: string;
            /**
             * Detalle
             * @description Reacción, dosis, frecuencia, descripción o contexto.
             */
            details?: string | null;
            /** Severidad */
            severity?: components["schemas"]["ClinicalSeverity"] | null;
            /**
             * Estado
             * @default active
             */
            status: components["schemas"]["ClinicalItemStatus"];
            /** Inicio */
            started_on?: string | null;
            /** Fin */
            ended_on?: string | null;
        };
        /**
         * PatientClinicalItemListItem
         * @description Versión de listado compatible con ``ResourceQuery``.
         */
        PatientClinicalItemListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /** Tipo */
            item_type: components["schemas"]["PatientClinicalItemType"];
            /** Nombre */
            title: string;
            /** Detalle */
            details?: string | null;
            /** Severidad */
            severity?: components["schemas"]["ClinicalSeverity"] | null;
            /** Estado */
            status: components["schemas"]["ClinicalItemStatus"];
            /** Inicio */
            started_on?: string | null;
            /** Fin */
            ended_on?: string | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * PatientClinicalItemRead
         * @description Representación completa de un dato clínico importante.
         */
        PatientClinicalItemRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            item_type: components["schemas"]["PatientClinicalItemType"];
            /** Title */
            title: string;
            /** Details */
            details?: string | null;
            severity?: components["schemas"]["ClinicalSeverity"] | null;
            status: components["schemas"]["ClinicalItemStatus"];
            /** Started On */
            started_on?: string | null;
            /** Ended On */
            ended_on?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * PatientClinicalItemType
         * @description Tipo de dato clínico importante del resumen del paciente.
         * @enum {string}
         */
        PatientClinicalItemType: "allergy" | "chronic_condition" | "current_medication" | "relevant_habit" | "clinical_alert" | "other";
        /**
         * PatientClinicalItemUpdate
         * @description Actualización parcial de un dato clínico (PATCH).
         *
         *     ``patient_id`` es inmutable: no se declara aquí, por lo que enviarlo da 422
         *     (``extra="forbid"``). La auditoría tampoco es editable desde el cliente.
         */
        PatientClinicalItemUpdate: {
            /** Tipo */
            item_type?: components["schemas"]["PatientClinicalItemType"] | null;
            /** Nombre */
            title?: string | null;
            /** Detalle */
            details?: string | null;
            /** Severidad */
            severity?: components["schemas"]["ClinicalSeverity"] | null;
            /** Estado */
            status?: components["schemas"]["ClinicalItemStatus"] | null;
            /** Inicio */
            started_on?: string | null;
            /** Fin */
            ended_on?: string | null;
        };
        /**
         * PatientCreate
         * @description Alta administrativa de un paciente.
         *
         *     ``record_number`` lo genera la base de datos; no se acepta desde el cliente.
         */
        PatientCreate: {
            /** Nombre completo */
            full_name: string;
            /**
             * Fecha de nacimiento
             * Format: date
             */
            birth_date: string;
            /** Sexo */
            sex: components["schemas"]["Sex"];
            /** Teléfono */
            phone?: string | null;
            /** Correo electrónico */
            email?: string | null;
            /** Dirección */
            address?: string | null;
            /** CURP */
            curp?: string | null;
            /** Ocupación */
            occupation?: string | null;
            /** Estado civil */
            marital_status?: string | null;
            /** Contacto de emergencia */
            emergency_contact_name?: string | null;
            /** Parentesco del contacto */
            emergency_contact_relationship?: string | null;
            /** Teléfono de emergencia */
            emergency_contact_phone?: string | null;
            /**
             * Estado
             * @default active
             */
            status: components["schemas"]["PatientStatus"];
            /**
             * Embarazo/lactancia
             * @default none
             */
            pregnancy_status: components["schemas"]["PregnancyStatus"];
            /** Inicio del embarazo/estado */
            pregnancy_since?: string | null;
            /** Fecha probable de parto */
            estimated_due_date?: string | null;
        };
        /**
         * PatientHistoryItemCategory
         * @description Categoría de un antecedente clínico estructurado del paciente.
         *
         *     Son CATEGORÍAS de registro del expediente (no implican afirmación médica alguna):
         *     antecedentes familiares, quirúrgicos, obstétricos, y personales patológicos/no patológicos.
         * @enum {string}
         */
        PatientHistoryItemCategory: "familiar" | "quirurgico" | "obstetrico" | "patologico" | "no_patologico";
        /**
         * PatientHistoryItemCreate
         * @description Alta de un antecedente clínico estructurado del paciente.
         *
         *     ``patient_id`` se fija en la creación y es inmutable después (no se edita por PATCH).
         */
        PatientHistoryItemCreate: {
            /**
             * Paciente
             * Format: uuid
             * @description Paciente al que pertenece el antecedente (no se reasigna después).
             */
            patient_id: string;
            /** Categoría */
            category: components["schemas"]["PatientHistoryItemCategory"];
            /** Descripción */
            description: string;
            /**
             * Parentesco
             * @description Para antecedentes familiares (opcional).
             */
            relationship_to_patient?: components["schemas"]["FamilyRelationship"] | null;
            /** Condición relacionada */
            related_condition?: string | null;
            /** Código (CIE-10) */
            related_code?: string | null;
            /** Edad de inicio */
            onset_age?: number | null;
            /** Fecha del evento */
            occurred_on?: string | null;
            /** Notas */
            notes?: string | null;
        };
        /**
         * PatientHistoryItemListItem
         * @description Versión de listado compatible con ``ResourceQuery``.
         */
        PatientHistoryItemListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /** Categoría */
            category: components["schemas"]["PatientHistoryItemCategory"];
            /** Descripción */
            description: string;
            /** Parentesco */
            relationship_to_patient?: components["schemas"]["FamilyRelationship"] | null;
            /** Condición relacionada */
            related_condition?: string | null;
            /** Fecha del evento */
            occurred_on?: string | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * PatientHistoryItemRead
         * @description Representación completa de un antecedente clínico estructurado.
         */
        PatientHistoryItemRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            category: components["schemas"]["PatientHistoryItemCategory"];
            /** Description */
            description: string;
            relationship_to_patient?: components["schemas"]["FamilyRelationship"] | null;
            /** Related Condition */
            related_condition?: string | null;
            /** Related Code */
            related_code?: string | null;
            /** Onset Age */
            onset_age?: number | null;
            /** Occurred On */
            occurred_on?: string | null;
            /** Notes */
            notes?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * PatientHistoryItemUpdate
         * @description Actualización parcial de un antecedente (PATCH).
         *
         *     ``patient_id`` es inmutable: no se declara aquí, por lo que enviarlo da 422
         *     (``extra="forbid"``). La auditoría tampoco es editable desde el cliente.
         */
        PatientHistoryItemUpdate: {
            /** Categoría */
            category?: components["schemas"]["PatientHistoryItemCategory"] | null;
            /** Descripción */
            description?: string | null;
            /** Parentesco */
            relationship_to_patient?: components["schemas"]["FamilyRelationship"] | null;
            /** Condición relacionada */
            related_condition?: string | null;
            /** Código (CIE-10) */
            related_code?: string | null;
            /** Edad de inicio */
            onset_age?: number | null;
            /** Fecha del evento */
            occurred_on?: string | null;
            /** Notas */
            notes?: string | null;
        };
        /**
         * PatientImmunizationCreate
         * @description Alta de una inmunización del paciente.
         *
         *     ``patient_id`` se fija en la creación y es inmutable después (no se edita por PATCH).
         */
        PatientImmunizationCreate: {
            /**
             * Paciente
             * Format: uuid
             * @description Paciente al que pertenece la inmunización (no se reasigna después).
             */
            patient_id: string;
            /** Vacuna */
            vaccine_name: string;
            /** Número de dosis */
            dose_number?: number | null;
            /** Fecha de aplicación */
            administered_on?: string | null;
            /**
             * Estado
             * @default aplicada
             */
            status: components["schemas"]["ImmunizationStatus"];
            /** Vía */
            route?: components["schemas"]["ImmunizationRoute"] | null;
            /** Lote */
            lot_number?: string | null;
            /** Sitio de aplicación */
            site?: string | null;
            /** Notas */
            notes?: string | null;
        };
        /**
         * PatientImmunizationListItem
         * @description Versión de listado compatible con ``ResourceQuery``.
         */
        PatientImmunizationListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /** Vacuna */
            vaccine_name: string;
            /** Dosis */
            dose_number?: number | null;
            /** Fecha de aplicación */
            administered_on?: string | null;
            /** Estado */
            status: components["schemas"]["ImmunizationStatus"];
            /** Vía */
            route?: components["schemas"]["ImmunizationRoute"] | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * PatientImmunizationRead
         * @description Representación completa de una inmunización del paciente.
         */
        PatientImmunizationRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /** Vaccine Name */
            vaccine_name: string;
            /** Dose Number */
            dose_number?: number | null;
            /** Administered On */
            administered_on?: string | null;
            status: components["schemas"]["ImmunizationStatus"];
            route?: components["schemas"]["ImmunizationRoute"] | null;
            /** Lot Number */
            lot_number?: string | null;
            /** Site */
            site?: string | null;
            /** Notes */
            notes?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * PatientImmunizationUpdate
         * @description Actualización parcial de una inmunización (PATCH).
         *
         *     ``patient_id`` es inmutable: no se declara aquí, por lo que enviarlo da 422
         *     (``extra="forbid"``). La auditoría tampoco es editable desde el cliente.
         */
        PatientImmunizationUpdate: {
            /** Vacuna */
            vaccine_name?: string | null;
            /** Número de dosis */
            dose_number?: number | null;
            /** Fecha de aplicación */
            administered_on?: string | null;
            /** Estado */
            status?: components["schemas"]["ImmunizationStatus"] | null;
            /** Vía */
            route?: components["schemas"]["ImmunizationRoute"] | null;
            /** Lote */
            lot_number?: string | null;
            /** Sitio de aplicación */
            site?: string | null;
            /** Notas */
            notes?: string | null;
        };
        /**
         * PatientListItem
         * @description Versión de listado compatible con ``ResourceQuery``.
         */
        PatientListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Expediente */
            record_number: number;
            /** Nombre */
            full_name: string;
            /**
             * Nacimiento
             * Format: date
             */
            birth_date: string;
            /** Sexo */
            sex: components["schemas"]["Sex"];
            /** Teléfono */
            phone?: string | null;
            /** CURP */
            curp?: string | null;
            /** Estado */
            status: components["schemas"]["PatientStatus"];
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * PatientRead
         * @description Ficha administrativa completa del paciente.
         */
        PatientRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Record Number */
            record_number: number;
            /** Full Name */
            full_name: string;
            /**
             * Birth Date
             * Format: date
             */
            birth_date: string;
            sex: components["schemas"]["Sex"];
            /** Phone */
            phone?: string | null;
            /** Email */
            email?: string | null;
            /** Address */
            address?: string | null;
            /** Curp */
            curp?: string | null;
            /** Occupation */
            occupation?: string | null;
            /** Marital Status */
            marital_status?: string | null;
            /** Emergency Contact Name */
            emergency_contact_name?: string | null;
            /** Emergency Contact Relationship */
            emergency_contact_relationship?: string | null;
            /** Emergency Contact Phone */
            emergency_contact_phone?: string | null;
            status: components["schemas"]["PatientStatus"];
            pregnancy_status: components["schemas"]["PregnancyStatus"];
            /** Pregnancy Since */
            pregnancy_since?: string | null;
            /** Estimated Due Date */
            estimated_due_date?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * PatientSearchCandidate
         * @description Candidato de coincidencia con campos seguros para una tarjeta de selección.
         */
        PatientSearchCandidate: {
            /**
             * Id del paciente
             * Format: uuid
             */
            id: string;
            /** Nombre */
            full_name: string;
            /** Año de nacimiento */
            birth_year: number;
            /** Edad */
            age: number;
            /** Sexo */
            sex: string;
            /**
             * Teléfono (enmascarado)
             * @description Sólo se revelan los últimos dígitos; el resto va enmascarado.
             */
            phone_masked?: string | null;
            /** Puntaje de coincidencia */
            score: number;
            /**
             * Nivel de confianza
             * @description exacto | fuerte | posible
             */
            tier: string;
            /**
             * Por qué coincide
             * @description Señales que coincidieron.
             */
            reasons?: string[];
        };
        /**
         * PatientSearchResponse
         * @description Resultado de la búsqueda: candidatos ordenados por confianza.
         *
         *     ``has_strong_match`` resume si hay al menos una coincidencia exacta/fuerte: el flujo de alta
         *     lo usa para advertir de un posible DUPLICADO antes de crear un expediente nuevo.
         */
        PatientSearchResponse: {
            /** Número de candidatos devueltos */
            count: number;
            /**
             * ¿Hay coincidencia fuerte?
             * @description Verdadero si algún candidato es de nivel exacto o fuerte (posible duplicado).
             */
            has_strong_match: boolean;
            /** Candidatos */
            candidates?: components["schemas"]["PatientSearchCandidate"][];
        };
        /**
         * PatientStatus
         * @description Estado administrativo reusable para expedientes de pacientes.
         * @enum {string}
         */
        PatientStatus: "active" | "inactive" | "archived";
        /**
         * PatientUpdate
         * @description Actualización parcial de un paciente (PATCH).
         *
         *     ``record_number`` es inmutable y la auditoría no es editable desde el cliente.
         */
        PatientUpdate: {
            /** Nombre completo */
            full_name?: string | null;
            /** Fecha de nacimiento */
            birth_date?: string | null;
            /** Sexo */
            sex?: components["schemas"]["Sex"] | null;
            /** Teléfono */
            phone?: string | null;
            /** Correo electrónico */
            email?: string | null;
            /** Dirección */
            address?: string | null;
            /** CURP */
            curp?: string | null;
            /** Ocupación */
            occupation?: string | null;
            /** Estado civil */
            marital_status?: string | null;
            /** Contacto de emergencia */
            emergency_contact_name?: string | null;
            /** Parentesco del contacto */
            emergency_contact_relationship?: string | null;
            /** Teléfono de emergencia */
            emergency_contact_phone?: string | null;
            /** Estado */
            status?: components["schemas"]["PatientStatus"] | null;
            /** Embarazo/lactancia */
            pregnancy_status?: components["schemas"]["PregnancyStatus"] | null;
            /** Inicio del embarazo/estado */
            pregnancy_since?: string | null;
            /** Fecha probable de parto */
            estimated_due_date?: string | null;
        };
        /**
         * PendingTaskRead
         * @description Una tarea clínica abierta (pendiente o vencida) para revisión.
         */
        PendingTaskRead: {
            /**
             * Task Id
             * Format: uuid
             */
            task_id: string;
            /** Title */
            title: string;
            /**
             * Patient Id
             * @description Paciente relacionado con la tarea, si aplica.
             */
            patient_id?: string | null;
            /**
             * Patient Label
             * @description Nombre del paciente relacionado, si aplica.
             */
            patient_label?: string | null;
            /**
             * Priority
             * @enum {string}
             */
            priority: "low" | "medium" | "high";
            /**
             * Status
             * @description Sólo se listan tareas abiertas.
             * @constant
             */
            status: "open";
            /**
             * Due At
             * @description Vencimiento, si aplica.
             */
            due_at?: string | null;
            /**
             * Overdue
             * @description True si tiene vencimiento y ya pasó.
             */
            overdue: boolean;
        };
        /** PermissionGroupRead */
        PermissionGroupRead: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Permissions */
            permissions: components["schemas"]["PermissionRead"][];
        };
        /** PermissionRead */
        PermissionRead: {
            /** Access */
            access: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
        };
        /**
         * PregnancyStatus
         * @description Estado de embarazo/lactancia del paciente (relevante para seguridad del medicamento).
         * @enum {string}
         */
        PregnancyStatus: "none" | "pregnant" | "postpartum" | "lactating";
        /**
         * PrescriptionApprove
         * @description Cuerpo de la aprobación: vacío por diseño.
         *
         *     El médico se deriva del usuario autenticado; el cliente no envía ``doctor_id``,
         *     snapshot, fecha ni estado. ``extra="forbid"`` rechaza cualquiera.
         */
        PrescriptionApprove: Record<string, never>;
        /**
         * PrescriptionCreate
         * @description Alta de un borrador de receta ligado a una consulta.
         *
         *     El folio interno, el estado, el snapshot del médico, la auditoría y el borrado
         *     los gobierna el servidor; no se aceptan.
         */
        PrescriptionCreate: {
            /**
             * Consulta
             * Format: uuid
             * @description Consulta origen de la receta (inmutable).
             */
            consultation_id: string;
            /**
             * Diagnóstico relacionado
             * @description Diagnóstico de la misma consulta, opcional.
             */
            related_diagnosis_id?: string | null;
            /** Observaciones */
            observations?: string | null;
        };
        /**
         * PrescriptionItemCreate
         * @description Alta de un medicamento en una receta borrador.
         *
         *     La posición la asigna el servidor; no se acepta. La consulta, el paciente y el
         *     médico se derivan de la receta.
         */
        PrescriptionItemCreate: {
            /**
             * Receta
             * Format: uuid
             * @description Receta a la que pertenece el medicamento (inmutable).
             */
            prescription_id: string;
            /** Medicamento */
            medication_name: string;
            /** Presentación */
            presentation?: string | null;
            /** Dosis */
            dose?: string | null;
            /** Frecuencia */
            frequency?: string | null;
            /** Duración */
            duration?: string | null;
            /** Indicaciones */
            instructions?: string | null;
        };
        /**
         * PrescriptionItemListItem
         * @description Versión de listado compatible con ``ResourceQuery`` (sin ``instructions``).
         */
        PrescriptionItemListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Receta
             * Format: uuid
             */
            prescription_id: string;
            /** Orden */
            position: number;
            /** Medicamento */
            medication_name: string;
            /** Presentación */
            presentation?: string | null;
            /** Dosis */
            dose?: string | null;
            /** Frecuencia */
            frequency?: string | null;
            /** Duración */
            duration?: string | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * PrescriptionItemRead
         * @description Representación completa de un renglón de receta (incluye ``position``).
         */
        PrescriptionItemRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Prescription Id
             * Format: uuid
             */
            prescription_id: string;
            /** Position */
            position: number;
            /** Medication Name */
            medication_name: string;
            /** Presentation */
            presentation?: string | null;
            /** Dose */
            dose?: string | null;
            /** Frequency */
            frequency?: string | null;
            /** Duration */
            duration?: string | null;
            /** Instructions */
            instructions?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * PrescriptionItemUpdate
         * @description Edición parcial de un renglón (PATCH), sólo si receta y consulta son draft.
         *
         *     ``prescription_id``, la posición, la auditoría y el borrado no se declaran aquí:
         *     enviarlos da 422 (extra forbid).
         */
        PrescriptionItemUpdate: {
            /** Medicamento */
            medication_name?: string | null;
            /** Presentación */
            presentation?: string | null;
            /** Dosis */
            dose?: string | null;
            /** Frecuencia */
            frequency?: string | null;
            /** Duración */
            duration?: string | null;
            /** Indicaciones */
            instructions?: string | null;
        };
        /**
         * PrescriptionListItem
         * @description Versión de listado compatible con ``ResourceQuery`` (sin snapshot ni notas).
         */
        PrescriptionListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Consulta
             * Format: uuid
             */
            consultation_id: string;
            /** Folio */
            internal_folio: number;
            /** Diagnóstico */
            related_diagnosis_id?: string | null;
            /** Estado */
            status: components["schemas"]["PrescriptionStatus"];
            /** Aprobada */
            approved_at?: string | null;
            /** Anulada */
            voided_at?: string | null;
            /**
             * Creada
             * Format: date-time
             */
            created_at: string;
            /** Actualizada */
            updated_at?: string | null;
        };
        /**
         * PrescriptionRead
         * @description Representación completa de una receta (incluye el snapshot del médico).
         */
        PrescriptionRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Consultation Id
             * Format: uuid
             */
            consultation_id: string;
            /** Internal Folio */
            internal_folio: number;
            /** Related Diagnosis Id */
            related_diagnosis_id?: string | null;
            /** Observations */
            observations?: string | null;
            status: components["schemas"]["PrescriptionStatus"];
            /** Doctor Snapshot */
            doctor_snapshot?: {
                [key: string]: unknown;
            } | null;
            /** Approved By Doctor Id */
            approved_by_doctor_id?: string | null;
            /** Approved At */
            approved_at?: string | null;
            /** Voided By Doctor Id */
            voided_by_doctor_id?: string | null;
            /** Voided At */
            voided_at?: string | null;
            /** Void Reason */
            void_reason?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * PrescriptionStatus
         * @description Estado operativo de una receta médica.
         * @enum {string}
         */
        PrescriptionStatus: "draft" | "approved" | "voided";
        /**
         * PrescriptionUpdate
         * @description Edición parcial de un borrador (PATCH), sólo si receta y consulta son draft.
         *
         *     Permite quitar el diagnóstico relacionado enviando ``null``. El folio, el estado,
         *     el snapshot, los datos de aprobación/anulación, la auditoría y el borrado no se
         *     declaran aquí: enviarlos da 422 (extra forbid).
         */
        PrescriptionUpdate: {
            /** Diagnóstico relacionado */
            related_diagnosis_id?: string | null;
            /** Observaciones */
            observations?: string | null;
        };
        /**
         * PrescriptionVoid
         * @description Cuerpo de la anulación: exige un motivo no vacío.
         */
        PrescriptionVoid: {
            /** Motivo de anulación */
            void_reason: string;
        };
        /**
         * PubMedArticle
         * @description Artículo de PubMed normalizado desde las E-utilities de NCBI.
         *
         *     Es material de INVESTIGACIÓN/evidencia, no datos del expediente. El ``abstract``
         *     puede venir vacío en los listados (solo se trae en el detalle por ``efetch``).
         */
        PubMedArticle: {
            /** Pmid */
            pmid: string;
            /** Title */
            title: string;
            /**
             * Authors
             * @default []
             */
            authors: string[];
            /** Year */
            year?: string | null;
            /** Source */
            source?: string | null;
            /** Abstract */
            abstract?: string | null;
            /** Citation */
            citation: string;
        };
        /**
         * PubMedSearchResponse
         * @description Resultado de búsqueda en PubMed: la consulta, el conteo y los artículos.
         */
        PubMedSearchResponse: {
            /** Query */
            query: string;
            /** Count */
            count: number;
            /**
             * Articles
             * @default []
             */
            articles: components["schemas"]["PubMedArticle"][];
        };
        /**
         * QualityCheckRequest
         * @description Objetivo de la verificación. ``extra=forbid``: no se aceptan campos no declarados.
         *
         *     - ``consultation``: revisa la nota SOAP (si está en borrador), sus signos vitales, sus
         *       resultados de laboratorio y los medicamentos de sus recetas.
         *     - ``prescription``: revisa los medicamentos de esa receta (dosis/frecuencia).
         *     - ``patient``: revisa los resultados de laboratorio del paciente (valores no físicos).
         */
        QualityCheckRequest: {
            /**
             * Tipo de objetivo
             * @description Qué se verifica: consultation, prescription o patient.
             * @enum {string}
             */
            target_type: "consultation" | "prescription" | "patient";
            /**
             * Id del objetivo
             * Format: uuid
             * @description Id (UUID) de la consulta, receta o paciente a verificar.
             */
            target_id: string;
        };
        /**
         * QualityCheckResponse
         * @description Resultado de la verificación: el objetivo evaluado y las banderas encontradas.
         *
         *     Si ``flags`` está vacío, no se detectaron incidencias con las reglas vigentes (no es una
         *     garantía de ausencia de problemas: sólo de que estas reglas no marcaron nada).
         */
        QualityCheckResponse: {
            /**
             * Target Type
             * @enum {string}
             */
            target_type: "consultation" | "prescription" | "patient";
            /**
             * Target Id
             * Format: uuid
             */
            target_id: string;
            /** Flags */
            flags: components["schemas"]["QualityFlagRead"][];
            /**
             * Flag Count
             * @description Número de banderas devueltas.
             */
            flag_count: number;
        };
        /**
         * QualityFlagRead
         * @description Una posible incidencia detectada, para que el médico la revise (no es una corrección).
         */
        QualityFlagRead: {
            /**
             * Regla
             * @description Identificador de la regla que disparó.
             */
            rule_id: string;
            /**
             * Severidad
             * @description info o warning; ninguna implica acción automática.
             * @enum {string}
             */
            severity: "info" | "warning";
            /**
             * Mensaje
             * @description Descripción en español del posible problema.
             */
            message: string;
            /**
             * Origen
             * @description Registro/campo concreto que disparó la bandera (modelo:id.campo).
             */
            source_ref: string;
            /**
             * Umbral/criterio citado
             * @description Umbral o criterio usado, para que el médico lo verifique.
             */
            threshold_cited?: string | null;
        };
        /** ReadinessRead */
        ReadinessRead: {
            /**
             * Status
             * @constant
             */
            status: "ok";
            /** Checks */
            checks: {
                [key: string]: boolean;
            };
        };
        /**
         * ReconciliationFlagRead
         * @description Una discrepancia para revisión (no es una corrección).
         */
        ReconciliationFlagRead: {
            /**
             * Kind
             * @description Tipo de discrepancia.
             * @enum {string}
             */
            kind: "prescribed_not_reported" | "reported_not_prescribed" | "duplicate_medication";
            /**
             * Message
             * @description Descripción en español de la discrepancia.
             */
            message: string;
            /**
             * Source Refs
             * @description Registros (modelo:id) que sustentan la discrepancia.
             */
            source_refs?: string[];
            /** Ingredient Or Class */
            ingredient_or_class?: string | null;
            /**
             * Resolver Status
             * @enum {string}
             */
            resolver_status: "resolved" | "name_only" | "no_disponible";
        };
        /**
         * RecordStatus
         * @description Estado operativo reusable para entidades activables del sistema.
         * @enum {string}
         */
        RecordStatus: "active" | "inactive" | "suspended";
        /**
         * ReferralCreate
         * @description Alta de una referencia o contrarreferencia (borrador P1).
         *
         *     Un solo endpoint con discriminador ``kind`` (las dos son direcciones de la misma carta):
         *     - ``referencia``: requiere ``destination`` (institución/servicio/especialidad — decisión
         *       explícita; NUNCA se inventa); ``reason`` y ``clinical_summary`` opcionales (compuestos de
         *       la consulta).
         *     - ``contrarreferencia``: requiere al menos ``findings`` o ``recommendations``.
         *     El servidor toma de la consulta la identidad del paciente y el médico + cédula; fija
         *     ``status='draft'``. No envíes paciente/médico/estado (extra forbid).
         */
        ReferralCreate: {
            /**
             * Consulta
             * Format: uuid
             * @description Consulta de la que se compone la carta.
             */
            consultation_id: string;
            /**
             * Tipo
             * @description referencia (envío) o contrarreferencia (respuesta de vuelta).
             * @enum {string}
             */
            kind: "referencia" | "contrarreferencia";
            /**
             * Destino
             * @description Institución/servicio/especialidad destino (obligatorio en referencia).
             */
            destination?: string | null;
            /**
             * Motivo de la referencia
             * @description Motivo del envío, si aplica.
             */
            reason?: string | null;
            /**
             * Resumen clínico
             * @description Resumen (motivo, hallazgos, diagnóstico presuntivo, estudios/tratamiento).
             */
            clinical_summary?: string | null;
            /**
             * Hallazgos / lo realizado
             * @description En contrarreferencia: lo que el especialista hizo/encontró.
             */
            findings?: string | null;
            /**
             * Recomendaciones / plan
             * @description En contrarreferencia: recomendaciones/plan para el médico de origen.
             */
            recommendations?: string | null;
        };
        /** RegisterCompleteRequest */
        RegisterCompleteRequest: {
            /** First Name */
            first_name: string;
            /** Last Name */
            last_name: string;
            /** Token */
            token: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Confirm Password
             * Format: password
             */
            confirm_password: string;
        };
        /** RegisterRequest */
        RegisterRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
        };
        /**
         * RelationCardinality
         * @enum {string}
         */
        RelationCardinality: "multiple";
        /**
         * RelationOptionsSource
         * @description Origen declarado del universo de opciones de un editor relacional.
         */
        RelationOptionsSource: {
            type: components["schemas"]["OptionsSourceType"];
            /** Url */
            url: string;
            /** Value Field */
            value_field: string;
            /** Label Field */
            label_field: string;
        };
        /** ResetPasswordRequest */
        ResetPasswordRequest: {
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Token */
            token: string;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Confirm Password
             * Format: password
             */
            confirm_password: string;
        };
        /** ResourceActionCapability */
        ResourceActionCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            method: components["schemas"]["HttpMethod"];
            /** Url Template */
            url_template: string;
            scope: components["schemas"]["ActionScope"];
            /** Danger */
            danger: boolean;
            request?: components["schemas"]["ActionRequestSpec"] | null;
            input_schema?: components["schemas"]["ActionInputSchema"] | null;
            confirmation?: components["schemas"]["ActionConfirmation"] | null;
            /** @default refresh */
            success_behavior: components["schemas"]["ActionSuccessBehavior"];
            visible_when?: components["schemas"]["ActionCondition"] | null;
            enabled_when?: components["schemas"]["ActionCondition"] | null;
        };
        /** ResourceCapability */
        ResourceCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Api Path */
            api_path: string;
            view: components["schemas"]["ResourceView"];
            item_reference?: components["schemas"]["ItemReference"] | null;
            detail?: components["schemas"]["ResourceDetailCapability"] | null;
            file_download?: components["schemas"]["ResourceFileDownloadCapability"] | null;
            list?: components["schemas"]["ResourceListCapability"] | null;
            forms?: components["schemas"]["ResourceFormsCapability"] | null;
            /**
             * Actions
             * @default []
             */
            actions: components["schemas"]["ResourceActionCapability"][];
            /**
             * Relations
             * @default []
             */
            relations: components["schemas"]["ResourceRelationCapability"][];
        };
        /**
         * ResourceDetailCapability
         * @description Lectura individual declarada de un recurso (precarga de formularios).
         */
        ResourceDetailCapability: {
            method: components["schemas"]["HttpMethod"];
            /** Url Template */
            url_template: string;
        };
        /** ResourceFieldCapability */
        ResourceFieldCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
            type: components["schemas"]["FieldValueType"];
            /** Visible In List */
            visible_in_list: boolean;
            /** Sortable */
            sortable: boolean;
            /** Searchable */
            searchable: boolean;
            /** Filter Operators */
            filter_operators: components["schemas"]["FilterOperator"][];
        };
        /**
         * ResourceFileDownloadCapability
         * @description Descarga de contenido binario de un item (navegación de archivo, no mutación).
         *
         *     Genérico: cualquier recurso con contenido descargable la declara. Se proyecta solo
         *     si el actor tiene el permiso de descarga (distinto del de lectura de metadata). El
         *     backend revalida permiso y visibilidad y entrega el binario con cabeceras seguras.
         */
        ResourceFileDownloadCapability: {
            method: components["schemas"]["HttpMethod"];
            /** Url Template */
            url_template: string;
        };
        /**
         * ResourceFileFieldCapability
         * @description Campo de archivo de un formulario multipart (genérico, sin semántica de dominio).
         *
         *     El frontend usa ``accepted_mime_types`` y ``max_size_bytes`` solo como guía de UI; el
         *     backend revalida tamaño y tipo en cada carga.
         */
        ResourceFileFieldCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Accepted Mime Types */
            accepted_mime_types: string[];
            /** Max Size Bytes */
            max_size_bytes: number;
            /** Required */
            required: boolean;
        };
        /** ResourceFilterCapability */
        ResourceFilterCapability: {
            /** Field */
            field: string;
            /** Parameter */
            parameter: string;
            operator: components["schemas"]["FilterOperator"];
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
            type: components["schemas"]["FieldValueType"];
            widget: components["schemas"]["WidgetType"];
            /** Options */
            options?: components["schemas"]["ResourceFilterOption"][] | null;
        };
        /** ResourceFilterOption */
        ResourceFilterOption: {
            /** Value */
            value: string;
            /** Label */
            label: string;
        };
        /** ResourceFormCapability */
        ResourceFormCapability: {
            method: components["schemas"]["HttpMethod"];
            /** Url Template */
            url_template: string;
            /** Fields */
            fields: components["schemas"]["ResourceFormFieldCapability"][];
            /** @default json */
            transport: components["schemas"]["FormTransport"];
            file_field?: components["schemas"]["ResourceFileFieldCapability"] | null;
        };
        /** ResourceFormFieldCapability */
        ResourceFormFieldCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
            type: components["schemas"]["FieldValueType"];
            /** Required */
            required: boolean;
            /**
             * Editable
             * @default true
             */
            editable: boolean;
            widget?: components["schemas"]["WidgetType"] | null;
            /** Options */
            options?: components["schemas"]["ResourceFilterOption"][] | null;
        };
        /** ResourceFormsCapability */
        ResourceFormsCapability: {
            create?: components["schemas"]["ResourceFormCapability"] | null;
            update?: components["schemas"]["ResourceFormCapability"] | null;
        };
        /** ResourceListCapability */
        ResourceListCapability: {
            /** Fields */
            fields: components["schemas"]["ResourceFieldCapability"][];
            /**
             * Filters
             * @default []
             */
            filters: components["schemas"]["ResourceFilterCapability"][];
            /**
             * Filterable Fields
             * @default []
             */
            filterable_fields: components["schemas"]["FilterableFieldCapability"][];
            pagination: components["schemas"]["PaginationCapability"];
            search: components["schemas"]["SearchCapability"];
            sort: components["schemas"]["SortCapability"];
        };
        /**
         * ResourceRelationCapability
         * @description Editor relacional declarado por el backend (p. ej. roles de un usuario).
         *
         *     El frontend no infiere rutas ni cardinalidad desde nombres: consume estas URLs
         *     y campos. ``selection_url`` y ``mutation_url`` son plantillas con ``{id}`` del
         *     recurso dueño. ``request_field`` es el campo del cuerpo que transporta la lista
         *     completa de valores objetivo (reemplazo atómico).
         */
        ResourceRelationCapability: {
            /** Name */
            name: string;
            /** Label */
            label: string;
            /** Description */
            description?: string | null;
            cardinality: components["schemas"]["RelationCardinality"];
            /** Required */
            required: boolean;
            /** Editable */
            editable: boolean;
            /** Selection Url */
            selection_url: string;
            /** Selection Field */
            selection_field?: string | null;
            mutation_method: components["schemas"]["HttpMethod"];
            /** Mutation Url */
            mutation_url: string;
            /** Request Field */
            request_field: string;
            options: components["schemas"]["RelationOptionsSource"];
        };
        /**
         * ResourceView
         * @enum {string}
         */
        ResourceView: "table" | "grouped_catalog";
        /** RoleCreate */
        RoleCreate: {
            /** Nombre */
            name: string;
            /** Descripción */
            description?: string | null;
            /** Permissions */
            permissions?: string[];
        };
        /**
         * RoleDetailRead
         * @description Detalle de rol incluyendo los permisos asignados.
         */
        RoleDetailRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Is Active */
            is_active: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
            /** Permissions */
            permissions: string[];
        };
        /**
         * RoleListItem
         * @description Versión de listado compatible con ``ResourceQuery``.
         *
         *     Redeclara los campos visibles en lista con metadata UI explícita. ``id`` se
         *     hereda sin ``ui`` y por tanto no se proyecta como columna por defecto.
         */
        RoleListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Nombre */
            name: string;
            /** Descripción */
            description?: string | null;
            /** Activo */
            is_active: boolean;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * RolePermissionsRead
         * @description Selección actual de permisos de un rol (lectura para el editor relacional).
         */
        RolePermissionsRead: {
            /** Permissions */
            permissions: string[];
        };
        /**
         * RolePermissionsReplace
         * @description Reemplazo completo de permisos asignados a un rol (PUT).
         */
        RolePermissionsReplace: {
            /** Permissions */
            permissions: string[];
        };
        /** RoleRead */
        RoleRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Is Active */
            is_active: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /** RoleUpdate */
        RoleUpdate: {
            /** Nombre */
            name?: string | null;
            /** Descripción */
            description?: string | null;
            /** Activo */
            is_active?: boolean | null;
        };
        /**
         * ScaleComputeRequest
         * @description Insumos para computar una escala. TODOS los declarados son obligatorios.
         */
        ScaleComputeRequest: {
            /**
             * Insumos
             * @description Mapa clave→valor con todos los insumos requeridos por la escala.
             */
            inputs: {
                [key: string]: unknown;
            };
        };
        /**
         * ScaleComputeResponse
         * @description Resultado del cómputo: puntaje, interpretación y fuentes citadas.
         */
        ScaleComputeResponse: {
            /** Scale Id */
            scale_id: string;
            /** Score */
            score: number;
            /** Interpretation Label */
            interpretation_label: string;
            /** Interpretation Detail */
            interpretation_detail: string;
            /** Sources */
            sources: string[];
        };
        /**
         * ScaleDefinitionRead
         * @description Definición pública de una escala: insumos requeridos y fuente citada.
         */
        ScaleDefinitionRead: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description: string;
            /** Source */
            source: string;
            /** Inputs */
            inputs: components["schemas"]["ScaleInputSpecRead"][];
        };
        /**
         * ScaleInputSpecRead
         * @description Especificación de un insumo requerido por una escala.
         */
        ScaleInputSpecRead: {
            /** Key */
            key: string;
            /** Label */
            label: string;
            /** Type */
            type: string;
            /** Description */
            description?: string | null;
            /** Allowed Values */
            allowed_values?: string[] | null;
            /** Min */
            min?: number | null;
            /** Max */
            max?: number | null;
        };
        /**
         * ScaleResultCreate
         * @description Alta de un resultado de escala (borrador que el médico aprueba, P1).
         *
         *     Solo se aceptan ``patient_id``, ``consultation_id`` (opcional), ``scale_id`` e
         *     ``inputs``: el servidor recomputa el puntaje/interpretación/fuente y fija
         *     ``computed_at``. Enviar un puntaje u otros campos calculados da 422 (extra forbid).
         */
        ScaleResultCreate: {
            /**
             * Paciente
             * Format: uuid
             * @description Paciente al que pertenece el resultado.
             */
            patient_id: string;
            /**
             * Consulta
             * @description Consulta asociada, si aplica.
             */
            consultation_id?: string | null;
            /**
             * Escala
             * @description Id de la escala en el registro (p. ej. 'cha2ds2_vasc').
             */
            scale_id: string;
            /**
             * Insumos
             * @description Insumos requeridos por la escala; el servidor los valida y recomputa.
             */
            inputs: {
                [key: string]: unknown;
            };
        };
        /**
         * ScaleResultListItem
         * @description Versión de listado.
         *
         *     Declara los campos de filtro (``patient_id``, ``scale_id``, ``computed_at``) que el
         *     motor de query exige presentes en el schema de listado.
         */
        ScaleResultListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /** Consulta */
            consultation_id?: string | null;
            /** Escala */
            scale_id: string;
            /** Puntaje */
            score: number;
            /** Interpretación */
            interpretation_label: string;
            /**
             * Computado
             * Format: date-time
             */
            computed_at: string;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * ScaleResultRead
         * @description Representación pública completa de un resultado de escala.
         */
        ScaleResultRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /** Consultation Id */
            consultation_id?: string | null;
            /** Scale Id */
            scale_id: string;
            /** Inputs */
            inputs: {
                [key: string]: unknown;
            };
            /** Score */
            score: number;
            /** Interpretation Label */
            interpretation_label: string;
            /** Source */
            source: string;
            /**
             * Computed At
             * Format: date-time
             */
            computed_at: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * ScaleResultUpdate
         * @description Edición parcial (PATCH).
         *
         *     Permite re-vincular la consulta y/o recomputar con nuevos ``inputs`` (el servidor
         *     vuelve a calcular puntaje/interpretación/fuente desde la escala guardada). El puntaje
         *     y los campos calculados no se aceptan como entrada.
         */
        ScaleResultUpdate: {
            /** Consulta */
            consultation_id?: string | null;
            /**
             * Insumos
             * @description Nuevos insumos; si se envían, el servidor recomputa el resultado.
             */
            inputs?: {
                [key: string]: unknown;
            } | null;
        };
        /** SearchCapability */
        SearchCapability: {
            /** Enabled */
            enabled: boolean;
            /** Min Length */
            min_length?: number | null;
            /** Max Length */
            max_length?: number | null;
        };
        /** SessionUser */
        SessionUser: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Last Name */
            last_name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Permissions */
            permissions?: string[];
        };
        /**
         * SettingCategory
         * @description Categoría/ámbito de una configuración institucional (regla clínica configurable).
         * @enum {string}
         */
        SettingCategory: "vital_threshold" | "lab_target" | "follow_up" | "protocol";
        /**
         * Sex
         * @description Sexo registrado para fines clínicos y administrativos.
         * @enum {string}
         */
        Sex: "female" | "male" | "other" | "unspecified";
        /**
         * SickLeaveCreate
         * @description Alta de una incapacidad/justificante de reposo (borrador P1).
         *
         *     El servidor toma de la consulta la identidad del paciente y el médico + cédula. El
         *     DIAGNÓSTICO y el periodo de reposo son decisión médica: ``rest_days`` es OBLIGATORIO y
         *     debe ser ≥ 1; NUNCA se asume ni se inventa. Fija ``kind='incapacidad'``, ``status='draft'``.
         */
        SickLeaveCreate: {
            /**
             * Consulta
             * Format: uuid
             * @description Consulta de la que deriva la incapacidad.
             */
            consultation_id: string;
            /**
             * Diagnóstico/motivo
             * @description Diagnóstico o motivo del reposo.
             */
            diagnosis: string;
            /**
             * Inicio del reposo
             * Format: date
             * @description Fecha de inicio del reposo.
             */
            rest_start_date: string;
            /**
             * Días de reposo
             * @description Número de días de reposo (decisión médica).
             */
            rest_days: number;
        };
        /** SortCapability */
        SortCapability: {
            /** Default Sort */
            default_sort?: string | null;
            /** Fixed Server Order */
            fixed_server_order: boolean;
            /** Max Terms */
            max_terms: number;
            /** Max Length */
            max_length: number;
        };
        /**
         * StudyOrderCreate
         * @description Solicitud de una orden de estudio para un paciente.
         *
         *     Crear una orden es una ESCRITURA clínica: el médico aprueba el payload exacto
         *     (protocolo P1 en el copiloto). La auditoría y el borrado los gobierna el
         *     servidor; no se aceptan como entrada.
         */
        StudyOrderCreate: {
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /**
             * Médico que ordena
             * Format: uuid
             */
            ordered_by: string;
            /** Estudio */
            study_name: string;
            /** Código (LOINC) */
            code?: string | null;
            /** Motivo */
            reason?: string | null;
            /** Fecha de la orden */
            ordered_at?: string | null;
            /**
             * Estado
             * @default pending
             */
            status: components["schemas"]["StudyOrderStatus"];
            /** Resultado vinculado */
            result_lab_result_id?: string | null;
        };
        /**
         * StudyOrderListItem
         * @description Versión de listado de una orden de estudio.
         *
         *     Declara los campos de filtro (``patient_id``, ``ordered_by``, ``status``,
         *     ``ordered_at``) que el motor de query exige presentes en el schema de listado.
         */
        StudyOrderListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Paciente
             * Format: uuid
             */
            patient_id: string;
            /**
             * Médico
             * Format: uuid
             */
            ordered_by: string;
            /** Estudio */
            study_name: string;
            /** Código */
            code?: string | null;
            /** Estado */
            status: components["schemas"]["StudyOrderStatus"];
            /**
             * Ordenado
             * Format: date-time
             */
            ordered_at: string;
            /** Resultado */
            result_lab_result_id?: string | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
        };
        /**
         * StudyOrderRead
         * @description Representación pública completa de una orden de estudio.
         */
        StudyOrderRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /**
             * Ordered By
             * Format: uuid
             */
            ordered_by: string;
            /** Study Name */
            study_name: string;
            /** Code */
            code?: string | null;
            /** Reason */
            reason?: string | null;
            /**
             * Ordered At
             * Format: date-time
             */
            ordered_at: string;
            status: components["schemas"]["StudyOrderStatus"];
            /** Result Lab Result Id */
            result_lab_result_id?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * StudyOrderStatus
         * @description Estado de una orden de estudio/laboratorio.
         * @enum {string}
         */
        StudyOrderStatus: "pending" | "in_progress" | "resulted" | "cancelled";
        /**
         * StudyOrderUpdate
         * @description Edición parcial de una orden (PATCH).
         *
         *     ``patient_id`` y ``ordered_by`` no se declaran aquí: enviarlos da 422.
         */
        StudyOrderUpdate: {
            /** Estudio */
            study_name?: string | null;
            /** Código (LOINC) */
            code?: string | null;
            /** Motivo */
            reason?: string | null;
            /** Fecha de la orden */
            ordered_at?: string | null;
            /** Estado */
            status?: components["schemas"]["StudyOrderStatus"] | null;
            /** Resultado vinculado */
            result_lab_result_id?: string | null;
        };
        /**
         * TopDiagnosis
         * @description Frecuencia de un diagnóstico (por código si existe, si no texto normalizado).
         */
        TopDiagnosis: {
            /** Code Or Text */
            code_or_text: string;
            /** Count */
            count: number;
        };
        /** UnlockAccountRequest */
        UnlockAccountRequest: {
            /** Token */
            token: string;
        };
        /**
         * UnreviewedAbnormalLabRead
         * @description Un resultado de laboratorio anormal (fuera de rango) aún sin revisar.
         */
        UnreviewedAbnormalLabRead: {
            /**
             * Lab Result Id
             * Format: uuid
             */
            lab_result_id: string;
            /**
             * Patient Id
             * Format: uuid
             */
            patient_id: string;
            /** Patient Label */
            patient_label?: string | null;
            /** Analyte Name */
            analyte_name: string;
            /**
             * Abnormal Flag
             * @enum {string}
             */
            abnormal_flag: "low" | "high" | "critical";
            /** Value Numeric */
            value_numeric?: number | null;
            /** Value Text */
            value_text?: string | null;
            /** Unit */
            unit?: string | null;
            /**
             * Measured At
             * Format: date-time
             */
            measured_at: string;
        };
        /**
         * UnsignedNotesItem
         * @description Consultas en borrador (sin firmar) agrupadas por médico tratante.
         */
        UnsignedNotesItem: {
            /**
             * Doctor Id
             * Format: uuid
             */
            doctor_id: string;
            /** Doctor Name */
            doctor_name: string;
            /** Count */
            count: number;
        };
        /**
         * UserAdminCreate
         * @description Creación administrativa de un usuario.
         */
        UserAdminCreate: {
            /** Nombre */
            name: string;
            /** Apellido */
            last_name: string;
            /**
             * Correo
             * Format: email
             */
            email: string;
            /**
             * Contraseña
             * Format: password
             */
            password: string;
            /**
             * Confirmar contraseña
             * Format: password
             */
            confirm_password: string;
            /**
             * Activo
             * @default true
             */
            is_active: boolean;
        };
        /**
         * UserAdminListItem
         * @description Versión reducida para listados administrativos de usuarios.
         */
        UserAdminListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Nombre */
            name: string;
            /** Apellido */
            last_name: string;
            /**
             * Correo
             * Format: email
             */
            email: string;
            /** Activo */
            is_active: boolean;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * UserAdminRead
         * @description Representación administrativa completa de un usuario.
         */
        UserAdminRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Last Name */
            last_name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /** Is Active */
            is_active: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * UserAdminUpdate
         * @description Actualización parcial administrativa de un usuario (PATCH).
         */
        UserAdminUpdate: {
            /** Nombre */
            name?: string | null;
            /** Apellido */
            last_name?: string | null;
            /** Correo */
            email?: string | null;
            /** Activo */
            is_active?: boolean | null;
        };
        /**
         * UserPasswordChangeRequest
         * @description Cambio de contraseña solicitado por el propio usuario.
         */
        UserPasswordChangeRequest: {
            /**
             * Current Password
             * Format: password
             */
            current_password: string;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Confirm Password
             * Format: password
             */
            confirm_password: string;
        };
        /**
         * UserProfileRead
         * @description Datos propios visibles para el usuario autenticado.
         */
        UserProfileRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Last Name */
            last_name: string;
            /**
             * Email
             * Format: email
             */
            email: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
        };
        /**
         * UserProfileUpdate
         * @description Campos que el usuario puede editar sobre su propio perfil.
         */
        UserProfileUpdate: {
            /** Name */
            name?: string | null;
            /** Last Name */
            last_name?: string | null;
            /** Email */
            email?: string | null;
        };
        /**
         * UserRolesReplace
         * @description Reemplazo completo de los roles asignados a un usuario (PUT).
         */
        UserRolesReplace: {
            /** Role Ids */
            role_ids: string[];
        };
        /** ValidationError */
        ValidationError: {
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
            /** Input */
            input?: unknown;
            /** Context */
            ctx?: Record<string, never>;
        };
        /**
         * VitalMetric
         * @description Signo vital comparable en un criterio de umbral (columna de ``vital_signs``).
         * @enum {string}
         */
        VitalMetric: "systolic_bp" | "diastolic_bp" | "heart_rate_bpm" | "respiratory_rate_rpm" | "oxygen_saturation" | "temperature_c" | "weight_kg" | "height_cm" | "capillary_glucose" | "pain_scale";
        /**
         * VitalSignCreate
         * @description Registro de una medición de signos vitales en una consulta.
         *
         *     El paciente y el médico se derivan de la consulta. ``bmi``, el estado, la
         *     auditoría y el borrado los gobierna el servidor o se calculan; no se aceptan.
         */
        VitalSignCreate: {
            /**
             * Consulta
             * Format: uuid
             * @description Consulta a la que pertenece la medición (inmutable).
             */
            consultation_id: string;
            /** Fecha de medición */
            measured_at?: string | null;
            /** Peso (kg) */
            weight_kg?: number | null;
            /** Talla (cm) */
            height_cm?: number | null;
            /** Temperatura (°C) */
            temperature_c?: number | null;
            /** Presión sistólica */
            systolic_bp?: number | null;
            /** Presión diastólica */
            diastolic_bp?: number | null;
            /** Frecuencia cardiaca (lpm) */
            heart_rate_bpm?: number | null;
            /** Frecuencia respiratoria (rpm) */
            respiratory_rate_rpm?: number | null;
            /** Saturación de oxígeno (%) */
            oxygen_saturation?: number | null;
            /** Glucosa capilar (mg/dL) */
            capillary_glucose?: number | null;
            /** Escala de dolor (0-10) */
            pain_scale?: number | null;
            /** Observaciones */
            observations?: string | null;
        };
        /**
         * VitalSignListItem
         * @description Versión de listado (sin ``observations``), con ``bmi`` derivado.
         */
        VitalSignListItem: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Consulta
             * Format: uuid
             */
            consultation_id: string;
            /**
             * Medición
             * Format: date-time
             */
            measured_at: string;
            /** Peso (kg) */
            weight_kg?: number | null;
            /** Talla (cm) */
            height_cm?: number | null;
            /** Temperatura (°C) */
            temperature_c?: number | null;
            /** Sistólica */
            systolic_bp?: number | null;
            /** Diastólica */
            diastolic_bp?: number | null;
            /** FC (lpm) */
            heart_rate_bpm?: number | null;
            /** FR (rpm) */
            respiratory_rate_rpm?: number | null;
            /** SpO₂ (%) */
            oxygen_saturation?: number | null;
            /** Glucosa */
            capillary_glucose?: number | null;
            /** Dolor */
            pain_scale?: number | null;
            /**
             * Creado
             * Format: date-time
             */
            created_at: string;
            /** Actualizado */
            updated_at?: string | null;
            /** Bmi */
            readonly bmi: number | null;
        };
        /**
         * VitalSignRead
         * @description Representación completa de una medición, con ``bmi`` derivado (read-only).
         */
        VitalSignRead: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Consultation Id
             * Format: uuid
             */
            consultation_id: string;
            /**
             * Measured At
             * Format: date-time
             */
            measured_at: string;
            /** Weight Kg */
            weight_kg?: number | null;
            /** Height Cm */
            height_cm?: number | null;
            /** Temperature C */
            temperature_c?: number | null;
            /** Systolic Bp */
            systolic_bp?: number | null;
            /** Diastolic Bp */
            diastolic_bp?: number | null;
            /** Heart Rate Bpm */
            heart_rate_bpm?: number | null;
            /** Respiratory Rate Rpm */
            respiratory_rate_rpm?: number | null;
            /** Oxygen Saturation */
            oxygen_saturation?: number | null;
            /** Capillary Glucose */
            capillary_glucose?: number | null;
            /** Pain Scale */
            pain_scale?: number | null;
            /** Observations */
            observations?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
            /** Bmi */
            readonly bmi: number | null;
        };
        /**
         * VitalSignUpdate
         * @description Edición parcial de una medición (PATCH), sólo si la consulta es draft.
         *
         *     ``consultation_id``, ``bmi``, la auditoría y el borrado no se declaran aquí:
         *     enviarlos da 422 (extra forbid).
         */
        VitalSignUpdate: {
            /** Fecha de medición */
            measured_at?: string | null;
            /** Peso (kg) */
            weight_kg?: number | null;
            /** Talla (cm) */
            height_cm?: number | null;
            /** Temperatura (°C) */
            temperature_c?: number | null;
            /** Presión sistólica */
            systolic_bp?: number | null;
            /** Presión diastólica */
            diastolic_bp?: number | null;
            /** Frecuencia cardiaca (lpm) */
            heart_rate_bpm?: number | null;
            /** Frecuencia respiratoria (rpm) */
            respiratory_rate_rpm?: number | null;
            /** Saturación de oxígeno (%) */
            oxygen_saturation?: number | null;
            /** Glucosa capilar (mg/dL) */
            capillary_glucose?: number | null;
            /** Escala de dolor (0-10) */
            pain_scale?: number | null;
            /** Observaciones */
            observations?: string | null;
        };
        /**
         * VitalThresholdCriterion
         * @description Umbral sobre un signo vital: métrica, comparador y valor de referencia.
         *
         *     ``comparator`` y ``value`` son opcionales: si se omiten ambos, se usa el umbral de
         *     bandera roja CONFIGURADO en la institución para ese signo vital. Si se quiere un
         *     umbral explícito, deben indicarse AMBOS (no uno solo).
         */
        VitalThresholdCriterion: {
            vital: components["schemas"]["VitalMetric"];
            comparator?: components["schemas"]["Comparator"] | null;
            /** Value */
            value?: number | null;
        };
        /**
         * WidgetType
         * @enum {string}
         */
        WidgetType: "text" | "email" | "password" | "switch" | "textarea" | "multiselect" | "select" | "number" | "date" | "daterange" | "datetime" | "time";
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    health_api_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthRead"];
                };
            };
        };
    };
    readiness_api_ready_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadinessRead"];
                };
            };
        };
    };
    create_connection_ticket_api_v1_agent_connection_ticket_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConnectionTicketRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_agent_templates_api_v1_agent_templates_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AgentTemplate"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    open_template_prefill_api_v1_agent_templates__template_id__prefill_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OpenTemplateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpenTemplateResolved"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    lease_credential_api_v1_internal_agent_credential_lease_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Internal-Auth"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CredentialLeaseRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CredentialLeaseResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_memories_api_v1_users_me_agent_memories_get: {
        parameters: {
            query?: {
                patient_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AgentMemoryRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_memory_api_v1_users_me_agent_memories_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AgentMemoryCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AgentMemoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_memory_api_v1_users_me_agent_memories__memory_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                memory_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_memory_api_v1_users_me_agent_memories__memory_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                memory_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AgentMemoryUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AgentMemoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    start_oauth_api_v1_users_me_ai_providers_oauth_openai_start_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OAuthStartResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_oauth_api_v1_users_me_ai_providers_oauth_openai_complete_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OAuthCompleteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OAuthStatusResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    oauth_status_api_v1_users_me_ai_providers_oauth_openai_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OAuthStatusResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    disconnect_oauth_api_v1_users_me_ai_providers_oauth_openai_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_persona_api_v1_users_me_agent_persona_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AgentPersonaRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upsert_persona_api_v1_users_me_agent_persona_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AgentPersonaUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AgentPersonaRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_credentials_api_v1_users_me_ai_providers_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AiProviderCredentialRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_credential_api_v1_users_me_ai_providers_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AiProviderCredentialCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AiProviderCredentialRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_credential_api_v1_users_me_ai_providers__credential_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                credential_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_credential_api_v1_users_me_ai_providers__credential_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                credential_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AiProviderCredentialUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AiProviderCredentialRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_appointments_api_v1_appointments_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                doctor_id?: string | null;
                status?: components["schemas"]["AppointmentStatus"] | null;
                id_in?: string[] | null;
                scheduled_at_on?: string | null;
                scheduled_at_before?: string | null;
                scheduled_at_after?: string | null;
                scheduled_at_from?: string | null;
                scheduled_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_AppointmentListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_appointment_api_v1_appointments_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppointmentCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppointmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_appointment_api_v1_appointments__appointment_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appointment_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppointmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_appointment_api_v1_appointments__appointment_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appointment_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppointmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_appointment_api_v1_appointments__appointment_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appointment_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppointmentUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppointmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    confirm_appointment_api_v1_appointments__appointment_id__confirm_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appointment_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppointmentConfirm"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppointmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    cancel_appointment_api_v1_appointments__appointment_id__cancel_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appointment_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppointmentCancel"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppointmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    no_show_appointment_api_v1_appointments__appointment_id__no_show_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appointment_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppointmentNoShow"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppointmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reschedule_appointment_api_v1_appointments__appointment_id__reschedule_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appointment_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AppointmentReschedule"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppointmentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_audit_events_api_v1_audit_events_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                actor_user_id?: string | null;
                action?: string | null;
                entity_type?: string | null;
                entity_id?: string | null;
                id_in?: string[] | null;
                occurred_at_on?: string | null;
                occurred_at_before?: string | null;
                occurred_at_after?: string | null;
                occurred_at_from?: string | null;
                occurred_at_to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_AuditEventListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_audit_event_api_v1_audit_events__event_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuditEventRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_auth_policy_api_v1_auth_policy_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthPolicyRead"];
                };
            };
        };
    };
    read_current_user_api_v1_auth_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUser"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    login_api_v1_auth_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logout_api_v1_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    request_registration_api_v1_auth_register_request_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_registration_api_v1_auth_register_complete_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterCompleteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    unlock_account_api_v1_auth_unlock_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UnlockAccountRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    request_password_reset_api_v1_auth_password_forgot_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ForgotPasswordRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    complete_password_reset_api_v1_auth_password_reset_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResetPasswordRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_bootstrap_status_api_v1_bootstrap_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BootstrapStatusRead"];
                };
            };
        };
    };
    read_bootstrap_catalog_api_v1_bootstrap_catalog_get: {
        parameters: {
            query?: never;
            header?: {
                "X-Bootstrap-Token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BootstrapCatalogRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    initialize_bootstrap_api_v1_bootstrap_initialize_post: {
        parameters: {
            query?: never;
            header?: {
                "X-Bootstrap-Token"?: string | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BootstrapInitializeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BootstrapInitializeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_clinical_codes_api_v1_clinical_codes_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                system?: components["schemas"]["ClinicalCodeSystem"] | null;
                id_in?: string[] | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_ClinicalCodeListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_clinical_code_api_v1_clinical_codes_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClinicalCodeCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalCodeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_clinical_code_api_v1_clinical_codes__code_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalCodeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_clinical_code_api_v1_clinical_codes__code_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalCodeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_clinical_code_api_v1_clinical_codes__code_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClinicalCodeUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalCodeRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_clinical_documents_api_v1_clinical_documents_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                consultation_id?: string | null;
                document_type?: components["schemas"]["ClinicalDocumentType"] | null;
                status?: components["schemas"]["ClinicalDocumentStatus"] | null;
                id_in?: string[] | null;
                uploaded_at_on?: string | null;
                uploaded_at_before?: string | null;
                uploaded_at_after?: string | null;
                uploaded_at_from?: string | null;
                uploaded_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_ClinicalDocumentListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_clinical_document_api_v1_clinical_documents_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_clinical_document_api_v1_clinical_documents_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalDocumentUploadResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_clinical_document_api_v1_clinical_documents__document_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                document_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalDocumentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_clinical_document_api_v1_clinical_documents__document_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                document_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalDocumentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_clinical_document_api_v1_clinical_documents__document_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                document_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClinicalDocumentMetadataUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalDocumentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_clinical_document_content_api_v1_clinical_documents__document_id__content_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                document_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalDocumentContentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_clinical_document_transcript_api_v1_clinical_documents__document_id__transcript_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                document_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalDocumentTranscriptRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    download_clinical_document_api_v1_clinical_documents__document_id__download_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                document_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    archive_clinical_document_api_v1_clinical_documents__document_id__archive_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                document_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalDocumentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    restore_clinical_document_api_v1_clinical_documents__document_id__restore_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                document_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalDocumentRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_clinical_events_api_v1_clinical_events_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                event_type?: components["schemas"]["ClinicalEventType"] | null;
                status?: components["schemas"]["ClinicalEventStatus"] | null;
                id_in?: string[] | null;
                started_at_on?: string | null;
                started_at_before?: string | null;
                started_at_after?: string | null;
                started_at_from?: string | null;
                started_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_ClinicalEventListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_clinical_event_api_v1_clinical_events_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClinicalEventCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalEventRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_clinical_event_api_v1_clinical_events__event_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalEventRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_clinical_event_api_v1_clinical_events__event_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalEventRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_clinical_event_api_v1_clinical_events__event_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                event_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClinicalEventUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalEventRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_clinical_notes_api_v1_clinical_notes_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                consultation_id?: string | null;
                kind?: components["schemas"]["ClinicalNoteKind"] | null;
                status?: components["schemas"]["ClinicalNoteStatus"] | null;
                id_in?: string[] | null;
                created_at_on?: string | null;
                created_at_before?: string | null;
                created_at_after?: string | null;
                created_at_from?: string | null;
                created_at_to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_ClinicalNoteListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_clinical_note_api_v1_clinical_notes_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClinicalNoteCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalNoteRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_clinical_note_api_v1_clinical_notes__note_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                note_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalNoteRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_clinical_note_api_v1_clinical_notes__note_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                note_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalNoteRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_clinical_note_api_v1_clinical_notes__note_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                note_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClinicalNoteUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalNoteRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_medical_certificate_api_v1_clinical_notes_medical_certificate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MedicalCertificateCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalNoteRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_sick_leave_api_v1_clinical_notes_sick_leave_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SickLeaveCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalNoteRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_referral_api_v1_clinical_notes_referral_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReferralCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalNoteRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_clinical_scales_api_v1_clinical_scales_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScaleDefinitionRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    compute_clinical_scale_api_v1_clinical_scales__scale_id__compute_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scale_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScaleComputeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScaleComputeResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_clinical_tasks_api_v1_clinical_tasks_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                owner_id?: string | null;
                patient_id?: string | null;
                status?: components["schemas"]["ClinicalTaskStatus"] | null;
                priority?: components["schemas"]["ClinicalTaskPriority"] | null;
                id_in?: string[] | null;
                due_at_on?: string | null;
                due_at_before?: string | null;
                due_at_after?: string | null;
                due_at_from?: string | null;
                due_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_ClinicalTaskListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_clinical_task_api_v1_clinical_tasks_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClinicalTaskCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalTaskRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_clinical_task_api_v1_clinical_tasks__task_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalTaskRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_clinical_task_api_v1_clinical_tasks__task_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalTaskRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_clinical_task_api_v1_clinical_tasks__task_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                task_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClinicalTaskUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClinicalTaskRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_consultation_diagnoses_api_v1_consultation_diagnoses_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                consultation_id?: string | null;
                diagnosis_kind?: components["schemas"]["ConsultationDiagnosisKind"] | null;
                id_in?: string[] | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_ConsultationDiagnosisListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_consultation_diagnosis_api_v1_consultation_diagnoses_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsultationDiagnosisCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsultationDiagnosisRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_consultation_diagnosis_api_v1_consultation_diagnoses__diagnosis_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                diagnosis_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsultationDiagnosisRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_consultation_diagnosis_api_v1_consultation_diagnoses__diagnosis_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                diagnosis_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsultationDiagnosisRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_consultation_diagnosis_api_v1_consultation_diagnoses__diagnosis_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                diagnosis_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsultationDiagnosisUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsultationDiagnosisRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_consultations_api_v1_consultations_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                attending_doctor_id?: string | null;
                status?: components["schemas"]["ConsultationStatus"] | null;
                id_in?: string[] | null;
                consulted_at_on?: string | null;
                consulted_at_before?: string | null;
                consulted_at_after?: string | null;
                consulted_at_from?: string | null;
                consulted_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_ConsultationListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_consultation_api_v1_consultations_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsultationCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsultationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_consultation_api_v1_consultations__consultation_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                consultation_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsultationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_consultation_api_v1_consultations__consultation_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                consultation_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsultationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_consultation_api_v1_consultations__consultation_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                consultation_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsultationUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsultationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    finalize_consultation_api_v1_consultations__consultation_id__finalize_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                consultation_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsultationFinalize"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsultationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_doctors_api_v1_doctors_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                status?: components["schemas"]["RecordStatus"] | null;
                id_in?: string[] | null;
                professional_name_ne?: string | null;
                professional_name_contains?: string | null;
                professional_name_startswith?: string | null;
                professional_name_endswith?: string | null;
                specialty_ne?: string | null;
                specialty_contains?: string | null;
                specialty_startswith?: string | null;
                specialty_endswith?: string | null;
                created_at_on?: string | null;
                created_at_before?: string | null;
                created_at_after?: string | null;
                created_at_from?: string | null;
                created_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_DoctorListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_doctor_api_v1_doctors_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DoctorCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DoctorRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_doctor_api_v1_doctors__doctor_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                doctor_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DoctorRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_doctor_api_v1_doctors__doctor_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                doctor_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DoctorRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_doctor_api_v1_doctors__doctor_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                doctor_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DoctorUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DoctorRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_follow_ups_summary_api_v1_follow_ups_summary_get: {
        parameters: {
            query?: {
                appointment_lookback_days?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FollowUpSummaryResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_institutional_settings_api_v1_institutional_settings_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                category?: components["schemas"]["SettingCategory"] | null;
                id_in?: string[] | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_InstitutionalSettingListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_institutional_setting_api_v1_institutional_settings_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InstitutionalSettingCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InstitutionalSettingRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_institutional_setting_api_v1_institutional_settings__setting_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                setting_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InstitutionalSettingRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_institutional_setting_api_v1_institutional_settings__setting_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                setting_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InstitutionalSettingRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_institutional_setting_api_v1_institutional_settings__setting_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                setting_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["InstitutionalSettingUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InstitutionalSettingRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_lab_results_api_v1_lab_results_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                consultation_id?: string | null;
                analyte_name?: string | null;
                abnormal_flag?: components["schemas"]["LabResultAbnormalFlag"] | null;
                id_in?: string[] | null;
                abnormal_flag_in?: components["schemas"]["LabResultAbnormalFlag"][] | null;
                analyte_name_ne?: string | null;
                analyte_name_contains?: string | null;
                analyte_name_startswith?: string | null;
                analyte_name_endswith?: string | null;
                measured_at_on?: string | null;
                measured_at_before?: string | null;
                measured_at_after?: string | null;
                measured_at_from?: string | null;
                measured_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_LabResultListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_lab_result_api_v1_lab_results_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LabResultCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabResultRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_lab_result_api_v1_lab_results__result_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                result_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabResultRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_lab_result_api_v1_lab_results__result_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                result_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabResultRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_lab_result_api_v1_lab_results__result_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                result_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LabResultUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LabResultRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_medical_history_versions_api_v1_medical_history_versions_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                status?: components["schemas"]["MedicalHistoryVersionStatus"] | null;
                id_in?: string[] | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_MedicalHistoryVersionListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_medical_history_version_api_v1_medical_history_versions_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MedicalHistoryVersionCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MedicalHistoryVersionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_medical_history_version_api_v1_medical_history_versions__history_version_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                history_version_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MedicalHistoryVersionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_medical_history_version_api_v1_medical_history_versions__history_version_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                history_version_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MedicalHistoryVersionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_medical_history_version_api_v1_medical_history_versions__history_version_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                history_version_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MedicalHistoryVersionUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MedicalHistoryVersionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    finalize_medical_history_version_api_v1_medical_history_versions__history_version_id__finalize_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                history_version_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MedicalHistoryVersionFinalize"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MedicalHistoryVersionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reconcile_patient_medications_api_v1_patients__patient_id__medication_reconciliation_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                patient_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MedicationReconciliationResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_medication_templates_api_v1_medication_templates_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                doctor_id?: string | null;
                status?: components["schemas"]["ActiveInactiveStatus"] | null;
                medication_name?: string | null;
                id_in?: string[] | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_MedicationTemplateListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_medication_template_api_v1_medication_templates_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MedicationTemplateCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MedicationTemplateRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_medication_template_api_v1_medication_templates__template_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MedicationTemplateRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_medication_template_api_v1_medication_templates__template_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MedicationTemplateRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_medication_template_api_v1_medication_templates__template_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                template_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MedicationTemplateUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MedicationTemplateRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_patient_clinical_items_api_v1_patient_clinical_items_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                item_type?: components["schemas"]["PatientClinicalItemType"] | null;
                status?: components["schemas"]["ClinicalItemStatus"] | null;
                severity?: components["schemas"]["ClinicalSeverity"] | null;
                id_in?: string[] | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_PatientClinicalItemListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_patient_clinical_item_api_v1_patient_clinical_items_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PatientClinicalItemCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientClinicalItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_patient_clinical_item_api_v1_patient_clinical_items__item_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientClinicalItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_patient_clinical_item_api_v1_patient_clinical_items__item_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientClinicalItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_patient_clinical_item_api_v1_patient_clinical_items__item_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PatientClinicalItemUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientClinicalItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_patient_history_items_api_v1_patient_history_items_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                category?: components["schemas"]["PatientHistoryItemCategory"] | null;
                id_in?: string[] | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_PatientHistoryItemListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_patient_history_item_api_v1_patient_history_items_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PatientHistoryItemCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientHistoryItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_patient_history_item_api_v1_patient_history_items__item_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientHistoryItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_patient_history_item_api_v1_patient_history_items__item_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientHistoryItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_patient_history_item_api_v1_patient_history_items__item_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PatientHistoryItemUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientHistoryItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_patient_immunizations_api_v1_patient_immunizations_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                status?: components["schemas"]["ImmunizationStatus"] | null;
                id_in?: string[] | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_PatientImmunizationListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_patient_immunization_api_v1_patient_immunizations_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PatientImmunizationCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientImmunizationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_patient_immunization_api_v1_patient_immunizations__item_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientImmunizationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_patient_immunization_api_v1_patient_immunizations__item_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientImmunizationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_patient_immunization_api_v1_patient_immunizations__item_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PatientImmunizationUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientImmunizationRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_patients_api_v1_patients_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                status?: components["schemas"]["PatientStatus"] | null;
                record_number?: number | null;
                record_number_gte?: number | null;
                record_number_lte?: number | null;
                id_in?: string[] | null;
                full_name_ne?: string | null;
                full_name_contains?: string | null;
                full_name_startswith?: string | null;
                full_name_endswith?: string | null;
                created_at_on?: string | null;
                created_at_before?: string | null;
                created_at_after?: string | null;
                created_at_from?: string | null;
                created_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_PatientListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_patient_api_v1_patients_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PatientCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_patients_api_v1_patients_search_get: {
        parameters: {
            query?: {
                /** @description Nombre o parte del nombre (difuso). */
                name?: string | null;
                /** @description Teléfono (se compara por dígitos). */
                phone?: string | null;
                /** @description CURP exacta. */
                curp?: string | null;
                /** @description Fecha de nacimiento (AAAA-MM-DD). */
                birth_date?: string | null;
                /** @description Correo exacto. */
                email?: string | null;
                /** @description Máximo de candidatos. */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientSearchResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_patient_api_v1_patients__patient_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                patient_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_patient_api_v1_patients__patient_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                patient_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_patient_api_v1_patients__patient_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                patient_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PatientUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PatientRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_permissions_api_v1_permissions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PermissionGroupRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    query_cohort_api_v1_population_cohort_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CohortCriteria"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CohortResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_prescription_items_api_v1_prescription_items_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                prescription_id?: string | null;
                id_in?: string[] | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_PrescriptionItemListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_prescription_item_api_v1_prescription_items_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PrescriptionItemCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrescriptionItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_prescription_item_api_v1_prescription_items__item_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrescriptionItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_prescription_item_api_v1_prescription_items__item_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrescriptionItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_prescription_item_api_v1_prescription_items__item_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PrescriptionItemUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrescriptionItemRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_prescriptions_api_v1_prescriptions_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                consultation_id?: string | null;
                related_diagnosis_id?: string | null;
                status?: components["schemas"]["PrescriptionStatus"] | null;
                internal_folio?: number | null;
                internal_folio_gte?: number | null;
                internal_folio_lte?: number | null;
                id_in?: string[] | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_PrescriptionListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_prescription_api_v1_prescriptions_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PrescriptionCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrescriptionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_prescription_api_v1_prescriptions__prescription_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                prescription_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrescriptionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_prescription_api_v1_prescriptions__prescription_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                prescription_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrescriptionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_prescription_api_v1_prescriptions__prescription_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                prescription_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PrescriptionUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrescriptionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    approve_prescription_api_v1_prescriptions__prescription_id__approve_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                prescription_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PrescriptionApprove"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrescriptionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    void_prescription_api_v1_prescriptions__prescription_id__void_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                prescription_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PrescriptionVoid"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrescriptionRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_quality_check_api_v1_quality_check_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QualityCheckRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QualityCheckResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    report_activity_api_v1_reports_activity_get: {
        parameters: {
            query: {
                /** @description Inicio del rango (YYYY-MM-DD), inclusivo. */
                date_from: string;
                /** @description Fin del rango (YYYY-MM-DD), inclusivo. */
                date_to: string;
                /** @description Filtra por médico. */
                doctor_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActivityPoint"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    report_top_diagnoses_api_v1_reports_top_diagnoses_get: {
        parameters: {
            query: {
                /** @description Inicio de la ventana (YYYY-MM-DD), inclusivo. */
                date_from: string;
                /** @description Fin de la ventana (YYYY-MM-DD), inclusivo. */
                date_to: string;
                /** @description Máximo de diagnósticos. */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TopDiagnosis"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    report_unsigned_notes_api_v1_reports_unsigned_notes_get: {
        parameters: {
            query?: {
                /** @description Filtra por médico. */
                doctor_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnsignedNotesItem"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    report_attendance_api_v1_reports_attendance_get: {
        parameters: {
            query: {
                /** @description Inicio de la ventana (YYYY-MM-DD), inclusivo. */
                date_from: string;
                /** @description Fin de la ventana (YYYY-MM-DD), inclusivo. */
                date_to: string;
                /** @description Filtra por médico. */
                doctor_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttendanceReport"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_pubmed_api_v1_research_pubmed_get: {
        parameters: {
            query: {
                /** @description Términos de búsqueda. */
                query: string;
                /** @description Máximo de artículos (1-50). */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PubMedSearchResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_pubmed_article_api_v1_research_pubmed__pmid__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                pmid: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PubMedArticle"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_resources_api_v1_resources_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResourceCapability"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_resource_capability_api_v1_resources__resource_name__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                resource_name: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResourceCapability"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_roles_api_v1_roles_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                is_active?: boolean | null;
                name?: string | null;
                id_in?: string[] | null;
                name_ne?: string | null;
                name_contains?: string | null;
                name_startswith?: string | null;
                name_endswith?: string | null;
                created_at_on?: string | null;
                created_at_before?: string | null;
                created_at_after?: string | null;
                created_at_from?: string | null;
                created_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_RoleListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_role_api_v1_roles_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_role_api_v1_roles__role_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_role_api_v1_roles__role_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_role_api_v1_roles__role_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_role_permissions_api_v1_roles__role_id__permissions_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RolePermissionsRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    replace_role_permissions_api_v1_roles__role_id__permissions_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                role_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RolePermissionsReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetailRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_scale_results_api_v1_scale_results_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                consultation_id?: string | null;
                scale_id?: string | null;
                id_in?: string[] | null;
                computed_at_on?: string | null;
                computed_at_before?: string | null;
                computed_at_after?: string | null;
                computed_at_from?: string | null;
                computed_at_to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_ScaleResultListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_scale_result_api_v1_scale_results_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScaleResultCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScaleResultRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_scale_result_api_v1_scale_results__result_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                result_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScaleResultRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_scale_result_api_v1_scale_results__result_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                result_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScaleResultRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_scale_result_api_v1_scale_results__result_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                result_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScaleResultUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScaleResultRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_study_orders_api_v1_study_orders_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                patient_id?: string | null;
                ordered_by?: string | null;
                status?: components["schemas"]["StudyOrderStatus"] | null;
                id_in?: string[] | null;
                ordered_at_on?: string | null;
                ordered_at_before?: string | null;
                ordered_at_after?: string | null;
                ordered_at_from?: string | null;
                ordered_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_StudyOrderListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_study_order_api_v1_study_orders_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StudyOrderCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StudyOrderRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_study_order_api_v1_study_orders__order_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StudyOrderRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_study_order_api_v1_study_orders__order_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StudyOrderRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_study_order_api_v1_study_orders__order_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StudyOrderUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StudyOrderRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_profile_api_v1_users_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserProfileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_profile_api_v1_users_me_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserProfileUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserProfileRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    change_password_api_v1_users_me_password_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserPasswordChangeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_users_api_v1_users_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                is_active?: boolean | null;
                email?: string | null;
                name?: string | null;
                id_in?: string[] | null;
                name_ne?: string | null;
                name_contains?: string | null;
                name_startswith?: string | null;
                name_endswith?: string | null;
                email_ne?: string | null;
                email_contains?: string | null;
                email_startswith?: string | null;
                email_endswith?: string | null;
                created_at_on?: string | null;
                created_at_before?: string | null;
                created_at_after?: string | null;
                created_at_from?: string | null;
                created_at_to?: string | null;
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_UserAdminListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_user_api_v1_users_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserAdminCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_user_api_v1_users__user_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_user_api_v1_users__user_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_user_api_v1_users__user_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserAdminUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_user_roles_api_v1_users__user_id__roles_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                is_active?: boolean | null;
                name?: string | null;
                id_in?: string[] | null;
                q?: string | null;
            };
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_RoleRead_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    replace_user_roles_api_v1_users__user_id__roles_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserRolesReplace"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    revoke_user_sessions_api_v1_users__user_id__revoke_sessions_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserAdminRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_vital_signs_api_v1_vital_signs_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Campos de orden separados por coma. Use '-' para orden descendente. */
                sort?: string;
                consultation_id?: string | null;
                id_in?: string[] | null;
                measured_at_on?: string | null;
                measured_at_before?: string | null;
                measured_at_after?: string | null;
                measured_at_from?: string | null;
                measured_at_to?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OffsetPage_VitalSignListItem_"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_vital_sign_api_v1_vital_signs_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VitalSignCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VitalSignRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_vital_sign_api_v1_vital_signs__vital_sign_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                vital_sign_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VitalSignRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_vital_sign_api_v1_vital_signs__vital_sign_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                vital_sign_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VitalSignRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_vital_sign_api_v1_vital_signs__vital_sign_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                vital_sign_id: string;
            };
            cookie?: {
                session_token?: string | null;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VitalSignUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VitalSignRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
