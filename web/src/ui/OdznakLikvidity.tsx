/**
 * Odznak likvidity — odpovídá na otázku „koupí to ode mě vůbec někdo?"
 *
 * Order book říká jen za kolik někdo NABÍZÍ. Naměřeno 2026-07-23: T6 Main
 * Sword má v Caerleonu nabídku 89 999 a za 30 dní tam neproběhl jediný
 * obchod. Bez tohohle sloupce takový řádek vypadá jako příležitost.
 *
 * **Formulace jsou schválně opatrné.** AODP je crowdsourcované — chybějící
 * den znamená „nikdo tam nestál s datovým klientem", ne „neobchodovalo se".
 * Odznak proto tvrdí něco o DATECH („0 obchodů za 30 d"), ne o trhu
 * („tady se neobchoduje"). Naměřeno, že T5 Main Sword má v okně 7 dní ve
 * všech královských městech nulu, ale ve 30 dnech má Lymhurst 23 dní dat.
 */

import type { Likvidita } from "../stav/skladHistorie";
import { stariDnu } from "../stav/skladHistorie";
import { cislo, procenta } from "./format";

/** Kusů za týden — pod tisíc přesně, výš zkráceně, ať sloupec neroste. */
function kusy(n: number): string {
  return n >= 10_000 ? `${cislo(Math.round(n / 1000))} tis.` : cislo(n);
}

export function OdznakLikvidity({ likvidita, davka }: {
  likvidita: Likvidita | null;
  /** Kolik kusů chce uživatel vyrobit — kvůli textu nápovědy. */
  davka: number;
}) {
  // Historie se vůbec netáhla. NESMÍ se tvářit jako „žádné obchody" —
  // to by bylo tvrzení o něčem, na co jsme se nikdy nezeptali.
  if (!likvidita) {
    return (
      <span className="text-xs text-slate-300 dark:text-slate-600"
            title="Historie obchodů se ještě nestahovala. Spusť sken.">
        ·
      </span>
    );
  }

  const { stav, souhrn } = likvidita;
  const stariPosledniho = stariDnu(souhrn.posledniDen);

  if (stav === "bez-dat") {
    return (
      <span className="text-xs text-red-600 dark:text-red-400"
            title={"Za 30 dní tu AODP nezaznamenalo jediný obchod. "
                 + "Nabídka v order booku může být cena, za kterou nikdo nekoupí. "
                 + "Pozor: AODP je crowdsourcované — nula může znamenat i to, "
                 + "že to město nikdo neskenoval."}>
        0 obchodů / 30 d
      </span>
    );
  }

  if (stav === "zastarala") {
    return (
      <span className="text-xs text-amber-600 dark:text-amber-400"
            title={`Poslední zaznamenaný obchod před ${stariPosledniho} dny. `
                 + `Za 30 dní se tu prodalo ${cislo(souhrn.objemOkno ?? 0)} kusů, `
                 + "takže trh existuje — jen ho poslední týden nikdo neskenoval."}>
        naposled {stariPosledniho} d
      </span>
    );
  }

  const objem = souhrn.objemDen ?? 0;

  if (stav === "tenky") {
    return (
      <span className="text-xs text-amber-600 dark:text-amber-400"
            title={`Denně se prodá ${cislo(objem)} kusů, ale chceš vyrobit `
                 + `${cislo(davka)}. Tolik jich trh naráz nemusí vzít — a při `
                 + `prodeji pod cenu marže zmizí. Za celý týden ${cislo(souhrn.objemTyden ?? 0)} ks.`}>
        {kusy(objem)} ks/den
      </span>
    );
  }

  return (
    <span className="text-xs text-slate-500"
          title={`Denně se prodá ${cislo(objem)} kusů — na dávku ${cislo(davka)} `
               + `je trh dost hluboký. Za celý týden ${cislo(souhrn.objemTyden ?? 0)} ks.`}>
      {kusy(objem)} ks/den
    </span>
  );
}

/**
 * Značka fantomové nabídky.
 *
 * Nezávislá na stavu likvidity — nastat může i na živém trhu. Znamená,
 * že cena, se kterou sken počítá tržbu, je nad VŠÍM, co se za 30 dní
 * reálně prodalo.
 */
export function ZnackaFantomu({ likvidita }: { likvidita: Likvidita | null }) {
  if (!likvidita?.fantomovyListing) return null;

  const max = likvidita.souhrn.maxOkno;
  return (
    <span className="text-xs text-amber-600 dark:text-amber-400"
          title={"Cena, se kterou se počítá tržba, je víc než dvojnásobek "
               + `nejvyšší denní ceny skutečných obchodů (${cislo(max ?? 0)}). `
               + "Nejspíš je to nabídka, kterou nikdo nepřijme."}>
      nereálná cena
    </span>
  );
}

/**
 * Odchylka aktuální ceny od týdenního mediánu — do detailu.
 *
 * Užitečná v OBOU směrech. Naměřeno: T5 Cape na Black Marketu má buy_max
 * 4 108, ale medián skutečných obchodů 8 753 — tam aplikace položku
 * naopak podhodnocuje na polovinu.
 */
export function OdchylkaOdMedianu({ likvidita }: { likvidita: Likvidita | null }) {
  const o = likvidita?.odchylkaOdMedianu;
  if (o == null) return <span className="text-slate-400">—</span>;

  // Do ±15 % je to normální rozpětí order booku, ne signál.
  const vyrazna = Math.abs(o) > 0.15;
  const styl = !vyrazna
    ? "text-slate-500"
    : o > 0
      ? "text-amber-600 dark:text-amber-400"
      : "text-blue-600 dark:text-blue-400";

  return (
    <span className={styl}
          title={o > 0
            ? "Počítaná cena je nad tím, za co se reálně obchoduje."
            : "Počítaná cena je pod tím, za co se reálně obchoduje — "
              + "výpočet může položku podhodnocovat."}>
      {o > 0 ? "+" : ""}{procenta(o, 0)}
    </span>
  );
}
