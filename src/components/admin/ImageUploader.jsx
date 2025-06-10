/**
 * ImageUploader — reusable image upload component.
 *
 * Props:
 *   label       (string)   — section label
 *   images      (array)    — [{ id, src, alt? }]
 *   onChange    (fn)       — onChange(newImages)
 *   maxImages   (number)   — default 8
 *   aspectHint  (string?)  — optional hint text
 *
 * Features:
 *   - Gallery file picker (multiple)
 *   - Camera capture button (mobile)
 *   - Drag & drop zone (desktop)
 *   - Preview thumbnails with remove + reorder (up/down)
 *   - Client-side resize to max 1600px, JPEG quality 0.8
 *   - Validates: max 6MB per file, max count
 *   - A11y: aria-labels, keyboard focus
 *   - Supports upload mode: if onUpload prop provided, uploads each file
 *     and replaces local preview src with returned URL
 *
 * TODO: Swap ImageUploader storage to Supabase Storage later (upload then store public URL)
 */
import { useState, useRef, useCallback } from 'react';
import { FiUpload, FiCamera, FiX, FiChevronUp, FiChevronDown, FiLoader, FiCrop } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { focusRing } from '../../lib/ui';
import CropModal from './CropModal';

const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

/** Resize image to max dimension using canvas, output as data URL */
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function ImageUploader({
  label = 'Imagens',
  images = [],
  onChange,
  maxImages = 8,
  aspectHint,
  onUpload, // async (file) => url | null — if provided, uploads to server
}) {
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState({}); // id -> true/false

  /* ── Crop state ─────────────────────────────── */
  const [cropSrc, setCropSrc] = useState(null);       // current image being cropped
  const cropCallbackRef = useRef(null);               // resolve fn for current crop

  /**
   * Opens CropModal for a single image. Returns a promise that resolves with the
   * cropped dataUrl (or null if cancelled).
   */
  const cropImage = useCallback((dataUrl) => {
    return new Promise((resolve) => {
      cropCallbackRef.current = resolve;
      setCropSrc(dataUrl);
    });
  }, []);

  const handleCropDone = useCallback((croppedDataUrl) => {
    cropCallbackRef.current?.(croppedDataUrl);
    cropCallbackRef.current = null;
    setCropSrc(null);
  }, []);

  const handleCropCancel = useCallback(() => {
    cropCallbackRef.current?.(null);
    cropCallbackRef.current = null;
    setCropSrc(null);
  }, []);

  const processFiles = useCallback(async (files) => {
    const fileList = Array.from(files);
    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      toast.error(`Máximo de ${maxImages} imagens atingido.`, { style: toastStyle });
      return;
    }

    const toProcess = fileList.slice(0, remaining);
    if (fileList.length > remaining) {
      toast(`Apenas ${remaining} imagem(ns) adicionada(s) (limite: ${maxImages}).`, { style: toastStyle });
    }

    const newImages = [];
    for (const file of toProcess) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`"${file.name}" excede 6MB. Escolha uma imagem menor.`, { style: toastStyle });
        continue;
      }
      if (!file.type.startsWith('image/')) {
        toast.error(`"${file.name}" não é uma imagem válida.`, { style: toastStyle });
        continue;
      }
      try {
        const rawDataUrl = await resizeImage(file);
        // Open 1:1 crop modal
        const croppedDataUrl = await cropImage(rawDataUrl);
        if (!croppedDataUrl) {
          // User cancelled the crop — skip this image
          continue;
        }
        const id = generateId();
        newImages.push({ id, src: croppedDataUrl, alt: file.name, _file: file, _uploading: !!onUpload });
      } catch {
        toast.error(`Erro ao processar "${file.name}".`, { style: toastStyle });
      }
    }

    if (newImages.length === 0) return;

    const merged = [...images, ...newImages];
    onChange(merged);

    // If onUpload is provided, upload each new image
    if (onUpload) {
      for (const img of newImages) {
        setUploading((prev) => ({ ...prev, [img.id]: true }));
        try {
          const url = await onUpload(img._file);
          if (url) {
            // Replace src with uploaded URL
            onChange((prev) =>
              prev.map((p) => (p.id === img.id ? { ...p, src: url, _uploading: false, _file: undefined } : p)),
            );
          }
        } catch (err) {
          toast.error(`Falha ao enviar "${img.alt}": ${err.message}`, { style: toastStyle });
        } finally {
          setUploading((prev) => ({ ...prev, [img.id]: false }));
        }
      }
    }
  }, [images, maxImages, onChange, onUpload, cropImage]);

  const handleGalleryChange = (e) => {
    if (e.target.files?.length) processFiles(e.target.files);
    e.target.value = '';
  };

  const handleCameraChange = (e) => {
    if (e.target.files?.length) processFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const removeImage = (id) => {
    onChange(images.filter((img) => img.id !== id));
  };

  const moveUp = (index) => {
    if (index === 0) return;
    const arr = [...images];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    onChange(arr);
  };

  const moveDown = (index) => {
    if (index >= images.length - 1) return;
    const arr = [...images];
    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    onChange(arr);
  };

  const atLimit = images.length >= maxImages;

  return (
    <div className="space-y-3">
      {/* Label */}
      <label className="font-sans text-sm font-medium text-baby-text block">{label}</label>
      {aspectHint && (
        <p className="font-sans text-xs text-baby-text/50">{aspectHint}</p>
      )}
      <p className="font-sans text-xs text-baby-text/40 flex items-center gap-1">
        <FiCrop size={11} className="shrink-0" />
        A imagem será cortada em formato quadrado (1:1).
      </p>

      {/* Drop zone */}
      {!atLimit && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors
                     ${dragOver
                       ? 'border-baby-accent bg-baby-pink/30'
                       : 'border-baby-pink hover:border-baby-accent/60 bg-surface'
                     }`}
        >
          <FiUpload className="mx-auto mb-2 text-baby-accent/60" size={28} />
          <p className="font-sans text-sm text-baby-text/50 mb-3">
            Arraste imagens aqui ou use os botões abaixo
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {/* Gallery button */}
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm
                         font-medium bg-baby-pink hover:bg-baby-pink-dark text-baby-text
                         transition-colors ${focusRing}`}
              aria-label="Escolher imagens da galeria"
            >
              <FiUpload size={14} />
              Escolher da galeria
            </button>

            {/* Camera button */}
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm
                         font-medium bg-baby-pink hover:bg-baby-pink-dark text-baby-text
                         transition-colors ${focusRing}`}
              aria-label="Tirar foto com a câmera"
            >
              <FiCamera size={14} />
              Tirar foto
            </button>
          </div>

          {/* Hidden inputs */}
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleGalleryChange}
            className="hidden"
            aria-hidden="true"
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraChange}
            className="hidden"
            aria-hidden="true"
          />
        </div>
      )}

      {atLimit && (
        <p className="font-sans text-xs text-amber-600 dark:text-amber-400">
          Limite de {maxImages} imagem(ns) atingido.
        </p>
      )}

      {/* Thumbnails grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {images.map((img, index) => {
            const isUploading = uploading[img.id] || img._uploading;
            return (
              <div
                key={img.id}
                className="relative group rounded-xl overflow-hidden border border-baby-pink
                           bg-surface shadow-sm aspect-square"
              >
                <img
                  src={img.src}
                  alt={img.alt || `Imagem ${index + 1}`}
                  className={`w-full h-full object-cover ${isUploading ? 'opacity-50' : ''}`}
                />

                {/* Uploading overlay */}
                {isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <FiLoader className="animate-spin text-white" size={20} />
                    <span className="sr-only">Enviando…</span>
                  </div>
                )}

                {/* Cover badge */}
                {index === 0 && (
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-baby-accent/90 text-white
                                   rounded text-[10px] font-sans font-bold uppercase">
                    Capa
                  </span>
                )}

                {/* Action buttons */}
                <div className="absolute top-1 right-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100
                               transition-opacity">
                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className={`w-6 h-6 flex items-center justify-center rounded-full
                               bg-red-500 text-white hover:bg-red-600 transition-colors ${focusRing}`}
                    aria-label={`Remover imagem ${index + 1}`}
                  >
                    <FiX size={12} />
                  </button>

                  {/* Move up */}
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => moveUp(index)}
                      className={`w-6 h-6 flex items-center justify-center rounded-full
                                 bg-surface/90 text-baby-text hover:bg-baby-pink transition-colors ${focusRing}`}
                      aria-label={`Mover imagem ${index + 1} para cima`}
                    >
                      <FiChevronUp size={12} />
                    </button>
                  )}

                  {/* Move down */}
                  {index < images.length - 1 && (
                    <button
                      type="button"
                      onClick={() => moveDown(index)}
                      className={`w-6 h-6 flex items-center justify-center rounded-full
                                 bg-surface/90 text-baby-text hover:bg-baby-pink transition-colors ${focusRing}`}
                      aria-label={`Mover imagem ${index + 1} para baixo`}
                    >
                      <FiChevronDown size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Count */}
      <p className="font-sans text-xs text-baby-text/40">
        {images.length} / {maxImages} imagem(ns)
      </p>

      {/* Crop Modal */}
      {cropSrc && (
        <CropModal
          imageSrc={cropSrc}
          onCrop={handleCropDone}
          onCancel={handleCropCancel}
          outputSize={1024}
        />
      )}
    </div>
  );
}
