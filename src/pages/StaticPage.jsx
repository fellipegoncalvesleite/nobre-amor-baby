import { Link } from 'react-router-dom';
import { btnPrimary } from '../lib/ui';
import siteConfig from '../config/siteConfig';

/* ── Content blocks for each static page ─────────────── */

const pages = {
  sobre: {
    title: 'Sobre a Loja',
    content: (
      <>
        <h2>Como nasceu a Pequeno Encanto</h2>
        <p>
          A <strong>{siteConfig.brandName}</strong> nasceu da necessidade de oferecer peças de crochê
          de última hora para clientes que queriam presentear alguém especial e não encontravam
          opções rápidas. O que começou como uma resposta a esses pedidos virou uma loja com
          identidade, cuidado e carinho em cada etapa.
        </p>

        <h2>Quem criou</h2>
        <p>
          A loja foi criada por mim, em parceria com a minha sogra. Nesta nova fase, a minha
          prima e comadre se juntou a nós, trazendo ainda mais amor e experiência para a marca.
        </p>

        <h2>Desde quando existe</h2>
        <p>Estamos no mercado desde <strong>{siteConfig.foundedAt}</strong>.</p>

        <h2>O que queremos transmitir com a marca</h2>
        <p>
          Queremos oferecer aos nossos clientes roupas diferenciadas, que transmitem toda a
          essência e a pureza da infância.
        </p>

        <h2>O que nos torna especiais</h2>
        <p>
          Nosso foco é sempre oferecer roupas sofisticadas, com acabamento premium, tecidos de
          qualidade e toque macio. Valorizamos a durabilidade das peças e a liberdade de
          movimento dos bebês, porque os primeiros momentos da vida merecem o melhor.
        </p>

        <h2>Fale com a gente</h2>
        <p>
          WhatsApp: <a href={`https://wa.me/${siteConfig.whatsappNumber}`} target="_blank" rel="noopener noreferrer"><strong>{siteConfig.whatsappDisplay}</strong></a>
          <br />
          E-mail: <a href={`mailto:${siteConfig.contactEmail}`}><strong>{siteConfig.contactEmail}</strong></a>
          <br />
          Instagram: <a href={siteConfig.instagramUrl} target="_blank" rel="noopener noreferrer"><strong>{siteConfig.instagramHandle}</strong></a>
          <br />
          Facebook: <a href={siteConfig.facebookUrl} target="_blank" rel="noopener noreferrer"><strong>pequeno encanto</strong></a>
        </p>
        <p>
          Endereço: {siteConfig.storeAddressLine}, {siteConfig.storeCityState}.
          {siteConfig.pickupAvailable && ' Retirada no local disponível.'}
        </p>
      </>
    ),
  },
  faq: {
    title: 'Perguntas Frequentes',
    content: (
      <>
        <h2>Quais formas de pagamento vocês aceitam?</h2>
        <p>
          Aceitamos dinheiro, cartão de crédito e débito, Pix, link de pagamento e depósito
          bancário.
        </p>

        <h2>Quanto tempo levam para postar o pedido?</h2>
        <p>Postamos o pedido em <strong>1 dia útil</strong> após a confirmação do pagamento.</p>

        <h2>Qual o prazo médio de entrega?</h2>
        <p>
          O prazo de entrega varia conforme a localidade, mas geralmente fica em torno de
          1 dia útil após a postagem para entregas locais, podendo ser maior para outras
          regiões.
        </p>

        <h2>Vocês fazem embalagem para presente?</h2>
        <p>Sim! Embrulhamos as peças para presente sem custo adicional.</p>

        <h2>As peças são pronta-entrega?</h2>
        <p>
          Sim, todos os itens disponíveis no site são <strong>pronta-entrega</strong>.
        </p>

        <h2>Posso retirar o pedido na loja?</h2>
        <p>
          Sim, oferecemos retirada no local em Divinópolis/MG. Combine a retirada com a gente
          pelo WhatsApp após o pagamento.
        </p>

        <h2>Como faço para trocar ou devolver?</h2>
        <p>
          Trocas podem ser solicitadas em até <strong>15 dias</strong> após o recebimento.
          Devoluções em até <strong>7 dias</strong>. Peças com defeito têm troca garantida e
          o frete da troca é por nossa conta. Veja detalhes em{' '}
          <Link to="/envio-e-trocas">Envio e Trocas</Link>.
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
        <p>
          Ainda em dúvida? Fale com a gente pelo WhatsApp {siteConfig.whatsappDisplay} que
          ajudamos a escolher.
        </p>
      </>
    ),
  },
  'envio-e-trocas': {
    title: 'Envio, Trocas e Devoluções',
    content: (
      <>
        <h2>Envio</h2>
        <p>
          Todos os pedidos são postados em <strong>até 1 dia útil</strong> após a confirmação
          do pagamento. O prazo médio de entrega é de 1 dia útil para a região de
          Divinópolis/MG e varia conforme a transportadora para outras localidades.
        </p>
        <p>
          Enviamos o código de rastreio pelo WhatsApp e acompanhamos de perto o trajeto do
          pedido até chegar na casa do cliente.
        </p>
        <p>Retirada no local disponível em Divinópolis/MG.</p>

        <h2>Trocas</h2>
        <p>
          Você pode solicitar a troca em até <strong>15 dias</strong> após o recebimento. O
          frete da troca é por nossa conta.
        </p>
        <p>
          Produtos em promoção <strong>não têm troca</strong> disponível.
        </p>

        <h2>Devoluções</h2>
        <p>
          Você pode solicitar a devolução em até <strong>7 dias</strong> após o recebimento
          da peça.
        </p>

        <h2>Produto com defeito</h2>
        <p>
          Se o produto chegar com defeito, você pode solicitar a troca ou a devolução do
          item. Nós arcamos com o frete nesses casos.
        </p>

        <h2>Como solicitar</h2>
        <p>
          Entre em contato pelo WhatsApp{' '}
          <a href={`https://wa.me/${siteConfig.whatsappNumber}`} target="_blank" rel="noopener noreferrer"><strong>{siteConfig.whatsappDisplay}</strong></a>{' '}
          informando o número do pedido e o motivo da solicitação. Resolvemos tudo por lá.
        </p>
      </>
    ),
  },
  privacidade: {
    title: 'Política de Privacidade',
    content: (
      <>
        <p>
          A {siteConfig.brandName} respeita a privacidade dos seus clientes e leva a sério a
          proteção dos dados pessoais.
        </p>

        <h2>Quais dados coletamos</h2>
        <p>
          Coletamos apenas os dados necessários para processar pedidos e manter o atendimento:
          nome, e-mail, telefone, CPF (quando necessário para emissão de nota ou pagamento) e
          endereço de entrega.
        </p>

        <h2>Para que usamos esses dados</h2>
        <p>
          Os dados são usados para confirmar o pedido, processar o pagamento, organizar o
          envio e manter contato sobre o status da compra, trocas e pós-venda.
        </p>

        <h2>Compartilhamento</h2>
        <p>
          Os dados podem ser compartilhados apenas com parceiros essenciais para o pedido —
          por exemplo, o provedor de pagamento e a transportadora. Não compartilhamos seus
          dados com terceiros para fins de marketing.
        </p>

        <h2>Exclusão de dados</h2>
        <p>
          Você pode solicitar a exclusão dos seus dados a qualquer momento enviando uma
          mensagem para{' '}
          <a href={`mailto:${siteConfig.contactEmail}`}><strong>{siteConfig.contactEmail}</strong></a>.
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
          <li>Os preços e a disponibilidade dos produtos podem ser alterados sem aviso prévio.</li>
          <li>As imagens são ilustrativas e as cores podem variar levemente conforme o monitor.</li>
          <li>Pedidos estão sujeitos à confirmação de estoque e do pagamento.</li>
          <li>
            Caso ocorra um erro de preço, você paga o menor valor exibido entre os preços
            mostrados.
          </li>
          <li>
            Se um item estiver esgotado, devolvemos o valor pago ou você pode optar por outro
            modelo ou tamanho equivalente.
          </li>
          <li>
            O cancelamento pode ser solicitado pelo WhatsApp em casos como produto esgotado,
            produto com defeito, problemas na entrega ou falhas no pagamento.
          </li>
          <li>
            A {siteConfig.brandName} reserva-se o direito de cancelar pedidos em caso de
            informações incorretas ou suspeitas de fraude.
          </li>
        </ul>
        <p>
          Para dúvidas sobre estes termos, entre em contato pelo WhatsApp{' '}
          <a href={`https://wa.me/${siteConfig.whatsappNumber}`} target="_blank" rel="noopener noreferrer"><strong>{siteConfig.whatsappDisplay}</strong></a>.
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
                        [&_a]:text-baby-accent [&_a]:underline [&_a]:decoration-baby-accent/40 [&_a]:underline-offset-2 hover:[&_a]:decoration-baby-accent
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
