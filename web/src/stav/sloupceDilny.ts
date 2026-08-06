/**
 * Sloupce tabulky v Dílně — které existují a které jsou vidět.
 *
 * Tabulka je vykreslená z tohohle seznamu, ne z natvrdo psaných buněk.
 * Uživatel si tak může zapnout a vypnout, co potřebuje: na mobilu tři
 * sloupce, na počítači všechny.
 *
 * **Ukládá se seznam VYPNUTÝCH, ne zapnutých.** Kdyby se ukládaly zapnuté,
 * sloupec přidaný v budoucí verzi by se nikomu neobjevil a nikdo by nevěděl,
 * že existuje.
 *
 * Volba se **nesynchronizuje** — je to vlastnost zařízení, stejně jako
 * filtry a předvolby.
 */

import type { Razeni } from "./filtrDilny";

export type SloupecId =
  | "kdeKam" | "prodej" | "zisk" | "marze" | "ziskNaKus" | "ziskNaKg" | "ziskNaFocus"
  | "naklad" | "trzba" | "likvidita" | "stari" | "tier";

export interface DefiniceSloupce {
  id: SloupecId;
  nazev: string;
  /** Čísla vpravo, text vlevo. */
  vpravo?: boolean;
  /** Podle čeho řadit při kliknutí na hlavičku. Chybí = sloupec neřadí. */
  razeni?: Razeni;
  /** Krátké vysvětlení do nabídky sloupců. */
  popis?: string;
}

/**
 * Název položky a tlačítko na odebrání v seznamu NEJSOU — jsou natvrdo.
 * Bez názvu jsou řádky k nerozeznání a uživatel by se z toho nedostal.
 */
export const SLOUPCE: DefiniceSloupce[] = [
  { id: "kdeKam", nazev: "Kde → kam", popis: "město výroby a místo prodeje" },
  {
    id: "prodej", nazev: "Prodej / ks", vpravo: true,
    popis: "cena, za kterou prodáváš — dá se přepsat ručně",
  },
  { id: "zisk", nazev: "Zisk", vpravo: true, razeni: "zisk" },
  { id: "marze", nazev: "Marže", vpravo: true, razeni: "marze" },
  { id: "ziskNaKus", nazev: "Zisk / ks", vpravo: true, razeni: "ziskNaKus" },
  {
    id: "ziskNaKg", nazev: "Zisk / kg", vpravo: true, razeni: "ziskNaKg",
    popis: "když se ti vejde jen jeden mount",
  },
  {
    id: "ziskNaFocus", nazev: "Zisk / focus", vpravo: true, razeni: "ziskNaFocus",
    popis: "když je focus vzácnější než silver",
  },
  { id: "naklad", nazev: "Náklad / ks", vpravo: true, razeni: "naklad" },
  {
    id: "trzba", nazev: "Tržba / ks", vpravo: true, razeni: "trzba",
    popis: "prodejní cena po odečtení ztráty zásilek",
  },
  { id: "likvidita", nazev: "Likvidita", razeni: "likvidita" },
  {
    id: "stari", nazev: "Stáří", vpravo: true, razeni: "stari",
    popis: "u ručních cen a u 30denního mediánu zůstává prázdné",
  },
  {
    id: "tier", nazev: "Tier", razeni: "tier",
    popis: "tier je i v názvu — sloupec je hlavně na řazení",
  },
];

/**
 * Co je vypnuté, dokud si uživatel nevybere sám.
 *
 * Stáří proto, že u ručně zadaných cen ani u 30denního mediánu se nikdy nic
 * nezobrazí. Zbytek proto, aby tabulka po přidání sloupců nezhoustla —
 * kdo je chce, zapne si je.
 */
export const VYCHOZI_SKRYTE: SloupecId[] =
  ["stari", "ziskNaKus", "ziskNaKg", "ziskNaFocus", "tier"];

const KLIC = "albion:sloupce-dilny:v1";

export function nactiSkryte(): SloupecId[] {
  try {
    const s = localStorage.getItem(KLIC);
    if (!s) return VYCHOZI_SKRYTE;
    const d = JSON.parse(s);
    if (!Array.isArray(d)) return VYCHOZI_SKRYTE;
    // Neznámá id se zahodí — přežije to i přejmenování sloupce.
    return d.filter((x): x is SloupecId => SLOUPCE.some((c) => c.id === x));
  } catch {
    return VYCHOZI_SKRYTE;
  }
}

export function ulozSkryte(skryte: SloupecId[]): void {
  try {
    localStorage.setItem(KLIC, JSON.stringify(skryte));
  } catch {
    // Nevadí — volba sloupců je pohodlí, ne nutnost.
  }
}

export function viditelne(skryte: SloupecId[]): DefiniceSloupce[] {
  return SLOUPCE.filter((s) => !skryte.includes(s.id));
}

export function prepniSloupec(skryte: SloupecId[], id: SloupecId): SloupecId[] {
  return skryte.includes(id) ? skryte.filter((x) => x !== id) : [...skryte, id];
}

/**
 * Řadí se právě podle sloupce, který se chystáme vypnout?
 *
 * Kdyby ano a nechali bychom to být, tabulka by se řadila podle něčeho
 * neviditelného a vypadala by zpřeházeně.
 */
export function skryvamePodleCehoRadime(id: SloupecId, razeni: Razeni): boolean {
  const sloupec = SLOUPCE.find((s) => s.id === id);
  return sloupec?.razeni !== undefined && sloupec.razeni === razeni;
}
