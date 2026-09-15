import { useMemo } from "react";
import {
  shrnRetezec, spocitatRetezec, spocitatBonus,
  type Enchant, type HerniPolozka, type Lokace, type UzelRetezce,
} from "@albion/jadro";
import { HRA, polozka } from "../data/hra";
import type { SkladCen } from "../stav/skladCen";
import type { NastaveniSkenu } from "../stav/sken";
import { typProNakup } from "../stav/sken";
import { sazbaProPolozku } from "../stav/stanice";
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
    // Sazba té stanice, kde se vyrábí dané patro. Meč ve Warrior's Forge,
    // ingot pod ním v Tavírně — sazba vrcholu by ostatní patra zkreslila.
    sazbaStanice: (pol) => (p.nastaveni.sazbyStanic
      ? sazbaProPolozku(p.nastaveni.sazbyStanic, pol)
      : p.nastaveni.sazbaStanice),
    konstanty: HRA.konstanty,
  }), [p.polozka.zaklad, p.enchant, p.mesto, p.lokace, p.sklad, p.nastaveni, p.verzeCen]);

  const souhrn = useMemo(() => shrnRetezec(koren), [koren]);

  /** Existuje pro tenhle stupeň vůbec povýšení runou? U .0 a .4 ne. */
  const cestaEnchantu = p.polozka.vylepseni.find((v) => v.naEnchant === p.enchant);

  /**
   * Co brání spočítat enchantování.
   *
   * Cesta, která existuje, ale nemá cenu, se NESMÍ jen tiše vynechat —
   * uživatel by dostal doporučení „vyrobit", aniž by tušil, že třetí
   * možnost se vůbec nepočítala. Chybět může buď runa, nebo kus o stupeň
   * níž; když mají runy ceny, je na vině ten kus.
   */
  const chybiProEnchant = useMemo(() => {
    if (!cestaEnchantu || koren.nakladEnchantem !== null) return null;
    const typ = typProNakup(p.nastaveni.rezimNakupu);
    const bezCeny = cestaEnchantu.vstupy
      .filter((v) => p.sklad.ziskej(p.mesto, v.zaklad, v.enchant, typ) === undefined)
      .map((v) => p.nazevPolozky(v.zaklad, v.enchant));
    return bezCeny.length > 0
      ? bezCeny.join(", ")
      : p.nazevPolozky(p.polozka.zaklad, p.enchant - 1);
  }, [cestaEnchantu, koren, p.sklad, p.mesto, p.nastaveni.rezimNakupu, p.verzeCen]);

  if (koren.zpusob === "nedostupne") {
    return <p className="py-2 text-sm text-slate-500">Chybí ceny, nelze porovnat.</p>;
  }

  const dostupnychCest = [koren.cenaNaTrhu, koren.nakladVyrobou, koren.nakladEnchantem]
    .filter((x) => x !== null).length;

  return (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm">
          {koren.zpusob === "vyrobit" ? (
            <b className="text-emerald-600 dark:text-emerald-400">Vyplatí se vyrobit</b>
          ) : koren.zpusob === "enchantovat" ? (
            <b className="text-violet-600 dark:text-violet-400">Vyplatí se enchantovat</b>
          ) : (
            <b>Vyplatí se koupit</b>
          )}
          {dostupnychCest === 1 && (
            <span className="ml-1 text-xs text-slate-500">
              (není s čím porovnat — ostatní cesty nemají cenu)
            </span>
          )}
        </span>
        {koren.uspora !== null && koren.uspora > 0 ? (
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            ušetříš {procenta(koren.uspora, 0)}
          </span>
        ) : koren.usporaVyrobou !== null && koren.usporaVyrobou <= 0 ? (
          <span className="text-sm font-semibold text-slate-500">
            výroba je o {procenta(-koren.usporaVyrobou, 0)} dražší
          </span>
        ) : null}
      </div>

      {/* Třetí sloupec jen tam, kde povýšení runou vůbec existuje — u .0
          kusů a u surovin by to byl trvale prázdný sloupec. */}
      <div className={`mb-2 grid gap-x-4 text-sm ${cestaEnchantu
        ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
        <Udaj popis="Koupit za" hodnota={koren.cenaNaTrhu !== null
          ? cislo(koren.cenaNaTrhu) : "—"} />
        <Udaj popis="Vyrobit za" hodnota={koren.nakladVyrobou !== null
          ? cislo(koren.nakladVyrobou, 1) : "—"} />
        {cestaEnchantu && (
          <Udaj popis="Enchantovat za" hodnota={koren.nakladEnchantem !== null
            ? cislo(koren.nakladEnchantem, 1) : "—"} />
        )}
      </div>

      {chybiProEnchant && (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          Enchantování nejde spočítat — chybí cena: <b>{chybiProEnchant}</b>.
          Zkus obnovit ceny, nebo ji dopiš ručně výš.
        </p>
      )}

      <Vetev uzel={koren} nazevPolozky={p.nazevPolozky} uroven={0} pocet={null} />

      {(souhrn.krokuVyroby > 0 || souhrn.krokuEnchantu > 0) && (
        <p className="mt-2 text-xs text-slate-500">
          {/* Úspora v silveru není celá pravda — hluboká výroba stojí čas
              a focus na každém patře. Bez těch čísel by kalkulačka
              doporučovala výrobu, aniž by řekla, co to obnáší. */}
          {souhrn.krokuVyroby > 0 && (
            <>
              <b>{souhrn.krokuVyroby}</b>{" "}
              {souhrn.krokuVyroby === 1 ? "krok výroby"
                : souhrn.krokuVyroby < 5 ? "kroky výroby" : "kroků výroby"}
              {" "}· focus {cislo(souhrn.focusCelkem, 1)} na kus
            </>
          )}
          {souhrn.krokuEnchantu > 0 && (
            <>
              {souhrn.krokuVyroby > 0 && " · "}
              {/* Enchant se počítá zvlášť: taky ho musíš odklikat, ale focus
                  nestojí — slít to do „kroků výroby" by lhalo o obojím. */}
              <b>{souhrn.krokuEnchantu}</b>{" "}
              {souhrn.krokuEnchantu === 1 ? "krok enchantu" : "kroky enchantu"}
              {" "}(bez focusu)
            </>
          )}
          {souhrn.nejhlubsiUroven > 1 && ` · řetěz je ${souhrn.nejhlubsiUroven + 1} pater hluboko`}
          {" "}— úspora stojí čas a focus, ne jen silver.
        </p>
      )}
    </>
  );
}

/** Jedno patro řetězu. Rekurzivní, stejně jako výpočet. */
function Vetev({ uzel, nazevPolozky, uroven, pocet }: {
  uzel: UzelRetezce;
  nazevPolozky: (z: string, e: number) => string;
  uroven: number;
  /** Kolik kusů recept žádá na jeden kus výstupu. Null u vrcholu řetězu. */
  pocet: number | null;
}) {
  const nazev = nazevPolozky(uzel.zaklad, uzel.enchant);

  return (
    <div style={{ marginLeft: uroven * 14 }}>
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-100
                      py-0.5 text-sm dark:border-slate-800/60">
        <span>
          {uroven > 0 && <span className="text-slate-400">└ </span>}
          {nazev}
          {/* Počet je u enchantu zásadní údaj — 288 run na jeden kus je něco
              úplně jiného než 8 planěk, a z ceny to nepoznáš. */}
          {pocet !== null && pocet !== 1 && (
            <span className="ml-1 text-xs text-slate-400">
              {/* Celá čísla bez desetin: „× 8" se čte líp než „× 8,00".
                  Zlomky vzniknou u receptů, kde jedna dávka dá víc kusů. */}
              × {cislo(pocet, Number.isInteger(pocet) ? 0 : 2)}
            </span>
          )}
        </span>
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          {uzel.zpusob === "vyrobit" ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">vyrobit</span>
          ) : uzel.zpusob === "enchantovat" ? (
            <span className="text-xs text-violet-600 dark:text-violet-400">enchantovat</span>
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
               uzel={v.uzel} nazevPolozky={nazevPolozky} uroven={uroven + 1}
               pocet={v.pocetNaKus} />
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
