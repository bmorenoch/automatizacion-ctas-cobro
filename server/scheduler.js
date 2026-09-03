const cron = require('node-cron');
const { randomUUID: uuidv4 } = require('crypto');
const { readDb, writeDb, addLog } = require('./db');
const { generateCuentaCobroPDF } = require('./pdfService');
const { sendCuentaCobroEmail } = require('./mailService');
const { numeroALetras } = require('./numberToWords');

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Reemplaza variables dinámicas en el concepto
 */
function interpolateConcepto(templateStr, dateObj = new Date()) {
  if (!templateStr) return '';
  const mesActual = MESES[dateObj.getMonth()];
  const mesAnterior = MESES[(dateObj.getMonth() - 1 + 12) % 12];
  const anio = dateObj.getFullYear();
  const dia = String(dateObj.getDate()).padStart(2, '0');
  const periodo = `${mesActual} ${anio}`;

  return templateStr
    .replace(/\{MES\}/gi, mesActual)
    .replace(/\{AÑO\}/gi, anio)
    .replace(/\{ANO\}/gi, anio)
    .replace(/\{MES_ANTERIOR\}/gi, mesAnterior)
    .replace(/\{PERIODO\}/gi, periodo)
    .replace(/\{DIA\}/gi, dia);
}

/**
 * Formatea fechas YYYY-MM-DD
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Emite una cuenta de cobro para un cliente específico
 */
async function emitirCuentaCliente(cliente, fechaEmision = new Date(), options = {}) {
  const db = readDb();
  const emisor = db.emisor;

  const anio = fechaEmision.getFullYear();
  const mesIdx = fechaEmision.getMonth();
  const mesNombre = MESES[mesIdx];
  const periodo = `${mesNombre} ${anio}`;

  // Verificar si ya se emitió en este período para evitar duplicados accidentales
  const yaEmitida = db.cuentas.find(c => 
    c.clienteId === cliente.id && 
    c.periodo === periodo && 
    c.estado !== 'anulada' && 
    !options.forzarDuplicado
  );

  if (yaEmitida) {
    addLog('info', `La cuenta para ${cliente.nombre} período ${periodo} ya existe (No. ${yaEmitida.consecutivo}). Omitiendo duplicado.`);
    return {
      success: false,
      alreadyExists: true,
      cuenta: yaEmitida
    };
  }

  // Generar consecutivo
  const numConsecutivo = emisor.siguienteNumero || (db.cuentas.length + 1);
  const prefijo = emisor.prefijoConsecutivo || 'CC-';
  const consecutivo = `${prefijo}${String(numConsecutivo).padStart(3, '0')}`;

  // Fechas
  const fEmisionStr = formatDate(fechaEmision);
  const fVencimiento = new Date(fechaEmision);
  fVencimiento.setDate(fVencimiento.getDate() + (parseInt(emisor.diasVencimiento, 10) || 15));
  const fVencimientoStr = formatDate(fVencimiento);

  // Cálculos financieros
  const subtotal = Number(cliente.valor) || 0;
  const retefuente = cliente.aplicarRetefuente 
    ? Math.round(subtotal * (Number(cliente.porcentajeRetefuente) || 4) / 100)
    : 0;
  const reteICA = cliente.aplicarReteICA 
    ? Math.round(subtotal * (Number(cliente.porcentajeReteICA) || 0.966) / 100)
    : 0;
  const totalNeto = subtotal - retefuente - reteICA;
  const totalEnLetras = numeroALetras(totalNeto);

  const conceptoFinal = interpolateConcepto(cliente.concepto, fechaEmision);

  const clienteDocCompleto = `${cliente.tipoDoc || 'NIT'}: ${cliente.numDoc}`;

  const nuevaCuenta = {
    id: uuidv4(),
    consecutivo,
    numero: numConsecutivo,
    clienteId: cliente.id,
    clienteNombre: cliente.nombre,
    clienteDoc: clienteDocCompleto,
    clienteContacto: cliente.contacto || '',
    clienteEmail: cliente.email,
    clienteEmailCC: cliente.emailCC || '',
    clienteDireccion: cliente.direccion || '',
    clienteCiudad: cliente.ciudad || '',
    fechaEmision: fEmisionStr,
    fechaVencimiento: fVencimientoStr,
    periodo,
    concepto: conceptoFinal,
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
    generadaPorScheduler: options.generadaPorScheduler || false,
    createdAt: new Date().toISOString()
  };

  // Generar PDF
  try {
    const { filePath, fileName } = await generateCuentaCobroPDF(nuevaCuenta, emisor);
    nuevaCuenta.pdfPath = filePath;
    nuevaCuenta.pdfFileName = fileName;
  } catch (pdfErr) {
    addLog('error', `Error generando PDF para ${cliente.nombre}: ${pdfErr.message}`, pdfErr);
    throw pdfErr;
  }

  // Incrementar siguiente consecutivo en emisor
  db.emisor.siguienteNumero = numConsecutivo + 1;
  db.cuentas.unshift(nuevaCuenta);
  writeDb(db);

  // Evaluar envío por correo
  const debeEnviar = (cliente.envioAutomatico || options.enviarInmediato) && emisor.smtp && emisor.smtp.active;

  if (debeEnviar) {
    try {
      await sendCuentaCobroEmail(nuevaCuenta, emisor, nuevaCuenta.pdfPath);
      nuevaCuenta.estado = 'enviada';
      nuevaCuenta.fechaEnvio = new Date().toISOString();
      
      // Actualizar en DB
      const currentDb = readDb();
      const index = currentDb.cuentas.findIndex(c => c.id === nuevaCuenta.id);
      if (index !== -1) {
        currentDb.cuentas[index] = nuevaCuenta;
        writeDb(currentDb);
      }
    } catch (mailErr) {
      addLog('error', `Cuenta ${nuevaCuenta.consecutivo} generada pero falló el envío de email: ${mailErr.message}`);
    }
  } else {
    addLog('info', `Cuenta ${nuevaCuenta.consecutivo} generada en estado ${nuevaCuenta.estado} para ${cliente.nombre}`);
  }

  return {
    success: true,
    cuenta: nuevaCuenta
  };
}

