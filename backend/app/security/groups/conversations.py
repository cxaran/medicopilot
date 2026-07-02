from backend.app.security.security_group import SecurityGroup


class ConversationPermissions(SecurityGroup, label="Conversaciones del copiloto"):
    # Conversaciones del copiloto (chat-first). Permisos propios: leer y crear hilos. Persistir el
    # hilo NO es una escritura clínica; las escrituras clínicas (borradores) tienen su propio gate.
    READ = ("conversations:read", "Listar conversaciones del copiloto")
    CREATE = ("conversations:create", "Crear conversaciones del copiloto")
    # Reiniciar el hilo: baja lógica en lote de sus mensajes (todos o desde un punto). Borra
    # HISTORIAL DE CHAT, nunca datos clínicos (los borradores aprobados viven en sus recursos).
    RESET = ("conversations:reset", "Reiniciar una conversación del copiloto")


class MessagePermissions(SecurityGroup, label="Mensajes del copiloto"):
    # Mensajes de las conversaciones del copiloto. Leer el historial y agregar (append) mensajes.
    READ = ("messages:read", "Listar mensajes de una conversación")
    CREATE = ("messages:create", "Agregar mensajes a una conversación")
    # Actualizar los METADATOS de presentación de un mensaje (``payload``: sobres de UI/tool
    # calls), p. ej. una interfaz marcada como usada tras guardarse el mensaje. El contenido y el
    # orden del hilo no se tocan; no es una escritura clínica.
    UPDATE = ("messages:update", "Actualizar los metadatos de un mensaje")
    # Baja lógica de un mensaje puntual del hilo (limpieza del chat, no es un borrado clínico).
    DELETE = ("messages:delete", "Eliminar mensajes de una conversación")
