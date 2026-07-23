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
import type { SkladHistorie } from "./skladHistorie";
import {
  BLACK_MARKET_MESTO, bmObchodujeSkupinu, hodnotaMetriky, lzeProdatNaBM, spocitatSken,
  type Metrika, type MistoProdeje, type NastaveniSkenu, type RadekSkenu,
} from "./sken";

export interface VysledekVMeste {
  /** Město VÝROBY. U Black Marketu je to Caerleon — vyrábí se pořád ve městě. */
  mesto: string;
  /** Prodej jde na Black Market místo na tržnici. */
  naBlackMarketu: boolean;
  /** Co ukázat uživateli — „Martlock" nebo „Caerleon → BM". */
  nazevMista: string;
  radek: RadekSkenu;
}

/**
 * Místa, mezi kterými se srovnává.
 *
 * Dva různé režimy, ne jeden se zapnutým příznakem:
 *
 * - **`mesto` / `bm`** — sedm měst (nákup, výroba i prodej na místě),
 *   u výbavy plus Caerleon s prodejem na Black Market. Nikde se necestuje.
 * - **`bm-s-prevozem`** — sedm měst, ale prodává se VŽDY na Black Market.
 *   Každé město je pak „vyrob tady a odvez do Caerleonu", jen Caerleon
 *   sám nikam nejede.
 *
 * Black Market je MÍSTO, ne osmé město — vyrábí se pořád ve městě
 * a s jeho bonusy, mění se jen kam jde výsledek.
 */
export function mistaProSrovnani(
  skupina: string,
  mistoProdeje: MistoProdeje,
): { mesto: string; naBlackMarketu: boolean }[] {
  if (mistoProdeje === "bm-s-prevozem" && bmObchodujeSkupinu(skupina)) {
    return MESTA.map((m) => ({ mesto: m.nazev, naBlackMarketu: true }));
  }

  const mista = MESTA.map((m) => ({ mesto: m.nazev, naBlackMarketu: false }));
  if (lzeProdatNaBM(BLACK_MARKET_MESTO, skupina)) {
    mista.push({ mesto: BLACK_MARKET_MESTO, naBlackMarketu: true });
  }
  return mista;
}

const nazevMista = (mesto: string, naBM: boolean) => (naBM ? `${mesto} → BM` : mesto);

export interface Prilezitost {
  klic: string;
  nazev: string;
  nejlepsi: VysledekVMeste;
  /** Druhé nejlepší město — bez něj nejde poznat, jestli je náskok velký. */
  druhe: VysledekVMeste | null;
  /** V kolika místech se to podařilo spočítat. Málo míst = slabší výsledek. */
  spocitanoMest: number;
  /** Kolik míst se vůbec srovnávalo. Není konstanta — u výbavy přibývá BM. */
  pocetMist: number;
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
  historie?: SkladHistorie,
): Prilezitost[] {
  const podlePolozky = new Map<string, VysledekVMeste[]>();

  for (const misto of mistaProSrovnani(nastaveni.skupina, nastaveni.mistoProdeje)) {
    // Bonusy se liší podle města I podle položky — Thetford dává +0,40
    // na rudu, ale nic na dřevo. Proto se předává lokace toho města.
    // U Black Marketu je to pořád lokace Caerleonu: vyrábí se ve městě.
    //
    // Likvidita se počítá pro KAŽDÉ místo zvlášť, ne jen pro vítěze —
    // jinak by nešlo poznat, že vítězné místo vyhrálo na mrtvém trhu.
    // Místo prodeje se dopočítá z toho, co srovnání vybralo — jinak by
    // se v režimu bez převozu prodávalo na BM i z měst, odkud to nejde.
    const mistoProdeje: MistoProdeje = misto.naBlackMarketu
      ? (nastaveni.mistoProdeje === "bm-s-prevozem" ? "bm-s-prevozem" : "bm")
      : "mesto";

    const radky = spocitatSken(
      { ...nastaveni, mesto: misto.mesto, mistoProdeje },
      sklad, lokace(misto.mesto), konstanty, nazevPolozky, historie,
    );

    for (const radek of radky) {
      const klic = `${radek.polozka.zaklad}#${radek.enchant}`;
      const seznam = podlePolozky.get(klic) ?? [];
      seznam.push({
        mesto: misto.mesto,
        naBlackMarketu: misto.naBlackMarketu,
        nazevMista: nazevMista(misto.mesto, misto.naBlackMarketu),
        radek,
      });
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
      pocetMist: vsechna.length,
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
    // Podle MÍSTA, ne města — „Caerleon → BM" je jiná odpověď než „Caerleon".
    pocty.set(p.nejlepsi.nazevMista, (pocty.get(p.nejlepsi.nazevMista) ?? 0) + 1);
  }
  const podleMest = [...pocty.entries()]
    .map(([mesto, pocet]) => ({ mesto, pocet }))
    .sort((a, b) => b.pocet - a.pocet);

  return {
    celkem: prilezitosti.length,
    ziskove: ziskove.length,
    bezDat: prilezitosti.filter((p) => p.spocitanoMest === 0).length,
    // Kolik položek má data ze všech míst — jen u nich je srovnání úplné.
    // Porovnává se s `pocetMist` položky, ne s MESTA.length: u výbavy
    // je míst osm, u surovin sedm.
    uplneSrovnani: prilezitosti.filter((p) => p.spocitanoMest === p.pocetMist).length,
    podleMest,
  };
}
