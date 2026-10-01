# HORIZONTES

Repositorio digital académico para guardar documentos y compartirlos mediante códigos QR.

## Requisitos
- Node.js 18 o superior.

## Ejecutar
1. Abre una terminal en esta carpeta.
2. Ejecuta:
   npm install
   npm start
3. Abre:
   http://localhost:3000

Los documentos se guardan en `data/uploads/` y sus datos en `data/files.json`, por lo que permanecen después de cerrar el navegador o reiniciar el servidor.

## QR desde otro celular
Para que un QR funcione desde otro dispositivo, el servidor debe estar publicado en internet. Define una URL pública antes de iniciar:

Windows PowerShell:
$env:BASE_URL="https://tu-dominio.com"; npm start

Linux/macOS:
BASE_URL="https://tu-dominio.com" npm start

## Publicación
Esta primera versión usa almacenamiento local del servidor. Para una versión pública/producción se recomienda migrar los archivos a almacenamiento persistente (por ejemplo, Supabase Storage/S3) y añadir autenticación de administrador.

## Identidad Universidad de Caldas
El diseño utiliza los colores institucionales publicados por la Universidad de Caldas (#003e70, #00284d, #045389, #d5bb87) y una representación estilizada del sol. El logotipo oficial es una marca registrada y su uso debe ajustarse al Manual de Identidad Institucional y, cuando corresponda, contar con la autorización de la Unidad de Servicios y Mercadeo.
