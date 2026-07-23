/**
 * Klient Albion Online Data Project.
 *
 * Ověřeno naostro 2026-07-22:
 *  - jeden dotaz unese ~170 ID × více měst × více kvalit (strop = URL 4096 znaků)
 *  - 170 ID × 6 měst × 3 kvality = 3060 cen, 50 kB, 0,32 s
 *  - limit 60 dotazů/min udržitelně (dokumentované 300/5 min je vázající)
 *
 * Data jsou crowdsourcovaná od hráčů — existují jen pro to, co si někdo
 * nedávno otevřel v herní tržnici. Proto každá cena nese časovou značku.
 */

export type Server = "west" | "europe" | "east";

export const SERVERY: { id: Server; nazev: string }[] = [
  { id: "west", nazev: "Americas (west)" },
  { id: "europe", nazev: "Europe" },
  { id: "east", nazev: "Asia (east)" },
];

/** Řádek odpovědi AODP. */
export interface RadekCeny {
  item_id: string;
  city: string;
  quality: number;
  sell_price_min: number;
  sell_price_min_date: string;
  sell_price_max: number;
  buy_price_min: number;
  buy_price_max: number;
  buy_price_max_date: string;
}

/**
 * Strop délky URL. Dokumentovaný limit je 4096; držíme rezervu na
 * parametry `locations` a `qualities`, které se přidávají až za ID.
 */
const MAX_DELKA_URL = 3600;

/** Nejkratší odstup mezi dotazy, aby se nenarazilo na limit. */
const ODSTUP_MS = 1100;

let posledniDotaz = 0;

async function pockejNaRadu(): Promise<void> {
  const uplynulo = Date.now() - posledniDotaz;
  if (uplynulo < ODSTUP_MS) {
    await new Promise((r) => setTimeout(r, ODSTUP_MS - uplynulo));
  }
  posledniDotaz = Date.now();
}

/**
 * Rozdělí ID do dávek tak, aby se každá vešla do délky URL.
 *
 * Dělí se podle DÉLKY, ne podle počtu — ID se liší (T5_ORE má 7 znaků,
 * T8_2H_INFERNALSCYTHE_HELL_LEVEL4@4 má 34). Pevný počet by u dlouhých
 * jmen URL přetekl.
 */
export function rozdelDoDavek(ids: string[], rezerva: number): string[][] {
  const davky: string[][] = [];
  let aktualni: string[] = [];
  let delka = 0;

  for (const id of ids) {
    const pridavek = id.length + 1; // +1 za čárku
    if (aktualni.length > 0 && delka + pridavek > MAX_DELKA_URL - rezerva) {
      davky.push(aktualni);
      aktualni = [];
      delka = 0;
    }
    aktualni.push(id);
    delka += pridavek;
  }
  if (aktualni.length > 0) davky.push(aktualni);
  return davky;
}

export class ChybaAodp extends Error {
  constructor(message: string, readonly stav?: number) {
    super(message);
    this.name = "ChybaAodp";
  }
}

interface Prubeh {
  hotovo: number;
  celkem: number;
}

/**
 * Stáhne aktuální ceny.
 *
 * @param signal  umožní sken zrušit, když uživatel přepne město
 */
export async function nactiCeny(
  server: Server,
  ids: string[],
  mesta: string[],
  kvality: number[] = [1],
  signal?: AbortSignal,
  naPrubeh?: (p: Prubeh) => void,
): Promise<RadekCeny[]> {
  const chvost = `?locations=${mesta.map(encodeURIComponent).join(",")}`
    + `&qualities=${kvality.join(",")}`;
  const davky = rozdelDoDavek(ids, chvost.length + 80);

  const vysledek: RadekCeny[] = [];

  for (const [i, davka] of davky.entries()) {
    if (signal?.aborted) throw new DOMException("zrušeno", "AbortError");
    await pockejNaRadu();

    const url = `https://${server}.albion-online-data.com/api/v2/stats/prices/`
      + `${davka.join(",")}.json${chvost}`;

    const odpoved = await fetch(url, { signal });

    if (odpoved.status === 429) {
      throw new ChybaAodp("AODP odmítlo dotaz kvůli limitu. Zkus to za chvíli.", 429);
    }
    if (!odpoved.ok) {
      throw new ChybaAodp(`AODP vrátilo HTTP ${odpoved.status}`, odpoved.status);
    }

    vysledek.push(...((await odpoved.json()) as RadekCeny[]));
    naPrubeh?.({ hotovo: i + 1, celkem: davky.length });
  }

  return vysledek;
}

// ─────────────────────────────────────────────────────────────
// Historie cen a objemů
// ─────────────────────────────────────────────────────────────

