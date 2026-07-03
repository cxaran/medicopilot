# MedicoPilot

## Sistema de Expediente Clínico Electrónico Local con Copiloto de Inteligencia Artificial

Documento para definición de alcance, funciones incluidas, límites del proyecto y condiciones de implementación.

**Versión 1.0**
**Fecha: 17 de junio de 2026**

> Nota: La inteligencia artificial se plantea como herramienta de apoyo. Toda información clínica generada por IA deberá ser revisada y aprobada por el médico.

> **Linaje:** MedicoPilot es un fork de **Platform Core** (base administrativa reutilizable y auto-hospedada: autenticación, RBAC, motor de query allowlist, contrato de recursos capability-driven, configuración del sistema, auditoría, Taskiq y respaldos a Google Drive). Sobre esa base, MedicoPilot añade el dominio clínico, el copiloto de IA y el `model-gateway`. Las mejoras genéricas (no clínicas) deben considerarse para retro-portarse a Platform Core, y viceversa, para mantener ambas plataformas a la par.

---

## Contenido

1. Resumen del proyecto
2. Objetivo principal
3. Problema que se busca resolver
4. Enfoque general de la solución
5. Alcance inicial del proyecto
6. Alcance del copiloto de inteligencia artificial
7. Instalación local
8. Acceso remoto seguro
9. Respaldo de información
10. Consideraciones de privacidad y responsabilidad
11. Etapa de ajustes y estabilización
12. Lo que incluye el alcance inicial
13. Lo que no incluye el alcance inicial
14. Fases recomendadas del proyecto
15. Criterios de aceptación de la primera versión
16. Responsabilidades del proveedor
17. Responsabilidades del cliente
18. Control de cambios
19. Limitaciones importantes
20. Resultado esperado
21. Conclusión
22. Aceptación del alcance

---

## 1. Resumen del proyecto

Se propone el desarrollo de un sistema privado para consultorio médico que permita administrar de forma ordenada la información clínica de los pacientes, incluyendo expedientes, historia clínica, consultas, signos vitales, diagnósticos, recetas, archivos, agenda, reportes básicos y apoyo con inteligencia artificial.

El sistema estará pensado principalmente para uso local dentro del consultorio, con la posibilidad de habilitar acceso remoto seguro si el doctor lo requiere y si existen las condiciones técnicas adecuadas. Este acceso remoto puede requerir servicios externos, dominio, nube, configuración adicional o costos no incluidos en el desarrollo base.

Además, se integrará un copiloto de inteligencia artificial cuyo objetivo principal será reducir el tiempo de escritura del médico mediante dictado, transcripción, resumen y generación de notas clínicas en borrador.

La inteligencia artificial no tomará decisiones médicas por sí sola. Su función será asistir al doctor en la documentación, organización y revisión de información. Toda nota, receta, diagnóstico, indicación o sugerencia generada por IA deberá ser revisada, corregida y aprobada por el médico antes de guardarse como información final.

## 2. Objetivo principal

Desarrollar un sistema médico privado que ayude al doctor a:

- Reducir el tiempo dedicado a escribir durante la consulta.
- Tener expedientes clínicos más organizados.
- Consultar rápidamente antecedentes, diagnósticos, tratamientos y recetas.
- Generar notas clínicas y recetas de forma más ágil.
- Centralizar archivos, estudios y documentos del paciente.
- Administrar citas y seguimiento.
- Usar inteligencia artificial como apoyo para documentación médica.
- Mantener mayor control sobre la información del consultorio mediante instalación local.
- Contar con una base funcional que pueda crecer por etapas.

## 3. Problema que se busca resolver

En la operación diaria del consultorio, el médico puede perder mucho tiempo en actividades administrativas y repetitivas, como:

- Escribir notas clínicas desde cero.
- Buscar información previa del paciente.
- Revisar antecedentes dispersos.
- Recordar tratamientos anteriores.
- Llenar recetas manualmente.
- Organizar archivos físicos o digitales.
- Dar seguimiento a pacientes.
- Consultar historial de visitas anteriores.

Esto puede reducir el tiempo disponible para la atención médica directa y provocar que la información clínica quede incompleta, dispersa o difícil de consultar.

El sistema propuesto busca resolver este problema mediante una plataforma centralizada, sencilla y adaptada al flujo real de trabajo del doctor.

## 4. Enfoque general de la solución

La solución se plantea bajo cuatro principios principales.

### 4.1 Sistema local

La información principal se almacenará en una computadora o servidor local del consultorio. Esto permite mayor control sobre la información clínica y reduce la dependencia de una plataforma externa.

### 4.2 Expediente clínico estructurado

La información del paciente se organizará por secciones: datos generales, historia clínica, consultas, signos vitales, diagnósticos, recetas, archivos y seguimiento.

### 4.3 Copiloto de IA

La inteligencia artificial apoyará al doctor en tareas como dictado, transcripción, resumen, generación de nota clínica y organización de la información.

### 4.4 Crecimiento por etapas

El sistema se desarrollará por fases para iniciar con lo más importante y posteriormente agregar funciones avanzadas, como acceso remoto seguro, búsqueda inteligente, diagnóstico diferencial, reportes avanzados o asistencia farmacológica controlada.

## 5. Alcance inicial del proyecto

El alcance inicial contempla una primera versión funcional del sistema con los módulos necesarios para que el doctor pueda comenzar a usarlo en consulta.

### 5.1 Módulo de usuarios y acceso

El sistema incluirá acceso mediante usuario y contraseña.

**Funciones incluidas:**

- Inicio de sesión.
- Cierre de sesión.
- Cambio de contraseña.
- Roles básicos de usuario.
- Permisos básicos por tipo de usuario.
- Bloqueo o desactivación de usuarios.
- Registro básico de accesos.

