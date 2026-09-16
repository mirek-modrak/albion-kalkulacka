/**
 * Filtrování a řazení seznamu položek — sdílené Dílnou i Refiningem.
 *
 * Soubor se pořád jmenuje `filtrDilny`, protože vznikl pro Dílnu a
 * přejmenování by znamenalo sáhnout na deset importů kvůli názvu.
 * Obsluhuje ale obě karty; každá si předá vlastní klíč úložiště
 * a vlastní seznam sloupců.
 *
 * Položky se dřív vykreslovaly prostě v pořadí, v jakém je uživatel přidal.
 * U deseti to stačí, u padesáti je to stěna, ve které nejde poznat,
 * co se vyplatí.
 *
 * Tenhle soubor je schválně bez Reactu — logika se dá otestovat bez klikání.
 */

import { SLOUPCE } from "./sloupceDilny";
import { hodnotaMetriky, type Metrika, type RadekSkenu } from "./sken";

/**
 * Co filtr o položce potřebuje vědět.
 *
 * Dřív tu byl natvrdo `VysledekDilny`, ale používá se z něj jen klíč
 * a spočítaný řádek. Refining má svůj vlastní typ výsledku a **kopie
 * tohohle souboru by znamenala dvě místa pravdy pro řazení** — přesně
 * ta chyba, kvůli které se v F9e sjednocoval seznam sloupců.
 */
export interface PolozkaSeznamu {
  /** `T5_METALBAR#0` — základ, tier i enchant se z něj dají vyčíst. */
  klic: string;
  radek: RadekSkenu | null;
}

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
  | "naklad" | "trzba" | "likvidita" | "stari"
  // Dílna (F12): náklad na kus jednotlivých cest.
  | "nakladKoupit" | "nakladVyrobit" | "nakladEnchant"
  // Jen Refining: vrácení surovin, váha nákupu a úspora vlastní výrobou
  // nižšího tieru. V Dílně tyhle sloupce nejsou, takže je tam `jePlatneRazeni`
  // neuzná a uložená hodnota spadne na výchozí.
  | "vraceni" | "vahaNakupu" | "usporaVyrobou";

export type Smer = "sestupne" | "vzestupne";

/**
 * Výchozí směr při prvním kliknutí na sloupec.
 *
 * U peněz chce člověk nejdřív vidět to nejlepší, u názvu a stáří naopak
 * začátek abecedy a nejčerstvější data.
 */
export function vychoziSmer(r: Razeni): Smer {
  return r === "nazev" || r === "tier" || r === "stari" || r === "naklad"
    || r === "nakladKoupit" || r === "nakladVyrobit" || r === "nakladEnchant"
    || r === "vahaNakupu"
    ? "vzestupne"
    : "sestupne";
}

/**
 * Platná řazení. **Jediný zdroj pravdy je seznam sloupců** — co je sloupec,
 * podle toho jde řadit. Dřív tu byl vlastní seznam a udržoval se dvakrát.
 *
 * `nazev` navíc: hlavička „Položka" je natvrdo, mezi vypínatelnými sloupci
 * proto není.
 *
 * @param sloupce  seznam sloupců té karty, která se ptá. Výchozí je Dílna,
 *   aby se její volání nemusela měnit; Refining si předá svůj. Kdyby se
 *   nepředával, uznalo by se v Dílně řazení podle sloupce, který tam není.
 */
export function jePlatneRazeni(
  x: unknown, sloupce: readonly { razeni?: Razeni }[] = SLOUPCE,
): x is Razeni {
  return x === "nazev" || sloupce.some((s) => s.razeni !== undefined && s.razeni === x);
}

