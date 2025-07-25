/**
 * AdminHomePage — manage what shows on the public home page.
 *
 * Route: /admin/inicio  (ProtectedRoute role="manager")
 *
 * Controls:
 * - Collections section: enable/disable, title, pick & order collections
 * - Featured products section: enable/disable, title, pick & order products
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiHome, FiRefreshCw, FiArrowLeft, FiArrowUp, FiArrowDown,
  FiGrid, FiPackage, FiImage, FiX, FiPlus, FiAlertTriangle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { focusRing, btnPrimary, btnSecondary } from '../lib/ui';
import { getHomeSettings, updateHomeSettings } from '../lib/adminApi';
import { useCatalog } from '../context/CatalogContext';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

const MIGRATION_SQL = `-- Execute no Supabase → SQL Editor
CREATE TABLE IF NOT EXISTS homepage_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 text UNIQUE NOT NULL,
  collections_enabled boolean DEFAULT true,
  featured_enabled    boolean DEFAULT true,
  collections_title   text DEFAULT 'Coleções',
  featured_title      text DEFAULT 'Destaques',
  collections_order   uuid[] DEFAULT '{}',
  featured_order      uuid[] DEFAULT '{}',
  updated_at          timestamptz DEFAULT now()
);

INSERT INTO homepage_settings (key)
VALUES ('home')
ON CONFLICT (key) DO NOTHING;`;

export default function AdminHomePage({ embedded = false }) {
  const { collections: allCollections, products: allProducts } = useCatalog();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    setMigrationNeeded(false);
    try {
      const homeSettings = await getHomeSettings();
      setSettings(homeSettings);
    } catch (err) {
      if (err.code === 'missing_table') {
        setMigrationNeeded(true);
      } else {
        setFetchError(err.message || 'Erro desconhecido');
        toast.error('Falha ao carregar: ' + err.message, { style: toastStyle });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const update = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        collections_enabled: settings.collections_enabled,
        featured_enabled: settings.featured_enabled,
        collections_title: settings.collections_title,
        featured_title: settings.featured_title,
        collections_order: settings.collections_order || [],
        featured_order: settings.featured_order || [],
        hero_order: settings.hero_order || [],
      };
      await updateHomeSettings(payload);
      toast.success('Configurações salvas!', { style: toastStyle });
    } catch (err) {
      toast.error(err.message, { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  /* ── Ordering helpers ──────────────────────────── */
  const moveUp = (list, idx) => {
    if (idx === 0) return list;
    const copy = [...list];
    [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
    return copy;
  };

  const moveDown = (list, idx) => {
    if (idx >= list.length - 1) return list;
    const copy = [...list];
    [copy[idx + 1], copy[idx]] = [copy[idx], copy[idx + 1]];
    return copy;
  };

  const removeFromOrder = (list, id) => list.filter((x) => x !== id);

  const addToCollectionsOrder = (id) => {
    const order = settings.collections_order || [];
    if (!order.includes(id)) {
      update('collections_order', [...order, id]);
    }
  };

  const addToFeaturedOrder = (id) => {
    const order = settings.featured_order || [];
    if (!order.includes(id)) {
      update('featured_order', [...order, id]);
    }
  };

  const addToHeroOrder = (id) => {
    const order = settings.hero_order || [];
    if (!order.includes(id)) {
      update('hero_order', [...order, id]);
    }
  };

  const getItemName = (items, id) => items.find((x) => x.id === id)?.name || id;

  if (loading) {
    return (
      <div className={embedded ? 'text-center py-12' : 'pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream dark:bg-gray-900 min-h-screen'}>
        <div className={embedded ? '' : 'max-w-4xl mx-auto px-4 sm:px-6 py-12'}>
          <div className="space-y-4 animate-pulse">
            <div className="h-8 bg-baby-pink/40 dark:bg-gray-700 rounded-xl w-48" />
            <div className="h-32 bg-baby-pink/30 dark:bg-gray-800 rounded-2xl" />
            <div className="h-32 bg-baby-pink/30 dark:bg-gray-800 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Migration needed ─────────────────────────── */
  if (migrationNeeded) {
    return (
      <div className={embedded ? 'py-8' : 'pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream dark:bg-gray-900 min-h-screen'}>
        <div className={embedded ? '' : 'max-w-4xl mx-auto px-4 sm:px-6'}>
          <div className="bg-surface rounded-2xl shadow-soft p-6 text-center">
            <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiAlertTriangle className="text-amber-500" size={26} />
            </div>
            <h2 className="font-serif text-xl text-baby-text dark:text-gray-100 mb-2">Configuração necessária</h2>
            <p className="font-sans text-sm text-baby-text/60 dark:text-gray-400 mb-4">
              A tabela <code className="bg-baby-pink/30 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">homepage_settings</code> ainda não existe no banco de dados.
            </p>
            <p className="font-sans text-sm text-baby-text/60 dark:text-gray-400 mb-3">
              Execute o SQL abaixo no <strong>Editor SQL do Supabase</strong>:
            </p>
            <pre className="text-left bg-gray-900 text-green-300 rounded-xl p-4 text-xs overflow-x-auto mb-4 whitespace-pre-wrap">
              {MIGRATION_SQL}
            </pre>
            <button
              type="button"
              onClick={fetchData}
              className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full font-sans text-sm font-medium transition-colors ${btnPrimary}`}
            >
              <FiRefreshCw size={14} />
              Recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Fetch error ──────────────────────────────── */
  if (fetchError && !settings) {
    return (
      <div className={embedded ? 'py-8' : 'pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream dark:bg-gray-900 min-h-screen'}>
        <div className={embedded ? '' : 'max-w-4xl mx-auto px-4 sm:px-6'}>
          <div className="bg-surface rounded-2xl shadow-soft p-6 text-center">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiAlertTriangle className="text-red-500" size={26} />
            </div>
            <h2 className="font-serif text-xl text-baby-text dark:text-gray-100 mb-2">Erro ao carregar</h2>
            <p className="font-sans text-sm text-baby-text/60 dark:text-gray-400 mb-4">{fetchError}</p>
            <button
              type="button"
              onClick={fetchData}
              className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full font-sans text-sm font-medium transition-colors ${btnPrimary}`}
            >
              <FiRefreshCw size={14} />
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={embedded ? 'text-center py-12' : 'pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream dark:bg-gray-900 min-h-screen'}>
        <div className={embedded ? '' : 'max-w-4xl mx-auto px-4 sm:px-6 text-center py-12'}>
          <p className="font-sans text-sm text-baby-text/50 dark:text-gray-400">Nenhuma configuração encontrada.</p>
          <button
            type="button"
            onClick={fetchData}
            className={`mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm ${btnSecondary}`}
          >
            <FiRefreshCw size={14} />
            Recarregar
          </button>
        </div>
      </div>
    );
  }

  const collOrder = settings.collections_order || [];
  const featOrder = settings.featured_order || [];
  const heroOrder = settings.hero_order || [];

  const availableCollections = allCollections.filter((c) => !collOrder.includes(c.id));
  const availableProducts = allProducts.filter((p) => !featOrder.includes(p.id));
  const availableForHero = allProducts.filter((p) => !heroOrder.includes(p.id) && p.is_public !== false);

  const Wrapper = embedded ? 'div' : 'section';
  const wrapperClass = embedded ? '' : 'pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen';

  return (
    <Wrapper className={wrapperClass}>
      <div className={embedded ? '' : 'max-w-4xl mx-auto px-4 sm:px-6'}>
        {/* Breadcrumb */}
        {!embedded && (
        <nav className="mb-6 font-sans text-sm text-baby-text/60">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/admin" className="hover:text-baby-accent transition-colors">Painel</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">Página Inicial</li>
          </ol>
        </nav>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-baby-pink/40 rounded-full flex items-center justify-center">
              <FiHome className="text-baby-accent" size={22} />
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl text-baby-text">Gerenciar Página Inicial</h1>
          </div>

          {/* ── Hero Slider Section ─────────────────────── */}
          <div className="bg-surface rounded-2xl shadow-soft p-6 mb-6 ring-1 ring-baby-accent/20">
            <div className="flex items-center gap-2 mb-2">
              <FiImage size={18} className="text-baby-accent" />
              <h2 className="font-serif text-lg text-baby-text">Foto principal da página inicial (slider)</h2>
            </div>
            <p className="font-sans text-sm text-baby-text/60 mb-4">
              Escolha os produtos que aparecem no slider grande no topo do site. A primeira foto de cada produto é usada e o slider alterna entre eles automaticamente. Se nenhum for selecionado, os produtos em Destaques são usados.
            </p>

            <div className="space-y-1.5">
              {heroOrder.map((id, idx) => (
                <div key={id} className="flex items-center gap-2 bg-baby-cream rounded-xl px-3 py-2">
                  {(() => {
                    const prod = allProducts.find((x) => x.id === id);
                    const img = prod?.images?.[0];
                    return img ? (
                      <img src={img} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-baby-pink/30 shrink-0" />
                    );
                  })()}
                  <span className="font-sans text-sm text-baby-text flex-1 truncate">{getItemName(allProducts, id)}</span>
                  <button type="button" onClick={() => update('hero_order', moveUp(heroOrder, idx))}
                    disabled={idx === 0}
                    className={`p-1 rounded hover:bg-baby-pink/40 disabled:opacity-20 ${focusRing}`}>
                    <FiArrowUp size={14} />
                  </button>
                  <button type="button" onClick={() => update('hero_order', moveDown(heroOrder, idx))}
                    disabled={idx === heroOrder.length - 1}
                    className={`p-1 rounded hover:bg-baby-pink/40 disabled:opacity-20 ${focusRing}`}>
                    <FiArrowDown size={14} />
                  </button>
                  <button type="button" onClick={() => update('hero_order', removeFromOrder(heroOrder, id))}
                    className={`p-1 rounded hover:bg-red-100 text-red-500 ${focusRing}`}>
                    <FiX size={14} />
                  </button>
                </div>
              ))}
            </div>

            {heroOrder.length === 0 && (
              <p className="font-sans text-xs text-baby-text/40 mb-2">Nenhum produto selecionado.</p>
            )}

            {availableForHero.length > 0 && heroOrder.length < 6 && (
              <div className="mt-3">
                <p className="font-sans text-xs text-baby-text/50 mb-1">
                  Adicionar produto ao slider {heroOrder.length > 0 && `(${heroOrder.length}/6)`}:
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {availableForHero.map((p) => (
                    <button key={p.id} type="button" onClick={() => addToHeroOrder(p.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-sans
                                 border border-baby-text/15 hover:border-baby-accent hover:text-baby-accent
                                 transition-colors ${focusRing}`}>
                      <FiPlus size={12} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {heroOrder.length >= 6 && (
              <p className="font-sans text-xs text-baby-text/50 mt-2">Máximo de 6 produtos no slider.</p>
            )}
          </div>

          {/* ── Collections Section ────────────────────── */}
          <div className="bg-surface rounded-2xl shadow-soft p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FiGrid size={18} className="text-baby-accent" />
                <h2 className="font-serif text-lg text-baby-text">Seção Coleções</h2>
              </div>
              <label className="flex items-center gap-2 font-sans text-sm text-baby-text cursor-pointer">
                <input type="checkbox" checked={settings.collections_enabled}
                  onChange={(e) => update('collections_enabled', e.target.checked)}
                  className="rounded border-baby-text/30" />
                Ativada
              </label>
            </div>

            {settings.collections_enabled && (
              <div className="space-y-4">
                <div>
                  <label className="font-sans text-sm font-medium text-baby-text block mb-1">Título da seção</label>
                  <input value={settings.collections_title || ''} maxLength={60}
                    onChange={(e) => update('collections_title', e.target.value)}
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                               font-sans text-sm text-baby-text ${focusRing}`} />
                </div>

                <div>
                  <p className="font-sans text-sm font-medium text-baby-text mb-2">Ordem das coleções</p>
                  {collOrder.length === 0 && (
                    <p className="font-sans text-xs text-baby-text/40 mb-2">Nenhuma selecionada — todas ativas serão mostradas em ordem alfabética.</p>
                  )}
                  <div className="space-y-1.5">
                    {collOrder.map((id, idx) => (
                      <div key={id} className="flex items-center gap-2 bg-baby-cream rounded-xl px-3 py-2">
                        <span className="font-sans text-sm text-baby-text flex-1">{getItemName(allCollections, id)}</span>
                        <button type="button" onClick={() => update('collections_order', moveUp(collOrder, idx))}
                          disabled={idx === 0}
                          className={`p-1 rounded hover:bg-baby-pink/40 disabled:opacity-20 ${focusRing}`}>
                          <FiArrowUp size={14} />
                        </button>
                        <button type="button" onClick={() => update('collections_order', moveDown(collOrder, idx))}
                          disabled={idx === collOrder.length - 1}
                          className={`p-1 rounded hover:bg-baby-pink/40 disabled:opacity-20 ${focusRing}`}>
                          <FiArrowDown size={14} />
                        </button>
                        <button type="button" onClick={() => update('collections_order', removeFromOrder(collOrder, id))}
                          className={`p-1 rounded hover:bg-red-100 text-red-500 ${focusRing}`}>
                          <FiX size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {availableCollections.length > 0 && (
                    <div className="mt-3">
                      <p className="font-sans text-xs text-baby-text/50 mb-1">Adicionar coleção:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {availableCollections.map((c) => (
                          <button key={c.id} type="button" onClick={() => addToCollectionsOrder(c.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-sans
                                       border border-baby-text/15 hover:border-baby-accent hover:text-baby-accent
                                       transition-colors ${focusRing}`}>
                            <FiPlus size={12} />
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Featured Products Section ─────────────── */}
          <div className="bg-surface rounded-2xl shadow-soft p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FiPackage size={18} className="text-baby-accent" />
                <h2 className="font-serif text-lg text-baby-text">Seção Produtos em Destaque</h2>
              </div>
              <label className="flex items-center gap-2 font-sans text-sm text-baby-text cursor-pointer">
                <input type="checkbox" checked={settings.featured_enabled}
                  onChange={(e) => update('featured_enabled', e.target.checked)}
                  className="rounded border-baby-text/30" />
                Ativada
              </label>
            </div>

            {settings.featured_enabled && (
              <div className="space-y-4">
                <div>
                  <label className="font-sans text-sm font-medium text-baby-text block mb-1">Título da seção</label>
                  <input value={settings.featured_title || ''} maxLength={60}
                    onChange={(e) => update('featured_title', e.target.value)}
                    className={`w-full rounded-xl border border-baby-text/15 bg-baby-cream px-3 py-2.5
                               font-sans text-sm text-baby-text ${focusRing}`} />
                </div>

                <div>
                  <p className="font-sans text-sm font-medium text-baby-text mb-2">Ordem dos destaques</p>
                  {featOrder.length === 0 && (
                    <p className="font-sans text-xs text-baby-text/40 mb-2">Nenhum selecionado — produtos marcados como &ldquo;Destaque&rdquo; serão mostrados automaticamente.</p>
                  )}
                  <div className="space-y-1.5">
                    {featOrder.map((id, idx) => (
                      <div key={id} className="flex items-center gap-2 bg-baby-cream rounded-xl px-3 py-2">
                        <span className="font-sans text-sm text-baby-text flex-1">{getItemName(allProducts, id)}</span>
                        <button type="button" onClick={() => update('featured_order', moveUp(featOrder, idx))}
                          disabled={idx === 0}
                          className={`p-1 rounded hover:bg-baby-pink/40 disabled:opacity-20 ${focusRing}`}>
                          <FiArrowUp size={14} />
                        </button>
                        <button type="button" onClick={() => update('featured_order', moveDown(featOrder, idx))}
                          disabled={idx === featOrder.length - 1}
                          className={`p-1 rounded hover:bg-baby-pink/40 disabled:opacity-20 ${focusRing}`}>
                          <FiArrowDown size={14} />
                        </button>
                        <button type="button" onClick={() => update('featured_order', removeFromOrder(featOrder, id))}
                          className={`p-1 rounded hover:bg-red-100 text-red-500 ${focusRing}`}>
                          <FiX size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {availableProducts.length > 0 && (
                    <div className="mt-3">
                      <p className="font-sans text-xs text-baby-text/50 mb-1">Adicionar produto:</p>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                        {availableProducts.map((p) => (
                          <button key={p.id} type="button" onClick={() => addToFeaturedOrder(p.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-sans
                                       border border-baby-text/15 hover:border-baby-accent hover:text-baby-accent
                                       transition-colors ${focusRing}`}>
                            <FiPlus size={12} />
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Save / Back */}
          <div className="flex flex-wrap gap-3 justify-center">
            {!embedded && (
            <Link to="/admin" className={btnSecondary}>
              <FiArrowLeft size={14} className="inline -mt-0.5 mr-1" />
              Voltar ao painel
            </Link>
            )}
            <button type="button" onClick={handleSave} disabled={saving}
              className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full font-sans text-sm font-medium
                         transition-colors disabled:opacity-40 ${btnPrimary}`}>
              {saving ? 'Salvando…' : 'Salvar configurações'}
            </button>
            <button type="button" onClick={fetchData}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full font-sans text-sm
                         border border-baby-text/15 text-baby-text/60 hover:text-baby-accent
                         hover:border-baby-accent transition-colors ${focusRing}`}>
              <FiRefreshCw size={14} />
              Recarregar
            </button>
          </div>
        </motion.div>
      </div>
    </Wrapper>
  );
}
