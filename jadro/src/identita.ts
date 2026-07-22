/**
 * Skládání a rozklad ID položek.
 *
 * JEDINÉ místo v celé aplikaci, kde se ID skládá. Důvod: formáty se liší
 * ve dvou osách naráz a kombinace jsou neintuitivní.
 *
 *                        herní data              AODP
 *   surovina ench 0      T5_METALBAR             T5_METALBAR
 *   surovina ench 4      T5_METALBAR_LEVEL4      T5_METALBAR_LEVEL4@4
 *   výbava   ench 0      T5_MAIN_SWORD           T5_MAIN_SWORD
 *   výbava   ench 4      T5_MAIN_SWORD           T5_MAIN_SWORD@4
 *                        ↑ nemění se!
 *
 * U výbavy je enchant vnořený prvek uvnitř základní položky, takže herní ID
 * zůstává stejné. U surovin je enchantovaná varianta samostatná položka.
 *
 * Kdyby se ID skládalo na víc místech, tenhle rozdíl se dřív nebo později
 * někde přehlédne a kalkulačka bude shánět cenu položky, která neexistuje.
 */

import type { Druh, Enchant, Polozka } from "./typy.js";

/** ID pro vyhledání v herních datech (items.xml). */
export function herniId(polozka: Polozka, druh: Druh): string {
  if (polozka.enchant === 0) return polozka.zaklad;
  // Výbava: enchant je vnořený prvek, uniquename se nemění.
  if (druh === "vybava") return polozka.zaklad;
  // Surovina: enchantovaná varianta je samostatná položka.
  return `${polozka.zaklad}_LEVEL${polozka.enchant}`;
}

/** ID pro dotaz na Albion Online Data Project. */
export function aodpId(polozka: Polozka, druh: Druh): string {
  if (polozka.enchant === 0) return polozka.zaklad;
  return `${herniId(polozka, druh)}@${polozka.enchant}`;
}

/**
 * Rozloží AODP ID zpět na položku.
 * Potřebné při zpracování odpovědi — AODP vrací ID, my potřebujeme položku.
 */
export function zAodpId(id: string): Polozka {
  const zavinac = id.lastIndexOf("@");
  if (zavinac === -1) return { zaklad: id, enchant: 0 };

  const enchant = Number(id.slice(zavinac + 1)) as Enchant;
  let zaklad = id.slice(0, zavinac);

  // U surovin je v ID i "_LEVELn" — odstranit, ať zbyde čistý základ.
  const pripona = `_LEVEL${enchant}`;
  if (zaklad.endsWith(pripona)) zaklad = zaklad.slice(0, -pripona.length);

  return { zaklad, enchant };
}

/** Tier se dá přečíst z prefixu "Tn_". */
export function tierZeZakladu(zaklad: string): number | null {
  const shoda = /^T(\d)_/.exec(zaklad);
  return shoda ? Number(shoda[1]) : null;
}

/** Porovnání dvou položek. */
export function stejnaPolozka(a: Polozka, b: Polozka): boolean {
  return a.zaklad === b.zaklad && a.enchant === b.enchant;
}

/** Klíč do mapy cen. Stabilní a čitelný v ladění. */
export function klicPolozky(polozka: Polozka): string {
  return `${polozka.zaklad}#${polozka.enchant}`;
}
