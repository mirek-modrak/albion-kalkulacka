/**
 * Datové typy jádra.
 *
 * Jádro nesahá na síť ani na DOM. Dostane čísla, vrátí čísla.
 * Díky tomu jde spustit v prohlížeči i na serveru a otestovat bez klikání.
 */

// ─────────────────────────────────────────────────────────────
// Identita položky
// ─────────────────────────────────────────────────────────────

/**
 * Druh položky. Rozhoduje o tom, jak se skládá ID enchantované varianty —
 * a to se mezi druhy LIŠÍ (viz identita.ts). Proto to musí být v datech.
 */
export type Druh = "surovina" | "vybava";

/** Stupeň enchantu. V herních datech existují 0–4. */
export type Enchant = 0 | 1 | 2 | 3 | 4;

/**
 * Položka = základní herní ID (už obsahuje tier) + stupeň enchantu.
 *
 * Proč ne jen řetězec: formát ID pro herní data a pro AODP se liší,
 * a u surovin jinak než u výbavy. Držet jen řetězec znamená skládat ho
 * opakovaně na různých místech — a tam vznikají chyby.
 */
export interface Polozka {
  /** Např. "T5_METALBAR" nebo "T5_MAIN_SWORD". Vždy bez enchantu. */
  zaklad: string;
  enchant: Enchant;
}

// ─────────────────────────────────────────────────────────────
// Herní data (generovaná z ao-bin-dumps)
// ─────────────────────────────────────────────────────────────

/** Jeden vstup receptu. */
export interface Vstup {
  zaklad: string;
  enchant: Enchant;
  pocet: number;
  /**
   * Vrací se tahle surovina přes return rate?
   * Artefakty, runy, duše a relikvie se nevracejí.
   * NEOVĚŘENO oficiálním zdrojem — viz docs/f1-plan.md, vada 6.
   */
  vratna: boolean;
}

/**
 * Jedna varianta receptu.
 *
 * Položka jich má víc: suroviny od T4 mají alternativu s faction tokenem,
 * výbava má variantu pro každý stupeň enchantu.
 */
export interface Varianta {
  enchant: Enchant;
  vstupy: Vstup[];
  /** Kolik kusů vznikne. NENÍ vždy 1. */
  pocetVyrobenych: number;
  focus: number;
  cas: number;
  /** Používá faction token? Ve výchozím výběru se přeskakuje. */
  sFactionTokenem: boolean;
}

/** Cesta vylepšení hotového předmětu (runa / duše / relikvie). */
export interface Vylepseni {
  naEnchant: Enchant;
  vstupy: Vstup[];
}

/** Položka tak, jak ji popisují herní data. */
export interface HerniPolozka {
  zaklad: string;
  /** Herní název, např. „Expert's Broadsword". Null u nepoužívaných položek. */
  nazev: string | null;
  druh: Druh;
  tier: number;
  /** Váha jednoho kusu v kg. Enchant ji nemění. */
  vaha: number;
  /** itemvalue při enchantu 0. Každý stupeň enchantu ji zdvojnásobuje. */
  itemValue: number;
  /** Kategorie pro bonus města, např. "ore", "sword", "plate_armor". */
  kategorie: string | null;
  /** Nejvyšší dostupný enchant. Kámen a spousta věcí má 0. */
  maxEnchant: Enchant;
  varianty: Varianta[];
  vylepseni: Vylepseni[];
}

/** Druh lokace. Města mají jméno použitelné vůči AODP, ostatní ne. */
export type TypLokace = "mesto" | "hideout" | "jine";

/** Bonusy jedné lokace. */
export interface Lokace {
  /** U měst jméno shodné s parametrem `locations` v AODP. */
  nazev: string;
  typ: TypLokace;
  refiningBonus: number;
  craftingBonus: number;
  /** Kategorie → přídavek, např. { ore: 0.40, mace: 0.15 }. */
  modifikatory: Record<string, number>;
}

/** Globální konstanty z gamedata.xml. */
export interface Konstanty {
  setupFee: number;
  danNormalni: number;
  danPremium: number;
  minimalniDan: number;
  blackMarketSetupFee: number;
  bonusFocus: number;
  /** Nutrition = itemValue × tohle. NEOVĚŘENO z herních dat. */
  nutritionKoeficient: number;
}

/** Celý vygenerovaný datový soubor. */
export interface HerniData {
  /** Commit ao-bin-dumps, ze kterého data pocházejí. */
  commit: string;
  vygenerovano: string;
  konstanty: Konstanty;
  lokace: Lokace[];
  polozky: HerniPolozka[];
}

// ─────────────────────────────────────────────────────────────
// Ceny
// ─────────────────────────────────────────────────────────────

/** Odkud se cena vzala. Rozhoduje o důvěryhodnosti výsledku. */
export type ZdrojCeny = "aodp" | "rucne" | "prumer";

/** Který sloupec order booku. */
export type TypCeny = "sell_min" | "buy_max";

/**
 * Cena NIKDY není holé číslo.
 *
 * Data z AODP jsou crowdsourcovaná a mohou být týden stará, aniž by to bylo
 * poznat. Kdyby cena byla jen číslo, tahle informace se ztratí na prvním
 * předání a kalkulačka pak tvrdí nesmysly stejně sebejistě jako pravdu.
 */
export interface Cena {
  hodnota: number;
  zdroj: ZdrojCeny;
  /** ISO čas. U ručního zadání okamžik zadání. */
  cas: string | null;
  mesto: string;
  typ: TypCeny;
}

// ─────────────────────────────────────────────────────────────
// Výpočet
// ─────────────────────────────────────────────────────────────

/** Co ovlivňuje return rate. */
export interface NastaveniBonusu {
  mesto: string;
  focus: boolean;
  denniBonus: number;
  /** Ruční hodnota 0–1. Má přednost před vším ostatním (hideout, ostrov). */
  rucniReturnRate?: number;
}

/** Rozpad return rate — aby bylo vidět, odkud se číslo vzalo. */
export interface RozpadBonusu {
  bonusCelkem: number;
  returnRate: number;
  /** Kolikrát víc vyrobíš, než koupíš = 1/(1−RRR). */
  nasobek: number;
  slozky: { popis: string; hodnota: number }[];
  rucni: boolean;
}
