/**
 * Convierte un número numérico a su representación en letras en español
 * Adaptado especialmente para pesos colombianos (COP) y moneda legal (M/CTE).
 */

function unidades(num) {
  switch (num) {
    case 1: return 'UN';
    case 2: return 'DOS';
    case 3: return 'TRES';
    case 4: return 'CUATRO';
    case 5: return 'CINCO';
    case 6: return 'SEIS';
    case 7: return 'SIETE';
    case 8: return 'OCHO';
    case 9: return 'NUEVE';
    default: return '';
  }
}

function decenasY(strSin, numUnidades) {
  if (numUnidades > 0) {
    return strSin + ' Y ' + unidades(numUnidades);
  }
  return strSin;
}

function decenas(num) {
  const decena = Math.floor(num / 10);
  const unidad = num - (decena * 10);

  switch (decena) {
    case 1:
      switch (unidad) {
        case 0: return 'DIEZ';
        case 1: return 'ONCE';
        case 2: return 'DOCE';
        case 3: return 'TRECE';
        case 4: return 'CATORCE';
        case 5: return 'QUINCE';
        default: return 'DIECI' + unidades(unidad);
      }
    case 2:
      switch (unidad) {
        case 0: return 'VEINTE';
        default: return 'VEINTI' + unidades(unidad);
      }
    case 3: return decenasY('TREINTA', unidad);
    case 4: return decenasY('CUARENTA', unidad);
    case 5: return decenasY('CINCUENTA', unidad);
    case 6: return decenasY('SESENTA', unidad);
    case 7: return decenasY('SETENTA', unidad);
    case 8: return decenasY('OCHENTA', unidad);
    case 9: return decenasY('NOVENTA', unidad);
    case 0: return unidades(unidad);
    default: return '';
  }
}

function centenas(num) {
  const centena = Math.floor(num / 100);
  const decena = num - (centena * 100);

  switch (centena) {
    case 1:
      if (decena > 0) return 'CIENTO ' + decenas(decena);
      return 'CIEN';
    case 2: return 'DOSCIENTOS ' + decenas(decena);
    case 3: return 'TRESCIENTOS ' + decenas(decena);
    case 4: return 'CUATROCIENTOS ' + decenas(decena);
    case 5: return 'QUINIENTOS ' + decenas(decena);
    case 6: return 'SEISCIENTOS ' + decenas(decena);
    case 7: return 'SETECIENTOS ' + decenas(decena);
    case 8: return 'OCHOCIENTOS ' + decenas(decena);
    case 9: return 'NOVECIENTOS ' + decenas(decena);
    default: return decenas(decena);
  }
}

function miles(num) {
  const divisor = 1000;
  const cientos = Math.floor(num / divisor);
  const resto = num - (cientos * divisor);

  let strMiles = '';
  if (cientos === 1) {
    strMiles = 'MIL';
  } else if (cientos > 1) {
    strMiles = centenas(cientos) + ' MIL';
  }

  const strCentenas = centenas(resto);

  if (strMiles === '') return strCentenas;
  if (strCentenas === '') return strMiles;

  return strMiles + ' ' + strCentenas;
}

function millones(num) {
  const divisor = 1000000;
  const cientos = Math.floor(num / divisor);
  const resto = num - (cientos * divisor);

  let strMillones = '';
  if (cientos === 1) {
    strMillones = 'UN MILLÓN';
  } else if (cientos > 1) {
    strMillones = centenas(cientos) + ' MILLONES';
  }

  const strMiles = miles(resto);

  if (strMillones === '') return strMiles;
  if (strMillones === '') return strMillones;

  return strMillones + ' ' + strMiles;
}

/**
 * Convierte un número a texto en pesos colombianos M/CTE.
 * @param {number|string} cantidad - Monto a convertir
 * @param {string} moneda - Moneda (por defecto 'PESOS M/CTE.')
 * @returns {string} Texto en mayúsculas
 */
function numeroALetras(cantidad, moneda = 'PESOS M/CTE.') {
  const num = Math.round(Number(cantidad) * 100) / 100;
  if (isNaN(num)) return 'CERO ' + moneda;
  if (num === 0) return 'CERO ' + moneda;

  const parteEntera = Math.floor(Math.abs(num));
  const parteDecimal = Math.round((Math.abs(num) - parteEntera) * 100);

  let textoEntero = '';
  if (parteEntera === 0) {
    textoEntero = 'CERO';
  } else if (parteEntera < 1000) {
    textoEntero = centenas(parteEntera);
  } else if (parteEntera < 1000000) {
    textoEntero = miles(parteEntera);
  } else if (parteEntera < 1000000000000) {
    textoEntero = millones(parteEntera);
  } else {
    textoEntero = parteEntera.toString();
  }

  let resultado = textoEntero.trim();

  // Si termina exactamente en MILLÓN o MILLONES, se le agrega 'DE' antes de PESOS
  if (resultado.endsWith('MILLÓN') || resultado.endsWith('MILLONES')) {
    resultado += ' DE';
  }

  if (parteDecimal > 0) {
    const textoCentavos = decenas(parteDecimal);
    resultado += ` ${moneda} CON ${textoCentavos} CENTAVOS`;
  } else {
    resultado += ` ${moneda}`;
  }

  return resultado.replace(/\s+/g, ' ').toUpperCase();
}

module.exports = { numeroALetras };
