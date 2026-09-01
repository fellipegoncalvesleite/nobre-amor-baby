export const PRODUCT_IMAGE_PATHS = Object.freeze({
  'body-manga-longa-pima': ['/images/products/body-manga-longa-pima-01.webp', '/images/products/body-manga-longa-pima-02.webp'],
  'macacao-plush-ursinho': ['/images/products/macacao-plush-ursinho-01.webp', '/images/products/macacao-plush-ursinho-02.webp'],
  'vestido-floral-bufante': ['/images/products/vestido-floral-bufante-01.webp', '/images/products/vestido-floral-bufante-02.webp'],
  'conjunto-body-calca-listrado': ['/images/products/conjunto-body-calca-listrado-01.webp', '/images/products/conjunto-body-calca-listrado-02.webp'],
  'casaquinho-trico-trancado': ['/images/products/casaquinho-trico-trancado-01.webp', '/images/products/casaquinho-trico-trancado-02.webp'],
  'macacao-longo-canelado': ['/images/products/macacao-longo-canelado-01.webp', '/images/products/macacao-longo-canelado-02.webp'],
  'saida-maternidade-3-pecas': ['/images/products/saida-maternidade-3-pecas-01.webp', '/images/products/saida-maternidade-3-pecas-02.webp'],
  'kit-3-bodies-curtos': ['/images/products/kit-3-bodies-curtos-01.webp', '/images/products/kit-3-bodies-curtos-02.webp'],
  'vestido-trico-faixa': ['/images/products/vestido-trico-faixa-01.webp', '/images/products/vestido-trico-faixa-02.webp'],
  'sapatinho-trico': ['/images/products/sapatinho-trico-01.webp', '/images/products/sapatinho-trico-02.webp'],
  'kit-touca-luva': ['/images/products/kit-touca-luva-01.webp', '/images/products/kit-touca-luva-02.webp'],
  'manta-cobertor-soft': ['/images/products/manta-cobertor-soft-01.webp', '/images/products/manta-cobertor-soft-02.webp'],
  'macacao-pijama-com-pe': ['/images/products/macacao-pijama-com-pe-01.webp', '/images/products/macacao-pijama-com-pe-02.webp'],
  'body-regata-safari': ['/images/products/body-regata-safari-01.webp', '/images/products/body-regata-safari-02.webp'],
});

function isPicsumPlaceholder(url) {
  return typeof url === 'string' && url.startsWith('https://picsum.photos/');
}

export function replacePlaceholderProductImages(product) {
  const generated = PRODUCT_IMAGE_PATHS[product?.slug];
  const current = Array.isArray(product?.image_urls) ? product.image_urls : [];
  if (!generated || !current.some(isPicsumPlaceholder)) return product;

  const uploaded = current.filter((url) => url && !isPicsumPlaceholder(url));
  return {
    ...product,
    image_urls: [...uploaded, ...generated].slice(0, 2),
  };
}

export function replacePlaceholderProductImageList(products) {
  return (products || []).map(replacePlaceholderProductImages);
}
