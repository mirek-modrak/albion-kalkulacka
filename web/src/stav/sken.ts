/**
 * Logika skenu.
 *
 * Sestaví kombinace k prozkoumání, zjistí, které ceny jsou potřeba,
 * spočítá každou kombinaci a vrátí výsledky včetně těch neúplných.
 *
 * Neúplné výsledky se NEZAHAZUJÍ. Kdyby ano, uživatel by viděl pořadí
 * a netušil, že mu v něm chybí zrovna ta nejvýhodnější položka.
 */

import {
  aodpId, spocitat, zAodpId,
  type Cena, type Enchant, type HerniPolozka, type Konstanty,
  type Lokace, type TypCeny, type VysledekVypoctu, type Vstup,
} from "@albion/jadro";
import { refinedKombinace, vybavaKombinace, vaha, type Kombinace } from "../data/hra";
import { SUROVINY_ID, kategorieSkupiny } from "../data/kategorie";
import type { SkladCen } from "./skladCen";

export type RezimCeny = "instant" | "order";

export interface NastaveniSkenu {
  mesto: string;
  focus: boolean;
  denniBonus: number;
  premium: boolean;
  sazbaStanice: number;
  pocetVyrobku: number;
  rezimNakupu: RezimCeny;
  rezimProdeje: RezimCeny;
  /** Co se skenuje — id skupiny z `kategorie.ts`. */
  skupina: string;
  /** Zúžení na konkrétní kategorie ve skupině. Prázdné = celá skupina. */
  kategorie: string[];
}

export type StavRadku = "ok" | "chybi-cena" | "podezrele";

export interface RadekSkenu {
  polozka: HerniPolozka;
  enchant: Enchant;
  nazev: string;
  stav: StavRadku;
  vysledek: VysledekVypoctu | null;
  /** Které ceny chybí — ať uživatel ví, co doplnit. */
  chybejici: string[];
  /** Stáří nejstarší použité ceny v hodinách. Null u ručně zadaných. */
  stariHodin: number | null;
}

/** Metriky řazení. Absolutní zisk je záměrně až dole — viz komentář níž. */
export type Metrika = "marze" | "ziskNaKg" | "ziskNaFocus" | "ziskNaKus" | "zisk";

export const METRIKY: { id: Metrika; nazev: string; popis: string }[] = [
  { id: "marze", nazev: "Zisk na vložený silver", popis: "mám omezený kapitál" },
  { id: "ziskNaKg", nazev: "Zisk na kilogram", popis: "vejde se mi jen jeden mount" },
  { id: "ziskNaFocus", nazev: "Zisk na focus", popis: "focus je vzácnější než silver" },
  { id: "ziskNaKus", nazev: "Zisk na kus", popis: "" },
  { id: "zisk", nazev: "Zisk celkem", popis: "pozor: skoro vždy vyhraje T8" },
];

/**
 * Marže, nad kterou je řádek podezřelý.
 *
 * U tenkého orderbooku bývá 300% marže chyba v datech nebo jeden zbloudilý
 * order, ne příležitost. Označit, ne oslavovat — skener, který nahoře ukáže
 * deset falešných zlatých dolů, je horší než žádný.
 */
const PRAH_PODEZRELE_MARZE = 3;

/** Který sloupec order booku se použije pro nákup a pro prodej. */
export function typProNakup(rezim: RezimCeny): TypCeny {
  return rezim === "instant" ? "sell_min" : "buy_max";
}
export function typProProdej(rezim: RezimCeny): TypCeny {
  return rezim === "instant" ? "buy_max" : "sell_min";
}

/**
 * Kombinace, které se mají skenovat, podle zvoleného rozsahu.
 *
 * @param skupina  id skupiny z `kategorie.ts`, nebo SUROVINY_ID
 * @param kategorie  nepovinné zúžení na konkrétní kategorie ve skupině
 */
export function kombinaceProSken(skupina: string, kategorie?: string[]): Kombinace[] {
  if (skupina === SUROVINY_ID) return refinedKombinace();
  const vybrane = kategorie?.length ? kategorie : kategorieSkupiny(skupina);
  return vybavaKombinace(vybrane);
}

/**
 * Všechna AODP ID, která sken potřebuje.
 *
 * **Sjednocení skenovaných položek a jejich VSTUPŮ.**
 *
 * U surovin to nebylo tolik vidět — T5 ingot potřebuje T4 ingot, který je
 * sám položkou skenu, takže se množiny z velké části překrývaly.
 * U výbavy se nepřekrývají vůbec: skenuješ meče, ale potřebuješ ceny ingotů
 * a kůže. Bez vstupů by všechny řádky skončily na „chybí cena".
 */
export function potrebnaIds(skupina: string, kategorie?: string[]): string[] {
  const ids = new Set<string>();

  for (const { polozka, enchant } of kombinaceProSken(skupina, kategorie)) {
    // ID se skládá VÝHRADNĚ přes aodpId — formát se liší podle druhu
    // (surovina `_LEVEL4@4` vs. výbava `@4`) a skládat ho ručně znamená
    // chybu při každém novém místě v kódu.
    ids.add(aodpId({ zaklad: polozka.zaklad, enchant: enchant as Enchant }, polozka.druh));

    const varianta = polozka.varianty.find((v) => v.enchant === enchant && !v.sFactionTokenem);
    for (const vstup of varianta?.vstupy ?? []) {
      // Vstupy receptů jsou vždy suroviny (i u výbavy) nebo artefakty,
      // které se v datech chovají stejně.
      ids.add(aodpId({ zaklad: vstup.zaklad, enchant: vstup.enchant }, "surovina"));
    }
  }
  return [...ids];
}

