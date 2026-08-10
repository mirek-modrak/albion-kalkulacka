/**
 * Nastavení na třech úrovních.
 *
 * Do F11 byl v aplikaci **jeden objekt pro všechny karty**. Přepsání
 * poplatku stanice v Refiningu ho změnilo i v Dílně, a jedna sazba platila
 * pro Tavírnu i pro Mage's Tower. To není jen nepohodlí — poplatek si
 * nastavuje majitel stavby, takže jedno číslo je principiálně špatně.
 *
 * Osy jsou tři, ne jedna:
 *
 *   globální   server, premium, denní bonus     vlastnost účtu a herního dne
 *   per karta  počet kusů, focus, režimy        dávka u refiningu ≠ u craftingu
 *   per stanice poplatek                        devět staveb, každá svá sazba
 *
 * Rozdělit jen „per karta“ by nestačilo: i uvnitř Dílny se plátové brnění
 * a hole vyrábějí v jiných budovách.
 *
 * **Server tu není** — drží se zvlášť v [predvolby.ts](./predvolby.ts),
 * protože podle něj se vybírá, která uložená data se vůbec načtou.
 */

import type { RezimCeny } from "./sken";
import type { Server } from "../data/aodp";
import { nacti } from "./uloziste";
import { ocistiSazby, vsemStanicim, type SazbyStanic } from "./stanice";

/** Karty, které mají vlastní nastavení. */
export type KartaId = "prilezitosti" | "mesto" | "prevoz" | "dilna" | "refining";

export const KARTY: KartaId[] = ["prilezitosti", "mesto", "prevoz", "dilna", "refining"];

/**
 * Vlastnost účtu a herního dne, ne činnosti.
 *
 * Premium platí pro celý účet a denní bonus vyhlašuje server všem stejně —
 * nedávalo by smysl mít je v Dílně jinak než v Refiningu.
 */
export interface NastaveniGlobalni {
  premium: boolean;
  /** 0, 10 (silver day) nebo 20 (gold day). */
  denniBonus: number;
  /**
   * Města, která **automatický výběr nesmí navrhnout**.
   *
   * Karta počítá se silverem, ne s tím, jestli se tam vůbec dostaneš.
   * Caerleon leží v černé zóně a Brecilien v Roads of Avalon, takže
   * v nejlepších prodejích vycházejí často — a přitom tam náklad
   * nemusí dojet. Precedent: `JE_RISKANTNI` v [prevoz.ts](./prevoz.ts).
   *
   * **Netýká se ručního výběru.** Kdo si vědomě nastaví „prodávám
   * v Caerleonu", tomu se to spočítá; tenhle seznam znamená „nenabízej
   * mi to sám", ne „zakaž to".
   *
   * Ukládá se seznam ZAKÁZANÝCH, ne povolených: prázdné pole pak
   * jednoznačně znamená „nic nevynechávej" a město přidané v budoucnu
   * se automaticky nabídne. Kdyby se ukládala povolená, nové město
   * by se nikdy neobjevilo — stejný důvod jako u vypnutých sloupců.
   */
  zakazanaMesta: string[];
}

/**
 * Města, do kterých se dá dojet po královském kontinentu.
 *
 * V herních datech příznak není, takže je to seznam tady. Caerleon
 * je černá zóna uprostřed mapy, Brecilien leží v Roads of Avalon —
 * ani jedno není „jen tak dojet".
 */
export const MIMO_KRALOVSKY_KONTINENT = ["Caerleon", "Brecilien"];

/**
 * Co se liší kartu od karty.
 *
 * Dávka: u refiningu se počítá po stovkách ingotů, u craftingu po kusech.
 * Focus: je ho denně omezeně, takže „pálím focus“ je volba pro konkrétní
 * činnost, ne trvalý stav.
 */
export interface NastaveniKarty {
  pocetVyrobku: number;
  focus: boolean;
  rezimNakupu: RezimCeny;
  rezimProdeje: RezimCeny;
}

export interface NastaveniAplikace {
  globalni: NastaveniGlobalni;
  karty: Record<KartaId, NastaveniKarty>;
  sazby: SazbyStanic;
}

export const VYCHOZI_GLOBALNI: NastaveniGlobalni = {
  premium: true,
  denniBonus: 0,
  // Nic nevynecháváme, dokud si uživatel neřekne — vyloučit město za něj
  // by znamenalo tiše schovat příležitosti, o kterých neví.
  zakazanaMesta: [],
};

/**
 * Města, ze kterých smí automatický výběr vybírat.
 *
 * **Jediné místo, kde se pravidlo vyhodnocuje.** Kdyby si ho UI opsalo,
 * uživatel by odškrtl město a v tabulce by ho dál viděl.
 */
export function povolenaMesta(globalni: NastaveniGlobalni, vsechna: string[]): string[] {
  const zakazana = new Set(globalni.zakazanaMesta ?? []);
  return vsechna.filter((m) => !zakazana.has(m));
}

export const VYCHOZI_KARTA: NastaveniKarty = {
  pocetVyrobku: 100,
  focus: false,
  rezimNakupu: "instant",
  rezimProdeje: "order",
};

