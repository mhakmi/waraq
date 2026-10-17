export const recentSearchLimit = 8;

export function withRecentSearch(recent: string[], term: string): string[] {
  const trimmed = term.trim();
  if (trimmed === '') {
    return recent;
  }
  const others = recent.filter((earlier) => earlier.toLowerCase() !== trimmed.toLowerCase());
  return [trimmed, ...others].slice(0, recentSearchLimit);
}
