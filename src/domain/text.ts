/** Small, dependency-free text helpers shared by importer, map and UI. */

/** Remove markdown emphasis markers, keeping the words. */
export function stripMd(s: string): string {
  return s
    .replace(/\*\*|~~/g, '')
    .replace(/\*([^*\s][^*]*?)\*/g, '$1');
}

/** ASCII slug; diacritics folded (Kharûn -> kharun). */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** cyrb53: fast 53-bit string hash. Used for ids and change detection only. */
export function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-name matcher that respects Unicode letters (so "Harrow" does not match "Harrowmere"). */
export function nameRegex(name: string, flags = 'u'): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, flags);
}

export function firstWords(s: string, n: number): string {
  const words = s.trim().split(/\s+/);
  return words.length <= n ? words.join(' ') : words.slice(0, n).join(' ') + '…';
}

export function removeParens(s: string): string {
  let prev: string;
  let out = s;
  do {
    prev = out;
    out = out.replace(/\s*\([^()]*\)/g, '');
  } while (out !== prev);
  return out;
}

/** Index of the first ':' or ' — ' that is not inside parentheses, or -1. */
export function firstDelimiter(s: string): { index: number; length: number } | null {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (c === ':') return { index: i, length: 1 };
      if (c === '—' && s[i - 1] === ' ' && s[i + 1] === ' ') return { index: i - 1, length: 3 };
    }
  }
  return null;
}
