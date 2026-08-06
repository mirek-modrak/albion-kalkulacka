/**
 * Filtrování a řazení Dílny.
 *
 * Karty se dřív vykreslovaly prostě v pořadí, v jakém je uživatel přidal.
 * U deseti položek to stačí, u padesáti je to stěna, ve které nejde poznat,
 * co se vyplatí.
 *
 * Tenhle soubor je schválně bez Reactu — logika se dá otestovat bez klikání
 * a **sdílejí ji oba pohledy** (karty i tabulka). Kdyby ji každý pohled měl
 * vlastní, rozešly by se a porovnávaly by se dvě různě funkční Dílny,
 * ne dva vzhledy.
 */

import type { VysledekDilny } from "./dilna";
import { SLOUPCE } from "./sloupceDilny";
import { hodnotaMetriky, type Metrika } from "./sken";

/**
 * Podle čeho se řadí. **Vždycky se řadí podle něčeho** — „ruční pořadí"
 * (tedy pořadí přidání) zrušeno 2026-08-06: nešlo si ho nastavit, takže
 * to nebylo pořadí uživatele, jen pořadí, jak položky přibývaly.
 *
 * Každá hodnota odpovídá sloupci v tabulce, na který se dá kliknout.
 * Jediná výjimka je `nazev` — hlavička „Položka" se vypnout nedá.
 */
export type Razeni =
  | Metrika | "nazev" | "tier"
  | "naklad" | "trzba" | "likvidita" | "stari";

export type Smer = "sestupne" | "vzestupne";

/**
 * Výchozí směr při prvním kliknutí na sloupec.
 *
 * U peněz chce člověk nejdřív vidět to nejlepší, u názvu a stáří naopak
 * začátek abecedy a nejčerstvější data.
 */
export function vychoziSmer(r: Razeni): Smer {
  return r === "nazev" || r === "tier" || r === "stari" || r === "naklad"
    ? "vzestupne"
    : "sestupne";
}

/**
 * Platná řazení. **Jediný zdroj pravdy je seznam sloupců** — co je sloupec,
 * podle toho jde řadit. Dřív tu byl vlastní seznam a udržoval se dvakrát.
 *
 * `nazev` navíc: hlavička „Položka" je natvrdo, mezi vypínatelnými sloupci
 * proto není.
 */
export function jePlatneRazeni(x: unknown): x is Razeni {
  return x === "nazev" || SLOUPCE.some((s) => s.razeni !== undefined && s.razeni === x);
}

export interface NastaveniFiltru {
  hledani: string;
  jenZiskove: boolean;
  skrytBezCeny: boolean;
  /** Prázdné pole = VŠE, ne nic. Jinak by prázdný výběr schoval všechno. */
  tiery: number[];
  enchanty: number[];
  skupiny: string[];
  razeni: Razeni;
  smer: Smer;
}

export const VYCHOZI_FILTR: NastaveniFiltru = {
  hledani: "",
  jenZiskove: false,
  skrytBezCeny: false,
  tiery: [],
  enchanty: [],
  skupiny: [],
  // Něčím se řadit musí. Zisk je to, kvůli čemu se do Dílny kouká.
  razeni: "zisk",
  smer: "sestupne",
};

/**
 * Kliknutí na sloupec: stejný sloupec obrátí směr, jiný začne od začátku.
 *
 * Tady schválně, ne v komponentě — ať se to dá otestovat bez klikání
 * a ať se to chová stejně, kdyby řazení řídilo i něco jiného.
 */
export function poKliknutiNaSloupec(f: NastaveniFiltru, sloupec: Razeni): NastaveniFiltru {
  if (f.razeni === sloupec) {
    return { ...f, smer: f.smer === "sestupne" ? "vzestupne" : "sestupne" };
  }
  return { ...f, razeni: sloupec, smer: vychoziSmer(sloupec) };
}

/** Je filtr ve výchozím stavu (tedy nic neschovává)? Řazení se nepočítá. */
export function jeFiltrPrazdny(f: NastaveniFiltru): boolean {
  return f.hledani.trim() === ""
    && !f.jenZiskove && !f.skrytBezCeny
    && f.tiery.length === 0 && f.enchanty.length === 0 && f.skupiny.length === 0;
}

