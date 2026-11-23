/** Minimal cargo dialog (panniers / vehicle ↔ bag). DOM only; every move goes through
 * the simulation's atomic transfer, so the panel never holds inventory state itself. */
export interface CargoPanelOptions {
  title: string; capacity: number;
  cargo: () => Record<string, number>; used: () => number;
  bag: () => { itemId: string; name: string; count: number }[];
  itemName: (id: string) => string;
  transfer: (itemId: string, quantity: number) => boolean;
  /** False once the player walked away or the container changed hands. */
  valid: () => boolean;
  onClose: () => void;
}
export interface CargoPanel { close(): void; valid(): boolean }
export function openCargoPanel(host: HTMLElement, o: CargoPanelOptions): CargoPanel {
  const root = document.createElement('div');
  root.className = 'animal-cargo'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', o.title);
  root.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;min-width:300px;max-width:92vw;max-height:80vh;overflow:auto;padding:14px 16px;border-radius:12px;background:rgba(32,26,20,.94);color:#f6ead2;font:14px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)';
  const row = (name: string, count: number, action: string, run: () => void): HTMLElement => {
    const line = document.createElement('div'); line.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:space-between;padding:3px 0';
    const text = document.createElement('span'); text.textContent = `${name} × ${count}`;
    const buttons = document.createElement('span');
    for (const [suffix, all] of [['', false], [' tout', true]] as const) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = action + suffix; b.dataset.cargoAction = action + suffix; b.style.cssText = 'margin-left:4px;padding:3px 8px;border-radius:6px;border:0;cursor:pointer';
      b.onclick = () => { run.call(null); if (all) for (let i = 1; i < count; i++) run(); render(); };
      buttons.append(b);
    }
    line.append(text, buttons); return line;
  };
  function render(): void {
    root.replaceChildren();
    const title = document.createElement('strong'); title.textContent = `${o.title} — ${o.used()} / ${o.capacity}`;
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Fermer'; close.dataset.cargoAction = 'close'; close.style.cssText = 'float:right;border:0;border-radius:6px;padding:3px 8px;cursor:pointer'; close.onclick = () => api.close();
    root.append(close, title);
    const section = (heading: string): void => { const h = document.createElement('div'); h.textContent = heading; h.style.cssText = 'margin-top:10px;opacity:.75'; root.append(h); };
    section('Chargement');
    const lines = Object.entries(o.cargo());
    if (!lines.length) { const empty = document.createElement('div'); empty.textContent = 'Vide'; root.append(empty); }
    for (const [itemId, count] of lines) root.append(row(o.itemName(itemId), count, 'Prendre', () => { o.transfer(itemId, -1); }));
    section('Sac');
    for (const item of o.bag()) if (item.count > 0) root.append(row(item.name, item.count, 'Déposer', () => { o.transfer(item.itemId, 1); }));
  }
  const onKey = (event: KeyboardEvent): void => { if (event.code === 'Escape') { event.stopPropagation(); api.close(); } };
  const api: CargoPanel = {
    close() { window.removeEventListener('keydown', onKey, true); root.remove(); o.onClose(); },
    valid: o.valid,
  };
  window.addEventListener('keydown', onKey, true);
  render(); host.append(root);
  return api;
}
