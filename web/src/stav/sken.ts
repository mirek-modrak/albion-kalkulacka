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
import { BLACK_MARKET, refinedKombinace, vybavaKombinace, vaha, type Kombinace } from "../data/hra";
import { SUROVINY_ID, kategorieSkupiny } from "../data/kategorie";
import type { SkladCen } from "./skladCen";
import { vyhodnotLikviditu, type Likvidita, type SkladHistorie } from "./skladHistorie";

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
  /** Kam se prodává výsledek. */
  mistoProdeje: MistoProdeje;
  /**
   * Podíl zásilek ztracených cestou, 0–1. Uplatní se jen u `bm-s-prevozem`,
   * a ani tam ne při výrobě v Caerleonu — odtud se nikam nejede.
   */
  ztrataZasilek: number;
}

/**
 * Kam se prodává výsledek.
 *
 * Tři stavy, ne dva booleany. „Vezu to na BM, ale neprodávám tam" je
 * nesmysl, který by se dvěma příznaky šel nastavit — takhle ne.
 */
export type MistoProdeje =
  /** Tržnice ve městě výroby. */
  | "mesto"
  /** Black Market bez cesty — jen při výrobě v Caerleonu, kde BM je. */
  | "bm"
  /** Black Market s převozem — vyrábí se kdekoli, výrobek se tam veze. */
  | "bm-s-prevozem";

/** Město, ve kterém Black Market fyzicky je. */
export const BLACK_MARKET_MESTO = "Caerleon";

/**
 * Obchoduje Black Market tuhle skupinu?
 *
 * Suroviny ne — ověřeno: T5 Planks i T5 Metal Bar mají na BM v týdenním
 * okně nulový objem, zatímco na běžných tržnicích statisíce kusů.
 * Bez téhle podmínky by refining sken dostal 115 prázdných řádků navíc.
 */
export function bmObchodujeSkupinu(skupina: string): boolean {
  return skupina !== SUROVINY_ID;
}

/**
 * Lze prodat na Black Market BEZ cesty?
 *
 * Jen z Caerleonu, kde BM fyzicky je. Jinde by to znamenalo mlčky
 * předpokládat teleport — a právě proto existuje `bm-s-prevozem`,
 * kde je cesta vidět jako riziko a počet jízd.
 */
