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
 * Formatea fechas a formato legible en español (ej. "25 Sep 2026")
 */
function formatDateSpanish(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${day} ${meses[monthIdx]} ${year}`;
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  } catch (e) {}
  return dateStr;
}

/**
 * Convierte un Data URI Base64 o ruta de archivo en un Buffer para PDFKit
 */
function getImageBuffer(imageUriOrPath) {
  if (!imageUriOrPath || typeof imageUriOrPath !== 'string') return null;
  if (imageUriOrPath.startsWith('data:image/')) {
    try {
      const commaIndex = imageUriOrPath.indexOf(',');
      if (commaIndex !== -1) {
        return Buffer.from(imageUriOrPath.substring(commaIndex + 1), 'base64');
      }
    } catch (e) {
      console.error('Error decodificando imagen base64:', e.message);
    }
  }
  try {
    const filePath = path.isAbsolute(imageUriOrPath) 
      ? imageUriOrPath 
      : path.join(UPLOADS_DIR, path.basename(imageUriOrPath));
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
  } catch (e) {}
  return null;
}

/**
 * Genera el archivo PDF de la Cuenta de Cobro con diseño moderno, limpio y ejecutivo
 * @param {Object} cuenta - Objeto con datos de la cuenta generada
 * @param {Object} emisor - Objeto con datos del emisor
 * @returns {Promise<Object>} Ruta absoluta y nombre del archivo PDF generado
 */
async function generateCuentaCobroPDF(cuenta, emisor) {
  return new Promise(async (resolve, reject) => {
    try {
      const fileName = `${cuenta.consecutivo || 'CC'}_${(cuenta.clienteNombre || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_')}_${cuenta.periodo ? cuenta.periodo.replace(/[^a-zA-Z0-9]/g, '_') : 'Doc'}.pdf`;
      const filePath = path.join(PDFS_DIR, fileName);

      // Crear documento PDF con márgenes modernos
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 34, bottom: 15, left: 42, right: 42 },
        autoFirstPage: true,
        bufferPages: true,
        info: {
          Title: `Cuenta de Cobro ${cuenta.consecutivo} - ${cuenta.clienteNombre}`,
          Author: emisor.nombre,
          Subject: cuenta.concepto,
          Keywords: 'Cuenta de Cobro, Factura, Cobranza'
        }
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // Paleta de colores ejecutiva (Estilo Moderno Minimalista)
      const primaryColor = '#0f172a';    // Slate 900 (Negro azulado profundo / Elegante)
      const accentColor = '#2563eb';     // Royal Blue 600 (Azul vibrante moderno)
      const brandDark = '#1e293b';       // Slate 800 (Titulares)
      const textSecondary = '#475569';   // Slate 600 (Cuerpo legible)
      const textMuted = '#94a3b8';       // Slate 400 (Etiquetas secundarias)
      const cardBg = '#f8fafc';          // Slate 50 (Fondo sutil de tarjetas)
      const borderCard = '#e2e8f0';      // Slate 200 (Borde fino)
      const totalEmerald = '#059669';    // Emerald 600 (Éxito / Valor Neto)
      const dangerRed = '#e11d48';       // Rose 600 (Retenciones negativas)

      const contentWidth = doc.page.width - 84; // 528 pt
      const leftX = 42;
      const rightX = doc.page.width - 42;
      let currentY = 38;

      // ================= 1. BARRA MINIMALISTA SUPERIOR =================
      doc.rect(leftX, currentY, 80, 3).fill(accentColor);
      doc.rect(leftX + 80, currentY + 1, contentWidth - 80, 1).fill('#e2e8f0');
      currentY += 16;

      // ================= 2. CABECERA: EMISOR & TÍTULO DOCUMENTO =================
      const headerStartY = currentY;

      // LADO IZQUIERDO: LOGO O BRANDING DEL EMISOR
      let logoDrawn = false;
      const logoBuffer = getImageBuffer(emisor.logoUrl);
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, leftX, headerStartY, { fit: [160, 50], align: 'left', valign: 'top' });
          logoDrawn = true;
        } catch (e) {
          console.error('Error insertando logo en PDF:', e.message);
        }
      }

      if (!logoDrawn) {
        // Monograma estilizado de iniciales si no hay logo
        const initials = (emisor.nombre || 'CC')
          .split(' ')
          .filter(w => w.length > 2)
          .slice(0, 2)
          .map(w => w[0].toUpperCase())
          .join('') || 'CC';

        doc.roundedRect(leftX, headerStartY, 38, 38, 8)
           .fillAndStroke('#eff6ff', '#bfdbfe');
        doc.font('Helvetica-Bold').fontSize(14).fillColor(accentColor)
           .text(initials, leftX, headerStartY + 11, { width: 38, align: 'center' });

        // Nombre de la Empresa o Persona Natural
        const emisorTextX = leftX + 46;
        doc.font('Helvetica-Bold').fontSize(13.5).fillColor(brandDark)
           .text(emisor.nombre, emisorTextX, headerStartY + 2, { width: 260 });

        const subTitleY = doc.y + 2;
        doc.font('Helvetica').fontSize(8).fillColor(textSecondary)
           .text(emisor.profesion || 'Prestador de Servicios Profesionales', emisorTextX, subTitleY, { width: 260 });
        
        const emisorDocStr = `${emisor.tipoDoc || 'CC'}: ${emisor.numDoc}${emisor.dv ? '-' + emisor.dv : ''}`;
        doc.font('Helvetica').fontSize(7.5).fillColor(textMuted)
           .text(`${emisorDocStr}  •  ${emisor.ciudad || 'Colombia'}`, emisorTextX, doc.y + 2);
      }

      // LADO DERECHO: TÍTULO Y METADATOS DEL DOCUMENTO
      const rightMetaWidth = 200;
      const rightMetaX = rightX - rightMetaWidth;

      doc.font('Helvetica-Bold').fontSize(16).fillColor(brandDark)
         .text('CUENTA DE COBRO', rightMetaX, headerStartY, { width: rightMetaWidth, align: 'right' });

      // Badge elegante para el consecutivo
      const badgeWidth = 110;
      const badgeHeight = 22;
      const badgeX = rightX - badgeWidth;
      const badgeY = headerStartY + 24;

      doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 6)
         .fillAndStroke('#f1f5f9', '#cbd5e1');

      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(primaryColor)
         .text(cuenta.consecutivo || 'CC-001', badgeX, badgeY + 5, { width: badgeWidth, align: 'center' });

      // Fechas clave
      let metaY = badgeY + badgeHeight + 8;
      const fEmision = formatDateSpanish(cuenta.fechaEmision);
      const fVence = formatDateSpanish(cuenta.fechaVencimiento);

      doc.font('Helvetica').fontSize(8).fillColor(textMuted)
         .text('Fecha de emisión:', rightMetaX, metaY, { width: 110, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(8).fillColor(textSecondary)
         .text(fEmision, rightX - 85, metaY, { width: 85, align: 'right' });
      metaY += 12;

      doc.font('Helvetica').fontSize(8).fillColor(textMuted)
         .text('Fecha de vencimiento:', rightMetaX, metaY, { width: 110, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(8).fillColor(textSecondary)
         .text(fVence, rightX - 85, metaY, { width: 85, align: 'right' });
      metaY += 12;

      if (cuenta.periodo) {
        doc.font('Helvetica').fontSize(8).fillColor(textMuted)
           .text('Período facturado:', rightMetaX, metaY, { width: 110, align: 'right' });
        doc.font('Helvetica-Bold').fontSize(8).fillColor(accentColor)
           .text(cuenta.periodo, rightX - 85, metaY, { width: 85, align: 'right' });
        metaY += 12;
      }

      currentY = Math.max(headerStartY + 74, metaY + 8);

      // ================= 3. TARJETAS DE INFORMACIÓN (CLIENTE & PRESTADOR) =================
      const cardGap = 12;
      const cardWidth = (contentWidth - cardGap) / 2; // 258 pt cada una
      const cardHeight = 88;
      const cardY = currentY;

      // Tarjeta Izquierda: CLIENTE
      const cBoxX = leftX;
      doc.roundedRect(cBoxX, cardY, cardWidth, cardHeight, 8)
         .fillAndStroke(cardBg, borderCard);

      // Píldora de overline
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(accentColor)
         .text('CLIENTE:', cBoxX + 12, cardY + 10);

      doc.font('Helvetica-Bold').fontSize(10).fillColor(brandDark)
         .text(cuenta.clienteNombre || 'CLIENTE', cBoxX + 12, cardY + 24, { width: cardWidth - 24, height: 14, ellipsis: true });

      const clienteDocStr = cuenta.clienteDoc ? `${cuenta.clienteDoc}` : 'Documento: N/A';
      doc.font('Helvetica').fontSize(8).fillColor(textSecondary)
         .text(clienteDocStr, cBoxX + 12, cardY + 40);

      if (cuenta.clienteContacto) {
        doc.text(`Atn: ${cuenta.clienteContacto}`, cBoxX + 12, cardY + 52, { width: cardWidth - 24, height: 12, ellipsis: true });
      } else if (cuenta.clienteDireccion) {
        doc.text(`Dir: ${cuenta.clienteDireccion}`, cBoxX + 12, cardY + 52, { width: cardWidth - 24, height: 12, ellipsis: true });
      } else {
        doc.text(`Ciudad: ${cuenta.clienteCiudad || 'Colombia'}`, cBoxX + 12, cardY + 52);
      }

      doc.font('Helvetica').fontSize(8).fillColor(accentColor)
         .text(cuenta.clienteEmail || '', cBoxX + 12, cardY + 65, { width: cardWidth - 24, height: 12, ellipsis: true });

      // Tarjeta Derecha: PRESTADOR DEL SERVICIO (A FAVOR DE)
      const eBoxX = leftX + cardWidth + cardGap;
      doc.roundedRect(eBoxX, cardY, cardWidth, cardHeight, 8)
         .fillAndStroke(cardBg, borderCard);

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(textSecondary)
         .text('PRESTADOR DEL SERVICIO:', eBoxX + 12, cardY + 10);

      doc.font('Helvetica-Bold').fontSize(10).fillColor(brandDark)
         .text(emisor.nombre, eBoxX + 12, cardY + 24, { width: cardWidth - 24, height: 14, ellipsis: true });

      const emisorFullDoc = `${emisor.tipoDoc || 'CC'}: ${emisor.numDoc}${emisor.dv ? '-' + emisor.dv : ''}`;
      doc.font('Helvetica').fontSize(8).fillColor(textSecondary)
         .text(emisorFullDoc, eBoxX + 12, cardY + 40);

      doc.font('Helvetica').fontSize(8).fillColor(textSecondary)
         .text(`Tel: ${emisor.telefono || 'N/A'}  •  ${emisor.ciudad || 'Colombia'}`, eBoxX + 12, cardY + 52, { width: cardWidth - 24, height: 12, ellipsis: true });

      doc.font('Helvetica').fontSize(8).fillColor(accentColor)
         .text(emisor.email || '', eBoxX + 12, cardY + 65, { width: cardWidth - 24, height: 12, ellipsis: true });

      currentY = cardY + cardHeight + 14;

      // ================= 4. TABLA MODERNA DE CONCEPTOS =================
      const tblHeaderH = 24;
      const tblHeaderY = currentY;

      // Barra de encabezado moderna en Midnight Slate
      doc.roundedRect(leftX, tblHeaderY, contentWidth, tblHeaderH, 5)
         .fill(primaryColor);

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
         .text('DESCRIPCIÓN DE LOS SERVICIOS PRESTADOS', leftX + 12, tblHeaderY + 7);
      doc.text('SUBTOTAL', rightX - 90, tblHeaderY + 7, { width: 80, align: 'right' });

      currentY += tblHeaderH;

      // Cuerpo del concepto
      const conceptoText = cuenta.concepto || 'Prestación de servicios profesionales correspondientes al período.';
      
      doc.font('Helvetica').fontSize(9);
      const textHeight = doc.heightOfString(conceptoText, { width: contentWidth - 120, lineGap: 3 });
      const rowHeight = Math.max(52, textHeight + 20);

      doc.rect(leftX, currentY, contentWidth, rowHeight)
         .fillAndStroke('#ffffff', borderCard);

      // Texto de la descripción
      doc.font('Helvetica').fontSize(9).fillColor(brandDark)
         .text(conceptoText, leftX + 12, currentY + 10, { width: contentWidth - 120, lineGap: 3 });

      // Monto bruto a la derecha
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(brandDark)
         .text(formatMoney(cuenta.subtotal || cuenta.totalNeto), rightX - 90, currentY + 12, { width: 80, align: 'right' });

      currentY += rowHeight;

      // ================= 5. VALOR EN LETRAS (BANNER ELEGANTE) =================
      const valorLetras = cuenta.totalEnLetras || numeroALetras(cuenta.totalNeto);
      const letrasH = 26;
      currentY += 8;

      doc.roundedRect(leftX, currentY, contentWidth, letrasH, 6)
         .fillAndStroke('#f8fafc', borderCard);

      // Barra vertical decorativa a la izquierda
      doc.rect(leftX, currentY, 3, letrasH).fill(accentColor);

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(textSecondary)
         .text('SON:', leftX + 12, currentY + 8);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(brandDark)
         .text(valorLetras, leftX + 42, currentY + 8, { width: contentWidth - 54, ellipsis: true });

      currentY += letrasH + 12;

      // ================= 6. SECCIÓN INFERIOR: FORMAS DE PAGO Y LIQUIDACIÓN =================
      const lowerStartY = currentY;
      const leftColW = 300;
      const rightColW = contentWidth - leftColW - 12; // 216 pt
      const rightColX = leftX + leftColW + 12;

      // COLUMNA IZQUIERDA: MEDIOS DE PAGO BANCARIOS
      const bankCardH = 88;
      doc.roundedRect(leftX, lowerStartY, leftColW, bankCardH, 8)
         .fillAndStroke(cardBg, borderCard);

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(accentColor)
         .text('DATOS PARA TRANSFERENCIA O PAGO:', leftX + 12, lowerStartY + 10);

      let bY = lowerStartY + 26;
      if (emisor.bancos && emisor.bancos.length > 0) {
        emisor.bancos.slice(0, 3).forEach((b) => {
          doc.font('Helvetica-Bold').fontSize(8).fillColor(brandDark)
             .text(`• ${b.banco} (${b.tipoCuenta || 'Ahorros'}): `, leftX + 12, bY, { continued: true });
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(primaryColor)
             .text(`${b.numeroCuenta}`, { continued: false });
          doc.font('Helvetica').fontSize(7.5).fillColor(textMuted)
             .text(`  Titular: ${b.titular || emisor.nombre} ${b.docTitular ? '- ' + b.docTitular : ''}`, leftX + 18, doc.y + 1);
          bY = doc.y + 5;
        });
      } else {
        doc.font('Helvetica').fontSize(8).fillColor(textSecondary)
           .text('Transferencia bancaria directa a coordinar con el emisor.', leftX + 12, bY);
      }

      // COLUMNA DERECHA: LIQUIDACIÓN DE VALORES
      const totalsCardH = 88;
      doc.roundedRect(rightColX, lowerStartY, rightColW, totalsCardH, 8)
         .fillAndStroke(cardBg, borderCard);

      let tY = lowerStartY + 10;

      // Subtotal Bruto
      doc.font('Helvetica').fontSize(8).fillColor(textSecondary)
         .text('Subtotal:', rightColX + 12, tY);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(brandDark)
         .text(formatMoney(cuenta.subtotal || cuenta.totalNeto), rightX - 95, tY, { width: 85, align: 'right' });
      tY += 13;

      // Retenciones si aplican
      if (cuenta.retefuente && cuenta.retefuente > 0) {
        doc.font('Helvetica').fontSize(7.5).fillColor(textMuted)
           .text('(-) Retención en la Fuente:', rightColX + 12, tY);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(dangerRed)
           .text(`- ${formatMoney(cuenta.retefuente)}`, rightX - 95, tY, { width: 85, align: 'right' });
        tY += 12;
      }

      if (cuenta.reteICA && cuenta.reteICA > 0) {
        doc.font('Helvetica').fontSize(7.5).fillColor(textMuted)
           .text('(-) ReteICA:', rightColX + 12, tY);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(dangerRed)
           .text(`- ${formatMoney(cuenta.reteICA)}`, rightX - 95, tY, { width: 85, align: 'right' });
        tY += 12;
      }

      // Banner destacado para el TOTAL NETO
      const totalBannerH = 26;
      const totalBannerY = lowerStartY + totalsCardH - totalBannerH - 6;

      doc.roundedRect(rightColX + 6, totalBannerY, rightColW - 12, totalBannerH, 6)
         .fill(primaryColor);

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff')
         .text('TOTAL NETO:', rightColX + 14, totalBannerY + 8);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
         .text(formatMoney(cuenta.totalNeto), rightX - 105, totalBannerY + 7, { width: 93, align: 'right' });

      currentY = lowerStartY + Math.max(bankCardH, totalsCardH) + 12;

      // ================= 7. DECLARACIÓN TRIBUTARIA =================
      const legalText = emisor.regimenTexto || 'Persona Natural No Responsable del Impuesto sobre las Ventas (IVA) - Art. 437 del Estatuto Tributario Nacional.';
      doc.font('Helvetica-Oblique').fontSize(7).fillColor(textMuted)
         .text(legalText, leftX, currentY, { width: contentWidth, align: 'justify', lineGap: 1.5 });

      currentY = doc.y + 14;

      // ================= 8. FIRMA Y CÓDIGO QR =================
      const signatureY = Math.min(currentY + 10, doc.page.height - 108);

      // Firma digitalizada si existe
      const firmaBuffer = getImageBuffer(emisor.firmaUrl);
      if (firmaBuffer) {
        try {
          doc.image(firmaBuffer, leftX, signatureY - 26, { fit: [140, 44], align: 'left' });
        } catch (e) {
          console.error('Error insertando firma en PDF:', e.message);
        }
      }

      // Línea de firma minimalista
      doc.moveTo(leftX, signatureY + 22).lineTo(leftX + 180, signatureY + 22).lineWidth(0.75).stroke(borderCard);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(brandDark)
         .text(emisor.nombre, leftX, signatureY + 26);
      doc.font('Helvetica').fontSize(7.5).fillColor(textSecondary)
         .text(`${emisor.tipoDoc || 'CC'}: ${emisor.numDoc}${emisor.dv ? '-' + emisor.dv : ''}`, leftX, signatureY + 37);
      doc.font('Helvetica').fontSize(7).fillColor(textMuted)
         .text(emisor.profesion || 'Prestador de Servicios Independiente', leftX, signatureY + 47);

      // Código QR moderno al extremo derecho
      try {
        const qrData = `CUENTA:${cuenta.consecutivo}|EMISOR:${emisor.nombre}|DOC:${emisor.numDoc}|CLIENTE:${cuenta.clienteNombre}|VALOR:${cuenta.totalNeto}|FECHA:${cuenta.fechaEmision}`;
        const qrBuffer = await QRCode.toBuffer(qrData, { width: 50, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } });
        const qrSize = 50;
        const qrX = rightX - qrSize;
        const qrY = signatureY - 2;

        doc.roundedRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, 4)
           .fillAndStroke('#ffffff', borderCard);
        doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

        doc.font('Helvetica').fontSize(6.5).fillColor(textMuted)
           .text('Validación Digital', qrX - 10, qrY + qrSize + 4, { width: qrSize + 20, align: 'center' });
      } catch (qrErr) {
        console.error('Error generando QR:', qrErr.message);
      }

      // ================= 9. PIE DE PÁGINA ULTRA-LIMPIO =================
      const footerY = 762;
      doc.moveTo(leftX, footerY - 6).lineTo(rightX, footerY - 6).lineWidth(0.5).stroke('#e2e8f0');
      
      doc.font('Helvetica').fontSize(6.5).fillColor(textMuted)
         .text('Documento emitido electrónicamente con CobroAuto', leftX, footerY, { width: contentWidth / 2, align: 'left', lineBreak: false });
      doc.text('Página 1 de 1', rightX - 100, footerY, { width: 100, align: 'right', lineBreak: false });

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