**Roles sugeridos:**

- Doctor.
- Asistente o recepción.
- Administrador.

El doctor tendrá acceso completo al expediente clínico. La asistente podrá tener acceso limitado a datos administrativos, citas y registro inicial de pacientes. El administrador podrá gestionar configuración básica del sistema y usuarios.

### 5.2 Módulo de pacientes

Permitirá registrar, consultar y actualizar la información general del paciente.

**Funciones incluidas:**

- Alta de paciente.
- Edición de datos generales.
- Consulta de ficha del paciente.
- Búsqueda de pacientes.
- Número interno de expediente.
- Estado del paciente: activo, inactivo o archivado.
- Registro de datos importantes visibles en resumen.

**Campos incluidos:**

- Nombre completo.
- Fecha de nacimiento.
- Edad calculada.
- Sexo.
- Teléfono.
- Correo electrónico.
- Dirección.
- CURP, opcional.
- Ocupación, opcional.
- Estado civil, opcional.
- Contacto de emergencia.
- Teléfono de emergencia.
- Alergias conocidas.
- Enfermedades crónicas.
- Medicamentos actuales.
- Observaciones importantes.
- Fecha de alta.
- Última consulta.

### 5.3 Módulo de historia clínica

Permitirá registrar información clínica relevante del paciente.

**Funciones incluidas:**

- Registro de antecedentes.
- Edición controlada de historia clínica.
- Vista organizada por secciones.
- Resumen general del historial.
- Actualización de datos importantes.

**Secciones incluidas:**

- Antecedentes heredofamiliares.
- Antecedentes personales patológicos.
- Antecedentes personales no patológicos.
- Cirugías previas.
- Hospitalizaciones.
- Alergias.
- Medicamentos actuales.
- Enfermedades crónicas.
- Hábitos relevantes.
- Antecedentes gineco-obstétricos, si aplica.
- Observaciones clínicas.

### 5.4 Módulo de consultas médicas

Permitirá registrar cada consulta realizada al paciente.

**Funciones incluidas:**

- Crear nueva consulta.
- Registrar motivo de consulta.
- Registrar padecimiento actual.
- Registrar interrogatorio.
- Registrar exploración física.
- Registrar signos vitales.
- Registrar diagnóstico o impresión diagnóstica.
- Registrar tratamiento.
- Registrar indicaciones.
- Registrar plan de seguimiento.
- Relacionar receta a la consulta.
- Relacionar archivos o estudios.
- Guardar nota clínica.
- Consultar historial de consultas.
- Editar consulta antes de cierre.
- Marcar consulta como finalizada.

**Campos incluidos:**

- Fecha y hora.
- Médico tratante.
- Motivo de consulta.
- Padecimiento actual.
- Interrogatorio.
- Exploración física.
- Diagnóstico.
- Tratamiento.
- Indicaciones.
- Pronóstico, si aplica.
- Plan de seguimiento.
- Próxima cita, si aplica.
- Observaciones.
- Nota generada por IA, cuando aplique.
- Estado de la consulta.

### 5.5 Módulo de signos vitales

Permitirá registrar mediciones durante la consulta.

**Campos incluidos:**

- Peso.
- Talla.
- IMC calculado.
- Temperatura.
- Presión arterial.
- Frecuencia cardiaca.
- Frecuencia respiratoria.
- Saturación de oxígeno.
- Glucosa capilar, opcional.
- Dolor en escala 0 a 10, opcional.
- Observaciones.

### 5.6 Módulo de recetas médicas

Permitirá generar recetas médicas en formato imprimible o PDF.

**Funciones incluidas:**

- Crear receta desde una consulta.
- Agregar medicamentos.
- Agregar dosis.
- Agregar frecuencia.
- Agregar duración.
- Agregar indicaciones.
- Generar receta en PDF.
- Imprimir receta.
- Consultar historial de recetas.
- Reutilizar medicamentos frecuentes.
- Editar receta antes de emisión final.

**Campos incluidos:**

- Paciente.
- Médico.
- Fecha.
- Diagnóstico relacionado, opcional.
- Medicamento.
- Presentación.
- Dosis.
- Frecuencia.
- Duración.
- Indicaciones.
- Observaciones.
- Datos del doctor.
- Cédula profesional.
- Folio interno, si se requiere.

La receta final deberá ser revisada y autorizada por el doctor antes de entregarse al paciente.

### 5.7 Módulo de archivos clínicos

Permitirá almacenar documentos relacionados con el paciente.

**Funciones incluidas:**

- Subir archivos.
- Asociar archivo a paciente.
- Asociar archivo a consulta, opcional.
- Clasificar archivo por tipo.
- Consultar archivos del paciente.
- Descargar archivo.
- Eliminar o archivar archivo según permisos.

**Tipos de archivo considerados:**

- Laboratorios.
- Estudios.
- Imágenes.
- PDFs.
- Recetas externas.
- Fotografías clínicas.
- Consentimientos.
- Documentos de referencia.
- Otros documentos médicos.

**Campos incluidos:**

- Nombre del archivo.
- Tipo de documento.
- Paciente relacionado.
- Consulta relacionada, opcional.
- Fecha del documento.
- Fecha de carga.
- Descripción.
- Usuario que cargó el archivo.

### 5.8 Módulo de agenda y citas

Permitirá organizar citas médicas del consultorio.

**Funciones incluidas:**

- Crear cita.
- Editar cita.
- Cancelar cita.
- Reprogramar cita.
- Ver agenda diaria.
- Ver agenda semanal.
- Ver citas por paciente.
- Asignar motivo de cita.
- Marcar estado de cita.

**Estados de cita:**

- Pendiente.
- Confirmada.
- Atendida.
- Cancelada.
- Reprogramada.
- No asistió.

