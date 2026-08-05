/**
 * Balíček dat uživatele — co se synchronizuje mezi zařízeními.
 *
 * Prostředník mezi úložištěm v prohlížeči a [sync.ts](./sync.ts). Díky němu
 * adaptér neví nic o vnitřnostech aplikace a aplikace neví nic o Firebase.
 *
 * **Co se synchronizuje** (viz f9b-plan.md):
 * - dílna (seznam položek, konfigurace, přepisy) a presety — vlastní práce
 * - ručně zadané ceny — taky vlastní práce, ty se nikdy nezahazují
 * - nastavení skenu — drobnost, ale otravné vyplňovat znovu
 *
 * **Co ne:** stažené ceny z AODP a historie obchodů. Jsou objemné, zastarají
 * za hodiny a získají se jedním kliknutím. Balíček tím zůstane v kilobajtech.
 *
 * Ceny i nastavení jsou **oddělené podle herního serveru** — cena z `west`
 * nesmí platit pro `europe` (vada 6 v oponentuře plánu).
 */

import { SERVERY, type Server } from "../data/aodp";
import { nactiDilnu, nactiPresety, ulozDilnu, ulozPresety, type Preset, type StavDilny } from "./dilna";
import { nacti, ulozIhned, type UlozenaCena } from "./uloziste";
import type { NastaveniSkenu } from "./sken";

/**
 * ZVÝŠIT při každé změně tvaru `DataBalicku`.
 *
 * Na rozdíl od úložiště v prohlížeči se serverová data při neshodě verzí
 * **nezahazují** — jsou to hodiny cizí práce. Starší tvar se převede,
 * novější tvar se odmítne číst (viz `PORAD_NOVEJSI`).
 */
export const VERZE_BALICKU = 1;

interface DataServeru {
  nastaveni?: Partial<NastaveniSkenu>;
  rucniCeny: UlozenaCena[];
}

export interface DataBalicku {
  dilna: StavDilny;
  presety: Preset[];
  servery: Partial<Record<Server, DataServeru>>;
}

export interface Balicek {
  verze: number;
  /** Kdo zapsal naposled — kvůli rozpoznání souběhu dvou zařízení. */
  zarizeni: string;
  /** Čas ze serveru, ne z prohlížeče. Doplňuje ho až sync.ts. */
  aktualizovano?: unknown;
  data: DataBalicku;
}

/** Novější formát, než umíme přečíst → jen číst, nepřepisovat. */
export function jePrilisNovy(b: { verze?: number } | null): boolean {
  return !!b && typeof b.verze === "number" && b.verze > VERZE_BALICKU;
}

// ── Identita zařízení ──────────────────────────────────────────
//
// Náhodné id vygenerované jednou za prohlížeč. Neslouží ke sledování
// uživatele — jen k tomu, aby šlo poznat „tohle jsem zapsal já"
// od „tohle přišlo z mobilu".

const KLIC_ZARIZENI = "albion:zarizeni";

export function idZarizeni(): string {
  try {
    const ulozene = localStorage.getItem(KLIC_ZARIZENI);
    if (ulozene) return ulozene;
    const nove = crypto.randomUUID();
    localStorage.setItem(KLIC_ZARIZENI, nove);
    return nove;
  } catch {
    return "nezname";
  }
}

// ── Sběr a použití ─────────────────────────────────────────────

/** Posbírá aktuální stav z prohlížeče do balíčku. */
export function sesbirej(): DataBalicku {
  const servery: Partial<Record<Server, DataServeru>> = {};
  for (const { id: s } of SERVERY) {
    const { nastaveni, ceny } = nacti(s);
    const rucni = ceny.filter((c) => c.zdroj === "rucne");
    // Prázdný server se do balíčku nepíše — ať je vidět, co uživatel
    // opravdu používá, a balíček zbytečně nebobtná.
    if (rucni.length > 0 || nastaveni) servery[s] = { nastaveni, rucniCeny: rucni };
  }
  return { dilna: nactiDilnu(), presety: nactiPresety(), servery };
}

/**
 * Zapíše balíček do úložiště v prohlížeči.
 *
 * Stažené ceny zůstávají nedotčené — přepisují se jen ruční ceny
 * a nastavení. Nemá smysl zahazovat čerstvě stažený sken jen proto,
 * že se uživatel přihlásil.
 */
export function pouzij(data: DataBalicku): void {
  ulozDilnu(data.dilna);
  ulozPresety(data.presety);

  for (const { id: s } of SERVERY) {
    const ze = data.servery[s];
    if (!ze) continue;
    const stavajici = nacti(s);
    const stazene = stavajici.ceny.filter((c) => c.zdroj !== "rucne");
    // Bez odkladu — jinak by zápis dalšího serveru zrušil ten předchozí.
    ulozIhned(s, ze.nastaveni ?? stavajici.nastaveni ?? {}, [...stazene, ...ze.rucniCeny]);
  }
}

/** Je v balíčku vůbec něco, co by stálo za řeč? */
export function jePrazdny(data: DataBalicku | null | undefined): boolean {
  if (!data) return true;
  if (data.dilna?.klice?.length) return false;
  if (data.presety?.length) return false;
  return !Object.values(data.servery ?? {}).some((s) => s && s.rucniCeny.length > 0);
}

/** Krátký lidský popis, aby uživatel při volbě věděl, o čem rozhoduje. */
export function popis(data: DataBalicku | null | undefined): string {
  if (jePrazdny(data)) return "prázdné";
  const d = data as DataBalicku;
  const casti: string[] = [];
  const polozek = d.dilna?.klice?.length ?? 0;
  if (polozek) casti.push(`${polozek} položek v dílně`);
  if (d.presety?.length) casti.push(`${d.presety.length} presetů`);
  const cen = Object.values(d.servery ?? {}).reduce((n, s) => n + (s?.rucniCeny.length ?? 0), 0);
  if (cen) casti.push(`${cen} ručních cen`);
  return casti.join(", ");
}
