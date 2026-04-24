class FlowEditor {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.editor = new Drawflow(this.container);
    this.automationId = null;
    this.automationName = "Mi Automática Vibrante";

    // n8n bridge state (Fase 7)
    // Refrescado tras save/load/activate/resync. La UI lo consume para
    // pintar el badge de sync, habilitar el botón Ejecutar y construir
    // la URL real de los nodos webhook.
    this.n8nWorkflowId = null;     // string|null — id del workflow en n8n
    this.n8nSyncStatus = 'unsynced'; // 'unsynced'|'syncing'|'synced'|'error'
    this.n8nSyncError  = null;     // string|null — detalle si status='error'
    this.isActive      = true;     // bool — espejo local de automations.is_active
    this.webhooks      = [];       // [{ slug, url, http_method, drawflow_id, ... }]

    // Performance state
    this._counterRAF = null;       // rAF ID for debounced counter updates
    this._interactionTimer = null; // Timer ID for interaction class cleanup
    this._isInteracting = false;   // Track pan/zoom state

    this.init();
  }

  init() {
    this.editor.reroute = true;
    this.editor.reroute_fix_curvature = true;
    this.editor.curvature = 0.5;
    this.editor.force_first_input = false;
    this.editor.line_path = 1; // Bezier

    this.editor.start();

    // Zoom configuration — must be set AFTER start()
    // IMPORTANT: zoom_value is the STEP (not the current level).
    // Previous bug: zoom_value=1 caused zoom_out() to hit 0, making nodes 0×0 and unclickable.
    this.editor.zoom = 1;
    this.editor.zoom_last_value = 1;
    this.editor.zoom_min = 0.2;
    this.editor.zoom_max = 2;
    this.editor.zoom_value = 0.1;
    this.editor.snap = true;
    this.editor.snap_grid = 25;

    this.registerCustomNodes();
    this.setupEditorEvents();
    this.setupWheelZoom();
    this.updateCounters();

    // Sync name with topbar
    const nameInput = document.querySelector('.h-16 input[type="text"]');
    if (nameInput) {
      nameInput.value = this.automationName;
      nameInput.addEventListener('change', (e) => {
        this.automationName = e.target.value;
      });
    }
  }

  setupEditorEvents() {
    this.editor.on("nodeCreated", () => this.scheduleCounterUpdate());
    this.editor.on("nodeRemoved", () => this.scheduleCounterUpdate());
    this.editor.on("connectionCreated", () => this.scheduleCounterUpdate());
    this.editor.on("connectionRemoved", () => this.scheduleCounterUpdate());

    // --- FIX: nodeSelected handler with debug logging and validation ---
    this.editor.on("nodeSelected", (id) => {
      console.debug("[NodeWeaver] nodeSelected fired — ID:", id, "type:", typeof id);
      try {
        this.showNodeConfig(id);
      } catch (err) {
        console.error("[NodeWeaver] showNodeConfig error:", err);
      }
    });
    this.editor.on("nodeUnselected", () => this.clearNodeConfig());

    // --- PERF: Toggle interaction class to disable expensive CSS during pan ---
    this.editor.on("translate", () => this.markInteracting());
    this.editor.on("zoom", () => this.markInteracting());
  }

  // --- Cursor-centered smooth wheel zoom ---
  // Drawflow's native `zoom_enter` only fires on Ctrl+Wheel.
  // We override the wheel behavior entirely for free-wheel zoom.
  setupWheelZoom() {
    this.container.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      ev.stopPropagation(); // Prevent Drawflow's own zoom_enter from double-firing

      const zoomingIn = ev.deltaY < 0;

      // Read current state before mutation
      const oldZoom = this.editor.zoom;
      const step = this.editor.zoom_value;

      // Calculate new zoom, respecting bounds
      let newZoom;
      if (zoomingIn) {
        newZoom = Math.min(oldZoom + step, this.editor.zoom_max);
      } else {
        newZoom = Math.max(oldZoom - step, this.editor.zoom_min);
      }

      // If zoom didn't actually change (at limits), bail early
      if (newZoom === oldZoom) return;

      // --- Cursor-centered correction ---
      const rect = this.container.getBoundingClientRect();
      const cursorX = ev.clientX - rect.left;
      const cursorY = ev.clientY - rect.top;

      // Current canvas translation
      const currentX = this.editor.canvas_x;
      const currentY = this.editor.canvas_y;

      // Zoom ratio for translation adjustment
      const zoomRatio = newZoom / oldZoom;

      // Adjust translation to keep the point under the cursor stable
      const newX = cursorX - (cursorX - currentX) * zoomRatio;
      const newY = cursorY - (cursorY - currentY) * zoomRatio;

      // Directly write to Drawflow's internal state (bypass zoom_refresh
      // which would center-recalculate canvas_x/y and fight our adjustment)
      this.editor.zoom = newZoom;
      this.editor.zoom_last_value = newZoom;
      this.editor.canvas_x = newX;
      this.editor.canvas_y = newY;

      // Apply the transform
      this.editor.precanvas.style.transform =
        `translate(${newX}px, ${newY}px) scale(${newZoom})`;

      // Dispatch the zoom event so other listeners (including our markInteracting) fire
      this.editor.dispatch("zoom", newZoom);

      this.markInteracting();
    }, { passive: false });
  }

  // --- PERF: Mark canvas as interacting to disable costly CSS effects ---
  markInteracting() {
    if (!this._isInteracting) {
      this._isInteracting = true;
      this.container.classList.add('is-interacting');
    }
    // Reset the cleanup timer on every interaction event
    clearTimeout(this._interactionTimer);
    this._interactionTimer = setTimeout(() => {
      this._isInteracting = false;
      this.container.classList.remove('is-interacting');
    }, 150);
  }

  // --- PERF: Debounced counter update via rAF (avoids layout thrashing) ---
  scheduleCounterUpdate() {
    if (this._counterRAF) return; // Already scheduled
    this._counterRAF = requestAnimationFrame(() => {
      this.updateCounters();
      // Refresca botones del puente: al quitar el último webhook el botón
      // Ejecutar debe deshabilitarse, y viceversa.
      this.updateBridgeUI();
      this._counterRAF = null;
    });
  }

  // --- Drag & Drop Handlers ---
  drag(ev) {
    if (ev.type === "touchstart") {
      this.mobile_item_selec = ev.target.closest("[data-type]").getAttribute("data-type");
    } else {
      ev.dataTransfer.setData("node", ev.target.getAttribute("data-type"));
    }
  }

  drop(ev) {
    ev.preventDefault();
    let data;
    if (ev.type === "touchend") {
      data = this.mobile_item_selec;
    } else {
      data = ev.dataTransfer.getData("node");
    }
    this.addNodeToEditor(data, ev.clientX, ev.clientY);
  }

  addNodeToEditor(name, pos_x, pos_y) {
    if (this.editor.editor_mode === 'fixed') return false;

    pos_x = pos_x * (this.editor.precanvas.clientWidth / (this.editor.precanvas.clientWidth * this.editor.zoom)) - (this.editor.precanvas.getBoundingClientRect().x * (this.editor.precanvas.clientWidth / (this.editor.precanvas.clientWidth * this.editor.zoom)));
    pos_y = pos_y * (this.editor.precanvas.clientHeight / (this.editor.precanvas.clientHeight * this.editor.zoom)) - (this.editor.precanvas.getBoundingClientRect().y * (this.editor.precanvas.clientHeight / (this.editor.precanvas.clientHeight * this.editor.zoom)));

    const nodeTemplate = this.getNodeTemplate(name);
    this.editor.addNode(name, nodeTemplate.inputs, nodeTemplate.outputs, pos_x, pos_y, name, {}, nodeTemplate.html);
  }

  getNodeTemplate(name) {
    const icons = {
      schedule: "fa-clock",
      webhook: "fa-globe",
      email: "fa-envelope",
      backup: "fa-database",
      log: "fa-terminal",
      http_request: "fa-network-wired",
      condition: "fa-code-branch",
      delay: "fa-hourglass-half"
    };

    const icon = icons[name] || "fa-cube";
    const label = name.replace('_', ' ').toUpperCase();

    return {
      inputs: (['schedule', 'webhook'].includes(name)) ? 0 : 1,
      outputs: 1,
      html: `
        <div class="custom-node ${name}">
          <div class="node-header">
            <i class="fas ${icon}"></i>
            <span>${label}</span>
          </div>
          <div class="node-body">Configurar...</div>
        </div>
      `
    };
  }

  // --- Persistent Storage (API) ---

  /**
   * Llama a /automation/save. El backend sincroniza con n8n y devuelve
   * el estado del puente (n8n_workflow_id, sync_status, webhooks reales).
   * Actualizamos el state local y refrescamos la UI del puente.
   */
  async save() {
    const token = localStorage.getItem('token');
    if (!token) return showNotification("Debes iniciar sesión", "error");

    this.setSyncStatus('syncing');

    const flowData = this.editor.export();
    const payload = {
      id: this.automationId,
      name: this.automationName,
      flow_data: JSON.stringify(flowData),
      is_active: this.isActive ? 1 : 0
    };

    try {
      const response = await fetch('../../API/index.php?route=automation/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.success) {
        this.automationId   = data.id;
        this.n8nWorkflowId  = data.n8n_workflow_id || null;
        this.n8nSyncStatus  = data.n8n_sync_status || 'unsynced';
        this.n8nSyncError   = data.n8n_sync_error  || null;
        this.webhooks       = Array.isArray(data.webhooks) ? data.webhooks : [];
        this.updateBridgeUI();

        const msg = this.n8nSyncStatus === 'synced'
          ? "Flujo guardado y desplegado en n8n"
          : (this.n8nSyncStatus === 'error'
              ? "Guardado en BD, pero n8n devolvió un error"
              : "Flujo guardado");
        showNotification(msg, this.n8nSyncStatus === 'error' ? 'error' : 'success');
      } else {
        this.setSyncStatus('error', data.message);
        showNotification(data.message || "Error al guardar", "error");
      }
    } catch (error) {
      console.error("Save error:", error);
      this.setSyncStatus('error', error.message);
      showNotification("Error de conexión con el servidor", "error");
    }
  }

  async loadLast() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch('../../API/index.php?route=automation/list', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await response.json();

      if (data.success && data.automations.length > 0) {
        await this.load(data.automations[0].id);
      }
    } catch (error) {
      console.warn("Load error:", error);
    }
  }

  async load(id) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch(`../../API/index.php?route=automation/get&id=${id}`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await response.json();

      if (data.success && data.automation) {
        const a = data.automation;
        this.automationId    = Number(a.id);
        this.automationName  = a.name;
        this.n8nWorkflowId   = a.n8n_workflow_id || null;
        this.n8nSyncStatus   = a.n8n_sync_status || 'unsynced';
        this.n8nSyncError    = a.n8n_sync_error  || null;
        this.isActive        = Number(a.is_active) === 1;
        this.webhooks        = Array.isArray(a.webhooks) ? a.webhooks : [];

        this.editor.import(JSON.parse(a.flow_data));
        this.updateCounters();
        this.updateBridgeUI();

        const nameInput = document.querySelector('.h-16 input[type="text"]');
        if (nameInput) nameInput.value = this.automationName;
      } else {
        console.warn("[NodeWeaver] load() — automation not found, starting blank.");
        this.resetBridgeState();
      }
    } catch (error) {
      console.warn("[NodeWeaver] load() error:", error);
    }
  }

  clear() {
    if (confirm("¿Estás seguro de que deseas limpiar el lienzo?")) {
      this.editor.clearModuleSelected();
      this.automationId = null;
      this.automationName = "Nuevo Flujo";
      this.resetBridgeState();
      this.updateCounters();
      const nameInput = document.querySelector('.h-16 input[type="text"]');
      if (nameInput) nameInput.value = this.automationName;
    }
  }

  // ===========================================================
  //  n8n bridge — orquestación desde el editor (Fase 7)
  // ===========================================================

  /** Resetea el estado del puente cuando se inicia un flujo nuevo. */
  resetBridgeState() {
    this.n8nWorkflowId = null;
    this.n8nSyncStatus = 'unsynced';
    this.n8nSyncError  = null;
    this.isActive      = true;
    this.webhooks      = [];
    this.updateBridgeUI();
  }

  /** Refresca el badge de sync sin tocar n8n (para estados transitorios). */
  setSyncStatus(status, error = null) {
    this.n8nSyncStatus = status;
    this.n8nSyncError  = error;
    this.updateBridgeUI();
  }

  /**
   * Dispara la ejecución manual del flujo (POST /automation/execute).
   * Requiere que haya al menos un nodo `webhook` en el grafo.
   */
  async execute() {
    const token = localStorage.getItem('token');
    if (!token) return showNotification("Debes iniciar sesión", "error");
    if (!this.automationId)
      return showNotification("Guarda el flujo antes de ejecutarlo", "error");
    if (this.n8nSyncStatus !== 'synced')
      return showNotification("El flujo no está sincronizado con n8n", "error");

    try {
      const res = await fetch('../../API/index.php?route=automation/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ id: this.automationId, input_payload: {} })
      });
      const data = await res.json();

      if (res.status === 202 || data.success) {
        showNotification(
          `Ejecución disparada (#${data.execution_id}) · ${data.trigger_duration_ms}ms`,
          "success"
        );
      } else {
        showNotification(data.message || "Error al ejecutar", "error");
      }
    } catch (err) {
      console.error("execute()", err);
      showNotification("Error de conexión al ejecutar", "error");
    }
  }

  /** Activa o desactiva el workflow en n8n + local. */
  async setActive(active) {
    const token = localStorage.getItem('token');
    if (!token || !this.automationId) return;

    const route = active ? 'automation/activate' : 'automation/deactivate';
    this.setSyncStatus('syncing');
    try {
      const res = await fetch('../../API/index.php?route=' + route, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ id: this.automationId })
      });
      const data = await res.json();
      if (data.success) {
        this.isActive = active;
        this.n8nSyncStatus = 'synced';
        this.updateBridgeUI();
        showNotification(active ? "Flujo activado" : "Flujo desactivado", "success");
      } else {
        this.setSyncStatus('error', data.message);
        showNotification(data.message || "Error al cambiar el estado", "error");
      }
    } catch (err) {
      this.setSyncStatus('error', err.message);
      showNotification("Error de conexión", "error");
    }
  }

  /** Reintento manual de deploy si n8n falló (POST /automation/resync). */
  async resync() {
    const token = localStorage.getItem('token');
    if (!token || !this.automationId) return;

    this.setSyncStatus('syncing');
    try {
      const res = await fetch('../../API/index.php?route=automation/resync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ id: this.automationId })
      });
      const data = await res.json();
      if (data.success) {
        this.n8nWorkflowId = data.n8n_workflow_id || this.n8nWorkflowId;
        this.n8nSyncStatus = data.n8n_sync_status || 'synced';
        this.n8nSyncError  = data.n8n_sync_error  || null;
        this.webhooks      = Array.isArray(data.webhooks) ? data.webhooks : this.webhooks;
        this.updateBridgeUI();
        showNotification(
          this.n8nSyncStatus === 'synced' ? "Re-sincronizado con n8n" : "n8n sigue dando error",
          this.n8nSyncStatus === 'synced' ? 'success' : 'error'
        );
      } else {
        this.setSyncStatus('error', data.message);
        showNotification(data.message || "Error al re-sincronizar", "error");
      }
    } catch (err) {
      this.setSyncStatus('error', err.message);
      showNotification("Error de conexión", "error");
    }
  }

  /**
   * Devuelve el webhook registrado para un nodo Drawflow dado.
   * Usado por showNodeConfig() para pintar la URL real en el panel derecho.
   */
  getWebhookForNode(drawflowId) {
    if (!this.webhooks || !this.webhooks.length) return null;
    // El backend guarda drawflow_id como string.
    const dfId = String(drawflowId);
    return this.webhooks.find(w => String(w.drawflow_id) === dfId) || null;
  }

  /**
   * Refresca el badge de sync + habilita/deshabilita botones del topbar.
   * Es tolerante: si los elementos no existen (p.ej. en una vista sin
   * botones del puente), no pasa nada.
   */
  updateBridgeUI() {
    const badge = document.getElementById('bridge-badge');
    if (badge) {
      const variants = {
        unsynced: { color: 'text-slate-400 bg-slate-700/40 border-white/10', icon: 'fa-circle-dashed', label: 'Sin sync' },
        syncing:  { color: 'text-amber-300 bg-amber-500/15 border-amber-500/30 animate-pulse', icon: 'fa-spinner fa-spin', label: 'Sincronizando' },
        synced:   { color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', icon: 'fa-check', label: 'Sincronizado' },
        error:    { color: 'text-red-300 bg-red-500/15 border-red-500/30', icon: 'fa-triangle-exclamation', label: 'Error n8n' },
      };
      const v = variants[this.n8nSyncStatus] || variants.unsynced;
      badge.className = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${v.color}`;
      badge.innerHTML = `<i class="fas ${v.icon}"></i> ${v.label}`;
      badge.title = this.n8nSyncError || v.label;
    }

    const activeBadge = document.getElementById('active-badge');
    if (activeBadge) {
      activeBadge.className = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${
        this.isActive
          ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
          : 'text-slate-400 bg-slate-700/40 border-white/10'
      }`;
      activeBadge.innerHTML = `<i class="fas ${this.isActive ? 'fa-play' : 'fa-pause'}"></i> ${this.isActive ? 'Activo' : 'Inactivo'}`;
    }

    const btnExecute  = document.getElementById('btn-execute');
    const btnResync   = document.getElementById('btn-resync');
    const btnToggle   = document.getElementById('btn-toggle-active');
    if (btnExecute) btnExecute.disabled = this.n8nSyncStatus !== 'synced' || !this.hasWebhookNode();
    if (btnResync)  btnResync.disabled  = !this.automationId;
    if (btnToggle) {
      btnToggle.disabled = !this.automationId;
      btnToggle.innerHTML = this.isActive
        ? '<i class="fas fa-pause"></i> Desactivar'
        : '<i class="fas fa-play"></i> Activar';
    }
  }

  /** Devuelve true si el grafo contiene al menos un nodo 'webhook'. */
  hasWebhookNode() {
    const data = this.editor.export();
    const nodes = Object.values(data.drawflow?.Home?.data ?? {});
    return nodes.some(n => n.name === 'webhook');
  }

  // --- UI & Configuration ---
  updateCounters() {
    const data = this.editor.export();
    const nodes = Object.values(data.drawflow?.Home?.data ?? {});
    const nCount = nodes.length;
    const cCount = nodes.reduce((acc, n) => {
      return acc + Object.values(n.outputs ?? {}).reduce((a, o) => a + (o.connections?.length ?? 0), 0);
    }, 0);

    const nEl = document.getElementById("node-count");
    const cEl = document.getElementById("connection-count");
    if (nEl) nEl.textContent = nCount;
    if (cEl) cEl.textContent = cCount;
  }

  showNodeConfig(id) {
    // Drawflow passes the node ID as a string (e.g. "1")
    console.debug("[NodeWeaver] showNodeConfig called — id:", id);

    const node = this.editor.getNodeFromId(id);
    if (!node) {
      console.warn("[NodeWeaver] getNodeFromId returned null for id:", id);
      return;
    }
    console.debug("[NodeWeaver] Node resolved:", node.name, "data:", node.data);

    const panel = document.getElementById("sidebar-right");
    if (!panel) {
      console.warn("[NodeWeaver] #sidebar-right not found in DOM");
      return;
    }

    // Build the config panel HTML
    const nodeLabel = node.name.replace(/_/g, ' ').toUpperCase();
    let html = `
      <div class="p-5">
        <h3 class="text-white font-bold text-lg mb-4 flex items-center gap-2">
          <i class="fas fa-cog text-pink-400"></i> ${nodeLabel}
        </h3>
        <div class="space-y-4">
    `;

    // Dynamic Form based on type
    if (node.name === 'email') {
      html += `
        <div class="space-y-1">
          <label class="text-[10px] uppercase font-bold text-slate-500">Destinatario</label>
          <input type="email" id="cfg-email" value="${node.data.email || ''}" class="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white">
        </div>
        <div class="space-y-1">
          <label class="text-[10px] uppercase font-bold text-slate-500">Asunto</label>
          <input type="text" id="cfg-subject" value="${node.data.subject || ''}" class="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white">
        </div>
      `;
    } else if (node.name === 'webhook') {
      const wh = this.getWebhookForNode(id);
      const method = (node.data.method || 'POST').toUpperCase();
      html += `
        <div class="space-y-1">
          <label class="text-[10px] uppercase font-bold text-slate-500">Método HTTP</label>
          <select id="cfg-method" class="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white">
            ${['POST','GET','PUT','DELETE'].map(m =>
              `<option value="${m}" ${method === m ? 'selected' : ''}>${m}</option>`
            ).join('')}
          </select>
        </div>
      `;
      if (wh && wh.url) {
        html += `
          <div class="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] text-emerald-300 space-y-1.5">
            <div class="font-bold flex items-center gap-1.5"><i class="fas fa-link"></i> URL pública (n8n)</div>
            <div class="font-mono text-white break-all text-[10px] leading-tight">${wh.url}</div>
            <button onclick="navigator.clipboard.writeText('${wh.url.replace(/'/g,"\\'")}'); showNotification('URL copiada','success');"
                    class="w-full mt-1 px-2 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-[10px] font-bold transition">
              <i class="fas fa-copy"></i> Copiar URL
            </button>
          </div>
        `;
      } else {
        html += `
          <div class="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] text-amber-300">
            <i class="fas fa-circle-info"></i> Guarda el flujo para generar la URL real en n8n.
          </div>
        `;
      }
    } else if (node.name === 'log') {
      html += `
        <div class="space-y-1">
          <label class="text-[10px] uppercase font-bold text-slate-500">Mensaje de Log</label>
          <textarea id="cfg-message" class="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs h-24 text-white">${node.data.message || ''}</textarea>
        </div>
      `;
    } else if (node.name === 'schedule') {
      html += `
        <div class="space-y-1">
          <label class="text-[10px] uppercase font-bold text-slate-500">Intervalo (cron)</label>
          <input type="text" id="cfg-cron" placeholder="*/5 * * * *" value="${node.data.cron || ''}" class="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs font-mono text-white">
        </div>
      `;
    } else if (node.name === 'http_request') {
      html += `
        <div class="space-y-1">
          <label class="text-[10px] uppercase font-bold text-slate-500">URL</label>
          <input type="url" id="cfg-url" placeholder="https://..." value="${node.data.url || ''}" class="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs font-mono text-white">
        </div>
        <div class="space-y-1">
          <label class="text-[10px] uppercase font-bold text-slate-500">Método</label>
          <select id="cfg-method" class="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white">
            <option value="GET" ${node.data.method === 'GET' ? 'selected' : ''}>GET</option>
            <option value="POST" ${node.data.method === 'POST' ? 'selected' : ''}>POST</option>
            <option value="PUT" ${node.data.method === 'PUT' ? 'selected' : ''}>PUT</option>
            <option value="DELETE" ${node.data.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
          </select>
        </div>
      `;
    } else {
      html += `<p class="text-slate-500 text-xs italic">Este nodo utiliza la configuración por defecto.</p>`;
    }

    html += `
        </div>
        <button onclick="window.editorInstance.saveNodeConfig(${id})" class="w-full mt-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-bold text-xs shadow-lg hover:shadow-cyan-500/20 transition-all text-white">
          Aplicar Cambios
        </button>
      </div>
    `;

    panel.innerHTML = html;
    showNotification(`Nodo ${nodeLabel} seleccionado`, "success");
  }

  saveNodeConfig(id) {
    const node = this.editor.getNodeFromId(id);
    if (!node) return;

    const newData = { ...node.data };

    if (node.name === 'email') {
      newData.email = document.getElementById('cfg-email')?.value || '';
      newData.subject = document.getElementById('cfg-subject')?.value || '';
    } else if (node.name === 'log') {
      newData.message = document.getElementById('cfg-message')?.value || '';
    } else if (node.name === 'schedule') {
      newData.cron = document.getElementById('cfg-cron')?.value || '';
    } else if (node.name === 'http_request') {
      newData.url = document.getElementById('cfg-url')?.value || '';
      newData.method = document.getElementById('cfg-method')?.value || 'GET';
    } else if (node.name === 'webhook') {
      newData.method = document.getElementById('cfg-method')?.value || 'POST';
    }

    this.editor.updateNodeDataFromId(id, newData);
    showNotification("Configuración actualizada", "success");
  }

  clearNodeConfig() {
    const panel = document.getElementById("sidebar-right");
    if (!panel) return;
    panel.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center opacity-60 select-none">
        <div class="w-16 h-16 rounded-full bg-slate-800 border border-white/5 flex items-center justify-center mb-4 shadow-inner">
            <i class="fas fa-hand-pointer text-2xl text-slate-500"></i>
        </div>
        <h4 class="text-white font-bold mb-1 text-sm">Selección inactiva</h4>
        <p class="text-[11px] text-slate-400 leading-relaxed px-4">Toca un nodo para calibrar sus frecuencias.</p>
      </div>
    `;
  }

  registerCustomNodes() {
    // Already handled by addNodeToEditor using getNodeTemplate
    // But we can register specific drawflow layouts if needed.
  }
}

// Global notification helper if not defined
window.showNotification = window.showNotification || function(msg, type) {
  console.log(`[Notification] ${type}: ${msg}`);
  const toast = document.createElement('div');
  toast.className = `fixed bottom-5 right-5 px-6 py-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-2xl z-[200] transition-all transform translate-y-20 opacity-0 text-sm font-bold flex items-center gap-3`;
  toast.style.backgroundColor = type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
  toast.style.color = type === 'success' ? '#10b981' : '#ef4444';
  toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.classList.remove('translate-y-20', 'opacity-0'); }, 100);
  setTimeout(() => { 
    toast.classList.add('translate-y-20', 'opacity-0');
    setTimeout(() => toast.remove(), 500);
  }, 3000);
};