/** `T5_MAIN_RAPIER#1` → tier 5. Vrací `null`, když položka tier nemá. */
export function tierZKlice(klic: string): number | null {
  const shoda = /^T(\d)/.exec(klic);
  return shoda ? Number(shoda[1]) : null;
}

/** `T5_MAIN_RAPIER#1` → enchant 1. */
export function enchantZKlice(klic: string): number {
  const za = klic.split("#")[1];
  const n = Number(za);
  return Number.isFinite(n) ? n : 0;
}

/** Co potřebujeme o položce vědět a co nejde vyčíst z klíče. */
export interface Doplnky {
  /** Zobrazený název — pro hledání. */
  nazev: (v: VysledekDilny) => string;
  /** Id skupiny kategorií (`zbrane`, `brneni`…) nebo `null`. */
  skupina: (v: VysledekDilny) => string | null;
}

function maCenu(v: VysledekDilny): boolean {
  return v.radek?.vysledek != null;
}

function projdeFiltrem(v: VysledekDilny, f: NastaveniFiltru, d: Doplnky): boolean {
  if (f.skrytBezCeny && !maCenu(v)) return false;

  // Ztrátové schovat ano — ale položky bez ceny NEJSOU ztrátové, jen neznámé.
  // Kdyby je „jen ziskové" schovávalo, uživatel by nevěděl, že mu chybí data.
  if (f.jenZiskove && maCenu(v) && (v.radek!.vysledek!.zisk <= 0)) return false;

  const dotaz = f.hledani.trim().toLowerCase();
  if (dotaz && !d.nazev(v).toLowerCase().includes(dotaz)
    && !v.klic.toLowerCase().includes(dotaz)) return false;

  if (f.tiery.length) {
    const t = tierZKlice(v.klic);
    if (t === null || !f.tiery.includes(t)) return false;
  }
  if (f.enchanty.length && !f.enchanty.includes(enchantZKlice(v.klic))) return false;

  if (f.skupiny.length) {
    const s = d.skupina(v);
    if (s === null || !f.skupiny.includes(s)) return false;
  }
  return true;
}

/** Hodnota sloupce, který není metrikou skenu. Vyšší = „lepší" není pravidlo. */
function hodnotaSloupce(v: VysledekDilny, r: Razeni): number {
  const vyp = v.radek?.vysledek;
  switch (r) {
    case "naklad": return vyp?.nakladyCelkem ?? 0;
    case "trzba": return vyp?.trzbaHruba ?? 0;
    // Denní objem obchodů. Chybí-li historie, patří položka dolů — proto -1,
    // ne nula: nula je legitimní hodnota „nic se neobchoduje".
    case "likvidita": return v.radek?.likvidita?.souhrn?.objemDen ?? -1;
    case "stari": return v.radek?.stariHodin ?? -1;
    default: return 0;
  }
}

/** Řazení, která umí spočítat `hodnotaMetriky` ze skenu. */
const METRIKY_SKENU: Razeni[] = ["zisk", "marze", "ziskNaKus", "ziskNaKg", "ziskNaFocus"];

function jeMetrikaSkenu(r: Razeni): r is Metrika {
  return METRIKY_SKENU.includes(r);
}

function porovnej(a: VysledekDilny, b: VysledekDilny, f: NastaveniFiltru, d: Doplnky): number {
  const obrat = f.smer === "vzestupne" ? -1 : 1;

  if (f.razeni === "nazev") return -obrat * d.nazev(a).localeCompare(d.nazev(b), "cs");
  if (f.razeni === "tier") {
    const rozdil = (tierZKlice(a.klic) ?? 0) - (tierZKlice(b.klic) ?? 0);
    const vysledek = rozdil !== 0 ? rozdil : enchantZKlice(a.klic) - enchantZKlice(b.klic);
    return -obrat * vysledek;
  }

  // Bez ceny vždy dolů — a to i při obráceném směru. Nula by je zamíchala
  // mezi ztrátové položky a nahoře by bylo to, o čem se neví nic.
  // Obrácení směru na tomhle nic nemění: neznámé patří na konec vždy.
  const aMa = maCenu(a);
  const bMa = maCenu(b);
  if (aMa !== bMa) return aMa ? -1 : 1;
  if (!aMa) return 0;

  const rozdil = jeMetrikaSkenu(f.razeni)
    ? hodnotaMetriky(b.radek!, f.razeni) - hodnotaMetriky(a.radek!, f.razeni)
    : hodnotaSloupce(b, f.razeni) - hodnotaSloupce(a, f.razeni);
  return obrat * rozdil;
}

