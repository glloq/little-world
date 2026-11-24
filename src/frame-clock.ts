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
export type Bottleneck = 'cpu' | 'gpu';
type Lever = 'resolution' | 'detail' | 'both' | 'rate';
/** Sustained overload degrades one lever at a time and never changes the simulation (OPT-6).
 * The bottleneck decides the lever: a frame whose main-thread CPU work alone fills the budget
 * is CPU-limited, so lowering the resolution would cost image quality for nothing; detail is
 * reduced instead. Otherwise (GPU/fill-rate/presentation, or a measured GPU time above the CPU
 * work) the internal resolution goes first, as doc 11 orders. 30 → 20 FPS stays the last resort
 * and recovery undoes the most recent step first. One arbiter, same hysteresis (3 s / 12 s,
 * doubled after a premature restore). `level` (detail) keeps its historical meaning for the
 * detail consumers; `resolutionLevel` drives the pixel ratio. */
export class PresentationBudget {
  get resources(){return REPRESENTATION_BUDGETS[this.level];}
  /** Detail level 0..2 (dressing, small elements, effects tiers). */
  level = 0;
  /** Internal resolution level 0..2 (pixel ratio ×1, ×0.8, ×0.65). */
  resolutionLevel = 0;
  rate: 30 | 20 = 30;
  /** Last diagnosed bottleneck (null until an overload was observed). */
  bottleneck: Bottleneck | null = null;
  /** Why the last change happened (beta/metrics panel). */
  lastReason = '';
  private overload = 0;
  private stable = 0;
  private averageWork = 0;
  private averageInterval = 0;
  private averageGpu = -1;
  private fixed = false;
  private readonly applied: Lever[] = [];
  /** Seconds of headroom required before restoring a step; doubled after a failed restore. */
  private recovery = 12;
  private sinceRestore = Infinity;
  /** Explicit benchmark override: the same budget/quotas, without adaptation during A/B. */
  /** `legacy` (A/B flag ?opt6=0): pre-OPT-6 behaviour, resolution and detail lowered together. */
  private readonly legacy: boolean;
  constructor(fixedLevel?:number,legacy=false){this.legacy=legacy;if(fixedLevel!==undefined&&Number.isInteger(fixedLevel)&&fixedLevel>=0&&fixedLevel<=2){this.level=this.resolutionLevel=fixedLevel;this.fixed=true;}}
  /** CPU work of the presented frame (ms), wall interval (s), measured GPU time (ms) if known. */
  observe(workMs: number, seconds: number, gpuMs: number | null = null): boolean {
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
    if (gpuMs !== null && Number.isFinite(gpuMs))
      this.averageGpu = this.averageGpu < 0 ? gpuMs : this.averageGpu + (Math.min(gpuMs, target * 4) - this.averageGpu) * mix;
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
      const bottleneck = this.diagnose();
      this.bottleneck = bottleneck;
      const lever = this.nextLever(bottleneck);
      if (lever) {
        this.apply(lever, +1);
        this.applied.push(lever);
        this.lastReason = `${bottleneck}: ${lever} ↓ (cpu ${this.averageWork.toFixed(1)} ms, interval ${this.averageInterval.toFixed(1)} ms${this.averageGpu >= 0 ? ', gpu ' + this.averageGpu.toFixed(1) + ' ms' : ''})`;
        return true;
      }
    }
    if (this.stable >= this.recovery) {
      this.stable = 0;
      const lever = this.applied.pop();
      if (lever) {
        this.apply(lever, -1);
        this.sinceRestore = 0;
        this.lastReason = `headroom: ${lever} ↑`;
        return true;
      }
    }
    return false;
  }
  /** The browser pipelines main-thread work and GPU work, so the interval is roughly the larger
   * of the two. CPU when the measured main-thread work makes up most of the interval (or a measured
   * GPU time is below it); otherwise the frame waits on GPU/fill-rate/presentation. */
  private diagnose(): Bottleneck {
    if (this.averageGpu >= 0) return this.averageGpu >= this.averageWork ? 'gpu' : 'cpu';
    return this.averageWork >= this.averageInterval * 0.6 ? 'cpu' : 'gpu';
  }
  private nextLever(b: Bottleneck): Lever | null {
    if (this.legacy) return this.level < 2 ? 'both' : this.rate === 30 ? 'rate' : null;
    if (b === 'gpu' && this.resolutionLevel < 2) return 'resolution';
    if (this.level < 2) return 'detail';
    if (this.rate === 30) return 'rate';
    return null;
  }
  private apply(lever: Lever, direction: 1 | -1) {
    if (lever === 'resolution') this.resolutionLevel = Math.max(0, Math.min(2, this.resolutionLevel + direction));
    else if (lever === 'detail') this.level = Math.max(0, Math.min(2, this.level + direction));
    else if (lever === 'both') this.level = this.resolutionLevel = Math.max(0, Math.min(2, this.level + direction));
    else this.rate = direction > 0 ? 20 : 30;
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
