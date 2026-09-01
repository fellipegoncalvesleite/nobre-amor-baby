import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COLLECTION_IMAGE_PATHS,
  replacePlaceholderCollectionImage,
} from '../api/_collectionImages.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLLECTION_SLUGS = ['enxoval', 'inverno', 'menina', 'menino', 'recem-nascido'];

test('each storefront collection has a local portrait image', async () => {
  assert.deepEqual(Object.keys(COLLECTION_IMAGE_PATHS), COLLECTION_SLUGS);

  for (const slug of COLLECTION_SLUGS) {
    const imagePath = COLLECTION_IMAGE_PATHS[slug];
    assert.equal(imagePath, `/images/collections/${slug}.jpg`);
    await access(resolve(ROOT, 'public', imagePath.slice(1)));
  }
});

test('Picsum collection placeholders are replaced without touching admin uploads', () => {
  const placeholder = {
    slug: 'inverno',
    image_url: 'https://picsum.photos/seed/col-inverno/800/600',
  };
  const uploaded = {
    slug: 'inverno',
    image_url: 'https://cdn.example.com/inverno.webp',
  };

  assert.deepEqual(replacePlaceholderCollectionImage(placeholder), {
    ...placeholder,
    image_url: '/images/collections/inverno.jpg',
  });
  assert.strictEqual(replacePlaceholderCollectionImage(uploaded), uploaded);
});

