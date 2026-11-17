/** Deterministic motion-lab scheduler. Simulation always advances at 30 Hz even
 * when GPU drawing is capped at 20 Hz. No DOM, renderer or gameplay authority. */
export const LAB_SIM_HZ=30;
export type MotionLabRenderHz=20|30;
const TICK=1/LAB_SIM_HZ;
const EPS=1e-9;
export class MotionLabClock {
  elapsed=0;
  ticks=0;
  private pending=0;
  private renderPending=0;
  readonly maxTicksPerFrame=3;
  reset(){this.elapsed=0;this.ticks=0;this.pending=0;this.renderPending=0;}
  /** Run fixed simulation steps. Return true when a new draw is due.
   * Drops extreme wall-clock backlog to avoid a spiral of death after tab suspension. */
  advance(delta:number,hz:MotionLabRenderHz,update:(dt:number,elapsed:number)=>void):boolean{
    if(!Number.isFinite(delta)||delta<0)throw Error('Delta de laboratoire invalide');
    if(hz!==20&&hz!==30)throw Error('Cadence de rendu invalide');
    const dt=Math.min(.1,delta);
    this.pending+=dt;
    let count=0;
    while(this.pending+EPS>=TICK&&count<this.maxTicksPerFrame){
      this.pending=Math.max(0,this.pending-TICK);
      this.ticks++;this.elapsed=this.ticks*TICK;
      update(TICK,this.elapsed);count++;
    }
    if(count===this.maxTicksPerFrame&&this.pending>=TICK)this.pending=0;
    this.renderPending+=dt;
    const interval=1/hz;
    if(this.renderPending+EPS>=interval){
      this.renderPending=Math.max(0,this.renderPending-interval*Math.floor((this.renderPending+EPS)/interval));
      return true;
    }
    return false;
  }
}
