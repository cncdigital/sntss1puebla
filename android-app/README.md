# Credenciales SNTSS1Puebla para Android

Este proyecto convierte la aplicación web en una app Android y reproduce Radio
SNTSS Puebla de forma nativa con Jetpack Media3. La web continúa alojada en su
dirección oficial; el botón de la emisora es interceptado dentro de Android y
abre la señal Shoutcast `http://78.129.252.13:26059` mediante ExoPlayer.

## Funciones incluidas

- Aplicación web dentro de un contenedor Android seguro.
- Radio nativa con reproducción en segundo plano.
- Controles multimedia y notificación de reproducción.
- Cámara para lectores QR y selector de documentos.
- Acceso HTTP limitado exclusivamente a los dos servidores de la emisora.
- Enlaces externos abiertos fuera del contenedor.

## Generar el APK

1. Abrir la carpeta `android-app` con Android Studio.
2. Instalar Android SDK 36 cuando Android Studio lo solicite.
3. Esperar a que termine la sincronización de Gradle.
4. Seleccionar **Build > Build APK(s)** para una versión de prueba.
5. Para distribución, seleccionar **Build > Generate Signed App Bundle or APK**
   y crear una llave privada institucional que se conserve fuera del repositorio.

La señal debe encontrarse encendida en Shoutcast para que se escuche. Android
mostrará los controles de reproducción en las notificaciones y en la pantalla
bloqueada.

## Datos técnicos

- Paquete: `mx.sntss1puebla.credenciales`
- Android mínimo: 8.0 (API 26)
- Android objetivo: API 36
- Reproductor: Jetpack Media3 1.11.0
- Java: 17
