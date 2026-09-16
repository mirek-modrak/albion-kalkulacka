/**
 * Dílna — tvoje nastavitelné výrobní pracoviště.
 *
 * Na rozdíl od skenů (které objevují napříč vším) je dílna kurátorský
 * seznam: konkrétní itemy, u kterých si nastavíš KDE vyrábíš a KAM prodáváš,
 * a jen sleduješ, co je nejefektivnější. Nastavení je globální (platí pro
 * všechny itemy), ale u každého se dá přepsat.
 *
 * Výpočet i detail se PŘEBÍRAJÍ ze skenu (`spocitatSken`, `DetailPolozky`).
 * Tenhle modul řeší jen to nové: katalog k výběru, konfiguraci a její uložení.
 */

import {
  spocitatCesty,
  type Cena, type Enchant, type HerniPolozka, type Konstanty, type Lokace, type TypCeny,
  type VysledekCest,
} from "@albion/jadro";
import { BLACK_MARKET, HRA, MESTA, lokace, polozka, vaha } from "../data/hra";
import type { Kombinace } from "../data/hra";
import {
  obchodSkenu, sazbaSkenu, spocitatSken, typProdejeProMisto,
  type MistoProdeje, type NastaveniSkenu, type RadekSkenu, type RezimCeny,
} from "./sken";
import { SkladCen } from "./skladCen";
import type { SkladHistorie } from "./skladHistorie";

/** Fyzické umístění Black Marketu. */
export const DILNA_MESTO = "Caerleon";

/** Sentinel pro „vyrob tam, kde je to nejlevnější". */
export const AUTO_MESTO = "__auto__";

export interface PolozkaKatalogu {
  polozka: HerniPolozka;
  enchanty: number[];
}

/**
 * Vyrobitelná výbava, kterou Black Market obchoduje.
 *
 * Suroviny ne — ty se na BM nevykupují. Faction-token varianty taky ne.
 */
export function katalogDilny(): PolozkaKatalogu[] {
  const vysledek: PolozkaKatalogu[] = [];
  for (const p of HRA.polozky) {
    if (p.druh !== "vybava" || !p.kategorie) continue;
    const enchanty = [...new Set(
      p.varianty.filter((v) => !v.sFactionTokenem).map((v) => v.enchant),
    )].sort((a, b) => a - b);
    if (enchanty.length === 0) continue;
    vysledek.push({ polozka: p, enchanty });
  }
  return vysledek;
}

// ── Konfigurace výroby/prodeje ─────────────────────────────────

export interface KonfigDilny {
  /** Kde se vyrábí — název města, nebo `AUTO_MESTO`. */
  mesto: string;
  /** Prodávat na Black Market (true) místo na místní tržnici (false). */
  naBM: boolean;
  /** Ztráta zásilek 0–1 při převozu na BM z jiného města než Caerleon. */
  ztrata: number;
}

export const VYCHOZI_KONFIG: KonfigDilny = { mesto: DILNA_MESTO, naBM: true, ztrata: 0.05 };

/**
 * Odkud se berou ceny do výpočtu.
 *
 * `orderbook` — poslední cena z tržnice (aktuální, ale často zavádějící:
 * jeden zbloudilý order posune výsledek). `historie` — 30denní medián
 * skutečných obchodů (stabilnější, ale nerozlišuje nákup/prodej: počítá
 * jakoby obchoduješ za férovou tržní cenu).
 */
export type ZdrojCen = "orderbook" | "historie";

export interface StavDilny {
  /** Klíče položek (`zaklad#enchant`) v pořadí, jak je uživatel přidal. */
  klice: string[];
  /** Globální nastavení výroby/prodeje. */
  konfig: KonfigDilny;
  /** Přepis pro konkrétní položky. Chybí = použije se globální. */
  override: Record<string, KonfigDilny>;
  /** Zdroj cen pro celou dílnu. */
  zdrojCen: ZdrojCen;
}

export const PRAZDNY_STAV: StavDilny = {
  klice: [], konfig: VYCHOZI_KONFIG, override: {}, zdrojCen: "orderbook",
};

/** Efektivní konfigurace položky: její override, jinak globální. */
export function konfigProKlic(stav: StavDilny, klic: string): KonfigDilny {
  return stav.override[klic] ?? stav.konfig;
}

