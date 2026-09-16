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
  /**
   * Podíl surovin ztracených cestou DO dílny, 0–1.
   *
   * Nenulové, když se nakupuje jinde, než se vyrábí — typicky refining:
   * rudu koupíš, kde je levná, a vezeš ji do města s bonusem na rudu.
   * Odhad uživatele, v datech to není.
   *
   * **Působí opačným směrem než `ztrataZasilek` a právě proto je to
   * druhé pole, ne totéž:**
   *
   *   | ztratí se cestou   | co se stane                | co se změní |
   *   |--------------------|----------------------------|-------------|
   *   | surovina do dílny  | musíš koupit víc           | NÁKLAD ↑    |
   *   | výrobek na trh     | neprodáš ho, ale vyrobils  | TRŽBA ↓     |
   *
   * Použít jedno místo druhého dá tiše špatná čísla, která vypadají
   * rozumně — nespadne to, jen to lže.
   */
  ztrataVstupu?: number;
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
  /**
   * Váha toho, co opravdu KOUPÍŠ a povezeš — včetně ztráty cestou.
   *
   * Liší se od `vahaVstupu`, protože ta počítá nominální spotřebu receptu.
   * Vrácené suroviny vznikají až u stanice, takže je z tržnice nevezeš:
   * na 1000 T5 ingotů recept žádá 3000 rudy, ale koupit a přivézt jich
   * musíš jen 1899. U refiningu, kde se ruda vozí přes půl mapy, je to
   * rozdíl mezi jednou a dvěma jízdami.
   *
   * `vahaVstupu` zůstává, jak byla — mění se jen to, že přibylo druhé,
   * poctivější číslo pro logistiku.
   */
  vahaNakupu: number;
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

/** Co zbyde z prodeje dávky po dani a poplatcích. */
export interface Trzba {
  trzbaHruba: number;
  dan: number;
  sazbaDane: number;
  setupFeeProdej: number;
  trzbaCista: number;
  /** Čistá tržba, kdyby cestou nic nezmizelo. */
  trzbaCistaBezRizika: number;
}

/**
 * Tržba z prodeje dávky — nezávislá na tom, jak kus vznikl.
 *
 * Vytažené ze `spocitat`, protože Dílna porovnává tři cesty (koupit,
 * vyrobit, enchantovat) se stejným prodejem. Tržba se musí dát spočítat
 * i tehdy, když chybí ceny surovin — jinak by položku, kterou jde jen
 * koupit, nebylo s čím porovnat.
 */
export function spocitatTrzbu(
  z: Pick<ZadaniVypoctu,
    "pocetVyrobku" | "cenaVystupu" | "premium" | "rezimProdeje"
    | "prodejNaBlackMarketu" | "ztrataZasilek">,
  konstanty: Konstanty,
): Trzba {
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

  return {
    trzbaHruba, dan, sazbaDane, setupFeeProdej, trzbaCista,
    trzbaCistaBezRizika: trzbaBezRizika - danBezRizika - setupBezRizika,
  };
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
  //
  // Ztráta cestou do dílny zdražuje NÁKUP: aby se do stanice dostalo,
  // co recept potřebuje, musíš koupit víc. Ořez na 0,99 proto, že při
  // 100 % by byl náklad nekonečný a výsledek by přestal být číslo —
  // ztratit úplně všechno není případ, který má smysl počítat.
  const ztrataVst = Math.min(Math.max(z.ztrataVstupu ?? 0, 0), 0.99);
  const faktorNakupu = 1 / (1 - ztrataVst);

  const vstupy: RadekVstupu[] = [];
  let nakladSuroviny = 0;
  let vahaVstupuCelkem = 0;
  let vahaNakupuCelkem = 0;

  for (const vstup of varianta.vstupy) {
    const cena = z.cenyVstupu.get(klic(vstup.zaklad, vstup.enchant));
    if (!cena || !(cena.hodnota > 0)) {
      return { ok: false, chyba: { druh: "chybi-cena", zaklad: vstup.zaklad, enchant: vstup.enchant } };
    }

    const { nominalne, efektivne: spotrebovane } = spotrebaVstupu(
      vstup, varianta, z.pocetVyrobku, bonus.returnRate,
    );
    // Co se cestou ztratí, musíš dokoupit. `efektivne` je proto „kolik
    // toho reálně kupuješ", ne „kolik toho stanice spotřebuje" — a přesně
    // tohle číslo patří do nákupního seznamu.
    const efektivne = spotrebovane * faktorNakupu;
    const naklad = efektivne * cena.hodnota;

    nakladSuroviny += naklad;
    // Váha se počítá z NOMINÁLNÍ spotřeby — na mount musíš naložit všechno,
    // co recept spotřebuje. To, že se ti část vrátí, ti cestou nepomůže.
    vahaVstupuCelkem += nominalne * vahaVstupu(vstup);
    // Váha nákupu naproti tomu odpovídá tomu, co opravdu koupíš a povezeš.
    vahaNakupuCelkem += efektivne * vahaVstupu(vstup);

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
  const {
    trzbaHruba, dan, sazbaDane, setupFeeProdej, trzbaCista, trzbaCistaBezRizika,
  } = spocitatTrzbu(z, konstanty);

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
      ziskBezRizika: trzbaCistaBezRizika - nakladyCelkem,
      marze: nakladyCelkem > 0 ? zisk / nakladyCelkem : 0,
      // Na KUS, který jsi vyrobil — ne na ten, co dorazil. Suroviny, focus
      // i poplatek jsi utratil za všechny, včetně ztracených.
      ziskNaKus: zisk / z.pocetVyrobku,
      focus,
      ziskNaFocus: focus > 0 ? zisk / focus : null,
      vahaVstupu: vahaVstupuCelkem,
      vahaNakupu: vahaNakupuCelkem,
      vahaVystupu: vahaVystupuCelkem,
      ziskNaKg: vahaVystupuCelkem > 0 ? zisk / vahaVystupuCelkem : null,
    },
  };
}
