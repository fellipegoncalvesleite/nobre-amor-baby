/**
 * ViaCEP address-to-CEP lookup utility.
 *
 * Uses the public ViaCEP API (no auth required):
 *   GET https://viacep.com.br/ws/{UF}/{CIDADE}/{LOGRADOURO}/json/
 *
 * ── Quick test cases ────────────────────────────────────
 * | UF | Cidade      | Rua               | Expected               |
 * |----|-------------|-------------------|------------------------|
 * | SP | São Paulo   | Praça da Sé       | multiple results w/ CEP|
 * | MG | Divinópolis | Cabo Maurício     | results near store     |
 * | XX | Nada        | zzz               | empty array            |
 * | (offline)                             | throws Error           |
 */

/* ── Helpers ──────────────────────────────────────────── */

/** Strip non-digit characters. */
export function digitsOnly(str) {
  return String(str).replace(/\D/g, '');
}

/** Format 8-digit CEP as "00000-000". */
export function formatCep(cepDigits) {
  const d = digitsOnly(cepDigits);
  if (d.length !== 8) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Remove diacritics (accents) from a string. */
export function stripAccents(str) {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalise a string for ViaCEP URL segments.
 * - trim & collapse whitespace
 * - remove trailing house number ("Rua X 102" → "Rua X")
 * - strip accents for better hit-rate
 * - strip dangerous URL chars
 */
export function normalizeForViaCep(str) {
  let s = String(str).trim().replace(/\s+/g, ' ');
  // Remove trailing house number (digits optionally followed by more text)
  s = s.replace(/\s+\d+.*$/, '');
  s = stripAccents(s);
  s = s.replace(/[#?&/\\]/g, '');
  return s;
}

/* ── API ──────────────────────────────────────────────── */

/**
 * Look up a single CEP and return its city / UF / address info.
 *
 * Uses: GET https://viacep.com.br/ws/{CEP}/json/
 *
 * @param {string} cep — 8-digit CEP (digits only)
 * @returns {Promise<{ cep: string; logradouro: string; bairro: string; localidade: string; uf: string } | null>}
 *          null when the CEP is invalid or not found.
 */
export async function fetchCepInfo(cep) {
  const digits = digitsOnly(cep);
  if (digits.length !== 8) return null;

  const url = `https://viacep.com.br/ws/${digits}/json/`;
  const res = await fetch(url);

  if (!res.ok) return null;

  const data = await res.json();

  // ViaCEP returns { erro: true } for non-existent CEPs
  if (data && data.erro) return null;

  return {
    cep: digitsOnly(data.cep || ''),
    logradouro: data.logradouro || '',
    bairro: data.bairro || '',
    localidade: data.localidade || '',
    uf: data.uf || '',
  };
}

/**
 * Search CEPs that match a given address via ViaCEP.
 *
 * @param {{ uf: string; city: string; street: string }} params
 * @returns {Promise<{ results: Array<{ cep: string; logradouro: string; bairro: string; localidade: string; uf: string; complemento: string }>, url: string, status: number }>}
 */
export async function searchCepByAddress({ uf, city, street }) {
  const ufNorm = stripAccents(uf.trim().toUpperCase());
  const cityNorm = normalizeForViaCep(city);
  const streetNorm = normalizeForViaCep(street);

  const url = `https://viacep.com.br/ws/${encodeURIComponent(ufNorm)}/${encodeURIComponent(cityNorm)}/${encodeURIComponent(streetNorm)}/json/`;

  const res = await fetch(url);
  const status = res.status;

  if (!res.ok) {
    return { results: [], url, status };
  }

  const data = await res.json();

  // Single-object { erro: true }
  if (data && data.erro) return { results: [], url, status };

  // Not an array → unexpected shape
  if (!Array.isArray(data)) return { results: [], url, status };

  const results = data.map((item) => ({
    cep: digitsOnly(item.cep || ''),
    logradouro: item.logradouro || '',
    bairro: item.bairro || '',
    localidade: item.localidade || '',
    uf: item.uf || '',
    complemento: item.complemento || '',
  }));

  return { results, url, status };
}
