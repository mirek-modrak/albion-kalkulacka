/**
 * Lišta filtrů nad seznamem v Refiningu.
 *
 * Proti Dílně tu nejsou kategorie výbavy, ale **linky** (ruda, kůže,
 * vlákno, dřevo, kámen) a navíc dvě skupiny měst: kde se refinuje a kde
 * se prodává. Ty dávají smysl hlavně při automatickém výběru — teprve
 * tehdy se totiž řádky mezi městy rozpadnou a chce se v tom vybírat.
 *
 * Drobné prvky (přepínač, značka) se sdílejí s Dílnou, aby se filtry
 * obou karet po pár úpravách nezačaly lišit vzhledem.
 */

import { LINKY } from "../data/hra";
import {
  VYCHOZI_FILTR, jeFiltrPrazdny, type NastaveniFiltru,
} from "../stav/filtrDilny";
import { Prepinac, SkupinaZnacek, Znacka } from "./FiltrDilny";

/** Klíče filtrů navíc. Jedno místo pravdy pro lištu i pro vyhodnocení. */
export const FILTR_MESTO_REFININGU = "refining";
export const FILTR_MESTO_PRODEJE = "prodej";

interface Props {
  filtr: NastaveniFiltru;
  setFiltr: (f: NastaveniFiltru) => void;
  tiery: number[];
  enchanty: number[];
  /** Města, která se v seznamu opravdu vyskytují — ať nenabízíme prázdno. */
  mestaRefiningu: string[];
  mestaProdeje: string[];
  skryto: number;
  zobrazeno: number;
}

export function FiltrRefiningu(p: Props) {
  const zmen = (zmeny: Partial<NastaveniFiltru>) => p.setFiltr({ ...p.filtr, ...zmeny });

  const prepni = <T,>(pole: T[], hodnota: T): T[] =>
    pole.includes(hodnota) ? pole.filter((x) => x !== hodnota) : [...pole, hodnota];

  const extra = (klic: string) => p.filtr.extra?.[klic] ?? [];
  const prepniExtra = (klic: string, hodnota: string) => zmen({
    extra: { ...p.filtr.extra, [klic]: prepni(extra(klic), hodnota) },
  });

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={p.filtr.hledani}
          onChange={(e) => zmen({ hledani: e.target.value })}
          placeholder="Hledat mezi surovinami…"
          className="min-w-[10rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm
                     dark:border-slate-700 dark:bg-slate-950"
        />
        <Prepinac zapnuto={p.filtr.jenZiskove} onZmena={(x) => zmen({ jenZiskove: x })}>
          jen ziskové
        </Prepinac>
        <Prepinac zapnuto={p.filtr.skrytBezCeny} onZmena={(x) => zmen({ skrytBezCeny: x })}>
          skrýt bez ceny
        </Prepinac>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <SkupinaZnacek popis="Surovina">
          {LINKY.map((l) => (
            <Znacka key={l.kategorie} zapnuta={p.filtr.skupiny.includes(l.kategorie)}
                    onKlik={() => zmen({ skupiny: prepni(p.filtr.skupiny, l.kategorie) })}>
              {l.nazev}
            </Znacka>
          ))}
        </SkupinaZnacek>

        {p.tiery.length > 1 && (
          <SkupinaZnacek popis="Tier">
            {p.tiery.map((t) => (
              <Znacka key={t} zapnuta={p.filtr.tiery.includes(t)}
                      onKlik={() => zmen({ tiery: prepni(p.filtr.tiery, t) })}>
                T{t}
              </Znacka>
            ))}
          </SkupinaZnacek>
        )}

        {p.enchanty.length > 1 && (
          <SkupinaZnacek popis="Enchant">
            {p.enchanty.map((e) => (
              <Znacka key={e} zapnuta={p.filtr.enchanty.includes(e)}
                      onKlik={() => zmen({ enchanty: prepni(p.filtr.enchanty, e) })}>
                .{e}
              </Znacka>
            ))}
          </SkupinaZnacek>
        )}
      </div>

      {/* Města se nabízejí, jen když je z čeho vybírat. Při jednom
          nastaveném městě by to byl přepínač, který nic nezmění. */}
      {(p.mestaRefiningu.length > 1 || p.mestaProdeje.length > 1) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {p.mestaRefiningu.length > 1 && (
            <SkupinaZnacek popis="Refinuje se v">
              {p.mestaRefiningu.map((m) => (
                <Znacka key={m} zapnuta={extra(FILTR_MESTO_REFININGU).includes(m)}
                        onKlik={() => prepniExtra(FILTR_MESTO_REFININGU, m)}>
                  {m}
                </Znacka>
              ))}
            </SkupinaZnacek>
          )}
          {p.mestaProdeje.length > 1 && (
            <SkupinaZnacek popis="Prodává se v">
              {p.mestaProdeje.map((m) => (
                <Znacka key={m} zapnuta={extra(FILTR_MESTO_PRODEJE).includes(m)}
                        onKlik={() => prepniExtra(FILTR_MESTO_PRODEJE, m)}>
                  {m}
                </Znacka>
              ))}
            </SkupinaZnacek>
          )}
        </div>
      )}

      {p.skryto > 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Zobrazeno {p.zobrazeno} z {p.zobrazeno + p.skryto} položek — {p.skryto} schoval filtr.{" "}
          {/* Zrušit filtr = schovávání pryč, ale zvolené řazení i směr zůstávají. */}
          <button onClick={() => p.setFiltr({
                    ...VYCHOZI_FILTR, razeni: p.filtr.razeni, smer: p.filtr.smer,
                  })}
                  className="underline">
            zrušit filtr
          </button>
        </p>
      )}
      {p.skryto === 0 && !jeFiltrPrazdny(p.filtr) && (
        <p className="mt-2 text-xs text-slate-500">Filtr je zapnutý, ale nic neschovává.</p>
      )}
    </div>
  );
}
