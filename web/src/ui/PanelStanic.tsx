/**
 * Poplatky stanic.
 *
 * Sazbu si nastavuje **majitel stavby**, takže Tavírna a Mage's Tower mají
 * každá svou. Do F11 tu bylo jedno číslo pro celou aplikaci — přepsání
 * v Refiningu ho změnilo i v Dílně a hole platily sazbu kovárny.
 *
 * Zobrazuje se **jen to, co daná karta opravdu potřebuje**: devět políček
 * naráz je stěna, ve které nikdo nic nenajde. Refining ukáže svých pět
 * linek, Dílna jen stavby, do kterých ji její seznam posílá.
 */

import { useState } from "react";
import type { HerniPolozka } from "@albion/jadro";
import {
  STANICE, VYCHOZI_SAZBA, staniceProPolozky,
  type SazbyStanic, type Stanice,
} from "../stav/stanice";

interface Props {
  sazby: SazbyStanic;
  setSazby: (s: SazbyStanic) => void;
  /**
   * Položky, které se na kartě počítají. Podle nich se vybere, které
   * stanice nabídnout. Prázdné = nabídnou se všechny.
   */
  polozky?: (HerniPolozka | null | undefined)[];
  /** Zúžení na refining / crafting, když seznam položek ještě není. */
  jenRefining?: boolean;
}

export function PanelStanic(p: Props) {
  const [otevreno, setOtevreno] = useState(false);

  const relevantni: Stanice[] = p.polozky?.length
    ? staniceProPolozky(p.polozky)
    : p.jenRefining !== undefined
      ? STANICE.filter((s) => s.refining === p.jenRefining)
      : STANICE;

  if (relevantni.length === 0) return null;

  // Kolik z nich má vlastní hodnotu — ať je poznat, jestli se s tím
  // vůbec někdy hýbalo, bez nutnosti panel rozbalovat.
  const nastaveno = relevantni.filter((s) => typeof p.sazby[s.id] === "number").length;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button onClick={() => setOtevreno((x) => !x)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium">
        <span>
          Poplatky stanic
          <span className="ml-1 text-xs font-normal text-slate-500">
            {nastaveno === 0
              ? `· výchozích ${VYCHOZI_SAZBA}`
              : `· ${nastaveno} z ${relevantni.length} vlastních`}
          </span>
        </span>
        <span className="text-slate-400">{otevreno ? "▾" : "▸"}</span>
      </button>

      {otevreno && (
        <div className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800/60">
          <p className="text-xs text-slate-500">
            Silver za 100 nutrition — číslo, které vidíš na stanici. Sazbu
            nastavuje majitel stavby, takže se liší město od města.
          </p>

          {relevantni.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <label className="min-w-0 flex-1 text-sm">
                {s.nazev}
                <span className="block text-xs text-slate-500">{s.popis}</span>
              </label>
              <input
                type="number" min={0} step={10}
                value={p.sazby[s.id] ?? ""}
                placeholder={String(VYCHOZI_SAZBA)}
                onChange={(e) => {
                  const text = e.target.value;
                  const nove = { ...p.sazby };
                  // Prázdné pole = „použij výchozí", ne nula. Nula by
                  // znamenala stanici zdarma a tiše nadhodnotila zisk.
                  if (text === "") delete nove[s.id];
                  else nove[s.id] = Math.max(0, Number(text));
                  p.setSazby(nove);
                }}
                className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm
                           dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          ))}

          {nastaveno > 0 && (
            <button onClick={() => p.setSazby({})}
                    className="text-xs text-slate-500 underline">
              zpět na výchozí {VYCHOZI_SAZBA}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