export interface Vysledek {
  /** Co se má vykreslit. */
  zobrazene: VysledekDilny[];
  /** Kolik jich filtr schoval — aby se to dalo uživateli říct. */
  skryto: number;
}

export function filtrujARad(
  vysledky: VysledekDilny[],
  f: NastaveniFiltru,
  d: Doplnky,
): Vysledek {
  const zobrazene = vysledky.filter((v) => projdeFiltrem(v, f, d));
  const serazene = [...zobrazene].sort((a, b) => porovnej(a, b, f, d));
  return { zobrazene: serazene, skryto: vysledky.length - zobrazene.length };
}

/** Které tiery a enchanty se v seznamu vůbec vyskytují — ať nenabízíme prázdno. */
export function dostupneTiery(vysledky: VysledekDilny[]): number[] {
  const t = new Set<number>();
  for (const v of vysledky) {
    const x = tierZKlice(v.klic);
    if (x !== null) t.add(x);
  }
  return [...t].sort((a, b) => a - b);
}

export function dostupneEnchanty(vysledky: VysledekDilny[]): number[] {
  return [...new Set(vysledky.map((v) => enchantZKlice(v.klic)))].sort((a, b) => a - b);
}

// ── Uložení ────────────────────────────────────────────────────
//
// VLASTNÍ klíč mimo stav Dílny. Kdyby filtr žil ve stavu Dílny, odnesl by
// ho balíček na server a přepsal by pohled na druhém zařízení. Na mobilu
// chce člověk typicky vidět něco jiného než na počítači.

const KLIC = "albion:filtr-dilny:v1";

export function nactiFiltr(): NastaveniFiltru {
  try {
    const s = localStorage.getItem(KLIC);
    if (!s) return VYCHOZI_FILTR;
    const d = JSON.parse(s) as Partial<NastaveniFiltru>;
    return {
      ...VYCHOZI_FILTR,
      ...d,
      // Pole ověřit — poškozený obsah nesmí shodit vykreslení.
      tiery: Array.isArray(d.tiery) ? d.tiery.filter((x) => typeof x === "number") : [],
      enchanty: Array.isArray(d.enchanty) ? d.enchanty.filter((x) => typeof x === "number") : [],
      skupiny: Array.isArray(d.skupiny) ? d.skupiny.filter((x) => typeof x === "string") : [],
      // Uložené "rucni" ze starších verzí sem spadne taky — převede se na výchozí.
      razeni: jePlatneRazeni(d.razeni) ? d.razeni : VYCHOZI_FILTR.razeni,
      smer: d.smer === "vzestupne" ? "vzestupne" : "sestupne",
      hledani: typeof d.hledani === "string" ? d.hledani : "",
    };
  } catch {
    return VYCHOZI_FILTR;
  }
}

// Zvolený pohled (karty / tabulka) — taky jen v prohlížeči. Je to
// vlastnost zařízení, ne uživatele: na mobilu se hodí něco jiného.

export type Pohled = "karty" | "tabulka";

const KLIC_POHLEDU = "albion:pohled-dilny:v1";

export function nactiPohled(): Pohled {
  try {
    return localStorage.getItem(KLIC_POHLEDU) === "tabulka" ? "tabulka" : "karty";
  } catch {
    return "karty";
  }
}

export function ulozPohled(p: Pohled): void {
  try {
    localStorage.setItem(KLIC_POHLEDU, p);
  } catch {
    // Nevadí.
  }
}

export function ulozFiltr(f: NastaveniFiltru): void {
  try {
    localStorage.setItem(KLIC, JSON.stringify(f));
  } catch {
    // Nevadí — filtr je pohodlí, ne nutnost.
  }
}
