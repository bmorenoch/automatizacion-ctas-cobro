const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const isVercel = Boolean(process.env.VERCEL);
const DATA_DIR = isVercel ? path.join('/tmp', 'data') : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BUNDLED_DB_FILE = path.join(__dirname, '..', 'data', 'db.json');
const UPLOADS_DIR = isVercel ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'storage', 'uploads');
const PDFS_DIR = isVercel ? path.join('/tmp', 'pdfs') : path.join(__dirname, '..', 'storage', 'pdfs');

// Asegurar directorios de almacenamiento
[DATA_DIR, UPLOADS_DIR, PDFS_DIR].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {
    console.error('Error creando directorio:', dir, e.message);
  }
});

const defaultState = {
  emisor: {
    nombre: 'TU NOMBRE O RAZÓN SOCIAL',
    tipoDoc: 'CC',
    numDoc: '1234567890',
    dv: '',
    profesion: 'Prestador de Servicios Profesionales / Desarrollador / Consultor',
    email: 'tu_correo@ejemplo.com',
    telefono: '+57 300 123 4567',
    direccion: 'Calle 100 # 15 - 20, Of. 401',
    ciudad: 'Bogotá D.C., Colombia',
    regimenTexto: 'Persona Natural No Responsable del Impuesto sobre las Ventas (IVA) - Art. 437 del Estatuto Tributario Nacional.',
    prefijoConsecutivo: 'CC-',
    siguienteNumero: 1,
    diasVencimiento: 15,
    horaEjecucionAutomatica: '08:00',
    bancos: [
      {
        id: '1',
        banco: 'Bancolombia',
        tipoCuenta: 'Ahorros',
        numeroCuenta: '123-456789-00',
        titular: 'TU NOMBRE COMPLETO',
        docTitular: 'CC 1234567890'
      },
      {
        id: '2',
        banco: 'Nequi / Daviplata',
        tipoCuenta: 'Billetera Digital',
        numeroCuenta: '300 123 4567',
        titular: 'TU NOMBRE COMPLETO',
        docTitular: 'CC 1234567890'
      }
    ],
    firmaUrl: '',
    logoUrl: '',
    smtp: {
      active: false,
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: '',
      pass: '',
      fromName: 'Facturación y Cobranza',
      fromEmail: '',
      bccEmisor: true
    },
    plantillaEmail: {
      asunto: 'Cuenta de Cobro {NUMERO_CUENTA} - {PERIODO} - {NOMBRE_EMISOR}',
      cuerpo: `Estimado(s) <strong>{NOMBRE_CLIENTE}</strong>,<br><br>
Esperamos se encuentren muy bien.<br><br>
Adjuntamos la <strong>Cuenta de Cobro No. {NUMERO_CUENTA}</strong> correspondiente a los servicios prestados durante el período <strong>{PERIODO}</strong> por un valor total neto de <strong>{VALOR_TOTAL}</strong>.<br><br>
<strong>Fecha límite de pago:</strong> {FECHA_VENCIMIENTO}<br><br>
<strong>Datos para consignación / transferencia:</strong><br>
{DATOS_BANCARIOS}<br><br>
Agradecemos enviar el soporte de pago en respuesta a este correo.<br><br>
Atentamente,<br>
<strong>{NOMBRE_EMISOR}</strong><br>
{TELEFONO_EMISOR} | {EMAIL_EMISOR}`
    }
  },
  clientes: [
    {
      id: uuidv4(),
      nombre: 'EMPRESA CLIENTE DEMO S.A.S.',
      tipoDoc: 'NIT',
      numDoc: '901.234.567',
      dv: '8',
      contacto: 'Ing. Carlos Mendoza',
      email: 'carlos.mendoza@clientedemo.com',
      emailCC: 'contabilidad@clientedemo.com',
      telefono: '+57 (601) 789 4512',
      direccion: 'Carrera 7 # 71 - 52 Torre A Piso 8',
      ciudad: 'Bogotá D.C.',
      concepto: 'Prestación de servicios profesionales de desarrollo web, soporte técnico y mantenimiento en la nube correspondiente al período {MES} {AÑO}',
      valor: 2500000,
      aplicarRetefuente: false,
      porcentajeRetefuente: 4,
      aplicarReteICA: false,
      porcentajeReteICA: 0.966,
      diaCorte: 25,
      envioAutomatico: true,
      activo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  cuentas: [],
  logs: [
    {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      tipo: 'info',
      mensaje: 'Sistema de Cuentas de Cobro inicializado correctamente.',
      detalles: 'Base de datos lista para operar.'
    }
  ]
};

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      if (isVercel && fs.existsSync(BUNDLED_DB_FILE)) {
        try {
          const bundledRaw = fs.readFileSync(BUNDLED_DB_FILE, 'utf8');
          const bundledParsed = JSON.parse(bundledRaw);
          writeDb(bundledParsed);
          return bundledParsed;
        } catch (e) {}
      }
      writeDb(defaultState);
      return JSON.parse(JSON.stringify(defaultState));
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(data);
    // Mezclar con valores predeterminados por si faltan claves en migraciones
    return {
      emisor: { ...defaultState.emisor, ...(parsed.emisor || {}) },
      clientes: Array.isArray(parsed.clientes) ? parsed.clientes : defaultState.clientes,
      cuentas: Array.isArray(parsed.cuentas) ? parsed.cuentas : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : []
    };
  } catch (error) {
    console.error('Error leyendo base de datos:', error);
    return defaultState;
  }
}

function writeDb(data) {
  try {
    const tempFile = DB_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
    return true;
  } catch (error) {
    console.error('Error guardando base de datos:', error);
    return false;
  }
}

function addLog(tipo, mensaje, detalles = '') {
  const db = readDb();
  const newLog = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    tipo,
    mensaje,
    detalles: typeof detalles === 'object' ? JSON.stringify(detalles) : String(detalles)
  };
  db.logs.unshift(newLog);
  // Mantener últimos 200 logs
  if (db.logs.length > 200) {
    db.logs = db.logs.slice(0, 200);
  }
  writeDb(db);
  return newLog;
}

module.exports = {
  DATA_DIR,
  UPLOADS_DIR,
  PDFS_DIR,
  readDb,
  writeDb,
  addLog
};
