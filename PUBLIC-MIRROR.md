# Espejo público sanitizado

Este repositorio público es un espejo sanitizado para revisión y colaboración. No debe tratarse como una copia completa de producción.

## Fuentes

- Producción: versión publicada 343.
- Fuente interna de producción: commit `40f2f49a996a3699aeeb8c16cd0dcedef2b3c140`.
- Rama pública: `main`.

## Qué puede contener este repositorio

- Componentes visuales y módulos reutilizables.
- Documentación, estilos, pruebas y configuraciones no secretas.
- Integraciones de demostración sin datos reales.
- Código de Radio Sindical, DeVi, Casa de Cultura, login y PWA únicamente cuando haya sido sanitizado.

## Qué no debe copiarse al repositorio público

- Variables de entorno, tokens, claves, cookies o certificados.
- Base de datos, padrón de matrículas, CURP, NSS, fotografías o documentos.
- Datos de Drive, R2, D1 o sesiones reales.
- Contraseñas, PIN, hashes, credenciales de firma o archivos APK privados.
- Endpoints administrativos completos o lógica que dependa de secretos de producción.
- Logs con información personal.

## Reglas para ChatGPT

1. Leer `AGENTS.md` y `CHATGPT-INSTRUCCIONES.md`.
2. Trabajar primero sobre `main` y crear una rama o commit pequeño.
3. No asumir que un archivo está desplegado solo porque existe en GitHub.
4. Para confirmar producción, comprobar el número de versión, el commit de despliegue y la respuesta real del portal.
5. Si una función requiere código que no está en este espejo, preparar una propuesta o parche sanitizado; no pedir ni publicar secretos.
6. Nunca afirmar que una tarea está completa sin pruebas o evidencia.
7. Para cambios de producción, la publicación debe realizarse desde la fuente interna autorizada.

## Estado conocido al 25 de septiembre de 2026

La versión pública de Radio Sindical es 0.10.1. La producción del portal está en la versión 343. La corrección PWA del login está publicada. La sincronización total de la fuente interna con este repositorio público no se realiza automáticamente para evitar exposición de información sensible.
