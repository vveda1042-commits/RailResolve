const STORAGE_KEY = 'railresolve_my_ticket_ids';

export function loadMyTicketIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => id.trim())
      .slice(0, 15);
  } catch {
    return [];
  }
}

export function saveMyTicketId(ticketId: string): string[] {
  const cleaned = ticketId.trim();
  if (!cleaned || typeof window === 'undefined') return loadMyTicketIds();
  const current = loadMyTicketIds();
  const updated = [
    cleaned,
    ...current.filter((id) => id.toLowerCase() !== cleaned.toLowerCase()),
  ].slice(0, 15);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors
  }
  return updated;
}
