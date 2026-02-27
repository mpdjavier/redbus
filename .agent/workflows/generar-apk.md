---
description: Proceso para generar el APK de Android
---

Este flujo de trabajo detalla los pasos para sincronizar los cambios de la web y generar un archivo APK instalable para Android utilizando Android Studio.

### 1. Sincronizar cambios de la Web
Antes de abrir Android Studio, debes asegurarte de que el proyecto nativo tenga la última versión de los archivos HTML/JS/CSS.
// turbo
```powershell
npx cap sync android
```

### 2. Abrir el proyecto en Android Studio
Si no tienes Android Studio abierto, puedes iniciarlo directamente desde la terminal:
```powershell
npx cap open android
```
*(También puedes abrir la carpeta `android` manualmente desde el menú `Open` de Android Studio).*

### 3. Generar el archivo APK
Una vez que Android Studio termine de indexar el proyecto (verás una barra de progreso abajo a la derecha):

1. En la barra superior de Android Studio, ve al menú **Build**.
2. Selecciona **Build Bundle(s) / APK(s)**.
3. Haz clic en **Build APK(s)**.

### 4. Localizar e instalar el APK
1. Android Studio comenzará a compilar. Cuando termine, aparecerá un globo de notificación abajo a la derecha que dice: *"APK(s) generated successfully for module 'android.app'"*.
2. Haz clic en el enlace azul **locate** dentro de esa notificación.
3. Se abrirá el explorador de archivos mostrando una carpeta llamada `debug` (o similar). Dentro encontrarás el archivo **app-debug.apk**.
4. Copia ese archivo a tu teléfono e instálalo.

> [!NOTE]
> Para la primera instalación, es posible que tu teléfono te pida permiso para "Instalar aplicaciones de fuentes desconocidas".