/**
 * Odvodí místo prodeje z konfigurace.
 *
 * BM z Caerleonu je bez cesty; z jiného města znamená převoz (a riziko).
 * Místní tržnice = žádný BM.
 */
export function mistoProdejeZKonfigu(mesto: string, naBM: boolean): MistoProdeje {
  if (!naBM) return "mesto";
  return mesto === DILNA_MESTO ? "bm" : "bm-s-prevozem";
}

/**
 * Odkud se čte (a kam se ručně zapisuje) prodejní cena výrobku.
 *
 * **Musí to být jedno jediné místo.** Kdyby si UI pravidlo opsalo, rozešlo
 * by se s výpočtem — uživatel by přepsal cenu a zisk by se nezměnil.
 * To je nejhorší druh chyby: vypadá to, že aplikace ignoruje vstup.
 *
 * Vychází z už spočítaného `mistoProdeje`, takže respektuje i volbu
 * „nejlevnější město" a to, že na Black Market se prodává do výkupu
 * (`buy_max`), ne přes sell order.
 */
export function kamSeProdava(
  v: VysledekDilny,
  rezimProdeje: RezimCeny,
): { mesto: string; typ: TypCeny } {
  const naBM = v.mistoProdeje !== "mesto";
  return {
    mesto: naBM ? BLACK_MARKET : v.mesto,
    typ: typProdejeProMisto(rezimProdeje, naBM),
  };
}

// ── Klíč položky ───────────────────────────────────────────────

export function klicDilny(zaklad: string, enchant: number): string {
  return `${zaklad}#${enchant}`;
}

export function kombinaceZKlicu(klice: string[]): Kombinace[] {
  const vysledek: Kombinace[] = [];
  for (const k of klice) {
    const [zaklad, e] = k.split("#");
    if (!zaklad) continue;
    const p = polozka(zaklad);
    if (!p || p.druh !== "vybava") continue;
    const enchant = Number(e ?? 0);
    if (!p.varianty.some((v) => v.enchant === enchant && !v.sFactionTokenem)) continue;
    vysledek.push({ polozka: p, enchant });
  }
  return vysledek;
}

// ── Vyhodnocení pracoviště ─────────────────────────────────────

export interface VysledekDilny {
  klic: string;
  /** Efektivní město výroby (u AUTO to nejvýhodnější). */
  mesto: string;
  mistoProdeje: MistoProdeje;
  /** Byla to volba „nejlevnější"? Ať to karta pozná. */
  auto: boolean;
  /**
   * Řádek skenu — rozpad VÝROBY ze surovin, likvidita, stáří.
   *
   * Pozor: `radek.vysledek.zisk` je zisk z výroby. Tabulka a filtr Dílny
   * čtou zisk z `cesty.metriky` (nejlevnější cesta) — viz `ziskDilny`.
   */
  radek: RadekSkenu | null;
  /** Koupit / vyrobit / enchantovat a jejich vítěz. Null u neznámé položky. */
  cesty: VysledekCest | null;
}

/**
 * Zisk položky v Dílně — z NEJLEVNĚJŠÍ cesty (Mirek, 2026-09-15).
 * Null = nejde spočítat (chybí prodejní cena nebo všechny cesty).
 */
export function ziskDilny(v: VysledekDilny): number | null {
  return v.cesty?.metriky?.zisk ?? null;
}

/**
 * Sklad cen postavený z 30denního mediánu obchodů.
 *
 * Pro každou položku i surovinu ve všech městech nastaví obě strany knihy
 * na `median30` — historický medián nerozlišuje nákup a prodej, počítá se
 * s férovou tržní cenou. Ruční ceny z reálného skladu se PŘEKRYJÍ navrch:
 * co sis zapsal z tržnice, pořád platí.
 *
 * Staví se z toho, co je právě ve `historie`; kde medián chybí, cena zůstane
 * prázdná a řádek skončí na „chybí cena" — stejně jako u order booku.
 */
