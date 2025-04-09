/**
 * OrderSuccessPage — shown after a successful checkout.
 *
 * Route: /pedido-enviado
 * Receives orderCode via location.state or reads from localStorage.
 */
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCheck, FiShoppingBag, FiList } from 'react-icons/fi';
import { btnPrimary, btnSecondary } from '../lib/ui';
import { getLastOrderId } from '../utils/orderMessage';

export default function OrderSuccessPage() {
  const location = useLocation();
  const orderCode = location.state?.orderCode || getLastOrderId();

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-lg mx-auto px-4 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
          <div className="w-20 h-20 mx-auto mb-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <FiCheck size={36} className="text-green-600" />
          </div>
        </motion.div>

        <h1 className="font-serif text-3xl sm:text-4xl text-baby-text mb-4">
          Pedido Enviado!
        </h1>

        {orderCode && (
          <div className="mb-6 p-4 bg-surface rounded-2xl shadow-soft">
            <p className="font-sans text-xs text-baby-text/50 mb-1 uppercase tracking-wider">Código do pedido</p>
            <p className="font-mono text-lg text-baby-accent font-bold select-all">{orderCode}</p>
          </div>
        )}

        <p className="font-sans text-baby-text/60 text-base mb-8 leading-relaxed">
          Seu pedido foi registrado com sucesso. Acompanhe o status na página
          {' '}<strong>Meus Pedidos</strong>.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/meus-pedidos" className={btnPrimary}>
            <FiList size={16} />
            Meus Pedidos
          </Link>
          <Link to="/" className={btnSecondary}>
            <FiShoppingBag size={16} />
            Continuar Comprando
          </Link>
        </div>
      </div>
    </section>
  );
}
