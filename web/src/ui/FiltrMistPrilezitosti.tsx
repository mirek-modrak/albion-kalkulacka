/**
 * Lišta pro výběr měst a Black Marketu v Příležitostech.
 *
 * Odděleně od `FiltrDilny` — tady se nefiltruje zobrazení, ale samotný
 * výpočet: vyloučené město se přestane počítat jako kandidát na „nejlepší
 * místo", ne že by se jen schoval řádek, který na něm vyhrál.
 */

import { MESTA } from "../data/hra";
import type { FiltrMist } from "../stav/filtrMistPrilezitosti";
import { Prepinac, SkupinaZnacek, Znacka } from "./FiltrDilny";

interface Props {
  filtr: FiltrMist;
  setFiltr: (f: FiltrMist) => void;
}

export function FiltrMistPrilezitosti({ filtr, setFiltr }: Props) {
  const prepniMesto = (mesto: string) => {
    const vylouceneMesta = filtr.vylouceneMesta.includes(mesto)
      ? filtr.vylouceneMesta.filter((m) => m !== mesto)
      : [...filtr.vylouceneMesta, mesto];
    setFiltr({ ...filtr, vylouceneMesta });
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SkupinaZnacek popis="Počítat i s">
          {MESTA.map((m) => (
            <Znacka key={m.nazev} zapnuta={!filtr.vylouceneMesta.includes(m.nazev)}
                    onKlik={() => prepniMesto(m.nazev)}>
              {m.nazev}
            </Znacka>
          ))}
        </SkupinaZnacek>
        <Prepinac zapnuto={filtr.zahrnoutBM}
                  onZmena={(zahrnoutBM) => setFiltr({ ...filtr, zahrnoutBM })}>
          Black Market
        </Prepinac>
      </div>
      {filtr.vylouceneMesta.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Vyloučeno z výpočtu: {filtr.vylouceneMesta.join(", ")}.{" "}
          <button onClick={() => setFiltr({ ...filtr, vylouceneMesta: [] })} className="underline">
            zahrnout všechna města
          </button>
        </p>
      )}
    </div>
  );
}
