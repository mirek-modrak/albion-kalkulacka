/**
 * Tabulkový pohled na Dílnu — alternativa ke kartám (F9d).
 *
 * Karty jsou přehlednější při ladění jednotlivých položek, tabulka při
 * čtení desítek řádků naráz. Který pohled je lepší, se nedá odhadnout od
 * stolu — proto tu jsou oba a horší se po vyzkoušení smaže.
 *
 * Rozklikávací řádek úmyslně nabízí **totéž co karta** (volba města a
 * místa prodeje pro jednu položku). Bez toho by tabulka uměla míň
 * a porovnání by bylo nefér.
 */

import { Fragment, useState } from "react";
import { AUTO_MESTO, konfigProKlic, type KonfigDilny, type StavDilny, type VysledekDilny } from "../stav/dilna";
import { barvaHodnoty, barvaStari, cislo, procenta, seZnamenkem, stari } from "./format";
import { OdznakLikvidity, ZnackaFantomu } from "./OdznakLikvidity";
import { NastaveniPolozky, popisKonfigu } from "./TabDilna";

interface Props {
  vysledky: VysledekDilny[];
  stav: StavDilny;
  davka: number;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  odebrat: (klic: string) => void;
  setOverride: (klic: string, konfig: KonfigDilny | null) => void;
  otevritDetail: (klic: string) => void;
}

export function TabulkaDilny(p: Props) {
  const [rozbaleny, setRozbaleny] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr className="border-b border-slate-200 dark:border-slate-800">
            <th className="px-3 py-2">Položka</th>
            <th className="px-3 py-2">Kde → kam</th>
            <th className="px-3 py-2 text-right">Zisk / {cislo(p.davka)} ks</th>
            <th className="px-3 py-2 text-right">Marže</th>
            <th className="px-3 py-2 text-right">Náklad / ks</th>
            <th className="px-3 py-2 text-right">Tržba / ks</th>
            <th className="px-3 py-2">Likvidita</th>
            <th className="px-3 py-2 text-right">Stáří</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {p.vysledky.map((v) => {
            const [zaklad, e] = v.klic.split("#");
            const nazev = v.radek?.nazev ?? p.nazevPolozky(zaklad ?? "", Number(e ?? 0));
            const vyp = v.radek?.vysledek ?? null;
            const efektivni = konfigProKlic(p.stav, v.klic);
            const override = p.stav.override[v.klic];
            const jeRozbaleny = rozbaleny === v.klic;
            const kdeKam = efektivni.mesto === AUTO_MESTO
              ? `${v.mesto} → ${efektivni.naBM ? "BM" : "místní"}`
              : popisKonfigu(efektivni);

            return (
              // Klíč patří na fragment, ne na vnitřní `tr` — řádek s detailem
              // je druhý potomek téhož prvku seznamu.
              <Fragment key={v.klic}>
                <tr
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50
                               dark:border-slate-800/60 dark:hover:bg-slate-900/40">
                  <td className="px-3 py-2">
                    <button onClick={() => p.otevritDetail(v.klic)}
                            className="text-left font-medium hover:underline">
                      {nazev}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => setRozbaleny(jeRozbaleny ? null : v.klic)}
                            title="Změnit nastavení jen pro tuhle položku"
                            className={`text-xs ${override
                              ? "font-semibold text-amber-600 dark:text-amber-400"
                              : "text-slate-500"}`}>
                      🔧 {kdeKam} {jeRozbaleny ? "▾" : "▸"}
                    </button>
                  </td>

                  {vyp ? (
                    <>
                      <td className={`px-3 py-2 text-right font-semibold ${barvaHodnoty(vyp.zisk)}`}>
                        {seZnamenkem(vyp.zisk)}
                      </td>
                      <td className={`px-3 py-2 text-right ${barvaHodnoty(vyp.zisk)}`}>
                        {procenta(vyp.marze)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {cislo(vyp.nakladyCelkem / Math.max(1, p.davka), 0)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {cislo(vyp.trzbaHruba / Math.max(1, p.davka), 0)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1">
                          <OdznakLikvidity likvidita={v.radek?.likvidita ?? null} davka={p.davka} />
                          <ZnackaFantomu likvidita={v.radek?.likvidita ?? null} />
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-right text-xs ${
                        v.radek?.stariHodin != null ? barvaStari(v.radek.stariHodin) : ""}`}>
                        {v.radek?.stariHodin != null ? stari(v.radek.stariHodin) : "—"}
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-3 py-2 text-xs text-slate-500">
                      {v.radek?.chybejici?.length
                        ? `Chybí cena: ${v.radek.chybejici.join(", ")}`
                        : "Zatím bez ceny — stáhni ceny nebo doplň ručně."}
                    </td>
                  )}

                  <td className="px-3 py-2 text-right">
                    <button onClick={() => p.odebrat(v.klic)} title="Odebrat ze seznamu"
                            className="rounded px-1.5 text-slate-400 hover:bg-slate-100
                                       dark:hover:bg-slate-800">✕</button>
                  </td>
                </tr>

                {jeRozbaleny && (
                  <tr className="border-b border-slate-100 dark:border-slate-800/60">
                    <td colSpan={9} className="bg-slate-50 px-3 py-2 dark:bg-slate-950/60">
                      <NastaveniPolozky
                        efektivni={efektivni} globalni={p.stav.konfig} override={override}
                        setOverride={(k) => p.setOverride(v.klic, k)} />
                      {v.radek?.stav === "podezrele" && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          podezřelá marže
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
