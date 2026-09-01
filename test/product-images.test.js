import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRODUCT_IMAGE_PATHS,
  replacePlaceholderProductImages,
} from '../api/_productImages.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PRODUCT_SLUGS = [
  'body-manga-longa-pima',
  'macacao-plush-ursinho',
  'vestido-floral-bufante',
  'conjunto-body-calca-listrado',
  'casaquinho-trico-trancado',
  'macacao-longo-canelado',
  'saida-maternidade-3-pecas',
  'kit-3-bodies-curtos',
  'vestido-trico-faixa',
  'sapatinho-trico',
  'kit-touca-luva',
  'manta-cobertor-soft',
  'macacao-pijama-com-pe',
  'body-regata-safari',
];

test('placeholder catalog products receive two local product photos', async () => {
  assert.deepEqual(Object.keys(PRODUCT_IMAGE_PATHS), PRODUCT_SLUGS);

  for (const slug of PRODUCT_SLUGS) {
    const paths = PRODUCT_IMAGE_PATHS[slug];
    assert.deepEqual(paths, [
      `/images/products/${slug}-01.webp`,
      `/images/products/${slug}-02.webp`,
    ]);

    for (const imagePath of paths) {
      await access(resolve(ROOT, 'public', imagePath.slice(1)));
    }
  }
});

test('only Picsum product URLs are replaced while admin uploads are preserved', () => {
  const product = {
    slug: 'body-manga-longa-pima',
    image_urls: [
      'https://cdn.example.com/admin-upload.webp',
      'https://picsum.photos/seed/body-pima-1/600/800',
    ],
  };

  assert.deepEqual(replacePlaceholderProductImages(product), {
    ...product,
    image_urls: [
      'https://cdn.example.com/admin-upload.webp',
      '/images/products/body-manga-longa-pima-01.webp',
    ],
  });
});

