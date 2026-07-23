/**
 * Historie cen a objemů — načítání a souhrny.
 *
 * Keš je jen v paměti session, ne v prohlížeči: je to 30 dní × N položek
 * a rychle se to znehodnotí. Ukládat to trvale by zabíralo místo, které
 * potřebují ceny.
 */

import { nactiHistorii, type BodHistorie, type SerieHistorie, type Server } from "../data/aodp";

/** Jeden den včetně dní, kdy se neobchodovalo. */
export interface DenHistorie {
  datum: string;
  /** Null = ten den nejsou data. NESMÍ se nahradit nulou ani interpolovat. */
  cena: number | null;
  objem: number | null;
}

export interface HistorieMesta {
  mesto: string;
  dny: DenHistorie[];
  /** Průměr cen ze dnů, kdy se obchodovalo. */
  prumernaCena: number | null;
  /** Průměrný denní objem. Marže bez objemu je past. */
  prumernyObjem: number | null;
  /** Nejvyšší a nejnižší cena za období. */
  minCena: number | null;
  maxCena: number | null;
  /** Kolik dní ze 30 má data. */
  dniSData: number;
}

const kes = new Map<string, HistorieMesta[]>();

function klicKese(server: Server, itemId: string): string {
  return `${server}|${itemId}`;
}

/**
 * Doplní chybějící dny jako `null`.
 *
 * AODP vrací jen dny, kdy se obchodovalo — Caerleon měl 29 bodů ze 30.
 * Kdyby se chybějící dny prostě přeskočily, graf by mezi sousedy nakreslil
 * přímku a vypadalo by to, že data jsou úplná.
 */
function doplnChybejiciDny(body: BodHistorie[], odDne: Date, poDen: Date): DenHistorie[] {
  const podleData = new Map<string, BodHistorie>();
  for (const b of body) podleData.set(b.timestamp.slice(0, 10), b);

  const dny: DenHistorie[] = [];
  for (let d = new Date(odDne); d <= poDen; d.setUTCDate(d.getUTCDate() + 1)) {
    const datum = d.toISOString().slice(0, 10);
    const bod = podleData.get(datum);
    dny.push({
      datum,
      cena: bod?.avg_price ?? null,
      objem: bod?.item_count ?? null,
    });
  }
  return dny;
}

function shrn(mesto: string, dny: DenHistorie[]): HistorieMesta {
  // Průměry se počítají JEN z dní, kdy se obchodovalo. Brát chybějící dny
  // jako nulu by průměr uměle srazilo dolů.
  const ceny = dny.map((d) => d.cena).filter((c): c is number => c !== null);
  const objemy = dny.map((d) => d.objem).filter((o): o is number => o !== null);

  const prumer = (xs: number[]) =>
    xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  return {
    mesto,
    dny,
    prumernaCena: prumer(ceny),
    prumernyObjem: prumer(objemy),
    minCena: ceny.length > 0 ? Math.min(...ceny) : null,
    maxCena: ceny.length > 0 ? Math.max(...ceny) : null,
    dniSData: ceny.length,
  };
}

export async function ziskejHistorii(
  server: Server,
  itemId: string,
  mesta: string[],
  signal?: AbortSignal,
): Promise<HistorieMesta[]> {
  const klic = klicKese(server, itemId);
  const ulozene = kes.get(klic);
  if (ulozene) return ulozene;

  const serie: SerieHistorie[] = await nactiHistorii(server, itemId, mesta, 24, signal);

  // Rozsah osy podle nejnovějšího dne napříč všemi městy, ať jsou grafy
  // navzájem porovnatelné.
  const vsechnaData = serie.flatMap((s) => s.data.map((b) => b.timestamp.slice(0, 10)));
  if (vsechnaData.length === 0) {
    const prazdne = mesta.map((m) => shrn(m, []));
    kes.set(klic, prazdne);
    return prazdne;
  }

  const posledni = new Date(`${vsechnaData.sort().at(-1)}T00:00:00Z`);
  const prvni = new Date(posledni);
  prvni.setUTCDate(prvni.getUTCDate() - 29);

  const vysledek = mesta.map((mesto) => {
    const s = serie.find((x) => x.location === mesto);
    return shrn(mesto, doplnChybejiciDny(s?.data ?? [], prvni, posledni));
  });

  kes.set(klic, vysledek);
  return vysledek;
}

/**
 * Odchylka aktuální ceny od 30denního průměru.
 *
 * Desetinásobek mimo průměr je skoro jistě chyba v datech nebo manipulace,
 * ne příležitost.
 *
 * @returns podíl (0,5 = o polovinu nad průměrem), null když chybí základ
 */
export function odchylkaOdPrumeru(aktualni: number, prumer: number | null): number | null {
  if (prumer === null || prumer <= 0 || !Number.isFinite(aktualni)) return null;
  return (aktualni - prumer) / prumer;
}

/** Trend za posledních N dní — kladné číslo znamená růst. */
export function trend(dny: DenHistorie[], zaDni: number): number | null {
  const sData = dny.filter((d) => d.cena !== null);
  if (sData.length < 2) return null;

  const posledni = sData.at(-1)!.cena!;
  const index = Math.max(0, sData.length - 1 - zaDni);
  const drivejsi = sData[index]!.cena!;
  if (drivejsi <= 0) return null;

  return (posledni - drivejsi) / drivejsi;
}
