import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/ui/Button.jsx';
import { Spinner } from '@/ui/Spinner.jsx';
import { Card } from '@/ui/Card.jsx';
import { useNotification } from '@/ui/useNotification.js';
import { EmptyState } from '@/features/dashboard/EmptyState.jsx';
import { listMaps, saveMap, deleteMap } from '../services/mapsService.js';
import { MapCard } from '../components/MapCard.jsx';
import { DeleteMapDialog } from '../components/DeleteMapDialog.jsx';

/**
 * Listado de mapas del usuario autenticado.
 *
 * Estados:
 *   loading → spinner.
 *   error   → mensaje + reintentar.
 *   empty   → EmptyState con CTA "Crea tu primer mapa".
 *   ok      → grid responsive de MapCard.
 *
 * Acciones:
 *   - "+ Nuevo mapa": POST maps/save con título por defecto, redirige
 *     al editor /mapas/:id (página real en M3, placeholder hasta entonces).
 *   - "Eliminar" en una tarjeta: abre DeleteMapDialog y, al confirmar,
 *     borra y refresca la lista.
 *
 * Cumple RA2 0615 (Grid Layout) con grid-cols-1 sm:grid-cols-2 lg:grid-cols-3.
 */
export function MapsListPage() {
  const navigate = useNavigate();
  const { notify } = useNotification();

  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ok'
  const [maps, setMaps] = useState([]);
  const [creating, setCreating] = useState(false);

  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Carga inicial ────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await listMaps();
      if (!res.success) {
        setStatus('error');
        notify(res.message || 'No se pudieron cargar los mapas.', 'error');
        return;
      }
      setMaps(Array.isArray(res.data) ? res.data : []);
      setStatus('ok');
    } catch {
      setStatus('error');
      notify('Error de red al cargar los mapas.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Crear mapa nuevo ─────────────────────────────────────────────
  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await saveMap({ title: 'Mapa sin título' });
      if (!res.success) {
        notify(res.message || 'No se pudo crear el mapa.', 'error');
        return;
      }
      notify('Mapa creado.', 'success');
      const newId = res.data?.id;
      if (newId) navigate(`/mapas/${newId}`);
      else refresh();
    } catch {
      notify('Error de red al crear el mapa.', 'error');
    } finally {
      setCreating(false);
    }
  };

  // ── Borrar mapa ──────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteMap(pendingDelete.id);
      if (!res.success) {
        notify(res.message || 'No se pudo eliminar el mapa.', 'error');
        return;
      }
      notify('Mapa eliminado.', 'success');
      setPendingDelete(null);
      // Optimismo local: quitamos el mapa de la lista sin recargar.
      setMaps((prev) => prev.filter((m) => m.id !== pendingDelete.id));
    } catch {
      notify('Error de red al eliminar el mapa.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Cabecera */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-ink">Mis mapas</h1>
          <p className="text-ink-muted text-sm mt-1">
            Crea, abre y organiza tus mapas conceptuales.
          </p>
        </div>
        <Button onClick={handleCreate} isLoading={creating} size="lg">
          <i className="fas fa-plus" aria-hidden="true" />
          Nuevo mapa
        </Button>
      </header>

      {/* Estados */}
      {status === 'loading' && (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      )}

      {status === 'error' && (
        <Card padded className="text-center">
          <i className="fas fa-cloud-bolt text-3xl text-coral-500" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">No pudimos cargar tus mapas</p>
          <p className="text-sm text-ink-muted mt-1">Comprueba tu conexión y vuelve a intentarlo.</p>
          <div className="mt-5">
            <Button variant="ghost" onClick={refresh}>
              <i className="fas fa-rotate-right" aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        </Card>
      )}

      {status === 'ok' && maps.length === 0 && (
        <Card padded>
          <EmptyState
            icon="fa-diagram-project"
            title="Aún no tienes mapas"
            message="Crea tu primer mapa conceptual y empieza a organizar lo que estás estudiando."
          />
          <div className="text-center -mt-4">
            <Button onClick={handleCreate} isLoading={creating}>
              <i className="fas fa-plus" aria-hidden="true" />
              Crea tu primer mapa
            </Button>
          </div>
        </Card>
      )}

      {status === 'ok' && maps.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {maps.map((m) => (
            <MapCard key={m.id} map={m} onDelete={setPendingDelete} />
          ))}
        </div>
      )}

      <DeleteMapDialog
        open={pendingDelete !== null}
        mapTitle={pendingDelete?.title}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => (isDeleting ? null : setPendingDelete(null))}
      />
    </div>
  );
}
