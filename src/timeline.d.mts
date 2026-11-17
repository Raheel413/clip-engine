export const DIP: number, TITLE: number, PAD: number, WPS: number, FOOTNOTE: number, TIER_MIN: number,
  TIER_DRAG: number, TIER_HOLD: number, WHEEL_SPIN: number, SWELL: number, MAX_CLIP: number;
export function speechDur(beat: any): number;
export function wheelAngle(t: number, n: number, pickIndex: number): number;
export function buildTimeline(film: any): {
  fps: number; items: any[]; overlays: any[]; total: number; frames: number;
  audio: {vo: {file: string; start: number; bi: number}[]; booms: number[]; whooshes: number[]; ticks: number[]; swells: [number, number][]};
};
