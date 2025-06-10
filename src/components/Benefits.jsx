import { motion } from 'framer-motion';
import { FiAward, FiTruck, FiRefreshCw, FiGift } from 'react-icons/fi';
import { benefits } from '../data/products';

const iconMap = {
  quality: FiAward,
  shipping: FiTruck,
  returns: FiRefreshCw,
  gift: FiGift,
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

export default function Benefits() {
  return (
    <section 
      id="benefits"
      className="py-16 lg:py-20 bg-baby-pink scroll-mt-20"
      aria-labelledby="benefits-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="benefits-heading" className="sr-only">
          Por Que Comprar Conosco
        </h2>
        
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8"
        >
          {benefits.map((benefit) => {
            const IconComponent = iconMap[benefit.icon];
            
            return (
              <motion.div
                key={benefit.id}
                variants={itemVariants}
                className="bg-surface/50 backdrop-blur-sm rounded-2xl p-6 lg:p-8 
                           text-center hover:bg-surface/70 transition-colors duration-300"
              >
                <div 
                  className="inline-flex items-center justify-center w-14 h-14 
                             bg-baby-cream rounded-full mb-4"
                  aria-hidden="true"
                >
                  <IconComponent className="text-baby-accent" size={26} />
                </div>
                <h3 className="font-serif text-baby-text text-lg lg:text-xl mb-2">
                  {benefit.title}
                </h3>
                <p className="font-sans text-baby-text/60 text-sm lg:text-base">
                  {benefit.description}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
