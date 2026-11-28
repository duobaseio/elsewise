/**
 * Converts a display name into kebab case (e.g. lowercase words joined by `-`).
 */
export function kebabCase(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1-$2')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
