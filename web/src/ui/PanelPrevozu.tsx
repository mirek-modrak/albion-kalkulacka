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
          Seřadit podle
          <select className={`mt-0.5 block ${stylPole}`} value={p.metrika}
                  onChange={(e) => p.setMetrika(e.target.value as MetrikaPrevozu)}>
            {METRIKY_PREVOZU.map((m) => (
              <option key={m.id} value={m.id}>{m.nazev}{m.popis && ` — ${m.popis}`}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Riziko NEDÁVÁME v přednastavených stupních s nálepkami typu
          „bezpečná / riziková trasa“ — to bychom předstírali, že ho umíme
          odhadnout. Neumíme: zkušený hráč má na téže trase jiné riziko
          než nováček. Volný posuvník, ať si s tím pohraje sám. */}
      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Kolik zásilek podle tebe nedojede
            <input type="range" min={0} max={100} step={1}
                   value={Math.round(p.nastaveni.ztrataZasilek * 100)}
                   onChange={(e) => uprav("ztrataZasilek", Number(e.target.value) / 100)}
                   className="w-48" />
          </label>
          <input type="number" min={0} max={100} step={1}
                 value={Math.round(p.nastaveni.ztrataZasilek * 100)}
                 onChange={(e) => uprav("ztrataZasilek",
                   Math.min(100, Math.max(0, Number(e.target.value))) / 100)}
                 className={`w-16 ${stylPole}`} />
          <span className="text-xs text-slate-500">%</span>

          {p.nastaveni.ztrataZasilek > 0 && (
            <span className="text-xs text-slate-500">
              → z {cislo(100)} zásilek dojede{" "}
              <b>{cislo(100 * (1 - p.nastaveni.ztrataZasilek))}</b>
            </span>
          )}
        </div>

        <p className="mt-1.5 text-xs text-slate-500">
          Riziko trasy <b>není v herních datech</b> a my ho odhadnout neumíme —
          zkušený hráč má na téže cestě jiné riziko než nováček. Posuň si to
          a uvidíš, jak se pořadí mění. Ztráta se odečítá z tržby, ne z nákladů:
          co nedojede, to jsi zaplatil a neprodáš.
        </p>
      </div>

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
