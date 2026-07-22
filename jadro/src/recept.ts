/**
 * Práce s recepty.
 *
 * Refining i crafting mají v herních datech IDENTICKOU strukturu
 * (seznam vstupů → výstup). Refining je jen recept, jehož výstupem je surovina.
 * Proto je tu jeden výpočet, ne dva.
 */

import type { Enchant, HerniPolozka, Varianta, Vstup } from "./typy.js";

/**
 * Vybere variantu receptu pro daný enchant.
 *
 * Vad z oponentury, na které si tu dáváme pozor:
 *  - varianta s faction tokenem se ve výchozím stavu přeskakuje (vada 8)
 *  - položka nemusí mít variantu pro každý enchant
 */
export function vybratVariantu(
  polozka: HerniPolozka,
  enchant: Enchant,
  povolitFactionToken = false,
): Varianta | undefined {
  const kandidati = polozka.varianty.filter((v) => v.enchant === enchant);
  if (kandidati.length === 0) return undefined;

  if (!povolitFactionToken) {
    const bez = kandidati.find((v) => !v.sFactionTokenem);
    if (bez) return bez;
  }
  return kandidati[0];
}

/**
 * Spotřeba jednoho vstupu na požadovaný počet KUSŮ VÝSTUPU.
 *
 * Dvě věci, na které se dá snadno naletět:
 *  1. `pocetVyrobenych` nemusí být 1 (vada 7) — dělí se jím
 *  2. return rate se uplatní jen na vratné suroviny (vada 6);
 *     artefakty, runy, duše a relikvie se nevracejí
 *
 * @returns nominální spotřeba (co recept žádá) a efektivní (co reálně koupíš)
 */
export function spotrebaVstupu(
  vstup: Vstup,
  varianta: Varianta,
  pocetVyrobku: number,
  returnRate: number,
): { nominalne: number; efektivne: number } {
  const davky = pocetVyrobku / varianta.pocetVyrobenych;
  const nominalne = vstup.pocet * davky;
  const efektivne = vstup.vratna ? nominalne * (1 - returnRate) : nominalne;
  return { nominalne, efektivne };
}

/**
 * Focus na celou sérii.
 * Focus se platí za dávku, ne za kus — u receptů s `pocetVyrobenych` > 1 je to rozdíl.
 */
export function focusCelkem(varianta: Varianta, pocetVyrobku: number): number {
  return varianta.focus * (pocetVyrobku / varianta.pocetVyrobenych);
}

/**
 * itemValue pro daný enchant.
 * Každý stupeň enchantu hodnotu zdvojnásobuje (ověřeno v items.xml).
 */
export function itemValue(polozka: HerniPolozka, enchant: Enchant): number {
  return polozka.itemValue * Math.pow(2, enchant);
}

/**
 * Poplatek za použití stanice na jeden kus.
 *
 * Od updatu Lands Awakened se neplatí procentem z hodnoty, ale jako
 * silver za 100 spotřebované nutrition:
 *
 *     nutrition = itemValue × koeficient
 *     poplatek  = nutrition × sazba / 100
 *
 * Koeficient (0,1125) pochází z vývojářského postu, NENÍ v herních datech.
 * Sazbu si nastavuje majitel stanice → je to vstup od uživatele.
 */
export function poplatekStanice(
  polozka: HerniPolozka,
  enchant: Enchant,
  sazbaZa100Nutrition: number,
  nutritionKoeficient: number,
): number {
  const nutrition = itemValue(polozka, enchant) * nutritionKoeficient;
  return (nutrition * sazbaZa100Nutrition) / 100;
}

/** Vrací true, pokud je položka surovina (refining), ne výbava (crafting). */
export function jeRefining(polozka: HerniPolozka): boolean {
  return polozka.druh === "surovina";
}
