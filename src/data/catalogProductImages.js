import { isPlaceholderImage } from '../utils/imagePlaceholders.js';

/**
 * Curated catalog photos used only while a product still points at a known
 * placeholder service. Real images uploaded through the admin always win.
 */
const CATALOG_PRODUCT_IMAGES = {
  'body-manga-longa-pima': '/products/body-manga-longa-pima.webp',
  'macacao-plush-ursinho': '/products/macacao-plush-ursinho.webp',
  'vestido-floral-bufante': '/products/vestido-floral-bufante.webp',
  'conjunto-body-calca-listrado': '/products/conjunto-body-calca-listrado.webp',
  'casaquinho-trico-trancado': '/products/casaquinho-trico-trancado.webp',
  'macacao-longo-canelado': '/products/macacao-longo-canelado.webp',
  'saida-maternidade-3-pecas': '/products/saida-maternidade-3-pecas.webp',
  'kit-3-bodies-curtos': '/products/kit-3-bodies-curtos.webp',
  'vestido-trico-faixa': '/products/vestido-trico-faixa.webp',
  'sapatinho-trico': '/products/sapatinho-trico.webp',
  'kit-touca-luva': '/products/kit-touca-luva.webp',
  'manta-cobertor-soft': '/products/manta-cobertor-soft.webp',
  'macacao-pijama-com-pe': '/products/macacao-pijama-com-pe.webp',
  'body-regata-safari': '/products/body-regata-safari.webp',
};

export function resolveProductImages(slug, images) {
  const normalizedImages = images.filter(Boolean);
  const curatedImage = CATALOG_PRODUCT_IMAGES[slug];

  if (!curatedImage) return normalizedImages;
  if (normalizedImages.length > 0 && !normalizedImages.every(isPlaceholderImage)) {
    return normalizedImages;
  }

  return [curatedImage];
}

export default CATALOG_PRODUCT_IMAGES;
