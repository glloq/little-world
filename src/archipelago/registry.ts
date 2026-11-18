/** Published, immutable island catalog; safe for a static GitHub Pages build. */
export interface PublishedIsland {
  id: string;
  name: string;
  manifest: string; // relative to the Vite BASE_URL, never arbitrary remote URLs
  description: string;
  portLevel: 0 | 1 | 2 | 3 | 4;
}
export interface ArchipelagoRegistry { schemaVersion: 1; islands: PublishedIsland[]; }
const ID = /^[a-z][a-z0-9-]{1,47}$/;
const MANIFEST = /^maps\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/manifest\.json$/;
export function parseArchipelagoRegistry(raw: unknown): ArchipelagoRegistry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Catalogue des îles invalide');
  const data = raw as Record<string, unknown>;
  if (data.schemaVersion !== 1 || !Array.isArray(data.islands) || !data.islands.length || data.islands.length > 100) throw new Error('Catalogue des îles invalide');
  const ids = new Set<string>(), manifests = new Set<string>();
  const islands: PublishedIsland[] = [];
  for (const entry of data.islands) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Entrée d’île invalide');
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || !ID.test(e.id) || ids.has(e.id) ||
        typeof e.manifest !== 'string' || !MANIFEST.test(e.manifest) || manifests.has(e.manifest) ||
        typeof e.name !== 'string' || !e.name.trim() || e.name.length > 100 ||
        typeof e.description !== 'string' || e.description.length > 250 ||
        !Number.isInteger(e.portLevel) || (e.portLevel as number) < 0 || (e.portLevel as number) > 4) throw new Error('Île non validée dans le registre');
    ids.add(e.id); manifests.add(e.manifest);
    islands.push({ id: e.id, name: e.name, manifest: e.manifest, description: e.description, portLevel: e.portLevel as PublishedIsland['portLevel'] });
  }
  return { schemaVersion: 1, islands };
}
export async function loadArchipelagoRegistry(baseUrl: string, fetcher: typeof fetch = fetch): Promise<ArchipelagoRegistry> {
  const response = await fetcher(baseUrl + 'maps/archipelago.json');
  if (!response.ok) throw new Error('Catalogue maritime indisponible : HTTP ' + response.status);
  return parseArchipelagoRegistry(await response.json());
}
export function islandById(registry: ArchipelagoRegistry, islandId: string): PublishedIsland | null {
  return registry.islands.find(i => i.id === islandId) ?? null;
}
