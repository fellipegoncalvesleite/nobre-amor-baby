/**
 * CropModal — lightweight 1:1 square crop with drag-to-reposition & zoom slider.
 *
 * No heavy dependencies — uses plain canvas for the crop output.
 *
 * Props:
 *   imageSrc    (string)   — data URL or blob URL of the source image
 *   onCrop      (fn)       — onCrop(croppedDataUrl) called on confirm
 *   onCancel    (fn)       — called when user cancels
 *   outputSize  (number)   — square output side in px (default 1024)
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { FiCheck, FiX, FiZoomIn, FiZoomOut } from 'react-icons/fi';
import { focusRing } from '../../lib/ui';

const DEFAULT_OUTPUT = 1024;

export default function CropModal({
  imageSrc,
  onCrop,
  onCancel,
  outputSize = DEFAULT_OUTPUT,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  /* ── image state ──────────────────────────────── */
  const imgRef = useRef(null);
  const [imgReady, setImgReady] = useState(false);
  const [naturalW, setNaturalW] = useState(0);
  const [naturalH, setNaturalH] = useState(0);

  /* ── transform state ──────────────────────────── */
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // px from center

  /* ── drag state ───────────────────────────────── */
  const dragRef = useRef({ active: false, startX: 0, startY: 0, origOx: 0, origOy: 0 });

  /* ── viewport size (square) ───────────────────── */
  const VIEWPORT = 300; // CSS px
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  /* ── Load source image ────────────────────────── */
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNaturalW(img.naturalWidth);
      setNaturalH(img.naturalHeight);
      setImgReady(true);
      /* auto-zoom so smallest side fills viewport */
      const minSide = Math.min(img.naturalWidth, img.naturalHeight);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      /* if image is not square, start zoom so it fits better */
      if (minSide > 0) {
        setZoom(1); // start at fit, user can zoom in
      }
    };
    img.onerror = () => {
      console.error('[CropModal] failed to load image');
    };
    img.src = imageSrc;
  }, [imageSrc]);

  /* ── Draw preview on canvas ───────────────────── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgReady) return;

    const ctx = canvas.getContext('2d');
    const cW = VIEWPORT * dpr;
    const cH = VIEWPORT * dpr;
    canvas.width = cW;
    canvas.height = cH;

    ctx.clearRect(0, 0, cW, cH);

    // compute the "fit" scale so smallest side fills the viewport
    const fitScale = VIEWPORT / Math.min(naturalW, naturalH);
    const scale = fitScale * zoom;

    const drawW = naturalW * scale * dpr;
    const drawH = naturalH * scale * dpr;

    // center + offset
    const dx = (cW - drawW) / 2 + offset.x * dpr;
    const dy = (cH - drawH) / 2 + offset.y * dpr;

    ctx.drawImage(img, dx, dy, drawW, drawH);
  }, [imgReady, naturalW, naturalH, zoom, offset, dpr, VIEWPORT]);

  useEffect(() => {
    draw();
  }, [draw]);

  /* ── Pointer drag ─────────────────────────────── */
  const onPointerDown = (e) => {
    e.preventDefault();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origOx: offset.x,
      origOy: offset.y,
    };
    containerRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({
      x: dragRef.current.origOx + dx,
      y: dragRef.current.origOy + dy,
    });
  };

  const onPointerUp = () => {
    dragRef.current.active = false;
  };

  /* ── Touch zoom (pinch) ───────────────────────── */
  const lastDist = useRef(null);
  const onTouchMove = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastDist.current != null) {
        const delta = dist - lastDist.current;
        setZoom((z) => Math.max(0.5, Math.min(4, z + delta * 0.005)));
      }
      lastDist.current = dist;
    }
  };
  const onTouchEnd = () => {
    lastDist.current = null;
  };

  /* ── Produce cropped output ───────────────────── */
  const handleCrop = () => {
    const img = imgRef.current;
    if (!img) return;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outputSize;
    outCanvas.height = outputSize;
    const ctx = outCanvas.getContext('2d');

    // Same math as preview but map to outputSize
    const fitScale = VIEWPORT / Math.min(naturalW, naturalH);
    const scale = fitScale * zoom;

    // ratio from viewport to output
    const outRatio = outputSize / VIEWPORT;

    const drawW = naturalW * scale * outRatio;
    const drawH = naturalH * scale * outRatio;

    const dx = (outputSize - drawW) / 2 + offset.x * outRatio;
    const dy = (outputSize - drawH) / 2 + offset.y * outRatio;

    // white background for safety
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, outputSize, outputSize);
    ctx.drawImage(img, dx, dy, drawW, drawH);

    const dataUrl = outCanvas.toDataURL('image/jpeg', 0.88);
    if (!dataUrl || dataUrl === 'data:,') {
      console.error('[CropModal] canvas produced empty blob — fallback');
      onCancel?.();
      return;
    }
    onCrop(dataUrl);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-2xl shadow-xl p-5 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-lg text-baby-text mb-1">Recortar imagem</h3>
        <p className="font-sans text-xs text-baby-text/50 mb-3">
          A imagem será cortada em formato quadrado (1:1). Arraste para reposicionar, use o slider para zoom.
        </p>

        {/* Preview canvas */}
        <div
          ref={containerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="relative mx-auto rounded-xl overflow-hidden border-2 border-baby-pink cursor-grab active:cursor-grabbing select-none touch-none"
          style={{ width: VIEWPORT, height: VIEWPORT }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: VIEWPORT, height: VIEWPORT }}
            className="block"
          />
          {/* grid overlay */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="w-full h-full grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/20" />
              ))}
            </div>
          </div>
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-2 mt-3">
          <FiZoomOut size={14} className="text-baby-text/40 shrink-0" />
          <input
            type="range"
            min="0.5"
            max="4"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-baby-accent"
            aria-label="Zoom"
          />
          <FiZoomIn size={14} className="text-baby-text/40 shrink-0" />
          <span className="font-sans text-xs text-baby-text/40 w-10 text-right">{Math.round(zoom * 100)}%</span>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 mt-4 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm
                       border border-baby-text/15 text-baby-text/60 hover:text-baby-accent
                       hover:border-baby-accent transition-colors ${focusRing}`}
          >
            <FiX size={14} />
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCrop}
            disabled={!imgReady}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm font-medium
                       bg-baby-accent text-white hover:bg-baby-accent/80 transition-colors
                       disabled:opacity-40 ${focusRing}`}
          >
            <FiCheck size={14} />
            Aplicar recorte
          </button>
        </div>
      </div>
    </div>
  );
}
