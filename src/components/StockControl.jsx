/**
 * StockControl — reusable stock count editor with:
 *   • Editable numeric input (click the number to type)
 *   • Hold-to-accelerate on +/– buttons (step ramps up the longer you hold)
 *
 * Props:
 *   value       — current stock count
 *   onChange     — (newValue: number) => void
 *   min          — minimum value (default 0)
 *   max          — maximum value (default 99999)
 *   inputWidth   — Tailwind width class for input (default "w-14")
 *   size         — "sm" | "md" (default "md")
 */
import { useRef, useCallback, useEffect } from 'react';
import { FiMinus, FiPlus } from 'react-icons/fi';
import { focusRing } from '../lib/ui';

/* ── Hold-to-accelerate schedule ─────────────────── */
const INITIAL_DELAY = 400;  // ms before repeat kicks in
const TICK_INTERVAL  = 120; // ms between ticks once repeating

// How long the button has been held → step size
function getStep(elapsed) {
  if (elapsed < 800)  return 1;
  if (elapsed < 1600) return 5;
  if (elapsed < 2800) return 10;
  if (elapsed < 4000) return 25;
  return 50;
}

export default function StockControl({
  value,
  onChange,
  min = 0,
  max = 99999,
  inputWidth = 'w-14',
  size = 'md',
}) {
  const holdRef = useRef(null);

  const clamp = useCallback(
    (v) => Math.max(min, Math.min(max, Math.round(v))),
    [min, max],
  );

  /* ── Single click ─────────────────────────────── */
  const doStep = useCallback(
    (dir) => {
      onChange(clamp(value + dir));
    },
    [value, onChange, clamp],
  );

  /* ── Hold logic ───────────────────────────────── */
  const startHold = useCallback(
    (dir) => {
      // Prevent double-start
      if (holdRef.current) return;

      const startTime = Date.now();
      let latest = value;

      // First: immediate single step (handled by click)
      // After INITIAL_DELAY, start repeating
      const repeatId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const step = getStep(elapsed);
        latest = clamp(latest + dir * step);
        onChange(latest);
      }, TICK_INTERVAL);

      const timeoutId = setTimeout(() => {
        // no-op: repeat already started after INITIAL_DELAY
      }, INITIAL_DELAY);

      holdRef.current = { repeatId, timeoutId, startTime };

      // Delay repeating until INITIAL_DELAY has passed
      clearInterval(repeatId);
      const delayedRepeatId = setTimeout(() => {
        if (!holdRef.current) return;
        const repeatId2 = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const step = getStep(elapsed);
          latest = clamp(latest + dir * step);
          onChange(latest);
        }, TICK_INTERVAL);
        if (holdRef.current) {
          holdRef.current.repeatId = repeatId2;
        } else {
          clearInterval(repeatId2);
        }
      }, INITIAL_DELAY);

      holdRef.current = { repeatId: null, timeoutId: delayedRepeatId, startTime };
    },
    [value, onChange, clamp],
  );

  const stopHold = useCallback(() => {
    if (!holdRef.current) return;
    const { repeatId, timeoutId } = holdRef.current;
    if (repeatId) clearInterval(repeatId);
    if (timeoutId) clearTimeout(timeoutId);
    holdRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopHold(), [stopHold]);

  // Global mouseup / touchend to catch releases outside the button
  useEffect(() => {
    const handler = () => stopHold();
    window.addEventListener('mouseup', handler);
    window.addEventListener('touchend', handler);
    return () => {
      window.removeEventListener('mouseup', handler);
      window.removeEventListener('touchend', handler);
    };
  }, [stopHold]);

  /* ── Input change ─────────────────────────────── */
  const handleInputChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '');
    if (raw === '') {
      onChange(min);
      return;
    }
    onChange(clamp(parseInt(raw, 10)));
  };

  const handleInputBlur = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '');
    if (raw === '' || isNaN(parseInt(raw, 10))) {
      onChange(min);
    }
  };

  /* ── Button event handlers (mouse + touch) ───── */
  const bindHold = (dir) => ({
    onClick: () => doStep(dir),
    onMouseDown: (e) => { e.preventDefault(); startHold(dir); },
    onTouchStart: (e) => { e.preventDefault(); startHold(dir); },
    onMouseUp: stopHold,
    onMouseLeave: stopHold,
    onTouchEnd: stopHold,
  });

  /* ── Sizing ────────────────────────────────────── */
  const btnSize = size === 'sm'
    ? 'p-0.5 min-w-6 min-h-6'
    : 'p-1 min-w-7 min-h-7';
  const iconSize = size === 'sm' ? 11 : 12;
  const inputTextSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className="inline-flex items-center gap-1">
      {/* Minus */}
      <button
        type="button"
        {...bindHold(-1)}
        disabled={value <= min}
        className={`${btnSize} flex items-center justify-center rounded-full
                   hover:bg-baby-pink/30 active:bg-baby-pink/50 transition-colors
                   disabled:opacity-30 disabled:cursor-not-allowed select-none ${focusRing}`}
        aria-label="Diminuir estoque"
      >
        <FiMinus size={iconSize} />
      </button>

      {/* Editable input */}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        className={`${inputWidth} ${inputTextSize} font-mono font-bold text-center
                   bg-transparent border border-transparent rounded-lg
                   hover:border-baby-text/15 focus:border-baby-accent focus:bg-surface
                   focus:outline-none focus:ring-1 focus:ring-baby-accent
                   transition-colors
                   ${value === 0 ? 'text-amber-500' : 'text-baby-text'}`}
        aria-label="Quantidade em estoque"
      />

      {/* Plus */}
      <button
        type="button"
        {...bindHold(1)}
        disabled={value >= max}
        className={`${btnSize} flex items-center justify-center rounded-full
                   hover:bg-baby-pink/30 active:bg-baby-pink/50 transition-colors
                   disabled:opacity-30 disabled:cursor-not-allowed select-none ${focusRing}`}
        aria-label="Aumentar estoque"
      >
        <FiPlus size={iconSize} />
      </button>
    </div>
  );
}
