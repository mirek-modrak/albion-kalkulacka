import { hodnotaMetriky, type Metrika } from "../stav/sken";
import { naskokNadDruhym, type Prilezitost } from "../stav/napricMesty";
import { MESTA } from "../data/hra";
import { barvaStari, cislo, procenta, stari } from "./format";

interface Props {
  prilezitosti: Prilezitost[];
  metrika: Metrika;
  otevritDetail: (p: Prilezitost) => void;
}

function HodnotaMetriky({ p, metrika }: { p: Prilezitost; metrika: Metrika }) {
  const v = p.nejlepsi.radek.vysledek;
  if (!v) return <span className="text-slate-400">—</span>;
  const h = hodnotaMetriky(p.nejlepsi.radek, metrika);
  const styl = h > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  const text = metrika === "marze" ? procenta(h) : cislo(h, metrika === "ziskNaFocus" ? 2 : 1);
  return <span className={`font-semibold ${styl}`}>{text}</span>;
}

/**
 * Náskok nad druhým městem.
 * Bez něj nejde poznat, jestli je volba města zásadní, nebo skoro jedno.
 */
function Naskok({ p, metrika }: { p: Prilezitost; metrika: Metrika }) {
  const n = naskokNadDruhym(p, metrika);
  if (n === null) return <span className="text-xs text-slate-400">—</span>;

  const vyrazny = n > 0.2;
  return (
    <span className={`text-xs ${vyrazny ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`}
          title={p.druhe ? `Druhé nejlepší: ${p.druhe.mesto}` : undefined}>
      +{cislo(n * 100, 0)} %
    </span>
  );
}

/** V kolika městech se to podařilo spočítat. Málo měst = slabší jistota. */
function Pokryti({ p }: { p: Prilezitost }) {
  const celkem = MESTA.length;
  const styl = p.spocitanoMest === celkem
    ? "text-slate-400"
    : p.spocitanoMest >= 3
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
  return (
    <span className={`text-xs ${styl}`}
          title={p.spocitanoMest < celkem
            ? "Chybějící města mohla být lepší — AODP nemá data"
            : "Srovnáno ve všech městech"}>
      {p.spocitanoMest}/{celkem}
    </span>
  );
}

export function TabulkaPrilezitosti({ prilezitosti, metrika, otevritDetail }: Props) {
  if (prilezitosti.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 p-8 text-center dark:border-slate-800">
        <p className="font-medium">Zatím žádné příležitosti</p>
        <p className="mt-1 text-sm text-slate-500">
          Stáhni ceny — porovná se všech {MESTA.length} měst naráz.
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
            <th className="px-3 py-2 text-left font-medium">Nejlepší město</th>
            <th className="px-3 py-2 text-right font-medium">Metrika</th>
            <th className="px-2 py-2 text-right font-medium">Náskok</th>
            <th className="px-3 py-2 text-right font-medium">Zisk celkem</th>
            <th className="hidden px-2 py-2 text-right font-medium xl:table-cell">Návratnost</th>
            <th className="px-2 py-2 text-right font-medium">Města</th>
            <th className="px-2 py-2 text-right font-medium">Stáří</th>
            <th className="px-2 py-2 text-left font-medium">Stav</th>
          </tr>
        </thead>
        <tbody>
          {prilezitosti.map((p) => {
            const v = p.nejlepsi.radek.vysledek;
            return (
              <tr key={p.klic}
                  onClick={() => otevritDetail(p)}
                  title="Zobrazit rozpad a srovnání všech měst"
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50
                             dark:border-slate-800/60 dark:hover:bg-slate-800/40">
                <td className="px-3 py-1.5 whitespace-nowrap">{p.nazev}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {v ? p.nejlepsi.mesto : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <HodnotaMetriky p={p} metrika={metrika} />
                </td>
                <td className="px-2 py-1.5 text-right"><Naskok p={p} metrika={metrika} /></td>
                <td className="px-3 py-1.5 text-right">{v ? cislo(v.zisk) : "—"}</td>
                <td className="hidden px-2 py-1.5 text-right text-slate-500 xl:table-cell">
                  {v ? procenta(v.bonus.returnRate) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right"><Pokryti p={p} /></td>
                <td className="px-3 py-1.5 text-right">
                  {p.nejlepsi.radek.stariHodin !== null && v ? (
                    <span className={`text-xs ${barvaStari(p.nejlepsi.radek.stariHodin)}`}>
                      {stari(p.nejlepsi.radek.stariHodin)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {/* Bez tohohle by marži 688 % vedla tabulku bez varování —
                      a skener, který nahoře ukáže falešné zlaté doly,
                      ztratí důvěru v celek. */}
                  {p.nejlepsi.radek.stav === "podezrele" && (
                    <span className="text-xs text-amber-600 dark:text-amber-400"
                          title="Marže nad 300 % bývá chyba v datech nebo tenký orderbook, ne příležitost">
                      podezřelé
                    </span>
                  )}
                  {p.spocitanoMest > 0 && p.spocitanoMest < 3 && (
                    <span className="ml-1 text-xs text-slate-400"
                          title="Málo měst — srovnání je slabé">
                      málo dat
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
