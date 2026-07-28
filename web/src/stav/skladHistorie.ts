/**
 * Sklad skutečných obchodů.
 *
 * Doplněk ke `SkladCen`. Ten drží **order book** — za kolik někdo nabízí
 * a za kolik někdo poptává *právě teď*. Tenhle drží to druhé: **co se
 * reálně prodalo** za posledních 30 dní a v jakém množství.
 *
 * Proč to nestačilo mít jen v cenách:
 *
 * 1. Order book neumí říct, jestli za tu cenu někdo koupí. Naměřeno
 *    2026-07-23: T6 Main Sword má v Caerleonu nabídku 89 999 a za 30 dní
 *    tam neproběhl JEDINÝ obchod. Aplikace s těmi 89 999 počítala jako
 *    s tržbou.
 * 2. Order book může být zastaralý i opačným směrem. T5 Cape na Black
 *    Marketu: buy_max 4 108, ale medián skutečných obchodů 8 753 při
 *    objemu 9 974 kusů týdně. Ta nabídka je brak, ne cena.
 *
 * **Klíčové pravidlo, které platí všude níž: chybějící data NEJSOU nula.**
 * AODP je crowdsourcované — den bez záznamu znamená „nikdo tam nestál
 * s datovým klientem", ne „neobchodovalo se". Naměřeno: T5 Main Sword
 * má v okně 7 dní ve všech královských městech nulu, ale v okně 30 dní
 * má Lymhurst 23 dní dat. Kdyby se to slilo dohromady, aplikace by
 * u desítek řádků tvrdila „tady se neobchoduje" — a takové varování
 * uživatel po druhém dni přestane číst.
 */

import type { SerieHistorie } from "../data/aodp";

/** Kolik dní zpět od konce okna se počítá „týden“. */
const DNI_TYDNE = 7;

/**
 * Kolikrát nad maximem skutečných obchodů musí být nabídka, aby byla
 * označená za fantomovou.
 *
 * Záměrně konzervativní. `maxOkno` je maximum denních PRŮMĚRŮ, takže
 * legitimní sell order nad ním normálně leží — o polovinu rozpětí,
 * a u tenkých trhů bývá rozpětí široké. Ověřeno na 176 řádcích:
 * práh 1,5× označí 3 řádky, práh 2× jeden, práh 3× žádný.
 *
 * Nízké číslo je správně. Ty nejhorší případy (T6 meč za 89 999) totiž
 * historii nemají vůbec a chytne je už stav `bez-dat` — tenhle práh je
 * jen doplněk pro trhy, kde data jsou.
 */
const PRAH_FANTOMU = 2;

/** Souhrn skutečných obchodů pro jednu položku v jednom městě. */
export interface SouhrnObchodu {
  /** Medián denních průměrů za poslední týden. Null = za týden žádná data. */
  medianTyden: number | null;
  /** Kusů zobchodovaných za poslední týden. Null = žádná data (NE nula!). */
  objemTyden: number | null;
  /**
   * Kolik kusů se prodá za DEN — medián přes dny týdne, které mají data.
   *
   * Medián, ne součet dělený sedmi: když má týden data jen za tři dny,
   * dělení sedmi by objem srazilo na necelou polovinu skutečnosti.
   * Medián přes pozorované dny odpovídá na „kolik se tu běžně prodá",
   * což je otázka, která se poměřuje s velikostí dávky.
   *
   * Denní číslo je čitelnější než týdenní — u Black Marketu jsou to
   * u tašek a plášťů tisíce kusů DENNĚ a v týdenním údaji to nebylo
   * poznat na první pohled.
   */
  objemDen: number | null;
  /**
   * Medián denních průměrů za celé 30denní okno. Null = žádná data.
   *
   * Stabilnější než poslední cena z order booku — jeden zbloudilý order
   * s ním nehne. Slouží jako volitelný zdroj ceny do výpočtu, když nechceš
   * počítat z aktuálního (a často zavádějícího) snímku trhu.
   */
  median30: number | null;
  /** Kusů za celé 30denní okno. Null = žádná data. */
  objemOkno: number | null;
  /** Nejnižší a nejvyšší denní průměr v okně. Null = žádná data. */
  minOkno: number | null;
  maxOkno: number | null;
  /** Kolik dní týdne a kolik dní okna má data. */
  dniTydne: number;
  dniOkna: number;
  /** Poslední den se záznamem (YYYY-MM-DD). Null = žádná data. */
  posledniDen: string | null;
}

