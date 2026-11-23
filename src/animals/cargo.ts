/** Cargo carried by panniers and vehicles — one authority, atomic transfers.
 * Items live either in the player's bag (the existing `Purse`) or in exactly one
 * container; a transfer checks both sides before changing anything.
 */
import type { Purse } from '../gameplay/economy.ts';

export type Cargo = Record<string, number>;
export const cargoUnits = (cargo: Cargo): number => Object.values(cargo).reduce((sum, n) => sum + n, 0);
export type CargoResult = { ok: true } | { ok: false; reason: string };
/** quantity > 0 loads from the bag into the container, < 0 unloads. */
export function transferCargo(cargo: Cargo, capacity: number, itemId: string, quantity: number, purse: Purse): CargoResult {
  if (!Number.isInteger(quantity) || quantity === 0) return { ok: false, reason: 'Quantité invalide.' };
  if (quantity > 0) {
    if (purse.count(itemId) < quantity) return { ok: false, reason: 'Pas assez d’objets dans le sac.' };
    if (cargoUnits(cargo) + quantity > capacity) return { ok: false, reason: 'Chargement plein.' };
    if (!purse.apply([{ itemId, quantity: -quantity }])) return { ok: false, reason: 'Transfert refusé.' };
    cargo[itemId] = (cargo[itemId] ?? 0) + quantity;
    return { ok: true };
  }
  const take = -quantity;
  if ((cargo[itemId] ?? 0) < take) return { ok: false, reason: 'Le chargement ne contient pas cette quantité.' };
  if (purse.count(itemId) + take > purse.max(itemId)) return { ok: false, reason: 'Le sac est plein pour cet objet.' };
  if (!purse.apply([{ itemId, quantity: take }])) return { ok: false, reason: 'Transfert refusé.' };
  if (cargo[itemId] === take) delete cargo[itemId]; else cargo[itemId] -= take;
  return { ok: true };
}
