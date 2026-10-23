// Helpers for reading the simulator's battle protocol.

export type SideId = 'p1' | 'p2';

/** Parses an HP string like "141/141", "40/141 par" or "0 fnt". */
export function parseHp(text: string): { hp: number; maxhp: number; status: string } {
  const [fraction, status = ''] = text.split(' ');
  if (fraction === '0') return { hp: 0, maxhp: 0, status: 'fnt' };
  const [hp, maxhp] = fraction.split('/').map(Number);
  return { hp, maxhp, status };
}
