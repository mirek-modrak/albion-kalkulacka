import { useMemo } from "react";
import {
  shrnRetezec, spocitatRetezec, spocitatBonus,
  type Enchant, type HerniPolozka, type Lokace, type UzelRetezce,
} from "@albion/jadro";
import { HRA, polozka } from "../data/hra";
import type { SkladCen } from "../stav/skladCen";
import type { NastaveniSkenu } from "../stav/sken";
import { typProNakup } from "../stav/sken";
import { cislo, procenta } from "./format";

interface Props {
  polozka: HerniPolozka;
  enchant: Enchant;
  mesto: string;
  lokace: Lokace | undefined;
  sklad: SkladCen;
  nastaveni: NastaveniSkenu;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  /**
   * Čítač změn cen.
   *
   * Sklad je PROMĚNLIVÝ objekt — jeho odkaz se úpravou ceny nemění,
   * takže by React změnu uvnitř nezaznamenal a řetěz by zůstal na starých
   * číslech. Bez tohohle čítače by uživatel opravil cenu a viděl,
   * že se sken přepočítal, ale řetěz ne.
   */
  verzeCen: number;
}

export function SekceRetezec(p: Props) {
  const koren = useMemo(() => spocitatRetezec(p.polozka.zaklad, p.enchant, {
    najdiPolozku: polozka,
    cena: (zaklad, enchant) =>
      p.sklad.ziskej(p.mesto, zaklad, enchant, typProNakup(p.nastaveni.rezimNakupu))
        ?.hodnota ?? null,
    // Bonus se počítá pro KAŽDOU položku zvlášť — v Thetfordu má ruda +40,
    // ale dřevo nic. U řetězu z různých surovin se return rate mění.
    bonusProPolozku: (pol) => spocitatBonus(
      { mesto: p.mesto, focus: p.nastaveni.focus, denniBonus: p.nastaveni.denniBonus },
      p.lokace, pol.druh === "surovina", pol.kategorie, HRA.konstanty.bonusFocus,
    ).bonusCelkem,
    sazbaStanice: p.nastaveni.sazbaStanice,
    konstanty: HRA.konstanty,
  }), [p.polozka.zaklad, p.enchant, p.mesto, p.lokace, p.sklad, p.nastaveni, p.verzeCen]);

  const souhrn = useMemo(() => shrnRetezec(koren), [koren]);

  if (koren.zpusob === "nedostupne") {
    return <p className="py-2 text-sm text-slate-500">Chybí ceny, nelze porovnat.</p>;
  }

  const jenJednaCesta = koren.cenaNaTrhu === null || koren.nakladVyrobou === null;

  return (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm">
          {koren.zpusob === "vyrobit" ? (
            <b className="text-emerald-600 dark:text-emerald-400">Vyplatí se vyrobit</b>
          ) : (
            <b>Vyplatí se koupit</b>
          )}
          {jenJednaCesta && (
            <span className="ml-1 text-xs text-slate-500">
              (druhá možnost není — chybí cena)
            </span>
          )}
        </span>
        {koren.usporaVyrobou !== null && (
          <span className={`text-sm font-semibold ${koren.usporaVyrobou > 0
            ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}>
            {koren.usporaVyrobou > 0
              ? `ušetříš ${procenta(koren.usporaVyrobou, 0)}`
              : `výroba je o ${procenta(-koren.usporaVyrobou, 0)} dražší`}
          </span>
        )}
      </div>

      <div className="mb-2 grid grid-cols-2 gap-x-4 text-sm">
        <Udaj popis="Koupit za" hodnota={koren.cenaNaTrhu !== null
          ? cislo(koren.cenaNaTrhu) : "—"} />
        <Udaj popis="Vyrobit za" hodnota={koren.nakladVyrobou !== null
          ? cislo(koren.nakladVyrobou, 1) : "—"} />
      </div>

      <Vetev uzel={koren} nazevPolozky={p.nazevPolozky} uroven={0} />

      {souhrn.krokuVyroby > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {/* Úspora v silveru není celá pravda — hluboká výroba stojí čas
              a focus na každém patře. Bez těch čísel by kalkulačka
              doporučovala výrobu, aniž by řekla, co to obnáší. */}
          <b>{souhrn.krokuVyroby}</b>{" "}
          {souhrn.krokuVyroby === 1 ? "krok výroby" : souhrn.krokuVyroby < 5 ? "kroky výroby" : "kroků výroby"}
          {" "}· focus {cislo(souhrn.focusCelkem, 1)} na kus
          {souhrn.nejhlubsiUroven > 1 && ` · řetěz je ${souhrn.nejhlubsiUroven + 1} pater hluboko`}
          {" "}— úspora stojí čas a focus, ne jen silver.
        </p>
      )}
    </>
  );
}

/** Jedno patro řetězu. Rekurzivní, stejně jako výpočet. */
function Vetev({ uzel, nazevPolozky, uroven }: {
  uzel: UzelRetezce; nazevPolozky: (z: string, e: number) => string; uroven: number;
}) {
  const nazev = nazevPolozky(uzel.zaklad, uzel.enchant);

  return (
    <div style={{ marginLeft: uroven * 14 }}>
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-100
                      py-0.5 text-sm dark:border-slate-800/60">
        <span>
          {uroven > 0 && <span className="text-slate-400">└ </span>}
          {nazev}
        </span>
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          {uzel.zpusob === "vyrobit" ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">vyrobit</span>
          ) : uzel.zpusob === "koupit" ? (
            <span className="text-xs text-slate-500">koupit</span>
          ) : (
            <span className="text-xs text-red-600 dark:text-red-400">nedostupné</span>
          )}
          <span className="text-slate-500">
            {uzel.naklad !== null ? cislo(uzel.naklad, 1) : "—"}
          </span>
        </span>
      </div>

      {uzel.vstupy.map((v) => (
        <Vetev key={`${v.uzel.zaklad}#${v.uzel.enchant}`}
               uzel={v.uzel} nazevPolozky={nazevPolozky} uroven={uroven + 1} />
      ))}
    </div>
  );
}

function Udaj({ popis, hodnota }: { popis: string; hodnota: string }) {
  return (
    <div>
      <span className="text-xs text-slate-500">{popis}: </span>
      <span className="font-semibold">{hodnota}</span>
    </div>
  );
}
