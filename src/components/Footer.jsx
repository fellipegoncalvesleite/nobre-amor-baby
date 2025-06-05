import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiFacebook,
  FiInstagram,
  FiMail,
  FiMapPin,
  FiPhone,
  FiTwitter,
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
    { name: 'Política de Privacidade', to: '/privacidade' },
    { name: 'Termos de Uso', to: '/termos' },
  ],
};

const socialEntries = [
  { name: 'Instagram', icon: FiInstagram, url: siteConfig.instagramUrl },
  { name: 'Facebook', icon: FiFacebook, url: siteConfig.facebookUrl },
  { name: 'Twitter', icon: FiTwitter, url: siteConfig.twitterUrl },
].filter((entry) => entry.url);

const toastStyle = { background: '#F0DAE8', color: '#373438', borderRadius: '12px' };

export default function Footer() {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterLoading, setNewsletterLoading] = useState(false);

  const handleNewsletterSubmit = async (event) => {
    event.preventDefault();
    if (!newsletterEmail.trim()) return;

    setNewsletterLoading(true);
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newsletterEmail.trim(), source: 'footer' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Não foi possível salvar seu e-mail.');

      toast.success(
        data.duplicate ? 'Este e-mail já estava inscrito.' : 'Inscrição confirmada com sucesso.',
        { style: toastStyle },
      );
      setNewsletterEmail('');
    } catch (err) {
      console.error('[Footer] newsletter error:', err);
      toast.error(err.message || 'Falha ao salvar seu e-mail.', { style: toastStyle });
    } finally {
      setNewsletterLoading(false);
    }
  };

  return (
    <footer className="bg-baby-text dark:bg-[#13101A] text-white">
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl mx-auto text-center"
          >
            <h2 className="font-serif text-2xl lg:text-3xl mb-3">Faça Parte da Família Nobre Amor</h2>
            <p className="font-sans text-white/70 mb-6">
              Inscreva-se para ofertas exclusivas, novidades e dicas para mamães.
            </p>
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <label htmlFor="newsletter-email" className="sr-only">Endereço de e-mail</label>
              <input
                id="newsletter-email"
                type="email"
                value={newsletterEmail}
                onChange={(event) => setNewsletterEmail(event.target.value)}
                placeholder="Digite seu e-mail"
                required
                disabled={newsletterLoading}
                className="flex-1 px-5 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/50 font-sans focus:outline-none focus:ring-2 focus:ring-baby-pink focus:border-transparent disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={newsletterLoading}
                className="px-8 py-3 bg-baby-pink text-baby-text rounded-full font-sans font-medium hover:bg-baby-pink-light active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-baby-pink focus:ring-offset-2 focus:ring-offset-baby-text disabled:opacity-60"
              >
                {newsletterLoading ? 'Enviando...' : 'Inscrever'}
              </button>
            </form>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 lg:gap-12">
          <div className="col-span-2 lg:col-span-1">
            <div className="inline-block mb-4 select-none">
              <img
                src="/logo.svg"
                alt="Nobre Amor Baby"
                className="h-20 w-20 sm:h-24 sm:w-24 object-contain"
                draggable={false}
              />
            </div>
            <p className="font-sans text-white/70 text-sm mb-6 max-w-xs">
              Vestindo seus pequenos com amor desde 2020. Roupas de bebê premium com um toque delicado.
            </p>

            {socialEntries.length > 0 && (
              <div className="flex gap-3">
                {socialEntries.map((social) => (
                  <a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 min-w-11 min-h-11 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-baby-pink"
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
            <h3 className="font-serif text-lg mb-4">Contato</h3>
            <ul className="space-y-3 font-sans text-white/70 text-sm">
              <li className="flex items-start gap-3">
                <FiMapPin className="shrink-0 mt-1" size={16} aria-hidden="true" />
                <span>
                  {siteConfig.storeAddressLine}
                  {siteConfig.storeCityState && (
                    <>
                      <br />
                      {siteConfig.storeCityState}
                    </>
                  )}
                </span>
              </li>
              <li className="flex items-center gap-3">
                <FiPhone size={16} aria-hidden="true" />
                <span>+55 (11) 1234-5678</span>
              </li>
              <li className="flex items-center gap-3">
                <FiMail size={16} aria-hidden="true" />
                <span>contato@nobreamorbaby.com</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="font-sans text-white/50 text-sm text-center md:text-left">
              &copy; 2025 Nobre Amor Baby. Todos os direitos reservados.
            </p>
            <div className="flex gap-6">
              <Link to="/privacidade" className="font-sans text-white/50 text-sm hover:text-white/70 transition-colors focus:outline-none focus:ring-2 focus:ring-baby-pink rounded py-1">
                Política de Privacidade
              </Link>
              <Link to="/termos" className="font-sans text-white/50 text-sm hover:text-white/70 transition-colors focus:outline-none focus:ring-2 focus:ring-baby-pink rounded py-1">
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
      <h3 className="font-serif text-lg mb-4">{title}</h3>
      <ul className="space-y-3">
        {links.map((link) => (
          <li key={link.name}>
            <Link
              to={link.to}
              className="font-sans text-white/70 text-sm hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-baby-pink rounded py-1 inline-block"
            >
              {link.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
