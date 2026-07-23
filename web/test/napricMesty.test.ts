/**
 * Srovnání příležitostí napříč městy.
 *
 * Nejdůležitější vlastnost: bonus závisí na kombinaci města A položky.
 * Thetford dává +0,40 na rudu, ale nic na dřevo. Kdyby se to spletlo,
 * výsledky by vypadaly věrohodně a byly by špatně.
 */

import { describe, expect, it } from "vitest";
import {
  spocitatNapricMesty, naskokNadDruhym, souhrnPrilezitosti, mistaProSrovnani,
} from "../src/stav/napricMesty";
import { SkladCen } from "../src/stav/skladCen";
import { HRA, MESTA } from "../src/data/hra";
import { SUROVINY_ID } from "../src/data/kategorie";
import { potrebnaIds, type NastaveniSkenu } from "../src/stav/sken";
import { zAodpId } from "@albion/jadro";

const NASTAVENI: NastaveniSkenu = {
  mesto: "Thetford", focus: false, denniBonus: 0, premium: true,
  sazbaStanice: 200, pocetVyrobku: 100,
  rezimNakupu: "instant", rezimProdeje: "order",
  skupina: SUROVINY_ID, kategorie: [], mistoProdeje: "mesto",
};

const nazev = (z: string, e: number) => `${z}${e > 0 ? `.${e}` : ""}`;

/**
 * Naplní sklad stejnými cenami ve všech městech.
 *
 * Ceny se plní podle `potrebnaIds`, ne podle seznamu položek.
 *
 * Důvod, na který jsem při psaní narazil: raw suroviny T2 a T3 (`T2_ORE`,
 * `T3_WOOD`…) NEJSOU v `HRA.polozky`, protože nemají recept — sbírají se.
 * Sken jejich ceny přesto potřebuje. Naplnit sklad z `polozky` tedy nestačí.
 */
function skladSeStejnymiCenami(cena = 100): SkladCen {
  const s = new SkladCen();
  for (const m of MESTA) {
    for (const id of potrebnaIds(SUROVINY_ID)) {
      const { zaklad, enchant } = zAodpId(id);
      s.ulozRucne(m.nazev, zaklad, enchant, "sell_min", cena);
      s.ulozRucne(m.nazev, zaklad, enchant, "buy_max", cena);
    }
  }
  return s;
}

describe("bonus závisí na městě I na položce", () => {
  const p = spocitatNapricMesty(
    NASTAVENI, skladSeStejnymiCenami(), HRA.konstanty, nazev, "marze",
  );

  it("ingoty mají v Thetfordu jiný return rate než ve Fort Sterlingu", () => {
    const ingot = p.find((x) => x.klic === "T5_METALBAR#0")!;
    const podleMest = new Map(
      ingot.vsechnaMesta.map((v) => [v.mesto, v.radek.vysledek?.bonus.returnRate]),
    );
    // Thetford má bonus na rudu (18+40=58 → 36,7 %), Fort Sterling ne (18 → 15,3 %).
    expect(podleMest.get("Thetford")).toBeCloseTo(0.3671, 3);
    expect(podleMest.get("Fort Sterling")).toBeCloseTo(0.1525, 3);
  });

  it("prkna to mají obráceně — Fort Sterling má bonus na dřevo", () => {
    const prkna = p.find((x) => x.klic === "T5_PLANKS#0")!;
    const podleMest = new Map(
      prkna.vsechnaMesta.map((v) => [v.mesto, v.radek.vysledek?.bonus.returnRate]),
    );
    expect(podleMest.get("Fort Sterling")).toBeCloseTo(0.3671, 3);
    expect(podleMest.get("Thetford")).toBeCloseTo(0.1525, 3);
  });

  it("při stejných cenách vyhraje město s bonusem", () => {
    // Kontrolní test: když jsou ceny všude stejné, rozhoduje jen bonus.
    expect(p.find((x) => x.klic === "T5_METALBAR#0")!.nejlepsi.mesto).toBe("Thetford");
    expect(p.find((x) => x.klic === "T5_PLANKS#0")!.nejlepsi.mesto).toBe("Fort Sterling");
    expect(p.find((x) => x.klic === "T5_LEATHER#0")!.nejlepsi.mesto).toBe("Martlock");
    expect(p.find((x) => x.klic === "T5_CLOTH#0")!.nejlepsi.mesto).toBe("Lymhurst");
    expect(p.find((x) => x.klic === "T5_STONEBLOCK#0")!.nejlepsi.mesto).toBe("Bridgewatch");
  });
});

describe("seskupení a řazení", () => {
  const p = spocitatNapricMesty(
    NASTAVENI, skladSeStejnymiCenami(), HRA.konstanty, nazev, "marze",
  );

  it("jeden řádek na položku, ne na dvojici položka×město", () => {
    // 115 kombinací × 7 měst by bylo 805 řádků — nepoužitelné.
    expect(p.length).toBeLessThan(200);
    expect(new Set(p.map((x) => x.klic)).size).toBe(p.length);
  });

  it("každá položka nese výsledky ze všech měst", () => {
    for (const x of p) expect(x.vsechnaMesta).toHaveLength(MESTA.length);
  });

  it("nejlepší je opravdu nejlepší, ne první nalezené", () => {
    for (const x of p.slice(0, 20)) {
      const nej = x.nejlepsi.radek.vysledek?.marze ?? -Infinity;
      for (const v of x.vsechnaMesta) {
        expect(v.radek.vysledek?.marze ?? -Infinity).toBeLessThanOrEqual(nej + 1e-9);
      }
    }
  });

  it("druhé město je druhé nejlepší", () => {
    const x = p[0]!;
    if (!x.druhe) return;
    const zbytek = x.vsechnaMesta.slice(2);
    for (const v of zbytek) {
      expect(v.radek.vysledek?.marze ?? -Infinity)
        .toBeLessThanOrEqual((x.druhe.radek.vysledek?.marze ?? -Infinity) + 1e-9);
    }
  });

  it("seřazeno globálně podle metriky", () => {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!.nejlepsi.radek.vysledek?.marze ?? -Infinity;
      const b = p[i]!.nejlepsi.radek.vysledek?.marze ?? -Infinity;
      expect(a).toBeGreaterThanOrEqual(b - 1e-9);
    }
  });
});

