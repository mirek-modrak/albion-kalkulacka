/**
 * Koupit, nebo vyrobit? — rekurzivní výpočet nákladu přes celý řetěz.
 *
 * Recepty tvoří řetěz: T5 ingot ← T4 ingot ← T3 ingot ← T2 ingot ← ruda.
 * Na KAŽDÉM patře se uplatní return rate, takže úspora z vlastní výroby
 * se skládá. Když je ale surovina vzácná, může být levnější koupit hotové.
 *
 * Jádro:
 *   naklad(p) = min( cena na trhu,  Σ naklad(vstup) × efektivní počet + poplatek )
 */

import { returnRate } from "./bonusy.js";
import { poplatekStanice, vybratVariantu } from "./recept.js";
import type { Enchant, HerniPolozka, Konstanty } from "./typy.js";

/** Jak se k položce dostat. */
export type Zpusob = "koupit" | "vyrobit" | "nedostupne";

export interface UzelRetezce {
  zaklad: string;
  enchant: Enchant;
  /** Co se vyplatí. */
  zpusob: Zpusob;
  /** Náklad na jeden kus tou levnější cestou. */
  naklad: number | null;
  /** Cena na trhu, pokud je známá. */
  cenaNaTrhu: number | null;
  /** Náklad při vlastní výrobě, pokud jde vyrobit. */
  nakladVyrobou: number | null;
  /** O kolik je výroba levnější (0,15 = o 15 %). Null, když nejde porovnat. */
  usporaVyrobou: number | null;
  /** Return rate na tomhle patře. Liší se podle města i suroviny. */
  returnRate: number;
  /** Focus na jeden kus, když se vyrábí. */
  focus: number;
  /** Vstupy — jen když se vyrábí. */
  vstupy: { uzel: UzelRetezce; pocetNaKus: number; efektivneNaKus: number }[];
}

export interface KontextRetezce {
  /** Najde položku v herních datech. */
  najdiPolozku: (zaklad: string) => HerniPolozka | undefined;
  /** Cena na trhu, nebo null. */
  cena: (zaklad: string, enchant: Enchant) => number | null;
  /** Production bonus pro danou položku — liší se podle města a suroviny. */
  bonusProPolozku: (polozka: HerniPolozka) => number;
  sazbaStanice: number;
  konstanty: Konstanty;
  /** Pojistka proti zacyklení. */
  maxHloubka?: number;
}

const VYCHOZI_MAX_HLOUBKA = 12;

function klic(zaklad: string, enchant: number): string {
  return `${zaklad}#${enchant}`;
}

/**
 * Spočítá, jestli je levnější položku koupit, nebo vyrobit.
 *
 * @param naVrcholuVzdyVyrobit u zkoumané položky nás zajímá výroba,
 *   i kdyby byl nákup levnější — chceme vidět obě čísla
 */
export function spocitatRetezec(
  zaklad: string,
  enchant: Enchant,
  kontext: KontextRetezce,
): UzelRetezce {
  return uzel(zaklad, enchant, kontext, new Map(), new Set(), 0);
}