export function lzeProdatNaBM(mesto: string, skupina: string): boolean {
  return mesto === BLACK_MARKET_MESTO && bmObchodujeSkupinu(skupina);
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
  /**
   * Skutečné obchody za posledních 30 dní.
   *
   * **Null znamená „historie se netáhla", NE „nic se neobchoduje".**
   * Ten rozdíl je zásadní: order book umí říct jen za kolik někdo nabízí,
   * ne jestli za to někdo koupí. Naměřeno, že T6 Main Sword má v Caerleonu
   * nabídku 89 999 a za 30 dní tam neproběhl jediný obchod.
   */
  likvidita: Likvidita | null;
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
 * Který sloupec se použije pro prodej **na daném místě**.
 *
 * Na Black Marketu volba „přes sell order" neexistuje. BM není tržnice,
 * kde na sebe čekají hráči — je to výkup: systém vypíše cenu a za tu to
 * od tebe koupí. `buy_max` je proto konečná cena, ne jedna z variant.
 *
 * Bez tohohle rozlišení brala aplikace na BM `sell_min`, tedy cizí čekající
 * nabídku. Naměřeno 2026-07-23 na T4 Adept's Enigmatic Staff: medián
 * skutečných obchodů 11 078, rozsah za 30 dní 9 808–11 164, ale sken
 * počítal s ~30 000 (+171 %). Ta položka pak sedí vysoko v tabulce na ceně,
 * kterou nikdo nezaplatí — přesně ta vada, kvůli které tahle vrstva vznikla.
 */
export function typProdejeProMisto(rezim: RezimCeny, naBlackMarketu: boolean): TypCeny {
  return naBlackMarketu ? "buy_max" : typProProdej(rezim);
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

/**
 * AODP ID jen SKENOVANÝCH položek, bez jejich vstupů.
 *
 * Pro historii stačí tohle. Likvidita odpovídá na otázku „koupí ode mě
 * někdo ten výrobek?", a to je vlastnost výstupu, ne surovin. U výbavy
 * je to polovina přenosu — historie je řádově megabajty, na rozdíl
 * od cen.
 *
 * Důsledek, se kterým je třeba počítat: likvidita NÁKUPNÍ strany se
 * nezobrazuje. Že se surovina špatně shání, aplikace neukáže.
 */
export function skenovanaIds(skupina: string, kategorie?: string[]): string[] {
  const ids = new Set<string>();
  for (const { polozka, enchant } of kombinaceProSken(skupina, kategorie)) {
    ids.add(aodpId({ zaklad: polozka.zaklad, enchant: enchant as Enchant }, polozka.druh));
  }
  return [...ids];
}

/** Převede AODP ID zpět na základ a enchant. */
export function rozlozId(id: string): { zaklad: string; enchant: number } {
  return zAodpId(id);
}

const vahaVstupu = (v: Vstup) => vaha(v.zaklad);

/**
 * Spočítá všechny kombinace nad tím, co je právě ve skladu cen.
 *
 * @param historie  sklad skutečných obchodů. Nepovinný — bez něj se sken
 *   počítá stejně jako dřív, jen řádky nemají likviditu. Když je předaný,
 *   ale ještě nikdy nic nenačetl (`konec === null`), likvidita zůstane
 *   null také: tvrdit „žádné obchody" o něčem, na co jsme se neptali,
 *   by bylo prostě nepravdivé.
 */
export function spocitatSken(
  nastaveni: NastaveniSkenu,
  sklad: SkladCen,
  lokace: Lokace | undefined,
  konstanty: Konstanty,
  nazevPolozky: (zaklad: string, enchant: number) => string,
  historie?: SkladHistorie,
): RadekSkenu[] {
  // Jedna kontrola pro celý sken, ne pro každý řádek zvlášť.
  const maHistorii = historie !== undefined && historie.konec !== null;

  // Kde se PRODÁVÁ. Liší se od `mesto` jen u Black Marketu — nakupuje se
  // a vyrábí pořád v `mesto`, protože na BM nejsou ani suroviny, ani stanice.
  // Vyjmenovat kladné hodnoty, ne `!== "mesto"`. Uložené nastavení ze starší
  // verze tohle pole nemá a `undefined !== "mesto"` by zapnulo Black Market
  // někomu, kdo o něj nepožádal.
  const sPrevozem = nastaveni.mistoProdeje === "bm-s-prevozem";
  const naBM = (sPrevozem || nastaveni.mistoProdeje === "bm")
    && bmObchodujeSkupinu(nastaveni.skupina)
    // Bez převozu se na BM dostaneš jen z Caerleonu.
    && (sPrevozem || nastaveni.mesto === BLACK_MARKET_MESTO);

  const mistoProdeje = naBM ? BLACK_MARKET : nastaveni.mesto;
  const typProdej = typProdejeProMisto(nastaveni.rezimProdeje, naBM);

  // Na Black Marketu se neklade order, prodává se rovnou do výkupu —
  // proto se neplatí setup fee. Daň z prodeje platí dál.
  const rezimProdeje = naBM ? "instant" : nastaveni.rezimProdeje;

  // Riziko jen když se opravdu jede. Z Caerleonu na BM se nejede nikam,
  // takže tam musí být nula — jinak by se Caerleon trestal za cestu,
  // kterou nepodniká, a celé srovnání by bylo posunuté.
  const ztrata = naBM && sPrevozem && nastaveni.mesto !== BLACK_MARKET_MESTO
    ? nastaveni.ztrataZasilek
    : 0;
  const radky: RadekSkenu[] = [];
  const typNakup = typProNakup(nastaveni.rezimNakupu);

  for (const { polozka, enchant } of kombinaceProSken(nastaveni.skupina, nastaveni.kategorie)) {
    const e = enchant as Enchant;
    const varianta = polozka.varianty.find((v) => v.enchant === e && !v.sFactionTokenem);

    const zaklad: Omit<
      RadekSkenu, "stav" | "vysledek" | "chybejici" | "stariHodin" | "likvidita"
    > = {
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

    // Cena výstupu — z místa PRODEJE, ne z města výroby.
    const cenaVystupu = sklad.ziskej(mistoProdeje, polozka.zaklad, e, typProdej);
    pouzite.push(cenaVystupu);
    if (!cenaVystupu || !(cenaVystupu.hodnota > 0)) {
      chybejici.push(nazevPolozky(polozka.zaklad, e));
    }

    // Likvidita se počítá i pro řádky bez ceny. Právě tam je nejcennější:
    // „cenu neznáme, ale za týden se toho prodalo 1 700 kusů" je užitečná
    // informace, kdežto prázdný řádek neříká nic.
    // Taky z místa prodeje — likvidita je otázka „koupí to ode mě někdo
    // TAM, kde to prodávám". U výbavy je to celý rozdíl mezi caerleonskou
    // tržnicí (nula obchodů) a Black Marketem (stovky kusů denně).
    const likvidita: Likvidita | null = maHistorii
      ? vyhodnotLikviditu(
          historie!.ziskej(mistoProdeje, polozka.zaklad, e),
          nastaveni.pocetVyrobku,
          cenaVystupu?.hodnota ?? null,
        )
      : null;

    if (chybejici.length > 0 || !cenaVystupu) {
      radky.push({
        ...zaklad, stav: "chybi-cena", vysledek: null, chybejici,
        stariHodin: sklad.nejstarsiStari(pouzite), likvidita,
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
      rezimProdeje,
      // Zůstává pravdivé, i když se při prodeji do výkupu setup fee neplatí
      // vůbec. Nižší sazba 1,5 % by se uplatnila jen u sell orderu na BM,
      // což podle herních pravidel není, jak Black Market funguje.
      prodejNaBlackMarketu: naBM,
      ztrataZasilek: ztrata,
    }, konstanty, vahaVstupu);

    if (!v.ok) {
      radky.push({
        ...zaklad, stav: "chybi-cena", vysledek: null,
        chybejici: v.chyba.druh === "chybi-cena" ? [v.chyba.zaklad] : ["neznámá varianta"],
        stariHodin: sklad.nejstarsiStari(pouzite), likvidita,
      });
      continue;
    }

    radky.push({
      ...zaklad,
      stav: v.hodnota.marze > PRAH_PODEZRELE_MARZE ? "podezrele" : "ok",
      vysledek: v.hodnota,
      chybejici: [],
      stariHodin: sklad.nejstarsiStari(pouzite),
      likvidita,
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
