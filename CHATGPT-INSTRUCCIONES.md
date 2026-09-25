# Instrucciones para ChatGPT — SNTSS1PUEBLA

## Propósito

Este repositorio corresponde al portal oficial del SNTSS Sección I Puebla y a su módulo de credenciales. ChatGPT debe trabajar con cuidado, conservar la funcionalidad existente y explicar claramente qué cambió.

## Regla principal de trabajo

Antes de modificar cualquier archivo:

1. Leer este documento, `README.md`, `.openai/hosting.json` y el estado actual del repositorio.
2. Sincronizar la rama de trabajo con `main`.
3. Revisar si existen cambios locales, ramas activas o respaldos.
4. Conservar el respaldo `backup/reto-sindical-2026-09-24`; no eliminarlo.
5. Crear o confirmar un respaldo antes de cambios que afecten autenticación, base de datos, roles, PWA, Worker o archivos de usuarios.
6. Hacer cambios mínimos y específicos. No reemplazar todo el proyecto ni pisar cambios ajenos.
7. Ejecutar compilación y pruebas antes de entregar.
8. Informar el commit, pruebas realizadas, resultado y si realmente se publicó.

Nunca afirmar que algo fue publicado si no existe confirmación del despliegue y una verificación posterior.

## Alcance del proyecto

El proyecto contiene, entre otros, estos módulos:

- Portal SNTSS1PUEBLA y Credenciales.
- Inicio de sesión por matrícula y contraseña.
- Roles administrativos, validadores, lectores QR, Actas y Acuerdos, Asuntos Técnicos, Deportes, Deportivo, SNTSS, Cultura y Chat.
- Credencialización y beneficiarios.
- DeVi, información personalizada, listados y entrenamiento.
- Radio Sindical, MP3, portadas, letras, anuncios, Android Auto y CarPlay.
- Casa de Cultura del Arte.
- Noticias, convenios, calendario de pagos, vacaciones y prima vacacional.
- Becas Sinabeth, eventos, lector QR y boletos.
- Calendario de espacios sindicales.
- PWA, instalación móvil, compartir y service worker.
- Worker Cloudflare, APIs, D1, R2 e integración con Google Drive.

## Seguridad obligatoria

- No mostrar, copiar ni publicar contraseñas, PIN, tokens, cookies, CURP, NSS, fotografías o archivos personales.
- No agregar secretos al código, GitHub, logs, capturas ni respuestas.
- No usar datos reales en pruebas nuevas; usar datos sintéticos.
- No desactivar autenticación, autorización, rate limiting, CSRF, validaciones de archivos o aislamiento del Worker para facilitar una prueba.
- No crear bypasses de administrador por correo, encabezados, URL o matrícula.
- No cambiar las matrículas administrativas, roles o permisos sin autorización explícita.
- Mantener las consultas SQL parametrizadas.
- Revisar que nunca se filtren `credential_token`, PIN, cookies o datos personales en logs.
- Las comparaciones de PIN deben ser resistentes a ataques de tiempo y la autorización debe permanecer centralizada.
- Priorizar la migración y conservación segura de hashes con PBKDF2, sal e iteraciones, sin romper la migración progresiva existente.

## Inicio de sesión y PWA

Al modificar login:

- Probar matrícula numérica.
- Probar contraseña personal y contraseña especial alfanumérica cuando corresponda.
- Verificar mensajes de error, bloqueo por intentos y cierre de sesión.
- Verificar roles normales y privilegiados sin exponer información.
- Confirmar que el service worker no recargue ni navegue la ventana mientras el usuario escribe.
- Versionar la caché del service worker cuando sea necesario.
- Probar instalación, apertura desde PWA, ruta `/`, ruta `/credenciales` y actualización de caché.
- No borrar sesiones ni registros de usuarios como “solución rápida”.

## Flujo técnico recomendado

Usar este orden:

```bash
git fetch origin
git status
git checkout main
git pull --ff-only origin main
# crear una rama de trabajo o conservar la rama solicitada
npm ci --ignore-scripts
chmod +x scripts/*.sh
npm run build
npm test
```

Si una prueba falla, diagnosticar primero. No ocultar el error ni marcar la tarea como terminada.

Para cambios de código:

1. Revisar el archivo real y sus dependencias.
2. Aplicar un cambio pequeño.
3. Compilar.
4. Ejecutar pruebas relevantes y regresiones.
5. Revisar el diff.
6. Crear commit descriptivo.
7. Publicar únicamente si el usuario lo solicita o el flujo conectado lo permite.
8. Verificar producción con la URL y logs, sin enviar datos sensibles.

## Publicación

- Usar el proyecto configurado en `.openai/hosting.json`; nunca inventar otro `project_id`.
- Sincronizar primero la fuente con `main`.
- El archivo de despliegue debe salir de la compilación exacta del commit publicado.
- Mantener el público, dominio y variables de entorno actuales salvo solicitud explícita.
- No reemplazar ni borrar variables de entorno existentes.
- Después de publicar, comprobar estado del despliegue, página principal, login y APIs públicas.
- Si ChatGPT normal no tiene acceso a Sites o a la publicación, debe entregar el commit o PR preparado y decir claramente que la publicación requiere Codex/Work o un usuario con permisos.

## Cómo responder al usuario

Responder en español, claro y directo. Indicar:

- Qué se detectó.
- Qué archivos se modificaron.
- Qué pruebas pasaron o fallaron.
- Commit o PR resultante.
- Si se publicó realmente o quedó pendiente.
- Qué debe hacer el usuario para verificarlo.

No pedir contraseñas ni solicitar que el usuario pegue secretos en el chat.

## Prioridad ante conflictos

1. Seguridad y protección de datos.
2. Instrucciones explícitas del usuario.
3. Integridad de `main`, respaldos y base de datos.
4. Funcionamiento del login y módulos existentes.
5. Mejoras visuales o nuevas funciones.

Si falta una autorización o existe riesgo de pérdida de datos, detener el cambio y pedir confirmación.
