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

import type { Cena, HerniPolozka, Konstanty, Lokace, TypCeny } from "@albion/jadro";
import { BLACK_MARKET, HRA, MESTA, lokace, polozka } from "../data/hra";
import type { Kombinace } from "../data/hra";
import {
  spocitatSken, type MistoProdeje, type NastaveniSkenu, type RadekSkenu,
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
  radek: RadekSkenu | null;
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
      const varianta = komb.polozka.varianty.find(
        (v) => v.enchant === komb.enchant && !v.sFactionTokenem,
      );
      for (const vst of varianta?.vstupy ?? []) nastav(mesto, vst.zaklad, vst.enchant);
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
): RadekSkenu | null {
  const radky = spocitatSken(
    // skupina musí být výbava (ne suroviny), aby platil Black Market
    { ...nastaveni, mesto, skupina: "zbrane", mistoProdeje, ztrataZasilek: ztrata },
    sklad, lok, konst, nazev, hist, [komb],
  );
  return radky[0] ?? null;
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
    if (!komb) return { klic, mesto: DILNA_MESTO, mistoProdeje: "bm" as const, auto: false, radek: null };

    const konfig = konfigProKlic(stav, klic);
    const auto = konfig.mesto === AUTO_MESTO;

    if (!auto) {
      const misto = mistoProdejeZKonfigu(konfig.mesto, konfig.naBM);
      const radek = spocitejVMeste(
        komb, konfig.mesto, misto, konfig.ztrata,
        efektivniSklad, historie, konstanty, nastaveni, nazevPolozky, lokace(konfig.mesto),
      );
      return { klic, mesto: konfig.mesto, mistoProdeje: misto, auto: false, radek };
    }

    // AUTO: zkusit všechna města, vybrat nejvyšší zisk.
    let nej: VysledekDilny | null = null;
    let zaloha: VysledekDilny | null = null;
    for (const m of MESTA) {
      const misto = mistoProdejeZKonfigu(m.nazev, konfig.naBM);
      const radek = spocitejVMeste(
        komb, m.nazev, misto, konfig.ztrata,
        efektivniSklad, historie, konstanty, nastaveni, nazevPolozky, lokace(m.nazev),
      );
      const kandidat: VysledekDilny = { klic, mesto: m.nazev, mistoProdeje: misto, auto: true, radek };
      zaloha = kandidat;
      if (radek?.vysledek && (!nej?.radek?.vysledek || radek.vysledek.zisk > nej.radek.vysledek.zisk)) {
        nej = kandidat;
      }
    }
    return nej ?? zaloha ?? { klic, mesto: DILNA_MESTO, mistoProdeje: "bm", auto: true, radek: null };
  });
}

// ── Suroviny (pro hromadnou editaci cen) ───────────────────────

export interface SurovinaDilny {
  zaklad: string;
  enchant: number;
}

/** Sjednocení všech vstupních surovin napříč položkami v seznamu. */
export function surovinyDilny(stav: StavDilny): SurovinaDilny[] {
  const mapa = new Map<string, SurovinaDilny>();
  for (const komb of kombinaceZKlicu(stav.klice)) {
    const v = komb.polozka.varianty.find(
      (x) => x.enchant === komb.enchant && !x.sFactionTokenem,
    );
    for (const vst of v?.vstupy ?? []) {
      mapa.set(`${vst.zaklad}#${vst.enchant}`, { zaklad: vst.zaklad, enchant: vst.enchant });
    }
  }
  return [...mapa.values()];
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
