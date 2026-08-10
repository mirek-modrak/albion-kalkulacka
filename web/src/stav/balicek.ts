/**
 * Balíček dat uživatele — co se synchronizuje mezi zařízeními.
 *
 * Prostředník mezi úložištěm v prohlížeči a [sync.ts](./sync.ts). Díky němu
 * adaptér neví nic o vnitřnostech aplikace a aplikace neví nic o Firebase.
 *
 * **Co se synchronizuje** (viz f9b-plan.md, f10-plan.md):
 * - dílna (seznam položek, konfigurace, přepisy) a presety — vlastní práce
 * - refining (seznam surovin, tři města, přepisy) a jeho presety — totéž
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
import {
  PRAZDNY_REFINING, nactiPresetyRefiningu, nactiRefining, ocistiStavRefiningu,
  ulozPresetyRefiningu, ulozRefining,
  type PresetRefiningu, type StavRefiningu,
} from "./refining";
import {
  nactiNastaveni, ocistiNastaveni, ulozNastaveni, type NastaveniAplikace,
} from "./nastaveni";
import { nacti, ulozIhned, type UlozenaCena } from "./uloziste";
import type { NastaveniSkenu } from "./sken";

/**
 * ZVÝŠIT při každé změně tvaru `DataBalicku`.
 *
 * Na rozdíl od úložiště v prohlížeči se serverová data při neshodě verzí
 * **nezahazují** — jsou to hodiny cizí práce. Starší tvar se převede,
 * novější tvar se odmítne číst (viz `PORAD_NOVEJSI`).
 *
 * Verze 2 (2026-08-10, F10): přibyl refining a jeho presety.
 * Verze 3 (2026-08-10, F11): přibylo nastavení na třech úrovních —
 * globální, per karta a poplatky stanic.
 *
 * **Provozní důsledek:** zařízení se starým buildem uvidí verzi 2, přes
 * `jePrilisNovy` ji vyhodnotí jako „novější, než umím", a přestane
 * zapisovat (číst bude dál). Je to správně — chrání to data před přepsáním
 * starším tvarem — ale projeví se to jako „mobil přestal ukládat", dokud
 * si nenačte novou verzi aplikace.
 */
export const VERZE_BALICKU = 3;

interface DataServeru {
  nastaveni?: Partial<NastaveniSkenu>;
  /**
   * Nastavení na třech úrovních (od verze 3).
   *
   * Patří k serveru stejně jako ceny: poplatky stanic na `west` nevypovídají
   * o stavbách na `europe`. Ve starším balíčku chybí — pak se odvodí
   * migrací ze `nastaveni` výš, takže se uživateli nic nezmění.
   */
  nastaveniAplikace?: NastaveniAplikace;
  rucniCeny: UlozenaCena[];
}

export interface DataBalicku {
  dilna: StavDilny;
  presety: Preset[];
  /** Od verze 2. Ve starším balíčku chybí — pak se bere prázdný. */
  refining: StavRefiningu;
  presetyRefiningu: PresetRefiningu[];
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
    // `nactiNastaveni` si poradí i s tím, že nové nastavení ještě neexistuje
    // — odvodí ho ze starého společného, takže se na druhém zařízení
    // neobjeví výchozí hodnoty místo těch nastavených.
    const nastaveniAplikace = nactiNastaveni(s);
    if (rucni.length > 0 || nastaveni) {
      servery[s] = { nastaveni, nastaveniAplikace, rucniCeny: rucni };
    }
  }
  return {
    dilna: nactiDilnu(), presety: nactiPresety(),
    refining: nactiRefining(), presetyRefiningu: nactiPresetyRefiningu(),
    servery,
  };
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

  // Balíček verze 1 refining nemá. Nesmí se z toho stát `undefined`
  // v úložišti — karta by pak nastartovala do prázdna a vypadalo by to,
  // že se seznam ztratil.
  ulozRefining(data.refining ? ocistiStavRefiningu(data.refining) : PRAZDNY_REFINING);
  ulozPresetyRefiningu(Array.isArray(data.presetyRefiningu) ? data.presetyRefiningu : []);

  for (const { id: s } of SERVERY) {
    const ze = data.servery[s];
    if (!ze) continue;
    const stavajici = nacti(s);
    const stazene = stavajici.ceny.filter((c) => c.zdroj !== "rucne");
    // Bez odkladu — jinak by zápis dalšího serveru zrušil ten předchozí.
    ulozIhned(s, ze.nastaveni ?? stavajici.nastaveni ?? {}, [...stazene, ...ze.rucniCeny]);

    // Balíček verze 1 a 2 tuhle část nemá. Nechat ji být je správně:
    // `nactiNastaveni` ji příště odvodí ze `nastaveni` výš, kdežto zápis
    // prázdné hodnoty by uživateli shodil poplatky stanic na výchozí.
    if (ze.nastaveniAplikace) ulozNastaveni(s, ocistiNastaveni(ze.nastaveniAplikace));
  }
}

/**
 * Je v balíčku vůbec něco, co by stálo za řeč?
 *
 * **Musí znát KAŽDOU část balíčku.** Podle téhle funkce se rozhoduje, jestli
 * se uživateli nabídne přepsat jeho data serverovými (a naopak). Kdyby na
 * refining zapomněla, hlásil by se balíček s padesáti surovinami jako
 * „prázdné" a dialog by nabídl zahodit hodiny práce.
 */
export function jePrazdny(data: DataBalicku | null | undefined): boolean {
  if (!data) return true;
  if (data.dilna?.klice?.length) return false;
  if (data.presety?.length) return false;
  if (data.refining?.klice?.length) return false;
  if (data.presetyRefiningu?.length) return false;
  return !Object.values(data.servery ?? {}).some((s) => s && s.rucniCeny.length > 0);
}

/** Krátký lidský popis, aby uživatel při volbě věděl, o čem rozhoduje. */
export function popis(data: DataBalicku | null | undefined): string {
  if (jePrazdny(data)) return "prázdné";
  const d = data as DataBalicku;
  const casti: string[] = [];
  const polozek = d.dilna?.klice?.length ?? 0;
  if (polozek) casti.push(`${polozek} položek v dílně`);
  const surovin = d.refining?.klice?.length ?? 0;
  if (surovin) casti.push(`${surovin} surovin v refiningu`);
  const presetu = (d.presety?.length ?? 0) + (d.presetyRefiningu?.length ?? 0);
  if (presetu) casti.push(`${presetu} presetů`);
  const cen = Object.values(d.servery ?? {}).reduce((n, s) => n + (s?.rucniCeny.length ?? 0), 0);
  if (cen) casti.push(`${cen} ručních cen`);
  return casti.join(", ");
}
