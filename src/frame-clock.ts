import {REPRESENTATION_BUDGETS} from './render/representation-policy.ts';
/** Fixed 30Hz simulation, independently paced presentation and bounded pause recovery.
 * Presentation is locked to a whole number of display refreshes (vsync): the target
 * interval is rounded to the nearest multiple of the measured refresh period, so 60 Hz
 * presents every 2nd refresh (30 FPS), 144 Hz every 5th (28.8 FPS), 120 Hz every 4th.
 * Decisions use elapsed refresh counts, not a threshold sitting exactly on a vsync
 * boundary, so timestamp jitter no longer mixes 17/33/50 ms frames. */
export class FrameClock {
  readonly step = 1 / 30;
  private last: number | null = null;
  private accumulator = 0;
  private sinceRender = 0;
  /** Recent raw callback intervals (seconds), used for a robust refresh estimate. */
  private readonly deltas = new Float64Array(31);
  private readonly sorted = new Float64Array(31);
  private deltaCount = 0;
  private deltaCursor = 0;
  private samplesSinceEstimate = 0;
  /** Estimated display refresh period (seconds); 60 Hz until measured. */
  vsync = 1 / 60;
  rate: 30 | 20 = 30;
  readonly frame = {
    steps: 0,
    alpha: 0,
    render: false,
    delta: 0,
    renderDelta: 0,
  };
  reset() {
    this.last = null;
    this.accumulator = 0;
    this.sinceRender = 0;
  }
  /** Number of display refreshes between two presented frames for the current rate. */
  get refreshesPerFrame() {
    return Math.max(1, Math.round(1 / this.rate / this.vsync));
  }
  private observeDelta(delta: number) {
    // Stalls and hidden-tab gaps say nothing about the display refresh.
    if (delta <= 0.002 || delta > 0.1) return;
    this.deltas[this.deltaCursor] = delta;
    this.deltaCursor = (this.deltaCursor + 1) % this.deltas.length;
    this.deltaCount = Math.min(this.deltas.length, this.deltaCount + 1);
    if (++this.samplesSinceEstimate < 8 && this.deltaCount >= 8) return;
    this.samplesSinceEstimate = 0;
    const n = this.deltaCount, v = this.sorted.subarray(0, n);
    v.set(this.deltas.subarray(0, n));
    v.sort();
    // Lower quartile: dropped frames (2×, 3× the period) cannot inflate the estimate.
    this.vsync = Math.min(0.034, Math.max(0.004, v[Math.floor((n - 1) * 0.25)]));
  }
  advance(now: number, active = true) {
    const f = this.frame;
    f.steps = 0;
    f.alpha = 0;
    f.render = false;
    f.delta = 0;
    f.renderDelta = 0;
    if (!active || !Number.isFinite(now)) {
      this.reset();
      return f;
    }
    if (this.last === null) {
      this.last = now;
      f.render = true;
      return f;
    }
    const raw = Math.max(0, (now - this.last) / 1000),
      delta = Math.min(0.25, raw);
    this.last = now;
    this.observeDelta(raw);
    this.accumulator += delta;
    this.sinceRender += delta;
    f.delta = delta;
    f.steps = Math.min(8, Math.floor((this.accumulator + 1e-9) / this.step));
    this.accumulator -= f.steps * this.step;
    this.accumulator = Math.max(0, this.accumulator);
    f.alpha = Math.min(1, this.accumulator / this.step);
    // Whole refreshes elapsed since the last presentation (half-period tolerance).
    if (this.sinceRender / this.vsync + 0.5 >= this.refreshesPerFrame) {
      f.render = true;
      f.renderDelta = this.sinceRender;
      this.sinceRender = 0;
    }
    return f;
  }
}
/** Sustained overload reduces resolution, then detail, then presentation; it never changes simulation. */
export class PresentationBudget {
  get resources(){return REPRESENTATION_BUDGETS[this.level];}
  level = 0;
  rate: 30 | 20 = 30;
  private overload = 0;
  private stable = 0;
  private averageWork = 0;
  private averageInterval = 0;
  private fixed = false;
  /** Seconds of headroom required before restoring a step; doubled after a failed restore. */
  private recovery = 12;
  private sinceRestore = Infinity;
  /** Explicit benchmark override: the same budget/quotas, without adaptation during A/B. */
  constructor(fixedLevel?:number){if(fixedLevel!==undefined&&Number.isInteger(fixedLevel)&&fixedLevel>=0&&fixedLevel<=2){this.level=fixedLevel;this.fixed=true;}}
  observe(workMs: number, seconds: number): boolean {
    if(this.fixed)return false;
    if (!Number.isFinite(workMs) || !Number.isFinite(seconds) || seconds <= 0)
      return false;
    const target = 1000 / this.rate;
    // Smooth GPU scheduling bursts; one fast callback must not erase sustained overload.
    const duration = Math.min(seconds, 0.25),
      mix = 1 - Math.exp(-duration / 0.5);
    this.averageWork += (Math.min(workMs, target * 4) - this.averageWork) * mix;
    this.averageInterval +=
      (Math.min(seconds * 1000, target * 4) - this.averageInterval) * mix;
    if (
      this.averageWork > target * 0.95 ||
      this.averageInterval > target * 1.15
    ) {
      this.overload += Math.min(seconds, 0.25);
      this.stable = 0;
    } else if (
      this.averageWork < target * 0.4 &&
      this.averageInterval <= target * 1.1
    ) {
      this.stable += Math.min(seconds, 0.25);
      this.overload = 0;
    } else {
      this.overload = Math.max(0, this.overload - seconds);
      this.stable = 0;
    }
    this.sinceRestore += Math.min(seconds, 0.25);
    if (this.overload >= 3) {
      this.overload = 0;
      // Overloaded again soon after a restore: the restore was premature, so the next one
      // waits twice as long (bounded). Prevents a 15 s down/up oscillation of resolution.
      if (this.sinceRestore < 10) this.recovery = Math.min(96, this.recovery * 2);
      if (this.level < 2) {
        this.level++;
        return true;
      }
      if (this.rate === 30) {
        this.rate = 20;
        return true;
      }
    }
    if (this.stable >= this.recovery) {
      this.stable = 0;
      if (this.rate === 20) {
        this.rate = 30;
        this.sinceRestore = 0;
        return true;
      }
      if (this.level > 0) {
        this.level--;
        this.sinceRestore = 0;
        return true;
      }
    }
    return false;
  }
}

/** Apply adaptation after the device/user ceiling, including ordinary DPR1 screens. */
export function presentationPixelRatio(
  device: number,
  ceiling: number,
  level: number,
): number {
  return (
    Math.min(device, ceiling) * (level >= 2 ? 0.65 : level === 1 ? 0.8 : 1)
  );
}
