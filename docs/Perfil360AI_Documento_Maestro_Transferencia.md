# Perfil 360 AI — Documento maestro de transferencia

**Fecha:** 2026-10-29
**Repositorio solicitado:** <https://github.com/saithfortxd1/perfil360pro>
**Proyecto local reportado:** `C:\Users\saith\Desktop\Perfil320pro`
**URL de producción reportada:** <https://perfil360ai.netlify.app>

> Este documento consolida información compartida por el usuario e informes de Codex. Las afirmaciones históricas se identifican como reportadas; las comprobaciones de esta sesión se marcan como verificadas en el código o mediante comandos locales. La URL de producción no se verificó.

## 1. Resumen ejecutivo

Perfil 360 AI es una aplicación web para simular entrevistas laborales en español. La experiencia objetivo es un reclutador virtual que formula preguntas profesionales, escucha, comprende las respuestas en contexto, hace seguimientos relevantes y genera una evaluación basada en evidencias. El usuario prioriza una experiencia de voz natural, una interfaz de alta calidad y continuidad de sesión.

**Stack comprobado en el proyecto:** React, TypeScript, Vite, Tailwind, Firebase Authentication/Firestore, Netlify Functions, Gemini API y Web Speech API. Hay código relacionado con HeyGen LiveAvatar; su disponibilidad operativa y sus credenciales actuales requieren comprobación por entorno.

**Problema pendiente del producto:** se reportaron respuestas HTTP 429 de Gemini y errores HTTP 500/`SERVICE_UNAVAILABLE`. El modo local permite continuar, pero su implementación es un cuestionario guiado por reglas y plantillas; no equivale a comprensión contextual libre. La siguiente mejora funcional debería centrarse en la orquestación de turnos, el contexto pertinente y una evaluación basada en evidencias, no en multiplicar plantillas sin criterio.

## 2. Reglas de trabajo

- Preservar cambios locales y archivos sin seguimiento; inspeccionar estado, diffs e historial antes de editar.
- No usar comandos destructivos para descartar trabajo (`git reset --hard`, `git clean -fd`, `git restore`, `git checkout --` o equivalentes).
- El usuario autorizó respaldar el estado local en `https://github.com/saithfortxd1/perfil360pro`, crear commits y hacer push, pero no autorizó despliegues ni cambios manuales de producción.
- Antes de publicar, revisar `.gitignore`, archivos `.env*`, credenciales, service accounts, claves Gemini/HeyGen, tokens, dumps, datos personales y transcripciones. No subir secretos ni información privada.
- Si se confirma un secreto real en el historial Git, detenerse antes de publicar y avisar. Excluirlo del nuevo commit no lo elimina del historial; considerar revocar/rotar la credencial y planificar limpieza segura.
- Confirmar remoto, rama e historial. No hacer force push. Ante divergencia o riesgo de pérdida, detenerse y reportar.
- Comprobar si el repositorio está conectado a despliegue automático de Netlify. Un push no autoriza cambios manuales de producción; si un auto-despliegue puede ocurrir, informar el riesgo.
- No realizar llamadas reales a Gemini ni consumir cuota sin autorización. No instalar dependencias ni desplegar sin autorización expresa.
- No afirmar que una prueba se ejecutó o pasó si no se observó el resultado. Separar hechos comprobados, informes previos, inferencias y pendientes.
- No continuar con Fase 2 hasta que el usuario la autorice.

## 3. Arquitectura y archivos

Rutas verificadas en el estado local de esta transferencia:

- `src/main.tsx`: entrada de React.
- `src/pages/SimuladorInmersivo.tsx`: UI, sesión del simulador, perfil y escenarios.
- `src/services/ai/geminiService.ts`: solicitudes y turnos de Gemini, fallback y errores.
- `src/services/ai/localInterviewFallback.ts`: entrevistas y evaluación locales.
- `src/services/ai/evaluationService.ts`: evaluación y persistencia.
- `src/services/ai/errorClassification.ts`: normalización tipada de errores.
- `src/types/ai.ts`: contratos/tipos de IA.
- `netlify/functions/gemini.ts`: `POST /api/gemini`.
- `netlify/lib/http.ts`: respuestas HTTP y CORS.
- `netlify/lib/firebaseAdmin.ts`: Firebase Admin.
- `netlify/lib/rateLimit.ts`: limitador Firestore.
- `src/hooks/useSpeech.ts`, `src/services/ai/voiceSelection.ts` y componentes de voz: voz del navegador y preferencias.
- `scripts/verify-gemini-api.cjs`, `scripts/verify-local-interview.mjs` y `scripts/verify-ai-error-contract.mjs`: verificaciones locales con mocks.

Comandos del proyecto:

