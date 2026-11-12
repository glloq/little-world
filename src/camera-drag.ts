/** Browser-agnostic mouse orbit input. No pointer-lock and no free camera rotation. */
export interface OrbitMovement { dx: number; dy: number }
export class MouseDragOrbit {
  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  get active(): boolean { return this.pointerId !== null; }

  begin(pointerId: number, button: number, clientX: number, clientY: number): boolean {
    if (button !== 0 || this.active) return false;
    this.pointerId = pointerId;
    this.lastX = clientX;
    this.lastY = clientY;
    return true;
  }
  move(pointerId: number, buttons: number, clientX: number, clientY: number): OrbitMovement | null {
    if (pointerId !== this.pointerId) return null;
    if (!(buttons & 1)) { this.cancel(); return null; }
    const delta = {dx:clientX-this.lastX,dy:clientY-this.lastY};
    this.lastX = clientX;
    this.lastY = clientY;
    return delta;
  }
  end(pointerId: number): void {
    if (pointerId === this.pointerId) this.cancel();
  }
  cancel(): void { this.pointerId = null; }
}