function skladZHistorie(
  realny: SkladCen, historie: SkladHistorie, kombinace: Kombinace[],
): SkladCen {
  const s = new SkladCen();
  const mesta = [...MESTA.map((m) => m.nazev), BLACK_MARKET];
  const typy: TypCeny[] = ["sell_min", "buy_max"];

  const nastav = (mesto: string, zaklad: string, enchant: number) => {
    const cena = historie.ziskej(mesto, zaklad, enchant)?.median30;
    if (cena == null || !(cena > 0)) return;
    for (const typ of typy) {
      const c: Cena = { hodnota: cena, zdroj: "aodp", cas: null, mesto, typ };
      s.uloz(c, zaklad, enchant);
    }
  };

  for (const mesto of mesta) {
    for (const komb of kombinace) {
      nastav(mesto, komb.polozka.zaklad, komb.enchant);
      // Suroviny výroby i cesty enchantem (suroviny .0 a runy) — jinak by
      // v režimu mediánu byl enchant vždy „chybí cena".
      for (const vst of vstupyDilny(komb.polozka, komb.enchant)) {
        nastav(mesto, vst.zaklad, vst.enchant);
      }
    }
  }

  // Ruční ceny mají přednost i tady — je to vědomý zásah uživatele.
  for (const u of realny.export()) {
    if (u.zdroj !== "rucne") continue;
    const c: Cena = {
      hodnota: u.hodnota, zdroj: "rucne", cas: u.cas, mesto: u.mesto, typ: u.typ,
    };
    s.uloz(c, u.zaklad, u.enchant);
  }
  return s;
}

function spocitejVMeste(
  komb: Kombinace, mesto: string, mistoProdeje: MistoProdeje, ztrata: number,
  sklad: SkladCen, hist: SkladHistorie | undefined, konst: Konstanty,
  nastaveni: NastaveniSkenu, nazev: (z: string, e: number) => string,
  lok: Lokace | undefined,
): { radek: RadekSkenu | null; cesty: VysledekCest } {
  // skupina musí být výbava (ne suroviny), aby platil Black Market
  const n: NastaveniSkenu = {
    ...nastaveni, mesto, skupina: "zbrane", mistoProdeje, ztrataZasilek: ztrata,
  };
  const radky = spocitatSken(n, sklad, lok, konst, nazev, hist, [komb]);

  // Stejná pravidla nákupu a prodeje jako řádek skenu — jinak by zisk
  // v tabulce vznikl z jiné ceny, než kterou ukazuje buňka „Prodej".
  const o = obchodSkenu(n);
  const cesty = spocitatCesty({
    polozka: komb.polozka,
    enchant: komb.enchant as Enchant,
    pocetVyrobku: n.pocetVyrobku,
    bonusy: { mesto, focus: n.focus, denniBonus: n.denniBonus },
    lokace: lok,
    premium: n.premium,
    sazbaStanice: sazbaSkenu(n, komb.polozka),
    rezimNakupu: n.rezimNakupu,
    rezimProdeje: o.rezimProdeje,
    prodejNaBlackMarketu: o.naBM,
    ztrataZasilek: o.ztrata,
    cenaNakupu: (z, e) => sklad.ziskej(o.mestoNakupu, z, e, o.typNakup),
    cenaVystupu: sklad.ziskej(o.mistoProdeje, komb.polozka.zaklad, komb.enchant, o.typProdej),
  }, konst, (v) => vaha(v.zaklad));

  return { radek: radky[0] ?? null, cesty };
}

/**
 * Spočítá každou položku pod její efektivní konfigurací.
 *
 * U `AUTO_MESTO` projede všechna města a vybere to s nejvyšším ziskem —
 * to je ta odpověď „kde je to nejefektivnější". Města bez ceny se přeskočí;
 * když nemá cenu nikde, vrátí se poslední pokus, ať je vidět „chybí cena".
 */
