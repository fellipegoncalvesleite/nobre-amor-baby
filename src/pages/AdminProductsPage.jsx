/**
 * AdminProductsPage — manage products with real backend CRUD + image upload.
 *
 * Route: /admin/produtos (ProtectedRoute role="manager")
 *
 * Features:
 * - List products from DB (search, filter by status/collection)
 * - Create / Edit modal with image upload via ImageUploader
 * - Toggle visibility (is_public), delete
 * - Manager creates products as private, then publishes
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPackage, FiPlus, FiSearch, FiRefreshCw, FiEdit2,
  FiTrash2, FiEye, FiEyeOff, FiX, FiArrowLeft,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { focusRing, btnPrimary, btnSecondary, formatPrice } from '../lib/ui';
import {
  listProducts, createProduct, updateProduct, deleteProduct,
  listCollections, uploadImage,
} from '../lib/adminApi';
import ImageUploader from '../components/admin/ImageUploader';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

const SIZE_GROUPS = [
  { value: 'roupa', label: 'Roupa' },
  { value: 'calçado', label: 'Calçado' },
  { value: 'acessório', label: 'Acessório' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'public', label: 'Públicos' },
  { value: 'private', label: 'Privados' },
  { value: 'in_stock', label: 'Em estoque' },
  { value: 'out_of_stock', label: 'Esgotados' },
];

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  price: '',
  oldPrice: '',
  tag: '',
  sizeGroup: 'roupa',
  sizeOptions: '',
  ageMinMonths: '',
  ageMaxMonths: '',
  categorySlug: '',
  collectionId: '',
  featured: false,
  isPublic: false,
  inStock: true,
  stockCount: '99',
  weightGrams: '200',
  images: [],
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [collectionFilter, setCollectionFilter] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, colls] = await Promise.all([
        listProducts({ search, status: statusFilter, collection_id: collectionFilter }),
        listCollections(),
      ]);
      setProducts(prods);
      setCollections(colls);
    } catch (err) {
      toast.error('Falha ao carregar dados: ' + err.message, { style: toastStyle });
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, collectionFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Modal helpers ──────────────────────────────── */
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name || '',
      slug: product.slug || '',
      description: product.description || '',
      price: product.price_cents ? String(product.price_cents / 100) : '',
      oldPrice: product.old_price_cents ? String(product.old_price_cents / 100) : '',
      tag: product.tag || '',
      sizeGroup: product.size_group || 'roupa',
      sizeOptions: (product.size_options || []).join(', '),
      ageMinMonths: product.age_min_months != null ? String(product.age_min_months) : '',
      ageMaxMonths: product.age_max_months != null ? String(product.age_max_months) : '',
      categorySlug: product.category_slug || '',
      collectionId: product.collection_id || '',
      featured: product.featured || false,
      isPublic: product.is_public || false,
      inStock: product.in_stock !== false,
      stockCount: String(product.stock_count ?? 99),
      weightGrams: String(product.weight_grams ?? 200),
      images: (product.image_urls || []).map((url, i) => ({
        id: `existing_${i}`,
        src: url,
        alt: product.name,
      })),
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
    const url = await uploadImage(file, 'product');
    return url;
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nome é obrigatório.', { style: toastStyle });
      return;
    }
    if (!form.price || parseFloat(form.price) <= 0) {
      toast.error('Preço inválido.', { style: toastStyle });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        description: form.description.trim(),
        price_cents: Math.round(parseFloat(form.price) * 100),
        old_price_cents: form.oldPrice ? Math.round(parseFloat(form.oldPrice) * 100) : null,
        tag: form.tag.trim() || null,
        size_group: form.sizeGroup,
        size_options: form.sizeOptions.split(',').map((s) => s.trim()).filter(Boolean),
        age_min_months: form.ageMinMonths ? parseInt(form.ageMinMonths) : null,
        age_max_months: form.ageMaxMonths ? parseInt(form.ageMaxMonths) : null,
        category_slug: form.categorySlug.trim() || null,
        collection_id: form.collectionId || null,
        featured: form.featured,
        is_public: form.isPublic,
        in_stock: form.inStock,
        stock_count: parseInt(form.stockCount) || 99,
        weight_grams: parseInt(form.weightGrams) || 200,
        image_urls: form.images.map((img) => img.src).filter((s) => s && !s.startsWith('data:')),
      };

      if (editingId) {
        await updateProduct(editingId, payload);
        toast.success('Produto atualizado!', { style: toastStyle });
      } else {
        await createProduct(payload);
        toast.success('Produto criado!', { style: toastStyle });
      }

      setModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (!confirm(`Excluir "${product.name}"?`)) return;
    try {
      await deleteProduct(product.id);
      toast.success('Produto excluído.', { style: toastStyle });
      fetchData();
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    }
  };

  const handleTogglePublic = async (product) => {
    try {
      await updateProduct(product.id, { is_public: !product.is_public });
      toast.success(
        product.is_public ? 'Produto tornado privado.' : 'Produto publicado!',
        { style: toastStyle },
      );
      fetchData();
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    }
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/admin" className="hover:text-baby-accent transition-colors">Painel</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Produtos</li>
          </ol>
        </nav>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-baby-pink/40 rounded-full flex items-center justify-center">
                <FiPackage className="text-baby-accent" size={22} />
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl text-baby-text">Produtos</h1>
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
                Novo produto
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-baby-text/40" size={16} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou slug…"
                className={`w-full pl-9 pr-3 py-2.5 rounded-xl border border-baby-text/15 bg-surface
                           font-sans text-sm text-baby-text placeholder-baby-text/40 ${focusRing}`}
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className={`rounded-xl border border-baby-text/15 bg-surface px-3 py-2.5 font-sans text-sm text-baby-text ${focusRing}`}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)}
              className={`rounded-xl border border-baby-text/15 bg-surface px-3 py-2.5 font-sans text-sm text-baby-text ${focusRing}`}>
              <option value="">Todas coleções</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-12">
              <FiRefreshCw size={24} className="mx-auto animate-spin text-baby-accent mb-2" />
              <p className="font-sans text-sm text-baby-text/50">Carregando…</p>
            </div>
          )}

          {/* Products list */}
          {!loading && (
            <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-baby-pink">
                      <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3">Produto</th>
                      <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 text-right hidden sm:table-cell">Preço</th>
                      <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 text-center">Estoque</th>
                      <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 text-center">Status</th>
                      <th className="font-sans text-xs font-semibold text-baby-text/50 uppercase tracking-wider px-4 py-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-baby-pink/50">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-baby-pink/10 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {p.image_urls?.[0] ? (
                              <img src={p.image_urls[0]} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-baby-pink/30 shrink-0 flex items-center justify-center">
                                <FiPackage size={16} className="text-baby-text/30" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-sans text-sm font-medium text-baby-text truncate">{p.name}</p>
                              <p className="font-sans text-xs text-baby-text/40 truncate">{p.slug}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <span className="font-sans text-sm text-baby-text/70">{formatPrice(p.price_cents / 100)}</span>
                          {p.old_price_cents && (
                            <span className="block font-sans text-xs text-baby-text/40 line-through">{formatPrice(p.old_price_cents / 100)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-sans text-sm ${p.stock_count > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {p.stock_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                            ${p.is_public
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-300'}`}>
                            {p.is_public ? 'Público' : 'Privado'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button type="button" onClick={() => handleTogglePublic(p)}
                              className={`p-1.5 rounded-full hover:bg-baby-pink/40 transition-colors ${focusRing}`}
                              aria-label={p.is_public ? 'Tornar privado' : 'Publicar'}
                              title={p.is_public ? 'Tornar privado' : 'Publicar'}>
                              {p.is_public ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                            </button>
                            <button type="button" onClick={() => openEdit(p)}
                              className={`p-1.5 rounded-full hover:bg-baby-pink/40 transition-colors ${focusRing}`}
                              aria-label="Editar" title="Editar">
                              <FiEdit2 size={14} />
                            </button>
                            <button type="button" onClick={() => handleDelete(p)}
                              className={`p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 transition-colors ${focusRing}`}
                              aria-label="Excluir" title="Excluir">
                              <FiTrash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {products.length === 0 && !loading && (
                <p className="font-sans text-baby-text/40 text-sm text-center py-8">
                  Nenhum produto encontrado.
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

      {/* ══════════════ PRODUCT MODAL ══════════════ */}
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
              className="bg-surface rounded-2xl shadow-xl w-full max-w-2xl p-6 my-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-lg text-baby-text">
                  {editingId ? 'Editar produto' : 'Novo produto'}
                </h3>
                <button type="button" onClick={() => setModalOpen(false)}
                  className={`p-1.5 rounded-full hover:bg-baby-pink/40 transition-colors ${focusRing}`}
                  aria-label="Fechar">
                  <FiX size={18} />
                </button>
              </div>

              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                {/* Name */}
                <div>
                  <label className="font-sans text-sm font-medium text-baby-text block mb-1">Nome *</label>
                  <input name="name" value={form.name} onChange={handleChange}
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                               font-sans text-sm text-baby-text ${focusRing}`} />
                </div>

                {/* Slug */}
                <div>
                  <label className="font-sans text-sm font-medium text-baby-text block mb-1">Slug (auto se vazio)</label>
                  <input name="slug" value={form.slug} onChange={handleChange}
                    placeholder="ex: macacao-algodao"
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                               font-sans text-sm text-baby-text placeholder-baby-text/40 ${focusRing}`} />
                </div>

                {/* Description */}
                <div>
                  <label className="font-sans text-sm font-medium text-baby-text block mb-1">Descrição</label>
                  <textarea name="description" value={form.description} onChange={handleChange} rows={2}
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                               font-sans text-sm text-baby-text resize-y ${focusRing}`} />
                </div>

                {/* Price / Old price */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-sans text-sm font-medium text-baby-text block mb-1">Preço (R$) *</label>
                    <input name="price" type="number" step="0.01" min="0" value={form.price} onChange={handleChange}
                      className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                                 font-sans text-sm text-baby-text ${focusRing}`} />
                  </div>
                  <div>
                    <label className="font-sans text-sm font-medium text-baby-text block mb-1">Preço anterior</label>
                    <input name="oldPrice" type="number" step="0.01" min="0" value={form.oldPrice} onChange={handleChange}
                      placeholder="Opcional"
                      className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                                 font-sans text-sm text-baby-text placeholder-baby-text/40 ${focusRing}`} />
                  </div>
                </div>

                {/* Tag / Size group */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-sans text-sm font-medium text-baby-text block mb-1">Tag</label>
                    <input name="tag" value={form.tag} onChange={handleChange}
                      placeholder="Ex: Novo, Mais Vendido"
                      className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                                 font-sans text-sm text-baby-text placeholder-baby-text/40 ${focusRing}`} />
                  </div>
                  <div>
                    <label className="font-sans text-sm font-medium text-baby-text block mb-1">Grupo de tamanho *</label>
                    <select name="sizeGroup" value={form.sizeGroup} onChange={handleChange}
                      className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                                 font-sans text-sm text-baby-text ${focusRing}`}>
                      {SIZE_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Size options */}
                <div>
                  <label className="font-sans text-sm font-medium text-baby-text block mb-1">Opções de tamanho (separadas por vírgula)</label>
                  <input name="sizeOptions" value={form.sizeOptions} onChange={handleChange}
                    placeholder="0-1m, 1-3m, 3-6m"
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                               font-sans text-sm text-baby-text placeholder-baby-text/40 ${focusRing}`} />
                </div>

                {/* Stock / Weight */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-sans text-sm font-medium text-baby-text block mb-1">Estoque</label>
                    <input name="stockCount" type="number" min="0" value={form.stockCount} onChange={handleChange}
                      className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                                 font-sans text-sm text-baby-text ${focusRing}`} />
                  </div>
                  <div>
                    <label className="font-sans text-sm font-medium text-baby-text block mb-1">Peso (gramas)</label>
                    <input name="weightGrams" type="number" min="0" value={form.weightGrams} onChange={handleChange}
                      className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                                 font-sans text-sm text-baby-text ${focusRing}`} />
                  </div>
                </div>

                {/* Collection */}
                <div>
                  <label className="font-sans text-sm font-medium text-baby-text block mb-1">Coleção</label>
                  <select name="collectionId" value={form.collectionId} onChange={handleChange}
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                               font-sans text-sm text-baby-text ${focusRing}`}>
                    <option value="">Nenhuma</option>
                    {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {/* Toggles */}
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 font-sans text-sm text-baby-text cursor-pointer">
                    <input type="checkbox" name="featured" checked={form.featured} onChange={handleChange}
                      className="rounded border-baby-text/30" />
                    Destaque
                  </label>
                  <label className="flex items-center gap-2 font-sans text-sm text-baby-text cursor-pointer">
                    <input type="checkbox" name="isPublic" checked={form.isPublic} onChange={handleChange}
                      className="rounded border-baby-text/30" />
                    Público (visível na loja)
                  </label>
                  <label className="flex items-center gap-2 font-sans text-sm text-baby-text cursor-pointer">
                    <input type="checkbox" name="inStock" checked={form.inStock} onChange={handleChange}
                      className="rounded border-baby-text/30" />
                    Em estoque
                  </label>
                </div>

                {/* Images */}
                <ImageUploader
                  label="Fotos do produto"
                  images={form.images}
                  onChange={handleImagesChange}
                  onUpload={handleUpload}
                  maxImages={8}
                  aspectHint="A primeira foto será a capa."
                />
              </div>

              {/* Actions */}
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
                  {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar produto'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
