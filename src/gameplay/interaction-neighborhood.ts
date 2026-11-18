/** Static/moving interaction anchors, bounded by the schema's 50 m maximum range. */
export class InteractionNeighborhood {
    private cells = new Map<string, Set<string>>();
    private owners = new Map<string, string>();
    readonly cellSize = 32;
    set(id: string, p: {
        x: number;
        z: number;
    }) { const key = Math.floor(p.x / this.cellSize) + ':' + Math.floor(p.z / this.cellSize), old = this.owners.get(id); if (key === old)
        return; if (old) {
        const cell = this.cells.get(old);
        cell?.delete(id);
        if (!cell?.size)
            this.cells.delete(old);
    } const cell = this.cells.get(key) ?? new Set<string>(); cell.add(id); this.cells.set(key, cell); this.owners.set(id, key); }
    nearby(p: {
        x: number;
        z: number;
    }, range = 50) { const ids: string[] = []; for (let x = Math.floor((p.x - range) / this.cellSize); x <= Math.floor((p.x + range) / this.cellSize); x++)
        for (let z = Math.floor((p.z - range) / this.cellSize); z <= Math.floor((p.z + range) / this.cellSize); z++)
            ids.push(...this.cells.get(x + ':' + z) ?? []); return ids; }
}
