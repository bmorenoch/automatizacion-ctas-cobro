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
      id: 'dce1ac21-828d-47c2-a29c-d40a0c1d9505',
      nombre: 'EMPRESA CLIENTE DEMO S.A.S.',
      tipoDoc: 'RUT',
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
    },
    {
      id: 'f8b2c145-9123-4d7a-b51e-1289ab345678',
      nombre: 'INVERSIONES & TECNOLOGÍA ANDINA S.A.S.',
      tipoDoc: 'NIT',
      numDoc: '900.876.543',
      dv: '1',
      contacto: 'Dra. Valentina Restrepo',
      email: 'facturacion@andinatec.com',
      emailCC: 'valentina.restrepo@andinatec.com',
      telefono: '+57 (604) 444 8920',
      direccion: 'Calle 10 # 42 - 28 El Poblado',
      ciudad: 'Medellín, Colombia',
      concepto: 'Servicios de consultoría, desarrollo de software y automatización de procesos correspondientes al período {MES} {AÑO}',
      valor: 3800000,
      aplicarRetefuente: true,
      porcentajeRetefuente: 4,
      aplicarReteICA: true,
      porcentajeReteICA: 0.966,
      diaCorte: 15,
      envioAutomatico: true,
      activo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  cuentas: [
    {
      id: 'a3a6412f-5bc9-4d2f-8aa3-e8462f00c87e',
      consecutivo: 'CC-001',
      numero: 1,
      clienteId: 'dce1ac21-828d-47c2-a29c-d40a0c1d9505',
      clienteNombre: 'EMPRESA CLIENTE DEMO S.A.S.',
      clienteDoc: 'RUT: 901.234.567-8',
      clienteContacto: 'Ing. Carlos Mendoza',
      clienteEmail: 'carlos.mendoza@clientedemo.com',
      clienteEmailCC: 'contabilidad@clientedemo.com',
      clienteDireccion: 'Carrera 7 # 71 - 52 Torre A Piso 8',
      clienteCiudad: 'Bogotá D.C.',
      fechaEmision: new Date().toISOString().split('T')[0],
      fechaVencimiento: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      periodo: 'Septiembre 2026',
      concepto: 'Prestación de servicios profesionales de desarrollo web, soporte técnico y mantenimiento en la nube correspondiente al período Septiembre 2026',
      subtotal: 2500000,
      retefuente: 0,
      reteICA: 0,
      totalNeto: 2500000,
      totalEnLetras: 'DOS MILLONES QUINIENTOS MIL PESOS M/CTE.',
      estado: 'pagada',
      fechaEnvio: new Date().toISOString(),
      fechaPago: new Date().toISOString().split('T')[0],
      pdfPath: '',
      pdfFileName: 'CC-001_EMPRESA_CLIENTE_DEMO_S_A_S__Septiembre_2026.pdf',
      generadaPorScheduler: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'b7c89012-3456-4789-abcd-ef0123456789',
      consecutivo: 'CC-002',
      numero: 2,
      clienteId: 'f8b2c145-9123-4d7a-b51e-1289ab345678',
      clienteNombre: 'INVERSIONES & TECNOLOGÍA ANDINA S.A.S.',
      clienteDoc: 'NIT: 900.876.543-1',
      clienteContacto: 'Dra. Valentina Restrepo',
      clienteEmail: 'facturacion@andinatec.com',
      clienteEmailCC: 'valentina.restrepo@andinatec.com',
      clienteDireccion: 'Calle 10 # 42 - 28 El Poblado',
      clienteCiudad: 'Medellín, Colombia',
      fechaEmision: new Date().toISOString().split('T')[0],
      fechaVencimiento: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      periodo: 'Septiembre 2026',
      concepto: 'Servicios de consultoría, desarrollo de software y automatización de procesos correspondientes al período Septiembre 2026',
      subtotal: 3800000,
      retefuente: 152000,
      reteICA: 36708,
      totalNeto: 3611292,
      totalEnLetras: 'TRES MILLONES SEISCIENTOS ONCE MIL DOSCIENTOS NOVENTA Y DOS PESOS M/CTE.',
      estado: 'enviada',
      fechaEnvio: new Date().toISOString(),
      fechaPago: null,
      pdfPath: '',
      pdfFileName: 'CC-002_INVERSIONES___TECNOLOGIA_ANDINA_S_A_S__Septiembre_2026.pdf',
      generadaPorScheduler: false,
      createdAt: new Date().toISOString()
    }
  ],
  logs: [
    {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      tipo: 'success',
      mensaje: 'Sistema de Cuentas de Cobro inicializado con datos demo.',
      detalles: 'Cuentas CC-001 y CC-002 cargadas para visualización.'
    }
  ]
};

let inMemoryDb = null;

function readDb() {
  try {
    if (inMemoryDb) {
      return inMemoryDb;
    }
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      inMemoryDb = {
        emisor: { ...defaultState.emisor, ...(parsed.emisor || {}) },
        clientes: Array.isArray(parsed.clientes) && parsed.clientes.length > 0 ? parsed.clientes : defaultState.clientes,
        cuentas: Array.isArray(parsed.cuentas) && parsed.cuentas.length > 0 ? parsed.cuentas : defaultState.cuentas,
        logs: Array.isArray(parsed.logs) ? parsed.logs : []
      };
      return inMemoryDb;
    }
    if (fs.existsSync(BUNDLED_DB_FILE)) {
      try {
        const bundledRaw = fs.readFileSync(BUNDLED_DB_FILE, 'utf8');
        const bundledParsed = JSON.parse(bundledRaw);
        inMemoryDb = {
          emisor: { ...defaultState.emisor, ...(bundledParsed.emisor || {}) },
          clientes: Array.isArray(bundledParsed.clientes) && bundledParsed.clientes.length > 0 ? bundledParsed.clientes : defaultState.clientes,
          cuentas: Array.isArray(bundledParsed.cuentas) && bundledParsed.cuentas.length > 0 ? bundledParsed.cuentas : defaultState.cuentas,
          logs: Array.isArray(bundledParsed.logs) ? bundledParsed.logs : []
        };
        writeDb(inMemoryDb);
        return inMemoryDb;
      } catch (e) {}
    }
    inMemoryDb = JSON.parse(JSON.stringify(defaultState));
    writeDb(inMemoryDb);
    return inMemoryDb;
  } catch (error) {
    console.error('Error leyendo base de datos:', error);
    return inMemoryDb || JSON.parse(JSON.stringify(defaultState));
  }
}

function writeDb(data) {
  inMemoryDb = data;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error guardando base de datos:', error.message);
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
