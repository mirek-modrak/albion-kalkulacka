/**
 * Výpočet arbitráže — koupit v jednom městě, prodat v druhém.
 *
 * ZÁMĚRNĚ oddělené od `vypocet.ts`, protože se nic nevyrábí:
 *
 *   | u výroby                   | u převozu          |
 *   |----------------------------|--------------------|
 *   | return rate, bonus města   | NEPLATÍ            |
 *   | poplatek stanice           | NEPLATÍ            |
 *   | daň, setup fee             | platí stejně       |
 *
 * Kdyby to bylo v `spocitat()` jako „recept s jedním vstupem a nulovým
 * bonusem", byla by z toho funkce, která dělá dvě různé věci — a při
 * první změně by se jedna z nich tiše rozbila.
 */

import type { Cena, Konstanty } from "./typy.js";
import type { RezimNakupu, RezimProdeje } from "./vypocet.js";

export interface ZadaniPrevozu {
  /** Váha jednoho kusu v kg. */
  vahaKusu: number;
  pocet: number;
  cenaNakup: Cena;
  cenaProdej: Cena;
  premium: boolean;
  rezimNakupu: RezimNakupu;
  rezimProdeje: RezimProdeje;
  prodejNaBlackMarketu?: boolean;
  /**
   * Očekávaná ztráta zásilek, 0–1.
   *
   * Riziko cesty NENÍ v herních datech a nedá se spočítat — je to odhad
   * uživatele podle trasy. Bez něj by kalkulačka stavěla nejrizikovější
   * trasy nahoru, protože počítá jen ceny.
   */
  ztrataZasilek?: number;
}

export interface VysledekPrevozu {
  nakladNakup: number;
  setupFeeNakup: number;
  nakladyCelkem: number;

  trzbaHruba: number;
  dan: number;
  sazbaDane: number;
  setupFeeProdej: number;
  trzbaCista: number;

  /** Zisk bez započtení rizika — kolik by to vyneslo, kdyby vše dojelo. */
  ziskBezRizika: number;
  /** Zisk po odečtení očekávané ztráty. Tohle je číslo, podle kterého řadit. */
  zisk: number;
  marze: number;
  ziskNaKus: number;

  vahaCelkem: number;
  /** Rozhodující metrika u převozu — omezením je nosnost, ne kapitál. */
  ziskNaKg: number | null;
}

export function spocitatPrevoz(z: ZadaniPrevozu, konstanty: Konstanty): VysledekPrevozu {
  const ztrata = Math.min(Math.max(z.ztrataZasilek ?? 0, 0), 1);

  // ── Nákup ─────────────────────────────────────────────────
  const nakladNakup = z.cenaNakup.hodnota * z.pocet;
  // Buy order: setup fee se platí hned při založení, i když se nevyplní.
  const setupFeeNakup = z.rezimNakupu === "order" ? nakladNakup * konstanty.setupFee : 0;
  const nakladyCelkem = nakladNakup + setupFeeNakup;

  // ── Prodej ────────────────────────────────────────────────
  // Ztracená zásilka se neprodá, ale zaplacená je. Proto se ztráta
  // odečítá z TRŽBY, ne z nákladů — to je celý smysl toho rizika.
  const dorazi = z.pocet * (1 - ztrata);
  const trzbaHruba = z.cenaProdej.hodnota * dorazi;

  const sazbaDane = z.premium ? konstanty.danPremium : konstanty.danNormalni;
  const dan = dorazi > 0
    ? Math.max(trzbaHruba * sazbaDane, konstanty.minimalniDan * dorazi)
    : 0;

  const sazbaSetup = z.prodejNaBlackMarketu
    ? konstanty.blackMarketSetupFee
    : konstanty.setupFee;
  const setupFeeProdej = z.rezimProdeje === "order" ? trzbaHruba * sazbaSetup : 0;

  const trzbaCista = trzbaHruba - dan - setupFeeProdej;

  // ── Výsledek ──────────────────────────────────────────────
  const zisk = trzbaCista - nakladyCelkem;

  // Pro srovnání: kolik by to vyneslo, kdyby nic nezmizelo.
  const trzbaBezRizika = z.cenaProdej.hodnota * z.pocet;
  const danBezRizika = Math.max(trzbaBezRizika * sazbaDane, konstanty.minimalniDan * z.pocet);
  const setupBezRizika = z.rezimProdeje === "order" ? trzbaBezRizika * sazbaSetup : 0;
  const ziskBezRizika = trzbaBezRizika - danBezRizika - setupBezRizika - nakladyCelkem;

  const vahaCelkem = z.vahaKusu * z.pocet;

  return {
    nakladNakup, setupFeeNakup, nakladyCelkem,
    trzbaHruba, dan, sazbaDane, setupFeeProdej, trzbaCista,
    ziskBezRizika, zisk,
    marze: nakladyCelkem > 0 ? zisk / nakladyCelkem : 0,
    ziskNaKus: z.pocet > 0 ? zisk / z.pocet : 0,
    vahaCelkem,
    ziskNaKg: vahaCelkem > 0 ? zisk / vahaCelkem : null,
  };
}

/**
 * Kolik kusů se vejde na mount.
 *
 * Teleport je mimo rozsah projektu — jediným logistickým limitem je
 * nosnost, takže tohle je u převozu klíčové číslo.
 */
export function kusuNaMount(nosnostKg: number, vahaKusu: number): number {
  if (vahaKusu <= 0) return 0;
  return Math.floor(nosnostKg / vahaKusu);
}

/** Kolik vydělá jedna plně naložená cesta. */
export function ziskZaCestu(
  nosnostKg: number,
  vahaKusu: number,
  ziskNaKg: number | null,
): number | null {
  if (ziskNaKg === null) return null;
  const kusu = kusuNaMount(nosnostKg, vahaKusu);
  return kusu * vahaKusu * ziskNaKg;
}
