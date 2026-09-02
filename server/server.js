const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { randomUUID: uuidv4 } = require('crypto');

const { readDb, writeDb, addLog, UPLOADS_DIR, PDFS_DIR } = require('./db');
const { generateCuentaCobroPDF, formatMoney } = require('./pdfService');
const { sendCuentaCobroEmail, verifySmtp, sendTestEmail } = require('./mailService');
const { initScheduler, procesarCorteDelDia, emitirCuentaCliente, interpolateConcepto } = require('./scheduler');
const { numeroALetras } = require('./numberToWords');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Multer para firmas y logos (almacenamiento en memoria para compatibilidad serverless/disco)
const storage = multer.memoryStorage();
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

// Middlewares globales
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de normalización de rutas para Vercel Serverless Functions
app.use((req, res, next) => {
  if (req.url) {
    if (req.url.startsWith('/api/index.js')) {
      let subPath = req.url.replace('/api/index.js', '');
      if (subPath.startsWith('?')) {
        try {
          const urlObj = new URL(req.url, 'http://localhost');
          subPath = urlObj.searchParams.get('path') || '';
        } catch(e){}
      }
      if (!subPath.startsWith('/')) subPath = '/' + subPath;
      req.url = '/api' + (subPath === '/' ? '' : subPath);
    }
  }
  next();
});

// Servir archivos estáticos cuando se ejecuta localmente
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/storage/uploads', express.static(UPLOADS_DIR));

// ================= ROUTER DE LA API =================
const apiRouter = express.Router();

// 1. Dashboard
apiRouter.get('/dashboard', (req, res) => {
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
        let diasFaltantes = (c.diaCorte || 25) - diaHoy;
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
apiRouter.get('/emisor', (req, res) => {
  try {
    const db = readDb();
    res.json(db.emisor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/emisor', (req, res) => {
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

// Subir firma (como base64 / archivo)
apiRouter.post('/emisor/upload-firma', upload.single('firma'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo de firma' });
    }
    const db = readDb();
    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    
    // Guardar copia en disco si es posible
    try {
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      const filename = `firma_${Date.now()}${path.extname(req.file.originalname || '.png')}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), req.file.buffer);
    } catch(e){}

    db.emisor.firmaUrl = base64Data;
    writeDb(db);
    addLog('info', 'Firma digitalizada actualizada.');
    res.json({ success: true, firmaUrl: base64Data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Subir logo (como base64 / archivo)
apiRouter.post('/emisor/upload-logo', upload.single('logo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo de logo' });
    }
    const db = readDb();
    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    try {
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      const filename = `logo_${Date.now()}${path.extname(req.file.originalname || '.png')}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), req.file.buffer);
    } catch(e){}

    db.emisor.logoUrl = base64Data;
    writeDb(db);
    addLog('info', 'Logo institucional actualizado.');
    res.json({ success: true, logoUrl: base64Data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Probar conexión SMTP y enviar correo de prueba
apiRouter.post('/emisor/test-smtp', async (req, res) => {
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
apiRouter.get('/clientes', (req, res) => {
  try {
    const db = readDb();
    res.json(db.clientes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/clientes', (req, res) => {
  try {
    const db = readDb();
    const nuevoCliente = {
      id: uuidv4(),
      nombre: req.body.nombre || 'Nuevo Cliente',
      tipoDoc: req.body.tipoDoc || 'RUT',
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

apiRouter.put('/clientes/:id', (req, res) => {
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

apiRouter.delete('/clientes/:id', (req, res) => {
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

// Emitir cuenta para cliente
apiRouter.post('/clientes/:id/emitir', async (req, res) => {
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
apiRouter.get('/cuentas', (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/cuentas/:id', (req, res) => {
  try {
    const db = readDb();
    const cuenta = db.cuentas.find(c => c.id === req.params.id);
    if (!cuenta) {
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }
    res.json(cuenta);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Descargar o ver PDF
apiRouter.get('/cuentas/:id/pdf', async (req, res) => {
  try {
    const db = readDb();
    const cuenta = db.cuentas.find(c => c.id === req.params.id);
    if (!cuenta) {
      return res.status(404).json({ error: 'Cuenta de cobro no encontrada' });
    }

    let filePath = cuenta.pdfPath;

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
apiRouter.post('/cuentas/:id/enviar', async (req, res) => {
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

// Actualizar estado
apiRouter.put('/cuentas/:id/estado', (req, res) => {
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
apiRouter.delete('/cuentas/:id', (req, res) => {
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

// Generación Manual
apiRouter.post('/cuentas/generar-manual', async (req, res) => {
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
    const fVencimiento = b.fechaVencimiento || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];

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

// Disparar corte diario manualmente
apiRouter.post('/scheduler/ejecutar-corte', async (req, res) => {
  try {
    const resultados = await procesarCorteDelDia();
    res.json({ success: true, resultados });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logs del sistema
apiRouter.get('/logs', (req, res) => {
  try {
    const db = readDb();
    res.json(db.logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Montar router en ambas rutas para compatibilidad total con Vercel
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Manejador global de errores
app.use((err, req, res, next) => {
  console.error('Error interno Express:', err);
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

// Iniciar Servidor solo en entorno local (en Vercel se invoca como Serverless Function)
if (require.main === module) {
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