/** Převede AODP ID zpět na základ a enchant. */
export function rozlozId(id: string): { zaklad: string; enchant: number } {
  return zAodpId(id);
}

const vahaVstupu = (v: Vstup) => vaha(v.zaklad);

/** Spočítá všechny kombinace nad tím, co je právě ve skladu cen. */
export function spocitatSken(
  nastaveni: NastaveniSkenu,
  sklad: SkladCen,
  lokace: Lokace | undefined,
  konstanty: Konstanty,
  nazevPolozky: (zaklad: string, enchant: number) => string,
): RadekSkenu[] {
  const radky: RadekSkenu[] = [];
  const typNakup = typProNakup(nastaveni.rezimNakupu);
  const typProdej = typProProdej(nastaveni.rezimProdeje);

  for (const { polozka, enchant } of kombinaceProSken(nastaveni.skupina, nastaveni.kategorie)) {
    const e = enchant as Enchant;
    const varianta = polozka.varianty.find((v) => v.enchant === e && !v.sFactionTokenem);

    const zaklad: Omit<RadekSkenu, "stav" | "vysledek" | "chybejici" | "stariHodin"> = {
      polozka, enchant: e, nazev: nazevPolozky(polozka.zaklad, e),
    };

    if (!varianta) continue;

    // Ceny vstupů
    const cenyVstupu = new Map<string, Cena>();
    const pouzite: (Cena | undefined)[] = [];
    const chybejici: string[] = [];

    for (const vstup of varianta.vstupy) {
      const cena = sklad.ziskej(nastaveni.mesto, vstup.zaklad, vstup.enchant, typNakup);
      pouzite.push(cena);
      if (cena && cena.hodnota > 0) {
        cenyVstupu.set(`${vstup.zaklad}#${vstup.enchant}`, cena);
      } else {
        chybejici.push(nazevPolozky(vstup.zaklad, vstup.enchant));
      }
    }

    // Cena výstupu
    const cenaVystupu = sklad.ziskej(nastaveni.mesto, polozka.zaklad, e, typProdej);
    pouzite.push(cenaVystupu);
    if (!cenaVystupu || !(cenaVystupu.hodnota > 0)) {
      chybejici.push(nazevPolozky(polozka.zaklad, e));
    }

    if (chybejici.length > 0 || !cenaVystupu) {
      radky.push({
        ...zaklad, stav: "chybi-cena", vysledek: null, chybejici,
        stariHodin: sklad.nejstarsiStari(pouzite),
      });
      continue;
    }

    const v = spocitat({
      polozka, enchant: e,
      pocetVyrobku: nastaveni.pocetVyrobku,
      bonusy: {
        mesto: nastaveni.mesto,
        focus: nastaveni.focus,
        denniBonus: nastaveni.denniBonus,
      },
      lokace,
      cenyVstupu,
      cenaVystupu,
      premium: nastaveni.premium,
      sazbaStanice: nastaveni.sazbaStanice,
      rezimNakupu: nastaveni.rezimNakupu,
      rezimProdeje: nastaveni.rezimProdeje,
    }, konstanty, vahaVstupu);

    if (!v.ok) {
      radky.push({
        ...zaklad, stav: "chybi-cena", vysledek: null,
        chybejici: v.chyba.druh === "chybi-cena" ? [v.chyba.zaklad] : ["neznámá varianta"],
        stariHodin: sklad.nejstarsiStari(pouzite),
      });
      continue;
    }

    radky.push({
      ...zaklad,
      stav: v.hodnota.marze > PRAH_PODEZRELE_MARZE ? "podezrele" : "ok",
      vysledek: v.hodnota,
      chybejici: [],
      stariHodin: sklad.nejstarsiStari(pouzite),
    });
  }

  return radky;
}

/** Hodnota metriky pro řazení. Chybějící výsledek jde vždy dolů. */
export function hodnotaMetriky(radek: RadekSkenu, metrika: Metrika): number {
  const v = radek.vysledek;
  if (!v) return -Infinity;
  switch (metrika) {
    case "marze": return v.marze;
    case "ziskNaKg": return v.ziskNaKg ?? -Infinity;
    case "ziskNaFocus": return v.ziskNaFocus ?? -Infinity;
    case "ziskNaKus": return v.ziskNaKus;
    case "zisk": return v.zisk;
  }
}

export function seradit(radky: RadekSkenu[], metrika: Metrika): RadekSkenu[] {
  return [...radky].sort((a, b) => hodnotaMetriky(b, metrika) - hodnotaMetriky(a, metrika));
}

/** Souhrn nad tabulkou — kolik se povedlo spočítat. */
export function souhrn(radky: RadekSkenu[]) {
  return {
    celkem: radky.length,
    spocitano: radky.filter((r) => r.vysledek !== null).length,
    ziskove: radky.filter((r) => (r.vysledek?.zisk ?? 0) > 0).length,
    podezrele: radky.filter((r) => r.stav === "podezrele").length,
    chybiCena: radky.filter((r) => r.stav === "chybi-cena").length,
  };
}