const PRAZDNY: SouhrnObchodu = {
  medianTyden: null, objemTyden: null, objemDen: null, median30: null, objemOkno: null,
  minOkno: null, maxOkno: null, dniTydne: 0, dniOkna: 0, posledniDen: null,
};

function klic(mesto: string, zaklad: string, enchant: number): string {
  return `${mesto}|${zaklad}#${enchant}`;
}

function median(hodnoty: number[]): number | null {
  if (hodnoty.length === 0) return null;
  const s = [...hodnoty].sort((a, b) => a - b);
  const stred = s.length >> 1;
  return s.length % 2 ? s[stred]! : (s[stred - 1]! + s[stred]!) / 2;
}

/** Datum o N dní zpět. Vstup i výstup YYYY-MM-DD, počítá se v UTC. */
function oDniZpet(datum: string, dni: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dni);
  return d.toISOString().slice(0, 10);
}

/**
 * Je bod z AODP použitelný?
 *
 * Data jsou cizí vstup — jeden pokažený řádek nesmí posunout medián ani
 * shodit součet. Bod bez platné ceny NEBO bez platného počtu se zahazuje
 * celý: cena bez objemu a objem bez ceny jsou obojí k ničemu a míchat
 * je s platnými by dalo souhrn, který nesedí sám se sebou.
 */
function jePouzitelny(b: { avg_price: number; item_count: number; timestamp: string }): boolean {
  return Number.isFinite(b.avg_price) && b.avg_price > 0
    && Number.isFinite(b.item_count) && b.item_count >= 0
    && typeof b.timestamp === "string" && /^\d{4}-\d{2}-\d{2}/.test(b.timestamp);
}

export class SkladHistorie {
  private readonly mapa = new Map<string, SouhrnObchodu>();

  /** Konec okna — nejnovější den napříč CELOU odpovědí. Null, dokud se nic nenačetlo. */
  private konecOkna: string | null = null;

  ziskej(mesto: string, zaklad: string, enchant: number): SouhrnObchodu | undefined {
    return this.mapa.get(klic(mesto, zaklad, enchant));
  }

  get pocet(): number {
    return this.mapa.size;
  }

  /** Poslední den, ke kterému se souhrny vztahují. Pro UI — ať je vidět stáří. */
  get konec(): string | null {
    return this.konecOkna;
  }

