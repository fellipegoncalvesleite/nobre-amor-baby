/** @type {{ id: string; slug: string; name: string; label: string; description: string; image: string }[]} */
const categories = [
  {
    id: 'recem-nascido',
    slug: 'recem-nascido',
    name: 'Recém-nascido (RN)',
    label: 'Recém-nascido',
    description: 'Para o seu pequeno tesouro',
    image: 'https://picsum.photos/seed/cat-recem-nascido/400/500',
  },
  {
    id: '0-3m',
    slug: '0-3m',
    name: '0-3 Meses',
    label: '0-3 Meses',
    description: 'Coleção primeiros sorrisos',
    image: 'https://picsum.photos/seed/cat-0-3m/400/500',
  },
  {
    id: '3-6m',
    slug: '3-6m',
    name: '3-6 Meses',
    label: '3-6 Meses',
    description: 'Aventuras em crescimento',
    image: 'https://picsum.photos/seed/cat-3-6m/400/500',
  },
  {
    id: '6-12m',
    slug: '6-12m',
    name: '6-12 Meses',
    label: '6-12 Meses',
    description: 'Estilos para pequenos exploradores',
    image: 'https://picsum.photos/seed/cat-6-12m/400/500',
  },
  {
    id: 'essenciais',
    slug: 'essenciais',
    name: 'Essenciais',
    label: 'Essenciais',
    description: 'Básicos indispensáveis',
    image: 'https://picsum.photos/seed/cat-essenciais/400/500',
  },
  {
    id: 'presentes',
    slug: 'presentes',
    name: 'Presentes',
    label: 'Presentes',
    description: 'Presentes perfeitos',
    image: 'https://picsum.photos/seed/cat-presentes/400/500',
  },
];

export default categories;

/**
 * Look up a category by its slug.
 * @param {string} slug
 */
export function getCategoryBySlug(slug) {
  return categories.find((c) => c.slug === slug) ?? null;
}