**Campos incluidos:**

- Paciente.
- Fecha.
- Hora.
- Duración estimada.
- Motivo.
- Estado.
- Notas internas.
- Usuario que registró la cita.

### 5.9 Módulo de búsqueda

El sistema contará con búsqueda para localizar información rápidamente.

**Búsquedas incluidas en primera etapa:**

- Buscar paciente por nombre.
- Buscar paciente por teléfono.
- Buscar paciente por número de expediente.
- Buscar por fecha de consulta.
- Buscar por diagnóstico escrito.
- Buscar por medicamento.
- Buscar por palabra clave en notas.
- Buscar por alergia.
- Buscar por enfermedad crónica.

Búsqueda inteligente con IA podrá considerarse en una etapa posterior o como función experimental sujeta a pruebas de viabilidad.

### 5.10 Módulo de reportes

El sistema incluirá reportes básicos para operación del consultorio.

**Reportes incluidos:**

- Total de pacientes registrados.
- Pacientes nuevos por periodo.
- Consultas por día.
- Consultas por semana.
- Consultas por mes.
- Citas pendientes.
- Citas atendidas.
- Citas canceladas.
- Recetas generadas.
- Diagnósticos más frecuentes, si se registran de forma estructurada.
- Medicamentos más indicados, si se registran de forma estructurada.
- Expedientes incompletos.
- Actividad básica de usuarios.
- Uso básico de IA, si aplica.

Los reportes avanzados, gráficas especiales, indicadores personalizados o tableros ejecutivos no forman parte del alcance inicial. Podrán revisarse durante la etapa de ajustes o en fases posteriores, y se cotizarán por separado si requieren desarrollo adicional.

### 5.11 Módulo de seguridad y auditoría

El sistema registrará acciones importantes para mantener trazabilidad.

**Funciones incluidas:**

- Registro de inicio de sesión.
- Registro de creación de pacientes.
- Registro de edición de datos.
- Registro de creación de consultas.
- Registro de generación de recetas.
- Registro de carga de archivos.
- Registro de uso de IA.
- Registro de accesos al expediente.
- Registro de usuarios que realizaron acciones importantes.

**Eventos considerados:**

- Usuario.
- Fecha y hora.
- Acción realizada.
- Módulo afectado.
- Paciente relacionado, si aplica.
- Detalle básico de la acción.

## 6. Alcance del copiloto de inteligencia artificial

La inteligencia artificial se integrará como una herramienta de apoyo para reducir carga de escritura, mejorar la organización del expediente y asistir al doctor en tareas de documentación médica.

La IA usada en el proyecto puede requerir costos externos que serán cubiertos por el cliente, como suscripciones, consumo por tokens, servicios de transcripción, modelos de lenguaje, herramientas de voz o servicios en la nube. La opción final se definirá según presupuesto, privacidad, calidad esperada y viabilidad técnica.

El objetivo del copiloto de IA no es sustituir el criterio médico, diagnosticar de forma autónoma ni emitir recetas por sí solo. Su función será generar borradores, organizar información y apoyar al doctor en la revisión de datos clínicos.

Toda información generada por IA deberá ser revisada, corregida y aprobada por el médico antes de guardarse como parte del expediente, receta, diagnóstico, indicación o nota final.

### 6.1 Enfoque realista del uso de IA

El uso de inteligencia artificial se implementará de manera progresiva, iniciando con funciones de menor riesgo y mayor utilidad práctica, principalmente orientadas a documentación médica.

La calidad de los resultados de IA puede depender de distintos factores, como:

- Claridad del audio.
- Ruido del consultorio.
- Forma de hablar o dictar del doctor.
- Calidad del micrófono.
- Equipo donde se instale el sistema.
- Modelo de IA utilizado.
- Conexión a internet, si se usa algún servicio externo.
- Complejidad de la consulta.
- Calidad de la información proporcionada.
- Pruebas y ajustes realizados durante el desarrollo.

Por lo anterior, las funciones de IA se tratarán como herramientas asistivas y estarán sujetas a pruebas, ajustes y validación práctica con el doctor.

### 6.2 Funciones de IA consideradas para primera etapa

En la primera etapa se buscará implementar un flujo básico de IA orientado a documentación médica.

**Funciones consideradas:**

- Dictado médico.
- Transcripción de voz a texto.
- Limpieza y mejora de redacción.
- Generación de nota clínica en borrador.
- Organización de nota en formato SOAP.
- Resumen breve de consulta.
- Extracción básica de datos relevantes desde texto.
- Preparación de receta en borrador cuando el doctor dicte indicaciones específicas.

Estas funciones se desarrollarán con el objetivo de reducir el tiempo de escritura del doctor. Sin embargo, su funcionamiento final será evaluado mediante pruebas reales de uso, ya que la precisión y calidad pueden variar según las condiciones de audio, el estilo de dictado y el tipo de consulta.

**Ejemplo de uso esperado:**

El doctor habla o dicta la consulta. El sistema convierte el audio en texto, la IA organiza la información y genera una nota clínica preliminar. El doctor revisa, modifica y aprueba antes de guardar.

El resultado generado por IA será considerado un borrador, no una nota médica final.

### 6.3 Alcance comprometido de IA en primera versión

Para efectos del alcance inicial, se considera incluido el desarrollo de un flujo funcional de apoyo con IA para:

1. Capturar o recibir texto dictado por el doctor.
2. Procesar la información con IA.
3. Generar una nota clínica preliminar.
4. Permitir que el doctor revise y edite el resultado.
5. Guardar únicamente la versión aprobada por el doctor.

El compromiso de la primera versión es contar con un flujo funcional de asistencia para documentación médica. No se garantiza que la IA genere notas perfectas, completas o listas para usarse sin revisión humana.

