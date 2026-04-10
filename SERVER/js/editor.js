class FlowEditor {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.editor = new Drawflow(this.container);
    this._canvas = null;
    this._lastTransform = "";

    this.init();
  }

  init() {
    this.editor.reroute = true;
    this.editor.reroute_fix_curvature = true;
    this.editor.curvature = 0.5;
    this.editor.force_first_input = false;

    this.editor.start();

    this.editor.zoom_min = 0.2;
    this.editor.zoom_max = 2;
    this.editor.zoom_value = 1;
    this.editor.snap = true;
    this.editor.snap_grid = 20;

    this.registerCustomNodes();

    this.setupEditorEvents();
    this._startGridLoop();
  }

  _startGridLoop() {
    this._lastX = 0;
    this._lastY = 0;
    this._lastZoom = 1;

    const tick = () => {
      const x = this.editor.canvas_x || 0;
      const y = this.editor.canvas_y || 0;
      const zoom = this.editor.zoom || 1;

      if (x !== this._lastX || y !== this._lastY || zoom !== this._lastZoom) {
        this._lastX = x;
        this._lastY = y;
        this._lastZoom = zoom;

        this.container.style.setProperty("--df-x", `${x}px`);
        this.container.style.setProperty("--df-y", `${y}px`);
        this.container.style.setProperty("--df-zoom", `${zoom}`);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  setupEditorEvents() {
    this.editor.on("nodeCreated", () => this._updateCounts());
    this.editor.on("nodeRemoved", () => this._updateCounts());
    this.editor.on("connectionCreated", () => this._updateCounts());
    this.editor.on("connectionRemoved", () => this._updateCounts());

    this.editor.on("nodeSelected", (id) => {
      this.showNodeConfig(id);
    });

    this.editor.on("nodeUnselected", () => {
      document.getElementById("node-config").innerHTML = `
        <div class="empty-state">
          <i class="fas fa-arrow-left"></i>
          <p>Selecciona un nodo para configurarlo</p>
        </div>`;
    });
  }

  showNodeConfig(id) {
    const node = this.editor.getNodeFromId(id);
    const configPanel = document.getElementById("node-config");

    document.querySelector('[data-tab="config"]').click();

    let html = `<div class="node-config-form">
                  <h4 style="margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                    Configurar ${node.name}
                  </h4>`;

    if (node.name === 'email') {
      html += `
        <div class="form-group">
          <label>Email de Destino</label>
          <input type="email" id="config-email" value="${node.data.email || ''}" placeholder="cliente@empresa.com">
        </div>
        <div class="form-group">
          <label>Asunto</label>
          <input type="text" id="config-subject" value="${node.data.subject || ''}" placeholder="Tu factura está lista">
        </div>`;
    } else if (node.name === 'telegram') {
      html += `
        <div class="form-group">
          <label>Chat ID</label>
          <input type="text" id="config-chatid" value="${node.data.chatId || ''}" placeholder="@mi_canal">
        </div>
        <div class="form-group">
          <label>Mensaje</label>
          <textarea id="config-message" rows="4" placeholder="¡Alerta del sistema!">${node.data.message || ''}</textarea>
        </div>`;
    } else {
      html += `<p class="text-secondary">Este nodo no requiere configuración adicional.</p>`;
    }

    html += `<button class="btn-landing-primary mt-3" style="width:100%; padding: 10px;" onclick="window.flowEditor.saveNodeConfig(${id})">Guardar Cambios</button></div>`;

    configPanel.innerHTML = html;
  }


  saveNodeConfig(id) {
    const node = this.editor.getNodeFromId(id);
    let newData = { ...node.data };

    if (node.name === 'email') {
      newData.email = document.getElementById('config-email').value;
      newData.subject = document.getElementById('config-subject').value;
    } else if (node.name === 'telegram') {
      newData.chatId = document.getElementById('config-chatid').value;
      newData.message = document.getElementById('config-message').value;
    }

    this.editor.updateNodeDataFromId(id, newData);
    showNotification("Configuración del nodo guardada", "success");
  }

  _updateCounts() {
    const data = this.editor.export();
    const nodes = Object.values(data.drawflow?.Home?.data ?? {});
    const nCount = nodes.length;
    const cCount = nodes.reduce(
      (acc, n) => acc + Object.values(n.outputs ?? {}).reduce((a, o) => a + (o.connections?.length ?? 0), 0), 0
    );

    const nEl = document.getElementById("node-count");
    const cEl = document.getElementById("connection-count");
    if (nEl) nEl.textContent = `${nCount} nodo${nCount !== 1 ? "s" : ""}`;
    if (cEl) cEl.textContent = `${cCount} conexión${cCount !== 1 ? "es" : ""}`;
  }

  registerCustomNodes() {
    this.editor.registerNode("email", `
        <div class="custom-node email-node">
          <div class="node-header"><i class="fas fa-envelope"></i><span>Email</span></div>
          <div class="node-footer"><span class="node-status">Listo</span></div>
        </div>`, {}, {}, 1, 1);

    this.editor.registerNode("telegram", `
        <div class="custom-node telegram-node">
          <div class="node-header"><i class="fab fa-telegram"></i><span>Telegram</span></div>
          <div class="node-footer"><span class="node-status">Listo</span></div>
        </div>`, {}, {}, 1, 1);

    this.editor.registerNode("webhook", `
        <div class="custom-node webhook-node" style="border-left: 4px solid #a855f7;">
          <div class="node-header"><i class="fas fa-globe"></i><span>Webhook In</span></div>
          <div class="node-footer"><span class="node-status">Esperando...</span></div>
        </div>`, {}, {}, 0, 1);
  }
}