export interface NastaveniFiltru {
  hledani: string;
  jenZiskove: boolean;
  skrytBezCeny: boolean;
  /** Prázdné pole = VŠE, ne nic. Jinak by prázdný výběr schoval všechno. */
  tiery: number[];
  enchanty: number[];
  skupiny: string[];
  /**
   * Filtry navíc, které si karta pojmenuje sama: klíč → povolené hodnoty.
   *
   * Refining sem dává města refiningu a prodeje. Schválně obecně, ne jako
   * pojmenovaná pole `mesta*`: sdílený filtr by se jinak zaplnil pojmy
   * jedné karty a Dílna by nosila dvě pole, která nikdy nepoužije.
   * Prázdné pole u klíče znamená VŠE, stejně jako u tierů.
   */
  extra: Record<string, string[]>;
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
  extra: {},
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
    && f.tiery.length === 0 && f.enchanty.length === 0 && f.skupiny.length === 0
    && Object.values(f.extra ?? {}).every((v) => v.length === 0);
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
export interface Doplnky<T extends PolozkaSeznamu = PolozkaSeznamu> {
  /** Zobrazený název — pro hledání. */
  nazev: (v: T) => string;
  /**
   * Id skupiny pro filtr „skupiny".
   *
   * V Dílně je to skupina kategorií (`zbrane`, `brneni`…), v Refiningu
   * linka (`ore`, `hide`…). Filtr sám nerozlišuje — jen porovnává řetězce.
   */
  skupina: (v: T) => string | null;
  /**
   * Hodnota pro řazení, kterou sdílený filtr spočítat nemůže.
   *
   * Vrátí `undefined` = „tohle neumím, spočítej si to sám". Vzniklo kvůli
   * úspoře z vlastní výroby nižšího tieru: ta nesedí na `RadekSkenu`, žije
   * ve výsledku Refiningu. Bez tohohle háčku by se do sdíleného filtru
   * musel protáhnout typ jedné konkrétní karty.
   */
  hodnota?: (v: T, r: Razeni) => number | undefined;
  /** Hodnota pro filtr navíc — např. „ve kterém městě se to refinuje". */
  extra?: (v: T, klic: string) => string | null;
  /**
   * Zisk položky, když ho karta počítá jinak než řádek skenu. Null = bez ceny.
   *
   * Vzniklo kvůli Dílně (F12): zisk se tam bere z nejlevnější cesty
   * (koupit / vyrobit / enchantovat), ne z výroby. Bez háčku by „jen
   * ziskové" schovalo položku, která je zisková jen přes enchant.
   * Chybí = zisk z `radek.vysledek` jako dřív (Refining, Příležitosti).
   */
  zisk?: (v: T) => number | null;
}

function maCenu<T extends PolozkaSeznamu>(v: T, d: Doplnky<T>): boolean {
  return d.zisk ? d.zisk(v) !== null : v.radek?.vysledek != null;
}

function ziskPolozky<T extends PolozkaSeznamu>(v: T, d: Doplnky<T>): number {
  return d.zisk ? (d.zisk(v) ?? 0) : (v.radek?.vysledek?.zisk ?? 0);
}

function projdeFiltrem<T extends PolozkaSeznamu>(
  v: T, f: NastaveniFiltru, d: Doplnky<T>,
): boolean {
  if (f.skrytBezCeny && !maCenu(v, d)) return false;

  // Ztrátové schovat ano — ale položky bez ceny NEJSOU ztrátové, jen neznámé.
  // Kdyby je „jen ziskové" schovávalo, uživatel by nevěděl, že mu chybí data.
  if (f.jenZiskove && maCenu(v, d) && ziskPolozky(v, d) <= 0) return false;

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

  for (const [klic, povolene] of Object.entries(f.extra ?? {})) {
    if (povolene.length === 0) continue;   // prázdné = VŠE
    const hodnota = d.extra?.(v, klic) ?? null;
    if (hodnota === null || !povolene.includes(hodnota)) return false;
  }
  return true;
}

/** Hodnota sloupce, který není metrikou skenu. Vyšší = „lepší" není pravidlo. */
function hodnotaSloupce(v: PolozkaSeznamu, r: Razeni): number {
  const vyp = v.radek?.vysledek;
  switch (r) {
    case "naklad": return vyp?.nakladyCelkem ?? 0;
    case "trzba": return vyp?.trzbaHruba ?? 0;
    // Denní objem obchodů. Chybí-li historie, patří položka dolů — proto -1,
    // ne nula: nula je legitimní hodnota „nic se neobchoduje".
    case "likvidita": return v.radek?.likvidita?.souhrn?.objemDen ?? -1;
    case "stari": return v.radek?.stariHodin ?? -1;
    // Podíl vrácených surovin. Jádro refiningu — proto se podle něj řadí.
    case "vraceni": return vyp?.bonus.returnRate ?? -1;
    // Váha toho, co opravdu koupíš a povezeš. Ne nominální spotřeba receptu.
    case "vahaNakupu": return vyp?.vahaNakupu ?? -1;
    default: return 0;
  }
}

/** Řazení, která umí spočítat `hodnotaMetriky` ze skenu. */
const METRIKY_SKENU: Razeni[] = ["zisk", "marze", "ziskNaKus", "ziskNaKg", "ziskNaFocus"];

function jeMetrikaSkenu(r: Razeni): r is Metrika {
  return METRIKY_SKENU.includes(r);
}

function porovnej<T extends PolozkaSeznamu>(
  a: T, b: T, f: NastaveniFiltru, d: Doplnky<T>,
): number {
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
  const aMa = maCenu(a, d);
  const bMa = maCenu(b, d);
  if (aMa !== bMa) return aMa ? -1 : 1;
  if (!aMa) return 0;

  // Karta má přednost: co si spočítá sama, to sdílený filtr nepřepisuje.
  const vlastniA = d.hodnota?.(a, f.razeni);
  const vlastniB = d.hodnota?.(b, f.razeni);
  if (vlastniA !== undefined && vlastniB !== undefined) {
    return obrat * (vlastniB - vlastniA);
  }

  const rozdil = jeMetrikaSkenu(f.razeni)
    ? hodnotaMetriky(b.radek!, f.razeni) - hodnotaMetriky(a.radek!, f.razeni)
    : hodnotaSloupce(b, f.razeni) - hodnotaSloupce(a, f.razeni);
  return obrat * rozdil;
}

export interface Vysledek<T extends PolozkaSeznamu = PolozkaSeznamu> {
  /** Co se má vykreslit. */
  zobrazene: T[];
  /** Kolik jich filtr schoval — aby se to dalo uživateli říct. */
  skryto: number;
}

export function filtrujARad<T extends PolozkaSeznamu>(
  vysledky: T[],
  f: NastaveniFiltru,
  d: Doplnky<T>,
): Vysledek<T> {
  const zobrazene = vysledky.filter((v) => projdeFiltrem(v, f, d));
  const serazene = [...zobrazene].sort((a, b) => porovnej(a, b, f, d));
  return { zobrazene: serazene, skryto: vysledky.length - zobrazene.length };
}

/** Které tiery a enchanty se v seznamu vůbec vyskytují — ať nenabízíme prázdno. */
export function dostupneTiery(vysledky: PolozkaSeznamu[]): number[] {
  const t = new Set<number>();
  for (const v of vysledky) {
    const x = tierZKlice(v.klic);
    if (x !== null) t.add(x);
  }
  return [...t].sort((a, b) => a - b);
}

export function dostupneEnchanty(vysledky: PolozkaSeznamu[]): number[] {
  return [...new Set(vysledky.map((v) => enchantZKlice(v.klic)))].sort((a, b) => a - b);
}

// ── Uložení ────────────────────────────────────────────────────
//
// VLASTNÍ klíč mimo stav Dílny. Kdyby filtr žil ve stavu Dílny, odnesl by
// ho balíček na server a přepsal by pohled na druhém zařízení. Na mobilu
// chce člověk typicky vidět něco jiného než na počítači.

const KLIC = "albion:filtr-dilny:v1";
export const KLIC_FILTRU_REFININGU = "albion:filtr-refiningu:v1";

/**
 * @param klic     kde je filtr uložený. Každá karta má svůj — jinak by
 *   přepnutí ze Skenu do Refiningu přeneslo cizí filtr a vypadalo by to,
 *   že polovina seznamu zmizela.
 * @param sloupce  sloupce té karty; podle nich se ověří uložené řazení.
 */
export function nactiFiltr(
  klic: string = KLIC, sloupce: readonly { razeni?: Razeni }[] = SLOUPCE,
): NastaveniFiltru {
  try {
    const s = localStorage.getItem(klic);
    if (!s) return VYCHOZI_FILTR;
    const d = JSON.parse(s) as Partial<NastaveniFiltru>;
    return {
      ...VYCHOZI_FILTR,
      ...d,
      // Pole ověřit — poškozený obsah nesmí shodit vykreslení.
      tiery: Array.isArray(d.tiery) ? d.tiery.filter((x) => typeof x === "number") : [],
      enchanty: Array.isArray(d.enchanty) ? d.enchanty.filter((x) => typeof x === "number") : [],
      skupiny: Array.isArray(d.skupiny) ? d.skupiny.filter((x) => typeof x === "string") : [],
      extra: ocistiExtra(d.extra),
      // Uložené "rucni" ze starších verzí sem spadne taky — převede se na výchozí.
      // Stejně tak řazení podle sloupce, který na TÉHLE kartě není.
      razeni: jePlatneRazeni(d.razeni, sloupce) ? d.razeni : VYCHOZI_FILTR.razeni,
      smer: d.smer === "vzestupne" ? "vzestupne" : "sestupne",
      hledani: typeof d.hledani === "string" ? d.hledani : "",
    };
  } catch {
    return VYCHOZI_FILTR;
  }
}

/** Poškozený obsah nesmí shodit vykreslení — projde se klíč po klíči. */
function ocistiExtra(x: unknown): Record<string, string[]> {
  const vysledek: Record<string, string[]> = {};
  if (!x || typeof x !== "object" || Array.isArray(x)) return vysledek;
  for (const [klic, hodnoty] of Object.entries(x as Record<string, unknown>)) {
    if (!Array.isArray(hodnoty)) continue;
    vysledek[klic] = hodnoty.filter((y): y is string => typeof y === "string");
  }
  return vysledek;
}

export function ulozFiltr(f: NastaveniFiltru, klic: string = KLIC): void {
  try {
    localStorage.setItem(klic, JSON.stringify(f));
  } catch {
    // Nevadí — filtr je pohodlí, ne nutnost.
  }
}
