-- ============================================================
-- Nobre Amor Baby — replace randomized catalog product imagery
-- Run after migration_022_order_closure_transition_guard.sql.
--
-- This migration is intentionally data-only and idempotent. It updates the
-- current demo catalog by stable product slug, but only while at least one
-- image is still a Picsum placeholder. Real images uploaded by an admin are
-- therefore left untouched if they have already replaced the placeholders.
-- ============================================================

update public.products as p
set image_urls = v.image_urls
from (
  values
    (
      'body-manga-longa-pima',
      array['https://images.pexels.com/photos/16681603/pexels-photo-16681603.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'macacao-plush-ursinho',
      array['https://images.pexels.com/photos/14471948/pexels-photo-14471948.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'vestido-floral-bufante',
      array['https://images.pexels.com/photos/14557965/pexels-photo-14557965.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'conjunto-body-calca-listrado',
      array['https://images.pexels.com/photos/5791341/pexels-photo-5791341.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'casaquinho-trico-trancado',
      array['https://images.pexels.com/photos/35335057/pexels-photo-35335057.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'macacao-longo-canelado',
      array['https://images.pexels.com/photos/35245336/pexels-photo-35245336.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'saida-maternidade-3-pecas',
      array['https://images.pexels.com/photos/36884142/pexels-photo-36884142.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'kit-3-bodies-curtos',
      array['https://images.pexels.com/photos/34121886/pexels-photo-34121886.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'vestido-trico-faixa',
      array['https://images.pexels.com/photos/7289031/pexels-photo-7289031.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'sapatinho-trico',
      array['https://images.pexels.com/photos/31769696/pexels-photo-31769696.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'kit-touca-luva',
      array['https://images.pexels.com/photos/14927270/pexels-photo-14927270.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'manta-cobertor-soft',
      array['https://images.pexels.com/photos/4964494/pexels-photo-4964494.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'macacao-pijama-com-pe',
      array['https://images.pexels.com/photos/5913984/pexels-photo-5913984.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    ),
    (
      'body-regata-safari',
      array['https://images.pexels.com/photos/12533015/pexels-photo-12533015.jpeg?auto=compress&cs=tinysrgb&w=600&h=800&fit=crop']::text[]
    )
) as v(slug, image_urls)
where p.slug = v.slug
  and exists (
    select 1
    from unnest(coalesce(p.image_urls, '{}'::text[])) as current_image(url)
    where current_image.url like 'https://picsum.photos/%'
  );
