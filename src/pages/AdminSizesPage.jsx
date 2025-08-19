/**
 * AdminSizesPage — manage size groups + preset size chips.
 *
 * Rendered as the "Tamanhos" tab of AdminCatalogPage. Persists to
 * catalog_settings via /api/admin?resource=catalog-settings. The storefront
 * filters and the product form read the same values from CatalogContext.
 */
import { useEffect, useState } from 'react';
import { FiPlus, FiX, FiSave, FiTag, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { focusRing, btnPrimary, btnSecondary } from '../lib/ui';
import { useCatalog } from '../context/CatalogContext';
import { updateCatalogSettings } from '../lib/adminApi';
import { slugifySizeGroup } from '../utils/sizes';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

const inputClass = `w-full rounded-xl border border-baby-text/15 dark:border-gray-600
  bg-baby-cream dark:bg-gray-800 px-3 py-2 font-sans text-sm text-baby-text dark:text-gray-100
  placeholder-baby-text/40 dark:placeholder-gray-500 ${focusRing}`;

export default function AdminSizesPage() {
  const { sizeGroups, sizePresets, refresh } = useCatalog();

  const [groups, setGroups] = useState(() => sizeGroups.map((g) => ({ ...g })));
  const [presets, setPresets] = useState(() => ({ ...sizePresets }));
  const [selected, setSelected] = useState(() => sizeGroups[0]?.value || '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [newSize, setNewSize] = useState('');

  /* Re-sync from context until the manager starts editing. */
  useEffect(() => {
    if (dirty) return;
    setGroups(sizeGroups.map((g) => ({ ...g })));
    setPresets({ ...sizePresets });
    setSelected((s) => (sizeGroups.some((g) => g.value === s) ? s : sizeGroups[0]?.value || ''));
  }, [sizeGroups, sizePresets, dirty]);

  const markDirty = () => setDirty(true);

  const addGroup = () => {
    const label = newGroupLabel.trim();
    if (!label) return;
    const value = slugifySizeGroup(label) || `grupo-${groups.length + 1}`;
    if (groups.some((g) => g.value === value)) {
      toast.error('Já existe um tipo com esse nome.', { style: toastStyle });
      return;
    }
    setGroups((prev) => [...prev, { value, label }]);
    setPresets((prev) => ({ ...prev, [value]: prev[value] || [] }));
    setSelected(value);
    setNewGroupLabel('');
    markDirty();
  };

  const renameGroup = (value, label) => {
    setGroups((prev) => prev.map((g) => (g.value === value ? { ...g, label } : g)));
    markDirty();
  };

  const removeGroup = (value) => {
    setGroups((prev) => prev.filter((g) => g.value !== value));
    setPresets((prev) => {
      const next = { ...prev };
      delete next[value];
      return next;
    });
    setSelected((s) => (s === value ? groups.find((g) => g.value !== value)?.value || '' : s));
    markDirty();
  };

  const addSize = () => {
    const val = newSize.trim();
    if (!val || !selected) return;
    setPresets((prev) => {
      const list = prev[selected] || [];
      if (list.includes(val)) return prev;
      return { ...prev, [selected]: [...list, val] };
    });
    setNewSize('');
    markDirty();
  };

  const removeSize = (size) => {
    setPresets((prev) => ({
      ...prev,
      [selected]: (prev[selected] || []).filter((s) => s !== size),
    }));
    markDirty();
  };

  const handleSave = async () => {
    if (groups.length === 0) {
      toast.error('Adicione pelo menos um tipo de tamanho.', { style: toastStyle });
      return;
    }
    setSaving(true);
    try {
      await updateCatalogSettings({ sizeGroups: groups, sizePresets: presets });
      setDirty(false);
      await refresh();
      toast.success('Tamanhos salvos!', { style: toastStyle });
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  const selectedPresets = presets[selected] || [];

  return (
    <div className="space-y-6">
      <p className="font-sans text-sm text-baby-text/60 dark:text-gray-400">
        Edite os tipos de tamanho (Roupa, Calçado…) e os tamanhos sugeridos de cada tipo.
        Eles aparecem no formulário de produto e nos filtros da loja.
      </p>

      {/* ── Tipos de tamanho ── */}
      <section className="bg-surface rounded-2xl shadow-soft p-5 space-y-4">
        <h3 className="font-serif text-lg text-baby-text dark:text-gray-100 flex items-center gap-2">
          <FiTag className="text-baby-accent" size={18} /> Tipos de tamanho
        </h3>

        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.value} className="flex items-center gap-2">
              <input
                value={g.label}
                onChange={(e) => renameGroup(g.value, e.target.value)}
                className={inputClass}
              />
              <code className="font-mono text-xs text-baby-text/40 dark:text-gray-500 shrink-0 w-24 truncate" title={g.value}>
                {g.value}
              </code>
              <button
                type="button"
                onClick={() => removeGroup(g.value)}
                className={`p-2 rounded-full text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors ${focusRing}`}
                aria-label={`Remover ${g.label}`}
                title="Remover tipo"
              >
                <FiTrash2 size={15} />
              </button>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="font-sans text-sm text-baby-text/40 dark:text-gray-500">Nenhum tipo cadastrado.</p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <input
            value={newGroupLabel}
            onChange={(e) => setNewGroupLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } }}
            placeholder="Novo tipo (ex: Meias)"
            className={inputClass}
          />
          <button type="button" onClick={addGroup} disabled={!newGroupLabel.trim()}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm font-medium whitespace-nowrap disabled:opacity-30 ${btnSecondary}`}>
            <FiPlus size={15} /> Adicionar
          </button>
        </div>
      </section>

      {/* ── Tamanhos sugeridos do tipo selecionado ── */}
      <section className="bg-surface rounded-2xl shadow-soft p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-serif text-lg text-baby-text dark:text-gray-100">Tamanhos sugeridos</h3>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={`rounded-xl border border-baby-text/15 dark:border-gray-600 bg-baby-cream dark:bg-gray-800 px-3 py-2 font-sans text-sm text-baby-text dark:text-gray-100 ${focusRing}`}
          >
            {groups.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>

        {selected ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {selectedPresets.map((size) => (
                <span key={size}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-sans
                             bg-baby-accent/15 text-baby-accent border border-baby-accent/30">
                  {size}
                  <button type="button" onClick={() => removeSize(size)} className="hover:text-red-500" aria-label={`Remover ${size}`}>
                    <FiX size={12} />
                  </button>
                </span>
              ))}
              {selectedPresets.length === 0 && (
                <p className="font-sans text-sm text-baby-text/40 dark:text-gray-500">Nenhum tamanho sugerido ainda.</p>
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={newSize}
                onChange={(e) => setNewSize(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSize(); } }}
                placeholder="Novo tamanho (ex: PP)"
                className={inputClass}
              />
              <button type="button" onClick={addSize} disabled={!newSize.trim()}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm font-medium whitespace-nowrap disabled:opacity-30 ${btnSecondary}`}>
                <FiPlus size={15} /> Adicionar
              </button>
            </div>
          </>
        ) : (
          <p className="font-sans text-sm text-baby-text/40 dark:text-gray-500">Crie um tipo de tamanho acima primeiro.</p>
        )}
      </section>

      {/* ── Save ── */}
      <div className="flex justify-end">
        <button type="button" onClick={handleSave} disabled={saving || !dirty}
          className={`inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full font-sans text-sm font-medium transition-colors disabled:opacity-40 ${btnPrimary}`}>
          <FiSave size={15} />
          {saving ? 'Salvando…' : 'Salvar tamanhos'}
        </button>
      </div>
    </div>
  );
}
