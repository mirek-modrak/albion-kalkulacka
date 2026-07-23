import type { DenHistorie } from "../stav/historie";
import { cislo } from "./format";

interface Props {
  dny: DenHistorie[];
  /** Popis pro čtečky i pro případ, že graf nedává smysl. */
  popis: string;
}

const SIRKA = 640;
const VYSKA = 180;
const OKRAJ = { nahore: 12, dole: 22, vlevo: 52, vpravo: 52 };

const PLOCHA_W = SIRKA - OKRAJ.vlevo - OKRAJ.vpravo;
const PLOCHA_H = VYSKA - OKRAJ.nahore - OKRAJ.dole;

/** Zkrácený zápis velkých čísel — na ose se 24 456 nevejde. */
function zkratka(n: number): string {
  if (n >= 1_000_000) return `${cislo(n / 1_000_000, 1)} M`;
  if (n >= 1_000) return `${cislo(n / 1_000, 0)} k`;
  return cislo(n, 0);
}

/**
 * Graf ceny a objemu v čase.
 *
 * Vlastní SVG, žádná knihovna — je to čára a pár sloupců, přidávat kvůli
 * tomu stovky kB by bylo nepoměrné.
 *
 * Dvě osy, protože cena a objem mají řádově jiný rozsah (naměřeno 15×).
 * V jednom měřítku by objem cenu úplně zploštil.
 */
export function GrafHistorie({ dny, popis }: Props) {
  const ceny = dny.map((d) => d.cena).filter((c): c is number => c !== null);
  const objemy = dny.map((d) => d.objem).filter((o): o is number => o !== null);

  if (ceny.length < 2) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center
                      text-sm text-slate-500 dark:border-slate-700">
        Pro tuhle položku nemá AODP dost historie.
      </div>
    );
  }

  const minC = Math.min(...ceny);
  const maxC = Math.max(...ceny);
  const rozsahC = maxC - minC || 1;
  const maxO = Math.max(...objemy, 1);

  const x = (i: number) => OKRAJ.vlevo + (i / Math.max(1, dny.length - 1)) * PLOCHA_W;
  const yCena = (c: number) => OKRAJ.nahore + (1 - (c - minC) / rozsahC) * PLOCHA_H;
  const yObjem = (o: number) => OKRAJ.nahore + (1 - o / maxO) * PLOCHA_H;

  /**
   * Čára rozdělená na úseky.
   *
   * Chybějící den čáru PŘERUŠÍ. Kdyby se body jen spojily, graf by mezi
   * sousedy nakreslil přímku a vypadalo by to, že data jsou úplná —
   * přitom tam ten den nikdo neobchodoval nebo to nikdo nenaskenoval.
   */
  const useky: string[] = [];
  let aktualni: string[] = [];
  dny.forEach((d, i) => {
    if (d.cena === null) {
      if (aktualni.length > 1) useky.push(aktualni.join(" "));
      aktualni = [];
      return;
    }
    aktualni.push(`${aktualni.length === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yCena(d.cena).toFixed(1)}`);
  });
  if (aktualni.length > 1) useky.push(aktualni.join(" "));

  const sirkaSloupce = Math.max(1.5, (PLOCHA_W / dny.length) * 0.6);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${SIRKA} ${VYSKA}`} className="w-full" role="img" aria-label={popis}>
        {/* Vodorovné vodicí čáry */}
        {[0, 0.5, 1].map((p) => (
          <line key={p}
                x1={OKRAJ.vlevo} x2={SIRKA - OKRAJ.vpravo}
                y1={OKRAJ.nahore + p * PLOCHA_H} y2={OKRAJ.nahore + p * PLOCHA_H}
                className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
        ))}

        {/* Objem — sloupce na pozadí, aby nepřekrývaly cenu */}
        {dny.map((d, i) => d.objem === null ? null : (
          <rect key={d.datum}
                x={x(i) - sirkaSloupce / 2}
                y={yObjem(d.objem)}
                width={sirkaSloupce}
                height={Math.max(0, OKRAJ.nahore + PLOCHA_H - yObjem(d.objem))}
                className="fill-slate-300/50 dark:fill-slate-600/40" />
        ))}

        {/* Cena — čára, přerušená v dírách */}
        {useky.map((d, i) => (
          <path key={i} d={d} fill="none" strokeWidth={2}
                className="stroke-blue-600 dark:stroke-blue-400" />
        ))}

        {/* Body, aby byly vidět i jednotlivé dny bez sousedů */}
        {dny.map((d, i) => d.cena === null ? null : (
          <circle key={d.datum} cx={x(i)} cy={yCena(d.cena)} r={1.8}
                  className="fill-blue-600 dark:fill-blue-400" />
        ))}

        {/* Popisky os */}
        <text x={OKRAJ.vlevo - 6} y={OKRAJ.nahore + 4} textAnchor="end"
              className="fill-blue-600 text-[10px] dark:fill-blue-400">{zkratka(maxC)}</text>
        <text x={OKRAJ.vlevo - 6} y={OKRAJ.nahore + PLOCHA_H} textAnchor="end"
              className="fill-blue-600 text-[10px] dark:fill-blue-400">{zkratka(minC)}</text>

        <text x={SIRKA - OKRAJ.vpravo + 6} y={OKRAJ.nahore + 4}
              className="fill-slate-400 text-[10px]">{zkratka(maxO)}</text>
        <text x={SIRKA - OKRAJ.vpravo + 6} y={OKRAJ.nahore + PLOCHA_H}
              className="fill-slate-400 text-[10px]">0</text>

        <text x={OKRAJ.vlevo} y={VYSKA - 6}
              className="fill-slate-400 text-[10px]">{dny[0]?.datum.slice(5)}</text>
        <text x={SIRKA - OKRAJ.vpravo} y={VYSKA - 6} textAnchor="end"
              className="fill-slate-400 text-[10px]">{dny.at(-1)?.datum.slice(5)}</text>
      </svg>

      <figcaption className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span className="text-blue-600 dark:text-blue-400">— průměrná cena obchodů</span>
        <span>▮ zobchodovaný objem</span>
      </figcaption>
    </figure>
  );
}
