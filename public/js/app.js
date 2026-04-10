document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    document.getElementById("loading-screen").style.opacity = "0";
    setTimeout(() => {
      document.getElementById("loading-screen").style.display = "none";
      document.getElementById("app").style.display = "flex";
      initApp();
    }, 500);
  }, 1000);
});

async function apiCall(route, method = 'GET', body = null) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = "auth/login.html";
    return;
  }

  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    }
  };
  
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`http://localhost/backend/public/index.php?route=${route}`, options);
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = "auth/login.html";
  }
  return res.json();
}

function initApp() {
  window.flowEditor = new FlowEditor("drawflow");
  setupEventListeners();
  setupDragAndDrop();
  
  // TODO: Descomentar cuando estén listos los controladores del backend
  // loadAutomations(); 
  // loadLogs();
  // loadStats();
}

function setupDragAndDrop() {
  let draggedNodeType = null;

  document.querySelectorAll('.node-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedNodeType = e.target.getAttribute('data-type');
    });
  });

  const canvas = document.getElementById('drawflow');
  canvas.addEventListener('dragover', (e) => e.preventDefault());

  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    if (draggedNodeType) {
      const editor = window.flowEditor.editor;
      
      // Cálculo de coordenadas compensando el zoom
      const x = e.clientX * (editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom)) - (editor.precanvas.getBoundingClientRect().x * (editor.precanvas.clientWidth / (editor.precanvas.clientWidth * editor.zoom)));
      const y = e.clientY * (editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom)) - (editor.precanvas.getBoundingClientRect().y * (editor.precanvas.clientHeight / (editor.precanvas.clientHeight * editor.zoom)));

      let inputs = draggedNodeType === 'webhook' ? 0 : 1;
      editor.addNode(draggedNodeType, inputs, 1, x, y, draggedNodeType, {}, draggedNodeType);
      draggedNodeType = null;
    }
  });
}

function setupEventListeners() {
  document.getElementById("save-flow").addEventListener("click", saveAutomation);
  document.getElementById("execute-flow").addEventListener("click", executeAutomation);
  document.getElementById("new-flow").addEventListener("click", newAutomation);

  document.getElementById("zoom-in").addEventListener("click", () => window.flowEditor.editor.zoom_in());
  document.getElementById("zoom-out").addEventListener("click", () => window.flowEditor.editor.zoom_out());
  document.getElementById("fit-view").addEventListener("click", () => window.flowEditor.editor.zoom_reset());

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
    });
  });

  document.querySelectorAll(".category-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.classList.toggle("collapsed");
      header.nextElementSibling.classList.toggle("collapsed");
    });
  });
}

async function saveAutomation() {
  const name = document.getElementById("flow-name-input").value;
  const flow = window.flowEditor.editor.export();
  showNotification("Guardando automatización...", "info");

  try {
    const data = await apiCall('api/automations/save', 'POST', { name, flow });
    if (data.success) {
      showNotification("✅ Guardado correctamente", "success");
    } else {
      showNotification("❌ " + data.message, "error");
    }
  } catch(err) {
    showNotification("❌ Error de red al guardar", "error");
  }
}

async function executeAutomation() {
  showNotification("Ejecutando en n8n...", "info");
  
  try {
    const data = await apiCall('api/automations/execute', 'POST', { id: 1 });
    if (data.success) {
      showNotification("✅ Ejecución completada", "success");
    }
  } catch(err) {
    showNotification("❌ Error de puente con n8n", "error");
  }
}

function newAutomation() {
  if (confirm("¿Crear nueva automatización? Se perderán los cambios no guardados.")) {
    window.flowEditor.editor.clear();
    document.getElementById("flow-name-input").value = "Nueva automatización";
    document.getElementById("node-config").innerHTML = `<div class="empty-state"><i class="fas fa-arrow-left"></i><p>Selecciona un nodo para configurarlo</p></div>`;
  }
}

function showNotification(message, type = "info") {
  const container = document.getElementById("notification-container");
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  
  const icon = { success: "fa-check-circle", error: "fa-exclamation-circle", info: "fa-info-circle" }[type];
  notification.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
  container.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}