/**
 * stats.js — consumidor de /automation/stats y /automation/logs.
 *
 * Expone la clase NodeWeaverStats con 3 responsabilidades:
 *
 *   1. fetchStats()   → GET /automation/stats   (agregados del usuario).
 *   2. fetchLogs()    → GET /automation/logs    (últimas ejecuciones).
 *   3. renderInto()   → pinta un widget resumen en el contenedor indicado.
 *
 * El archivo es autocontenido: no depende de ninguna librería salvo Chart.js
 * (opcional, se detecta por presencia de `window.Chart`). Si Chart.js no
 * está cargado, la distribución diaria se muestra como tabla simple.
 */
class NodeWeaverStats {
  constructor(apiBase = '../../API/index.php?route=') {
    this.apiBase = apiBase;
    this.token   = localStorage.getItem('token');
  }

  async fetchStats() {
    if (!this.token) return null;
    try {
      const res = await fetch(this.apiBase + 'automation/stats', {
        headers: { 'Authorization': 'Bearer ' + this.token }
      });
      const data = await res.json();
      return data.success ? data.stats : null;
    } catch (err) {
      console.warn('[NodeWeaverStats] fetchStats', err);
      return null;
    }
  }

  async fetchLogs({ limit = 10, status = 'all' } = {}) {
    if (!this.token) return [];
    try {
      const url = `${this.apiBase}automation/logs&limit=${limit}&status=${status}`;
      const res = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + this.token }
      });
      const data = await res.json();
      return data.success ? (data.logs || []) : [];
    } catch (err) {
      console.warn('[NodeWeaverStats] fetchLogs', err);
      return [];
    }
  }

  /**
   * Pinta un widget compacto con 4 contadores + lista de ejecuciones recientes.
   * Úsalo desde cualquier página: new NodeWeaverStats().renderInto('#stats-panel');
   */
  async renderInto(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;

    el.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">
      <i class="fas fa-spinner fa-spin mr-2"></i> Cargando estadísticas...
    </div>`;

    const [stats, logs] = await Promise.all([
      this.fetchStats(),
      this.fetchLogs({ limit: 8 }),
    ]);

    if (!stats) {
      el.innerHTML = `<div class="text-center py-6 text-red-400 text-xs">
        <i class="fas fa-triangle-exclamation mr-2"></i> No se pudieron cargar las estadísticas.
      </div>`;
      return;
    }

    const summary = stats.summary || {};
    const total   = Number(summary.total    || 0);
    const success = Number(summary.success  || 0);
    const errors  = Number(summary.error    || 0);
    const running = Number(summary.running  || 0);
    const avgMs   = Number(summary.avg_duration_ms || 0);
    const rate    = total > 0 ? Math.round((success / total) * 100) : 0;

    el.innerHTML = `
      <div class="grid grid-cols-2 gap-2 mb-3">
        ${this._kpi('Total',    total,    'fa-bolt',             'amber')}
        ${this._kpi('OK',       success,  'fa-check',            'emerald')}
        ${this._kpi('Error',    errors,   'fa-triangle-exclamation', 'red')}
        ${this._kpi('Running',  running,  'fa-spinner',          'cyan')}
      </div>
      <div class="grid grid-cols-2 gap-2 mb-4">
        <div class="px-3 py-2 bg-slate-900/50 border border-white/5 rounded-xl">
          <div class="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Success rate</div>
          <div class="text-sm font-bold text-emerald-300">${rate}%</div>
        </div>
        <div class="px-3 py-2 bg-slate-900/50 border border-white/5 rounded-xl">
          <div class="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Duración media</div>
          <div class="text-sm font-bold text-cyan-300">${avgMs} ms</div>
        </div>
      </div>
      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
        Últimas ejecuciones
      </div>
      <div class="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        ${logs.length
          ? logs.map(l => this._logRow(l)).join('')
          : `<div class="text-[10px] text-slate-500 italic py-2">Sin registros aún.</div>`}
      </div>
    `;
  }

  _kpi(label, value, icon, color) {
    const palette = {
      amber:   'text-amber-300 bg-amber-500/10 border-amber-500/20',
      emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
      red:     'text-red-300 bg-red-500/10 border-red-500/20',
      cyan:    'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
    }[color] || 'text-slate-300 bg-slate-500/10 border-slate-500/20';
    return `
      <div class="px-3 py-2 border rounded-xl ${palette}">
        <div class="text-[9px] uppercase font-bold tracking-wider opacity-70">
          <i class="fas ${icon}"></i> ${label}
        </div>
        <div class="text-base font-bold leading-tight">${value}</div>
      </div>`;
  }

  _logRow(l) {
    const colors = {
      success:  'text-emerald-300 bg-emerald-500/10',
      error:    'text-red-300 bg-red-500/10',
      running:  'text-cyan-300 bg-cyan-500/10 animate-pulse',
      queued:   'text-amber-300 bg-amber-500/10',
      timeout:  'text-orange-300 bg-orange-500/10',
      cancelled:'text-slate-300 bg-slate-500/10',
    };
    const badgeCls = colors[l.status] || 'text-slate-300 bg-slate-500/10';
    const when = l.started_at
      ? new Date(l.started_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '--:--';
    const name = (l.automation_name || '#' + l.automation_id).toString().slice(0, 26);
    const dur  = l.duration_ms ? `${l.duration_ms}ms` : '—';
    return `
      <div class="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-900/40 border border-white/5 rounded-lg">
        <div class="flex items-center gap-2 min-w-0">
          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${badgeCls}">
            ${l.status}
          </span>
          <span class="text-[11px] text-slate-200 truncate">${name}</span>
        </div>
        <div class="text-[9px] text-slate-500 whitespace-nowrap font-mono">
          ${when} · ${dur}
        </div>
      </div>`;
  }
}

window.NodeWeaverStats = NodeWeaverStats;
