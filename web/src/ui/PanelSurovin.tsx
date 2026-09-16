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
  AUTO_MESTO, mestoProSuroviny, runyDilny, surovinyDilny, type StavDilny, type SurovinaDilny,
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
  // Runy, duše a relikvie zvlášť — mají jiný původ i jiné ceny a v jednom
  // seznamu se surovinami by se ztratily.
  const runy = runyDilny(stav);
  const mesto = mestoProSuroviny(stav);
  const auto = stav.konfig.mesto === AUTO_MESTO;

  if (suroviny.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button onClick={() => setOtevreno((x) => !x)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium">
        <span>
          Ceny surovin — {mesto} · {suroviny.length}
          {runy.length > 0 && ` · runy ${runy.length}`}
        </span>
        <span className="text-slate-400">{otevreno ? "▾" : "▸"}</span>
      </button>

      {otevreno && (
        <div className="border-t border-slate-100 p-3 dark:border-slate-800/60">
          <p className="mb-2 text-xs text-slate-500">
            Ruční hodnota má přednost a nový sken ji nepřepíše. Změna se promítne
            do všech itemů, které surovinu používají.
            {auto && " Pozn.: u nejlevnějšího se cena liší podle města — tady se edituje Caerleon."}
          </p>
          <Mrizka polozky={suroviny} mesto={mesto} typNakup={typNakup} sklad={sklad}
                  nazevPolozky={nazevPolozky} poZmeneCeny={poZmeneCeny} />

          {runy.length > 0 && (
            <>
              <h4 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500">
                Runy, duše, relikvie
              </h4>
              <p className="mb-2 text-xs text-slate-500">
                Pro enchant: vyrobený .0 kus → runy (.1) → duše (.2) → relikvie (.3).
              </p>
              <Mrizka polozky={runy} mesto={mesto} typNakup={typNakup} sklad={sklad}
                      nazevPolozky={nazevPolozky} poZmeneCeny={poZmeneCeny} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Mrizka({ polozky, mesto, typNakup, sklad, nazevPolozky, poZmeneCeny }: {
  polozky: SurovinaDilny[];
  mesto: string;
  typNakup: TypCeny;
  sklad: SkladCen;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  poZmeneCeny: () => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {polozky.map((s) => (
        <div key={`${s.zaklad}#${s.enchant}`}>
          <div className="mb-0.5 text-sm">{nazevPolozky(s.zaklad, s.enchant)}</div>
          {/* Stejné pole jako u surovin → ruční cena run se ukládá i synchronizuje
              stejně a nový sken ji nepřepíše. */}
          <PoleCeny mesto={mesto} zaklad={s.zaklad} enchant={s.enchant}
                    typ={typNakup} sklad={sklad} poZmene={poZmeneCeny} />
        </div>
      ))}
    </div>
  );
}
