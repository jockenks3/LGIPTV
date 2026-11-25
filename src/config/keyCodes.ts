// LG webOS remote control key codes (plus desktop equivalents for testing).
export const KEY = {
  BACKSPACE: 8,
  ENTER: 13,
  ESC: 27,
  SPACE: 32,
  PAGE_UP: 33,
  PAGE_DOWN: 34,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  PAUSE: 19,
  PLAY_PAUSE: 179,
  STOP: 413,
  REWIND: 412,
  PLAY: 415,
  FAST_FORWARD: 417,
  CH_UP: 427,
  CH_DOWN: 428,
  RED: 403,
  GREEN: 404,
  YELLOW: 405,
  BLUE: 406,
  INFO: 457,
  BACK: 461,
} as const;

export function isBackKey(code: number): boolean {
  return code === KEY.BACK || code === KEY.ESC;
}

export function isArrowKey(code: number): boolean {
  return code >= 37 && code <= 40;
}

export function digitFromKey(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 96 && code <= 105) return code - 96;
  return -1;
}