La revisión médica será siempre obligatoria.

### 6.4 Funciones de IA no autónomas

La IA podrá sugerir, resumir, organizar o preparar información, pero no podrá tomar decisiones clínicas finales.

**La IA no podrá:**

- Diagnosticar de forma autónoma.
- Recetar sin aprobación médica.
- Firmar notas clínicas.
- Guardar información final sin autorización.
- Sustituir el criterio profesional del doctor.
- Garantizar diagnósticos, tratamientos o resultados clínicos.

Toda sugerencia o texto generado deberá ser validado por el médico.

### 6.5 Funciones de IA sujetas a pruebas de viabilidad

Las siguientes funciones se consideran deseables para el proyecto, pero no forman parte garantizada del alcance inicial. Podrán explorarse mediante pruebas técnicas y funcionales para determinar si ofrecen resultados útiles, seguros y suficientemente confiables para el uso del doctor.

**Funciones a evaluar:**

- Búsqueda inteligente en historial médico.
- Resumen automático completo del paciente antes de consulta.
- Preguntas faltantes sugeridas.
- Diagnóstico diferencial.
- Signos de alarma.
- Sugerencia de estudios.
- Sugerencia de códigos CIE-10.
- Asistencia farmacológica controlada.
- Validación de alergias e interacciones.
- Análisis de documentos clínicos cargados.

Estas funciones podrán probarse como prototipos o módulos experimentales durante la fase de ajustes, pero su implementación final dependerá de:

- Calidad de los resultados.
- Nivel de riesgo clínico.
- Revisión y aprobación del doctor.
- Viabilidad técnica.
- Costos de servicios externos, si aplican.
- Capacidad del equipo local.
- Disponibilidad de fuentes confiables.
- Tiempo de desarrollo requerido.
- Seguridad y privacidad de la información.

Si alguna de estas funciones requiere más desarrollo, integración con catálogos, validaciones clínicas, proveedores externos o reglas especializadas, se podrá cotizar como fase adicional.

### 6.6 Diagnóstico diferencial y sugerencias clínicas

El diagnóstico diferencial, signos de alarma, preguntas faltantes o sugerencia de estudios se consideran funciones avanzadas de apoyo clínico.

En caso de implementarse, deberán presentarse únicamente como sugerencias para revisión del médico, no como diagnóstico definitivo ni indicación obligatoria.

**Ejemplo de presentación adecuada:**

> "Diagnósticos diferenciales a considerar, sujetos a valoración médica."

**No se presentará como:**

> "El diagnóstico es..."

El doctor será responsable de aceptar, modificar o descartar cualquier sugerencia.

### 6.7 Asistencia farmacológica controlada

La asistencia farmacológica es una función de mayor cuidado y no se considerará parte garantizada de la primera versión.

Antes de implementarse de forma formal, deberá evaluarse si el sistema cuenta con la información mínima necesaria para generar sugerencias de forma responsable, como:

- Edad.
- Peso, cuando aplique.
- Alergias.
- Medicamentos actuales.
- Diagnóstico o impresión diagnóstica.
- Embarazo o lactancia, si aplica.
- Enfermedades renales o hepáticas, si aplica.
- Contraindicaciones relevantes.
- Posibles interacciones.

Cualquier sugerencia farmacológica deberá considerarse únicamente como apoyo informativo y requerirá aprobación expresa del doctor.

El sistema no emitirá recetas automáticas sin revisión médica.

### 6.8 Criterio de aceptación para funciones de IA

Una función de IA se considerará aceptable cuando:

- Genere resultados útiles para el doctor.
- Permita edición antes de guardar.
- No guarde información final sin aprobación.
- Sea clara respecto a que el resultado es un borrador o sugerencia.
- Reduzca tiempo de captura o revisión.
- No genere riesgos por automatización no supervisada.
- Pueda usarse de forma práctica dentro del flujo de consulta.

Si una función de IA no alcanza resultados suficientemente útiles durante las pruebas, podrá dejarse como función pendiente, experimental o de fase posterior.

### 6.9 Aclaración importante sobre IA

La inteligencia artificial puede cometer errores, omitir información, interpretar incorrectamente datos o generar contenido incompleto. Por esta razón, el sistema se diseñará para que la IA trabaje siempre bajo supervisión del doctor.

El valor principal de la IA en esta primera etapa será ayudar a documentar más rápido, ordenar información y generar borradores. Las funciones clínicas avanzadas se evaluarán cuidadosamente antes de incorporarse como parte definitiva del sistema.

## 7. Instalación local

El sistema se instalará principalmente en una computadora o servidor local del consultorio.

### 7.1 Incluido

- Instalación del sistema en equipo definido.
- Configuración inicial.
- Base de datos local.
- Carpeta o repositorio local de archivos.
- Acceso desde el equipo principal.
- Posibilidad de acceso en red local, si el consultorio cuenta con red adecuada.
- Configuración inicial de usuarios.

### 7.2 Requisitos del equipo

Se recomienda contar con un equipo estable, preferentemente con:

- Procesador moderno.
- 16 GB de RAM como mínimo recomendado.
- Disco SSD.
- Espacio suficiente para archivos médicos.
- Sistema operativo actualizado.
- Conexión estable de red.
- No-break o respaldo de energía, recomendado.

En caso de usar IA local avanzada, podrían requerirse mayores recursos de hardware.

## 8. Acceso remoto seguro

El sistema podrá contar con acceso remoto para que el doctor pueda consultar o utilizar la plataforma fuera del consultorio, siempre que existan las condiciones técnicas adecuadas.

El acceso remoto se considera parte del objetivo del proyecto, pero puede requerir infraestructura adicional, configuración especial o costos externos, como dominio, servicios en la nube, certificados, túneles seguros, almacenamiento, servidor, herramientas de acceso o mantenimiento técnico.

