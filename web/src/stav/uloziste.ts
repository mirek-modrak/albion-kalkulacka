/**
 * Uložení stavu v prohlížeči (`localStorage`).
 *
 * NENÍ to databáze — je to úložiště přímo v prohlížeči. Žádný server,
 * žádná údržba, funguje offline. Skutečná databáze přijde, až bude
 * potřeba něco počítat se zavřeným prohlížečem (viz R6).
 *
 * Pravidlo, které platí všude níž: **aplikace musí nastartovat vždy.**
 * Uložená data jsou pohodlí, ne nutnost — když jsou poškozená nebo
 * ze starší verze, zahodí se a jede se s prázdným skladem.
 */

import type { Cena, TypCeny, ZdrojCeny } from "@albion/jadro";
import type { Server } from "../data/aodp";
import type { NastaveniSkenu } from "./sken";
import type { UlozenySouhrn } from "./skladHistorie";

/**
 * Verze formátu.
 *
 * ZVÝŠIT při každé změně tvaru `UlozenaCena` nebo `NastaveniSkenu`.
 * Bez toho by aplikace po aktualizaci spadla na datech, která si sama
 * uložila v předchozí verzi.
 */
const VERZE = 1;

/** Ceny starší než tohle nemá smysl držet — jen zabírají místo. */
const MAX_STARI_DNI = 7;

/** Odklad zápisu, aby se neukládalo při každém úhozu do políčka. */
const ODKLAD_ZAPISU_MS = 500;

export interface UlozenaCena {
  mesto: string;
  zaklad: string;
  enchant: number;
  typ: TypCeny;
  hodnota: number;
  zdroj: ZdrojCeny;
  cas: string | null;
}

interface UlozenyStav {
  verze: number;
  ulozeno: string;
  nastaveni?: Partial<NastaveniSkenu>;
  ceny: UlozenaCena[];
}

/** Ceny ze serveru `west` nesmí platit pro `europe` — proto je server v klíči. */
function klicUloziste(server: Server): string {
  return `albion:v${VERZE}:${server}`;
}

function jeDostupne(): boolean {
  try {
    const zkouska = "albion:test";
    localStorage.setItem(zkouska, "1");
    localStorage.removeItem(zkouska);
    return true;
  } catch {
    // Soukromý režim nebo zakázané úložiště — aplikace funguje dál, jen nezapamatuje.
    return false;
  }
}

const DOSTUPNE = typeof localStorage !== "undefined" && jeDostupne();

/** Je cena tak stará, že ji nemá smysl obnovovat? Ruční ceny nestárnou. */
function jePrilisStara(c: UlozenaCena): boolean {
  if (c.zdroj === "rucne" || !c.cas) return false;
  const stariDni = (Date.now() - new Date(`${c.cas}Z`).getTime()) / 86_400_000;
  return !Number.isFinite(stariDni) || stariDni > MAX_STARI_DNI;
}

export function nacti(server: Server): { nastaveni?: Partial<NastaveniSkenu>; ceny: UlozenaCena[] } {
  if (!DOSTUPNE) return { ceny: [] };

  try {
    const surove = localStorage.getItem(klicUloziste(server));
    if (!surove) return { ceny: [] };

    const stav = JSON.parse(surove) as UlozenyStav;

    // Data z jiné verze formátu se ZAHAZUJÍ, neopravují. Ceny nejsou cenná
    // data — dají se stáhnout znovu jedním kliknutím.
    if (stav.verze !== VERZE || !Array.isArray(stav.ceny)) return { ceny: [] };

    return {
      nastaveni: stav.nastaveni,
      ceny: stav.ceny.filter((c) => c && typeof c.hodnota === "number" && !jePrilisStara(c)),
    };
  } catch {
    // Poškozený obsah nesmí shodit start aplikace.
    return { ceny: [] };
  }
}

/**
 * Odložené zápisy — **jeden časovač na herní server**.
 *
 * Dřív to byl jeden společný časovač pro všechny servery. Když se pak
 * uložil `west` a hned nato `europe`, druhé volání to první zrušilo
 * a data pro `west` se nikdy nezapsala. Naráželo na to stahování dat
 * ze serveru, které ukládá všechny servery za sebou.
 */
