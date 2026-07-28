/**
 * Panel cen surovin — hromadná ruční editace.
 *
 * Sesbírá suroviny, které tvé itemy potřebují, a nechá tě je přepsat na
 * jednom místě (třeba po návštěvě caerleonské tržnice). Změna se hned
 * promítne do všech karet. Ceny se drží ve stejném skladu jako sken, takže
 * ruční hodnota přebíjí API a nový sken ji nepřepíše.
 */

import { useState } from "react";
import type { TypCeny } from "@albion/jadro";
import type { SkladCen } from "../stav/skladCen";
import {
  AUTO_MESTO, mestoProSuroviny, surovinyDilny, type StavDilny,
} from "../stav/dilna";
import { PoleCeny } from "./PoleCeny";

export function PanelSurovin({ stav, sklad, typNakup, nazevPolozky, poZmeneCeny }: {
  stav: StavDilny;
  sklad: SkladCen;
  typNakup: TypCeny;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  poZmeneCeny: () => void;
}) {
  const [otevreno, setOtevreno] = useState(false);
  const suroviny = surovinyDilny(stav);
  const mesto = mestoProSuroviny(stav);
  const auto = stav.konfig.mesto === AUTO_MESTO;

  if (suroviny.length === 0) return null;

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
            do všech itemů, které surovinu používají.
            {auto && " Pozn.: u nejlevnějšího se cena liší podle města — tady se edituje Caerleon."}
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