function uzel(
  zaklad: string,
  enchant: Enchant,
  kontext: KontextRetezce,
  kes: Map<string, UzelRetezce>,
  naCeste: Set<string>,
  hloubka: number,
): UzelRetezce {
  const k = klic(zaklad, enchant);

  // Táž položka je vstupem víc receptů — bez keše by se u T8 počítala
  // exponenciálně mnohokrát.
  const ulozeny = kes.get(k);
  if (ulozeny) return ulozeny;

  const cenaNaTrhu = kontext.cena(zaklad, enchant);
  const polozka = kontext.najdiPolozku(zaklad);

  const jenKoupit = (): UzelRetezce => ({
    zaklad, enchant,
    zpusob: cenaNaTrhu !== null ? "koupit" : "nedostupne",
    naklad: cenaNaTrhu,
    cenaNaTrhu, nakladVyrobou: null, usporaVyrobou: null,
    returnRate: 0, focus: 0, vstupy: [],
  });

  // Konec rekurze: položka bez receptu (raw surovina se sbírá, nevyrábí).
  if (!polozka) return zapamatuj(kes, k, jenKoupit());

  // Ochrana proti cyklu. V herních datech by být neměl, ale kdyby se
  // objevil, zacyklil by výpočet a shodil prohlížeč.
  if (naCeste.has(k) || hloubka >= (kontext.maxHloubka ?? VYCHOZI_MAX_HLOUBKA)) {
    return jenKoupit();   // NEcachovat — platí jen pro tuhle větev
  }

  const varianta = vybratVariantu(polozka, enchant);
  if (!varianta) return zapamatuj(kes, k, jenKoupit());

  // Return rate se počítá pro KAŽDOU položku zvlášť — bonus města platí
  // jen na svou surovinu. V Thetfordu má ruda +40, dřevo nic.
  const rrr = returnRate(kontext.bonusProPolozku(polozka));

  naCeste.add(k);

  let nakladVstupu = 0;
  let lzeVyrobit = true;
  const vstupy: UzelRetezce["vstupy"] = [];

  for (const vstup of varianta.vstupy) {
    const dite = uzel(vstup.zaklad, vstup.enchant, kontext, kes, naCeste, hloubka + 1);

    // Vrácené suroviny snižují spotřebu — ale jen ty vratné.
    // Artefakty a runy se nevracejí.
    const naKus = (vstup.pocet / varianta.pocetVyrobenych);
    const efektivne = vstup.vratna ? naKus * (1 - rrr) : naKus;

    vstupy.push({ uzel: dite, pocetNaKus: naKus, efektivneNaKus: efektivne });

    if (dite.naklad === null) lzeVyrobit = false;
    else nakladVstupu += dite.naklad * efektivne;
  }

  naCeste.delete(k);

  // Poplatek stanice se platí na KAŽDÉM patře, kde se vyrábí.
  const poplatek = poplatekStanice(
    polozka, enchant, kontext.sazbaStanice, kontext.konstanty.nutritionKoeficient,
  );
  // Pevný poplatek za dávku — nenulový u transmutace suroviny na vyšší
  // tier. Bez něj by transmutace vypadala zadarmo a řetěz by ji chybně
  // doporučoval.
  const silverNaKus = varianta.silver / varianta.pocetVyrobenych;

  const nakladVyrobou = lzeVyrobit ? nakladVstupu + poplatek + silverNaKus : null;

  // Levnější cesta vyhrává. Když jde jen jedna, bereme ji — vrátit
  // „nedostupné" jen proto, že chybí prostřední článek, by zahodilo
  // platný výsledek.
  const zpusob: Zpusob =
    cenaNaTrhu !== null && nakladVyrobou !== null
      ? (nakladVyrobou < cenaNaTrhu ? "vyrobit" : "koupit")
      : cenaNaTrhu !== null ? "koupit"
        : nakladVyrobou !== null ? "vyrobit"
          : "nedostupne";

  const naklad =
    zpusob === "vyrobit" ? nakladVyrobou
      : zpusob === "koupit" ? cenaNaTrhu
        : null;

  const usporaVyrobou =
    cenaNaTrhu !== null && nakladVyrobou !== null && cenaNaTrhu > 0
      ? (cenaNaTrhu - nakladVyrobou) / cenaNaTrhu
      : null;

  return zapamatuj(kes, k, {
    zaklad, enchant, zpusob, naklad, cenaNaTrhu, nakladVyrobou, usporaVyrobou,
    returnRate: rrr,
    focus: varianta.focus / varianta.pocetVyrobenych,
    vstupy: zpusob === "vyrobit" ? vstupy : [],
  });
}

function zapamatuj(kes: Map<string, UzelRetezce>, k: string, u: UzelRetezce): UzelRetezce {
  kes.set(k, u);
  return u;
}

/**
 * Souhrn celého řetězu.
 *
 * Úspora v silveru není celá pravda — hluboká výroba stojí čas a focus
 * na každém patře. Bez těch čísel by kalkulačka doporučovala výrobu,
 * aniž by řekla, co to obnáší.
 */
export function shrnRetezec(korenu: UzelRetezce): {
  focusCelkem: number;
  krokuVyroby: number;
  nejhlubsiUroven: number;
} {
  let focusCelkem = 0;
  let krokuVyroby = 0;
  let nejhlubsiUroven = 0;

  const projdi = (u: UzelRetezce, mnozstvi: number, uroven: number) => {
    if (u.zpusob !== "vyrobit") return;
    focusCelkem += u.focus * mnozstvi;
    krokuVyroby++;
    nejhlubsiUroven = Math.max(nejhlubsiUroven, uroven);
    for (const v of u.vstupy) projdi(v.uzel, mnozstvi * v.efektivneNaKus, uroven + 1);
  };

  projdi(korenu, 1, 0);
  return { focusCelkem, krokuVyroby, nejhlubsiUroven };
}
