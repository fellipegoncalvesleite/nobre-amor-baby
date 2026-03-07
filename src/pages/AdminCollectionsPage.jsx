/**
 * AdminCollectionsPage — manage collections with real backend CRUD + image upload.
 *
 * Route: /admin/colecoes-gerenciar  (ProtectedRoute role="manager")
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiGrid, FiPlus, FiRefreshCw, FiEdit2,
  FiTrash2, FiX, FiArrowLeft, FiCheck, FiXCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { focusRing, btnPrimary, btnSecondary } from '../lib/ui';
import {
  listCollections, createCollection, updateCollection, deleteCollection,
  uploadImage,
} from '../lib/adminApi';
import ImageUploader from '../components/admin/ImageUploader';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  isActive: true,
  images: [],
};

export default function AdminCollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const colls = await listCollections();
      setCollections(colls);
    } catch (err) {
      toast.error('Falha ao carregar coleções: ' + err.message, { style: toastStyle });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Modal helpers */
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (coll) => {
    setEditingId(coll.id);
    setForm({
      name: coll.name || '',
      slug: coll.slug || '',
      description: coll.description || '',
      isActive: coll.is_active !== false,
      images: coll.image_url ? [{ id: 'existing_0', src: coll.image_url, alt: coll.name }] : [],
    });
    setModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleImagesChange = (newImages) => {
    setForm((prev) => ({ ...prev, images: newImages }));
  };

  const handleUpload = async (file) => {
    const url = await uploadImage(file, 'collection');
    return url;
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nome é obrigatório.', { style: toastStyle });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        description: form.description.trim(),
        is_active: form.isActive,
        image_url: form.images[0]?.src && !form.images[0].src.startsWith('data:')
          ? form.images[0].src
          : null,
      };

      if (editingId) {
        await updateCollection(editingId, payload);
        toast.success('Coleção atualizada!', { style: toastStyle });
      } else {
        await createCollection(payload);
        toast.success('Coleção criada!', { style: toastStyle });
      }

      setModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (coll) => {
    if (!confirm(`Excluir coleção "${coll.name}"? Produtos associados ficarão sem coleção.`)) return;
    try {
      await deleteCollection(coll.id);
      toast.success('Coleção excluída.', { style: toastStyle });
      fetchData();
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    }
  };

  const handleToggleActive = async (coll) => {
    try {
      await updateCollection(coll.id, { is_active: !coll.is_active });
      toast.success(coll.is_active ? 'Coleção desativada.' : 'Coleção ativada!', { style: toastStyle });
      fetchData();
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    }
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/admin" className="hover:text-baby-accent transition-colors">Painel</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Coleções</li>
          </ol>
        </nav>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-baby-pink/40 rounded-full flex items-center justify-center">
                <FiGrid className="text-baby-accent" size={22} />
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl text-baby-text">Coleções</h1>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={fetchData}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full font-sans text-sm
                           border border-baby-text/15 text-baby-text/60 hover:text-baby-accent
                           hover:border-baby-accent transition-colors ${focusRing}`}>
                <FiRefreshCw size={14} />
                Atualizar
              </button>
              <button type="button" onClick={openCreate}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm font-medium
                           ${btnPrimary}`}>
                <FiPlus size={15} />
                Nova coleção
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-12">
              <FiRefreshCw size={24} className="mx-auto animate-spin text-baby-accent mb-2" />
              <p className="font-sans text-sm text-baby-text/50">Carregando…</p>
            </div>
          )}

          {/* Collections grid */}
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {collections.map((c) => (
                <div key={c.id} className="bg-surface rounded-2xl shadow-soft overflow-hidden">
                  {c.image_url ? (
                    <img src={c.image_url} alt={c.name} className="w-full h-36 object-cover" />
                  ) : (
                    <div className="w-full h-36 bg-baby-pink/20 flex items-center justify-center">
                      <FiGrid size={28} className="text-baby-text/20" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-serif text-base text-baby-text">{c.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                        ${c.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-300'}`}>
                        {c.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    <p className="font-sans text-xs text-baby-text/40 mb-3">{c.slug}</p>
                    {c.description && (
                      <p className="font-sans text-sm text-baby-text/60 mb-3 line-clamp-2">{c.description}</p>
                    )}
                    <div className="flex gap-1 justify-end">
                      <button type="button" onClick={() => handleToggleActive(c)}
                        className={`p-2 rounded-full hover:bg-baby-pink/40 transition-colors ${focusRing}`}
                        aria-label={c.is_active ? 'Desativar' : 'Ativar'} title={c.is_active ? 'Desativar' : 'Ativar'}>
                        {c.is_active ? <FiXCircle size={15} /> : <FiCheck size={15} />}
                      </button>
                      <button type="button" onClick={() => openEdit(c)}
                        className={`p-2 rounded-full hover:bg-baby-pink/40 transition-colors ${focusRing}`}
                        aria-label="Editar" title="Editar">
                        <FiEdit2 size={15} />
                      </button>
                      <button type="button" onClick={() => handleDelete(c)}
                        className={`p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 transition-colors ${focusRing}`}
                        aria-label="Excluir" title="Excluir">
                        <FiTrash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {collections.length === 0 && !loading && (
                <p className="font-sans text-baby-text/40 text-sm text-center py-8 col-span-full">
                  Nenhuma coleção encontrada.
                </p>
              )}
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/admin" className={btnSecondary}>
              <FiArrowLeft size={14} className="inline -mt-0.5 mr-1" />
              Voltar ao painel
            </Link>
          </div>
        </motion.div>
      </div>

      {/* ══════════════ COLLECTION MODAL ══════════════ */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm px-4 py-8 overflow-y-auto"
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface rounded-2xl shadow-xl w-full max-w-lg p-6 my-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-lg text-baby-text">
                  {editingId ? 'Editar coleção' : 'Nova coleção'}
                </h3>
                <button type="button" onClick={() => setModalOpen(false)}
                  className={`p-1.5 rounded-full hover:bg-baby-pink/40 transition-colors ${focusRing}`}
                  aria-label="Fechar">
                  <FiX size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="font-sans text-sm font-medium text-baby-text block mb-1">Nome *</label>
                  <input name="name" value={form.name} onChange={handleChange}
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                               font-sans text-sm text-baby-text ${focusRing}`} />
                </div>

                <div>
                  <label className="font-sans text-sm font-medium text-baby-text block mb-1">Slug (auto se vazio)</label>
                  <input name="slug" value={form.slug} onChange={handleChange}
                    placeholder="ex: colecao-verao"
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                               font-sans text-sm text-baby-text placeholder-baby-text/40 ${focusRing}`} />
                </div>

                <div>
                  <label className="font-sans text-sm font-medium text-baby-text block mb-1">Descrição</label>
                  <textarea name="description" value={form.description} onChange={handleChange} rows={2}
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                               font-sans text-sm text-baby-text resize-y ${focusRing}`} />
                </div>

                <label className="flex items-center gap-2 font-sans text-sm text-baby-text cursor-pointer">
                  <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange}
                    className="rounded border-baby-text/30" />
                  Ativa (visível na loja)
                </label>

                <ImageUploader
                  label="Imagem da coleção"
                  images={form.images}
                  onChange={handleImagesChange}
                  onUpload={handleUpload}
                  maxImages={1}
                  aspectHint="Recomendado: 16:9, mínimo 800×450 px"
                />
              </div>

              <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-baby-pink/40">
                <button type="button" onClick={() => setModalOpen(false)}
                  className={`px-4 py-2 rounded-full font-sans text-sm border border-baby-text/15
                             text-baby-text/60 hover:text-baby-accent hover:border-baby-accent
                             transition-colors ${focusRing}`}>
                  Cancelar
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full font-sans text-sm font-medium
                             transition-colors disabled:opacity-40 ${btnPrimary}`}>
                  {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar coleção'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
