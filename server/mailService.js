const nodemailer = require('nodemailer');
const { formatMoney } = require('./pdfService');
const { addLog } = require('./db');

/**
 * Crea un transportador Nodemailer según la configuración del emisor
 */
function createTransporter(smtpConfig) {
  if (!smtpConfig || !smtpConfig.user || !smtpConfig.pass) {
    throw new Error('Configuración SMTP incompleta. Ingrese usuario y contraseña en Configuración.');
  }

  const port = parseInt(smtpConfig.port, 10) || (smtpConfig.secure ? 465 : 587);
  const secure = smtpConfig.secure !== undefined ? Boolean(smtpConfig.secure) : (port === 465);

  return nodemailer.createTransport({
    host: smtpConfig.host || 'smtp.gmail.com',
    port: port,
    secure: secure,
    auth: {
      user: smtpConfig.user.trim(),
      pass: smtpConfig.pass.trim()
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Verifica la conexión con el servidor SMTP
 */
async function verifySmtp(smtpConfig) {
  const transporter = createTransporter(smtpConfig);
  await transporter.verify();
  return true;
}

/**
 * Reemplaza variables dinámicas en el texto del correo
 */
function interpolateTemplate(templateStr, data) {
  if (!templateStr) return '';
  let result = templateStr;
  Object.keys(data).forEach(key => {
    const placeholder = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(placeholder, data[key] || '');
  });
  return result;
}

/**
 * Formatea los datos bancarios en HTML legible para el correo
 */
function formatBankHtml(bancos, emisorNombre) {
  if (!bancos || bancos.length === 0) {
    return '<em>Favor coordinar transferencia bancaria con el emisor.</em>';
  }

  let html = '<ul style="margin: 6px 0; padding-left: 20px; color: #334155;">';
  bancos.forEach(b => {
    html += `<li style="margin-bottom: 4px;"><strong>${b.banco}</strong> (${b.tipoCuenta || 'Cuenta'}): <code>${b.numeroCuenta}</code> - Titular: ${b.titular || emisorNombre}</li>`;
  });
  html += '</ul>';
  return html;
}

/**
 * Envía la Cuenta de Cobro por correo al cliente
 * @param {Object} cuenta - Objeto con datos de la cuenta
 * @param {Object} emisor - Objeto con datos del emisor
 * @param {string} pdfFilePath - Ruta absoluta del archivo PDF adjunto
 */
async function sendCuentaCobroEmail(cuenta, emisor, pdfFilePath) {
  try {
    const smtp = emisor.smtp;
    if (!smtp || !smtp.active) {
      throw new Error('El servicio de correo SMTP no está activo. Actívalo en la pestaña Configuración.');
    }

    const transporter = createTransporter(smtp);

    const bancoHtml = formatBankHtml(emisor.bancos, emisor.nombre);

    const templateData = {
      NOMBRE_CLIENTE: cuenta.clienteNombre || 'Cliente',
      NUMERO_CUENTA: cuenta.consecutivo,
      PERIODO: cuenta.periodo || 'Período corriente',
      VALOR_TOTAL: formatMoney(cuenta.totalNeto),
      FECHA_VENCIMIENTO: cuenta.fechaVencimiento || 'Inmediato',
      DATOS_BANCARIOS: bancoHtml,
      NOMBRE_EMISOR: emisor.nombre,
      EMAIL_EMISOR: emisor.email,
      TELEFONO_EMISOR: emisor.telefono || '',
      CIUDAD_EMISOR: emisor.ciudad || ''
    };

    const plantillas = emisor.plantillaEmail || {};
    const defaultAsunto = `Cuenta de Cobro {NUMERO_CUENTA} - {PERIODO} - {NOMBRE_EMISOR}`;
    const defaultCuerpo = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6;">
        <p>Estimado(s) <strong>{NOMBRE_CLIENTE}</strong>,</p>
        <p>Esperamos se encuentren muy bien.</p>
        <p>Adjuntamos la <strong>Cuenta de Cobro No. {NUMERO_CUENTA}</strong> correspondiente a los servicios prestados durante el período <strong>{PERIODO}</strong> por un valor total de <strong>{VALOR_TOTAL}</strong>.</p>
        <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 12px 16px; margin: 16px 0;">
          <p style="margin: 0 0 6px 0;"><strong>Fecha límite de pago:</strong> {FECHA_VENCIMIENTO}</p>
          <p style="margin: 0 0 4px 0;"><strong>Información de pago:</strong></p>
          {DATOS_BANCARIOS}
        </div>
        <p>Agradecemos enviar el comprobante de transferencia en respuesta a este correo.</p>
        <br>
        <p style="margin-bottom: 2px;">Atentamente,</p>
        <p style="font-weight: bold; margin: 0; color: #1e3a8a;">{NOMBRE_EMISOR}</p>
        <p style="font-size: 12px; color: #64748b; margin: 0;">{TELEFONO_EMISOR} | {EMAIL_EMISOR}</p>
      </div>
    `;

    const subject = interpolateTemplate(plantillas.asunto || defaultAsunto, templateData);
    const htmlBody = interpolateTemplate(plantillas.cuerpo || defaultCuerpo, templateData);

    const fromAddress = smtp.fromEmail || smtp.user;
    const fromName = smtp.fromName || emisor.nombre;

    const mailOptions = {
      from: `"${fromName}" <${fromAddress}>`,
      to: cuenta.clienteEmail,
      subject: subject,
      html: htmlBody,
      attachments: [
        {
          filename: `Cuenta_de_Cobro_${cuenta.consecutivo}.pdf`,
          path: pdfFilePath,
          contentType: 'application/pdf'
        }
      ]
    };

    if (cuenta.clienteEmailCC) {
      mailOptions.cc = cuenta.clienteEmailCC;
    }

    if (smtp.bccEmisor && emisor.email) {
      mailOptions.bcc = emisor.email;
    }

    const info = await transporter.sendMail(mailOptions);

    addLog('success', `Cuenta de cobro ${cuenta.consecutivo} enviada con éxito a ${cuenta.clienteEmail}`, {
      messageId: info.messageId,
      cliente: cuenta.clienteNombre,
      total: cuenta.totalNeto
    });

    return {
      success: true,
      messageId: info.messageId
    };

  } catch (error) {
    addLog('error', `Error al enviar cuenta ${cuenta.consecutivo} a ${cuenta.clienteEmail}: ${error.message}`, error);
    throw error;
  }
}

/**
 * Envía un correo de prueba para validar la configuración SMTP
 */
async function sendTestEmail(smtpConfig, testToEmail, emisorNombre) {
  const transporter = createTransporter(smtpConfig);
  const fromAddress = smtpConfig.fromEmail || smtpConfig.user;
  const fromName = smtpConfig.fromName || emisorNombre || 'Sistema Cuentas de Cobro';

  const mailOptions = {
    from: `"${fromName}" <${fromAddress}>`,
    to: testToEmail,
    subject: `✅ Prueba de Conexión SMTP - ${fromName}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f1f5f9; border-radius: 8px;">
        <h2 style="color: #059669; margin-top: 0;">¡Conexión SMTP Exitosa! 🎉</h2>
        <p>Este es un correo de prueba enviado desde tu <strong>Sistema Automatizado de Cuentas de Cobro</strong>.</p>
        <p>Tu servidor de correo está correctamente configurado y listo para enviar cuentas de cobro automáticamente a tus clientes.</p>
        <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b;">Fecha de prueba: ${new Date().toLocaleString('es-CO')}</p>
      </div>
    `
  };

  return await transporter.sendMail(mailOptions);
}

module.exports = {
  createTransporter,
  verifySmtp,
  sendCuentaCobroEmail,
  sendTestEmail
};
