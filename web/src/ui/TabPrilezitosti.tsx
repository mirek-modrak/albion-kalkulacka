/**
 * Příležitosti — vlastní filtrovací lišta, samostatná na ostatních kartách.
 *
 * Na rozdíl od Dílny a Refiningu, kde „kam jsem ochoten jezdit" žije ve
 * sdíleném nastavení (F13) a mění výrobu na obou kartách naráz, tahle karta
 * má svůj vlastní výběr měst a Black Marketu — vyloučení Brecilienu tady
 * neovlivní Dílnu ani Refining.
 *
 * Tier/Enchant/Kategorie a hledání jsou stejná lišta jako v Dílně
 * (`FiltrDilny`) — jde o filtrování už spočítaného seznamu, ne o výběr měst.
 */

import { useMemo, useState } from "react";
import { skupinaProKategorii } from "../data/kategorie";
import type { Metrika } from "../stav/sken";
import {
  dostupneEnchanty, dostupneTiery, filtrujARad, nactiFiltr, ulozFiltr,
  type NastaveniFiltru,
} from "../stav/filtrDilny";
import type { FiltrMist } from "../stav/filtrMistPrilezitosti";
import type { Prilezitost } from "../stav/napricMesty";
import { FiltrDilny } from "./FiltrDilny";
import { FiltrMistPrilezitosti } from "./FiltrMistPrilezitosti";
import { TabulkaPrilezitosti } from "./TabulkaPrilezitosti";

const KLIC_FILTRU_PRILEZITOSTI = "albion:filtr-prilezitosti:v1";

interface Props {
  prilezitosti: Prilezitost[];
  /** Kolik řádků prošlo filtrem stáří/zisku v App, než se seznam ořízl na strop. */
  celkemPredOrezem: number;
  metrika: Metrika;
  davka: number;
  mistaFiltr: FiltrMist;
  setMistaFiltr: (f: FiltrMist) => void;
  otevritDetail: (p: Prilezitost) => void;
}

export function TabPrilezitosti(p: Props) {
  const [filtr, setFiltr] = useState(() => nactiFiltr(KLIC_FILTRU_PRILEZITOSTI));
  const zmenFiltr = (f: NastaveniFiltru) => {
    setFiltr(f);
    ulozFiltr(f, KLIC_FILTRU_PRILEZITOSTI);
  };

  // `filtrujARad` chce `radek` přímo na položce — Příležitost ho má
  // schovaný pod `nejlepsi`, proto tenhle drobný adaptér.
  const proFiltr = useMemo(
    () => p.prilezitosti.map((pr) => ({ ...pr, radek: pr.nejlepsi.radek })),
    [p.prilezitosti],
  );

  const { zobrazene, skryto } = useMemo(
    // Řadit podle metriky zvolené v postranním panelu, ne podle vlastního
    // „razeni" filtru — tahle tabulka nemá klikací záhlaví jako Dílna,
    // takže by uložené řazení tiše přebilo volbu metriky.
    () => filtrujARad(proFiltr, { ...filtr, razeni: p.metrika, smer: "sestupne" }, {
      nazev: (v) => v.nazev,
      skupina: (v) => skupinaProKategorii(v.radek?.polozka?.kategorie),
    }),
    [proFiltr, filtr, p.metrika],
  );

  return (
    <div className="space-y-3">
      <FiltrMistPrilezitosti filtr={p.mistaFiltr} setFiltr={p.setMistaFiltr} />

      <FiltrDilny filtr={filtr} setFiltr={zmenFiltr}
                  tiery={dostupneTiery(proFiltr)}
                  enchanty={dostupneEnchanty(proFiltr)}
                  skryto={skryto} zobrazeno={zobrazene.length} />

      {zobrazene.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center
                        text-sm text-slate-500 dark:border-slate-700">
          Filtru neodpovídá žádná položka.
        </div>
      ) : (
        <TabulkaPrilezitosti
          prilezitosti={zobrazene}
          celkemPredOrezem={p.celkemPredOrezem}
          metrika={p.metrika}
          davka={p.davka}
          otevritDetail={p.otevritDetail}
        />
      )}
    </div>
  );
}