- `npm run dev`: Netlify Dev y Vite integrados, URL local configurada `http://localhost:8888`.
- `npm run dev:vite`: solo Vite; no monta las funciones Netlify bajo `/api/*`.
- `npm run typecheck`
- `npm run typecheck:functions`
- `npm run verify:gemini`
- `npm run verify:local-interview`
- `node --experimental-strip-types scripts/verify-ai-error-contract.mjs`
- `npm run build`

## 4. Comportamiento deseado

### Entrevistador

- Habla en primera persona como reclutador, no como narrador de videojuego.
- Hace una pregunta principal breve y profesional por turno.
- Usa la respuesta actual, el historial pertinente, el escenario y el perfil disponible.
- Pide aclaraciones cuando la respuesta es vaga; profundiza cuando hay evidencia; reconduce respuestas fuera de tema con respeto.
- No repite saludos ni preguntas ya contestadas sin motivo.
- No inventa experiencia, cifras, logros, herramientas o datos del candidato.
- Conserva el contexto tras interrupciones, imprevistos y fallos del proveedor.

### Voz e interfaz

- La voz es prioritaria, con alternativa de escritura.
- Se reportó autoenvío después de aproximadamente 2,2 segundos de silencio.
- Se trabajó en selector de voces españolas, muestra, velocidad y persistencia; la velocidad predeterminada reportada es 1.10×.
- Se reportó un botón «Configurar voz» durante la entrevista.
- Se reportaron como entrevistadores activos Mateo, James y Andrés Mendoza; debe verificarse el estado actual si se modifica esa funcionalidad.
- Deben conservarse selección de voz, micrófono, avatar, interrupción y cierre de sesión.
- No rediseñar ampliamente durante tareas de infraestructura.
- En rutas con LiveAvatar, la voz puede configurarse del lado servidor y no mediante TTS del navegador.

## 5. Incidencias y conclusiones

### 429 de Gemini

Se reportó `HTTP 429 Too Many Requests`. El código local inspeccionado no reintenta automáticamente al proveedor después de 429. El estado HTTP por sí solo no identifica si el límite es por minuto, diario, saldo o política del proyecto.

### 500 / `SERVICE_UNAVAILABLE`

Se reportaron errores 500 de `/api/gemini` y clasificaciones de cliente `SERVICE_UNAVAILABLE`. En la auditoría anterior se encontraron posibles rutas en Firebase Admin/Gemini y el limitador Firestore, pero no había logs históricos para demostrar cuál provocó los errores observados. `ERR_BLOCKED_BY_CLIENT` puede provenir de extensiones o políticas del navegador y no debe atribuirse al 500 sin evidencia.

En el estado local actual, la clasificación distingue errores conocidos de autenticación, configuración, cuota, red, respuesta inválida, persistencia y proveedor. Un 500 genérico sin código confiable queda como desconocido; el error histórico sigue sin confirmación.

### Modo local

La implementación local usa reglas y plantillas; reconoce algunas palabras clave y evita algunas repeticiones. No tiene comprensión semántica libre. Debe presentarse como «práctica guiada local» con evaluación orientativa, no como equivalente a Gemini. La evaluación local se basa en señales simples de participación y longitud, no en evidencia profesional exhaustiva.

### Evaluación y persistencia

Gemini solicita salida estructurada; una respuesta inválida puede activar evaluación local. El servicio puede guardar evaluaciones en Firestore y el simulador guarda un resumen local, según el código existente. El error de persistencia está separado del resultado conversacional y el mensaje al usuario no incluye detalles internos.

## 6. Conteos teóricos de solicitudes Gemini

Conteos teóricos de una auditoría, no métricas reales. Con perfil suficiente, escenario personalizado, bienvenida, `N` respuestas, evaluación y dos imprevistos: cinco respuestas darían 10 solicitudes; diez darían 15. Sin imprevistos, `N + 3` (8 con cinco respuestas y 13 con diez). El registro local del nombre puede reducir una solicitud. Un recorrido totalmente local puede usar cero solicitudes. Reintentos manuales de escenarios y nuevas sesiones aumentan el total. No hay telemetría histórica suficiente para calcular consumo real o costos.

El historial se vuelve a enviar en turnos Gemini; por tanto, el volumen acumulado de entrada puede crecer más rápido que la cantidad de turnos. Se requiere una medición real para cuantificarlo.

## 7. Fase 1 — estabilización y observabilidad

### Estado local verificado el 2026-10-29

Se comprobaron los siguientes puntos en el checkout local actual:

