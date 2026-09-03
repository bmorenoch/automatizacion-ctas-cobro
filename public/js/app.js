/**
 * CobroAuto - Aplicación Frontend Principal
 */

const app = {
  state: {
    currentTab: 'dashboard',
    clients: [],
    cuentas: [],
    emisor: {},
    logs: [],
    bancosList: []
  },

  init() {
    this.bindEvents();
    this.loadAllData();
    // Auto-refresh dashboard & logs every 30s
    setInterval(() => {
      if (this.state.currentTab === 'dashboard') this.loadDashboard();
      if (this.state.currentTab === 'logs') this.loadLogs();
    }, 30000);
  },

  bindEvents() {
    // Tab Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const tab = item.getAttribute('data-tab');
        if (tab) this.navigateTab(tab);
      });
    });

    // Topbar Actions
    document.getElementById('btn-open-new-client')?.addEventListener('click', () => this.openClientModal());
    document.getElementById('btn-add-client-tab')?.addEventListener('click', () => this.openClientModal());
    document.getElementById('btn-trigger-cron')?.addEventListener('click', () => this.triggerCronCheck());

    // Client Search
    document.getElementById('search-client')?.addEventListener('input', (e) => this.filterClients(e.target.value));

    // Cuentas Filter & Search
    document.getElementById('filter-cuenta-estado')?.addEventListener('change', () => this.filterCuentas());
    document.getElementById('search-cuenta')?.addEventListener('input', () => this.filterCuentas());

    // Client Form Submit & Realtime Calculations
    const clientForm = document.getElementById('form-client');
    if (clientForm) {
      clientForm.addEventListener('submit', (e) => this.handleClientSubmit(e));
      ['client-valor', 'client-pct-retefuente', 'client-pct-reteica'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => this.updateClientCalcPreview());
      });
      document.getElementById('client-check-retefuente')?.addEventListener('change', (e) => {
        document.getElementById('client-pct-retefuente').disabled = !e.target.checked;
        this.updateClientCalcPreview();
      });
      document.getElementById('client-check-reteica')?.addEventListener('change', (e) => {
        document.getElementById('client-pct-reteica').disabled = !e.target.checked;
        this.updateClientCalcPreview();
      });
    }

    // Manual Invoice Form
    const manualForm = document.getElementById('form-manual-invoice');
    if (manualForm) {
      manualForm.addEventListener('submit', (e) => this.handleManualInvoiceSubmit(e));
      document.getElementById('manual-select-client')?.addEventListener('change', (e) => this.populateManualFromClient(e.target.value));
      ['manual-valor', 'manual-pct-retefuente', 'manual-pct-reteica'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => this.updateManualCalcPreview());
      });
      document.getElementById('manual-check-retefuente')?.addEventListener('change', (e) => {
        document.getElementById('manual-pct-retefuente').disabled = !e.target.checked;
        this.updateManualCalcPreview();
      });
      document.getElementById('manual-check-reteica')?.addEventListener('change', (e) => {
        document.getElementById('manual-pct-reteica').disabled = !e.target.checked;
        this.updateManualCalcPreview();
      });

      // Default dates
      const today = new Date().toISOString().split('T')[0];
      const due = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
      if (document.getElementById('manual-fecha-emision')) document.getElementById('manual-fecha-emision').value = today;
      if (document.getElementById('manual-fecha-vencimiento')) document.getElementById('manual-fecha-vencimiento').value = due;
      
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const now = new Date();
      if (document.getElementById('manual-periodo')) {
        document.getElementById('manual-periodo').value = `${meses[now.getMonth()]} ${now.getFullYear()}`;
      }
    }

    // Emisor Form Submit
    document.getElementById('form-emisor-config')?.addEventListener('submit', (e) => this.handleEmisorSubmit(e));

    // Bank Accounts
    document.getElementById('btn-add-bank')?.addEventListener('click', () => this.addBankAccountRow());
    document.getElementById('btn-save-banks')?.addEventListener('click', () => this.saveBankAccounts());

    // File Uploads & Branding
    document.getElementById('file-upload-firma')?.addEventListener('change', (e) => this.uploadFile(e.target.files[0], 'firma'));
    document.getElementById('file-upload-logo')?.addEventListener('change', (e) => this.uploadFile(e.target.files[0], 'logo'));
    document.getElementById('btn-save-branding')?.addEventListener('click', () => this.saveBranding());
    document.getElementById('btn-remove-firma')?.addEventListener('click', () => this.removeFirma());
    document.getElementById('btn-remove-logo')?.addEventListener('click', () => this.removeLogo());

    // SMTP Form & Preset
    document.getElementById('form-smtp-config')?.addEventListener('submit', (e) => this.handleSmtpSubmit(e));
    document.getElementById('smtp-preset')?.addEventListener('change', (e) => this.applySmtpPreset(e.target.value));
    document.getElementById('btn-test-smtp')?.addEventListener('click', () => this.testSmtp());

    // Logs Refresh
    document.getElementById('btn-refresh-logs')?.addEventListener('click', () => this.loadLogs());
  },

  async loadAllData() {
    await Promise.all([
      this.loadDashboard(),
      this.loadClients(),
      this.loadCuentas(),
      this.loadEmisor(),
      this.loadLogs()
    ]);
  },

  navigateTab(tabId) {
    this.state.currentTab = tabId;

    // Actualizar items de navegacion
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
    });

    // Actualizar vistas
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });

    // Actualizar encabezados
    const titles = {
      dashboard: { title: 'Panel de Control', sub: 'Resumen general y métricas de facturación recurrente' },
      clientes: { title: 'Clientes & Recurrencias', sub: 'Administra tus contratos, valores y fechas de corte automáticas' },
      cuentas: { title: 'Cuentas de Cobro', sub: 'Historial completo de documentos emitidos y estados de pago' },
      'nueva-cuenta': { title: 'Emisión Rápida de Cuenta', sub: 'Genera una cuenta de cobro al instante y envíala a tu cliente' },
      configuracion: { title: 'Configuración del Sistema', sub: 'Tus datos fiscales, cuentas bancarias, firma y servidor de correo' },
      logs: { title: 'Registro de Auditoría', sub: 'Monitoreo en tiempo real de actividades y envíos de correo' }
    };

    if (titles[tabId]) {
      document.getElementById('topbar-title').textContent = titles[tabId].title;
      document.getElementById('topbar-subtitle').textContent = titles[tabId].sub;
    }

    if (tabId === 'dashboard') this.loadDashboard();
    if (tabId === 'clientes') this.loadClients();
    if (tabId === 'cuentas') this.loadCuentas();
    if (tabId === 'logs') this.loadLogs();
  },

  // ================= 1. DASHBOARD =================
  async loadDashboard() {
    try {
      const data = await this.fetchJson('/api/dashboard');

      document.getElementById('dash-current-period').textContent = data.periodoActual || '';
      document.getElementById('stat-total-mes').textContent = this.formatCurrency(data.totalFacturadoMes);
      document.getElementById('stat-mes-count').textContent = `${data.cuentasMesCount || 0} cuentas emitidas`;

      document.getElementById('stat-total-pendiente').textContent = this.formatCurrency(data.totalPendienteCobro);
      document.getElementById('stat-pendiente-count').textContent = `${data.cuentasPendientesCount || 0} pendientes de pago`;

      document.getElementById('stat-total-pagado').textContent = this.formatCurrency(data.totalPagadoMes);
      document.getElementById('stat-clientes-activos').textContent = data.totalClientesActivos || 0;

      // Status SMTP en Sidebar
      const smtpBox = document.getElementById('smtp-status-box');
      const indicator = document.getElementById('smtp-indicator');
      const statusText = document.getElementById('smtp-status-text');
      const statusSub = document.getElementById('smtp-status-sub');

      if (data.smtpActivo) {
        indicator.className = 'status-indicator active';
        statusText.textContent = 'Correo Conectado';
        statusSub.textContent = 'Envíos automáticos activos';
      } else {
        indicator.className = 'status-indicator inactive';
        statusText.textContent = 'Correo Inactivo';
        statusSub.textContent = 'Configurar en Ajustes';
      }

      // Render Cuentas Recientes
      this.renderRecentInvoices(data.recientes || []);

      // Render Proximos Cortes
      this.renderUpcomingCuts(data.proximosCobros || []);

    } catch (e) {
      console.error('Error cargando dashboard:', e);
    }
  },

  renderRecentInvoices(invoices) {
    const tbody = document.getElementById('table-recent-invoices');
    if (!tbody) return;

    if (invoices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">No hay cuentas emitidas todavía. ¡Genera tu primera cuenta!</td></tr>`;
      return;
    }

    tbody.innerHTML = invoices.map(c => `
      <tr>
        <td><strong>${c.consecutivo}</strong></td>
        <td>
          <div style="font-weight:600; color:#fff;">${c.clienteNombre}</div>
          <small style="color:var(--text-dim);">${c.clienteDoc || ''}</small>
        </td>
        <td><span style="font-size:12px; color:var(--primary-200);">${c.periodo}</span></td>
        <td><strong style="color:var(--accent-emerald);">${this.formatCurrency(c.totalNeto)}</strong></td>
        <td><span class="status-pill ${c.estado}">${c.estado}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-icon" title="Ver PDF" onclick="app.viewPdf('${c.id}')">👁️</button>
            <button class="btn btn-secondary btn-icon" title="Enviar Email" onclick="app.sendInvoiceEmail('${c.id}')">📧</button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  renderUpcomingCuts(cuts) {
    const container = document.getElementById('list-upcoming-cuts');
    if (!container) return;

    if (cuts.length === 0) {
      container.innerHTML = `<p style="color:var(--text-muted); font-size:13px; text-align:center; padding:16px;">No hay clientes recurrentes activos configurados.</p>`;
      return;
    }

    container.innerHTML = cuts.map(c => {
      let badgeColor = 'rgba(37, 99, 235, 0.2)';
      let badgeText = `Día ${c.diaCorte} (en ${c.diasFaltantes} días)`;
      if (c.diasFaltantes === 0) {
        badgeColor = 'rgba(16, 185, 129, 0.3)';
        badgeText = `🔥 ¡Corte HOY! (Día ${c.diaCorte})`;
      } else if (c.diasFaltantes === 1) {
        badgeColor = 'rgba(245, 158, 11, 0.3)';
        badgeText = `⏳ Mañana (Día ${c.diaCorte})`;
      }

      return `
        <div class="cut-item">
          <div class="cut-info">
            <h4>${c.nombre}</h4>
            <p>${c.contacto || c.email}</p>
          </div>
          <div class="cut-meta">
            <div class="amount">${this.formatCurrency(c.valor)}</div>
            <span class="day-badge" style="background:${badgeColor};">${badgeText}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  // ================= 2. CLIENTES =================
  async loadClients() {
    try {
      let clients = [];
      const savedLocal = localStorage.getItem('cobroauto_clientes');

      try {
        const data = await this.fetchJson('/api/clientes');
        if (Array.isArray(data)) {
          clients = data;
        }
      } catch (e) {
        console.warn('Aviso al consultar clientes en el servidor:', e);
      }

      // Si existe copia local en localStorage, tiene prioridad (evita resets en Vercel)
      if (savedLocal) {
        try {
          const parsed = JSON.parse(savedLocal);
          if (Array.isArray(parsed) && parsed.length > 0) {
            clients = parsed;
            // Sincronizar silenciosamente con el backend
            fetch('/api/clientes/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientes: clients })
            }).catch(() => {});
          }
        } catch (e) {}
      } else if (clients.length > 0) {
        localStorage.setItem('cobroauto_clientes', JSON.stringify(clients));
      }

      this.state.clients = clients;
      const countBadge = document.getElementById('badge-clientes-count');
      if (countBadge) countBadge.textContent = clients.length;

      this.renderClientsTable(clients);
      this.populateManualClientSelect(clients);
    } catch (e) {
      console.error('Error cargando clientes:', e);
    }
  },

  renderClientsTable(clients) {
    const tbody = document.getElementById('table-clients-body');
    if (!tbody) return;

    if (clients.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">No tienes clientes registrados. Haz clic en "Agregar Cliente" para comenzar.</td></tr>`;
      return;
    }

    tbody.innerHTML = clients.map(c => {
      const reteInfo = [];
      if (c.aplicarRetefuente) reteInfo.push(`RteFte ${c.porcentajeRetefuente || 4}%`);
      if (c.aplicarReteICA) reteInfo.push(`ICA ${c.porcentajeReteICA || 0.966}%`);
      const reteStr = reteInfo.length > 0 ? `<br><small style="color:var(--text-dim);">${reteInfo.join(', ')}</small>` : '';

      return `
        <tr>
          <td>
            <strong style="color:#fff; display:block;">${c.nombre}</strong>
            <small style="color:var(--text-muted);">${c.ciudad || ''}</small>
          </td>
          <td><code>${c.tipoDoc || 'NIT'}: ${c.numDoc}</code></td>
          <td>
            <div>${c.contacto || 'N/A'}</div>
            <small style="color:var(--accent-cyan);">${c.email}</small>
          </td>
          <td>
            <strong style="color:var(--accent-emerald);">${this.formatCurrency(c.valor)}</strong>
            ${reteStr}
          </td>
          <td><span class="day-badge" style="background:rgba(255,255,255,0.06);">Día ${c.diaCorte}</span></td>
          <td>
            <span style="font-size:12px; color:${c.envioAutomatico ? 'var(--accent-emerald)' : 'var(--text-dim)'}; font-weight:600;">
              ${c.envioAutomatico ? '⚡ Sí (Auto)' : '📝 Manual'}
            </span>
          </td>
          <td>
            <span class="status-pill ${c.activo ? 'pagada' : 'borrador'}">
              ${c.activo ? 'Activo' : 'Pausado'}
            </span>
          </td>
          <td style="text-align:right;">
            <div style="display:inline-flex; gap:6px;">
              <button class="btn btn-primary btn-sm" title="Generar cuenta de este mes ahora" onclick="app.emitInvoiceForClient('${c.id}')">⚡ Emitir</button>
              <button class="btn btn-secondary btn-icon btn-sm" title="Editar" onclick="app.editClient('${c.id}')">✏️</button>
              <button class="btn btn-danger btn-icon btn-sm" title="Eliminar" onclick="app.deleteClient('${c.id}')">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterClients(query) {
    const q = query.toLowerCase().trim();
    const filtered = this.state.clients.filter(c => 
      c.nombre.toLowerCase().includes(q) ||
      c.numDoc.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.contacto && c.contacto.toLowerCase().includes(q))
    );
    this.renderClientsTable(filtered);
  },

  openClientModal(client = null) {
    const modal = document.getElementById('modal-client');
    const form = document.getElementById('form-client');
    form.reset();

    if (client) {
      document.getElementById('modal-client-title').textContent = 'Editar Cliente Recurrente';
      document.getElementById('client-id').value = client.id;
      document.getElementById('client-nombre').value = client.nombre || '';
      document.getElementById('client-tipodoc').value = client.tipoDoc || 'NIT';
      document.getElementById('client-numdoc').value = client.numDoc || '';
      document.getElementById('client-contacto').value = client.contacto || '';
      document.getElementById('client-email').value = client.email || '';
      document.getElementById('client-emailcc').value = client.emailCC || '';
      document.getElementById('client-telefono').value = client.telefono || '';
      document.getElementById('client-ciudad').value = client.ciudad || '';
      document.getElementById('client-direccion').value = client.direccion || '';
      document.getElementById('client-concepto').value = client.concepto || '';
      document.getElementById('client-valor').value = client.valor || '';
      document.getElementById('client-diacorte').value = client.diaCorte || 25;
      
      document.getElementById('client-check-retefuente').checked = Boolean(client.aplicarRetefuente);
      document.getElementById('client-pct-retefuente').disabled = !client.aplicarRetefuente;
      document.getElementById('client-pct-retefuente').value = client.porcentajeRetefuente || 4;

      document.getElementById('client-check-reteica').checked = Boolean(client.aplicarReteICA);
      document.getElementById('client-pct-reteica').disabled = !client.aplicarReteICA;
      document.getElementById('client-pct-reteica').value = client.porcentajeReteICA || 0.966;

      document.getElementById('client-envio-auto').checked = client.envioAutomatico !== false;
      document.getElementById('client-activo').checked = client.activo !== false;
    } else {
      document.getElementById('modal-client-title').textContent = 'Agregar Nuevo Cliente Recurrente';
      document.getElementById('client-id').value = '';
      document.getElementById('client-diacorte').value = '25';
      document.getElementById('client-concepto').value = 'Prestación de servicios profesionales correspondientes al período {MES} {AÑO}';
      document.getElementById('client-envio-auto').checked = true;
      document.getElementById('client-activo').checked = true;
      document.getElementById('client-check-retefuente').checked = false;
      document.getElementById('client-check-reteica').checked = false;
      document.getElementById('client-pct-retefuente').disabled = true;
      document.getElementById('client-pct-reteica').disabled = true;
    }

    this.updateClientCalcPreview();
    modal.classList.add('active');
  },

  updateClientCalcPreview() {
    const val = Number(document.getElementById('client-valor').value) || 0;
    const hasRetefuente = document.getElementById('client-check-retefuente').checked;
    const pctRetefuente = Number(document.getElementById('client-pct-retefuente').value) || 0;
    const hasReteICA = document.getElementById('client-check-reteica').checked;
    const pctReteICA = Number(document.getElementById('client-pct-reteica').value) || 0;

    const retefuente = hasRetefuente ? Math.round(val * pctRetefuente / 100) : 0;
    const reteICA = hasReteICA ? Math.round(val * pctReteICA / 100) : 0;
    const total = val - retefuente - reteICA;

    document.getElementById('client-calc-subtotal').textContent = this.formatCurrency(val);
    
    const rowRete = document.getElementById('client-calc-retefuente-row');
    if (hasRetefuente) {
      rowRete.style.display = 'flex';
      document.getElementById('client-calc-retefuente').textContent = `- ${this.formatCurrency(retefuente)}`;
    } else {
      rowRete.style.display = 'none';
    }

    const rowICA = document.getElementById('client-calc-reteica-row');
    if (hasReteICA) {
      rowICA.style.display = 'flex';
      document.getElementById('client-calc-reteica').textContent = `- ${this.formatCurrency(reteICA)}`;
    } else {
      rowICA.style.display = 'none';
    }

    document.getElementById('client-calc-total').textContent = this.formatCurrency(total);
  },

  async handleClientSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('client-id').value;

    const payload = {
      nombre: document.getElementById('client-nombre').value,
      tipoDoc: document.getElementById('client-tipodoc').value,
      numDoc: document.getElementById('client-numdoc').value,
      contacto: document.getElementById('client-contacto').value,
      email: document.getElementById('client-email').value,
      emailCC: document.getElementById('client-emailcc').value,
      telefono: document.getElementById('client-telefono').value,
      ciudad: document.getElementById('client-ciudad').value,
      direccion: document.getElementById('client-direccion').value,
      concepto: document.getElementById('client-concepto').value,
      valor: Number(document.getElementById('client-valor').value) || 0,
      diaCorte: parseInt(document.getElementById('client-diacorte').value, 10),
      aplicarRetefuente: document.getElementById('client-check-retefuente').checked,
      porcentajeRetefuente: Number(document.getElementById('client-pct-retefuente').value),
      aplicarReteICA: document.getElementById('client-check-reteica').checked,
      porcentajeReteICA: Number(document.getElementById('client-pct-reteica').value),
      envioAutomatico: document.getElementById('client-envio-auto').checked,
      activo: document.getElementById('client-activo').checked
    };

    try {
      let data;
      if (id) {
        data = await this.fetchJson(`/api/clientes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        data = await this.fetchJson('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (data.success) {
        if (id) {
          const idx = this.state.clients.findIndex(c => c.id === id);
          if (idx !== -1) {
            this.state.clients[idx] = data.cliente || { ...this.state.clients[idx], ...payload, id };
          }
        } else if (data.cliente) {
          this.state.clients.unshift(data.cliente);
        }

        // Persistir en localStorage garantizando que no se pierdan
        localStorage.setItem('cobroauto_clientes', JSON.stringify(this.state.clients));

        this.showToast('Cliente guardado exitosamente', 'success');
        this.closeModal('modal-client');
        this.renderClientsTable(this.state.clients);
        this.populateManualClientSelect(this.state.clients);
        const countBadge = document.getElementById('badge-clientes-count');
        if (countBadge) countBadge.textContent = this.state.clients.length;
        await this.loadDashboard();
      } else {
        this.showToast(data.error || 'Error al guardar cliente', 'error');
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`, 'error');
    }
  },

  editClient(id) {
    const client = this.state.clients.find(c => c.id === id);
    if (client) this.openClientModal(client);
  },

  async deleteClient(id) {
    if (!confirm('¿Estás seguro de eliminar este cliente? Se mantendrá el historial de cuentas ya emitidas.')) return;

    try {
      const data = await this.fetchJson(`/api/clientes/${id}`, { method: 'DELETE' });
      if (data.success) {
        this.state.clients = this.state.clients.filter(c => c.id !== id);
        localStorage.setItem('cobroauto_clientes', JSON.stringify(this.state.clients));
        this.showToast('Cliente eliminado', 'info');
        this.renderClientsTable(this.state.clients);
        this.populateManualClientSelect(this.state.clients);
        const countBadge = document.getElementById('badge-clientes-count');
        if (countBadge) countBadge.textContent = this.state.clients.length;
        await this.loadDashboard();
      }
    } catch (e) {
      this.showToast(`Error al eliminar: ${e.message}`, 'error');
    }
  },

  async emitInvoiceForClient(id) {
    const client = this.state.clients.find(c => c.id === id);
    if (!client) return;

    if (!confirm(`¿Generar ahora la cuenta de cobro de este mes para "${client.nombre}" por ${this.formatCurrency(client.valor)}?`)) return;

    try {
      this.showToast(`Generando cuenta para ${client.nombre}...`, 'info');
      const data = await this.fetchJson(`/api/clientes/${id}/emitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enviarInmediato: client.envioAutomatico })
      });

      if (data.success) {
        this.showToast(`¡Cuenta ${data.cuenta.consecutivo} generada con éxito!`, 'success');
        if (data.cuenta) {
          this.state.cuentas = this.state.cuentas.filter(c => c.id !== data.cuenta.id);
          this.state.cuentas.unshift(data.cuenta);
          localStorage.setItem('cobroauto_cuentas', JSON.stringify(this.state.cuentas));
        }
        await this.loadCuentas();
        await this.loadDashboard();
        this.viewPdf(data.cuenta.id);
      } else if (data.alreadyExists) {
        this.showToast(`Aviso: Ya existe una cuenta para ${client.nombre} en este período (${data.cuenta.consecutivo}).`, 'info');
      } else {
        this.showToast(data.error || 'Error al generar cuenta', 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  // ================= 3. CUENTAS DE COBRO =================
  async loadCuentas() {
    try {
      let cuentas = [];
      const savedLocal = localStorage.getItem('cobroauto_cuentas');

      try {
        const data = await this.fetchJson('/api/cuentas');
        if (Array.isArray(data)) {
          cuentas = data;
        }
      } catch (e) {
        console.warn('Aviso al consultar cuentas en el servidor:', e);
      }

      if (savedLocal) {
        try {
          const parsed = JSON.parse(savedLocal);
          if (Array.isArray(parsed) && parsed.length > 0) {
            cuentas = parsed;
            // Sincronizar silenciosamente con el servidor
            fetch('/api/cuentas/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cuentas })
            }).catch(() => {});
          }
        } catch (e) {}
      } else if (cuentas.length > 0) {
        localStorage.setItem('cobroauto_cuentas', JSON.stringify(cuentas));
      }

      this.state.cuentas = cuentas;
      const countBadge = document.getElementById('badge-cuentas-count');
      if (countBadge) countBadge.textContent = cuentas.length;
      this.renderCuentasTable(cuentas);
    } catch (e) {
      console.error('Error cargando cuentas:', e);
    }
  },

  renderCuentasTable(cuentas) {
    const tbody = document.getElementById('table-cuentas-body');
    if (!tbody) return;

    if (cuentas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:30px;">No se han emitido cuentas de cobro aún.</td></tr>`;
      return;
    }

    tbody.innerHTML = cuentas.map(c => {
      const retencionesTotal = (c.retefuente || 0) + (c.reteICA || 0);
      const retencionesStr = retencionesTotal > 0 ? `- ${this.formatCurrency(retencionesTotal)}` : '$ 0';

      return `
        <tr>
          <td><strong style="color:var(--primary-200); font-size:14px;">${c.consecutivo}</strong></td>
          <td>
            <div style="font-weight:600; color:#fff;">${c.clienteNombre}</div>
            <small style="color:var(--text-dim);">${c.clienteDoc || ''}</small>
          </td>
          <td><span style="font-weight:500; color:var(--accent-cyan); font-size:12px;">${c.periodo}</span></td>
          <td>
            <div style="font-size:12px;">Emisión: ${c.fechaEmision || ''}</div>
            <small style="color:var(--text-dim);">Vence: ${c.fechaVencimiento || 'Inmediato'}</small>
          </td>
          <td>${this.formatCurrency(c.subtotal || c.totalNeto)}</td>
          <td style="color:${retencionesTotal > 0 ? 'var(--accent-rose)' : 'var(--text-dim)'};">${retencionesStr}</td>
          <td><strong style="color:var(--accent-emerald); font-size:14px;">${this.formatCurrency(c.totalNeto)}</strong></td>
          <td><span class="status-pill ${c.estado}">${c.estado}</span></td>
          <td style="text-align:right;">
            <div style="display:inline-flex; gap:6px;">
              <button class="btn btn-secondary btn-icon btn-sm" title="Ver / Descargar PDF" onclick="app.viewPdf('${c.id}')">👁️</button>
              <button class="btn btn-secondary btn-icon btn-sm" title="Enviar por Email" onclick="app.sendInvoiceEmail('${c.id}')">📧</button>
              ${c.estado !== 'pagada' ? `<button class="btn btn-accent btn-icon btn-sm" title="Marcar como Pagada" onclick="app.updateCuentaEstado('${c.id}', 'pagada')">✅</button>` : ''}
              ${c.estado !== 'anulada' ? `<button class="btn btn-secondary btn-icon btn-sm" title="Anular" onclick="app.updateCuentaEstado('${c.id}', 'anulada')">🚫</button>` : ''}
              <button class="btn btn-danger btn-icon btn-sm" title="Eliminar" onclick="app.deleteCuenta('${c.id}')">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterCuentas() {
    const estado = document.getElementById('filter-cuenta-estado')?.value || '';
    const q = (document.getElementById('search-cuenta')?.value || '').toLowerCase().trim();

    let filtered = this.state.cuentas;
    if (estado) {
      filtered = filtered.filter(c => c.estado === estado);
    }
    if (q) {
      filtered = filtered.filter(c => 
        c.consecutivo.toLowerCase().includes(q) ||
        c.clienteNombre.toLowerCase().includes(q) ||
        (c.periodo && c.periodo.toLowerCase().includes(q))
      );
    }
    this.renderCuentasTable(filtered);
  },

  viewPdf(id) {
    const modal = document.getElementById('modal-pdf');
    const iframe = document.getElementById('iframe-pdf-viewer');
    const downloadBtn = document.getElementById('btn-download-pdf-modal');

    const pdfUrl = `/api/cuentas/${id}/pdf`;
    iframe.src = pdfUrl;
    downloadBtn.href = pdfUrl;

    const cuenta = this.state.cuentas.find(c => c.id === id);
    if (cuenta) {
      document.getElementById('modal-pdf-title').textContent = `Cuenta de Cobro ${cuenta.consecutivo} - ${cuenta.clienteNombre}`;
      downloadBtn.download = `Cuenta_${cuenta.consecutivo}.pdf`;
    }

    modal.classList.add('active');
  },

  async sendInvoiceEmail(id) {
    const cuenta = this.state.cuentas.find(c => c.id === id);
    if (!cuenta) return;

    if (!confirm(`¿Deseas enviar la cuenta de cobro ${cuenta.consecutivo} por correo a "${cuenta.clienteEmail}"?`)) return;

    try {
      this.showToast(`Enviando correo a ${cuenta.clienteEmail}...`, 'info');
      const res = await fetch(`/api/cuentas/${id}/enviar`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        this.showToast(`¡Correo enviado con éxito a ${cuenta.clienteEmail}!`, 'success');
        await this.loadCuentas();
        await this.loadDashboard();
      } else {
        this.showToast(data.error || 'Error al enviar correo', 'error');
      }
    } catch (e) {
      this.showToast(`Error de envío: ${e.message}`, 'error');
    }
  },

  async updateCuentaEstado(id, nuevoEstado) {
    try {
      const data = await this.fetchJson(`/api/cuentas/${id}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado })
      });
      if (data.success) {
        const c = this.state.cuentas.find(item => item.id === id);
        if (c) c.estado = nuevoEstado;
        localStorage.setItem('cobroauto_cuentas', JSON.stringify(this.state.cuentas));
        this.showToast(`Cuenta marcada como ${nuevoEstado}`, 'success');
        this.renderCuentasTable(this.state.cuentas);
        await this.loadDashboard();
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  async deleteCuenta(id) {
    if (!confirm('¿Eliminar permanentemente este registro de cuenta y su archivo PDF?')) return;
    try {
      const data = await this.fetchJson(`/api/cuentas/${id}`, { method: 'DELETE' });
      if (data.success) {
        this.state.cuentas = this.state.cuentas.filter(c => c.id !== id);
        localStorage.setItem('cobroauto_cuentas', JSON.stringify(this.state.cuentas));
        this.showToast('Cuenta eliminada', 'info');
        this.renderCuentasTable(this.state.cuentas);
        const countBadge = document.getElementById('badge-cuentas-count');
        if (countBadge) countBadge.textContent = this.state.cuentas.length;
        await this.loadDashboard();
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  // ================= 4. EMISION MANUAL RAPIDA =================
  populateManualClientSelect(clients) {
    const sel = document.getElementById('manual-select-client');
    if (!sel) return;

    sel.innerHTML = '<option value="">-- Seleccionar cliente para autocompletar o ingresar manualmente --</option>' + 
      clients.map(c => `<option value="${c.id}">${c.nombre} (${this.formatCurrency(c.valor)})</option>`).join('');
  },

  populateManualFromClient(clientId) {
    if (!clientId) return;
    const c = this.state.clients.find(client => client.id === clientId);
    if (!c) return;

    document.getElementById('manual-cliente-nombre').value = c.nombre;
    document.getElementById('manual-cliente-doc').value = `${c.tipoDoc || 'NIT'}: ${c.numDoc}`;
    document.getElementById('manual-cliente-email').value = c.email;
    document.getElementById('manual-cliente-emailcc').value = c.emailCC || '';
    document.getElementById('manual-cliente-ciudad').value = c.ciudad || '';
    document.getElementById('manual-concepto').value = c.concepto || '';
    document.getElementById('manual-valor').value = c.valor || 0;

    document.getElementById('manual-check-retefuente').checked = Boolean(c.aplicarRetefuente);
    document.getElementById('manual-pct-retefuente').disabled = !c.aplicarRetefuente;
    document.getElementById('manual-pct-retefuente').value = c.porcentajeRetefuente || 4;

    document.getElementById('manual-check-reteica').checked = Boolean(c.aplicarReteICA);
    document.getElementById('manual-pct-reteica').disabled = !c.aplicarReteICA;
    document.getElementById('manual-pct-reteica').value = c.porcentajeReteICA || 0.966;

    this.updateManualCalcPreview();
  },

  updateManualCalcPreview() {
    const val = Number(document.getElementById('manual-valor').value) || 0;
    const hasRetefuente = document.getElementById('manual-check-retefuente').checked;
    const pctRetefuente = Number(document.getElementById('manual-pct-retefuente').value) || 0;
    const hasReteICA = document.getElementById('manual-check-reteica').checked;
    const pctReteICA = Number(document.getElementById('manual-pct-reteica').value) || 0;

    const retefuente = hasRetefuente ? Math.round(val * pctRetefuente / 100) : 0;
    const reteICA = hasReteICA ? Math.round(val * pctReteICA / 100) : 0;
    const total = val - retefuente - reteICA;

    document.getElementById('manual-calc-subtotal').textContent = this.formatCurrency(val);

    const rowRete = document.getElementById('manual-calc-retefuente-row');
    if (hasRetefuente) {
      rowRete.style.display = 'flex';
      document.getElementById('manual-calc-retefuente').textContent = `- ${this.formatCurrency(retefuente)}`;
    } else {
      rowRete.style.display = 'none';
    }

    const rowICA = document.getElementById('manual-calc-reteica-row');
    if (hasReteICA) {
      rowICA.style.display = 'flex';
      document.getElementById('manual-calc-reteica').textContent = `- ${this.formatCurrency(reteICA)}`;
    } else {
      rowICA.style.display = 'none';
    }

    document.getElementById('manual-calc-total').textContent = this.formatCurrency(total);
  },

  async handleManualInvoiceSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-manual');
    btn.disabled = true;

    const payload = {
      clienteId: document.getElementById('manual-select-client').value || null,
      clienteNombre: document.getElementById('manual-cliente-nombre').value,
      clienteDoc: document.getElementById('manual-cliente-doc').value,
      clienteEmail: document.getElementById('manual-cliente-email').value,
      clienteEmailCC: document.getElementById('manual-cliente-emailcc').value,
      clienteCiudad: document.getElementById('manual-cliente-ciudad').value,
      periodo: document.getElementById('manual-periodo').value,
      fechaEmision: document.getElementById('manual-fecha-emision').value,
      fechaVencimiento: document.getElementById('manual-fecha-vencimiento').value,
      concepto: document.getElementById('manual-concepto').value,
      valor: Number(document.getElementById('manual-valor').value) || 0,
      aplicarRetefuente: document.getElementById('manual-check-retefuente').checked,
      porcentajeRetefuente: Number(document.getElementById('manual-pct-retefuente').value),
      aplicarReteICA: document.getElementById('manual-check-reteica').checked,
      porcentajeReteICA: Number(document.getElementById('manual-pct-reteica').value),
      enviarInmediato: document.getElementById('manual-enviar-inmediato').checked
    };

    try {
      this.showToast('Generando cuenta y PDF...', 'info');
      const data = await this.fetchJson('/api/cuentas/generar-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (data.success) {
        this.showToast(`¡Cuenta ${data.cuenta.consecutivo} generada con éxito!`, 'success');
        if (data.cuenta) {
          this.state.cuentas = this.state.cuentas.filter(c => c.id !== data.cuenta.id);
          this.state.cuentas.unshift(data.cuenta);
          localStorage.setItem('cobroauto_cuentas', JSON.stringify(this.state.cuentas));
        }
        await this.loadCuentas();
        await this.loadDashboard();
        this.viewPdf(data.cuenta.id);
        this.navigateTab('cuentas');
      } else {
        this.showToast(data.error || 'Error al emitir cuenta', 'error');
      }
    } catch (err) {
      this.showToast(`Error: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  },

  // ================= 5. CONFIGURACION =================
  async loadEmisor() {
    try {
      let emisor = await this.fetchJson('/api/emisor');
      
      // Fallback a localStorage si la función serverless se reinició
      const savedLocal = localStorage.getItem('cobroauto_emisor');
      if (savedLocal) {
        try {
          const parsed = JSON.parse(savedLocal);
          emisor = { ...emisor, ...parsed, smtp: { ...(emisor.smtp || {}), ...(parsed.smtp || {}) } };
          // Re-sincronizar silenciosamente al servidor
          fetch('/api/emisor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emisor)
          }).catch(() => {});
        } catch(e){}
      }

      this.state.emisor = emisor;

      document.getElementById('emisor-nombre').value = emisor.nombre || '';
      document.getElementById('emisor-tipodoc').value = emisor.tipoDoc || 'CC';
      document.getElementById('emisor-numdoc').value = emisor.numDoc || '';
      document.getElementById('emisor-profesion').value = emisor.profesion || '';
      document.getElementById('emisor-email').value = emisor.email || '';
      document.getElementById('emisor-telefono').value = emisor.telefono || '';
      document.getElementById('emisor-direccion').value = emisor.direccion || '';
      document.getElementById('emisor-ciudad').value = emisor.ciudad || '';
      document.getElementById('emisor-regimen').value = emisor.regimenTexto || '';
      document.getElementById('emisor-prefijo').value = emisor.prefijoConsecutivo || 'CC-';
      document.getElementById('emisor-siguiente-num').value = emisor.siguienteNumero || 1;
      document.getElementById('emisor-dias-venc').value = emisor.diasVencimiento || 15;

      // Render Cuentas Bancarias
      this.state.bancosList = emisor.bancos || [];
      this.renderBankAccounts();

      // Render Firma & Logo
      if (emisor.firmaUrl) {
        document.getElementById('img-firma-preview').src = emisor.firmaUrl;
        document.getElementById('img-firma-preview').style.display = 'block';
        document.getElementById('firma-placeholder').style.display = 'none';
      }

      if (emisor.logoUrl) {
        document.getElementById('img-logo-preview').src = emisor.logoUrl;
        document.getElementById('img-logo-preview').style.display = 'block';
        document.getElementById('logo-placeholder').style.display = 'none';
      }

      // SMTP
      if (emisor.smtp) {
        document.getElementById('smtp-active').checked = Boolean(emisor.smtp.active);
        document.getElementById('smtp-host').value = emisor.smtp.host || 'smtp.gmail.com';
        document.getElementById('smtp-port').value = emisor.smtp.port || 465;
        document.getElementById('smtp-user').value = emisor.smtp.user || '';
        document.getElementById('smtp-pass').value = emisor.smtp.pass || '';
        document.getElementById('smtp-fromname').value = emisor.smtp.fromName || '';
        document.getElementById('smtp-bcc').checked = emisor.smtp.bccEmisor !== false;
      }

    } catch (e) {
      console.error('Error cargando emisor:', e);
    }
  },

  async handleEmisorSubmit(e) {
    e.preventDefault();
    const payload = {
      nombre: document.getElementById('emisor-nombre').value,
      tipoDoc: document.getElementById('emisor-tipodoc').value,
      numDoc: document.getElementById('emisor-numdoc').value,
      profesion: document.getElementById('emisor-profesion').value,
      email: document.getElementById('emisor-email').value,
      telefono: document.getElementById('emisor-telefono').value,
      direccion: document.getElementById('emisor-direccion').value,
      ciudad: document.getElementById('emisor-ciudad').value,
      regimenTexto: document.getElementById('emisor-regimen').value,
      prefijoConsecutivo: document.getElementById('emisor-prefijo').value,
      siguienteNumero: parseInt(document.getElementById('emisor-siguiente-num').value, 10),
      diasVencimiento: parseInt(document.getElementById('emisor-dias-venc').value, 10),
      bancos: this.state.bancosList
    };

    try {
      const data = await this.fetchJson('/api/emisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (data.success) {
        this.state.emisor = { ...this.state.emisor, ...data.emisor };
        localStorage.setItem('cobroauto_emisor', JSON.stringify(this.state.emisor));
        this.showToast('Configuración del emisor guardada con éxito', 'success');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  renderBankAccounts() {
    const container = document.getElementById('bank-accounts-container');
    if (!container) return;

    container.innerHTML = this.state.bancosList.map((b, idx) => `
      <div style="background:rgba(15,23,42,0.4); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:14px; display:grid; grid-template-columns:1.5fr 1fr 1.5fr 1.5fr auto; gap:10px; align-items:center;">
        <input type="text" class="form-control" value="${b.banco || ''}" placeholder="Banco (ej. Bancolombia)" onchange="app.updateBank(${idx}, 'banco', this.value)">
        <select class="form-control" onchange="app.updateBank(${idx}, 'tipoCuenta', this.value)">
          <option value="Ahorros" ${b.tipoCuenta === 'Ahorros' ? 'selected' : ''}>Ahorros</option>
          <option value="Corriente" ${b.tipoCuenta === 'Corriente' ? 'selected' : ''}>Corriente</option>
          <option value="Billetera Digital" ${b.tipoCuenta === 'Billetera Digital' ? 'selected' : ''}>Nequi/Daviplata</option>
          <option value="Transfiya" ${b.tipoCuenta === 'Transfiya' ? 'selected' : ''}>Transfiya</option>
        </select>
        <input type="text" class="form-control" value="${b.numeroCuenta || ''}" placeholder="Número de cuenta" onchange="app.updateBank(${idx}, 'numeroCuenta', this.value)">
        <input type="text" class="form-control" value="${b.titular || ''}" placeholder="Titular de la cuenta" onchange="app.updateBank(${idx}, 'titular', this.value)">
        <button type="button" class="btn btn-danger btn-icon btn-sm" title="Eliminar cuenta" onclick="app.removeBank(${idx})">🗑️</button>
      </div>
    `).join('');
  },

  addBankAccountRow() {
    this.state.bancosList.push({
      id: Date.now().toString(),
      banco: 'Bancolombia',
      tipoCuenta: 'Ahorros',
      numeroCuenta: '',
      titular: this.state.emisor.nombre || ''
    });
    this.renderBankAccounts();
  },

  updateBank(idx, field, value) {
    if (this.state.bancosList[idx]) {
      this.state.bancosList[idx][field] = value;
    }
  },

  removeBank(idx) {
    this.state.bancosList.splice(idx, 1);
    this.renderBankAccounts();
  },

  async saveBankAccounts() {
    try {
      const data = await this.fetchJson('/api/emisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bancos: this.state.bancosList })
      });
      if (data.success) {
        this.state.emisor.bancos = this.state.bancosList;
        localStorage.setItem('cobroauto_emisor', JSON.stringify(this.state.emisor));
        this.showToast('Cuentas bancarias guardadas con éxito', 'success');
      }
    } catch (e) {
      this.showToast(`Error guardando cuentas bancarias: ${e.message}`, 'error');
    }
  },

  async saveBranding() {
    try {
      const payload = {
        firmaUrl: this.state.emisor.firmaUrl || '',
        logoUrl: this.state.emisor.logoUrl || ''
      };
      const data = await this.fetchJson('/api/emisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (data.success) {
        this.state.emisor = { ...this.state.emisor, ...data.emisor };
        localStorage.setItem('cobroauto_emisor', JSON.stringify(this.state.emisor));
        this.showToast('Firma digitalizada y logo guardados con éxito', 'success');
      }
    } catch (e) {
      this.showToast(`Error guardando firma y logo: ${e.message}`, 'error');
    }
  },

  removeFirma() {
    this.state.emisor.firmaUrl = '';
    document.getElementById('img-firma-preview').src = '';
    document.getElementById('img-firma-preview').style.display = 'none';
    document.getElementById('firma-placeholder').style.display = 'block';
    this.saveBranding();
  },

  removeLogo() {
    this.state.emisor.logoUrl = '';
    document.getElementById('img-logo-preview').src = '';
    document.getElementById('img-logo-preview').style.display = 'none';
    document.getElementById('logo-placeholder').style.display = 'block';
    this.saveBranding();
  },

  async uploadFile(file, type) {
    if (!file) return;
    const formData = new FormData();
    formData.append(type, file);

    try {
      this.showToast(`Subiendo ${type}...`, 'info');
      const res = await fetch(`/api/emisor/upload-${type}`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Imagen de ${type} actualizada con éxito`, 'success');
        if (type === 'firma') {
          this.state.emisor.firmaUrl = data.firmaUrl;
          document.getElementById('img-firma-preview').src = data.firmaUrl;
          document.getElementById('img-firma-preview').style.display = 'block';
          document.getElementById('firma-placeholder').style.display = 'none';
        } else if (type === 'logo') {
          this.state.emisor.logoUrl = data.logoUrl;
          document.getElementById('img-logo-preview').src = data.logoUrl;
          document.getElementById('img-logo-preview').style.display = 'block';
          document.getElementById('logo-placeholder').style.display = 'none';
        }
        localStorage.setItem('cobroauto_emisor', JSON.stringify(this.state.emisor));
      } else {
        this.showToast(data.error || 'Error al subir archivo', 'error');
      }
    } catch (e) {
      this.showToast(`Error al subir: ${e.message}`, 'error');
    }
  },

  applySmtpPreset(preset) {
    const host = document.getElementById('smtp-host');
    const port = document.getElementById('smtp-port');
    if (preset === 'gmail') {
      host.value = 'smtp.gmail.com';
      port.value = '465';
    } else if (preset === 'outlook') {
      host.value = 'smtp-mail.outlook.com';
      port.value = '587';
    } else if (preset === 'hostinger') {
      host.value = 'smtp.hostinger.com';
      port.value = '465';
    }
  },

  async handleSmtpSubmit(e) {
    e.preventDefault();
    const smtp = {
      active: document.getElementById('smtp-active').checked,
      host: document.getElementById('smtp-host').value,
      port: parseInt(document.getElementById('smtp-port').value, 10),
      secure: parseInt(document.getElementById('smtp-port').value, 10) === 465,
      user: document.getElementById('smtp-user').value,
      pass: document.getElementById('smtp-pass').value,
      fromName: document.getElementById('smtp-fromname').value,
      fromEmail: document.getElementById('smtp-user').value,
      bccEmisor: document.getElementById('smtp-bcc').checked
    };

    try {
      const data = await this.fetchJson('/api/emisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtp })
      });
      if (data.success) {
        this.state.emisor.smtp = smtp;
        localStorage.setItem('cobroauto_emisor', JSON.stringify(this.state.emisor));
        this.showToast('Configuración SMTP guardada con éxito', 'success');
        await this.loadDashboard();
      }
    } catch (e) {
      this.showToast(`Error guardando SMTP: ${e.message}`, 'error');
    }
  },

  async testSmtp() {
    const btn = document.getElementById('btn-test-smtp');
    btn.disabled = true;

    const smtp = {
      active: true,
      host: document.getElementById('smtp-host').value,
      port: parseInt(document.getElementById('smtp-port').value, 10),
      secure: parseInt(document.getElementById('smtp-port').value, 10) === 465,
      user: document.getElementById('smtp-user').value,
      pass: document.getElementById('smtp-pass').value,
      fromName: document.getElementById('smtp-fromname').value || 'Facturación'
    };

    const emailPrueba = document.getElementById('smtp-test-email').value || smtp.user;

    try {
      this.showToast('Probando conexión SMTP...', 'info');
      const res = await fetch('/api/emisor/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtp, emailPrueba })
      });
      const data = await res.json();

      if (data.success) {
        this.showToast(`✅ Conexión SMTP exitosa. Correo de prueba enviado a ${emailPrueba}`, 'success');
      } else {
        this.showToast(`❌ Error SMTP: ${data.error}`, 'error');
      }
    } catch (e) {
      this.showToast(`Error probando servidor: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  },

  // ================= 6. SCHEDULER TRIGGER =================
  async triggerCronCheck() {
    if (!confirm('¿Deseas verificar y procesar ahora los cortes de facturación programados para hoy?')) return;

    try {
      this.showToast('Verificando cortes de hoy...', 'info');
      const res = await fetch('/api/scheduler/ejecutar-corte', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        const emitidas = data.resultados.filter(r => r.resultado && r.resultado.success).length;
        this.showToast(`Revisión completada. Cuentas generadas hoy: ${emitidas}`, 'success');
        await this.loadAllData();
      } else {
        this.showToast('Error en la verificación de cortes', 'error');
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, 'error');
    }
  },

  // ================= 7. LOGS =================
  async loadLogs() {
    try {
      const logs = await this.fetchJson('/api/logs');
      this.state.logs = logs;

      const tbody = document.getElementById('table-logs-body');
      if (!tbody) return;

      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">No hay registros de auditoría.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(l => {
        const dateStr = new Date(l.timestamp).toLocaleString('es-CO');
        let typeBadge = '<span class="status-pill borrador">Info</span>';
        if (l.tipo === 'success') typeBadge = '<span class="status-pill pagada">Éxito</span>';
        if (l.tipo === 'error') typeBadge = '<span class="status-pill anulada">Error</span>';

        return `
          <tr>
            <td><small style="color:var(--text-dim);">${dateStr}</small></td>
            <td>${typeBadge}</td>
            <td><strong style="color:#fff;">${l.mensaje}</strong></td>
            <td><small style="color:var(--text-muted); font-family:monospace;">${l.detalles || ''}</small></td>
          </tr>
        `;
      }).join('');

    } catch (e) {
      console.error('Error cargando logs:', e);
    }
  },

  // ================= UTILITIES =================
  async fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      throw new Error(`Respuesta no válida (${res.status}): ${text.substring(0, 60)}...`);
    }
    if (!res.ok) {
      throw new Error(data.error || `Error HTTP ${res.status}`);
    }
    return data;
  },

  formatCurrency(val) {
    const num = Number(val) || 0;
    return '$ ' + num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  },

  insertTagClient(tag) {
    const ta = document.getElementById('client-concepto');
    if (ta) ta.value += ` ${tag}`;
  },

  insertTagManual(tag) {
    const ta = document.getElementById('manual-concepto');
    if (ta) {
      ta.value += ` ${tag}`;
      this.updateManualCalcPreview();
    }
  },

  closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `
      <span style="font-size:18px;">${icon}</span>
      <span style="flex:1;">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

// Iniciar aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
