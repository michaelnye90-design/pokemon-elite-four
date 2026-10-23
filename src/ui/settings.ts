// Per-viewer display preferences, remembered in this browser only.

import type { SceneSettings, TextSpeed } from './scene';

const KEY = 'elite-four:settings';
const DEFAULTS: SceneSettings & { playerName: string } = { textSpeed: 'medium', autoAdvance: true, playerName: 'RED' };

export type Settings = typeof DEFAULTS;

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    const speeds: TextSpeed[] = ['slow', 'medium', 'fast', 'instant'];
    return {
      textSpeed: speeds.includes(saved.textSpeed as TextSpeed) ? (saved.textSpeed as TextSpeed) : DEFAULTS.textSpeed,
      autoAdvance: typeof saved.autoAdvance === 'boolean' ? saved.autoAdvance : DEFAULTS.autoAdvance,
      playerName: typeof saved.playerName === 'string' && saved.playerName.trim() ? saved.playerName : DEFAULTS.playerName,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked (private window etc.): settings just won't be remembered.
  }
}

/** Gen 1 names: up to 7 characters, shown in capitals. */
export function cleanName(name: string): string {
  return name.replace(/[^A-Za-z0-9 .\-]/g, '').trim().slice(0, 7).toUpperCase() || DEFAULTS.playerName;
}