/** Jeden den historie. */
export interface BodHistorie {
  /** Průměrná cena USKUTEČNĚNÝCH obchodů — ne cena z order booku. */
  avg_price: number;
  /** Kolik kusů se ten den zobchodovalo. Nejcennější údaj z celého API. */
  item_count: number;
  timestamp: string;
}

export interface SerieHistorie {
  location: string;
  item_id: string;
  quality: number;
  data: BodHistorie[];
}

/**
 * Stáhne 30denní historii pro VÍC položek naráz.
 *
 * Endpoint `/stats/history` bere seznam ID úplně stejně jako `/prices` —
 * `nactiHistorii` níž posílá jednu položku jen proto, že ji volá detail.
 * Sken jich potřebuje stovky: po jedné by to bylo 230 dotazů (~4 minuty
 * a hluboko přes limit), v dávkách jsou to 3.
 *
 * Ověřeno naostro 2026-07-23: 75 ID × 7 měst × 30 dní = 853 kB, 0,66 s.
 * Enchantovaná ID se vracejí beze změny (`T5_PLANKS_LEVEL1@1`), takže
 * je lze mapovat zpět stejným `rozlozId` jako u cen.
 *
 * **Okno je 30 dní** (výchozí chování endpointu, proto se `date` neposílá).
 * Kratší okno by ušetřilo data, ale nerozlišilo by „tady se neobchoduje"
 * od „tady poslední týden nikdo neskenoval" — a přesně kvůli tomu rozdílu
 * se historie tahá. Naměřeno: T5 Main Sword má v okně 7 dní ve všech
 * královských městech nulu, ale v okně 30 dní má Lymhurst 23 dní dat.
 */
export async function nactiHistoriiDavkove(
  server: Server,
  ids: string[],
  mesta: string[],
  signal?: AbortSignal,
  naPrubeh?: (p: Prubeh) => void,
): Promise<SerieHistorie[]> {
  const chvost = `?locations=${mesta.map(encodeURIComponent).join(",")}`
    + `&time-scale=24&qualities=1`;
  const davky = rozdelDoDavek(ids, chvost.length + 80);

  const vysledek: SerieHistorie[] = [];

  for (const [i, davka] of davky.entries()) {
    if (signal?.aborted) throw new DOMException("zrušeno", "AbortError");
    await pockejNaRadu();

    const url = `https://${server}.albion-online-data.com/api/v2/stats/history/`
      + `${davka.join(",")}.json${chvost}`;

    const odpoved = await fetch(url, { signal });

    if (odpoved.status === 429) {
      throw new ChybaAodp("AODP odmítlo dotaz kvůli limitu. Zkus to za chvíli.", 429);
    }
    if (!odpoved.ok) {
      throw new ChybaAodp(`AODP vrátilo HTTP ${odpoved.status}`, odpoved.status);
    }

    vysledek.push(...((await odpoved.json()) as SerieHistorie[]));
    naPrubeh?.({ hotovo: i + 1, celkem: davky.length });
  }

  return vysledek;
}

/**
 * Stáhne 30denní historii pro jednu položku ve více městech.
 *
 * Volá se **až na vyžádání** (otevření detailu), ne při skenu —
 * sken používá dávkovou variantu výš.
 *
 * @param casovaOsa 1 = hodinově, 6 = po šesti hodinách, 24 = denně
 */
export async function nactiHistorii(
  server: Server,
  itemId: string,
  mesta: string[],
  casovaOsa: 1 | 6 | 24 = 24,
  signal?: AbortSignal,
): Promise<SerieHistorie[]> {
  await pockejNaRadu();

  const url = `https://${server}.albion-online-data.com/api/v2/stats/history/`
    + `${itemId}.json?locations=${mesta.map(encodeURIComponent).join(",")}`
    + `&time-scale=${casovaOsa}&qualities=1`;

  const odpoved = await fetch(url, { signal });
  if (odpoved.status === 429) {
    throw new ChybaAodp("AODP odmítlo dotaz kvůli limitu. Zkus to za chvíli.", 429);
  }
  if (!odpoved.ok) throw new ChybaAodp(`AODP vrátilo HTTP ${odpoved.status}`, odpoved.status);

  return (await odpoved.json()) as SerieHistorie[];
}

/**
 * Sentinelový záznam = položka nebyla nikdy naskenována.
 * AODP vrací datum 0001-01-01 a cenu 0. Brát to jako cenu by dalo
 * krásně vypadající nesmysl.
 */
export function jeSentinel(cena: number, datum: string | undefined): boolean {
  return !datum || datum.startsWith("0001-01-01") || !(cena > 0);
}

/** Stáří údaje v hodinách. AODP posílá čas v UTC bez značky. */
export function stariHodin(datum: string): number {
  return (Date.now() - new Date(`${datum}Z`).getTime()) / 3_600_000;
}
