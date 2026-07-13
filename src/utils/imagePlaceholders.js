const PLACEHOLDER_HOSTS = new Set(['picsum.photos', 'placehold.co']);

export function isPlaceholderImage(url) {
  if (!url) return true;

  try {
    return PLACEHOLDER_HOSTS.has(new URL(url, 'https://local.invalid').hostname);
  } catch {
    return false;
  }
}
