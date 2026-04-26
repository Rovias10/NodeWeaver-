import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Spinner } from '@/ui/Spinner.jsx';
import { Card } from '@/ui/Card.jsx';
import { Button } from '@/ui/Button.jsx';
import { useNotification } from '@/ui/useNotification.js';
import { listDue, reviewFlashcard } from '../services/flashcardsService.js';
import { FlippableCard } from '../components/FlippableCard.jsx';
import { GradeButtons } from '../components/GradeButtons.jsx';
import { ReviewSummary } from '../components/ReviewSummary.jsx';
import { useReviewKeybindings } from '../hooks/useReviewKeybindings.js';

/**
 * Página de la sesión de repaso SM-2 (`/flashcards/repaso`).
 *
 * Flujo:
 *   1. Mount → listDue() → llena la cola.
 *   2. Cola vacía          → status='empty', muestra ReviewSummary
 *                            kind="empty" con CTA "Volver".
 *   3. Hay cola            → status='reviewing', muestra FlippableCard
 *                            con queue[0] + GradeButtons (deshabilitados
 *                            hasta revelar).
 *   4. Pulsar grade        → optimismo: saca la tarjeta de la cola y
 *                            avanza; en paralelo lanza reviewFlashcard.
 *                            Si la API falla, devuelve la tarjeta al
 *                            frente, deshace la stat y avisa con toast.
 *   5. Cola vaciada        → status='done', muestra ReviewSummary
 *                            kind="done" con stats locales.
 *
 * Atajos: 1=fail, 2=good, 3=easy, espacio=mostrar respuesta. Activos
 * sólo en status='reviewing' y bloqueados cuando el foco está en un
 * input/textarea (mismo patrón que useEditorKeybindings).
 */
export function ReviewSessionPage() {
  const navigate = useNavigate();
  const { notify } = useNotification();

  // 'loading' → spinner
  // 'error'   → mensaje + volver
  // 'empty'   → no había nada que repasar
  // 'reviewing' → tarjeta + grados
  // 'done'    → summary final
  const [status, setStatus] = useState('loading');
  const [queue, setQueue] = useState([]);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ total: 0, fail: 0, good: 0, easy: 0 });

  // ── Carga inicial ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listDue();
        if (cancelled) return;
        if (!res.success) {
          setStatus('error');
          notify(res.message || 'No se pudieron cargar las tarjetas.', 'error');
          return;
        }
        const cards = Array.isArray(res.data) ? res.data : [];
        if (cards.length === 0) {
          setStatus('empty');
          return;
        }
        setQueue(cards);
        setStatus('reviewing');
      } catch {
        if (!cancelled) {
          setStatus('error');
          notify('Error de red al cargar las tarjetas.', 'error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [notify]);

  const handleReveal = useCallback(() => {
    setRevealed(true);
  }, []);

  // ── Aplicar grado (optimista) ────────────────────────────────────
  // Optimismo: sacamos la tarjeta de la cola, sumamos stat y avanzamos
  // sin esperar a la API. Si reviewFlashcard falla, devolvemos la
  // tarjeta al frente, restamos la stat y avisamos por toast.
  const handleGrade = useCallback(async (grade) => {
    const current = queue[0];
    if (!current) return;

    const remaining = queue.slice(1);
    setQueue(remaining);
    setRevealed(false);
    setStats((s) => ({
      total: s.total + 1,
      fail:  s.fail  + (grade === 'fail' ? 1 : 0),
      good:  s.good  + (grade === 'good' ? 1 : 0),
      easy:  s.easy  + (grade === 'easy' ? 1 : 0),
    }));
    if (remaining.length === 0) setStatus('done');

    try {
      const res = await reviewFlashcard(current.id, grade);
      if (!res.success) {
        throw new Error(res.message || 'No se pudo registrar el repaso.');
      }
    } catch (err) {
      // Rollback: devolvemos la tarjeta al frente, deshacemos la stat
      // y, si habíamos cerrado la sesión con 'done', volvemos a
      // 'reviewing' para que el usuario pueda reintentarla.
      notify(
        err?.message || 'Error de red al registrar el repaso. Vuelve a intentarlo.',
        'error',
      );
      setQueue((q) => [current, ...q]);
      setStats((s) => ({
        total: s.total - 1,
        fail:  s.fail  - (grade === 'fail' ? 1 : 0),
        good:  s.good  - (grade === 'good' ? 1 : 0),
        easy:  s.easy  - (grade === 'easy' ? 1 : 0),
      }));
      setStatus((s) => (s === 'done' ? 'reviewing' : s));
    }
  }, [queue, notify]);

  // Atajos: sólo activos durante el repaso (no en loading/done/empty).
  useReviewKeybindings({
    enabled:  status === 'reviewing',
    revealed,
    onReveal: handleReveal,
    onGrade:  handleGrade,
  });

  const goToList = () => navigate('/flashcards');

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto">
      <header className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-ink">Sesión de repaso</h1>
          {status === 'reviewing' && (
            <p className="text-ink-muted text-sm mt-1">
              Quedan <strong className="text-ink">{queue.length}</strong>
              {' · '}
              Repasadas <strong className="text-ink">{stats.total}</strong>
            </p>
          )}
        </div>
        <Button variant="ghost" onClick={goToList} title="Salir de la sesión">
          <i className="fas fa-xmark" aria-hidden="true" />
          <span className="hidden sm:inline">Salir</span>
        </Button>
      </header>

      {status === 'loading' && (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      )}

      {status === 'error' && (
        <Card padded className="text-center max-w-lg mx-auto">
          <i className="fas fa-cloud-bolt text-3xl text-coral-500" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">No pudimos cargar las tarjetas</p>
          <p className="text-sm text-ink-muted mt-1">
            Comprueba tu conexión y vuelve a intentarlo.
          </p>
          <div className="mt-5">
            <Button variant="ghost" onClick={goToList}>
              <i className="fas fa-arrow-left" aria-hidden="true" />
              Volver al listado
            </Button>
          </div>
        </Card>
      )}

      {status === 'empty' && <ReviewSummary kind="empty" onBack={goToList} />}

      {status === 'done' && <ReviewSummary kind="done" stats={stats} onBack={goToList} />}

      {status === 'reviewing' && queue.length > 0 && (
        <div className="flex flex-col gap-6">
          <FlippableCard
            card={queue[0]}
            revealed={revealed}
            onReveal={handleReveal}
          />
          <GradeButtons disabled={!revealed} onGrade={handleGrade} />
        </div>
      )}
    </div>
  );
}
