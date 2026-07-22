/**
 * Zlaté vektory proti VYGENEROVANÝM HERNÍM DATŮM.
 *
 * Tenhle soubor je pojistka proti tichému rozbití při aktualizaci
 * ao-bin-dumps. Když spadne, znamená to, že SBI něco změnila —
 * je potřeba se podívat co, ne test „opravit".
 */

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { vybratVariantu, itemValue, poplatekStanice } from "../src/recept.js";
import type { HerniData, HerniPolozka } from "../src/typy.js";

const require = createRequire(import.meta.url);
const data = require("../data/hra.json") as HerniData;

const najdi = (zaklad: string): HerniPolozka => {
  const p = data.polozky.find((x) => x.zaklad === zaklad);
  if (!p) throw new Error(`chybí položka ${zaklad}`);
  return p;
};

describe("konstanty z gamedata.xml", () => {
  it("poplatky trhu", () => {
    expect(data.konstanty.setupFee).toBeCloseTo(0.025, 6);
    expect(data.konstanty.danNormalni).toBeCloseTo(0.08, 6);
    expect(data.konstanty.minimalniDan).toBe(1);
  });

  it("Black Market má NIŽŠÍ setup fee než běžný trh", () => {
    expect(data.konstanty.blackMarketSetupFee).toBeCloseTo(0.015, 6);
    expect(data.konstanty.blackMarketSetupFee).toBeLessThan(data.konstanty.setupFee);
  });

  it("focus dává +59", () => {
    expect(data.konstanty.bonusFocus).toBeCloseTo(59, 6);
  });
});

describe("bonusy měst", () => {
  it("všech 6 královských měst + Brecilien má jméno použitelné vůči AODP", () => {
    const mesta = data.lokace.filter((l) => l.typ === "mesto").map((l) => l.nazev);
    for (const m of ["Thetford", "Lymhurst", "Bridgewatch", "Martlock", "Fort Sterling", "Caerleon", "Brecilien"]) {
      expect(mesta).toContain(m);
    }
  });

  it.each([
    ["Thetford", "ore"],
    ["Lymhurst", "fiber"],
    ["Bridgewatch", "rock"],
    ["Martlock", "hide"],
    ["Fort Sterling", "wood"],
  ])("%s má refining bonus 0,40 na %s", (mesto, surovina) => {
    const l = data.lokace.find((x) => x.nazev === mesto)!;
    expect(l.refiningBonus).toBeCloseTo(0.18, 6);
    expect(l.modifikatory[surovina]).toBeCloseTo(0.4, 6);
  });

  it("Caerleon nemá bonus na refining žádné suroviny", () => {
    const l = data.lokace.find((x) => x.nazev === "Caerleon")!;
    for (const s of ["ore", "hide", "fiber", "wood", "rock"]) {
      expect(l.modifikatory[s] ?? 0).toBe(0);
    }
  });

  it("kategorie kamene je 'rock', ne 'stone'", () => {
    const l = data.lokace.find((x) => x.nazev === "Bridgewatch")!;
    expect(l.modifikatory["rock"]).toBeCloseTo(0.4, 6);
    expect(l.modifikatory["stone"]).toBeUndefined();
  });
});

describe("poměry refiningu — shodné pro všech 5 linek", () => {
  const linky = ["METALBAR", "PLANKS", "LEATHER", "CLOTH", "STONEBLOCK"];
  const surovina: Record<string, string> = {
    METALBAR: "ORE", PLANKS: "WOOD", LEATHER: "HIDE", CLOTH: "FIBER", STONEBLOCK: "ROCK",
  };
  // Posloupnost NENÍ lineární: T4 = 2 jako T3, T8 = 5 jako T7.
  const rawNaKus: Record<number, number> = { 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 5, 8: 5 };

  for (const linka of linky) {
    for (const tier of [2, 3, 4, 5, 6, 7, 8]) {
      it(`T${tier}_${linka} = ${rawNaKus[tier]}× raw ${tier > 2 ? "+ 1× nižší refined" : ""}`, () => {
        const p = najdi(`T${tier}_${linka}`);
        const v = vybratVariantu(p, 0)!;
        expect(v.sFactionTokenem).toBe(false);

        const raw = v.vstupy.find((x) => x.zaklad === `T${tier}_${surovina[linka]}`);
        expect(raw?.pocet).toBe(rawNaKus[tier]);

        if (tier > 2) {
          const nizsi = v.vstupy.find((x) => x.zaklad === `T${tier - 1}_${linka}`);
          expect(nizsi?.pocet).toBe(1);
        }
      });
    }
  }
});

