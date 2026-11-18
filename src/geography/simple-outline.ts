import type { PointXZ } from './archipelago.ts';
export function simpleOutline(points: PointXZ[]): boolean {
    const orient = (a: PointXZ, b: PointXZ, c: PointXZ) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const between = (a: number, b: number, c: number, d: number) => Math.max(Math.min(a, b), Math.min(c, d)) <= Math.min(Math.max(a, b), Math.max(c, d)) + 1e-8;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if (Math.hypot(a.x - b.x, a.z - b.z) < .01)
            return false;
        for (let j = i + 1; j < points.length; j++) {
            if (j === i + 1 || i === 0 && j === points.length - 1)
                continue;
            const c = points[j], d = points[(j + 1) % points.length];
            if (between(a.x, b.x, c.x, d.x) && between(a.z, b.z, c.z, d.z) && orient(a, b, c) * orient(a, b, d) <= 0 && orient(c, d, a) * orient(c, d, b) <= 0)
                return false;
        }
    }
    return Math.abs(points.reduce((sum, a, i) => { const b = points[(i + 1) % points.length]; return sum + a.x * b.z - b.x * a.z; }, 0)) > 1;
}
