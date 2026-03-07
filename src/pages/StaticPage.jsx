import { Link } from 'react-router-dom';
import { btnPrimary } from '../lib/ui';
import siteConfig from '../config/siteConfig';

/* ── Content blocks for each static page ─────────────── */

const pages = {
  sobre: {
    title: 'Sobre Nós',
    content: (
      <>
        <p>
          A <strong>{siteConfig.brandName}</strong> nasceu em 2020 do desejo de vestir cada bebê com amor,
          conforto e qualidade premium. Acreditamos que os primeiros momentos da vida merecem o toque
          mais suave — por isso selecionamos apenas tecidos orgânicos, corantes seguros e acabamentos
          artesanais.
        </p>
        <p>
          Nossa coleção é pensada para acompanhar cada fase do crescimento, do recém-nascido ao
          primeiro aniversário, unindo design delicado e funcionalidade para o dia a dia.
        </p>
        <h2>Nossa Missão</h2>
        <p>
          Tornar cada peça uma expressão de carinho — para quem veste e para quem presenteia.
          Sustentabilidade, transparência e atenção aos detalhes guiam cada decisão.
        </p>
      </>
    ),
  },
  faq: {
    title: 'Perguntas Frequentes',
    content: (
      <>
        <h2>Como faço um pedido?</h2>
        <p>
          Navegue pelos produtos, adicione ao carrinho e clique em "Finalizar Pedido". Preencha seus
          dados e envie a solicitação. Entraremos em contato para confirmar e combinar o pagamento.
        </p>
        <h2>Quais formas de pagamento vocês aceitam?</h2>
        <p>
          Aceitamos Pix, transferência bancária e cartão de crédito (via link de pagamento). Os
          detalhes são enviados após confirmação do pedido.
        </p>
        <h2>Qual o prazo de entrega?</h2>
        <p>
          Pedidos são preparados em até 3 dias úteis. O prazo de entrega depende da sua localização
          e da transportadora escolhida — geralmente entre 5 e 12 dias úteis.
        </p>
        <h2>Posso trocar ou devolver um produto?</h2>
        <p>
          Sim! Aceitamos trocas e devoluções em até 30 dias após o recebimento, desde que o produto
          esteja em perfeitas condições e com a etiqueta original.
        </p>
      </>
    ),
  },
  'guia-de-tamanhos': {
    title: 'Guia de Tamanhos',
    content: (
      <>
        <p>Use a tabela abaixo como referência. Em caso de dúvida, escolha o tamanho maior.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-baby-pink">
                <th className="py-3 pr-4 font-medium">Tamanho</th>
                <th className="py-3 pr-4 font-medium">Idade</th>
                <th className="py-3 pr-4 font-medium">Peso (kg)</th>
                <th className="py-3 font-medium">Altura (cm)</th>
              </tr>
            </thead>
            <tbody className="text-baby-text/70">
              <tr className="border-b border-baby-pink/50"><td className="py-2.5 pr-4">RN</td><td className="py-2.5 pr-4">0-1 mês</td><td className="py-2.5 pr-4">2,5-4</td><td className="py-2.5">até 52</td></tr>
              <tr className="border-b border-baby-pink/50"><td className="py-2.5 pr-4">0-3m</td><td className="py-2.5 pr-4">0-3 meses</td><td className="py-2.5 pr-4">4-6</td><td className="py-2.5">52-60</td></tr>
              <tr className="border-b border-baby-pink/50"><td className="py-2.5 pr-4">3-6m</td><td className="py-2.5 pr-4">3-6 meses</td><td className="py-2.5 pr-4">6-8</td><td className="py-2.5">60-67</td></tr>
              <tr><td className="py-2.5 pr-4">6-12m</td><td className="py-2.5 pr-4">6-12 meses</td><td className="py-2.5 pr-4">8-10</td><td className="py-2.5">67-76</td></tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  'envio-e-trocas': {
    title: 'Envio e Trocas',
    content: (
      <>
        <h2>Política de Envio</h2>
        <p>
          Pedidos acima de R$&nbsp;150 possuem <strong>frete grátis</strong> para todo o Brasil.
          Para valores abaixo, o custo de envio é calculado no momento do pedido.
        </p>
        <p>O prazo de preparação é de até 3 dias úteis. A entrega varia de 5 a 12 dias úteis.</p>
        <h2>Trocas e Devoluções</h2>
        <p>
          Aceitamos trocas em até 30 dias corridos após o recebimento. O produto deve estar sem uso,
          com etiquetas e na embalagem original.
        </p>
        <p>
          Para solicitar uma troca, entre em contato conosco informando o número do pedido e o
          motivo. O frete de devolução é por nossa conta em caso de defeito.
        </p>
      </>
    ),
  },
  privacidade: {
    title: 'Política de Privacidade',
    content: (
      <>
        <p>
          A {siteConfig.brandName} respeita a privacidade dos seus clientes. Coletamos apenas os
          dados necessários para processar pedidos: nome, e-mail, telefone e endereço de entrega.
        </p>
        <p>
          Seus dados não são compartilhados com terceiros para fins de marketing. Utilizamos
          cookies essenciais para o funcionamento do site. Você pode solicitar a exclusão dos seus
          dados a qualquer momento entrando em contato conosco.
        </p>
      </>
    ),
  },
  termos: {
    title: 'Termos de Uso',
    content: (
      <>
        <p>
          Ao utilizar o site da {siteConfig.brandName}, você concorda com os seguintes termos:
        </p>
        <ul>
          <li>Os preços podem ser alterados sem aviso prévio.</li>
          <li>As imagens são ilustrativas; cores podem variar levemente conforme o monitor.</li>
          <li>Pedidos estão sujeitos à confirmação de disponibilidade.</li>
          <li>
            A {siteConfig.brandName} reserva-se o direito de cancelar pedidos em caso de
            informações incorretas ou fraude.
          </li>
        </ul>
        <p>
          Para dúvidas sobre estes termos, entre em contato conosco.
        </p>
      </>
    ),
  },
  404: {
    title: 'Página não encontrada',
    content: (
      <p>A página que você está procurando não existe ou foi movida.</p>
    ),
  },
};

export default function StaticPage({ page }) {
  const data = pages[page] ?? pages['404'];

  return (
    <section className="pt-24 pb-16 lg:pt-28 lg:pb-24 bg-baby-cream min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 font-sans text-sm text-baby-text/60" aria-label="Navegação de caminho">
          <ol className="flex items-center gap-1.5">
            <li><Link to="/" className="hover:text-baby-accent transition-colors">Início</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-baby-text font-medium">{data.title}</li>
          </ol>
        </nav>

        <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-baby-text mb-10">
          {data.title}
        </h1>

        <div className="prose-baby font-sans text-baby-text/80 leading-relaxed space-y-4
                        [&_h2]:font-serif [&_h2]:text-xl [&_h2]:text-baby-text [&_h2]:mt-8 [&_h2]:mb-3
                        [&_p]:mb-4 [&_strong]:text-baby-text
                        [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2
                        [&_table]:font-sans [&_table]:text-sm
                        [&_th]:font-serif [&_th]:text-baby-text">
          {data.content}
        </div>

        <div className="mt-12">
          <Link to="/" className={btnPrimary}>
            Voltar à Loja
          </Link>
        </div>
      </div>
    </section>
  );
}
