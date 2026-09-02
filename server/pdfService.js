const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { numeroALetras } = require('./numberToWords');
const { PDFS_DIR, UPLOADS_DIR } = require('./db');

// Importaciones estáticas para que Vercel empaquete las fuentes de PDFKit
try {
  require('pdfkit/js/standard-fonts/Helvetica.cjs');
  require('pdfkit/js/standard-fonts/HelveticaBold.cjs');
  require('pdfkit/js/standard-fonts/HelveticaOblique.cjs');
  require('pdfkit/js/standard-fonts/HelveticaBoldOblique.cjs');
  require('pdfkit/js/standard-fonts/TimesRoman.cjs');
  require('pdfkit/js/standard-fonts/Courier.cjs');
} catch (e) {}

/**
 * Formatea un número como moneda colombiana (ej. $ 2.500.000)
 */
function formatMoney(amount) {
  const num = Number(amount) || 0;
  return '$ ' + num.toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

/**
 * Genera el archivo PDF de la Cuenta de Cobro
 * @param {Object} cuenta - Objeto con datos de la cuenta generada
 * @param {Object} emisor - Objeto con datos del emisor
 * @returns {Promise<string>} Ruta absoluta del archivo PDF generado
 */
async function generateCuentaCobroPDF(cuenta, emisor) {
  return new Promise(async (resolve, reject) => {
    try {
      const fileName = `${cuenta.consecutivo || 'CC'}_${(cuenta.clienteNombre || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_')}_${cuenta.periodo ? cuenta.periodo.replace(/[^a-zA-Z0-9]/g, '_') : 'Doc'}.pdf`;
      const filePath = path.join(PDFS_DIR, fileName);

      // Crear documento PDF con márgenes estándar
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 36, bottom: 36, left: 40, right: 40 },
        info: {
          Title: `Cuenta de Cobro ${cuenta.consecutivo} - ${cuenta.clienteNombre}`,
          Author: emisor.nombre,
          Subject: cuenta.concepto,
          Keywords: 'Cuenta de Cobro, Factura, Cobranza'
        }
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      const primaryColor = '#1e3a8a';   // Azul marino elegante
      const secondaryColor = '#0284c7'; // Azul cian
      const darkColor = '#1e293b';      // Gris oscuro carbón
      const mutedColor = '#64748b';     // Gris medio
      const bgLight = '#f8fafc';        // Gris muy claro para cajas
      const borderColor = '#cbd5e1';    // Borde sutil
      const accentColor = '#0f766e';     // Verde petróleo para valores

      const contentWidth = doc.page.width - 80; // 532 pt
      let currentY = 36;

      // Barra superior decorativa
      doc.rect(40, currentY, contentWidth, 4).fill(primaryColor);
      currentY += 14;

      // ================= CABECERA =================
      const startHeaderY = currentY;

      // Si existe Logo del Emisor
      let logoDrawn = false;
      if (emisor.logoUrl) {
        const logoPath = path.isAbsolute(emisor.logoUrl) 
          ? emisor.logoUrl 
          : path.join(UPLOADS_DIR, path.basename(emisor.logoUrl));
        
        if (fs.existsSync(logoPath)) {
          try {
            doc.image(logoPath, 40, currentY, { fit: [140, 50], align: 'left', valign: 'top' });
            logoDrawn = true;
          } catch (e) {
            console.error('Error cargando logo en PDF:', e);
          }
        }
      }

      if (!logoDrawn) {
        // Membrete con texto del emisor
        doc.font('Helvetica-Bold').fontSize(16).fillColor(primaryColor);
        doc.text(emisor.nombre.toUpperCase(), 40, currentY, { width: 320 });
        currentY = doc.y + 2;

        doc.font('Helvetica').fontSize(8.5).fillColor(mutedColor);
        if (emisor.profesion) {
          doc.text(emisor.profesion, 40, currentY, { width: 320 });
          currentY = doc.y + 1;
        }
        const emisorDocStr = `${emisor.tipoDoc || 'CC'}: ${emisor.numDoc}${emisor.dv ? '-' + emisor.dv : ''}`;
        doc.text(`${emisorDocStr} | Tel: ${emisor.telefono || 'N/A'}`, 40, currentY, { width: 320 });
        currentY = doc.y + 1;
        doc.text(`${emisor.email || ''} | ${emisor.ciudad || ''}`, 40, currentY, { width: 320 });
      }

      // Caja del Consecutivo y Fechas (Lado derecho)
      const boxWidth = 190;
      const boxX = doc.page.width - 40 - boxWidth;
      const boxY = startHeaderY;
      const boxHeight = 68;

      doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 6)
         .fillAndStroke('#f1f5f9', primaryColor);

      // Encabezado de la caja
      doc.rect(boxX, boxY, boxWidth, 22)
         .fill(primaryColor);

      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#ffffff')
         .text('CUENTA DE COBRO', boxX, boxY + 6, { width: boxWidth, align: 'center' });

      doc.font('Helvetica-Bold').fontSize(13).fillColor(primaryColor)
         .text(`No. ${cuenta.consecutivo}`, boxX, boxY + 28, { width: boxWidth, align: 'center' });

      doc.font('Helvetica').fontSize(8).fillColor(darkColor);
      doc.text(`Fecha Emisión: ${cuenta.fechaEmision || new Date().toISOString().split('T')[0]}`, boxX + 10, boxY + 44);
      doc.text(`Fecha Vencimiento: ${cuenta.fechaVencimiento || 'Inmediato'}`, boxX + 10, boxY + 54);

      currentY = Math.max(currentY + 10, boxY + boxHeight + 14);

      // ================= CAJAS DE INFORMACIÓN (CLIENTE / DEUDOR & PRESTADOR / PROVEEDOR) =================
      const halfWidth = (contentWidth - 10) / 2;

      // Caja Cliente (Lado izquierdo: QUIEN DEBE / PAGADOR)
      const clienteBoxX = 40;
      const emisorBoxX = 40 + halfWidth + 10;
      const boxesY = currentY;
      const boxesHeight = 84;

      // Dibujar caja Cliente (CLIENTE / PAGADOR)
      doc.roundedRect(clienteBoxX, boxesY, halfWidth, boxesHeight, 4)
         .fillAndStroke(bgLight, borderColor);
      doc.rect(clienteBoxX, boxesY, halfWidth, 18).fill('#e2e8f0');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(primaryColor)
         .text('CLIENTE / PAGADOR (DEUDOR):', clienteBoxX + 8, boxesY + 5);

      doc.font('Helvetica-Bold').fontSize(9).fillColor(darkColor)
         .text(cuenta.clienteNombre || 'CLIENTE', clienteBoxX + 8, boxesY + 23, { width: halfWidth - 16 });
      doc.font('Helvetica').fontSize(8).fillColor(darkColor);
      const clienteDocStr = cuenta.clienteDoc ? `${cuenta.clienteDoc}` : 'Doc: N/A';
      doc.text(clienteDocStr, clienteBoxX + 8, boxesY + 36);
      if (cuenta.clienteContacto) {
        doc.text(`Atención: ${cuenta.clienteContacto}`, clienteBoxX + 8, boxesY + 47, { width: halfWidth - 16 });
      } else {
        doc.text(`Dirección: ${cuenta.clienteDireccion || 'N/A'}`, clienteBoxX + 8, boxesY + 47, { width: halfWidth - 16 });
      }
      doc.text(`Email: ${cuenta.clienteEmail || 'N/A'}`, clienteBoxX + 8, boxesY + 58, { width: halfWidth - 16 });
      doc.text(`Ciudad: ${cuenta.clienteCiudad || 'Colombia'}`, clienteBoxX + 8, boxesY + 69);

      // Dibujar caja Emisor (PRESTADOR DEL SERVICIO / PROVEEDOR - A FAVOR DE)
      doc.roundedRect(emisorBoxX, boxesY, halfWidth, boxesHeight, 4)
         .fillAndStroke(bgLight, borderColor);
      doc.rect(emisorBoxX, boxesY, halfWidth, 18).fill('#e2e8f0');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(primaryColor)
         .text('PRESTADOR / PROVEEDOR (DEBE A FAVOR DE):', emisorBoxX + 8, boxesY + 5);

      doc.font('Helvetica-Bold').fontSize(9).fillColor(darkColor)
         .text(emisor.nombre, emisorBoxX + 8, boxesY + 23, { width: halfWidth - 16 });
      doc.font('Helvetica').fontSize(8).fillColor(darkColor);
      doc.text(`${emisor.tipoDoc || 'CC'}: ${emisor.numDoc}${emisor.dv ? '-' + emisor.dv : ''}`, emisorBoxX + 8, boxesY + 36);
      doc.text(`Tel / WhatsApp: ${emisor.telefono || 'N/A'}`, emisorBoxX + 8, boxesY + 47);
      doc.text(`Email: ${emisor.email || 'N/A'}`, emisorBoxX + 8, boxesY + 58);
      doc.text(`Ciudad: ${emisor.ciudad || 'Colombia'}`, emisorBoxX + 8, boxesY + 69);

      currentY = boxesY + boxesHeight + 12;

      // ================= CONCEPTO Y DETALLE DEL SERVICIO =================
      doc.roundedRect(40, currentY, contentWidth, 20, 3).fill(primaryColor);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
      doc.text('DEBE POR CONCEPTO DE LOS SERVICIOS PRESTADOS:', 48, currentY + 6);
      doc.text('TOTAL', doc.page.width - 40 - 70, currentY + 6, { width: 62, align: 'right' });

      currentY += 20;

      // Cuerpo del concepto
      const conceptoText = cuenta.concepto || 'Prestación de servicios profesionales.';
      const itemsBoxY = currentY;
      
      // Calcular altura requerida para el texto
      doc.font('Helvetica').fontSize(8.5);
      const conceptoHeight = Math.max(38, doc.heightOfString(conceptoText, { width: contentWidth - 110 }) + 16);

      doc.rect(40, itemsBoxY, contentWidth, conceptoHeight)
         .fillAndStroke('#ffffff', borderColor);

      doc.font('Helvetica').fontSize(8.5).fillColor(darkColor)
         .text(conceptoText, 48, itemsBoxY + 8, { width: contentWidth - 120, align: 'justify', lineGap: 2 });

      // Subtotal al lado derecho
      doc.font('Helvetica-Bold').fontSize(9).fillColor(darkColor)
         .text(formatMoney(cuenta.subtotal || cuenta.totalNeto), doc.page.width - 40 - 80, itemsBoxY + 12, { width: 72, align: 'right' });

      currentY = itemsBoxY + conceptoHeight;

      // ================= LIQUIDACIÓN DE VALORES (TOTALES Y RETENCIONES) =================
      const totalsWidth = 230;
      const totalsX = doc.page.width - 40 - totalsWidth;
      let totalsY = currentY + 6;

      // Subtotal
      doc.font('Helvetica').fontSize(8.5).fillColor(mutedColor)
         .text('Subtotal Bruto:', totalsX, totalsY);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(darkColor)
         .text(formatMoney(cuenta.subtotal || cuenta.totalNeto), totalsX + 110, totalsY, { width: 115, align: 'right' });
      totalsY += 13;

      // Retefuente si aplica
      if (cuenta.retefuente && cuenta.retefuente > 0) {
        doc.font('Helvetica').fontSize(8).fillColor(mutedColor)
           .text(`(-) Retención en la Fuente:`, totalsX, totalsY);
        doc.font('Helvetica').fontSize(8).fillColor('#dc2626')
           .text(`- ${formatMoney(cuenta.retefuente)}`, totalsX + 110, totalsY, { width: 115, align: 'right' });
        totalsY += 13;
      }

      // ReteICA si aplica
      if (cuenta.reteICA && cuenta.reteICA > 0) {
        doc.font('Helvetica').fontSize(8).fillColor(mutedColor)
           .text(`(-) ReteICA:`, totalsX, totalsY);
        doc.font('Helvetica').fontSize(8).fillColor('#dc2626')
           .text(`- ${formatMoney(cuenta.reteICA)}`, totalsX + 110, totalsY, { width: 115, align: 'right' });
        totalsY += 13;
      }

      // Total Neto Banner
      const bannerHeight = 24;
      doc.roundedRect(totalsX - 6, totalsY, totalsWidth + 6, bannerHeight, 4)
         .fill(primaryColor);

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#ffffff')
         .text('TOTAL A PAGAR:', totalsX, totalsY + 7);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
         .text(formatMoney(cuenta.totalNeto), totalsX + 100, totalsY + 6, { width: 125, align: 'right' });

      currentY = totalsY + bannerHeight + 10;

      // ================= VALOR EN LETRAS =================
      const valorLetras = cuenta.totalEnLetras || numeroALetras(cuenta.totalNeto);
      const letrasBoxY = currentY;

      doc.roundedRect(40, letrasBoxY, contentWidth, 26, 4)
         .fillAndStroke('#eff6ff', '#bfdbfe');

      doc.font('Helvetica-Bold').fontSize(8).fillColor(primaryColor)
         .text('VALOR EN LETRAS:', 48, letrasBoxY + 5);
      doc.font('Helvetica').fontSize(8).fillColor(darkColor)
         .text(valorLetras, 48, letrasBoxY + 14, { width: contentWidth - 16 });

      currentY = letrasBoxY + 34;

      // ================= MEDIOS DE PAGO BANCARIOS =================
      const bankBoxY = currentY;
      const bankBoxHeight = 56;

      doc.roundedRect(40, bankBoxY, contentWidth, bankBoxHeight, 4)
         .fillAndStroke(bgLight, borderColor);

      doc.rect(40, bankBoxY, contentWidth, 16).fill('#f1f5f9');
      doc.font('Helvetica-Bold').fontSize(8).fillColor(primaryColor)
         .text('INFORMACIÓN Y FORMA DE PAGO:', 48, bankBoxY + 4);

      let bankTextY = bankBoxY + 20;
      if (emisor.bancos && emisor.bancos.length > 0) {
        doc.font('Helvetica').fontSize(8).fillColor(darkColor);
        emisor.bancos.forEach((banco, idx) => {
          if (idx < 3) {
            const bancoStr = `• ${banco.banco} | ${banco.tipoCuenta || 'Cuenta'}: ${banco.numeroCuenta} | Titular: ${banco.titular || emisor.nombre}`;
            doc.text(bancoStr, 48, bankTextY, { width: contentWidth - 20 });
            bankTextY += 10;
          }
        });
      } else {
        doc.font('Helvetica').fontSize(8).fillColor(darkColor)
           .text('Transferencia bancaria a coordinar con el emisor.', 48, bankTextY);
      }

      currentY = bankBoxY + bankBoxHeight + 8;

      // ================= DECLARACIONES LEGALES TRIBUTARIAS =================
      const legalText = emisor.regimenTexto || 'Persona Natural No Responsable de IVA - Art. 437 del Estatuto Tributario.';
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(mutedColor)
         .text(legalText, 40, currentY, { width: contentWidth, align: 'justify' });

      currentY = doc.y + 12;

      // ================= FIRMA Y PIE DE PÁGINA =================
      const signatureY = Math.min(currentY, doc.page.height - 110);

      // Si existe firma digitalizada
      let firmaDrawn = false;
      if (emisor.firmaUrl) {
        const firmaPath = path.isAbsolute(emisor.firmaUrl)
          ? emisor.firmaUrl
          : path.join(UPLOADS_DIR, path.basename(emisor.firmaUrl));

        if (fs.existsSync(firmaPath)) {
          try {
            doc.image(firmaPath, 40, signatureY - 24, { fit: [140, 45], align: 'left' });
            firmaDrawn = true;
          } catch (e) {
            console.error('Error insertando firma en PDF:', e);
          }
        }
      }

      // Línea de firma
      doc.moveTo(40, signatureY + 24).lineTo(230, signatureY + 24).stroke(darkColor);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(darkColor)
         .text(emisor.nombre, 40, signatureY + 28);
      doc.font('Helvetica').fontSize(7.5).fillColor(mutedColor)
         .text(`${emisor.tipoDoc || 'CC'}: ${emisor.numDoc}${emisor.dv ? '-' + emisor.dv : ''}`, 40, signatureY + 39);
      doc.text(emisor.profesion || 'Firma autorizada', 40, signatureY + 49);

      // Generar y colocar Código QR de verificación al lado derecho
      try {
        const qrData = `CUENTA:${cuenta.consecutivo}|EMISOR:${emisor.nombre}(${emisor.numDoc})|CLIENTE:${cuenta.clienteNombre}|TOTAL:${cuenta.totalNeto}|FECHA:${cuenta.fechaEmision}`;
        const qrBuffer = await QRCode.toBuffer(qrData, { width: 56, margin: 1 });
        doc.image(qrBuffer, doc.page.width - 40 - 56, signatureY, { width: 56, height: 56 });
        doc.font('Helvetica').fontSize(6.5).fillColor(mutedColor)
           .text('Verificación digital', doc.page.width - 40 - 70, signatureY + 58, { width: 70, align: 'center' });
      } catch (qrErr) {
        console.error('Error generando QR:', qrErr);
      }

      // Pie de página
      doc.font('Helvetica').fontSize(6.5).fillColor('#94a3b8')
         .text(`Documento generado por Sistema de Automatización de Cuentas de Cobro | ID: ${cuenta.id || ''}`, 40, doc.page.height - 24, { width: contentWidth, align: 'center' });

      doc.end();

      writeStream.on('finish', () => {
        resolve({
          filePath,
          fileName
        });
      });

      writeStream.on('error', (err) => {
        reject(err);
      });

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateCuentaCobroPDF,
  formatMoney
};