describe("pokrytí měst — neúplnost se nesmí schovat", () => {
  it("počítá, v kolika městech se to podařilo", () => {
    const sklad = new SkladCen();
    // Ceny jen ve dvou městech ze sedmi.
    for (const m of ["Thetford", "Martlock"]) {
      for (const id of potrebnaIds(SUROVINY_ID)) {
        const { zaklad, enchant } = zAodpId(id);
        sklad.ulozRucne(m, zaklad, enchant, "sell_min", 100);
        sklad.ulozRucne(m, zaklad, enchant, "buy_max", 100);
      }
    }

    const p = spocitatNapricMesty(NASTAVENI, sklad, HRA.konstanty, nazev, "marze");
    const ingot = p.find((x) => x.klic === "T5_METALBAR#0")!;

    expect(ingot.spocitanoMest).toBe(2);
    // Ostatních 5 měst je pořád v seznamu, jen bez výsledku — aby bylo
    // vidět, že chybí, ne aby zmizela.
    expect(ingot.vsechnaMesta).toHaveLength(MESTA.length);
  });

  it("souhrn hlásí, kolik položek má úplné srovnání", () => {
    const s = souhrnPrilezitosti(
      spocitatNapricMesty(NASTAVENI, skladSeStejnymiCenami(), HRA.konstanty, nazev, "marze"),
    );
    expect(s.uplneSrovnani).toBe(s.celkem);
    expect(s.bezDat).toBe(0);
  });

  it("prázdný sklad = žádná data, ne falešné výsledky", () => {
    const p = spocitatNapricMesty(NASTAVENI, new SkladCen(), HRA.konstanty, nazev, "marze");
    const s = souhrnPrilezitosti(p);
    expect(s.ziskove).toBe(0);
    expect(s.bezDat).toBe(s.celkem);
  });
});

describe("náskok nad druhým městem", () => {
  it("null, když druhé město nemá výsledek", () => {
    const p = spocitatNapricMesty(NASTAVENI, new SkladCen(), HRA.konstanty, nazev, "marze");
    expect(naskokNadDruhym(p[0]!, "marze")).toBeNull();
  });

  it("kladný, když je nejlepší lepší než druhé", () => {
    const p = spocitatNapricMesty(
      NASTAVENI, skladSeStejnymiCenami(), HRA.konstanty, nazev, "marze",
    );
    const ingot = p.find((x) => x.klic === "T5_METALBAR#0")!;
    const n = naskokNadDruhym(ingot, "marze");
    expect(n).not.toBeNull();
    // Thetford s bonusem musí být lepší než město bez bonusu.
    expect(n!).toBeGreaterThan(0);
  });
});

describe("Black Market jako osmé MÍSTO, ne osmé město", () => {
  it("u surovin se srovnává jen 7 měst", () => {
    const m = mistaProSrovnani(SUROVINY_ID);
    expect(m).toHaveLength(7);
    expect(m.every((x) => !x.naBlackMarketu)).toBe(true);
  });

  it("u výbavy přibude Caerleon → Black Market", () => {
    const m = mistaProSrovnani("zbrane");
    expect(m).toHaveLength(8);
    const bm = m.filter((x) => x.naBlackMarketu);
    expect(bm).toHaveLength(1);
    // Vyrábí se pořád v Caerleonu — bonusy patří městu, ne Black Marketu.
    expect(bm[0]!.mesto).toBe("Caerleon");
  });

  it("Black Market NENÍ v seznamu měst", () => {
    // Kdyby v MESTA byl, rozbil by bonusy (nemá žádné), převozní trasy
    // i výběr města v panelu.
    expect(MESTA.some((m) => m.nazev === "Black Market")).toBe(false);
    expect(mistaProSrovnani("zbrane").some((m) => m.mesto === "Black Market")).toBe(false);
  });
});

describe("Black Market s převozem", () => {
  it("prodává se z KAŽDÉHO města, ne jen z Caerleonu", () => {
    const m = mistaProSrovnani("zbrane", "bm-s-prevozem");
    expect(m).toHaveLength(7);
    expect(m.every((x) => x.naBlackMarketu)).toBe(true);
    // Města zůstávají místy VÝROBY — bonusy patří jim.
    expect(m.map((x) => x.mesto).sort()).toEqual(MESTA.map((x) => x.nazev).sort());
  });

  it("u surovin se převoz na BM nenabízí", () => {
    // BM suroviny neobchoduje, jinak by celý sken skončil na „chybí cena".
    const m = mistaProSrovnani(SUROVINY_ID, "bm-s-prevozem");
    expect(m.every((x) => !x.naBlackMarketu)).toBe(true);
  });

  it("bez převozu zůstává jen Caerleon -> BM", () => {
    const m = mistaProSrovnani("zbrane", "bm");
    expect(m.filter((x) => x.naBlackMarketu).map((x) => x.mesto)).toEqual(["Caerleon"]);
  });
});
