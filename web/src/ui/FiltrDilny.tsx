/**
 * Lišta filtrů a řazení nad seznamem v Dílně.
 *
 * Společná pro oba pohledy (karty i tabulka) — kdyby ji každý měl vlastní,
 * porovnávaly by se dvě různě funkční Dílny, ne dva vzhledy.
 *
 * Počítadlo skrytých položek je tu schválně vidět vždy, když filtr něco
 * schovává: bez něj vypadá právě přidaná položka jako ztracená.
 */

import { SKUPINY } from "../data/kategorie";
import {
  RAZENI, VYCHOZI_FILTR, jeFiltrPrazdny, moznostiRazeni, vychoziSmer,
  type NastaveniFiltru, type Razeni,
} from "../stav/filtrDilny";

function nazevRazeni(id: Razeni): string {
  return RAZENI.find((r) => r.id === id)?.nazev ?? String(id);
}

interface Props {
  filtr: NastaveniFiltru;
  setFiltr: (f: NastaveniFiltru) => void;
  tiery: number[];
  enchanty: number[];
  skryto: number;
  zobrazeno: number;
  /** Řazení dostupná klikem na hlavičku — ta se v seznamu nenabízejí. */
  pokryteSloupci: Razeni[];
}

export function FiltrDilny(p: Props) {
  const zmen = (zmeny: Partial<NastaveniFiltru>) => p.setFiltr({ ...p.filtr, ...zmeny });

  const prepni = <T,>(pole: T[], hodnota: T): T[] =>
    pole.includes(hodnota) ? pole.filter((x) => x !== hodnota) : [...pole, hodnota];

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={p.filtr.hledani}
          onChange={(e) => zmen({ hledani: e.target.value })}
          placeholder="Hledat v dílně…"
          className="min-w-[10rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm
                     dark:border-slate-700 dark:bg-slate-950"
        />

        <label className="flex items-center gap-1 text-sm">
          <span className="text-slate-500">Seřadit</span>
          <select value={p.filtr.razeni}
                  onChange={(e) => {
                    // Směr se musí nastavit taky, jinak by „Název" řadil
                    // od Z do A — seznam i klik na hlavičku se musí chovat stejně.
                    const razeni = e.target.value as Razeni;
                    zmen({ razeni, smer: vychoziSmer(razeni) });
                  }}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm
                             dark:border-slate-700 dark:bg-slate-950">
            {/* Když se řadí klikem na hlavičku, musí to jít v seznamu vidět —
                jinak by ukazoval něco jiného, než co v tabulce platí. */}
            {p.pokryteSloupci.includes(p.filtr.razeni) && (
              <option value={p.filtr.razeni}>
                podle sloupce {nazevRazeni(p.filtr.razeni)}
              </option>
            )}
            {moznostiRazeni(p.pokryteSloupci).map((r) => (
              <option key={r.id} value={r.id}>{r.nazev}</option>
            ))}
          </select>
        </label>

        <Prepinac zapnuto={p.filtr.jenZiskove} onZmena={(x) => zmen({ jenZiskove: x })}>
          jen ziskové
        </Prepinac>
        <Prepinac zapnuto={p.filtr.skrytBezCeny} onZmena={(x) => zmen({ skrytBezCeny: x })}>
          skrýt bez ceny
        </Prepinac>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
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

        <SkupinaZnacek popis="Kategorie">
          {SKUPINY.map((s) => (
            <Znacka key={s.id} zapnuta={p.filtr.skupiny.includes(s.id)}
                    onKlik={() => zmen({ skupiny: prepni(p.filtr.skupiny, s.id) })}>
              {s.nazev}
            </Znacka>
          ))}
        </SkupinaZnacek>
      </div>

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

function Prepinac({ zapnuto, onZmena, children }: {
  zapnuto: boolean; onZmena: (x: boolean) => void; children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-1 text-sm">
      <input type="checkbox" checked={zapnuto} onChange={(e) => onZmena(e.target.checked)} />
      {children}
    </label>
  );
}

function SkupinaZnacek({ popis, children }: { popis: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-xs text-slate-500">{popis}</span>
      {children}
    </div>
  );
}

function Znacka({ zapnuta, onKlik, children }: {
  zapnuta: boolean; onKlik: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onKlik}
            className={`rounded px-1.5 py-0.5 text-xs ${zapnuta
              ? "bg-blue-600 font-semibold text-white"
              : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400"}`}>
      {children}
    </button>
  );
}
