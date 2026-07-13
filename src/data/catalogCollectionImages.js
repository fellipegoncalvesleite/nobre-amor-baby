import { isPlaceholderImage } from '../utils/imagePlaceholders.js';

/**
 * Curated collection covers used only while the database still references a
 * placeholder. A real cover uploaded through the admin always takes priority.
 */
const CATALOG_COLLECTION_IMAGES = {
  enxoval: '/collections/enxoval.webp',
  inverno: '/collections/inverno.webp',
  menina: '/collections/menina.webp',
  menino: '/collections/menino.webp',
  'recem-nascido': '/collections/recem-nascido.webp',
};

export function resolveCollectionImage(slug, image) {
  const curatedImage = CATALOG_COLLECTION_IMAGES[slug];
  if (!curatedImage || !isPlaceholderImage(image)) return image || '';
  return curatedImage;
}

export default CATALOG_COLLECTION_IMAGES;