### 8.1 Objetivo

Permitir que el doctor pueda acceder al sistema desde fuera del consultorio de forma controlada y segura, por ejemplo desde su casa, laptop, tablet o algún otro dispositivo autorizado.

**El objetivo es que el doctor pueda:**

- Consultar expedientes.
- Revisar agenda.
- Ver historial de pacientes.
- Dar seguimiento a consultas.
- Revisar recetas.
- Consultar archivos clínicos.
- Trabajar fuera del consultorio cuando sea necesario.

### 8.2 Enfoque de implementación

El acceso remoto no se hará exponiendo el sistema de forma directa e insegura a internet.

Se buscará una alternativa técnica adecuada según el equipo, red, presupuesto y necesidades del doctor.

**Opciones posibles:**

- Acceso mediante dominio propio.
- Acceso mediante subdominio.
- Certificado HTTPS.
- Servidor local expuesto de forma controlada.
- Servicio en la nube como intermediario.
- Túnel seguro.
- Autenticación por usuario y contraseña.
- Autenticación adicional si se requiere.
- Restricción de acceso por usuarios autorizados.
- Registro de accesos remotos.
- Configuración de permisos por rol.

La opción final será definida después de revisar el entorno técnico del consultorio y los costos asociados.

### 8.3 Costos externos posibles

El acceso remoto puede requerir servicios o herramientas externas que no dependen directamente del desarrollo del sistema.

**Estos costos pueden incluir, según la solución elegida:**

- Compra de dominio.
- Renovación anual de dominio.
- Certificado SSL/HTTPS, si no se usa una opción gratuita compatible.
- Servicio de nube.
- Servidor VPS.
- Servicio de túnel seguro.
- Almacenamiento externo.
- Servicios de respaldo.
- Configuración de DNS.
- Herramientas de monitoreo o seguridad.
- Mantenimiento técnico periódico.

Estos costos no forman parte del desarrollo base, salvo que se acuerden explícitamente dentro de la cotización.

### 8.4 Seguridad mínima para acceso remoto

Para habilitar acceso remoto, se recomienda que el sistema cuente como mínimo con:

- Usuarios individuales.
- Contraseñas seguras.
- Roles y permisos.
- Cierre automático de sesión.
- Registro de accesos.
- Registro de intentos fallidos.
- Conexión cifrada mediante HTTPS o mecanismo equivalente.
- Acceso restringido únicamente a usuarios autorizados.
- Respaldo de información.
- Medidas para evitar exposición directa e insegura del sistema.

En caso de que el doctor solicite acceso remoto, se deberá validar que la configuración sea técnicamente segura antes de dejarla en operación.

### 8.5 No recomendado

No se recomienda abrir directamente el sistema a internet sin una capa de seguridad, ya que se manejará información clínica sensible.

Tampoco se recomienda compartir usuarios o contraseñas entre varias personas, utilizar contraseñas débiles, acceder desde dispositivos no confiables o dejar el sistema expuesto sin monitoreo básico.

### 8.6 Alcance incluido

**Dentro del alcance inicial se considera:**

- Preparar el sistema para que pueda funcionar con acceso remoto.
- Definir la alternativa técnica más viable.
- Configurar acceso remoto básico si las condiciones técnicas lo permiten.
- Implementar usuarios y permisos.
- Registrar accesos principales al sistema.
- Recomendar medidas de seguridad.

### 8.7 Alcance sujeto a costos o fase adicional

**Podrán requerir costo adicional o fase posterior:**

- Compra y configuración de dominio.
- Configuración avanzada de DNS.
- Contratación de servidor en la nube.
- Contratación de servicios de túnel o acceso seguro.
- Configuración avanzada de seguridad.
- Autenticación de dos factores.
- Monitoreo de accesos.
- Alertas de seguridad.
- Respaldos externos automáticos.
- Alta disponibilidad.
- Soporte fuera del horario acordado.
- Mantenimiento continuo del acceso remoto.

### 8.8 Aclaración importante

El acceso remoto se implementará buscando una solución práctica y segura para el doctor. Sin embargo, su funcionamiento dependerá de factores externos como conexión a internet, equipo local, proveedor de dominio, servicios en la nube, red del consultorio y herramientas contratadas.

Por lo tanto, el acceso remoto podrá requerir ajustes, pruebas y costos adicionales para asegurar una operación estable y segura.

## 9. Respaldo de información

El sistema deberá contar con mecanismos de respaldo para reducir riesgo de pérdida de datos.

### 9.1 Incluido en primera etapa

- Respaldo local básico.
- Opción de respaldo manual.
- Carpeta de respaldo definida.
- Recomendación de respaldo externo.

### 9.2 Recomendado para etapa posterior

- Respaldo automático diario.
- Respaldo cifrado.
- Respaldo externo.
- Verificación de respaldo.
- Procedimiento de restauración.
- Notificación de fallos de respaldo.

La responsabilidad de conservar copias externas y proteger físicamente el equipo deberá acordarse con el cliente.

## 10. Consideraciones de privacidad y responsabilidad

El sistema manejará información médica y datos personales sensibles, por lo que se recomienda considerar:

- Aviso de privacidad.
- Consentimiento para tratamiento de datos.
- Consentimiento para uso de herramientas de IA, si se graba, transcribe o procesa información de consulta.
- Usuarios individuales, no cuentas compartidas.
- Control de accesos.
- Respaldo seguro.
- No compartir contraseñas.
- Protección física del equipo local.
- Revisión médica de toda nota y receta generada.

El sistema puede diseñarse alineado a buenas prácticas de expediente clínico electrónico, seguridad y trazabilidad. Sin embargo, una certificación normativa formal o auditoría legal no forma parte del alcance inicial, salvo contratación específica.