  /**
   * Zpracuje odpověď z AODP na souhrny.
   *
   * Konec okna se bere jako **nejnovější den napříč celou odpovědí**, ne
   * „dnešek“. Dva důvody: nejčerstvější denní přihrádka AODP zaostává
   * o 1–2 dny (naměřeno), takže proti dnešku by i zdravý trh vycházel
   * jako neúplný. A společný konec dělá města navzájem porovnatelná —
   * stejný precedent jako osa grafu v `historie.ts`.
   *
   * @param rozlozId  převod AODP ID zpět na (základ, enchant) — týž jako u cen
   */
  naplnZAodp(
    serie: SerieHistorie[],
    rozlozId: (id: string) => { zaklad: string; enchant: number },
  ): { ulozeno: number; konecOkna: string | null } {
    // Nejdřív najít konec okna, teprve pak počítat — týdenní okno se od něj odvíjí.
    let konec: string | null = null;
    for (const s of serie) {
      for (const b of s.data ?? []) {
        if (!jePouzitelny(b)) continue;
        const den = b.timestamp.slice(0, 10);
        if (konec === null || den > konec) konec = den;
      }
    }

    if (konec === null) {
      // Odpověď bez jediného použitelného bodu. Sklad se NEČISTÍ — starší
      // souhrny jsou pořád lepší než nic a jejich stáří je vidět z `konec`.
      return { ulozeno: 0, konecOkna: this.konecOkna };
    }

    this.konecOkna = konec;
    const zacatekTydne = oDniZpet(konec, DNI_TYDNE - 1);
    let ulozeno = 0;

    for (const s of serie) {
      const { zaklad, enchant } = rozlozId(s.item_id);

      const cenyTydne: number[] = [];
      const cenyOkna: number[] = [];
      const objemyTydne: number[] = [];
      let objemTydne = 0;
      let objemOkna = 0;
      let min: number | null = null;
      let max: number | null = null;
      let dniTydne = 0;
      let dniOkna = 0;
      let posledniDen: string | null = null;

      for (const b of s.data ?? []) {
        if (!jePouzitelny(b)) continue;
        const den = b.timestamp.slice(0, 10);

        dniOkna++;
        objemOkna += b.item_count;
        cenyOkna.push(b.avg_price);
        if (min === null || b.avg_price < min) min = b.avg_price;
        if (max === null || b.avg_price > max) max = b.avg_price;
        if (posledniDen === null || den > posledniDen) posledniDen = den;

        if (den >= zacatekTydne) {
          dniTydne++;
          objemTydne += b.item_count;
          objemyTydne.push(b.item_count);
          cenyTydne.push(b.avg_price);
        }
      }

      if (dniOkna === 0) continue;   // série bez použitelných bodů = jako by nepřišla

      this.mapa.set(klic(s.location, zaklad, enchant), {
        medianTyden: median(cenyTydne),
        // Nula jen když ten týden data BYLA a byla nulová. Bez dat → null.
        objemTyden: dniTydne > 0 ? objemTydne : null,
        objemDen: median(objemyTydne),
        median30: median(cenyOkna),
        objemOkno: objemOkna,
        minOkno: min, maxOkno: max,
        dniTydne, dniOkna, posledniDen,
      });
      ulozeno++;
    }

    return { ulozeno, konecOkna: konec };
  }

  /** Vyexportuje obsah pro uložení do prohlížeče. */
  export(): UlozenySouhrn[] {
    const vysledek: UlozenySouhrn[] = [];
    for (const [k, s] of this.mapa) {
      const [mesto, polozka] = k.split("|");
      const [zaklad, enchant] = (polozka ?? "").split("#");
      if (!mesto || !zaklad) continue;
      vysledek.push({ mesto, zaklad, enchant: Number(enchant ?? 0), ...s });
    }
    return vysledek;
  }

  /** Naplní sklad z uložených dat. Volá se jednou při startu. */
  obnov(souhrny: UlozenySouhrn[], konecOkna: string | null): number {
    for (const u of souhrny) {
      const { mesto, zaklad, enchant, ...zbytek } = u;
      this.mapa.set(klic(mesto, zaklad, enchant), zbytek);
    }
    this.konecOkna = konecOkna;
    return souhrny.length;
  }
}

export interface UlozenySouhrn extends SouhrnObchodu {
  mesto: string;
  zaklad: string;
  enchant: number;
}

// ─────────────────────────────────────────────────────────────
// Vyhodnocení likvidity
// ─────────────────────────────────────────────────────────────

/**
 * Stav likvidity řádku.
 *
 * Tři z těch čtyř stavů jsou tvrzení o DATECH, ne o trhu. To je záměr —
 * aplikace o trhu neví nic než to, co jí AODP pošle, a tvářit se jinak
 * by znamenalo lhát tam, kde jde o peníze.
 */
export type StavLikvidity =
  /** Za celé 30denní okno ani jeden záznam. Nejspíš se tu neobchoduje — ale jistotu nemáme. */
  | "bez-dat"
  /** V okně data jsou, za poslední týden ne. Trh existuje, jen ho nikdo neskenoval. */
  | "zastarala"
  /** Za týden se obchodovalo, ale míň kusů, než chceš vyrobit. */
  | "tenky"
  | "ok";

