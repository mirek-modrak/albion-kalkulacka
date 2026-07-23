/**
 * Srovnání převozních příležitostí.
 *
 * Pro zvolené výchozí město projde všechny položky × všechna cílová města
 * a seřadí je. Výchozí město volí uživatel, jinak by to bylo 42 směrovaných
 * dvojic na položku (7 měst × 6 cílů) — u 115 surovin 4 830 kombinací.
 */

import {
  kusuNaMount, spocitatPrevoz, ziskZaCestu,
  type Enchant, type HerniPolozka, type Konstanty, type VysledekPrevozu,
} from "@albion/jadro";
import { MESTA } from "../data/hra";
import type { SkladCen } from "./skladCen";
import {
  kombinaceProSken, typProNakup, typProProdej,
  type NastaveniSkenu, type RezimCeny,
} from "./sken";

export interface NastaveniPrevozu extends NastaveniSkenu {
  /** Město, kde nakupuju. */
  vychoziMesto: string;
  /** Nosnost mountu v kg. */
  nosnostKg: number;
  /** Očekávaná ztráta zásilek, 0–1. Odhad uživatele, není v datech. */
  ztrataZasilek: number;
}

export interface RadekPrevozu {
  klic: string;
  polozka: HerniPolozka;
  enchant: Enchant;
  nazev: string;
  cilovéMesto: string;
  vysledek: VysledekPrevozu | null;
  cenaNakup: number | null;
  cenaProdej: number | null;
  /** Kolik kusů se vejde na mount. */
  kusuNaCestu: number;
  /** Kolik vydělá jedna plně naložená cesta. */
  ziskZaCestu: number | null;
  /** Stáří té starší z obou cen — u arbitráže záleží na obou. */
  stariHodin: number | null;
  /**
   * Trasa vede do Caerleonu nebo z něj.
   *
   * Caerleon leží v černé zóně. Mirek: „tam vykopává suroviny server,
   * takže tam vznikají nejlepší příležitosti — ale je to nejrizikovější."
   */
  riskantni: boolean;
}

export type MetrikaPrevozu = "ziskNaKg" | "ziskZaCestu" | "marze" | "zisk" | "ziskNaKus";

export const METRIKY_PREVOZU: { id: MetrikaPrevozu; nazev: string; popis: string }[] = [
  { id: "ziskNaKg", nazev: "Zisk na kilogram", popis: "omezením je nosnost" },
  { id: "ziskZaCestu", nazev: "Zisk za jednu cestu", popis: "plně naložený mount" },
  { id: "marze", nazev: "Zisk na vložený silver", popis: "mám omezený kapitál" },
  { id: "ziskNaKus", nazev: "Zisk na kus", popis: "" },
  { id: "zisk", nazev: "Zisk celkem", popis: "pozor: závisí na zadaném počtu" },
];

const JE_RISKANTNI = new Set(["Caerleon"]);

export function spocitatPrevozy(
  nastaveni: NastaveniPrevozu,
  sklad: SkladCen,
  konstanty: Konstanty,
  nazevPolozky: (zaklad: string, enchant: number) => string,
): RadekPrevozu[] {
  const radky: RadekPrevozu[] = [];
  const typNakup = typProNakup(nastaveni.rezimNakupu as RezimCeny);
  const typProdej = typProProdej(nastaveni.rezimProdeje as RezimCeny);

  for (const { polozka, enchant } of kombinaceProSken(nastaveni.skupina, nastaveni.kategorie)) {
    const e = enchant as Enchant;
    const cNakup = sklad.ziskej(nastaveni.vychoziMesto, polozka.zaklad, e, typNakup);

    for (const cil of MESTA) {
      if (cil.nazev === nastaveni.vychoziMesto) continue;   // vézt do sebe nedává smysl

      const cProdej = sklad.ziskej(cil.nazev, polozka.zaklad, e, typProdej);
      const klic = `${polozka.zaklad}#${e}|${cil.nazev}`;
      const riskantni = JE_RISKANTNI.has(cil.nazev)
        || JE_RISKANTNI.has(nastaveni.vychoziMesto);

      const zaklad = {
        klic, polozka, enchant: e,
        nazev: nazevPolozky(polozka.zaklad, e),
        cilovéMesto: cil.nazev,
        cenaNakup: cNakup?.hodnota ?? null,
        cenaProdej: cProdej?.hodnota ?? null,
        stariHodin: sklad.nejstarsiStari([cNakup, cProdej]),
        riskantni,
      };

      if (!cNakup?.hodnota || !cProdej?.hodnota) {
        radky.push({ ...zaklad, vysledek: null, kusuNaCestu: 0, ziskZaCestu: null });
        continue;
      }

      const v = spocitatPrevoz({
        vahaKusu: polozka.vaha,
        pocet: nastaveni.pocetVyrobku,
        cenaNakup: cNakup,
        cenaProdej: cProdej,
        premium: nastaveni.premium,
        rezimNakupu: nastaveni.rezimNakupu,
        rezimProdeje: nastaveni.rezimProdeje,
        prodejNaBlackMarketu: false,
        ztrataZasilek: nastaveni.ztrataZasilek,
      }, konstanty);

      radky.push({
        ...zaklad,
        vysledek: v,
        kusuNaCestu: kusuNaMount(nastaveni.nosnostKg, polozka.vaha),
        ziskZaCestu: ziskZaCestu(nastaveni.nosnostKg, polozka.vaha, v.ziskNaKg),
      });
    }
  }

  return radky;
}

export function hodnotaMetrikyPrevozu(r: RadekPrevozu, metrika: MetrikaPrevozu): number {
  if (!r.vysledek) return -Infinity;
  switch (metrika) {
    case "ziskNaKg": return r.vysledek.ziskNaKg ?? -Infinity;
    case "ziskZaCestu": return r.ziskZaCestu ?? -Infinity;
    case "marze": return r.vysledek.marze;
    case "zisk": return r.vysledek.zisk;
    case "ziskNaKus": return r.vysledek.ziskNaKus;
  }
}

export function seraditPrevozy(radky: RadekPrevozu[], metrika: MetrikaPrevozu): RadekPrevozu[] {
  return [...radky].sort(
    (a, b) => hodnotaMetrikyPrevozu(b, metrika) - hodnotaMetrikyPrevozu(a, metrika),
  );
}

export function souhrnPrevozu(radky: RadekPrevozu[]) {
  const spocitane = radky.filter((r) => r.vysledek !== null);
  const ziskove = spocitane.filter((r) => (r.vysledek?.zisk ?? 0) > 0);

  const pocty = new Map<string, number>();
  for (const r of ziskove) pocty.set(r.cilovéMesto, (pocty.get(r.cilovéMesto) ?? 0) + 1);

  return {
    celkem: radky.length,
    spocitano: spocitane.length,
    ziskove: ziskove.length,
    riskantni: ziskove.filter((r) => r.riskantni).length,
    podleCilu: [...pocty.entries()]
      .map(([mesto, pocet]) => ({ mesto, pocet }))
      .sort((a, b) => b.pocet - a.pocet),
  };
}
