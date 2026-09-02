const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const { readDb, writeDb, addLog, UPLOADS_DIR, PDFS_DIR } = require('./db');
const { generateCuentaCobroPDF, formatMoney } = require('./pdfService');
const { sendCuentaCobroEmail, verifySmtp, sendTestEmail } = require('./mailService');
const { initScheduler, procesarCorteDelDia, emitirCuentaCliente, interpolateConcepto } = require('./scheduler');
const { numeroALetras } = require('./numberToWords');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Multer para firmas y logos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (PNG, JPG, JPEG, WEBP)'));
    }
  }
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos del frontend y de uploads
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/storage/uploads', express.static(UPLOADS_DIR));

// ================= RUTAS API =================

// 1. Dashboard
app.get('/api/dashboard', (req, res) => {
  try {
    const db = readDb();
    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth();
    const diaHoy = hoy.getDate();

    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const periodoActual = `${MESES[mesActual]} ${anioActual}`;

    const totalClientesActivos = db.clientes.filter(c => c.activo).length;

    // Cuentas del mes actual
    const cuentasMes = db.cuentas.filter(c => c.periodo === periodoActual && c.estado !== 'anulada');
    const totalFacturadoMes = cuentasMes.reduce((sum, c) => sum + (c.totalNeto || 0), 0);

    // Cuentas pendientes de pago
    const cuentasPendientes = db.cuentas.filter(c => (c.estado === 'enviada' || c.estado === 'borrador') && c.estado !== 'anulada');
    const totalPendienteCobro = cuentasPendientes.reduce((sum, c) => sum + (c.totalNeto || 0), 0);

    // Cuentas pagadas este mes
    const cuentasPagadasMes = cuentasMes.filter(c => c.estado === 'pagada');
    const totalPagadoMes = cuentasPagadasMes.reduce((sum, c) => sum + (c.totalNeto || 0), 0);

    // Próximos cobros programados (en los próximos 15 días)
    const proximosCobros = db.clientes
      .filter(c => c.activo)
      .map(c => {
        let diasFaltantes = c.diaCorte - diaHoy;
        if (diasFaltantes < 0) {
          diasFaltantes += 30; // Próximo mes
        }
        return {
          ...c,
          diasFaltantes
        };
      })
      .sort((a, b) => a.diasFaltantes - b.diasFaltantes)
      .slice(0, 6);

    res.json({
      periodoActual,
      totalClientesActivos,
      totalFacturadoMes,
      totalPendienteCobro,
      totalPagadoMes,
      cuentasMesCount: cuentasMes.length,
      cuentasPendientesCount: cuentasPendientes.length,
      proximosCobros,
      recientes: db.cuentas.slice(0, 5),
      smtpActivo: Boolean(db.emisor.smtp && db.emisor.smtp.active)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Emisor Config
app.get('/api/emisor', (req, res) => {
  const db = readDb();
  res.json(db.emisor);
});

app.post('/api/emisor', (req, res) => {
  try {
    const db = readDb();
    db.emisor = { ...db.emisor, ...req.body };
    writeDb(db);
    addLog('info', 'Configuración del emisor actualizada con éxito.');
    res.json({ success: true, emisor: db.emisor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Subir firma
app.post('/api/emisor/upload-firma', upload.single('firma'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo de firma' });
    }
    const db = readDb();
    const relativePath = `/storage/uploads/${req.file.filename}`;
    db.emisor.firmaUrl = relativePath;
    writeDb(db);
    addLog('info', 'Firma digitalizada actualizada.');
    res.json({ success: true, firmaUrl: relativePath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Subir logo
app.post('/api/emisor/upload-logo', upload.single('logo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo de logo' });
    }
    const db = readDb();
    const relativePath = `/storage/uploads/${req.file.filename}`;
    db.emisor.logoUrl = relativePath;
    writeDb(db);
    addLog('info', 'Logo institucional actualizado.');
    res.json({ success: true, logoUrl: relativePath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Probar conexión SMTP y enviar correo de prueba
app.post('/api/emisor/test-smtp', async (req, res) => {
  try {
    const { smtp, emailPrueba } = req.body;
    const db = readDb();
    const configToTest = smtp || db.emisor.smtp;

    await verifySmtp(configToTest);

    if (emailPrueba) {
      await sendTestEmail(configToTest, emailPrueba, db.emisor.nombre);
    }

    res.json({ success: true, message: 'Servidor SMTP conectado correctamente y correo de prueba enviado.' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 3. Clientes CRUD
app.get('/api/clientes', (req, res) => {
  const db = readDb();
  res.json(db.clientes);
});

app.post('/api/clientes', (req, res) => {
  try {
    const db = readDb();
    const nuevoCliente = {
      id: uuidv4(),
      nombre: req.body.nombre || 'Nuevo Cliente',
      tipoDoc: req.body.tipoDoc || 'NIT',
      numDoc: req.body.numDoc || '',
      dv: req.body.dv || '',
      contacto: req.body.contacto || '',
      email: req.body.email || '',
      emailCC: req.body.emailCC || '',
      telefono: req.body.telefono || '',
      direccion: req.body.direccion || '',
      ciudad: req.body.ciudad || '',
      concepto: req.body.concepto || 'Honorarios profesionales correspondientes al período {MES} {AÑO}',
      valor: Number(req.body.valor) || 0,
      aplicarRetefuente: Boolean(req.body.aplicarRetefuente),
      porcentajeRetefuente: Number(req.body.porcentajeRetefuente) || 4,
      aplicarReteICA: Boolean(req.body.aplicarReteICA),
      porcentajeReteICA: Number(req.body.porcentajeReteICA) || 0.966,
      diaCorte: parseInt(req.body.diaCorte, 10) || 25,
      envioAutomatico: req.body.envioAutomatico !== undefined ? Boolean(req.body.envioAutomatico) : true,
      activo: req.body.activo !== undefined ? Boolean(req.body.activo) : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.clientes.unshift(nuevoCliente);
    writeDb(db);
    addLog('info', `Cliente creado: ${nuevoCliente.nombre}`);
    res.json({ success: true, cliente: nuevoCliente });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/clientes/:id', (req, res) => {
  try {
    const db = readDb();
    const index = db.clientes.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    db.clientes[index] = {
      ...db.clientes[index],
      ...req.body,
      valor: Number(req.body.valor) !== undefined ? Number(req.body.valor) : db.clientes[index].valor,
      updatedAt: new Date().toISOString()
    };

    writeDb(db);
    addLog('info', `Cliente actualizado: ${db.clientes[index].nombre}`);
    res.json({ success: true, cliente: db.clientes[index] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/clientes/:id', (req, res) => {
  try {
    const db = readDb();
    const cliente = db.clientes.find(c => c.id === req.params.id);
    db.clientes = db.clientes.filter(c => c.id !== req.params.id);
    writeDb(db);
    addLog('info', `Cliente eliminado: ${cliente ? cliente.nombre : req.params.id}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Emitir cuenta manual para un cliente específico
app.post('/api/clientes/:id/emitir', async (req, res) => {
  try {
    const db = readDb();
    const cliente = db.clientes.find(c => c.id === req.params.id);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const fecha = req.body.fecha ? new Date(req.body.fecha) : new Date();
    const resultado = await emitirCuentaCliente(cliente, fecha, {
      forzarDuplicado: Boolean(req.body.forzarDuplicado),
      enviarInmediato: Boolean(req.body.enviarInmediato)
    });

    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Cuentas de Cobro CRUD y Acciones
app.get('/api/cuentas', (req, res) => {
  const db = readDb();
  let list = db.cuentas;

  if (req.query.clienteId) {
    list = list.filter(c => c.clienteId === req.query.clienteId);
  }
  if (req.query.estado) {
    list = list.filter(c => c.estado === req.query.estado);
  }
  if (req.query.periodo) {
    list = list.filter(c => c.periodo === req.query.periodo);
  }

  res.json(list);
});

app.get('/api/cuentas/:id', (req, res) => {
  const db = readDb();
  const cuenta = db.cuentas.find(c => c.id === req.params.id);
  if (!cuenta) {
    return res.status(404).json({ error: 'Cuenta no encontrada' });
  }
  res.json(cuenta);
});

// Descargar o ver PDF
app.get('/api/cuentas/:id/pdf', async (req, res) => {
  try {
    const db = readDb();
    const cuenta = db.cuentas.find(c => c.id === req.params.id);
    if (!cuenta) {
      return res.status(404).json({ error: 'Cuenta de cobro no encontrada' });
    }

    let filePath = cuenta.pdfPath;

    // Si el archivo no existe o se movió, regenerarlo en el vuelo
    if (!filePath || !fs.existsSync(filePath)) {
      const generated = await generateCuentaCobroPDF(cuenta, db.emisor);
      filePath = generated.filePath;
      cuenta.pdfPath = filePath;
      cuenta.pdfFileName = generated.fileName;
      writeDb(db);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cuenta.pdfFileName || 'cuenta.pdf'}"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enviar cuenta por email
app.post('/api/cuentas/:id/enviar', async (req, res) => {
  try {
    const db = readDb();
    const cuenta = db.cuentas.find(c => c.id === req.params.id);
    if (!cuenta) {
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }

    let filePath = cuenta.pdfPath;
    if (!filePath || !fs.existsSync(filePath)) {
      const generated = await generateCuentaCobroPDF(cuenta, db.emisor);
      filePath = generated.filePath;
      cuenta.pdfPath = filePath;
    }

    const resultado = await sendCuentaCobroEmail(cuenta, db.emisor, filePath);
    cuenta.estado = 'enviada';
    cuenta.fechaEnvio = new Date().toISOString();
    writeDb(db);

    res.json({ success: true, message: `Cuenta ${cuenta.consecutivo} enviada a ${cuenta.clienteEmail}`, resultado });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar estado (ej. Pagada, Anulada)
app.put('/api/cuentas/:id/estado', (req, res) => {
  try {
    const { estado, fechaPago } = req.body;
    const db = readDb();
    const index = db.cuentas.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }

    db.cuentas[index].estado = estado;
    if (estado === 'pagada') {
      db.cuentas[index].fechaPago = fechaPago || new Date().toISOString().split('T')[0];
    }

    writeDb(db);
    addLog('info', `Estado de cuenta ${db.cuentas[index].consecutivo} cambiado a: ${estado}`);
    res.json({ success: true, cuenta: db.cuentas[index] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar cuenta
app.delete('/api/cuentas/:id', (req, res) => {
  try {
    const db = readDb();
    const cuenta = db.cuentas.find(c => c.id === req.params.id);
    if (!cuenta) {
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }

    if (cuenta.pdfPath && fs.existsSync(cuenta.pdfPath)) {
      try { fs.unlinkSync(cuenta.pdfPath); } catch(e){}
    }

    db.cuentas = db.cuentas.filter(c => c.id !== req.params.id);
    writeDb(db);
    addLog('info', `Cuenta eliminada: ${cuenta.consecutivo}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generación Manual Personalizada
app.post('/api/cuentas/generar-manual', async (req, res) => {
  try {
    const db = readDb();
    const emisor = db.emisor;
    const b = req.body;

    const numConsecutivo = emisor.siguienteNumero || (db.cuentas.length + 1);
    const prefijo = emisor.prefijoConsecutivo || 'CC-';
    const consecutivo = `${prefijo}${String(numConsecutivo).padStart(3, '0')}`;

    const subtotal = Number(b.valor) || 0;
    const retefuente = b.aplicarRetefuente ? Math.round(subtotal * (Number(b.porcentajeRetefuente) || 0) / 100) : 0;
    const reteICA = b.aplicarReteICA ? Math.round(subtotal * (Number(b.porcentajeReteICA) || 0) / 100) : 0;
    const totalNeto = subtotal - retefuente - reteICA;
    const totalEnLetras = numeroALetras(totalNeto);

    const fEmision = b.fechaEmision || new Date().toISOString().split('T')[0];
    const fVencimiento = b.fechaVencimiento || new Date(Date.now() + 15*86400000).toISOString().split('T')[0];

    const nuevaCuenta = {
      id: uuidv4(),
      consecutivo,
      numero: numConsecutivo,
      clienteId: b.clienteId || null,
      clienteNombre: b.clienteNombre,
      clienteDoc: b.clienteDoc,
      clienteContacto: b.clienteContacto || '',
      clienteEmail: b.clienteEmail,
      clienteEmailCC: b.clienteEmailCC || '',
      clienteDireccion: b.clienteDireccion || '',
      clienteCiudad: b.clienteCiudad || '',
      fechaEmision: fEmision,
      fechaVencimiento: fVencimiento,
      periodo: b.periodo || 'Emisión Manual',
      concepto: b.concepto,
      subtotal,
      retefuente,
      reteICA,
      totalNeto,
      totalEnLetras,
      estado: 'borrador',
      fechaEnvio: null,
      fechaPago: null,
      pdfPath: '',
      pdfFileName: '',
      generadaPorScheduler: false,
      createdAt: new Date().toISOString()
    };

    const { filePath, fileName } = await generateCuentaCobroPDF(nuevaCuenta, emisor);
    nuevaCuenta.pdfPath = filePath;
    nuevaCuenta.pdfFileName = fileName;

    db.emisor.siguienteNumero = numConsecutivo + 1;
    db.cuentas.unshift(nuevaCuenta);
    writeDb(db);

    if (b.enviarInmediato && emisor.smtp && emisor.smtp.active) {
      try {
        await sendCuentaCobroEmail(nuevaCuenta, emisor, filePath);
        nuevaCuenta.estado = 'enviada';
        nuevaCuenta.fechaEnvio = new Date().toISOString();
        writeDb(db);
      } catch (err) {
        addLog('error', `Cuenta manual generada pero falló envío de email: ${err.message}`);
      }
    }

    addLog('info', `Cuenta manual ${nuevaCuenta.consecutivo} creada para ${nuevaCuenta.clienteNombre}`);
    res.json({ success: true, cuenta: nuevaCuenta });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Disparar corte diario manualmente
app.post('/api/scheduler/ejecutar-corte', async (req, res) => {
  try {
    const resultados = await procesarCorteDelDia();
    res.json({ success: true, resultados });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Logs del sistema
app.get('/api/logs', (req, res) => {
  const db = readDb();
  res.json(db.logs);
});

// Ruta para SPA (cualquier ruta no API entrega index.html)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Iniciar Servidor solo en entorno local (en Vercel se invoca como Serverless Function)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Sistema de Cuentas de Cobro Recurrentes`);
    console.log(`🌐 Servidor iniciado en: http://localhost:${PORT}`);
    console.log(`📁 Almacenamiento local listo en: ${path.join(__dirname, '..', 'data')}`);
    console.log(`====================================================`);
    
    // Iniciar Scheduler de cobros automáticos
    initScheduler();
  });
}

module.exports = app;