describe("enchanty", () => {
  it("T4 s enchantem bere NEenchantovaný T3 — enchantovaný T3 neexistuje", () => {
    const p = najdi("T4_METALBAR");
    const v = vybratVariantu(p, 2)!;
    const nizsi = v.vstupy.find((x) => x.zaklad === "T3_METALBAR")!;
    expect(nizsi.enchant).toBe(0);
    const raw = v.vstupy.find((x) => x.zaklad === "T4_ORE")!;
    expect(raw.enchant).toBe(2);
  });

  it("T5 s enchantem už bere enchantovaný T4", () => {
    const v = vybratVariantu(najdi("T5_METALBAR"), 2)!;
    expect(v.vstupy.find((x) => x.zaklad === "T4_METALBAR")!.enchant).toBe(2);
  });

  it("kámen se enchantovat nedá", () => {
    for (const tier of [4, 5, 6, 7, 8]) {
      expect(najdi(`T${tier}_STONEBLOCK`).maxEnchant).toBe(0);
    }
  });

  it("ostatní linky mají enchant až do .4", () => {
    for (const linka of ["METALBAR", "PLANKS", "LEATHER", "CLOTH"]) {
      expect(najdi(`T5_${linka}`).maxEnchant).toBe(4);
    }
  });
});

describe("focus a itemValue", () => {
  it("focus jde podle EFEKTIVNÍ úrovně = tier + enchant", () => {
    // T4.1 stojí stejně jako T5.0 — obojí efektivní úroveň 5.
    expect(vybratVariantu(najdi("T4_METALBAR"), 1)!.focus)
      .toBe(vybratVariantu(najdi("T5_METALBAR"), 0)!.focus);
  });

  it("nejdražší kombinace T8.4 = focus 4714", () => {
    expect(vybratVariantu(najdi("T8_METALBAR"), 4)!.focus).toBe(4714);
  });

  it("itemValue se zdvojnásobuje po tieru i po enchantu", () => {
    expect(najdi("T5_METALBAR").itemValue).toBe(32);
    expect(itemValue(najdi("T8_METALBAR"), 0)).toBe(256);
    expect(itemValue(najdi("T8_METALBAR"), 4)).toBe(4096);
  });

  it("poplatek stanice: T5 při sazbě 200 = 7,20 za kus", () => {
    const p = poplatekStanice(najdi("T5_METALBAR"), 0, 200, data.konstanty.nutritionKoeficient);
    expect(p).toBeCloseTo(7.2, 6);
  });
});

describe("váhy", () => {
  it.each([[2, 0.23], [3, 0.34], [4, 0.51], [5, 0.76], [6, 1.14], [7, 1.71], [8, 2.56]])(
    "T%i váží %f kg", (tier, vaha) => {
      expect(najdi(`T${tier}_METALBAR`).vaha).toBeCloseTo(vaha, 6);
    });

  it("refining sníží váhu — 5× T7 ruda váží víc než 1× T7 ingot", () => {
    const ruda = najdi("T7_ORE").vaha * 5;
    const ingot = najdi("T7_METALBAR").vaha;
    expect(ruda / ingot).toBeCloseTo(5, 6);
  });
});

describe("crafting předmětů — stejná struktura jako refining", () => {
  it("T5 meč = 16× ingot + 8× kůže", () => {
    const v = vybratVariantu(najdi("T5_MAIN_SWORD"), 0)!;
    expect(v.vstupy.find((x) => x.zaklad === "T5_METALBAR")!.pocet).toBe(16);
    expect(v.vstupy.find((x) => x.zaklad === "T5_LEATHER")!.pocet).toBe(8);
  });

  it("enchantovaný meč bere enchantované suroviny", () => {
    const v = vybratVariantu(najdi("T5_MAIN_SWORD"), 1)!;
    expect(v.vstupy.every((x) => x.enchant === 1)).toBe(true);
  });

  it("meč jde i vylepšit runou/duší/relikvií", () => {
    const mec = najdi("T5_MAIN_SWORD");
    const zdroje = mec.vylepseni.map((v) => v.vstupy[0]!.zaklad);
    expect(zdroje).toEqual(["T5_RUNE", "T5_SOUL", "T5_RELIC"]);
  });

  it("runy a duše se NEVRACEJÍ přes return rate", () => {
    const mec = najdi("T5_MAIN_SWORD");
    for (const v of mec.vylepseni) {
      expect(v.vstupy.every((x) => !x.vratna)).toBe(true);
    }
  });
});

describe("varianty s faction tokenem", () => {
  it("výchozí výběr token NEPOUŽIJE", () => {
    const v = vybratVariantu(najdi("T5_METALBAR"), 0)!;
    expect(v.vstupy.some((x) => x.zaklad.includes("FACTION"))).toBe(false);
  });

  it("s tokenem je raw surovina o 1 levnější", () => {
    const p = najdi("T5_METALBAR");
    const bez = vybratVariantu(p, 0)!;
    const s = p.varianty.find((x) => x.enchant === 0 && x.sFactionTokenem);
    expect(s).toBeDefined();
    const rudaBez = bez.vstupy.find((x) => x.zaklad === "T5_ORE")!.pocet;
    const rudaS = s!.vstupy.find((x) => x.zaklad === "T5_ORE")!.pocet;
    expect(rudaS).toBe(rudaBez - 1);
  });
});