const odlozeneZapisy = new Map<Server, ReturnType<typeof setTimeout>>();

/**
 * Uloží stav. Zápis je odložený — při psaní do políčka se jinak ukládá
 * při každém stisku klávesy.
 */
export function uloz(
  server: Server,
  nastaveni: Partial<NastaveniSkenu>,
  ceny: UlozenaCena[],
): void {
  if (!DOSTUPNE) return;

  clearTimeout(odlozeneZapisy.get(server));
  odlozeneZapisy.set(
    server,
    setTimeout(() => {
      odlozeneZapisy.delete(server);
      zapis(server, nastaveni, ceny);
    }, ODKLAD_ZAPISU_MS),
  );
}

/**
 * Uloží okamžitě, bez odkladu.
 *
 * Pro dvě situace, kde odklad škodí:
 * - zápis víc serverů za sebou (stažení dat ze serveru),
 * - zavírání stránky — odložený zápis by nedoběhl a poslední změny
 *   by se ztratily (vada 4 v oponentuře plánu F9b).
 */
export function ulozIhned(
  server: Server,
  nastaveni: Partial<NastaveniSkenu>,
  ceny: UlozenaCena[],
): void {
  if (!DOSTUPNE) return;
  clearTimeout(odlozeneZapisy.get(server));
  odlozeneZapisy.delete(server);
  zapis(server, nastaveni, ceny);
}

function zapis(server: Server, nastaveni: Partial<NastaveniSkenu>, ceny: UlozenaCena[]): void {
  const stav: UlozenyStav = {
    verze: VERZE,
    ulozeno: new Date().toISOString(),
    nastaveni,
    ceny,
  };

  try {
    localStorage.setItem(klicUloziste(server), JSON.stringify(stav));
  } catch {
    // Nejspíš překročená kapacita (~5 MB). Zkusit znovu jen s ručními cenami.
    //
    // Ruční ceny jsou vědomá práce uživatele a NIKDY se nezahazují.
    // Stažené se dají získat zpátky jedním kliknutím.
    try {
      const jenRucni = { ...stav, ceny: ceny.filter((c) => c.zdroj === "rucne") };
      localStorage.setItem(klicUloziste(server), JSON.stringify(jenRucni));
    } catch {
      // Ani to se nevešlo — vzdát to. Aplikace funguje dál, jen nezapamatuje.
    }
  }
}

export function zapomen(server: Server): void {
  if (!DOSTUPNE) return;
  clearTimeout(odlozeneZapisy.get(server));
  odlozeneZapisy.delete(server);
  try {
    localStorage.removeItem(klicUloziste(server));
  } catch {
    // Nevadí.
  }
}

/** Převod uložené ceny zpět na `Cena` z jádra. */
export function naCenu(u: UlozenaCena): Cena {
  return { hodnota: u.hodnota, zdroj: u.zdroj, cas: u.cas, mesto: u.mesto, typ: u.typ };
}

// ─────────────────────────────────────────────────────────────
// Historie obchodů — VLASTNÍ klíč, ne ten s cenami
// ─────────────────────────────────────────────────────────────

/**
 * Proč oddělený klíč, a ne jen další pole ve `UlozenyStav`:
 *
 * `zapis` výš při překročení kapacity **zahodí všechny stažené ceny**
 * a nechá jen ruční. Historie je objemově srovnatelná s cenami (sken
 * výbavy je řádově 10 000 záznamů), takže ve společném klíči by mohla
 * ceny vytlačit. Oddělený klíč tuhle možnost vylučuje konstrukčně:
 * když se nevejde historie, selže zápis historie a cen se to netýká.
 *
 * Historie je navíc snadno nahraditelná — je to jeden dotaz při dalším
 * skenu. Ruční ceny jsou práce uživatele. Ta hierarchie musí být vidět
 * i v tom, co se obětuje první.
 */
