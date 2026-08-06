/**
 * Nabídka „Sloupce" — co má být v tabulce Dílny vidět.
 *
 * Název položky a tlačítko na odebrání se nenabízejí: bez názvu jsou řádky
 * k nerozeznání a uživatel by se z toho nedostal.
 */

import { SLOUPCE, type SloupecId } from "../stav/sloupceDilny";

export function VolbaSloupcu({ skryte, prepni }: {
  skryte: SloupecId[];
  prepni: (id: SloupecId) => void;
}) {
  const zapnuto = SLOUPCE.length - skryte.length;

  return (
    <details className="rounded-xl border border-slate-200 dark:border-slate-800">
      <summary className="cursor-pointer px-3 py-2 text-sm">
        Sloupce <span className="text-slate-500">· {zapnuto} z {SLOUPCE.length}</span>
      </summary>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 p-3
                      dark:border-slate-800/60">
        {SLOUPCE.map((s) => (
          <label key={s.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1"
                   checked={!skryte.includes(s.id)}
                   onChange={() => prepni(s.id)} />
            <span>
              {s.nazev}
              {s.popis && <span className="block text-xs text-slate-500">{s.popis}</span>}
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}
