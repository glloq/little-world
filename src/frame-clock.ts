/** Fixed 30Hz simulation, independently paced presentation and bounded pause recovery. */
export class FrameClock {
  readonly step = 1 / 30;
  private last: number | null = null;
  private accumulator = 0;
  private renderAccumulator = 0;
  private sinceRender = 0;
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
    this.renderAccumulator = 0;
    this.sinceRender = 0;
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
    const delta = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.accumulator += delta;
    this.renderAccumulator += delta;
    this.sinceRender += delta;
    f.delta = delta;
    f.steps = Math.min(8, Math.floor((this.accumulator + 1e-9) / this.step));
    this.accumulator -= f.steps * this.step;
    this.accumulator = Math.max(0, this.accumulator);
    f.alpha = this.accumulator / this.step;
    const interval = 1 / this.rate;
    if (this.renderAccumulator + 1e-9 >= interval) {
      f.render = true;
      f.renderDelta = this.sinceRender;
      this.sinceRender = 0;
      this.renderAccumulator %= interval;
      if (interval - this.renderAccumulator < 1e-9) this.renderAccumulator = 0;
    }
    return f;
  }
}
/** Sustained overload reduces resolution, then detail, then presentation; it never changes simulation. */
export class PresentationBudget {
  level = 0;
  rate: 30 | 20 = 30;
  private overload = 0;
  private stable = 0;
  observe(workMs: number, seconds: number): boolean {
    if (!Number.isFinite(workMs) || !Number.isFinite(seconds) || seconds <= 0)
      return false;
    const target = 1000 / this.rate;
    if (workMs > target * 0.95) {
      this.overload += Math.min(seconds, 0.25);
      this.stable = 0;
    } else if (workMs < target * 0.4) {
      this.stable += Math.min(seconds, 0.25);
      this.overload = 0;
    } else {
      this.overload = Math.max(0, this.overload - seconds);
      this.stable = 0;
    }
    if (this.overload >= 3) {
      this.overload = 0;
      if (this.level < 2) {
        this.level++;
        return true;
      }
      if (this.rate === 30) {
        this.rate = 20;
        return true;
      }
    }
    if (this.stable >= 12) {
      this.stable = 0;
      if (this.rate === 20) {
        this.rate = 30;
        return true;
      }
      if (this.level > 0) {
        this.level--;
        return true;
      }
    }
    return false;
  }
}

/** Apply adaptation after the device/user ceiling, including ordinary DPR1 screens. */
export function presentationPixelRatio(device:number,ceiling:number,level:number):number {
  return Math.min(device,ceiling)*(level>=2?.65:level===1?.8:1);
}
