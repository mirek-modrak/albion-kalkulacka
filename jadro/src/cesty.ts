/**
 * Koupit, vyrobit, nebo enchantovat? — tři cesty ke stejnému výrobku.
 *
 * Na rozdíl od `retezec.ts` (detail položky, rekurze přes celý řetěz
 * surovin) tohle počítá **přesně podle Mirkova postupu** a **stejným modelem
 * poplatků jako `spocitat`**, aby se cesty daly férově porovnat v tabulce:
 *
 *   | cesta        | náklad na kus                                         | focus       |
 *   |--------------|-------------------------------------------------------|-------------|
 *   | koupit       | cena hotového .e × f                                  | 0           |
 *   | vyrobit      | spocitat(.e).nakladyCelkem / dávka                    | recept .e   |
 *   | enchantovat  | spocitat(.0).nakladyCelkem / dávka + Σ runy × cena × f | recept .0   |
 *
 * `f = 1 + setupFee`, když se nakupuje přes buy order — stejně jako u surovin
 * ve `spocitat`. Bez toho by nákup a runy vycházely uměle levněji než výroba.
 *
 * **Enchant vede vždy od VYROBENÉHO .0 kusu** (Mirek, 2026-09-15): .0 → runy
 * → .1 → duše → .2 → relikvie → .3. Nikdy „kup .0", „vyrob .1 a dej na .2"
 * ani „kup .1". Proto tu není žádné hledání minima na mezistupních.
 *
 * Samotné přisypání run nemá return rate, poplatek stanice ani focus
 * (ověřeno Mirkem 2026-09-06). Return rate, poplatek a focus se uplatní
 * jen na výrobu .0 — a tím zapnutý focus zlevní i cestu enchantem.
 */

import { vybratVariantu } from "./recept.js";
import type { Cena, Enchant, HerniPolozka, Konstanty, Vstup } from "./typy.js";
import { spocitat, spocitatTrzbu, type Trzba, type ZadaniVypoctu } from "./vypocet.js";

export type Cesta = "koupit" | "vyrobit" | "enchantovat";

/** Pořadí cest. Při SHODĚ nákladů vyhraje dřívější — za stejné peníze je nákup nejmíň práce. */
export const PORADI_CEST: readonly Cesta[] = ["koupit", "vyrobit", "enchantovat"];

export interface ChybejiciCena {
  zaklad: string;
  enchant: Enchant;
}

export type StavCesty =
  | {
    ok: true;
    /** Náklady na celou dávku. */
    nakladyCelkem: number;
    nakladNaKus: number;
    /** Focus na celou dávku. */
    focus: number;
  }
  | {
    ok: false;
    /**
     * `neexistuje` — cesta pro tuhle položku není (enchant .0, chybí
     * vylepšení v datech, chybí recept). `chybi-cena` — cesta je, ale
     * není za co ji spočítat. UI to musí rozlišit: „—" vs. „doplň cenu".
     */
    duvod: "neexistuje" | "chybi-cena";
    chybejici: ChybejiciCena[];
  };

/** Metriky vítězné cesty. Stejné názvy jako ve `VysledekVypoctu`. */
export interface MetrikyCesty {
  nakladyCelkem: number;
  zisk: number;
  ziskBezRizika: number;
  marze: number;
  ziskNaKus: number;
  focus: number;
  ziskNaFocus: number | null;
  ziskNaKg: number | null;
}

export interface VysledekCest {
  koupit: StavCesty;
  vyrobit: StavCesty;
  enchantovat: StavCesty;
  /** Nejlevnější spočítaná cesta. Null, když nejde spočítat žádná. */
  vitez: Cesta | null;
  /** Null, když chybí prodejní cena. */
  trzba: Trzba | null;
  /** Null, když chybí vítěz nebo tržba. */
  metriky: MetrikyCesty | null;
}

export interface ZadaniCest extends Omit<ZadaniVypoctu,
  "cenyVstupu" | "cenaVystupu" | "ztrataVstupu" | "povolitFactionToken"> {
  /**
   * Nákupní cena ve městě výroby — pro suroviny, runy i hotový kus.
   * Undefined / nekladná = cena chybí.
   */
  cenaNakupu: (zaklad: string, enchant: Enchant) => Cena | undefined;
  /** Prodejní cena výrobku. Chybí = cesty se porovnají, zisk ne. */
  cenaVystupu: Cena | undefined;
}

const maCenu = (c: Cena | undefined): c is Cena => c !== undefined && c.hodnota > 0;

/** Placeholder pro `spocitat` — z výroby se čtou jen náklady, tržba zvlášť. */
const BEZ_CENY: Cena = { hodnota: 0, zdroj: "rucne", cas: null, mesto: "", typ: "sell_min" };