## 11. Etapa de ajustes y estabilización

Después de entregar la primera versión funcional del sistema, se contemplará una etapa de ajustes y estabilización. Esta etapa tiene como objetivo revisar el funcionamiento real del sistema con el doctor, corregir detalles, mejorar la experiencia de uso y realizar ajustes razonables sobre las funciones previamente acordadas.

Esta etapa no debe entenderse como una fase de desarrollo ilimitado ni como apertura para agregar nuevos módulos, automatizaciones complejas o funcionalidades no incluidas en el alcance inicial.

### 11.1 Objetivo de la etapa de ajustes

El objetivo principal será asegurar que el sistema entregado funcione correctamente conforme al alcance pactado y que el doctor pueda utilizarlo de forma práctica en su flujo diario de trabajo.

**Durante esta etapa se podrán revisar:**

- Errores detectados en el uso.
- Detalles de interfaz.
- Textos, etiquetas o nombres de campos.
- Orden de campos.
- Ajustes menores en formularios.
- Correcciones en recetas PDF.
- Ajustes visuales razonables.
- Mejoras pequeñas de navegación.
- Ajustes menores en reportes incluidos.
- Correcciones en permisos o accesos.
- Ajustes en el flujo de captura de consulta.
- Mejoras menores en la generación de nota con IA, según resultados de prueba.

### 11.2 Qué sí se considera ajuste incluido

Se considerarán ajustes incluidos aquellos cambios que no alteren el alcance principal del sistema y que estén relacionados con funciones ya desarrolladas.

**Ejemplos de ajustes incluidos:**

- Cambiar el nombre de un campo.
- Reordenar campos en una pantalla.
- Corregir errores de captura o visualización.
- Ajustar el formato de impresión de la receta.
- Modificar textos de botones o etiquetas.
- Ajustar el orden de secciones en historia clínica.
- Mejorar la presentación de datos del paciente.
- Agregar validaciones simples en campos existentes.
- Corregir filtros o búsquedas ya incluidas.
- Ajustar detalles del resumen generado por IA.
- Mejorar instrucciones del prompt de IA dentro del flujo ya pactado.
- Corregir errores que impidan usar funciones acordadas.

### 11.3 Qué no se considera ajuste incluido

No se considerarán ajustes incluidos aquellas solicitudes que impliquen crear nuevas funciones, nuevos módulos, nuevas integraciones, lógica compleja adicional o cambios importantes al diseño original.

**Ejemplos de solicitudes fuera de la etapa de ajustes:**

- Crear una app móvil.
- Crear portal para pacientes.
- Agregar facturación electrónica.
- Agregar pagos en línea.
- Integrar WhatsApp.
- Integrar SMS.
- Integrar laboratorios externos.
- Integrar farmacias.
- Agregar videoconsulta.
- Crear nuevos dashboards avanzados.
- Crear reportes personalizados complejos.
- Agregar múltiples sucursales.
- Agregar multi-doctor avanzado.
- Migrar expedientes antiguos.
- Digitalizar documentos físicos.
- Agregar firma electrónica avanzada.
- Implementar diagnóstico automático.
- Implementar receta automática.
- Implementar validación farmacológica avanzada.
- Implementar interacciones medicamentosas completas.
- Crear catálogos médicos extensos no pactados.
- Cambiar por completo el diseño visual aprobado.
- Cambiar la arquitectura del sistema.
- Cambiar el sistema de instalación local a nube completa.
- Crear nuevas automatizaciones no contempladas.
- Agregar funciones de IA avanzadas no validadas previamente.

Estas solicitudes podrán revisarse, priorizarse y cotizarse como mejoras, módulos adicionales o fases posteriores.

### 11.4 Duración y rondas de ajustes

Se recomienda considerar una etapa de ajustes de 15 a 30 días naturales posteriores a la entrega de la primera versión funcional.

La etapa de ajustes podrá organizarse en hasta dos rondas:

**Primera ronda**

El doctor revisará el sistema y entregará una lista de observaciones sobre errores, detalles o ajustes menores.

**Segunda ronda**

Se revisarán los ajustes aplicados y se corregirán detalles finales relacionados con la primera revisión.

Después de estas rondas, cualquier nueva solicitud podrá considerarse mantenimiento, mejora o cambio de alcance.

### 11.5 Forma de solicitar ajustes

Para mantener control del proyecto, los ajustes deberán solicitarse por escrito, preferentemente en una lista clara.

**Cada solicitud deberá indicar:**

- Módulo afectado.
- Descripción del ajuste.
- Ejemplo del problema o cambio deseado.
- Prioridad.
- Si afecta una función ya pactada.

Esto permitirá clasificar cada solicitud como:

- Corrección incluida.
- Ajuste menor incluido.
- Mejora opcional.
- Cambio de alcance.
- Función para fase posterior.

### 11.6 Criterio para clasificar ajustes

Una solicitud se considerará ajuste incluido cuando cumpla con estas condiciones:

1. Está relacionada con una función ya pactada.
2. No requiere crear un módulo nuevo.
3. No requiere integración con terceros.
4. No cambia la arquitectura general del sistema.
5. No implica lógica clínica avanzada adicional.
6. No requiere rediseñar por completo una pantalla.
7. No agrega reportes complejos no contemplados.
8. No aumenta de forma importante el tiempo de desarrollo.
9. No implica costos externos adicionales.
10. No modifica el objetivo original de la primera versión.

Si no cumple con estas condiciones, se considerará cambio de alcance.

### 11.7 Ajustes relacionados con inteligencia artificial

Las funciones de IA estarán sujetas a pruebas y ajustes razonables, especialmente en la forma en que se generan notas, resúmenes o textos clínicos.

**Se podrán realizar ajustes como:**

