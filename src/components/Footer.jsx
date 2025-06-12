import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiFacebook,
  FiInstagram,
  FiMail,
  FiMapPin,
  FiPhone,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import siteConfig from '../config/siteConfig';

const footerLinks = {
  shop: [
    { name: 'Novidades', to: '/novidades' },
    { name: 'Coleções', to: '/colecoes' },
    { name: 'Promoções', to: '/promocoes' },
    { name: 'Favoritos', to: '/favoritos' },
  ],
  help: [
    { name: 'Envio e Trocas', to: '/envio-e-trocas' },
    { name: 'Guia de Tamanhos', to: '/guia-de-tamanhos' },
    { name: 'Perguntas Frequentes', to: '/faq' },
    { name: 'Fale Conosco', to: '/sobre' },
  ],
  about: [
    { name: 'Nossa História', to: '/sobre' },
  ],
};

const socialEntries = [
  { name: 'Instagram', icon: FiInstagram, url: siteConfig.instagramUrl },
  { name: 'Facebook', icon: FiFacebook, url: siteConfig.facebookUrl },
].filter((entry) => entry.url);

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

export default function Footer() {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterLoading, setNewsletterLoading] = useState(false);
  const [newsletterStatus, setNewsletterStatus] = useState({ type: 'idle', message: '' });

  const handleNewsletterSubmit = async (event) => {
    event.preventDefault();
    const trimmed = newsletterEmail.trim();
    if (!trimmed) return;

    setNewsletterLoading(true);
    setNewsletterStatus({ type: 'idle', message: '' });
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source: 'footer' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Não foi possível salvar seu e-mail.');

      const successMessage = data.duplicate
        ? 'Este e-mail já estava inscrito.'
        : 'Inscrição confirmada com sucesso.';
      toast.success(successMessage, { style: toastStyle });
      setNewsletterStatus({ type: 'success', message: successMessage });
      setNewsletterEmail('');
    } catch (err) {
      console.error('[Footer] newsletter error:', err);
      const errorMessage = err.message || 'Falha ao salvar seu e-mail.';
      toast.error(errorMessage, { style: toastStyle });
      setNewsletterStatus({ type: 'error', message: errorMessage });
    } finally {
      setNewsletterLoading(false);
    }
  };

  return (
    <footer className="bg-baby-text dark:bg-[#13101A] text-white">
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-xl mx-auto text-center"
          >
            <h2 className="font-serif text-2xl lg:text-3xl mb-2">Faça parte da Família Nobre Amor</h2>
            <p className="font-sans text-white/70 text-sm mb-5">
              Receba novidades da loja no seu e-mail.
            </p>
            <form
              onSubmit={handleNewsletterSubmit}
              className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto text-left"
              noValidate
            >
              <div className="flex-1">
                <label htmlFor="newsletter-email" className="block font-sans text-xs font-medium text-white/70 mb-1.5">
                  Seu e-mail
                </label>
                <input
                  id="newsletter-email"
                  type="email"
                  value={newsletterEmail}
                  onChange={(event) => setNewsletterEmail(event.target.value)}
                  placeholder="voce@exemplo.com"
                  required
                  disabled={newsletterLoading}
                  aria-invalid={newsletterStatus.type === 'error' ? 'true' : undefined}
                  aria-describedby={newsletterStatus.message ? 'newsletter-status' : undefined}
                  className="w-full h-11 px-4 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/40 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-baby-pink focus:border-transparent disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={newsletterLoading}
                className="sm:self-end h-11 px-6 bg-baby-pink text-baby-text rounded-full font-sans font-semibold text-sm hover:bg-baby-pink-light active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-baby-pink focus:ring-offset-2 focus:ring-offset-baby-text disabled:opacity-60 whitespace-nowrap"
              >
                {newsletterLoading ? 'Enviando...' : 'Inscrever'}
              </button>
            </form>
            <p
              id="newsletter-status"
              role={newsletterStatus.type === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              className={`font-sans text-xs mt-3 min-h-4 ${
                newsletterStatus.type === 'error'
                  ? 'text-red-300'
                  : newsletterStatus.type === 'success'
                    ? 'text-green-300'
                    : 'text-white/40'
              }`}
            >
              {newsletterStatus.message}
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 lg:gap-12">
          <div className="col-span-2 lg:col-span-1">
            {/* Single brand lockup: logo badge on white for contrast, plus wordmark */}
            <Link
              to="/"
              className="inline-flex items-center gap-3 mb-5 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-baby-pink rounded-2xl"
              aria-label="Nobre Amor Baby — página inicial"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-soft">
                <img
                  src="/logo.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-12 w-12 object-contain"
                  draggable={false}
                />
              </span>
              <span className="font-serif text-xl leading-tight text-white">
                Nobre Amor<br />Baby
              </span>
            </Link>
            <p className="font-sans text-white/80 text-sm mb-2 max-w-xs">
              {siteConfig.tagline}
            </p>
            <p className="font-sans text-white/55 text-xs mb-6 max-w-xs">
              Desde {siteConfig.foundedAt}.
            </p>

            {socialEntries.length > 0 && (
              <div className="flex gap-3">
                {socialEntries.map((social) => (
                  <a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 min-w-11 min-h-11 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-baby-pink"
                    aria-label={`Siga-nos no ${social.name}`}
                  >
                    <social.icon size={18} />
                  </a>
                ))}
              </div>
            )}
          </div>

          <FooterNav title="Loja" links={footerLinks.shop} />
          <FooterNav title="Ajuda" links={footerLinks.help} />
          <FooterNav title="Sobre" links={footerLinks.about} />

          <div className="col-span-2 md:col-span-1">
            <h3 className="font-serif text-lg text-white mb-4">Contato</h3>
            <ul className="space-y-3 font-sans text-white/75 text-[15px]">
              <li className="flex items-start gap-3">
                <FiMapPin className="shrink-0 mt-1 text-white/60" size={16} aria-hidden="true" />
                <span className="leading-relaxed">
                  {siteConfig.storeAddressLine}
                  {siteConfig.storeCityState && (
                    <>
                      <br />
                      {siteConfig.storeCityState}
                    </>
                  )}
                </span>
              </li>
              <li>
                <a
                  href={`https://wa.me/${siteConfig.whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 min-h-10 py-1 text-white/85 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-baby-pink rounded-lg transition-colors"
                >
                  <FiPhone className="shrink-0 text-white/60" size={16} aria-hidden="true" />
                  <span className="whitespace-nowrap">WhatsApp {siteConfig.whatsappDisplay}</span>
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${siteConfig.contactEmail}`}
                  className="inline-flex items-center gap-3 min-h-10 py-1 text-white/85 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-baby-pink rounded-lg transition-colors"
                >
                  <FiMail className="shrink-0 text-white/60" size={16} aria-hidden="true" />
                  <span className="break-keep">{siteConfig.contactEmail}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="font-sans text-white/60 text-sm text-center md:text-left">
              &copy; {new Date().getFullYear()} {siteConfig.brandName}. Todos os direitos reservados.
            </p>
            <div className="flex gap-6">
              <Link to="/privacidade" className="font-sans text-white/70 text-sm hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-baby-pink rounded py-1">
                Política de Privacidade
              </Link>
              <Link to="/termos" className="font-sans text-white/70 text-sm hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-baby-pink rounded py-1">
                Termos de Uso
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterNav({ title, links }) {
  return (
    <nav aria-label={`Links de ${title.toLowerCase()}`}>
      <h3 className="font-serif text-lg text-white mb-4">{title}</h3>
      <ul className="space-y-3">
        {links.map((link) => (
          <li key={link.name}>
            <Link
              to={link.to}
              className="font-sans text-white/75 text-[15px] hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-baby-pink rounded py-1 inline-block"
            >
              {link.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
