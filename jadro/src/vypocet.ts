/**
 * Výpočet zisku z jednoho receptu.
 *
 * Vrací kompletní rozpad, ne jen výsledné číslo — bez rozpadu nejde poznat,
 * kde se bere nesmysl, a kalkulačka se pak musí věřit naslepo.
 */

import { spocitatBonus } from "./bonusy.js";
import { focusCelkem, poplatekStanice, spotrebaVstupu, vybratVariantu, jeRefining } from "./recept.js";
import type {
  Cena, Enchant, HerniPolozka, Konstanty, Lokace, NastaveniBonusu, RozpadBonusu, Vstup,
} from "./typy.js";

/** Jak se obchoduje — určuje, které ceny a poplatky se použijí. */
export type RezimNakupu = "instant" | "order";
export type RezimProdeje = "instant" | "order";

export interface ZadaniVypoctu {
  polozka: HerniPolozka;
  enchant: Enchant;
  pocetVyrobku: number;
  bonusy: NastaveniBonusu;
  lokace: Lokace | undefined;
  /** Cena každého vstupu, klíčováno stejně jako `Vstup` (zaklad#enchant). */
  cenyVstupu: Map<string, Cena>;
  cenaVystupu: Cena;
  premium: boolean;
  sazbaStanice: number;
  rezimNakupu: RezimNakupu;
  rezimProdeje: RezimProdeje;
  povolitFactionToken?: boolean;
  /** Black Market má nižší setup fee (1,5 % místo 2,5 %). */
  prodejNaBlackMarketu?: boolean;
  /**
   * Podíl zásilek ztracených cestou na místo prodeje, 0–1.
   *
   * Nenulové jen tehdy, když se výrobek někam veze — typicky výroba
   * v královském městě a prodej na Black Marketu, který leží v černé
   * zóně. Odhad uživatele, v datech to není.
   *
   * Ztráta se odečítá z TRŽBY, ne z nákladů: co se ztratí, to se
   * neprodá, ale vyrobit se to muselo. Stejný model jako `spocitatPrevoz`.
   */
  ztrataZasilek?: number;
}

export interface RadekVstupu {
  zaklad: string;
  enchant: Enchant;
  vratna: boolean;
  nominalne: number;
  efektivne: number;
  cenaZaKus: number;
  naklad: number;
}

export interface VysledekVypoctu {
  bonus: RozpadBonusu;
  vstupy: RadekVstupu[];

  nakladSuroviny: number;
  setupFeeNakup: number;
  poplatekStaniceKus: number;
  poplatekStaniceCelkem: number;
  /** Pevný poplatek za dávku — nenulový jen u transmutace. */
  silverCelkem: number;
  nakladyCelkem: number;

  trzbaHruba: number;
  dan: number;
  sazbaDane: number;
  setupFeeProdej: number;
  trzbaCista: number;

  zisk: number;
  /**
   * Kolik by to vyneslo, kdyby cestou nic nezmizelo.
   *
   * Bez tohohle čísla nejde poznat, jestli je rozdíl mezi městy dílem
   * výroby, nebo jen zvoleného rizika. Při nulové ztrátě se rovná `zisk`.
   */
  ziskBezRizika: number;
  /**
   * Zisk děleno náklady = návratnost vloženého kapitálu.
   * Výchozí metrika řazení ve skenu: říká, kolik vydělám na každý
   * investovaný silver, nezávisle na tom, jak drahá položka to je.
   */
  marze: number;
  ziskNaKus: number;

  focus: number;
  ziskNaFocus: number | null;

  vahaVstupu: number;
  vahaVystupu: number;
  /** Zisk na kilogram výstupu. Rozhodující, když je limitem nosnost mountu. */
  ziskNaKg: number | null;
}

/** Chyby, které musí volající rozlišit — ne spadnout na výjimce. */
export type ChybaVypoctu =
  | { druh: "chybi-varianta"; enchant: Enchant }
  | { druh: "chybi-cena"; zaklad: string; enchant: Enchant };

export type Vysledek =
  | { ok: true; hodnota: VysledekVypoctu }
  | { ok: false; chyba: ChybaVypoctu };

function klic(zaklad: string, enchant: number): string {
  return `${zaklad}#${enchant}`;
}

