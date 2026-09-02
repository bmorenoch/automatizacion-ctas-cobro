const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });
  } catch (e) {
    console.error('Error inicializando cliente de Supabase:', e.message);
  }
}

function isConfigured() {
  return Boolean(supabase);
}

async function loadFromSupabase(defaultState) {
  if (!isConfigured()) return null;

  try {
    const [emisorRes, clientesRes, cuentasRes, logsRes] = await Promise.all([
      supabase.from('emisor').select('data').eq('id', 1).maybeSingle(),
      supabase.from('clientes').select('*').order('createdAt', { ascending: false }),
      supabase.from('cuentas').select('*').order('createdAt', { ascending: false }),
      supabase.from('logs').select('*').order('timestamp', { ascending: false }).limit(100)
    ]);

    const emisor = (emisorRes.data && emisorRes.data.data) 
      ? { ...defaultState.emisor, ...emisorRes.data.data } 
      : defaultState.emisor;

    const clientes = Array.isArray(clientesRes.data) && clientesRes.data.length > 0 
      ? clientesRes.data 
      : defaultState.clientes;

    const cuentas = Array.isArray(cuentasRes.data) 
      ? cuentasRes.data 
      : defaultState.cuentas;

    const logs = Array.isArray(logsRes.data) ? logsRes.data : [];

    return { emisor, clientes, cuentas, logs };
  } catch (error) {
    console.error('Error cargando datos de Supabase:', error.message);
    return null;
  }
}

async function saveClient(client) {
  if (!isConfigured()) return;
  try {
    const { error } = await supabase.from('clientes').upsert([client], { onConflict: 'id' });
    if (error) console.error('Error guardando cliente en Supabase:', error.message);
  } catch (e) {
    console.error('Excepción guardando cliente en Supabase:', e.message);
  }
}

async function deleteClient(id) {
  if (!isConfigured()) return;
  try {
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) console.error('Error eliminando cliente en Supabase:', error.message);
  } catch (e) {
    console.error('Excepción eliminando cliente en Supabase:', e.message);
  }
}

async function syncClients(clients) {
  if (!isConfigured() || !Array.isArray(clients)) return;
  try {
    const { error } = await supabase.from('clientes').upsert(clients, { onConflict: 'id' });
    if (error) console.error('Error sincronizando clientes en Supabase:', error.message);
  } catch (e) {
    console.error('Excepción sincronizando clientes en Supabase:', e.message);
  }
}

async function saveCuenta(cuenta) {
  if (!isConfigured()) return;
  try {
    const { error } = await supabase.from('cuentas').upsert([cuenta], { onConflict: 'id' });
    if (error) console.error('Error guardando cuenta en Supabase:', error.message);
  } catch (e) {
    console.error('Excepción guardando cuenta en Supabase:', e.message);
  }
}

async function deleteCuenta(id) {
  if (!isConfigured()) return;
  try {
    const { error } = await supabase.from('cuentas').delete().eq('id', id);
    if (error) console.error('Error eliminando cuenta en Supabase:', error.message);
  } catch (e) {
    console.error('Excepción eliminando cuenta en Supabase:', e.message);
  }
}

async function syncCuentas(cuentas) {
  if (!isConfigured() || !Array.isArray(cuentas)) return;
  try {
    const { error } = await supabase.from('cuentas').upsert(cuentas, { onConflict: 'id' });
    if (error) console.error('Error sincronizando cuentas en Supabase:', error.message);
  } catch (e) {
    console.error('Excepción sincronizando cuentas en Supabase:', e.message);
  }
}

async function saveEmisor(emisorData) {
  if (!isConfigured()) return;
  try {
    const { error } = await supabase.from('emisor').upsert([{ id: 1, data: emisorData }], { onConflict: 'id' });
    if (error) console.error('Error guardando emisor en Supabase:', error.message);
  } catch (e) {
    console.error('Excepción guardando emisor en Supabase:', e.message);
  }
}

async function addLog(log) {
  if (!isConfigured()) return;
  try {
    await supabase.from('logs').insert([log]);
  } catch (e) {
    // silencioso para logs
  }
}

module.exports = {
  isConfigured,
  loadFromSupabase,
  saveClient,
  deleteClient,
  syncClients,
  saveCuenta,
  deleteCuenta,
  syncCuentas,
  saveEmisor,
  addLog
};
