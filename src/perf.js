// Frame governor: keeps play smooth on phones. It watches real frame intervals during gameplay and,
// when frames are being missed, first caps rendering to 60 fps on high-refresh screens (the sim runs
// at 60 Hz anyway, and a steady 60 looks smoother than a stuttering 120), then lowers the canvas
// resolution a step at a time. When there is plenty of headroom it steps resolution back up.
// What it learns is remembered per device so the next session starts at a good setting.
import { settings } from './save.js';

const STEPS = [2, 1.75, 1.5, 1.3, 1.1]; // max canvas pixels per CSS pixel
const KEY = 'pastry-paladins-perf-v1';
const WINDOW_MS = 1500;

export class FrameGovernor {
  constructor(renderer) {
    this.r = renderer;
    this.level = 0;
    this.cap60 = false;
    this.fails = STEPS.map(() => 0);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) { this.level = Math.min(STEPS.length - 1, saved.level | 0); this.cap60 = !!saved.cap60; }
    } catch (e) { /* storage unavailable */ }
    this.resetWindow();
    this.skip = 2; // ignore the first windows (loading, fullscreen transitions)
    this.good = 0;
    this.apply(false);
  }
  get auto() { return settings().quality === 'auto'; }
  // true when this rAF should be skipped to hold 60 fps on a faster display
  shouldSkip(sinceDrawMs) {
    return this.auto && this.cap60 && sinceDrawMs < 1000 / 60 - 3;
  }
  resetWindow() { this.raw = []; this.drawn = []; this.winT = 0; }
  // rawMs: time since the previous rAF; drawnMs: time since the previous drawn frame (0 if skipped)
  tick(rawMs, drawnMs, active) {
    if (!active || !this.auto || rawMs > 250) { if (rawMs > 250 || !active) this.resetWindow(); return; }
    this.raw.push(rawMs);
    if (drawnMs) this.drawn.push(drawnMs);
    this.winT += rawMs;
    if (this.winT < WINDOW_MS || this.drawn.length < 20) return;
    const raw = [...this.raw].sort((a, b) => a - b);
    const vsync = Math.max(4, raw[Math.floor(raw.length * 0.1)]); // display refresh interval
    const target = this.cap60 ? Math.max(vsync, 1000 / 60) : vsync;
    const missed = this.drawn.filter((d) => d > target * 1.5).length / this.drawn.length;
    this.resetWindow();
    if (this.skip > 0) { this.skip--; return; }
    if (missed > 0.1) {
      this.good = 0;
      if (!this.cap60 && vsync < 12) this.cap60 = true;
      else if (this.level < STEPS.length - 1 && STEPS[this.level + 1] < this.deviceDpr()) {
        this.fails[this.level]++;
        this.level++;
      } else return;
      this.apply(true);
    } else if (missed < 0.02) {
      // lots of headroom for a while: try one resolution step back up (unless that step failed twice)
      if (++this.good >= 5 && this.level > 0 && this.fails[this.level - 1] < 2) {
        this.level--; this.good = 0;
        this.apply(true);
      }
    } else this.good = 0;
  }
  deviceDpr() { return Math.min(window.devicePixelRatio || 1, 2); }
  apply(changed) {
    this.r.dprCap = STEPS[this.level];
    if (changed) {
      this.r.resize();
      this.skip = 1;
      try { localStorage.setItem(KEY, JSON.stringify({ level: this.level, cap60: this.cap60 })); } catch (e) { /* ignore */ }
    }
  }
  label() {
    const q = settings().quality;
    if (q !== 'auto') return q;
    return `${this.r.view.dpr.toFixed(2)}x${this.cap60 ? ' · 60 cap' : ''}`;
  }
}
