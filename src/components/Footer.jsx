import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiFacebook,
  FiInstagram,
  FiMail,
  FiMapPin,
  FiPhone,
} from 'react-icons/fi';
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

export default function Footer() {
  return (
    <footer className="bg-baby-text dark:bg-[#13101A] text-white">
      {siteConfig.instagramUrl && (
        <div className="border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="max-w-xl mx-auto text-center"
            >
              <h2 className="font-serif text-2xl lg:text-3xl mb-2">Faça parte da Família Pequeno Encanto</h2>
              <p className="font-sans text-white/70 text-sm mb-5">
                Acompanhe as novidades da loja no Instagram.
              </p>
              <a
                href={siteConfig.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-11 px-6 bg-baby-pink text-baby-text rounded-full font-sans font-semibold text-sm hover:bg-baby-pink-light active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-baby-pink focus:ring-offset-2 focus:ring-offset-baby-text"
              >
                <FiInstagram size={18} />
                Seguir {siteConfig.instagramHandle || 'no Instagram'}
              </a>
            </motion.div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 lg:gap-12">
          <div className="col-span-2 lg:col-span-1">
            {/* Single brand lockup — rendered as a CSS mask so the mark tints cleanly
                on the dark footer background, matching the header treatment. */}
            <Link
              to="/"
              className="inline-flex items-center mb-5 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-baby-pink rounded-2xl"
              aria-label="Pequeno Encanto — página inicial"
            >
              <span
                aria-hidden="true"
                className="block h-24 sm:h-28 aspect-[860/680] bg-white"
                style={{
                  WebkitMaskImage: 'url(/logo.png)',
                  maskImage: 'url(/logo.png)',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                }}
              />
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
