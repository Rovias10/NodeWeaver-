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

    this.setupEditorEvents();
    this._startGridLoop();
  }

  /**
   * Loop rAF: cada frame comprueba si el transform cambió.
   * Si cambió → actualiza las CSS vars del grid.
   * Usamos las propiedades internas de Drawflow para mayor precisión y performance.
   */
  _startGridLoop() {
    // Inicializar valores previos para evitar updates innecesarios
    this._lastX = 0;
    this._lastY = 0;
    this._lastZoom = 1;

    const tick = () => {
      // Accedemos directamente a las propiedades de la instancia de Drawflow
      // Esto evita tener que parsear strings del DOM que pueden cambiar de formato
      const x = this.editor.canvas_x || 0;
      const y = this.editor.canvas_y || 0;
      const zoom = this.editor.zoom || 1;

      // Solo actualizamos el DOM si los valores cambian
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

  // _syncGrid ya no es necesario con la nueva lógica, pero lo mantengo vacío por si acaso
  _syncGrid(transform) {}

  setupEditorEvents() {
    this.editor.on("nodeCreated", () => this._updateCounts());
    this.editor.on("nodeRemoved", () => this._updateCounts());
    this.editor.on("connectionCreated", () => this._updateCounts());
    this.editor.on("connectionRemoved", () => this._updateCounts());
  }

  _updateCounts() {
    const data = this.editor.export();
    const nodes = Object.values(data.drawflow?.Home?.data ?? {});
    const nCount = nodes.length;
    const cCount = nodes.reduce(
      (acc, n) =>
        acc +
        Object.values(n.outputs ?? {}).reduce(
          (a, o) => a + (o.connections?.length ?? 0),
          0,
        ),
      0,
    );

    const nEl = document.getElementById("node-count");
    const cEl = document.getElementById("connection-count");
    if (nEl) nEl.textContent = `${nCount} nodo${nCount !== 1 ? "s" : ""}`;
    if (cEl) cEl.textContent = `${cCount} conexión${cCount !== 1 ? "es" : ""}`;
  }

  registerCustomNodes() {
    this.editor.registerNode("email", {
      html: `
        <div class="custom-node email-node">
          <div class="node-header"><i class="fas fa-envelope"></i><span>Email</span></div>
          <div class="node-content">
            <div class="node-field"><input type="email" placeholder="destino@email.com"></div>
          </div>
          <div class="node-footer"><span class="node-status">Listo</span></div>
        </div>`,
      props: { type: "email", icon: "fa-envelope" },
      options: { class: "email-node" },
    });

    this.editor.registerNode("backup", {
      html: `
        <div class="custom-node backup-node">
          <div class="node-header"><i class="fas fa-database"></i><span>Backup</span></div>
          <div class="node-content">
            <div class="node-field"><input type="text" placeholder="Carpeta origen"></div>
            <div class="node-field"><input type="text" placeholder="Destino FTP"></div>
          </div>
          <div class="node-footer"><span class="node-status">Pendiente</span></div>
        </div>`,
      props: { type: "backup", icon: "fa-database" },
    });

    this.editor.registerNode("telegram", {
      html: `
        <div class="custom-node telegram-node">
          <div class="node-header"><i class="fab fa-telegram"></i><span>Telegram</span></div>
          <div class="node-content">
            <div class="node-field"><input type="text" placeholder="Chat ID"></div>
            <div class="node-field"><textarea placeholder="Mensaje"></textarea></div>
          </div>
        </div>`,
    });
  }
}