- Mejorar instrucciones del asistente.
- Ajustar formato de la nota clínica.
- Cambiar estructura de la nota SOAP.
- Corregir estilo de redacción.
- Ajustar longitud del resumen.
- Mejorar la separación entre motivo de consulta, diagnóstico, tratamiento e indicaciones.

**No se considerará ajuste incluido:**

- Garantizar precisión total de la IA.
- Crear diagnóstico automático.
- Crear prescripción automática.
- Implementar interacciones medicamentosas completas.
- Agregar nuevos modelos de IA pagados sin acuerdo.
- Crear un sistema de validación clínica avanzado.
- Integrar bases médicas externas no contempladas.
- Analizar documentos clínicos complejos si no estaba pactado.
- Crear nuevas funciones clínicas de alto riesgo.

La IA será tratada como herramienta de apoyo y sus resultados deberán ser siempre revisados por el doctor.

### 11.8 Cambios urgentes o críticos

Si durante la etapa de ajustes se detecta un error que impide usar una función incluida en el alcance inicial, se dará prioridad a su corrección.

**Ejemplos:**

- No se puede guardar una consulta.
- No se puede generar una receta.
- No se puede acceder a pacientes.
- No se puede iniciar sesión.
- Se pierde información capturada.
- Un reporte incluido no muestra datos correctamente.

Estos casos se considerarán correcciones del sistema, no mejoras.

### 11.9 Cambios posteriores a la etapa de ajustes

Una vez concluida la etapa de ajustes, cualquier modificación adicional será tratada como:

- Mantenimiento.
- Mejora.
- Nuevo módulo.
- Cambio de alcance.
- Fase posterior.

Estas solicitudes podrán cotizarse por separado según complejidad, tiempo requerido y recursos necesarios.

## 12. Lo que incluye el alcance inicial

El alcance inicial incluye:

1. Sistema local funcional.
2. Inicio de sesión.
3. Roles básicos.
4. Registro de pacientes.
5. Historia clínica.
6. Consultas médicas.
7. Signos vitales.
8. Diagnósticos en texto.
9. Recetas en PDF.
10. Archivos del paciente.
11. Agenda básica.
12. Búsqueda básica.
13. Reportes básicos.
14. Auditoría básica.
15. Respaldo básico.
16. Copiloto de IA para dictado, transcripción y nota clínica en borrador.
17. Configuración inicial.
18. Capacitación básica de uso.
19. Etapa de ajustes y estabilización limitada a funciones pactadas.

## 13. Lo que no incluye el alcance inicial

Para evitar malentendidos, se aclara que el alcance inicial no incluye, salvo acuerdo adicional:

- Aplicación móvil nativa para Android o iOS.
- Portal para pacientes.
- Facturación electrónica.
- Cobros en línea.
- Integración con laboratorios externos.
- Integración con farmacias.
- Integración con aseguradoras.
- Integración con dispositivos médicos.
- Firma electrónica avanzada.
- Certificación NOM-024 o proceso formal de certificación.
- Auditoría legal o regulatoria.
- Diagnóstico automático.
- Receta automática sin aprobación médica.
- Asistencia farmacológica avanzada.
- Validación completa de interacciones medicamentosas.
- Catálogo completo de medicamentos.
- Catálogo completo CIE-10, salvo que se acuerde.
- Reportes personalizados ilimitados.
- Dashboard ejecutivo avanzado.
- Envío automático de WhatsApp.
- Envío automático de SMS.
- Correos automáticos masivos.
- Videoconsulta.
- Multi-sucursal.
- Multi-doctor avanzado.
- Migración masiva desde otros sistemas.
- Digitalización de expedientes físicos.
- Captura manual de expedientes antiguos.
- Hosting completo en la nube.
- Servidor físico incluido.
- Equipo de cómputo incluido.
- Costos externos de dominio, nube, servidor, túneles seguros, certificados, almacenamiento remoto, servicios de IA, tokens, suscripciones, servicios de respaldo o herramientas de terceros.
- Soporte indefinido sin contrato.
- Mantenimiento posterior no acordado.
- Cambios ilimitados de diseño o funcionalidad.

Cualquier función no mencionada explícitamente como incluida deberá considerarse fuera del alcance inicial y podrá cotizarse como mejora o fase adicional.

## 14. Fases recomendadas del proyecto

### Fase 1: Sistema clínico base

**Objetivo:** crear una versión funcional para uso diario.

**Incluye:**

- Pacientes.
- Historia clínica.
- Consultas.
- Signos vitales.
- Recetas.
- Archivos.
- Agenda.
- Búsqueda básica.
- Usuarios.
- Auditoría básica.
- Respaldo básico.

### Fase 2: IA para productividad médica

**Objetivo:** reducir tiempo de escritura.

**Incluye:**

- Dictado.
- Transcripción.
- Generación de nota clínica.
- Nota SOAP.
- Resumen de consulta.
- Receta en borrador.
- Mejora de redacción.

### Fase 3: Acceso remoto y seguridad avanzada

**Objetivo:** permitir consulta fuera del consultorio con mayor seguridad.

**Incluye:**

- Acceso remoto seguro.
- Autenticación adicional.
- Bitácora avanzada.
- Respaldos cifrados.
- Control de descargas.
- Control de impresión.

### Fase 4: Copiloto clínico avanzado

**Objetivo:** agregar funciones clínicas de apoyo.

**Incluye:**

- Preguntas faltantes.
- Signos de alarma.
- Diagnóstico diferencial.
- Búsqueda inteligente.
- Sugerencia de estudios.
- Códigos CIE-10.

### Fase 5: Asistencia farmacológica controlada

**Objetivo:** apoyar prescripción con reglas y validaciones.

**Incluye:**

