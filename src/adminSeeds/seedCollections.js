/**
 * Seed collections — client-side fallback data for when the DB is
 * not configured or returns an empty list.
 *
 * IDs are deterministic so editing works across renders.
 */

const SEED_COLLECTIONS = [
  {
    id: 'seed-coll-001',
    name: 'Coleção Verão 2026',
    slug: 'colecao-verao-2026',
    description: 'Peças leves e coloridas para os dias quentes. Tecidos frescos e estampas alegres.',
    is_active: true,
    image_url: 'https://placehold.co/800x450/F0DAE8/373438?text=Ver%C3%A3o+2026',
    created_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 'seed-coll-002',
    name: 'Recém-Nascidos',
    slug: 'recem-nascidos',
    description: 'Roupinhas delicadas e confortáveis para os primeiros meses do bebê.',
    is_active: true,
    image_url: 'https://placehold.co/800x450/FDF8FB/A49AAE?text=Rec%C3%A9m-Nascidos',
    created_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 'seed-coll-003',
    name: 'Festa & Batizado',
    slug: 'festa-batizado',
    description: 'Looks especiais para ocasiões memoráveis. Elegância em miniatura.',
    is_active: true,
    image_url: 'https://placehold.co/800x450/A49AAE/FDF8FB?text=Festa+%26+Batizado',
    created_at: '2026-01-05T10:00:00Z',
  },
  {
    id: 'seed-coll-004',
    name: 'Inverno Quentinho',
    slug: 'inverno-quentinho',
    description: 'Casaquinhos, mantas e peças de tricô para aquecer com muito estilo.',
    is_active: true,
    image_url: 'https://placehold.co/800x450/373438/F0DAE8?text=Inverno+Quentinho',
    created_at: '2026-01-01T10:00:00Z',
  },
  {
    id: 'seed-coll-005',
    name: 'Acessórios',
    slug: 'acessorios',
    description: 'Laços, tiaras, sapatos e detalhes que completam o visual.',
    is_active: false,
    image_url: 'https://placehold.co/800x450/F0DAE8/A49AAE?text=Acess%C3%B3rios',
    created_at: '2025-12-20T10:00:00Z',
  },
];

/**
 * Returns a deep copy of seeded collections so callers can
 * safely mutate local state without affecting the constant.
 */
export function getSeededCollections() {
  return SEED_COLLECTIONS.map((c) => ({ ...c }));
}
