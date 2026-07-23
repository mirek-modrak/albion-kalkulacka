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

let odlozenyZapis: ReturnType<typeof setTimeout> | undefined;

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

  clearTimeout(odlozenyZapis);
  odlozenyZapis = setTimeout(() => zapis(server, nastaveni, ceny), ODKLAD_ZAPISU_MS);
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
  clearTimeout(odlozenyZapis);
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