- Medicamentos frecuentes.
- Validación de alergias.
- Medicamentos actuales.
- Contraindicaciones.
- Interacciones.
- Dosis sugeridas bajo revisión médica.
- Registro de aprobación o rechazo del doctor.

## 15. Criterios de aceptación de la primera versión

La primera versión se considerará funcional cuando permita:

- Iniciar sesión con usuarios definidos.
- Registrar pacientes.
- Consultar ficha de paciente.
- Registrar historia clínica.
- Crear consultas.
- Registrar signos vitales.
- Registrar diagnóstico y tratamiento.
- Generar receta en PDF.
- Subir archivos del paciente.
- Agendar citas.
- Buscar pacientes.
- Consultar historial de consultas.
- Generar reportes básicos.
- Registrar acciones principales en auditoría.
- Generar una nota clínica en borrador mediante IA.
- Guardar la nota aprobada por el doctor.
- Realizar respaldo básico de la información.

## 16. Responsabilidades del proveedor

El proveedor del sistema será responsable de:

- Diseñar la estructura funcional del sistema.
- Desarrollar los módulos acordados.
- Configurar la instalación local.
- Crear la base de datos inicial.
- Implementar usuarios y permisos básicos.
- Implementar receta PDF.
- Implementar funciones de IA acordadas.
- Realizar pruebas básicas.
- Capacitar al doctor o usuario principal.
- Entregar una versión funcional conforme al alcance acordado.
- Realizar la etapa de ajustes conforme a los límites establecidos.

## 17. Responsabilidades del cliente

El cliente será responsable de:

- Proporcionar información necesaria del consultorio.
- Proporcionar datos del doctor para recetas.
- Definir formato deseado de receta.
- Proporcionar equipo o servidor para instalación local.
- Mantener el equipo encendido y protegido.
- Proteger contraseñas.
- Revisar y aprobar notas generadas por IA.
- Revisar y aprobar recetas.
- Gestionar consentimiento de pacientes cuando aplique.
- Definir usuarios autorizados.
- Validar funcionamiento de la primera versión.
- Solicitar ajustes por escrito dentro del periodo acordado.
- Cubrir los costos externos necesarios para IA, acceso remoto, dominio, nube, servidor, almacenamiento, respaldo o herramientas de terceros, cuando estos sean requeridos para la operación del sistema.

## 18. Control de cambios

El presente documento define el alcance inicial del proyecto.

Cualquier solicitud adicional que no esté descrita en este documento será considerada cambio de alcance y deberá revisarse por separado.

**Ejemplos de cambios de alcance:**

- Nuevos módulos.
- Nuevos reportes personalizados.
- Integraciones externas.
- App móvil.
- Portal para pacientes.
- Automatizaciones adicionales.
- Cambios mayores de diseño.
- Nuevas reglas clínicas.
- Funciones avanzadas de IA.
- Migración de datos históricos.
- Acceso remoto avanzado.
- Soporte a múltiples consultorios.

Los cambios podrán cotizarse como mejoras, módulos adicionales o fases posteriores.

## 19. Limitaciones importantes

La inteligencia artificial puede cometer errores, omitir información o interpretar incorrectamente algunos datos. Por esta razón, el sistema debe utilizarse como herramienta de apoyo, no como sustituto del criterio médico.

Toda información generada por IA deberá ser revisada y aprobada por el doctor.

El sistema no garantiza diagnósticos, tratamientos ni resultados clínicos. La responsabilidad médica permanece en el profesional de salud.

La instalación local depende del estado del equipo, red, energía eléctrica, respaldos y seguridad física del consultorio.

El acceso remoto depende de factores externos como conexión a internet, proveedor de dominio, servicios en la nube, equipo local y herramientas contratadas.

El funcionamiento de IA puede depender de modelos, servicios externos, calidad del audio, estilo de dictado, costos de uso y ajustes realizados durante las pruebas.

## 20. Resultado esperado

Al finalizar la primera etapa, el doctor contará con un sistema local que le permitirá:

- Registrar pacientes.
- Mantener expedientes clínicos organizados.
- Documentar consultas.
- Generar recetas.
- Guardar archivos.
- Administrar citas.
- Consultar historial médico.
- Reducir tiempo de escritura con apoyo de IA.
- Tener reportes básicos.
- Contar con trazabilidad básica.
- Trabajar de manera más ágil y ordenada.

## 21. Conclusión

La propuesta busca crear una herramienta realista, práctica y útil para el trabajo diario del consultorio.

El sistema no pretende reemplazar al médico ni automatizar decisiones clínicas. Su objetivo es reducir carga administrativa, mejorar la organización del expediente y permitir que el doctor documente sus consultas de forma más rápida y ordenada.

La primera versión se enfocará en las funciones esenciales para uso diario. Las funciones avanzadas, como acceso remoto avanzado, diagnóstico diferencial, búsqueda inteligente, reportes personalizados y asistencia farmacológica, podrán desarrollarse posteriormente como fases adicionales o funciones sujetas a prueba de viabilidad.

Este documento establece el alcance funcional inicial del proyecto y servirá como base para evitar malentendidos, controlar cambios y definir claramente qué funciones estarán incluidas en la primera entrega.

## 22. Aceptación del alcance

Al aceptar esta propuesta, ambas partes reconocen que el alcance inicial del proyecto queda definido por las funciones, límites y condiciones descritas en este documento.

Cualquier función adicional no incluida expresamente podrá revisarse, priorizarse y cotizarse como mejora o fase posterior.

| | |
|---|---|
| **Nombre del cliente:** | ___________________________________________ |
| **Firma:** | ________________________________________________________ |
| **Fecha:** | ________________________________________________________ |
| **Nombre del proveedor:** | ________________________________________ |
| **Firma:** | ________________________________________________________ |
| **Fecha:** | ________________________________________________________ |