export function vyhodnotitDilnu(
  stav: StavDilny,
  sklad: SkladCen,
  historie: SkladHistorie | undefined,
  konstanty: Konstanty,
  nastaveni: NastaveniSkenu,
  nazevPolozky: (zaklad: string, enchant: number) => string,
): VysledekDilny[] {
  const kombinace = kombinaceZKlicu(stav.klice);
  const podleKlice = new Map<string, Kombinace>();
  for (const k of kombinace) {
    podleKlice.set(klicDilny(k.polozka.zaklad, k.enchant), k);
  }

  // 30denní medián se počítá z historie; když ještě nic nedorazilo, zůstává
  // order book (jinak by dílna hlásila „chybí cena" u všeho, dokud se nestáhne).
  const efektivniSklad = stav.zdrojCen === "historie" && historie && historie.konec !== null
    ? skladZHistorie(sklad, historie, kombinace)
    : sklad;

  return stav.klice.map((klic) => {
    const komb = podleKlice.get(klic);
    if (!komb) {
      return {
        klic, mesto: DILNA_MESTO, mistoProdeje: "bm" as const, auto: false, radek: null, cesty: null,
      };
    }

    const konfig = konfigProKlic(stav, klic);
    const auto = konfig.mesto === AUTO_MESTO;

    if (!auto) {
      const misto = mistoProdejeZKonfigu(konfig.mesto, konfig.naBM);
      const { radek, cesty } = spocitejVMeste(
        komb, konfig.mesto, misto, konfig.ztrata,
        efektivniSklad, historie, konstanty, nastaveni, nazevPolozky, lokace(konfig.mesto),
      );
      return { klic, mesto: konfig.mesto, mistoProdeje: misto, auto: false, radek, cesty };
    }

    // AUTO: zkusit všechna města, vybrat nejvyšší zisk NEJLEVNĚJŠÍ cesty —
    // ne jen výroby. Jinak by vyhrálo město, kde se nejlíp vyrábí, i když
    // jinde vychází líp enchant.
    let nej: VysledekDilny | null = null;
    let zaloha: VysledekDilny | null = null;
    for (const m of MESTA) {
      const misto = mistoProdejeZKonfigu(m.nazev, konfig.naBM);
      const { radek, cesty } = spocitejVMeste(
        komb, m.nazev, misto, konfig.ztrata,
        efektivniSklad, historie, konstanty, nastaveni, nazevPolozky, lokace(m.nazev),
      );
      const kandidat: VysledekDilny = {
        klic, mesto: m.nazev, mistoProdeje: misto, auto: true, radek, cesty,
      };
      zaloha = kandidat;
      const zisk = ziskDilny(kandidat);
      const nejZisk = nej ? ziskDilny(nej) : null;
      if (zisk !== null && (nejZisk === null || zisk > nejZisk)) nej = kandidat;
    }
    return nej ?? zaloha ?? {
      klic, mesto: DILNA_MESTO, mistoProdeje: "bm", auto: true, radek: null, cesty: null,
    };
  });
}

// ── Suroviny (pro hromadnou editaci cen) ───────────────────────

export interface SurovinaDilny {
  zaklad: string;
  enchant: number;
}

/**
 * Kroky enchantu .1 … .e, nebo prázdné pole, když cesta enchantem není.
 * Stejná podmínka jako v jádru (`cesty.ts`): každý stupeň musí mít vylepšení.
 */
function krokyEnchantu(p: HerniPolozka, enchant: number) {
  const kroky = [];
  for (let e = 1; e <= enchant; e++) {
    const krok = p.vylepseni.find((v) => v.naEnchant === e);
    if (!krok || krok.vstupy.length === 0) return [];
    kroky.push(krok);
  }
  return kroky;
}

/** Runy, duše a relikvie, které položka potřebuje na cestu enchantem. */
function runyPolozky(p: HerniPolozka, enchant: number): SurovinaDilny[] {
  return krokyEnchantu(p, enchant).flatMap((k) =>
    k.vstupy.map((v) => ({ zaklad: v.zaklad, enchant: v.enchant })));
}

/** Suroviny receptu na daný enchant (bez faction tokenu). */
function surovinyReceptu(p: HerniPolozka, enchant: number): SurovinaDilny[] {
  const v = p.varianty.find((x) => x.enchant === enchant && !x.sFactionTokenem);
  return (v?.vstupy ?? []).map((x) => ({ zaklad: x.zaklad, enchant: x.enchant }));
}

/**
 * Suroviny výroby .e a — když má položka cestu enchantem — i suroviny .0.
 * Runy do tohohle seznamu nepatří, mají v panelu vlastní skupinu.
 */
function surovinyPolozky(p: HerniPolozka, enchant: number): SurovinaDilny[] {
  const vysledek = surovinyReceptu(p, enchant);
  if (enchant > 0 && krokyEnchantu(p, enchant).length > 0) {
    vysledek.push(...surovinyReceptu(p, 0));
  }
  return vysledek;
}

/** Všechny nakupované vstupy všech tří cest — pro 30denní medián. */
function vstupyDilny(p: HerniPolozka, enchant: number): SurovinaDilny[] {
  return [...surovinyPolozky(p, enchant), ...runyPolozky(p, enchant)];
}

function sjednot(seznam: SurovinaDilny[]): SurovinaDilny[] {
  const mapa = new Map<string, SurovinaDilny>();
  for (const s of seznam) mapa.set(`${s.zaklad}#${s.enchant}`, s);
  return [...mapa.values()];
}