export function spocitat(
  z: ZadaniVypoctu,
  konstanty: Konstanty,
  vahaVstupu: (vstup: Vstup) => number,
): Vysledek {
  const varianta = vybratVariantu(z.polozka, z.enchant, z.povolitFactionToken);
  if (!varianta) return { ok: false, chyba: { druh: "chybi-varianta", enchant: z.enchant } };

  const bonus = spocitatBonus(
    z.bonusy, z.lokace, jeRefining(z.polozka), z.polozka.kategorie, konstanty.bonusFocus,
  );

  // ── Vstupy ────────────────────────────────────────────────
  const vstupy: RadekVstupu[] = [];
  let nakladSuroviny = 0;
  let vahaVstupuCelkem = 0;

  for (const vstup of varianta.vstupy) {
    const cena = z.cenyVstupu.get(klic(vstup.zaklad, vstup.enchant));
    if (!cena || !(cena.hodnota > 0)) {
      return { ok: false, chyba: { druh: "chybi-cena", zaklad: vstup.zaklad, enchant: vstup.enchant } };
    }

    const { nominalne, efektivne } = spotrebaVstupu(
      vstup, varianta, z.pocetVyrobku, bonus.returnRate,
    );
    const naklad = efektivne * cena.hodnota;

    nakladSuroviny += naklad;
    // Váha se počítá z NOMINÁLNÍ spotřeby — na mount musíš naložit všechno,
    // co recept spotřebuje. To, že se ti část vrátí, ti cestou nepomůže.
    vahaVstupuCelkem += nominalne * vahaVstupu(vstup);

    vstupy.push({
      zaklad: vstup.zaklad, enchant: vstup.enchant, vratna: vstup.vratna,
      nominalne, efektivne, cenaZaKus: cena.hodnota, naklad,
    });
  }

  // Buy order: setup fee se platí hned při založení, i když se nevyplní.
  const setupFeeNakup = z.rezimNakupu === "order" ? nakladSuroviny * konstanty.setupFee : 0;

  const poplatekStaniceKus = poplatekStanice(
    z.polozka, z.enchant, z.sazbaStanice, konstanty.nutritionKoeficient,
  );
  const poplatekStaniceCelkem = poplatekStaniceKus * z.pocetVyrobku;

  // Pevný poplatek za dávku — nenulový u transmutace (surovina na vyšší
  // tier). U refiningu a craftingu je nula.
  const silverCelkem = (varianta.silver / varianta.pocetVyrobenych) * z.pocetVyrobku;

  const nakladyCelkem = nakladSuroviny + setupFeeNakup + poplatekStaniceCelkem + silverCelkem;

  // ── Výnos ─────────────────────────────────────────────────
  // Ztracená zásilka se neprodá, ale vyrobit se musela — proto se ztráta
  // odečítá z TRŽBY, ne z nákladů. Stejný model jako `spocitatPrevoz`.
  const ztrata = Math.min(Math.max(z.ztrataZasilek ?? 0, 0), 1);
  const dorazi = z.pocetVyrobku * (1 - ztrata);

  const trzbaHruba = z.cenaVystupu.hodnota * dorazi;

  const sazbaDane = z.premium ? konstanty.danPremium : konstanty.danNormalni;
  // Daň nikdy neklesne pod minimum za kus — u levných položek to není zanedbatelné.
  // Počítá se z toho, co DORAZÍ: co se ztratí, to se neprodá a nezdaní.
  const dan = dorazi > 0
    ? Math.max(trzbaHruba * sazbaDane, konstanty.minimalniDan * dorazi)
    : 0;

  const sazbaSetupProdej = z.prodejNaBlackMarketu
    ? konstanty.blackMarketSetupFee
    : konstanty.setupFee;
  const setupFeeProdej = z.rezimProdeje === "order" ? trzbaHruba * sazbaSetupProdej : 0;

  const trzbaCista = trzbaHruba - dan - setupFeeProdej;

  // Srovnávací hodnota bez rizika — ať je vidět, co je zásluha města
  // a co jen zvolený odhad ztrát.
  const trzbaBezRizika = z.cenaVystupu.hodnota * z.pocetVyrobku;
  const danBezRizika = Math.max(
    trzbaBezRizika * sazbaDane, konstanty.minimalniDan * z.pocetVyrobku,
  );
  const setupBezRizika = z.rezimProdeje === "order"
    ? trzbaBezRizika * sazbaSetupProdej : 0;

  // ── Výsledek ──────────────────────────────────────────────
  const zisk = trzbaCista - nakladyCelkem;
  const focus = focusCelkem(varianta, z.pocetVyrobku);
  const vahaVystupuCelkem = z.pocetVyrobku * z.polozka.vaha;

  return {
    ok: true,
    hodnota: {
      bonus, vstupy,
      nakladSuroviny, setupFeeNakup, poplatekStaniceKus, poplatekStaniceCelkem, silverCelkem, nakladyCelkem,
      trzbaHruba, dan, sazbaDane, setupFeeProdej, trzbaCista,
      zisk,
      ziskBezRizika: trzbaBezRizika - danBezRizika - setupBezRizika - nakladyCelkem,
      marze: nakladyCelkem > 0 ? zisk / nakladyCelkem : 0,
      // Na KUS, který jsi vyrobil — ne na ten, co dorazil. Suroviny, focus
      // i poplatek jsi utratil za všechny, včetně ztracených.
      ziskNaKus: zisk / z.pocetVyrobku,
      focus,
      ziskNaFocus: focus > 0 ? zisk / focus : null,
      vahaVstupu: vahaVstupuCelkem,
      vahaVystupu: vahaVystupuCelkem,
      ziskNaKg: vahaVystupuCelkem > 0 ? zisk / vahaVystupuCelkem : null,
    },
  };
}
