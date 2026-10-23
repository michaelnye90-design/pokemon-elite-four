const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for use inside HTML markup or attributes. */
export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function pct(hp: number, maxhp: number): number {
  return maxhp > 0 ? Math.max(0, Math.min(100, (hp / maxhp) * 100)) : 0;
}

/** Green above half, yellow above a fifth, red below, as in the games. */
export function hpColor(percent: number): 'high' | 'mid' | 'low' {
  return percent > 50 ? 'high' : percent > 20 ? 'mid' : 'low';
}

export function hpBar(hp: number, maxhp: number, opts: { showNumbers?: boolean } = {}): string {
  const p = pct(hp, maxhp);
  const numbers = opts.showNumbers ? `<span class="hp-numbers">${hp}/${maxhp}</span>` : `<span class="hp-numbers">${Math.ceil(p)}%</span>`;
  return `<div class="hp"><div class="hp-track"><div class="hp-fill ${hpColor(p)}" style="width:${p}%"></div></div>${numbers}</div>`;
}

const STATUS_LABEL: Record<string, string> = { slp: 'SLP', par: 'PAR', brn: 'BRN', psn: 'PSN', tox: 'TOX', frz: 'FRZ', fnt: 'FNT' };

export function statusBadge(status: string | null | undefined): string {
  if (!status || !STATUS_LABEL[status]) return '';
  return `<span class="status status-${esc(status)}">${STATUS_LABEL[status]}</span>`;
}

export function typeBadge(type: string): string {
  return `<span class="type type-${esc(type.toLowerCase())}">${esc(type)}</span>`;
}

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
