/**
 * Načtení herních dat a rejstříky nad nimi.
 *
 * Soubor má 3,4 MB nekomprimovaně, ale 103 kB po gzipu, takže se importuje
 * přímo. Vite ho zabalí a server ho pošle komprimovaný.
 */

import type { HerniData, HerniPolozka, Lokace } from "@albion/jadro";
import surova from "../../../jadro/data/hra.json";

export const HRA = surova as unknown as HerniData;

/** Rejstřík položek podle základu — vyhledání v konstantním čase. */
const PODLE_ZAKLADU = new Map<string, HerniPolozka>(
  HRA.polozky.map((p) => [p.zaklad, p]),
);

export function polozka(zaklad: string): HerniPolozka | undefined {
  return PODLE_ZAKLADU.get(zaklad);
}

/** Váha jednoho kusu. Enchant váhu nemění, stačí základ. */
export function vaha(zaklad: string): number {
  return PODLE_ZAKLADU.get(zaklad)?.vaha ?? 0;
}

/** Města s bonusy, v pořadí, v jakém je má smysl nabízet. */
export const MESTA: Lokace[] = HRA.lokace.filter((l) => l.typ === "mesto");

/**
 * Black Market — název lokace tak, jak ho zná AODP.
 *
 * **Není to město a NESMÍ být v `MESTA`.** Nemá crafting ani refining bonus,
 * nedá se v něm vyrábět a nedá se do něj cestovat jinak než přes Caerleon,
 * ve kterém fyzicky je. Kdyby se dostal mezi města, rozbil by bonusy,
 * srovnání měst i převozní trasy.
 *
 * Je to **místo prodeje**. U výbavy navíc to hlavní: naměřeno 2026-07-23,
 * že T6 Main Sword má na běžné caerleonské tržnici za 30 dní nula obchodů,
 * zatímco na Black Marketu ~129 kusů denně.
 */
export const BLACK_MARKET = "Black Market";

export function lokace(nazev: string): Lokace | undefined {
  return HRA.lokace.find((l) => l.nazev === nazev);
}

// ─────────────────────────────────────────────────────────────
// Refining linky
// ─────────────────────────────────────────────────────────────

export interface Linka {
  /** Kategorie shodná s craftingmodifiers.xml — pozor, kámen je "rock". */
  kategorie: string;
  nazev: string;
  /** 4. pád pro větu "bonus na …". */
  koho: string;
  raw: string;
  refined: string;
}

export const LINKY: Linka[] = [
  { kategorie: "ore", nazev: "Ruda → ingoty", koho: "rudu", raw: "ORE", refined: "METALBAR" },
  { kategorie: "hide", nazev: "Kůže → leather", koho: "kůži", raw: "HIDE", refined: "LEATHER" },
  { kategorie: "fiber", nazev: "Vlákno → látka", koho: "vlákno", raw: "FIBER", refined: "CLOTH" },
  { kategorie: "wood", nazev: "Dřevo → prkna", koho: "dřevo", raw: "WOOD", refined: "PLANKS" },
  { kategorie: "rock", nazev: "Kámen → bloky", koho: "kámen", raw: "ROCK", refined: "STONEBLOCK" },
];

export interface Kombinace {
  polozka: HerniPolozka;
  enchant: number;
}

/** Enchanty, pro které daná položka opravdu má recept. */
function dostupneEnchanty(p: HerniPolozka): number[] {
  const e = new Set(p.varianty.map((v) => v.enchant));
  return [...e].sort((a, b) => a - b);
}

/**
 * Všechny refined suroviny, které existují.
 *
 * Kombinace se generují Z DAT, ne pevným seznamem 0–4 — kámen enchanty nemá
 * a nabízet je by znamenalo shánět ceny neexistujících položek.
 */
export function refinedKombinace(): Kombinace[] {
  const vysledek: Kombinace[] = [];

  for (const linka of LINKY) {
    for (let tier = 2; tier <= 8; tier++) {
      const p = PODLE_ZAKLADU.get(`T${tier}_${linka.refined}`);
      if (!p) continue;
      for (const e of dostupneEnchanty(p)) vysledek.push({ polozka: p, enchant: e });
    }
  }
  return vysledek;
}

/** Výbava ve vybraných kategoriích, se všemi dostupnými enchanty. */
export function vybavaKombinace(kategorie: string[]): Kombinace[] {
  const patri = new Set(kategorie);
  const vysledek: Kombinace[] = [];

  for (const p of HRA.polozky) {
    if (p.druh !== "vybava" || !p.kategorie || !patri.has(p.kategorie)) continue;
    for (const e of dostupneEnchanty(p)) vysledek.push({ polozka: p, enchant: e });
  }
  return vysledek;
}

/** Verze herních dat pro zobrazení — ať je poznat, z čeho se počítá. */
export const VERZE_DAT = {
  commit: HRA.commit.slice(0, 8),
  vygenerovano: HRA.vygenerovano.slice(0, 10),
};
