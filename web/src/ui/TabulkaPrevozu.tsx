import {
  hodnotaMetrikyPrevozu, type MetrikaPrevozu, type RadekPrevozu,
} from "../stav/prevoz";
import { barvaStari, cislo, procenta, stari } from "./format";

interface Props {
  radky: RadekPrevozu[];
  metrika: MetrikaPrevozu;
  vychoziMesto: string;
}

function Hodnota({ r, metrika }: { r: RadekPrevozu; metrika: MetrikaPrevozu }) {
  if (!r.vysledek) return <span className="text-slate-400">—</span>;
  const h = hodnotaMetrikyPrevozu(r, metrika);
  const styl = h > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <span className={`font-semibold ${styl}`}>
      {metrika === "marze" ? procenta(h) : cislo(h, metrika === "ziskNaKg" ? 1 : 0)}
    </span>
  );
}

export function TabulkaPrevozu({ radky, metrika, vychoziMesto }: Props) {
  if (radky.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 p-8 text-center dark:border-slate-800">
        <p className="font-medium">Zatím žádné trasy</p>
        <p className="mt-1 text-sm text-slate-500">
          Stáhni ceny — porovnají se všechna cílová města z {vychoziMesto}.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Položka</th>
            <th className="px-3 py-2 text-left font-medium">Kam</th>
            <th className="px-3 py-2 text-right font-medium">Metrika</th>
            <th className="px-2 py-2 text-right font-medium">Zisk / kg</th>
            <th className="px-2 py-2 text-right font-medium">Kusů na mount</th>
            <th className="px-2 py-2 text-right font-medium">Za cestu</th>
            <th className="hidden px-2 py-2 text-right font-medium xl:table-cell">Marže</th>
            <th className="px-2 py-2 text-right font-medium">Stáří</th>
            <th className="px-2 py-2 text-left font-medium">Stav</th>
          </tr>
        </thead>
        <tbody>
          {radky.map((r) => {
            const v = r.vysledek;
            return (
              <tr key={r.klic}
                  className="border-t border-slate-100 dark:border-slate-800/60">
                <td className="px-3 py-1.5 whitespace-nowrap">{r.nazev}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{r.cilovéMesto}</td>
                <td className="px-3 py-1.5 text-right"><Hodnota r={r} metrika={metrika} /></td>
                <td className="px-2 py-1.5 text-right">
                  {v?.ziskNaKg != null ? cislo(v.ziskNaKg, 1) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right text-slate-500">
                  {r.kusuNaCestu > 0 ? cislo(r.kusuNaCestu) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {r.ziskZaCestu !== null ? cislo(r.ziskZaCestu) : "—"}
                </td>
                <td className="hidden px-2 py-1.5 text-right text-slate-500 xl:table-cell">
                  {v ? procenta(v.marze) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {r.stariHodin !== null && v ? (
                    <span className={`text-xs ${barvaStari(r.stariHodin)}`}>
                      {stari(r.stariHodin)}
                    </span>
                  ) : <span className="text-xs text-slate-400">—</span>}
                </td>
                <td className="px-2 py-1.5">
                  {/* Caerleon leží v černé zóně — nejlepší ceny, největší riziko.
                      Bez označení by kalkulačka stavěla nejrizikovější trasy
                      nahoru, protože počítá jen ceny. */}
                  {r.riskantni && v && (
                    <span className="text-xs text-amber-600 dark:text-amber-400"
                          title="Trasa přes Caerleon vede černou zónou — náklad můžeš ztratit">
                      riziko
                    </span>
                  )}
                  {!v && <span className="text-xs text-slate-400">chybí cena</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
