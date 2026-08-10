/**
 * Panel cen surovin pro Refining — hromadná ruční editace.
 *
 * **Klíčový rozdíl proti Dílně:** když je nákup nastavený na „nejlevněji",
 * panel se nezobrazí a místo něj je hláška. Dílna v takové situaci edituje
 * Caerleon jako referenční město, jenže u refiningu se nakupuje v každém
 * městě jiná surovina — políčko by tvrdilo „tohle je cena, se kterou se
 * počítá", a nebyla by to pravda. Radši nenabídnout nic než nabídnout
 * ovladač, který píše jinam, než se čte.
 */

import { useState } from "react";
import type { TypCeny } from "@albion/jadro";
import type { SkladCen } from "../stav/skladCen";
import {
  jeAutoNakup, kombinaceZKlicuRefiningu, type StavRefiningu,
} from "../stav/refining";
import { PoleCeny } from "./PoleCeny";

/** Sjednocení všech vstupních surovin napříč seznamem. */
function surovinyRefiningu(stav: StavRefiningu): { zaklad: string; enchant: number }[] {
  const mapa = new Map<string, { zaklad: string; enchant: number }>();
  for (const komb of kombinaceZKlicuRefiningu(stav.klice)) {
    const v = komb.polozka.varianty.find(
      (x) => x.enchant === komb.enchant && !x.sFactionTokenem,
    );
    for (const vst of v?.vstupy ?? []) {
      mapa.set(`${vst.zaklad}#${vst.enchant}`, { zaklad: vst.zaklad, enchant: vst.enchant });
    }
  }
  return [...mapa.values()];
}

export function PanelSurovinRefiningu({ stav, sklad, typNakup, nazevPolozky, poZmeneCeny }: {
  stav: StavRefiningu;
  sklad: SkladCen;
  typNakup: TypCeny;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  poZmeneCeny: () => void;
}) {
  const [otevreno, setOtevreno] = useState(false);
  const suroviny = surovinyRefiningu(stav);
  if (suroviny.length === 0) return null;

  if (jeAutoNakup(stav.konfig)) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs
                    text-slate-500 dark:border-slate-700">
        Ceny surovin se berou z nejlevnějšího města, takže je nejde přepsat
        na jednom místě. Pro ruční zadání přepni <b>„Kupuju v"</b> na konkrétní
        město — nebo cenu přepiš u položky v detailu.
      </p>
    );
  }

  const mesto = stav.konfig.nakup;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button onClick={() => setOtevreno((x) => !x)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium">
        <span>Ceny surovin — {mesto} · {suroviny.length}</span>
        <span className="text-slate-400">{otevreno ? "▾" : "▸"}</span>
      </button>

      {otevreno && (
        <div className="border-t border-slate-100 p-3 dark:border-slate-800/60">
          <p className="mb-2 text-xs text-slate-500">
            Ruční hodnota má přednost a nový sken ji nepřepíše. Změna se promítne
            do všech surovin, které ji používají jako vstup.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {suroviny.map((s) => (
              <div key={`${s.zaklad}#${s.enchant}`}>
                <div className="mb-0.5 text-sm">{nazevPolozky(s.zaklad, s.enchant)}</div>
                <PoleCeny mesto={mesto} zaklad={s.zaklad} enchant={s.enchant}
                          typ={typNakup} sklad={sklad} poZmene={poZmeneCeny} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
