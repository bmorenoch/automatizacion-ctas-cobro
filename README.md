# 🚀 Sistema Automatizado de Cuentas de Cobro Recurrentes

Plataforma integral y autónoma para la gestión de clientes, emisión automática de cuentas de cobro profesionales en PDF y envío recurrente por correo electrónico (Gmail, Outlook, SMTP personalizado).

---

## 🌟 Características

- ⚡ **Automatización Recurrente Diaria**: Evalúa automáticamente las fechas de corte de cada cliente (ej. días 1, 15, 25, 30) y genera el documento del período.
- 📄 **Generación de PDFs Profesionales**:
  - Membrete y diseño institucional elegante.
  - Consecutivo incremental automático (`CC-001`, `CC-002`, etc.).
  - Conversión de montos numéricos a **letras en pesos colombianos M/CTE**.
  - Liquidación automática de **Retención en la Fuente** y **ReteICA**.
  - Código QR de verificación embebido.
  - Inserción de firma digitalizada y logo del emisor.
  - Certificaciones y leyendas legales tributarias (No responsable de IVA - Art. 437 E.T.).
- 📧 **Motor de Envío por Correo Electrónico (SMTP)**:
  - Envío automático de correo con PDF adjunto y cuerpo HTML enriquecido.
  - Soporte para Gmail (Contraseña de Aplicación), Outlook/Office 365, Hostinger y SMTP personalizado.
  - Copia oculta (BCC) automática al emisor para respaldo.
  - Pruebas de conexión integradas en la interfaz.
- 📊 **Panel de Control Moderno (Dashboard)**:
  - Métricas en tiempo real: Facturado en el mes, Pendientes de cobro, Recaudado y Clientes activos.
  - Lista de próximos cortes programados con cuenta regresiva.
  - Visualizador de PDF integrado en ventana modal sin necesidad de salir del sistema.
  - Control de estados: *Borrador*, *Enviada*, *Pagada*, *Anulada*.
- 💾 **Almacenamiento Local Seguro**: Todos los datos se guardan en formato JSON estructurado en tu propio equipo (`data/db.json`), sin depender de servidores externos de pago.

---

## 🚀 Cómo Iniciar el Sistema

### Opción 1 (Recomendada - Con 1 clic):
Haz doble clic sobre el archivo **`iniciar_sistema.bat`**.

### Opción 2 (Por terminal / consola):
```bash
node server/server.js
```
Abre tu navegador en: [http://localhost:3000](http://localhost:3000)

---

## ⚙️ Configuración Paso a Paso

1. **Pestaña Configuración**:
   - Ingresa tus datos personales o de empresa (Nombre, NIT/Cédula, Teléfono, Email, Ciudad).
   - Registra tus cuentas bancarias (Bancolombia, Nequi, Daviplata, etc.).
   - Sube una imagen de tu firma digitalizada en formato PNG con fondo blanco o transparente.
   - Opcionalmente sube tu logo institucional.

2. **Configurar el Correo para Envíos Automáticos**:
   - Para **Gmail**:
     1. Ve a tu cuenta de Google > **Seguridad** > **Verificación en 2 pasos**.
     2. Busca **Contraseñas de aplicaciones**.
     3. Crea una contraseña con el nombre "CobroAuto".
     4. En el panel de CobroAuto, selecciona Gmail, escribe tu correo y pega la contraseña de 16 letras generada.
     5. Presiona **Probar Conexión**.

3. **Agregar tus Clientes**:
   - Ve a la pestaña **Clientes & Recurrencias**.
   - Haz clic en **➕ Agregar Cliente**.
   - Define el valor mensual, día de corte (ej. 25 de cada mes), concepto recurrente y si deseas envío automático en esa fecha.

4. **Emisión de Cuentas**:
   - **Automática**: El scheduler interno revisa todos los días a las 08:00 AM y genera/envía las cuentas a quienes cumplan corte hoy.
   - **Manual con 1 clic**: En la tabla de clientes, haz clic en el botón **⚡ Emitir** para generar y enviar de inmediato la cuenta del mes actual.

---

---

## 🌐 Despliegue en GitHub y Vercel

El proyecto ya incluye la configuración optimizada para **Vercel** (`vercel.json`, `api/index.js`, `.gitignore` y Vercel Cron).

### Paso 1: Subir a GitHub

1. Ingresa a [github.com/new](https://github.com/new) y crea un nuevo repositorio (por ejemplo: `automatizacion-ctas-cobro`).
2. En tu terminal o consola:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Sistema de Cuentas de Cobro"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   git push -u origin main
   ```
   *(También puedes usar **GitHub Desktop** o **VS Code Source Control** para publicarlo en 1 clic).*

### Paso 2: Desplegar en Vercel

1. Entra a [vercel.com](https://vercel.com/) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"Add New..."** > **"Project"**.
3. Selecciona tu repositorio recién creado y haz clic en **"Import"**.
4. Deja la configuración predeterminada (Vercel detectará automáticamente `vercel.json` y `api/index.js`).
5. Haz clic en **"Deploy"**.

¡Listo! Tu aplicación estará en línea con dominio HTTPS gratuito (ej: `https://tu-proyecto.vercel.app`) y con soporte para tareas cron automáticas.

---

## 📁 Estructura del Proyecto

```
AUTOMATIZACION CTAS DE COBRO/
├── package.json               # Dependencias y scripts de Node.js
├── vercel.json                # Configuración de despliegue y Crons en Vercel
├── api/
│   └── index.js               # Entry point Serverless para Vercel
├── .gitignore                 # Exclusiones de Git
├── iniciar_sistema.bat        # Acceso directo para Windows
├── server/
│   ├── server.js              # Servidor API Express y rutas
│   ├── db.js                  # Manejador de persistencia de datos local/cloud
│   ├── pdfService.js          # Motor de generación de PDF con PDFKit
│   ├── mailService.js         # Módulo Nodemailer para envíos SMTP
│   ├── scheduler.js           # Cron scheduler para cobros recurrentes
│   └── numberToWords.js       # Conversor de valores a letras en español
├── public/
│   ├── index.html             # Interfaz web del usuario
│   ├── css/style.css          # Estilos modernos y responsivos
│   └── js/app.js              # Lógica interactiva del cliente
├── data/
│   └── db.json                # Base de datos local persistente
└── storage/
    ├── pdfs/                  # Archivos PDF generados
    └── uploads/               # Firmas y logos subidos
```
