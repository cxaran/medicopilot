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
         * ClinicalDocumentType
         * @description Tipo de archivo clínico asociado al expediente del paciente.
         * @enum {string}
         */
        ClinicalDocumentType: "laboratory" | "study" | "image" | "pdf" | "external_prescription" | "clinical_photography" | "consent" | "reference" | "other";
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
         * ClinicalItemStatus
         * @description Estado reusable para datos clínicos importantes del paciente.
         * @enum {string}
         */
        ClinicalItemStatus: "active" | "inactive" | "resolved" | "suspended";
        /**
         * ClinicalSeverity
         * @description Severidad clínica reusable cuando aplica a un dato del paciente.
         * @enum {string}
         */
        ClinicalSeverity: "low" | "moderate" | "high" | "critical";
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
        /** OffsetPage[ClinicalDocumentListItem] */
        OffsetPage_ClinicalDocumentListItem_: {
            /** Items */
            items: components["schemas"]["ClinicalDocumentListItem"][];
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
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
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
         * RecordStatus
         * @description Estado operativo reusable para entidades activables del sistema.
         * @enum {string}
         */
        RecordStatus: "active" | "inactive" | "suspended";
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
         * Sex
         * @description Sexo registrado para fines clínicos y administrativos.
         * @enum {string}
         */
        Sex: "female" | "male" | "other" | "unspecified";
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
        /** UnlockAccountRequest */
        UnlockAccountRequest: {
            /** Token */
            token: string;
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
