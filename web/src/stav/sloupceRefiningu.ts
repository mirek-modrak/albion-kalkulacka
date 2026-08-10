/**
 * Sloupce tabulky Refiningu.
 *
 * Vlastní seznam, ne sdílený s Dílnou: Dílna má jeden sloupec „Kde → kam",
 * refining tři samostatná města, a naopak nemá Black Market. Sdílet jeden
 * seznam by znamenalo, že si obě karty budou navzájem nabízet sloupce,
 * které v té druhé nedávají smysl.
 *
 * Mechanika je stejná jako u [sloupceDilny](./sloupceDilny.ts): **ukládá se
 * seznam VYPNUTÝCH**, aby se sloupec přidaný v budoucí verzi objevil všem.
 * A stejně jako tam se volba nesynchronizuje — je to vlastnost zařízení.
 */

import type { Razeni } from "./filtrDilny";
import type { DefiniceSloupce } from "./sloupceDilny";

export type SloupecRefiningu =
  | "kdeKoupit" | "kdeRefinovat" | "kdeProdat"
  | "vraceni" | "prodej"
  | "zisk" | "marze" | "ziskNaKus" | "ziskNaKg" | "ziskNaFocus"
  | "naklad" | "trzba" | "nizsiTier" | "likvidita" | "jizdy" | "stari" | "tier";

/**
 * Název položky a tlačítko na odebrání jsou natvrdo, mimo tenhle seznam —
 * bez názvu jsou řádky k nerozeznání a uživatel by se z toho nedostal.
 *
 * Města se **neřadí**. Řazení podle názvu města nikomu neodpoví na otázku,
 * kvůli které se do karty kouká; na seskupení je filtr měst.
 */
export const SLOUPCE_REFININGU: DefiniceSloupce<SloupecRefiningu>[] = [
  { id: "kdeKoupit", nazev: "Koupit kde", popis: "město nákupu surovin" },
  {
    id: "kdeRefinovat", nazev: "Refinovat kde",
    popis: "město výroby — tady působí bonus na surovinu",
  },
  { id: "kdeProdat", nazev: "Prodat kde", popis: "město prodeje" },
  {
    id: "vraceni", nazev: "Vrácení", vpravo: true, razeni: "vraceni",
    popis: "podíl surovin, které se vrátí — největší páka refiningu",
  },
  {
    id: "prodej", nazev: "Prodej / ks", vpravo: true,
    popis: "cena, za kterou prodáváš — dá se přepsat ručně",
  },
  { id: "zisk", nazev: "Zisk", vpravo: true, razeni: "zisk" },
  { id: "marze", nazev: "Marže", vpravo: true, razeni: "marze" },
  { id: "naklad", nazev: "Náklad / ks", vpravo: true, razeni: "naklad" },
  {
    id: "nizsiTier", nazev: "Nižší tier", razeni: "usporaVyrobou",
    popis: "vyplatí se ho koupit, nebo si ho refinovat?",
  },
  { id: "likvidita", nazev: "Likvidita", razeni: "likvidita" },
  { id: "ziskNaKus", nazev: "Zisk / ks", vpravo: true, razeni: "ziskNaKus" },
  {
    id: "ziskNaKg", nazev: "Zisk / kg", vpravo: true, razeni: "ziskNaKg",
    popis: "když se ti vejde jen jeden mount",
  },
  {
    id: "ziskNaFocus", nazev: "Zisk / focus", vpravo: true, razeni: "ziskNaFocus",
    popis: "když je focus vzácnější než silver",
  },
  {
    id: "trzba", nazev: "Tržba / ks", vpravo: true, razeni: "trzba",
    popis: "prodejní cena po odečtení ztráty cestou",
  },
  {
    id: "jizdy", nazev: "Váha a jízdy", razeni: "vahaNakupu",
    popis: "kolik toho povezeš a na kolik cest mountem",
  },
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
 * Tři města, vrácení, prodejní cena, zisk, marže, náklad, nižší tier
 * a likvidita jsou zapnuté — to je odpověď na otázku, kvůli které karta
 * vznikla. Zbytek by ji jen zahustil.
 */
export const VYCHOZI_SKRYTE_REFININGU: SloupecRefiningu[] =
  ["ziskNaKus", "ziskNaKg", "ziskNaFocus", "trzba", "jizdy", "stari", "tier"];

const KLIC = "albion:sloupce-refiningu:v1";

export function nactiSkryteRefiningu(): SloupecRefiningu[] {
  try {
    const s = localStorage.getItem(KLIC);
    if (!s) return VYCHOZI_SKRYTE_REFININGU;
    const d = JSON.parse(s);
    if (!Array.isArray(d)) return VYCHOZI_SKRYTE_REFININGU;
    // Neznámá id se zahodí — přežije to i přejmenování sloupce.
    return d.filter((x): x is SloupecRefiningu => SLOUPCE_REFININGU.some((c) => c.id === x));
  } catch {
    return VYCHOZI_SKRYTE_REFININGU;
  }
}

export function ulozSkryteRefiningu(skryte: SloupecRefiningu[]): void {
  try {
    localStorage.setItem(KLIC, JSON.stringify(skryte));
  } catch {
    // Nevadí — volba sloupců je pohodlí, ne nutnost.
  }
}

export function viditelneRefiningu(skryte: SloupecRefiningu[]): DefiniceSloupce<SloupecRefiningu>[] {
  return SLOUPCE_REFININGU.filter((s) => !skryte.includes(s.id));
}

export function prepniSloupecRefiningu(
  skryte: SloupecRefiningu[], id: SloupecRefiningu,
): SloupecRefiningu[] {
  return skryte.includes(id) ? skryte.filter((x) => x !== id) : [...skryte, id];
}

/**
 * Řadí se právě podle sloupce, který se chystáme vypnout?
 *
 * Kdyby ano a nechali bychom to být, tabulka by se řadila podle něčeho
 * neviditelného a vypadala by zpřeházeně.
 */
export function skryvameRazeniRefiningu(id: SloupecRefiningu, razeni: Razeni): boolean {
  const sloupec = SLOUPCE_REFININGU.find((s) => s.id === id);
  return sloupec?.razeni !== undefined && sloupec.razeni === razeni;
}
