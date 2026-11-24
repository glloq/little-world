/** Range allocator over a fixed instance buffer (OPT grass, doc 82 step 6).
 * Each owner (a generated cell) keeps the same contiguous slot range while it stays drawn, so a
 * rebuild only writes — and uploads — the ranges of cells that appear or disappear. First fit
 * over a sorted free list; adjacent free ranges merge; the high-water mark (`end`, the drawn
 * instance count) shrinks when the trailing range is freed. Pure data structure, no Three.js. */
export class SlotAllocator {
  /** Sorted, non-adjacent free ranges below `end`, as flat [start, end) pairs. */
  private free: number[] = [];
  /** High-water mark: instances [0, end) are drawn (free ranges inside are zero-scaled). */
  end = 0;
  used = 0;
  readonly capacity: number;
  constructor(capacity: number) { this.capacity = capacity; }
  /** Start of a free range of `count` slots, or −1 when no hole nor the tail can hold it. */
  allocate(count: number): number {
    if (count <= 0) return -1;
    const f = this.free;
    for (let i = 0; i < f.length; i += 2) {
      const size = f[i + 1] - f[i];
      if (size < count) continue;
      const start = f[i];
      if (size === count) f.splice(i, 2); else f[i] += count;
      this.used += count;
      return start;
    }
    if (this.end + count > this.capacity) return -1;
    const start = this.end;
    this.end += count;
    this.used += count;
    return start;
  }
  /** Returns [start, start + count) to the pool. */
  release(start: number, count: number) {
    if (count <= 0) return;
    this.used -= count;
    const f = this.free, end = start + count;
    let i = 0;
    while (i < f.length && f[i] < start) i += 2;
    f.splice(i, 0, start, end);
    // Merge with the next, then with the previous range.
    if (i + 2 < f.length && f[i + 1] === f[i + 2]) { f[i + 1] = f[i + 3]; f.splice(i + 2, 2); }
    if (i >= 2 && f[i - 1] === f[i]) { f[i - 1] = f[i + 1]; f.splice(i, 2); i -= 2; }
    // A free range touching the high-water mark shrinks the drawn count.
    const last = f.length - 2;
    if (last >= 0 && f[last + 1] === this.end) { this.end = f[last]; f.length = last; }
  }
  /** Slots inside the drawn range that hold nothing (zero-scaled instances still processed). */
  get holes() { return this.end - this.used; }
  reset() { this.free.length = 0; this.end = 0; this.used = 0; }
}
