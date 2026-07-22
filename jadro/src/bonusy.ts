/**
 * Return rate — jádro celého výpočtu.
 *
 * Ověřeno v gamedata.xml a craftingmodifiers.xml (ao-bin-dumps, 2026-07-22)
 * a reprodukcí všech komunitně publikovaných hodnot.
 */

import type { Lokace, NastaveniBonusu, RozpadBonusu } from "./typy.js";

/**
 * Převede součet bonusů na podíl vrácených surovin.
 *
 *     RRR = 1 − 1/(1 + bonus/100) = bonus/(100 + bonus)
 *
 * Bonusy se SČÍTAJÍ a teprve součet se převede. Nikdy se nenásobí.
 * Výsledek se asymptoticky blíží 100 %, ale nikdy jich nedosáhne.
 */
export function returnRate(bonusCelkem: number): number {
  if (bonusCelkem <= 0) return 0;
  return bonusCelkem / (100 + bonusCelkem);
}

/**
 * Kolikrát víc vyrobíš, než kolik surovin koupíš.
 *
 *     nasobek = 1/(1 − RRR)
 *
 * POZOR: NENÍ to 1 + RRR. Vrácené suroviny se při dalším použití vracejí
 * znovu, a znovu — je to nekonečná geometrická řada:
 *     1000 + 300 + 90 + 27 + … = 1000/0,7 = 1428,6   (ne 1300)
 *
 * Chyba tímhle směrem podhodnocuje zisk, a to tím víc, čím lepší je setup.
 */
export function nasobekVyroby(rrr: number): number {
  if (rrr >= 1) return Infinity;
  return 1 / (1 - rrr);
}

/** Podíl surovin, které se reálně spotřebují (a musíš je koupit). */
export function faktorSpotreby(rrr: number): number {
  return 1 - rrr;
}

/**
 * Spočítá return rate ze všech zdrojů bonusu a vrátí i rozpad,
 * aby bylo vidět, ODKUD se výsledek vzal.
 *
 * @param jeRefining  refining a crafting mají v datech jiný bonus města
 * @param kategorie   kategorie položky ("ore", "sword"…); null = bez modifikátoru
 */
export function spocitatBonus(
  nastaveni: NastaveniBonusu,
  lokace: Lokace | undefined,
  jeRefining: boolean,
  kategorie: string | null,
  bonusFocus: number,
): RozpadBonusu {
  // Ruční hodnota přebíjí všechno — hideout a ostrov mají jiný model bonusů,
  // který tenhle výpočet neumí a neměl by předstírat, že umí.
  if (nastaveni.rucniReturnRate != null) {
    const rrr = nastaveni.rucniReturnRate;
    return {
      bonusCelkem: NaN,
      returnRate: rrr,
      nasobek: nasobekVyroby(rrr),
      slozky: [{ popis: "zadáno ručně", hodnota: NaN }],
      rucni: true,
    };
  }

  const slozky: { popis: string; hodnota: number }[] = [];

  if (lokace) {
    const zaklad = jeRefining ? lokace.refiningBonus : lokace.craftingBonus;
    if (zaklad > 0) {
      slozky.push({ popis: `základ ${lokace.nazev}`, hodnota: zaklad * 100 });
    }
    // Modifikátor se uplatní jen když kategorie položky sedí na kategorii
    // v datech města. Thetford má bonus na "ore" — na kůži nedá nic.
    const modifikator = kategorie ? lokace.modifikatory[kategorie] : undefined;
    if (modifikator) {
      slozky.push({ popis: `bonus na ${kategorie}`, hodnota: modifikator * 100 });
    }
  }

  if (nastaveni.focus) slozky.push({ popis: "focus", hodnota: bonusFocus });
  if (nastaveni.denniBonus > 0) {
    slozky.push({ popis: "denní bonus", hodnota: nastaveni.denniBonus });
  }

  const bonusCelkem = slozky.reduce((soucet, s) => soucet + s.hodnota, 0);
  const rrr = returnRate(bonusCelkem);

  return { bonusCelkem, returnRate: rrr, nasobek: nasobekVyroby(rrr), slozky, rucni: false };
}

/**
 * Má město bonus na tuhle kategorii?
 * Slouží k varování „Thetford má bonus na rudu, ne na kůži".
 */
export function maBonusNaKategorii(lokace: Lokace | undefined, kategorie: string | null): boolean {
  if (!lokace || !kategorie) return false;
  return (lokace.modifikatory[kategorie] ?? 0) > 0;
}
