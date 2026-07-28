/**
 * Dialog při stažení cen v dílně — co s ručně zadanými cenami.
 *
 * Ruční ceny se běžně při skenu chrání. Když ale chceš u některých místo
 * své hodnoty zase čerstvou z API, vybereš je tu. Tři cesty jedním kliknutím:
 * přepsat vše, nechat vše, nebo vybrat. Vybrané se před skenem zruší, takže
 * je AODP naplní znovu; nevybrané zůstanou ruční.
 */

import { useState } from "react";
import type { UlozenaCena } from "../stav/uloziste";

const POPIS_TYPU: Record<string, string> = {
  sell_min: "nákup", buy_max: "prodej",
};

export function RefreshDialog({ manualy, nazevPolozky, potvrdit, zrusit }: {
  manualy: UlozenaCena[];
  nazevPolozky: (zaklad: string, enchant: number) => string;
  /** Klíče cen, které se mají zrušit (aktualizovat z API), pak spustit sken. */
  potvrdit: (kAktualizaci: UlozenaCena[]) => void;
  zrusit: () => void;
}) {
  const klic = (c: UlozenaCena) => `${c.mesto}|${c.zaklad}#${c.enchant}|${c.typ}`;
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());

  const prepni = (k: string) => {
    const n = new Set(vybrane);
    if (n.has(k)) n.delete(k); else n.add(k);
    setVybrane(n);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto
                    bg-black/50 p-4 sm:p-8" onClick={zrusit}>
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl
                      dark:border-slate-800 dark:bg-slate-900"
           onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-bold">Máš {manualy.length} ručně zadaných cen</h2>
        <p className="mb-3 text-sm text-slate-500">
          Které chceš při stažení aktualizovat z API? Nevybrané zůstanou tvoje.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={() => potvrdit(manualy)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">
            Přepsat vše z API
          </button>
          <button onClick={() => potvrdit([])}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm
                             dark:border-slate-700">
            Nechat všechny ruční
          </button>
          <button onClick={() => potvrdit(manualy.filter((c) => vybrane.has(klic(c))))}
                  disabled={vybrane.size === 0}
                  className="rounded-md border border-blue-500 px-3 py-1.5 text-sm text-blue-600
                             disabled:opacity-40 dark:text-blue-400">
            Aktualizovat vybrané ({vybrane.size})
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200
                        dark:border-slate-800">
          {manualy.map((c) => {
            const k = klic(c);
            return (
              <label key={k}
                     className="flex cursor-pointer items-center gap-2 border-b border-slate-100
                                px-3 py-1.5 text-sm last:border-0 dark:border-slate-800/60">
                <input type="checkbox" checked={vybrane.has(k)} onChange={() => prepni(k)} />
                <span className="truncate">
                  {nazevPolozky(c.zaklad, c.enchant)}
                  <span className="text-slate-400">
                    {" "}· {c.mesto} · {POPIS_TYPU[c.typ] ?? c.typ}
                  </span>
                </span>
                <span className="ml-auto whitespace-nowrap tabular-nums">{c.hodnota}</span>
              </label>
            );
          })}
        </div>

        <div className="mt-3 text-right">
          <button onClick={zrusit} className="text-sm text-slate-500 underline">zrušit</button>
        </div>
      </div>
    </div>
  );
}
