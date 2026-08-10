/**
 * Stanice a jejich sazby.
 *
 * Poplatek za použití stanice si nastavuje **majitel stavby**, takže se
 * liší budovu od budovy: Tavírna v Thetfordu má jinou sazbu než Mage's
 * Tower v Lymhurstu. Jedno číslo pro celou aplikaci (stav do F11) je proto
 * principiálně špatně, ne jen nepohodlné.
 *
 * **Herní data stanici neobsahují.** `items.xml` má jen `craftingcategory`
 * (`sword`, `plate_armor`, `ore`…), takže mapování kategorie → stavba
 * vzniká tady. Je to odhad potvrzený hráčem (Mirek, 2026-08-10), ne fakt
 * z dat — proto se stanice zobrazuje i v rozhraní u položky. Kdyby byla
 * schovaná v konfiguraci, případná chyba by se nikdy neprojevila jinak
 * než jako nevysvětlitelně jiné číslo.
 */

import type { HerniPolozka } from "@albion/jadro";

export type StaniceId =
  | "tavirna" | "kozeluzna" | "tkalcovna" | "pila" | "kamenictvi"
  | "forge" | "lodge" | "tower" | "toolmaker";

export interface Stanice {
  id: StaniceId;
  nazev: string;
  /** Co se v ní vyrábí — do popisku u políčka se sazbou. */
  popis: string;
  /** Herní kategorie (`craftingcategory`), které sem patří. */
  kategorie: string[];
  /** Refining stanice se v Refiningu nabízejí, craftingové v Dílně. */
  refining: boolean;
}

/**
 * Devět stanic.
 *
 * Refining má pět linek, každou ve vlastní stavbě. U craftingu jde brnění
 * vždycky se zbraněmi téhož materiálu: plátové do kovárny, kožené do
 * lovecké chaty, látkové do věže.
 */
export const STANICE: Stanice[] = [
  {
    id: "tavirna", nazev: "Tavírna", popis: "ruda → ingoty",
    kategorie: ["ore"], refining: true,
  },
  {
    id: "kozeluzna", nazev: "Koželužna", popis: "kůže → leather",
    kategorie: ["hide"], refining: true,
  },
  {
    id: "tkalcovna", nazev: "Tkalcovna", popis: "vlákno → látka",
    kategorie: ["fiber"], refining: true,
  },
  {
    id: "pila", nazev: "Pila", popis: "dřevo → prkna",
    kategorie: ["wood"], refining: true,
  },
  {
    id: "kamenictvi", nazev: "Kamenictví", popis: "kámen → bloky",
    kategorie: ["rock"], refining: true,
  },
  {
    id: "forge", nazev: "Warrior's Forge", popis: "meče, sekery, kuše, plátové brnění, štíty",
    kategorie: [
      "sword", "axe", "mace", "hammer", "knuckles", "crossbow",
      "plate_helmet", "plate_armor", "plate_shoes", "shieldtype",
    ],
    refining: false,
  },
  {
    id: "lodge", nazev: "Hunter's Lodge", popis: "luky, kopí, dýky, hole, kožené brnění",
    kategorie: [
      "bow", "spear", "dagger", "quarterstaff", "naturestaff",
      "leather_helmet", "leather_armor", "leather_shoes",
    ],
    refining: false,
  },
  {
    id: "tower", nazev: "Mage's Tower", popis: "magické hole, látkové brnění, offhand",
    kategorie: [
      "firestaff", "froststaff", "arcanestaff", "holystaff", "cursestaff",
      "cloth_helmet", "cloth_armor", "cloth_shoes", "offhand", "offhands",
    ],
    refining: false,
  },
  {
    id: "toolmaker", nazev: "Toolmaker", popis: "nástroje, sběrné vybavení, tašky, pláště",
    kategorie: ["tools", "gatherergear", "bag", "cape"],
    refining: false,
  },
];

/**
 * Sazba pro položku, jejíž kategorie nemá stanici.
 *
 * **Nikdy nula.** Nula znamená „stanice zdarma", což je nepravda, která
 * by tiše nadhodnotila zisk — přesně ta vada, kvůli které se v F10
 * opravoval `itemValue`. Kategorie navíc můžou přibýt herním patchem,
 * takže tenhle případ nastane i bez chyby v mapování.
 */
