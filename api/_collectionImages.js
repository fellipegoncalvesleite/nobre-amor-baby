export const COLLECTION_IMAGE_PATHS = Object.freeze({
  enxoval: '/images/collections/enxoval.jpg',
  inverno: '/images/collections/inverno.jpg',
  menina: '/images/collections/menina.jpg',
  menino: '/images/collections/menino.jpg',
  'recem-nascido': '/images/collections/recem-nascido.jpg',
});

function isPicsumPlaceholder(url) {
  return typeof url === 'string' && url.startsWith('https://picsum.photos/');
}

export function replacePlaceholderCollectionImage(collection) {
  const generated = COLLECTION_IMAGE_PATHS[collection?.slug];
  if (!generated || !isPicsumPlaceholder(collection?.image_url)) return collection;

  return {
    ...collection,
    image_url: generated,
  };
}

export function replacePlaceholderCollectionImageList(collections) {
  return (collections || []).map(replacePlaceholderCollectionImage);
}