/**
 * Ejecuta el corte automático para todos los clientes activos del día actual
 */
async function procesarCorteDelDia(fecha = new Date()) {
  const db = readDb();
  const diaHoy = fecha.getDate();
  const clientes = db.clientes.filter(c => c.activo);

  addLog('info', `Iniciando revisión diaria de corte para el día ${diaHoy}. ${clientes.length} clientes activos en el sistema.`);

  const resultados = [];

  for (const cliente of clientes) {
    const diaCorte = parseInt(cliente.diaCorte, 10);
    
    // Si el día de corte coincide con hoy, o si es fin de mes (ej. día 30/31) y el corte es >= día de hoy
    let coincideCorte = (diaCorte === diaHoy);

    // Manejo de meses con menos de 31 días
    const ultimoDiaDelMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
    if (diaHoy === ultimoDiaDelMes && diaCorte > ultimoDiaDelMes) {
      coincideCorte = true;
    }

    if (coincideCorte) {
      try {
        const res = await emitirCuentaCliente(cliente, fecha, { generadaPorScheduler: true });
        resultados.push({ cliente: cliente.nombre, resultado: res });
      } catch (err) {
        resultados.push({ cliente: cliente.nombre, error: err.message });
      }
    }
  }

  return resultados;
}

/**
 * Inicializa el programador de tareas automáticas (Cron)
 */
function initScheduler() {
  // Ejecutar todos los días a las 08:00 AM (y cada 2 horas verificación preventiva)
  cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Ejecutando Scheduler automático de Cuentas de Cobro (08:00 AM)...');
    try {
      await procesarCorteDelDia();
    } catch (error) {
      console.error('Error en ejecución de Scheduler:', error);
      addLog('error', `Falla en ejecución automática del programador: ${error.message}`);
    }
  });

  console.log('✅ Scheduler de facturación recurrente iniciado (Revisión diaria configurada).');
}

module.exports = {
  initScheduler,
  procesarCorteDelDia,
  emitirCuentaCliente,
  interpolateConcepto
};
