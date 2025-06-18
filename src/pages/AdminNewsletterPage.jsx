/**
 * AdminNewsletterPage — view, search, export and delete newsletter subscribers.
 *
 * Route: /admin/newsletter  (ProtectedRoute role="manager")
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiMail, FiSearch, FiRefreshCw, FiDownload, FiTrash2,
  FiArrowLeft, FiAlertTriangle, FiCopy, FiUsers,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { focusRing, btnPrimary, btnSecondary } from '../lib/ui';
import { listNewsletterSubscribers, deleteNewsletterSubscriber } from '../lib/adminApi';

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

const SOURCE_OPTIONS = [
  { value: '', label: 'Todas origens' },
  { value: 'footer', label: 'Rodapé' },
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function toCsv(rows) {
  const header = ['email', 'origem', 'inscrito_em'];
  const escape = (val) => {
    const s = String(val ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([escape(row.email), escape(row.source || ''), escape(row.created_at || '')].join(','));
  }
  return '\ufeff' + lines.join('\n');
}

export default function AdminNewsletterPage() {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missingTable, setMissingTable] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    setMissingTable(false);
    try {
      const { subscribers: list } = await listNewsletterSubscribers({ limit: 1000 });
      setSubscribers(list);
    } catch (err) {
      if (err.code === 'missing_table') {
        setMissingTable(true);
      } else {
        setError(err.message || 'Falha ao carregar inscritos.');
        toast.error(err.message || 'Falha ao carregar inscritos.', { style: toastStyle });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subscribers.filter((s) => {
      if (q && !s.email.toLowerCase().includes(q)) return false;
      if (sourceFilter && s.source !== sourceFilter) return false;
      return true;
    });
  }, [subscribers, search, sourceFilter]);

  const handleDelete = async (sub) => {
    if (!confirm(`Remover "${sub.email}" da lista?`)) return;
    try {
      await deleteNewsletterSubscriber(sub.id);
      setSubscribers((prev) => prev.filter((s) => s.id !== sub.id));
      toast.success('Inscrição removida.', { style: toastStyle });
    } catch (err) {
      toast.error(err.message || 'Falha ao remover.', { style: toastStyle });
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast('Nada para exportar.', { style: toastStyle });
      return;
    }
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `inscritos-newsletter-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} inscritos exportados.`, { style: toastStyle });
  };

  const handleCopyEmails = async () => {
    if (filtered.length === 0) {
      toast('Nada para copiar.', { style: toastStyle });
      return;
    }
    const emails = filtered.map((s) => s.email).join(', ');
    try {
      await navigator.clipboard.writeText(emails);
      toast.success(`${filtered.length} e-mails copiados.`, { style: toastStyle });
    } catch {
      toast.error('Falha ao copiar.', { style: toastStyle });
    }
  };

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream dark:bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60 dark:text-gray-400" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/admin" className="hover:text-baby-accent transition-colors">Painel</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text dark:text-gray-200 font-medium">Newsletter</li>
          </ol>
        </nav>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-baby-pink/40 dark:bg-baby-pink/20 rounded-full flex items-center justify-center">
                <FiMail className="text-baby-accent" size={22} />
              </div>
              <div>
                <h1 className="font-serif text-2xl sm:text-3xl text-baby-text dark:text-gray-100">Newsletter</h1>
                <p className="font-sans text-sm text-baby-text/60 dark:text-gray-400 mt-0.5">
                  {subscribers.length === 0
                    ? 'Nenhum inscrito ainda'
                    : `${subscribers.length} ${subscribers.length === 1 ? 'inscrito' : 'inscritos'} no total`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={fetchData}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full font-sans text-sm
                           border border-baby-text/15 dark:border-gray-600 text-baby-text/60 dark:text-gray-400
                           hover:text-baby-accent hover:border-baby-accent transition-colors ${focusRing}`}>
                <FiRefreshCw size={14} />
                Atualizar
              </button>
              <button type="button" onClick={handleCopyEmails} disabled={filtered.length === 0}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full font-sans text-sm
                           border border-baby-text/15 dark:border-gray-600 text-baby-text/60 dark:text-gray-400
                           hover:text-baby-accent hover:border-baby-accent transition-colors
                           disabled:opacity-40 disabled:pointer-events-none ${focusRing}`}>
                <FiCopy size={14} />
                Copiar e-mails
              </button>
              <button type="button" onClick={handleExport} disabled={filtered.length === 0}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm font-medium
                           disabled:opacity-40 disabled:pointer-events-none ${btnPrimary}`}>
                <FiDownload size={15} />
                Exportar CSV
              </button>
            </div>
          </div>

          {/* Missing table notice */}
          {missingTable && (
            <div className="bg-surface rounded-2xl shadow-soft p-6 text-center mb-6">
              <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiAlertTriangle className="text-amber-500" size={26} />
              </div>
              <h2 className="font-serif text-xl text-baby-text dark:text-gray-100 mb-2">Tabela não encontrada</h2>
              <p className="font-sans text-sm text-baby-text/60 dark:text-gray-400 mb-1">
                A tabela <code className="bg-baby-pink/30 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">newsletter_subscribers</code> ainda não foi criada no banco de dados.
              </p>
            </div>
          )}

          {/* Filters */}
          {!missingTable && (
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-baby-text/40 dark:text-gray-500" size={16} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por e-mail…"
                  className={`w-full pl-9 pr-3 py-2.5 rounded-xl border border-baby-text/15 dark:border-gray-600
                             bg-surface font-sans text-sm text-baby-text dark:text-gray-100
                             placeholder-baby-text/40 dark:placeholder-gray-500 ${focusRing}`}
                />
              </div>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
                className={`rounded-xl border border-baby-text/15 dark:border-gray-600 bg-surface px-3 py-2.5
                           font-sans text-sm text-baby-text dark:text-gray-100 ${focusRing}`}>
                {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          {/* Loading */}
          {loading && !missingTable && (
            <div className="text-center py-12">
              <FiRefreshCw size={24} className="mx-auto animate-spin text-baby-accent mb-2" />
              <p className="font-sans text-sm text-baby-text/50 dark:text-gray-400">Carregando…</p>
            </div>
          )}

          {/* Fetch error */}
          {error && !loading && !missingTable && (
            <div className="bg-surface rounded-2xl shadow-soft p-6 text-center">
              <p className="font-sans text-sm text-red-500 mb-3">{error}</p>
              <button type="button" onClick={fetchData}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-sans text-sm ${btnSecondary}`}>
                <FiRefreshCw size={14} />
                Tentar novamente
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && !missingTable && subscribers.length === 0 && (
            <div className="bg-surface rounded-2xl shadow-soft p-10 text-center">
              <div className="w-14 h-14 bg-baby-pink/40 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiUsers className="text-baby-accent" size={26} />
              </div>
              <p className="font-serif text-lg text-baby-text dark:text-gray-100 mb-1">Sem inscritos ainda</p>
              <p className="font-sans text-sm text-baby-text/60 dark:text-gray-400">
                Assim que alguém assinar pelo rodapé do site, aparecerá aqui.
              </p>
            </div>
          )}

          {/* List */}
          {!loading && !error && !missingTable && subscribers.length > 0 && (
            <div className="bg-surface rounded-2xl shadow-soft overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-baby-pink dark:border-gray-700">
                      <th className="font-sans text-xs font-semibold text-baby-text/50 dark:text-gray-400 uppercase tracking-wider px-4 py-3">E-mail</th>
                      <th className="font-sans text-xs font-semibold text-baby-text/50 dark:text-gray-400 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Origem</th>
                      <th className="font-sans text-xs font-semibold text-baby-text/50 dark:text-gray-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Inscrito em</th>
                      <th className="font-sans text-xs font-semibold text-baby-text/50 dark:text-gray-400 uppercase tracking-wider px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-baby-pink/50 dark:divide-gray-700/50">
                    {filtered.map((sub) => (
                      <tr key={sub.id} className="hover:bg-baby-pink/10 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <a href={`mailto:${sub.email}`}
                            className="font-sans text-sm text-baby-text dark:text-gray-100 hover:text-baby-accent break-all">
                            {sub.email}
                          </a>
                          <div className="md:hidden font-sans text-xs text-baby-text/50 dark:text-gray-500 mt-0.5">
                            {formatDate(sub.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-baby-pink/30 dark:bg-gray-700 text-baby-text/70 dark:text-gray-300 font-sans text-xs">
                            {sub.source || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-sans text-xs text-baby-text/60 dark:text-gray-400 hidden md:table-cell whitespace-nowrap">
                          {formatDate(sub.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => handleDelete(sub)}
                            aria-label={`Remover ${sub.email}`}
                            className={`p-2 rounded-full text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors ${focusRing}`}>
                            <FiTrash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filtered.length === 0 && (
                <div className="text-center py-10">
                  <p className="font-sans text-sm text-baby-text/50 dark:text-gray-400">
                    Nenhum inscrito corresponde aos filtros.
                  </p>
                </div>
              )}

              {filtered.length > 0 && (
                <div className="px-4 py-3 border-t border-baby-pink/50 dark:border-gray-700/50 font-sans text-xs text-baby-text/50 dark:text-gray-400">
                  Mostrando {filtered.length} de {subscribers.length}
                </div>
              )}
            </div>
          )}

          {/* Back */}
          <div className="mt-8 text-center">
            <Link to="/admin" className={btnSecondary}>
              <FiArrowLeft size={14} className="inline -mt-0.5 mr-1" />
              Voltar ao painel
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
