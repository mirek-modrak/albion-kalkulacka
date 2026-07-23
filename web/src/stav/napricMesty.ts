/**
 * Srovnání příležitostí napříč všemi městy.
 *
 * Obaluje `spocitatSken` — NEDUPLIKUJE jeho logiku. Kdyby si tenhle modul
 * počítal sám, mohl by ukazovat jiná čísla než sken jednoho města,
 * a nikdo by nepoznal, které je správné.
 *
 * Model: **nákup, výroba i prodej ve stejném městě.**
 * Rozpad přes víc měst by dal vyšší čísla, ale znamenal by cesty pěšky
 * s omezenou nosností mountu — to patří k převozu (S5/S6), ne sem.
 */

import type { Konstanty } from "@albion/jadro";
import { MESTA, lokace } from "../data/hra";
import type { SkladCen } from "./skladCen";
import {
  hodnotaMetriky, spocitatSken,
  type Metrika, type NastaveniSkenu, type RadekSkenu,
} from "./sken";

export interface VysledekVMeste {
  mesto: string;
  radek: RadekSkenu;
}

export interface Prilezitost {
  klic: string;
  nazev: string;
  nejlepsi: VysledekVMeste;
  /** Druhé nejlepší město — bez něj nejde poznat, jestli je náskok velký. */
  druhe: VysledekVMeste | null;
  /** V kolika městech se to podařilo spočítat. Málo měst = slabší výsledek. */
  spocitanoMest: number;
  vsechnaMesta: VysledekVMeste[];
}

/**
 * Spočítá všechny kombinace ve všech městech a seskupí je podle položky.
 *
 * Jeden řádek na položku, ne na dvojici (položka × město) — 115 kombinací
 * × 7 měst je 805 řádků a v takové tabulce se nedá nic najít.
 * Uživatel se neptá „která z 805 dvojic", ale „co mám dělat".
 */
export function spocitatNapricMesty(
  nastaveni: NastaveniSkenu,
  sklad: SkladCen,
  konstanty: Konstanty,
  nazevPolozky: (zaklad: string, enchant: number) => string,
  metrika: Metrika,
): Prilezitost[] {
  const podlePolozky = new Map<string, VysledekVMeste[]>();

  for (const mesto of MESTA) {
    // Bonusy se liší podle města I podle položky — Thetford dává +0,40
    // na rudu, ale nic na dřevo. Proto se předává lokace toho města.
    const radky = spocitatSken(
      { ...nastaveni, mesto: mesto.nazev },
      sklad, lokace(mesto.nazev), konstanty, nazevPolozky,
    );

    for (const radek of radky) {
      const klic = `${radek.polozka.zaklad}#${radek.enchant}`;
      const seznam = podlePolozky.get(klic) ?? [];
      seznam.push({ mesto: mesto.nazev, radek });
      podlePolozky.set(klic, seznam);
    }
  }

  const prilezitosti: Prilezitost[] = [];

  for (const [klic, vsechna] of podlePolozky) {
    // Seřadit města podle zvolené metriky, nespočítaná jdou dolů.
    const serazena = [...vsechna].sort(
      (a, b) => hodnotaMetriky(b.radek, metrika) - hodnotaMetriky(a.radek, metrika),
    );
    const nejlepsi = serazena[0];
    if (!nejlepsi) continue;

    prilezitosti.push({
      klic,
      nazev: nejlepsi.radek.nazev,
      nejlepsi,
      druhe: serazena[1] ?? null,
      spocitanoMest: vsechna.filter((v) => v.radek.vysledek !== null).length,
      vsechnaMesta: serazena,
    });
  }

  return prilezitosti.sort(
    (a, b) => hodnotaMetriky(b.nejlepsi.radek, metrika)
            - hodnotaMetriky(a.nejlepsi.radek, metrika),
  );
}

/**
 * O kolik je nejlepší město lepší než druhé.
 *
 * Bez tohohle čísla neví uživatel, jestli je volba města zásadní,
 * nebo jestli je to skoro jedno.
 *
 * @returns podíl (0,5 = o polovinu lepší), nebo null když chybí druhé město
 */
export function naskokNadDruhym(p: Prilezitost, metrika: Metrika): number | null {
  if (!p.druhe?.radek.vysledek || !p.nejlepsi.radek.vysledek) return null;

  const nej = hodnotaMetriky(p.nejlepsi.radek, metrika);
  const druhe = hodnotaMetriky(p.druhe.radek, metrika);
  if (!Number.isFinite(nej) || !Number.isFinite(druhe)) return null;

  // U záporných hodnot by podíl mátl (−100 vs −200), proto absolutní základ.
  const zaklad = Math.abs(druhe);
  if (zaklad < 1e-9) return null;
  return (nej - druhe) / zaklad;
}

/** Souhrn nad seznamem příležitostí. */
export function souhrnPrilezitosti(prilezitosti: Prilezitost[]) {
  const ziskove = prilezitosti.filter((p) => (p.nejlepsi.radek.vysledek?.zisk ?? 0) > 0);

  // Které město vyhrává nejčastěji — zajímavé samo o sobě.
  const pocty = new Map<string, number>();
  for (const p of ziskove) {
    pocty.set(p.nejlepsi.mesto, (pocty.get(p.nejlepsi.mesto) ?? 0) + 1);
  }
  const podleMest = [...pocty.entries()]
    .map(([mesto, pocet]) => ({ mesto, pocet }))
    .sort((a, b) => b.pocet - a.pocet);

  return {
    celkem: prilezitosti.length,
    ziskove: ziskove.length,
    bezDat: prilezitosti.filter((p) => p.spocitanoMest === 0).length,
    // Kolik položek má data ze všech měst — jen u nich je srovnání úplné.
    uplneSrovnani: prilezitosti.filter((p) => p.spocitanoMest === MESTA.length).length,
    podleMest,
  };
}
