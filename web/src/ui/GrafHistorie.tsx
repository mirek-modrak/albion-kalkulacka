import { useState } from "react";
import type { DenHistorie } from "../stav/historie";
import { cislo } from "./format";

interface Props {
  dny: DenHistorie[];
  /** Popis pro čtečky i pro případ, že graf nedává smysl. */
  popis: string;
  /**
   * Týdenní medián skutečných obchodů — pro odchylku v odečtu.
   *
   * Předává se ZVENČÍ, nepočítá se tady. Je to tentýž medián, jaký ukazuje
   * sekce „Skutečné obchody" o kus výš; kdyby si ho graf počítal sám,
   * dřív nebo později by se rozešly a uživatel by v jednom okně viděl
   * dvě různá čísla pro totéž.
   */
  medianTyden?: number | null;
}

/** „2026-07-19" → „19. 7." */
function denMesic(datum: string): string {
  const [, m, d] = datum.split("-");
  return `${Number(d)}. ${Number(m)}.`;
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
export function GrafHistorie({ dny, popis, medianTyden }: Props) {
  // Null = uživatel nikam neukazuje. Výchozí odečet je pak poslední den
  // s daty, ať pruh pod grafem nesvítí prázdnotou.
  const [vybrany, setVybrany] = useState<number | null>(null);

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

  // ── Odečet ────────────────────────────────────────────────
  //
  // Pruh POD grafem, ne bublina u kurzoru. Graf je v modálním okně a je
  // vysoký 180 bodů — bublina by u krajů vylézala ven a musela by se
  // překlápět. Pruh je pořád na stejném místě, nic nepřekrývá a funguje
  // stejně na dotyku, kde najetí myší neexistuje.
  const posledniSDaty = dny.reduce(
    (nalezeny, d, i) => (d.cena !== null ? i : nalezeny), -1,
  );
  const ukazovany = vybrany ?? (posledniSDaty >= 0 ? posledniSDaty : null);
  const den = ukazovany !== null ? dny[ukazovany] : undefined;

  /**
   * Index dne pod ukazatelem.
   *
   * Počítá se z polohy, ne z třiceti neviditelných obdélníků — tím pádem
   * se trefíš i mezi sloupce. Bod na čáře má poloměr necelé 2 body,
   * do toho by se myší strefoval málokdo.
   */
  function denPodUkazatelem(e: React.PointerEvent<SVGSVGElement>): number {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0) return 0;
    const vJednotkach = ((e.clientX - r.left) / r.width) * SIRKA;
    const podil = (vJednotkach - OKRAJ.vlevo) / PLOCHA_W;
    const i = Math.round(podil * Math.max(1, dny.length - 1));
    return Math.min(dny.length - 1, Math.max(0, i));
  }

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${SIRKA} ${VYSKA}`} className="w-full" role="img" aria-label={popis}
           // Myš scrubuje průběžně, dotyk vybírá ťuknutím. Kdyby se na dotyku
           // reagovalo i na tažení, nešlo by přes graf odscrollovat okno.
           onPointerMove={(e) => {
             if (e.pointerType === "mouse") setVybrany(denPodUkazatelem(e));
           }}
           onPointerDown={(e) => setVybrany(denPodUkazatelem(e))}
           onPointerLeave={() => setVybrany(null)}>
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

        {/* Zvolený den — svislá čára přes celý graf, ať je jasné,
            který sloupec se zrovna čte. Kreslí se AŽ TEĎ, aby vedla
            přes sloupce i čáru, ne pod nimi. */}
        {ukazovany !== null && (
          <>
            <line x1={x(ukazovany)} x2={x(ukazovany)}
                  y1={OKRAJ.nahore} y2={OKRAJ.nahore + PLOCHA_H}
                  className="stroke-slate-400/70 dark:stroke-slate-500/70"
                  strokeWidth={1} strokeDasharray="3 2" />
            {den?.cena !== null && den?.cena !== undefined && (
              <circle cx={x(ukazovany)} cy={yCena(den.cena)} r={4}
                      className="fill-blue-600 stroke-white dark:fill-blue-400
                                 dark:stroke-slate-900" strokeWidth={1.5} />
            )}
          </>
        )}

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

      <figcaption className="mt-1">
        {/* Odečet zvoleného dne */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md
                        bg-slate-100 px-2 py-1.5 text-sm dark:bg-slate-950">
          {den ? (
            <>
              <b className="tabular-nums">{denMesic(den.datum)}</b>
              {/* Chybějící den je „bez dat", NIKDY nula. Nula by tvrdila,
                  že se ten den neobchodovalo — a to nevíme, AODP je
                  crowdsourcované a den prostě nemusel nikdo naskenovat. */}
              <span>
                <span className="text-xs text-slate-500">cena </span>
                {den.cena !== null
                  ? <b className="tabular-nums text-blue-600 dark:text-blue-400">
                      {cislo(den.cena)}
                    </b>
                  : <span className="text-slate-400">bez dat</span>}
              </span>
              <span>
                <span className="text-xs text-slate-500">objem </span>
                {den.objem !== null
                  ? <b className="tabular-nums">{cislo(den.objem)} ks</b>
                  : <span className="text-slate-400">bez dat</span>}
              </span>
              <OdchylkaDne cena={den.cena} median={medianTyden ?? null} />
              {vybrany === null && (
                <span className="text-xs text-slate-400">poslední den s daty</span>
              )}
            </>
          ) : (
            <span className="text-slate-400">Najeď myší na graf</span>
          )}
        </div>

        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span className="text-blue-600 dark:text-blue-400">— průměrná cena obchodů</span>
          <span>▮ zobchodovaný objem</span>
        </div>
      </figcaption>
    </figure>
  );
}

/**
 * Odchylka dne od týdenního mediánu.
 *
 * Samotné číslo ceny neřekne, jestli je vysoké — proto tenhle údaj.
 * Do ±10 % je to normální kolísání a barví se šedě, ať odznak nekřičí
 * u každého dne.
 */
function OdchylkaDne({ cena, median }: { cena: number | null; median: number | null }) {
  if (cena === null || median === null || median <= 0) return null;

  const o = (cena - median) / median;
  const vyrazna = Math.abs(o) > 0.1;

  return (
    <span title="Proti mediánu skutečných obchodů za poslední týden"
          className={`text-xs ${vyrazna
            ? (o > 0 ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400")
            : "text-slate-500"}`}>
      {o >= 0 ? "+" : "−"}{cislo(Math.abs(o) * 100, 0)} % proti mediánu
    </span>
  );
}
