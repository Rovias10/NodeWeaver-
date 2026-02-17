// app.js - Controlador principal

document.addEventListener("DOMContentLoaded", () => {
  // Ocultar pantalla de carga después de 2 segundos
  setTimeout(() => {
    document.getElementById("loading-screen").style.opacity = "0";
    setTimeout(() => {
      document.getElementById("loading-screen").style.display = "none";
      document.getElementById("app").style.display = "flex";
      initApp();
    }, 500);
  }, 2000);
});

function initApp() {
  window.flowEditor = new FlowEditor("drawflow");

  loadAutomations();
  loadLogs();
  loadStats();

  setupEventListeners();
}

function setupEventListeners() {
  document
    .getElementById("save-flow")
    .addEventListener("click", saveAutomation);
  document
    .getElementById("execute-flow")
    .addEventListener("click", executeAutomation);
  document.getElementById("new-flow").addEventListener("click", newAutomation);
  document
    .getElementById("clone-flow")
    .addEventListener("click", cloneAutomation);

  document.getElementById("zoom-in").addEventListener("click", () => {
    window.flowEditor.editor.zoom_in();
  });

  document.getElementById("zoom-out").addEventListener("click", () => {
    window.flowEditor.editor.zoom_out();
  });

  document.getElementById("fit-view").addEventListener("click", () => {
    window.flowEditor.editor.zoom_reset();
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      document
        .getElementById(`panel-${btn.dataset.tab}`)
        .classList.add("active");
    });
  });

  document.getElementById("node-search").addEventListener("input", (e) => {
    const search = e.target.value.toLowerCase();
    document.querySelectorAll(".node-item").forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(search) ? "flex" : "none";
    });
  });

  document.querySelectorAll(".category-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.classList.toggle("collapsed");
      const content = header.nextElementSibling;
      content.classList.toggle("collapsed");
    });
  });
}

function saveAutomation() {
  const name = document.getElementById("flow-name-input").value;
  const flow = window.flowEditor.editor.export();

  showNotification("Guardando automatización...", "info");

  fetch("/autoflow/backend/api/guardar.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, flow }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        showNotification("✅ " + data.message, "success");
        playSound("save");
      }
    })
    .catch((err) => {
      showNotification("❌ Error al guardar", "error");
    });
}

function executeAutomation() {
  showNotification("Ejecutando automatización...", "info");

  fetch("/autoflow/backend/api/ejecutar.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 1 }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        showNotification("✅ Ejecución completada", "success");
        playSound("execute");
        // Mostrar logs en el panel
        updateLogs(data.output.logs);
      }
    })
    .catch((err) => {
      showNotification("❌ Error en ejecución", "error");
    });
}

function newAutomation() {
  if (
    confirm(
      "¿Crear nueva automatización? Se perderán los cambios no guardados.",
    )
  ) {
    window.flowEditor.editor.clear();
    document.getElementById("flow-name-input").value = "Nueva automatización";
    document.getElementById("node-count").textContent = "0 nodos";
    document.getElementById("connection-count").textContent = "0 conexiones";
  }
}

function cloneAutomation() {
  showNotification("Automatización clonada", "success");
}

function loadAutomations() {
  fetch("/autoflow/backend/api/guardar.php")
    .then((res) => res.json())
    .then((data) => {
      if (data.automations && data.automations.length > 0) {
        const last = data.automations[data.automations.length - 1];
        if (last.flow) {
          window.flowEditor.editor.import(last.flow);
          document.getElementById("flow-name-input").value = last.name;
        }
      }
    });
}

function loadLogs() {
  fetch("/autoflow/backend/api/logs.php")
    .then((res) => res.json())
    .then((logs) => {
      const logList = document.getElementById("log-list");
      logList.innerHTML = logs
        .map(
          (log) => `
            <div class="log-item ${log.status}">
                <div class="log-time">${log.executed_at}</div>
                <div class="log-message">${log.message}</div>
            </div>
        `,
        )
        .join("");
    });
}

function loadStats() {
  fetch("/autoflow/backend/api/estadisticas.php")
    .then((res) => res.json())
    .then((stats) => {
      document.getElementById("stats-numbers").innerHTML = `
            <div class="stat-item">
                <span class="stat-label">Ejecuciones</span>
                <span class="stat-value">${stats.total_executions}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Éxito</span>
                <span class="stat-value">${stats.success_rate}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Tiempo medio</span>
                <span class="stat-value">${stats.avg_execution_time}</span>
            </div>
        `;

      const ctx = document.getElementById("stats-chart").getContext("2d");
      new Chart(ctx, {
        type: "line",
        data: {
          labels: stats.daily_stats.labels,
          datasets: [
            {
              label: "Ejecuciones diarias",
              data: stats.daily_stats.data,
              borderColor: "#007acc",
              backgroundColor: "rgba(0, 122, 204, 0.1)",
              tension: 0.4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
        },
      });
    });
}

function updateLogs(logs) {
  const logList = document.getElementById("log-list");
  logs.forEach((log) => {
    const logEl = document.createElement("div");
    logEl.className = "log-item success";
    logEl.innerHTML = `
            <div class="log-time">${log.time}</div>
            <div class="log-message">${log.message}</div>
        `;
    logList.prepend(logEl);
  });
}

function showNotification(message, type = "info") {
  const container = document.getElementById("notification-container");
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;

  const icon = {
    success: "fa-check-circle",
    error: "fa-exclamation-circle",
    info: "fa-info-circle",
  }[type];

  notification.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;

  container.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function playSound(type) {
  // Implementar si quieres sonidos
  console.log("🔊 Sonido:", type);
}