/**
 * Sjednocení všech vstupních surovin napříč položkami v seznamu —
 * včetně surovin na .0 kus, ze kterého se enchantuje.
 */
export function surovinyDilny(stav: StavDilny): SurovinaDilny[] {
  return sjednot(kombinaceZKlicu(stav.klice)
    .flatMap((k) => surovinyPolozky(k.polozka, k.enchant)));
}

/** Runy, duše a relikvie napříč položkami v seznamu — pro panel cen. */
export function runyDilny(stav: StavDilny): SurovinaDilny[] {
  return sjednot(kombinaceZKlicu(stav.klice)
    .flatMap((k) => runyPolozky(k.polozka, k.enchant)));
}

/**
 * Ve kterém městě se edituje cena surovin v panelu.
 *
 * Suroviny se kupují ve městě výroby. Když je globálně „nejlevnější", cena
 * se liší podle města a hromadná editace nedává jednoznačný smysl — vezme
 * se Caerleon jako referenční (a panel na to upozorní).
 */
export function mestoProSuroviny(stav: StavDilny): string {
  return stav.konfig.mesto === AUTO_MESTO ? DILNA_MESTO : stav.konfig.mesto;
}

// ── Uložení ────────────────────────────────────────────────────
//
// Seznam i konfigurace jsou NEZÁVISLÉ na serveru — „co a jak vyrábím" je
// tvoje volba, ne vlastnost ekonomiky. Ceny se drží zvlášť per server.

const KLIC_ULOZISTE = "albion:dilna:v2";
const KLIC_STARY = "albion:dilna:v1";   // jen seznam klíčů (string[])

function ocistiKonfig(k: unknown): KonfigDilny {
  const o = (k ?? {}) as Partial<KonfigDilny>;
  const mesto = typeof o.mesto === "string" ? o.mesto : DILNA_MESTO;
  const ztrata = typeof o.ztrata === "number" ? Math.min(Math.max(o.ztrata, 0), 1) : 0.05;
  return { mesto, naBM: o.naBM !== false, ztrata };
}

export function nactiDilnu(): StavDilny {
  try {
    const s = localStorage.getItem(KLIC_ULOZISTE);
    if (s) {
      const d = JSON.parse(s) as Partial<StavDilny>;
      const klice = Array.isArray(d.klice) ? d.klice.filter((x): x is string => typeof x === "string") : [];
      const override: Record<string, KonfigDilny> = {};
      for (const [k, v] of Object.entries(d.override ?? {})) override[k] = ocistiKonfig(v);
      const zdrojCen: ZdrojCen = d.zdrojCen === "historie" ? "historie" : "orderbook";
      return { klice, konfig: ocistiKonfig(d.konfig), override, zdrojCen };
    }
    // Migrace ze staré verze: jen seznam klíčů, výchozí konfigurace.
    const stary = localStorage.getItem(KLIC_STARY);
    if (stary) {
      const klice = JSON.parse(stary);
      if (Array.isArray(klice)) {
        return {
          klice: klice.filter((x) => typeof x === "string"),
          konfig: VYCHOZI_KONFIG, override: {}, zdrojCen: "orderbook",
        };
      }
    }
  } catch {
    // Poškozený obsah — začni s prázdnou dílnou.
  }
  return PRAZDNY_STAV;
}

export function ulozDilnu(stav: StavDilny): void {
  try {
    localStorage.setItem(KLIC_ULOZISTE, JSON.stringify(stav));
  } catch {
    // Nevadí — seznam je pohodlí, ne nutnost.
  }
}

// ── Presety ────────────────────────────────────────────────────

export interface Preset {
  nazev: string;
  stav: StavDilny;
}

const KLIC_PRESETY = "albion:dilna-presety:v1";

export function nactiPresety(): Preset[] {
  try {
    const s = localStorage.getItem(KLIC_PRESETY);
    if (!s) return [];
    const d = JSON.parse(s);
    if (!Array.isArray(d)) return [];
    return d.filter((p): p is Preset => p && typeof p.nazev === "string" && p.stav);
  } catch {
    return [];
  }
}

export function ulozPresety(presety: Preset[]): void {
  try {
    localStorage.setItem(KLIC_PRESETY, JSON.stringify(presety));
  } catch {
    // Nevadí.
  }
}