export function spocitatCesty(
  z: ZadaniCest,
  konstanty: Konstanty,
  vahaVstupu: (vstup: Vstup) => number,
): VysledekCest {
  const f = z.rezimNakupu === "order" ? 1 + konstanty.setupFee : 1;
  const davka = Math.max(1, z.pocetVyrobku);

  const koupit = cestaKoupit(z, f, davka);
  const vyrobit = cestaVyroba(z, z.enchant, konstanty, vahaVstupu);
  const enchantovat = cestaEnchant(z, f, davka, konstanty, vahaVstupu);

  const cesty = { koupit, vyrobit, enchantovat };
  let vitez: Cesta | null = null;
  for (const c of PORADI_CEST) {
    const s = cesty[c];
    if (!s.ok) continue;
    const nej = vitez ? cesty[vitez] : null;
    if (!nej || !nej.ok || s.nakladyCelkem < nej.nakladyCelkem) vitez = c;
  }

  const trzba = maCenu(z.cenaVystupu)
    ? spocitatTrzbu({ ...z, cenaVystupu: z.cenaVystupu }, konstanty)
    : null;

  let metriky: MetrikyCesty | null = null;
  const v = vitez ? cesty[vitez] : null;
  if (trzba && v?.ok) {
    const zisk = trzba.trzbaCista - v.nakladyCelkem;
    const vahaVystupu = z.pocetVyrobku * z.polozka.vaha;
    metriky = {
      nakladyCelkem: v.nakladyCelkem,
      zisk,
      ziskBezRizika: trzba.trzbaCistaBezRizika - v.nakladyCelkem,
      marze: v.nakladyCelkem > 0 ? zisk / v.nakladyCelkem : 0,
      ziskNaKus: zisk / davka,
      focus: v.focus,
      // Nákup focus nestojí → „—", ne nekonečno.
      ziskNaFocus: v.focus > 0 ? zisk / v.focus : null,
      ziskNaKg: vahaVystupu > 0 ? zisk / vahaVystupu : null,
    };
  }

  return { ...cesty, vitez, trzba, metriky };
}

function cestaKoupit(z: ZadaniCest, f: number, davka: number): StavCesty {
  const c = z.cenaNakupu(z.polozka.zaklad, z.enchant);
  if (!maCenu(c)) {
    return { ok: false, duvod: "chybi-cena", chybejici: [{ zaklad: z.polozka.zaklad, enchant: z.enchant }] };
  }
  const nakladNaKus = c.hodnota * f;
  return { ok: true, nakladNaKus, nakladyCelkem: nakladNaKus * davka, focus: 0 };
}

/** Výroba ze surovin přesně jako v tabulce (`spocitat`), jen bez prodeje. */
function cestaVyroba(
  z: ZadaniCest, enchant: Enchant, konstanty: Konstanty, vahaVstupu: (v: Vstup) => number,
): StavCesty {
  const varianta = vybratVariantu(z.polozka, enchant);
  // Recept bez vstupů (tokeny, odměny) není výroba — viz `retezec.ts`.
  if (!varianta || varianta.vstupy.length === 0) {
    return { ok: false, duvod: "neexistuje", chybejici: [] };
  }

  // Posbírat VŠECHNY chybějící ceny, ne jen první — ať uživatel ví, co doplnit.
  const cenyVstupu = new Map<string, Cena>();
  const chybejici: ChybejiciCena[] = [];
  for (const vstup of varianta.vstupy) {
    const c = z.cenaNakupu(vstup.zaklad, vstup.enchant);
    if (maCenu(c)) cenyVstupu.set(`${vstup.zaklad}#${vstup.enchant}`, c);
    else chybejici.push({ zaklad: vstup.zaklad, enchant: vstup.enchant });
  }
  if (chybejici.length > 0) return { ok: false, duvod: "chybi-cena", chybejici };

  const v = spocitat(
    { ...z, enchant, cenyVstupu, cenaVystupu: BEZ_CENY, ztrataVstupu: 0 },
    konstanty, vahaVstupu,
  );
  if (!v.ok) return { ok: false, duvod: "neexistuje", chybejici: [] };

  return {
    ok: true,
    nakladyCelkem: v.hodnota.nakladyCelkem,
    nakladNaKus: v.hodnota.nakladyCelkem / Math.max(1, z.pocetVyrobku),
    focus: v.hodnota.focus,
  };
}

function cestaEnchant(
  z: ZadaniCest, f: number, davka: number,
  konstanty: Konstanty, vahaVstupu: (v: Vstup) => number,
): StavCesty {
  const nic: StavCesty = { ok: false, duvod: "neexistuje", chybejici: [] };
  if (z.enchant === 0) return nic;

  // Každý stupeň 1..e musí mít vylepšení. Data ho mají jen na .1–.3,
  // takže .4 cestu nemá — nesmí se dovodit z „enchant − 1".
  const kroky = [];
  for (let k = 1; k <= z.enchant; k++) {
    const krok = z.polozka.vylepseni.find((x) => x.naEnchant === k);
    if (!krok || krok.vstupy.length === 0) return nic;
    kroky.push(krok);
  }

  const zaklad = cestaVyroba(z, 0, konstanty, vahaVstupu);
  if (!zaklad.ok && zaklad.duvod === "neexistuje") return nic;

  const chybejici: ChybejiciCena[] = zaklad.ok ? [] : [...zaklad.chybejici];
  let runyNaKus = 0;
  for (const krok of kroky) {
    for (const vstup of krok.vstupy) {
      const c = z.cenaNakupu(vstup.zaklad, vstup.enchant);
      if (!maCenu(c)) chybejici.push({ zaklad: vstup.zaklad, enchant: vstup.enchant });
      // Runy se nevracejí a spotřebují se celé — žádný return rate.
      else runyNaKus += vstup.pocet * c.hodnota * f;
    }
  }
  if (chybejici.length > 0 || !zaklad.ok) return { ok: false, duvod: "chybi-cena", chybejici };

  const nakladyCelkem = zaklad.nakladyCelkem + runyNaKus * davka;
  return {
    ok: true,
    nakladyCelkem,
    nakladNaKus: nakladyCelkem / davka,
    // Focus jen za výrobu .0 — enchant ho nestojí.
    focus: zaklad.focus,
  };
}
