from backend.app.security.security_group import SecurityGroup


class ConversationPermissions(SecurityGroup):
    # Conversaciones del copiloto (chat-first). Permisos propios: leer y crear hilos. Persistir el
    # hilo NO es una escritura clínica; las escrituras clínicas (borradores) tienen su propio gate.
    READ = ("conversations:read", "Listar conversaciones del copiloto")
    CREATE = ("conversations:create", "Crear conversaciones del copiloto")


class MessagePermissions(SecurityGroup):
    # Mensajes de las conversaciones del copiloto. Leer el historial y agregar (append) mensajes.
    READ = ("messages:read", "Listar mensajes de una conversación")
    CREATE = ("messages:create", "Agregar mensajes a una conversación")
