import { MESTA } from "../data/hra";
import { MOUNTY } from "../data/mounty";
import { METRIKY_PREVOZU, type MetrikaPrevozu } from "../stav/prevoz";
import { cislo, procenta } from "./format";

interface NastaveniPrevozu {
  vychoziMesto: string;
  nosnostKg: number;
  ztrataZasilek: number;
}

interface Props {
  nastaveni: NastaveniPrevozu;
  setNastaveni: (n: NastaveniPrevozu) => void;
  metrika: MetrikaPrevozu;
  setMetrika: (m: MetrikaPrevozu) => void;
  souhrn: {
    celkem: number; spocitano: number; ziskove: number;
    riskantni: number; podleCilu: { mesto: string; pocet: number }[];
  };
}

const stylPole =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm " +
  "dark:border-slate-700 dark:bg-slate-950";

export function PanelPrevozu(p: Props) {
  const uprav = <K extends keyof NastaveniPrevozu>(klic: K, hodnota: NastaveniPrevozu[K]) =>
    p.setNastaveni({ ...p.nastaveni, [klic]: hodnota });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800
                    dark:bg-slate-900">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">
          Nakupuju v
          <select className={`mt-0.5 block ${stylPole}`} value={p.nastaveni.vychoziMesto}
                  onChange={(e) => uprav("vychoziMesto", e.target.value)}>
            {MESTA.map((m) => <option key={m.nazev} value={m.nazev}>{m.nazev}</option>)}
          </select>
        </label>

        <label className="text-xs text-slate-500">
          Mount
          <select className={`mt-0.5 block ${stylPole}`} value={p.nastaveni.nosnostKg}
                  onChange={(e) => uprav("nosnostKg", Number(e.target.value))}>
            {MOUNTY.map((m) => (
              <option key={m.nazev} value={m.kg}>
                {m.nazev} — {cislo(m.kg)} kg{m.overit ? " (?)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-500">
          Očekávaná ztráta zásilek
          <select className={`mt-0.5 block ${stylPole}`}
                  value={p.nastaveni.ztrataZasilek}
                  onChange={(e) => uprav("ztrataZasilek", Number(e.target.value))}>
            <option value={0}>0 % — bezpečná trasa</option>
            <option value={0.05}>5 %</option>
            <option value={0.15}>15 %</option>
            <option value={0.3}>30 % — riziková trasa</option>
            <option value={0.5}>50 %</option>
          </select>
        </label>

        <label className="text-xs text-slate-500">
          Seřadit podle
          <select className={`mt-0.5 block ${stylPole}`} value={p.metrika}
                  onChange={(e) => p.setMetrika(e.target.value as MetrikaPrevozu)}>
            {METRIKY_PREVOZU.map((m) => (
              <option key={m.id} value={m.id}>{m.nazev}{m.popis && ` — ${m.popis}`}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {/* Riziko cesty NENÍ v herních datech — je to odhad podle trasy.
            Bez něj by kalkulačka stavěla nejrizikovější trasy nahoru. */}
        Ztráta zásilek se odečítá z tržby, ne z nákladů — co ztratíš, to jsi
        zaplatil a neprodáš. Riziko není v herních datech, je to tvůj odhad.
      </p>

      {p.souhrn.spocitano > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
          <b>{p.souhrn.ziskove}</b> ziskových tras z {p.souhrn.spocitano} spočítaných
          {p.souhrn.riskantni > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {" "}· {p.souhrn.riskantni} přes Caerleon (riziko)
            </span>
          )}
          {p.souhrn.podleCilu.length > 0 && (
            <div className="mt-0.5 text-slate-500">
              Nejčastější cíl:{" "}
              {p.souhrn.podleCilu.slice(0, 3).map((c) => `${c.mesto} (${c.pocet}×)`).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