export interface Likvidita {
  stav: StavLikvidity;
  souhrn: SouhrnObchodu;
  /**
   * Aktuální nabídka leží nad vším, co se v okně reálně prodalo.
   * Nezávislé na `stav` — může nastat i u likvidního trhu.
   */
  fantomovyListing: boolean;
  /** Odchylka aktuální ceny od týdenního mediánu. Null, když chybí základ. */
  odchylkaOdMedianu: number | null;
}

/**
 * Vyhodnotí likviditu jednoho řádku.
 *
 * @param souhrn   souhrn obchodů pro (město, položka); undefined = nemáme
 * @param davka    kolik kusů chce uživatel vyrobit (`pocetVyrobku`)
 * @param nabidka  aktuální cena, se kterou sken počítá tržbu; null = nemáme
 *
 * **POZOR — past pro volajícího:** `undefined` souhrn dá stav `bez-dat`,
 * což je tvrzení „ptali jsme se a nic tam není". Když se historie netáhla
 * vůbec (první spuštění, selhalo stahování), je to tvrzení NEPRAVDIVÉ.
 * Volající to musí odlišit podle `SkladHistorie.konec === null` — dokud
 * je null, žádná odpověď nedorazila a likvidita se nemá zobrazovat vůbec.
 *
 * Práh „tenkého“ trhu není vymyšlené číslo — porovnává se s **dávkou
 * uživatele**. Chceš 100 mečů a trh jich za týden vezme 13? Varování.
 * Relativní práh proti nejlepšímu městu jsem zkusil a zahodil: T5 Planks
 * mají v Caerleonu 51 000 kusů týdně (6 % Fort Sterlingu) a je to naprosto
 * zdravý trh — takový práh by křičel tam, kde je všechno v pořádku.
 */
export function vyhodnotLikviditu(
  souhrn: SouhrnObchodu | undefined,
  davka: number,
  nabidka: number | null,
): Likvidita {
  const s = souhrn ?? PRAZDNY;

  const fantomovyListing =
    nabidka !== null && s.maxOkno !== null && s.maxOkno > 0
      && nabidka > s.maxOkno * PRAH_FANTOMU;

  const odchylkaOdMedianu =
    nabidka !== null && s.medianTyden !== null && s.medianTyden > 0
      ? (nabidka - s.medianTyden) / s.medianTyden
      : null;

  // Číslo, ne „není null". Souhrny se obnovují z prohlížeče, což je cizí
  // vstup — a `undefined` z uloženého záznamu starší verze projde jak
  // kontrolou na null, tak porovnáním s dávkou (`undefined < 100` je false).
  // Mrtvý trh by se pak tvářil jako v pořádku.
  const denniObjem = typeof s.objemDen === "number" ? s.objemDen : null;

  let stav: StavLikvidity;
  if (s.dniOkna === 0) stav = "bez-dat";
  else if (s.dniTydne === 0 || denniObjem === null) stav = "zastarala";
  // Proti DENNÍMU objemu, ne týdennímu. Dávku zpravidla chceš prodat naráz,
  // ne ji rozpouštět přes týden — a vysypat 1 000 kusů na trh, který jich
  // denně vezme 340, znamená srazit cenu.
  else if (davka > 0 && denniObjem < davka) stav = "tenky";
  else stav = "ok";

  return { stav, souhrn: s, fantomovyListing, odchylkaOdMedianu };
}

/** Stáří posledního záznamu ve dnech. Null bez dat. */
export function stariDnu(posledniDen: string | null, ted = new Date()): number | null {
  if (!posledniDen) return null;
  const d = new Date(`${posledniDen}T00:00:00Z`).getTime();
  if (!Number.isFinite(d)) return null;
  return Math.max(0, Math.floor((ted.getTime() - d) / 86_400_000));
}
