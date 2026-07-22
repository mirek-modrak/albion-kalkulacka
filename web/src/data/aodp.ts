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