- Contrato tipado de errores y preservación de categoría/estado/código de origen disponibles.
- Errores upstream diferenciados de autenticación Firebase; límites del limitador Firestore clasificados como persistencia.
- Instrumentación estructurada con identificador de operación y sin incluir prompts, transcripciones o perfiles.
- `npm run typecheck`: pasó.
- `npm run typecheck:functions`: pasó.
- `npm run verify:gemini`: 42 comprobaciones locales pasaron con mocks y cero llamadas externas.
- `npm run verify:local-interview`: pasó, incluido el recorrido local bajo errores simulados.
- `node --experimental-strip-types scripts/verify-ai-error-contract.mjs`: 17 comprobaciones pasaron.
- `git diff --check`: pasó sin errores de whitespace.
- Build de Vite en directorio temporal: pasó. No se ejecutó `npm run build` sobre `dist` existente para no sobrescribir artefactos previos; typecheck y bundle Vite se validaron por separado.
- El build mostró una advertencia de chunks mayores a 900 kB.
- No se hicieron pruebas manuales de navegador ni llamadas reales a Gemini.

**Pendiente:** confirmar la causa de los HTTP 500 históricos con logs originales; verificar la integración real solo cuando exista cuota y autorización.

## 8. Fase 2 propuesta — conversación adaptativa y evaluación basada en evidencia

No ejecutar sin autorización del usuario.

1. Auditar el contrato real de turnos e historial.
2. Mantener una pregunta principal por turno y seguimientos relevantes.
3. Aclarar respuestas vagas; profundizar en evidencia; cambiar de competencia cuando corresponda.
4. Evitar saludos y preguntas repetidas.
5. Controlar el contexto sin convertir inferencias en hechos ni perder evidencia útil.
6. Vincular competencias evaluadas a mensajes concretos.
7. Diferenciar evidencia explícita, insuficiente y ausencia de información.
8. Distinguir entrevista incompleta de entrevista terminada.
9. Separar generación de evaluación y persistencia.
10. Etiquetar el modo local como práctica guiada y su evaluación como orientativa.
11. Probar con mocks y no afirmar que esas pruebas demuestran calidad real de Gemini.

Casos sugeridos: respuestas claras, vagas y fuera de tema; competencia ya cubierta; equipo sin contribución individual; preguntas repetidas; cambio de competencia; historial largo; evaluación con evidencia insuficiente; entrevista incompleta; JSON inválido; fallo de persistencia tras evaluación válida; 429 sin reintentos; y cancelación/nueva sesión sin respuestas obsoletas.

No cambiar proveedor, autoalojar modelo, reescribir la aplicación ni rediseñar UI sin evidencia y autorización.

## 9. Respaldo y publicación en GitHub

El usuario autorizó publicar el estado local relevante en `https://github.com/saithfortxd1/perfil360pro`, crear commits y hacer push. Esta autorización no incluye deploy manual ni llamadas a Gemini.

Procedimiento seguro:

1. Confirmar raíz, `git status`, remoto, rama e historial.
2. Revisar diffs, archivos nuevos y `.gitignore`.
3. Excluir `.env.local`, `.env` con secretos, claves Gemini, service accounts Firebase, tokens, credenciales, claves HeyGen, dumps, transcripciones y datos reales.
4. Revisar staging exacto y diff staged antes del commit.
5. Hacer push solo si la rama remota es compatible. Nunca usar force push.
6. Revisar riesgo de despliegue automático; si no puede comprobarse, declararlo claramente.
7. Confirmar hash, rama y resultado real del push.

## 10. Incógnitas pendientes

- Causa real de los errores HTTP 500 históricos.
- Tipo exacto de límite Gemini alcanzado.
- Modelo y configuración efectivos por entorno, sin mostrar secretos.
- Calidad conversacional real de Gemini después de Fase 1.
- Pruebas manuales de micrófono, selector de voz y avatar.
- Estado operativo de HeyGen LiveAvatar.
- Métricas reales de usuarios, tokens, latencia y errores.
- Retención del transcript y requisitos de privacidad.
- Archivos locales con secretos o datos privados antes del push.
- Si GitHub está conectado a despliegue automático de Netlify.

## 11. Instrucciones para la siguiente IA

1. Leer este documento y verificar el checkout, la rama y el remoto.
2. No repetir la auditoría completa salvo que el código o el historial hayan cambiado sustancialmente.
3. Ejecutar pruebas locales seguras y distinguir mocks de Gemini real.
4. Continuar con Fase 2 solo después de autorización explícita.
5. Informar qué está verificado, qué procede de informes anteriores y qué permanece pendiente.

**Objetivo final:** una entrevista profesional, fluida y contextual; voz fiable; contingencias honestas; evaluación basada en evidencias; privacidad por diseño; y capacidad de cambiar de proveedor sin reconstruir la aplicación.
