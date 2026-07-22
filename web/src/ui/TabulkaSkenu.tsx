import { hodnotaMetriky, type Metrika, type RadekSkenu } from "../stav/sken";
import { barvaStari, cislo, procenta, stari } from "./format";

interface Props {
  radky: RadekSkenu[];
  metrika: Metrika;
  celkem: number;
  otevritDetail: (radek: RadekSkenu) => void;
}

/** Barevný odznak stáří dat. Zastaralá cena vypadá stejně jako čerstvá — dokud se neoznačí. */
function OdznakStari({ hodin, maCenu }: { hodin: number | null; maCenu: boolean }) {
  // Bez ceny není co stárnout. Bez téhle větve by se řádky bez dat
  // tvářily, že mají ručně zadanou cenu — což je opak pravdy.
  if (!maCenu) return <span className="text-xs text-slate-400">—</span>;
  if (hodin === null) {
    return <span className="text-xs text-slate-400">ručně</span>;
  }
  return <span className={`text-xs ${barvaStari(hodin)}`}>{stari(hodin)}</span>;
}

function HodnotaMetriky({ radek, metrika }: { radek: RadekSkenu; metrika: Metrika }) {
  const v = radek.vysledek;
  if (!v) return <span className="text-slate-400">—</span>;
  const h = hodnotaMetriky(radek, metrika);
  const styl = h > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  const text = metrika === "marze" ? procenta(h) : cislo(h, metrika === "ziskNaFocus" ? 2 : 1);
  return <span className={`font-semibold ${styl}`}>{text}</span>;
}

export function TabulkaSkenu({ radky, metrika, celkem, otevritDetail }: Props) {
  if (celkem === 0) {
    return (
      <div className="rounded-xl border border-slate-200 p-8 text-center text-slate-500
                      dark:border-slate-800">
        Herní data se nenačetla.
      </div>
    );
  }

  if (radky.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 p-8 text-center dark:border-slate-800">
        <p className="font-medium">Žádný řádek neprošel filtrem</p>
        <p className="mt-1 text-sm text-slate-500">
          Zkus stáhnout ceny, povolit starší data nebo vypnout „jen ziskové“.
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
            <th className="px-3 py-2 text-right font-medium">Metrika</th>
            <th className="px-3 py-2 text-right font-medium">Zisk celkem</th>
            <th className="px-3 py-2 text-right font-medium">Marže</th>
            <th className="px-3 py-2 text-right font-medium">Zisk / kg</th>
            <th className="px-3 py-2 text-right font-medium">Návratnost</th>
            <th className="px-3 py-2 text-right font-medium">Stáří</th>
            <th className="px-3 py-2 text-left font-medium">Stav</th>
          </tr>
        </thead>
        <tbody>
          {radky.map((r) => (
            <tr key={`${r.polozka.zaklad}#${r.enchant}`}
                onClick={() => otevritDetail(r)}
                title="Zobrazit rozpad výpočtu a upravit ceny"
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50
                           dark:border-slate-800/60 dark:hover:bg-slate-800/40">
              <td className="px-3 py-1.5 whitespace-nowrap">{r.nazev}</td>
              <td className="px-3 py-1.5 text-right">
                <HodnotaMetriky radek={r} metrika={metrika} />
              </td>
              <td className="px-3 py-1.5 text-right">
                {r.vysledek ? cislo(r.vysledek.zisk) : "—"}
              </td>
              <td className="px-3 py-1.5 text-right">
                {r.vysledek ? procenta(r.vysledek.marze) : "—"}
              </td>
              <td className="px-3 py-1.5 text-right">
                {r.vysledek?.ziskNaKg != null ? cislo(r.vysledek.ziskNaKg, 1) : "—"}
              </td>
              <td className="px-3 py-1.5 text-right text-slate-500">
                {r.vysledek ? procenta(r.vysledek.bonus.returnRate) : "—"}
              </td>
              <td className="px-3 py-1.5 text-right">
                <OdznakStari hodin={r.stariHodin} maCenu={r.vysledek !== null} />
              </td>
              <td className="px-3 py-1.5">
                {r.stav === "podezrele" && (
                  <span className="text-xs text-amber-600 dark:text-amber-400"
                        title="Marže nad 300 % bývá chyba v datech nebo tenký orderbook, ne příležitost">
                    podezřelé
                  </span>
                )}
                {r.stav === "chybi-cena" && (
                  <span className="text-xs text-slate-400"
                        title={`Chybí: ${r.chybejici.join(", ")}`}>
                    chybí cena
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
