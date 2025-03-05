/** @type {{ id: string; slug: string; name: string; label: string; description: string; image: string }[]} */
const categories = [
  {
    id: 'recem-nascido',
    slug: 'recem-nascido',
    name: 'Recém-nascido (RN)',
    label: 'Recém-nascido',
    description: 'Para o seu pequeno tesouro',
    image: 'https://images.unsplash.com/photo-1522771930-78848d9293e8?w=400&h=500&fit=crop',
  },
  {
    id: '0-3m',
    slug: '0-3m',
    name: '0-3 Meses',
    label: '0-3 Meses',
    description: 'Coleção primeiros sorrisos',
    image: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=400&h=500&fit=crop',
  },
  {
    id: '3-6m',
    slug: '3-6m',
    name: '3-6 Meses',
    label: '3-6 Meses',
    description: 'Aventuras em crescimento',
    image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=400&h=500&fit=crop',
  },
  {
    id: '6-12m',
    slug: '6-12m',
    name: '6-12 Meses',
    label: '6-12 Meses',
    description: 'Estilos para pequenos exploradores',
    image: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=400&h=500&fit=crop',
  },
  {
    id: 'essenciais',
    slug: 'essenciais',
    name: 'Essenciais',
    label: 'Essenciais',
    description: 'Básicos indispensáveis',
    image: 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=400&h=500&fit=crop',
  },
  {
    id: 'presentes',
    slug: 'presentes',
    name: 'Presentes',
    label: 'Presentes',
    description: 'Presentes perfeitos',
    image: 'https://images.unsplash.com/photo-1504151932400-72d4384f04b3?w=400&h=500&fit=crop',
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