export const VYCHOZI_SAZBA = 200;

/** Sazby, které si uživatel nastavil. Chybějící = `VYCHOZI_SAZBA`. */
export type SazbyStanic = Partial<Record<StaniceId, number>>;

const PODLE_KATEGORIE = new Map<string, StaniceId>(
  STANICE.flatMap((s) => s.kategorie.map((k) => [k, s.id] as [string, StaniceId])),
);

/** Ve které stanici se tahle kategorie vyrábí. `null` = neznámá. */
export function staniceProKategorii(kategorie: string | null | undefined): StaniceId | null {
  if (!kategorie) return null;
  const primo = PODLE_KATEGORIE.get(kategorie);
  if (primo) return primo;
  // Pláště jsou v datech rozdrobené podle frakcí (`accessoires_capes_morgana`),
  // ale vyrábějí se všechny stejně. Stejný precedent jako v `kategorie.ts`.
  if (kategorie.startsWith("accessoires_capes")) return "toolmaker";
  return null;
}

export function staniceProPolozku(polozka: HerniPolozka | null | undefined): StaniceId | null {
  return staniceProKategorii(polozka?.kategorie);
}

export function nazevStanice(id: StaniceId | null): string {
  return STANICE.find((s) => s.id === id)?.nazev ?? "neznámá stanice";
}

/**
 * Sazba pro danou kategorii.
 *
 * **Jediný zdroj pravdy pro UI i výpočet.** Kdyby si rozhraní pravidlo
 * opsalo, uživatel by přepsal sazbu a čísla by se nezměnila — stejná past
 * jako u `kamSeProdava` v Dílně.
 */
export function sazbaProKategorii(
  sazby: SazbyStanic, kategorie: string | null | undefined,
): number {
  const id = staniceProKategorii(kategorie);
  if (id === null) return VYCHOZI_SAZBA;
  const s = sazby[id];
  return typeof s === "number" && Number.isFinite(s) && s >= 0 ? s : VYCHOZI_SAZBA;
}

export function sazbaProPolozku(
  sazby: SazbyStanic, polozka: HerniPolozka | null | undefined,
): number {
  return sazbaProKategorii(sazby, polozka?.kategorie);
}

/**
 * Které stanice má smysl nabízet pro sadu položek.
 *
 * Devět políček naráz je stěna. Refining ukáže svých pět linek, Dílna
 * jen ty stavby, do kterých ji její seznam opravdu posílá.
 */
export function staniceProPolozky(polozky: (HerniPolozka | null | undefined)[]): Stanice[] {
  const pouzite = new Set<StaniceId>();
  for (const p of polozky) {
    const id = staniceProPolozku(p);
    if (id) pouzite.add(id);
  }
  return STANICE.filter((s) => pouzite.has(s.id));
}

/** Očistí uložené sazby — poškozený obsah nesmí shodit výpočet. */
export function ocistiSazby(x: unknown): SazbyStanic {
  const vysledek: SazbyStanic = {};
  if (!x || typeof x !== "object" || Array.isArray(x)) return vysledek;
  for (const s of STANICE) {
    const hodnota = (x as Record<string, unknown>)[s.id];
    if (typeof hodnota === "number" && Number.isFinite(hodnota) && hodnota >= 0) {
      // Strop proti překlepu o řád — sazby stanic se pohybují v stovkách.
      vysledek[s.id] = Math.min(hodnota, 1_000_000);
    }
  }
  return vysledek;
}

/**
 * Nastaví všem stanicím tutéž sazbu.
 *
 * Slouží k migraci ze stavu, kdy bylo v aplikaci jedno společné číslo.
 * Bez toho by po aktualizaci všechny stanice spadly na výchozí hodnotu
 * a čísla by se uživateli tiše změnila, aniž by cokoli udělal.
 */
export function vsemStanicim(sazba: number): SazbyStanic {
  const vysledek: SazbyStanic = {};
  for (const s of STANICE) vysledek[s.id] = sazba;
  return vysledek;
}
