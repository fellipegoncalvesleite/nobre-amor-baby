import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowRight } from 'react-icons/fi';

export default function Hero() {
  return (
    <section
      className="relative min-h-[90vh] flex items-center bg-linear-to-br
                 from-baby-cream via-baby-pink-light to-baby-pink pt-20"
      aria-label="Seção principal"
    >
      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-baby-pink/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-baby-accent/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-surface/20 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="text-center lg:text-left"
          >
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="font-serif text-4xl sm:text-5xl lg:text-6xl xl:text-7xl
                         text-baby-text leading-tight mb-6"
            >
              Vista Seu
              <span className="block text-baby-accent">Pequeno Amor</span>
              com Carinho
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="font-sans text-baby-text/70 text-lg sm:text-xl max-w-xl
                         mx-auto lg:mx-0 mb-8 leading-relaxed"
            >
              Descubra nossa coleção exclusiva de roupas para bebês.
              Tecidos macios, designs delicados, feitos com amor para o seu pequeno tesouro.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Link
                to="/novidades"
                className="group inline-flex items-center justify-center gap-2
                           bg-baby-text text-white dark:text-baby-cream px-8 py-4 rounded-full font-sans
                           font-medium text-lg shadow-soft-lg hover:shadow-xl
                           active:scale-[0.97] transform hover:-translate-y-0.5
                           transition-all duration-300
                           focus:outline-none focus:ring-2 focus:ring-baby-accent
                           focus:ring-offset-2"
              >
                Comprar Agora
                <FiArrowRight
                  className="group-hover:translate-x-1 transition-transform"
                  size={20}
                />
              </Link>

              <Link
                to="/colecoes"
                className="inline-flex items-center justify-center gap-2
                           bg-surface/70 backdrop-blur-sm text-baby-text px-8 py-4
                           rounded-full font-sans font-medium text-lg
                           hover:bg-surface active:scale-[0.97]
                           transition-all duration-300
                           focus:outline-none focus:ring-2 focus:ring-baby-accent
                           focus:ring-offset-2"
              >
                Ver Coleções
              </Link>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.6 }}
              className="flex items-center gap-6 justify-center lg:justify-start mt-10
                         text-baby-text/60 font-sans text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full" />
                Materiais Orgânicos
              </span>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full" />
                Frete Grátis acima de R$150
              </span>
            </motion.div>
          </motion.div>

          {/* Hero image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="relative"
          >
            <div className="relative aspect-4/5 max-w-lg mx-auto">
              <div className="absolute inset-0 bg-surface/40 rounded-[3rem] transform rotate-3 shadow-soft-lg" />
              <div className="relative overflow-hidden rounded-[2.5rem] shadow-soft-lg bg-linear-to-br from-baby-pink-light to-surface">
                <img
                  src="https://images.unsplash.com/photo-1522771930-78848d9293e8?w=600&h=750&fit=crop"
                  alt="Bebê adorável usando roupas em tons pastéis da coleção Nobre Amor Baby"
                  className="w-full h-full object-cover"
                  loading="eager"
                />
                {/* Floating badge */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2, duration: 0.6 }}
                  className="absolute bottom-6 left-6 right-6 bg-surface/90 backdrop-blur-sm
                             rounded-2xl p-4 shadow-soft"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-serif text-baby-text text-lg">Macacão Algodão Orgânico</p>
                      <p className="font-sans text-baby-accent text-sm">A partir de R$129,90</p>
                    </div>
                    <Link
                      to="/produto/1"
                      className="bg-baby-text text-white dark:text-baby-cream p-3 min-w-11 min-h-11
                                 flex items-center justify-center rounded-full
                                 hover:bg-baby-accent active:scale-90
                                 transition-all duration-200
                                 focus:outline-none focus:ring-2 focus:ring-baby-accent"
                      aria-label="Ver Macacão Algodão Orgânico"
                    >
                      <FiArrowRight size={18} />
                    </Link>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