/**
 * ZVÝŠIT při každé změně tvaru `SouhrnObchodu`.
 *
 * v2: přibylo `objemDen`. Bez zvýšení verze zůstalo u uložených souhrnů
 * `undefined` — a to prošlo kontrolou na `null` i porovnáním s dávkou
 * (`undefined < 100` je false), takže se mrtvý trh tvářil jako v pořádku.
 * Naměřeno při proklikávání: „0 ks/den" šedě, s nápovědou „trh je dost
 * hluboký". Chybějící pole se musí zahodit, ne dopočítat.
 *
 * v3: přibyl `median30` (30denní medián ceny) jako volitelný zdroj ceny.
 */
const VERZE_HISTORIE = 3;

/** Když se celé 30denní okno přetočí, uložené souhrny už nevypovídají o ničem. */
const MAX_STARI_HISTORIE_DNI = 30;

interface UlozenaHistorie {
  verze: number;
  konecOkna: string | null;
  souhrny: UlozenySouhrn[];
}

function klicHistorie(server: Server): string {
  return `albion:h${VERZE_HISTORIE}:${server}`;
}

/**
 * Uklidí souhrny ze starších verzí formátu.
 *
 * Zvýšení verze osiřelý záznam nesmaže — jen ho přestane číst. Historie
 * zabírá stovky kilobajtů a úložiště má kolem 5 MB, takže po pár verzích
 * by osiřelé záznamy vytlačily ty živé. Projevilo by se to tím, že se
 * historie tiše přestane ukládat.
 */
function ukliďStareVerze(server: Server): void {
  try {
    const platny = klicHistorie(server);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && /^albion:h\d+:/.test(k) && k.endsWith(`:${server}`) && k !== platny) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // Úklid je pohodlí, ne nutnost.
  }
}

export function nactiUlozenouHistorii(server: Server): {
  souhrny: UlozenySouhrn[];
  konecOkna: string | null;
} {
  if (!DOSTUPNE) return { souhrny: [], konecOkna: null };
  ukliďStareVerze(server);

  try {
    const surove = localStorage.getItem(klicHistorie(server));
    if (!surove) return { souhrny: [], konecOkna: null };

    const stav = JSON.parse(surove) as UlozenaHistorie;
    if (stav.verze !== VERZE_HISTORIE || !Array.isArray(stav.souhrny)) {
      return { souhrny: [], konecOkna: null };
    }

    // Přetočené okno se zahazuje celé. Půlka starých souhrnů by byla horší
    // než žádné — vypadala by stejně důvěryhodně jako čerstvé.
    if (stav.konecOkna) {
      const stari = (Date.now() - new Date(`${stav.konecOkna}T00:00:00Z`).getTime()) / 86_400_000;
      if (!Number.isFinite(stari) || stari > MAX_STARI_HISTORIE_DNI) {
        return { souhrny: [], konecOkna: null };
      }
    }

    return {
      souhrny: stav.souhrny.filter((s) => s && typeof s.mesto === "string" && !!s.zaklad),
      konecOkna: stav.konecOkna ?? null,
    };
  } catch {
    return { souhrny: [], konecOkna: null };
  }
}

/**
 * Uloží souhrny obchodů.
 *
 * Bez odkladu — na rozdíl od cen se nezapisuje při psaní do políčka,
 * ale jednou po skenu. Když se to nevejde, prostě se to neuloží:
 * likvidita zmizí do dalšího skenu, ale výpočet ani ceny to neohrozí.
 */
export function ulozHistorii(
  server: Server,
  souhrny: UlozenySouhrn[],
  konecOkna: string | null,
): void {
  if (!DOSTUPNE) return;
  const stav: UlozenaHistorie = { verze: VERZE_HISTORIE, konecOkna, souhrny };
  try {
    localStorage.setItem(klicHistorie(server), JSON.stringify(stav));
  } catch {
    // Nevešlo se. Historie je dopočitatelná jedním skenem — nechat být.
  }
}

export function zapomenHistorii(server: Server): void {
  if (!DOSTUPNE) return;
  try {
    localStorage.removeItem(klicHistorie(server));
  } catch {
    // Nevadí.
  }
}