export function vychoziNastaveni(): NastaveniAplikace {
  const karty = {} as Record<KartaId, NastaveniKarty>;
  for (const k of KARTY) karty[k] = { ...VYCHOZI_KARTA };
  return { globalni: { ...VYCHOZI_GLOBALNI }, karty, sazby: {} };
}

// ── Čtení a očištění ───────────────────────────────────────────

function cislo(x: unknown, vychozi: number): number {
  return typeof x === "number" && Number.isFinite(x) ? x : vychozi;
}

function rezim(x: unknown, vychozi: RezimCeny): RezimCeny {
  return x === "instant" || x === "order" ? x : vychozi;
}

function ocistiKartu(x: unknown): NastaveniKarty {
  const o = (x ?? {}) as Partial<NastaveniKarty>;
  return {
    // Nula nebo záporný počet by dělil nulou v přepočtech na kus.
    pocetVyrobku: Math.max(1, Math.round(cislo(o.pocetVyrobku, VYCHOZI_KARTA.pocetVyrobku))),
    focus: typeof o.focus === "boolean" ? o.focus : VYCHOZI_KARTA.focus,
    rezimNakupu: rezim(o.rezimNakupu, VYCHOZI_KARTA.rezimNakupu),
    rezimProdeje: rezim(o.rezimProdeje, VYCHOZI_KARTA.rezimProdeje),
  };
}

export function ocistiNastaveni(x: unknown): NastaveniAplikace {
  const d = (x ?? {}) as Partial<NastaveniAplikace>;
  const g = (d.globalni ?? {}) as Partial<NastaveniGlobalni>;

  const karty = {} as Record<KartaId, NastaveniKarty>;
  for (const k of KARTY) karty[k] = ocistiKartu(d.karty?.[k]);

  return {
    globalni: {
      premium: typeof g.premium === "boolean" ? g.premium : VYCHOZI_GLOBALNI.premium,
      denniBonus: cislo(g.denniBonus, VYCHOZI_GLOBALNI.denniBonus),
      zakazanaMesta: Array.isArray(g.zakazanaMesta)
        ? g.zakazanaMesta.filter((x): x is string => typeof x === "string")
        : [],
    },
    karty,
    sazby: ocistiSazby(d.sazby),
  };
}

// ── Migrace ze společného nastavení ────────────────────────────

/**
 * Převede staré společné nastavení na tři úrovně.
 *
 * **Po aktualizaci musí vyjít stejná čísla**, dokud uživatel sám něco
 * nezmění. Proto se stará hodnota rozkopíruje do VŠECH karet a do VŠECH
 * stanic — kdyby se místo toho použily výchozí hodnoty, uživateli by se
 * tiše změnil poplatek i velikost dávky a vypadalo by to, že aplikace
 * začala počítat jinak.
 */
export function zeSpolecneho(stare: {
  premium?: boolean;
  denniBonus?: number;
  pocetVyrobku?: number;
  focus?: boolean;
  rezimNakupu?: RezimCeny;
  rezimProdeje?: RezimCeny;
  sazbaStanice?: number;
}): NastaveniAplikace {
  const karta = ocistiKartu({
    pocetVyrobku: stare.pocetVyrobku,
    focus: stare.focus,
    rezimNakupu: stare.rezimNakupu,
    rezimProdeje: stare.rezimProdeje,
  });

  const karty = {} as Record<KartaId, NastaveniKarty>;
  for (const k of KARTY) karty[k] = { ...karta };

  return {
    globalni: {
      premium: typeof stare.premium === "boolean" ? stare.premium : VYCHOZI_GLOBALNI.premium,
      denniBonus: cislo(stare.denniBonus, VYCHOZI_GLOBALNI.denniBonus),
      // Staré nastavení města nevylučovalo — po migraci se nesmí nic
      // schovat, jinak by se uživateli tiše změnila doporučení.
      zakazanaMesta: [],
    },
    karty,
    sazby: typeof stare.sazbaStanice === "number" && Number.isFinite(stare.sazbaStanice)
      ? vsemStanicim(stare.sazbaStanice)
      : {},
  };
}

// ── Uložení ────────────────────────────────────────────────────
//
// Zvlášť pro každý herní server, stejně jako ceny a nastavení skenu:
// kdo hraje na dvou serverech, má tam jinou ekonomiku i jiné stanice.

const KLIC = (server: Server) => `albion:nastaveni:v1:${server}`;

/**
 * Načte nastavení pro server. Když ještě neexistuje, převede se staré
 * společné nastavení, aby uživatel nepřišel o hodnoty, které si nastavil.
 */
export function nactiNastaveni(server: Server): NastaveniAplikace {
  try {
    const s = localStorage.getItem(KLIC(server));
    if (s) return ocistiNastaveni(JSON.parse(s));
  } catch {
    // Poškozený obsah — projde se migrací níž, případně skončí na výchozím.
  }
  try {
    // Migrace: staré společné nastavení leží v úložišti skenu.
    const stare = nacti(server).nastaveni;
    if (stare) return zeSpolecneho(stare);
  } catch {
    // Nevadí — aplikace musí nastartovat i s prázdným nastavením.
  }
  return vychoziNastaveni();
}

export function ulozNastaveni(server: Server, n: NastaveniAplikace): void {
  try {
    localStorage.setItem(KLIC(server), JSON.stringify(n));
  } catch {
    // Nevadí — nastavení je pohodlí, ne nutnost.
  }
}
