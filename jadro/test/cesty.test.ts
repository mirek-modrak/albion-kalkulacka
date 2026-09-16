/**
 * Tři cesty v Dílně — koupit, vyrobit, enchantovat.
 *
 * Kontrolní čísla jsou spočítaná RUČNĚ (return rate zadaný napevno 20 %,
 * poplatek stanice 0), ne opsaná z kódu. T4 sekera: recept 8 prken + 16
 * ingotů, na každý stupeň enchantu 288 run / duší / relikvií, focus .0 = 1286.
 */

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { spocitatCesty, type ZadaniCest } from "../src/cesty.js";
import { poplatekStanice } from "../src/recept.js";
import type { Cena, Enchant, HerniData, Vstup } from "../src/typy.js";

const require = createRequire(import.meta.url);
const data = require("../data/hra.json") as HerniData;
const najdi = (z: string) => data.polozky.find((p) => p.zaklad === z)!;
const vaha = (v: Vstup) => najdi(v.zaklad)?.vaha ?? 0;

const cena = (hodnota: number): Cena => ({
  hodnota, zdroj: "rucne", cas: null, mesto: "Martlock", typ: "sell_min",
});

/** Ceny, u kterých vyhraje enchant. */
const CENY: Record<string, number> = {
  "T4_PLANKS#0": 100, "T4_METALBAR#0": 100,
  "T4_PLANKS#2": 1000, "T4_METALBAR#2": 1000,
  "T4_RUNE#0": 10, "T4_SOUL#0": 20,
  "T4_MAIN_AXE#2": 15_000,
};

function zadani(
  enchant: number, ceny: Record<string, number> = CENY, uprav: Partial<ZadaniCest> = {},
): ZadaniCest {
  return {
    polozka: najdi("T4_MAIN_AXE"),
    enchant: enchant as Enchant,
    pocetVyrobku: 10,
    bonusy: { mesto: "Martlock", focus: false, denniBonus: 0, rucniReturnRate: 0.2 },
    lokace: undefined,
    premium: true,
    sazbaStanice: 0,
    rezimNakupu: "instant",
    rezimProdeje: "instant",
    cenaNakupu: (z, e) => (ceny[`${z}#${e}`] !== undefined ? cena(ceny[`${z}#${e}`]!) : undefined),
    cenaVystupu: cena(20_000),
    ...uprav,
  };
}

const spocitej = (z: ZadaniCest) => spocitatCesty(z, data.konstanty, vaha);

describe("tři cesty pro .2", () => {
  const r = spocitej(zadani(2));

  it("koupit = cena hotového", () => {
    expect(r.koupit.ok && r.koupit.nakladNaKus).toBe(15_000);
  });

  it("vyrobit = suroviny .2 po return rate", () => {
    // 8 × 1000 × 0,8 + 16 × 1000 × 0,8 = 6 400 + 12 800
    expect(r.vyrobit.ok && r.vyrobit.nakladNaKus).toBeCloseTo(19_200, 6);
  });

  it("enchantovat = VYROBENÝ .0 + runy + duše", () => {
    // .0: 8 × 100 × 0,8 + 16 × 100 × 0,8 = 1 920;  runy 288 × 10;  duše 288 × 20
    expect(r.enchantovat.ok && r.enchantovat.nakladNaKus).toBeCloseTo(10_560, 6);
  });

  it("vyhraje enchant a zisk se počítá z něj", () => {
    expect(r.vitez).toBe("enchantovat");
    // tržba 20 000 − 4 % daň = 19 200/ks;  zisk (19 200 − 10 560) × 10
    expect(r.metriky!.zisk).toBeCloseTo(86_400, 6);
    expect(r.metriky!.marze).toBeCloseTo(86_400 / 105_600, 6);
    expect(r.metriky!.ziskNaKus).toBeCloseTo(8_640, 6);
  });

  it("focus enchantu = focus výroby .0, ne .2", () => {
    expect(r.metriky!.focus).toBe(1286 * 10);
    expect(r.metriky!.ziskNaFocus).toBeCloseTo(86_400 / 12_860, 6);
  });
});

describe("model poplatků je pro všechny cesty stejný", () => {
  it("buy order přirazí setup fee surovinám, runám i nákupu", () => {
    const r = spocitej(zadani(2, CENY, { rezimNakupu: "order" }));
    expect(r.koupit.ok && r.koupit.nakladNaKus).toBeCloseTo(15_375, 6);
    expect(r.vyrobit.ok && r.vyrobit.nakladNaKus).toBeCloseTo(19_680, 6);
    // (1 920 + 8 640) × 1,025
    expect(r.enchantovat.ok && r.enchantovat.nakladNaKus).toBeCloseTo(10_824, 6);
  });

  it("poplatek stanice se u enchantu platí jen za výrobu .0", () => {
    const sazba = 500;
    const r = spocitej(zadani(2, CENY, { sazbaStanice: sazba }));
    const p0 = poplatekStanice(najdi("T4_MAIN_AXE"), 0, sazba, data.konstanty.nutritionKoeficient);
    const p2 = poplatekStanice(najdi("T4_MAIN_AXE"), 2, sazba, data.konstanty.nutritionKoeficient);
    expect(p2).toBeGreaterThan(p0);
    expect(r.enchantovat.ok && r.enchantovat.nakladNaKus).toBeCloseTo(10_560 + p0, 6);
    expect(r.vyrobit.ok && r.vyrobit.nakladNaKus).toBeCloseTo(19_200 + p2, 6);
  });

  it("vyšší return rate (focus) zlevní enchant přesně o úsporu na .0", () => {
    const r = spocitej(zadani(2, CENY, {
      bonusy: { mesto: "Martlock", focus: true, denniBonus: 0, rucniReturnRate: 0.5 },
    }));
    // .0: 2 400 × 0,5 = 1 200;  runy a duše beze změny 8 640
    expect(r.enchantovat.ok && r.enchantovat.nakladNaKus).toBeCloseTo(9_840, 6);
  });
});

describe("negativní prostor", () => {
  it("chybí cena duší → enchant neuvede náklad, ostatní cesty žijí", () => {
    const { ["T4_SOUL#0"]: _, ...bezDusi } = CENY;
    const r = spocitej(zadani(2, bezDusi));
    expect(r.enchantovat).toEqual({
      ok: false, duvod: "chybi-cena", chybejici: [{ zaklad: "T4_SOUL", enchant: 0 }],
    });
    expect(r.vitez).toBe("koupit");
    expect(r.metriky!.zisk).toBeCloseTo((19_200 - 15_000) * 10, 6);
  });

  it("chybí suroviny .0 → enchant NEVEZME koupený .0", () => {
    // I když je .0 na trhu levný, cesta enchantem vede jen přes výrobu.
    const r = spocitej(zadani(2, {
      ...CENY, "T4_PLANKS#0": 0, "T4_MAIN_AXE#0": 1,
    }));
    expect(r.enchantovat.ok).toBe(false);
    expect(!r.enchantovat.ok && r.enchantovat.chybejici)
      .toEqual([{ zaklad: "T4_PLANKS", enchant: 0 }]);
  });

  it("enchant nikdy nejde přes koupený ani vyrobený mezistupeň .1", () => {
    // Levný .1 i jeho suroviny nesmí náklad .2 ovlivnit.
    const r = spocitej(zadani(2, {
      ...CENY, "T4_MAIN_AXE#1": 1, "T4_PLANKS#1": 1, "T4_METALBAR#1": 1,
    }));
    expect(r.enchantovat.ok && r.enchantovat.nakladNaKus).toBeCloseTo(10_560, 6);
  });

  it(".0 kus cestu enchantem nemá", () => {
    const r = spocitej(zadani(0, { ...CENY, "T4_MAIN_AXE#0": 5000 }));
    expect(r.enchantovat).toEqual({ ok: false, duvod: "neexistuje", chybejici: [] });
  });

  it(".4 cestu enchantem nemá — data mají vylepšení jen do .3", () => {
    const r = spocitej(zadani(4, { ...CENY, "T4_RELIC#0": 1 }));
    expect(!r.enchantovat.ok && r.enchantovat.duvod).toBe("neexistuje");
  });

  it("chybí cena hotového → koupit hlásí chybějící cenu", () => {
    const { ["T4_MAIN_AXE#2"]: _, ...bez } = CENY;
    const r = spocitej(zadani(2, bez));
    expect(!r.koupit.ok && r.koupit.duvod).toBe("chybi-cena");
    expect(r.vitez).toBe("enchantovat");
  });

  it("bez prodejní ceny se vítěz určí, zisk ne", () => {
    const r = spocitej(zadani(2, CENY, { cenaVystupu: undefined }));
    expect(r.vitez).toBe("enchantovat");
    expect(r.trzba).toBeNull();
    expect(r.metriky).toBeNull();
  });

  it("žádná cena → žádný vítěz", () => {
    const r = spocitej(zadani(2, {}));
    expect(r.vitez).toBeNull();
    expect(r.metriky).toBeNull();
  });

  it("při shodě nákladů vyhraje nákup", () => {
    const r = spocitej(zadani(2, { ...CENY, "T4_MAIN_AXE#2": 10_560 }));
    const e = r.enchantovat.ok ? r.enchantovat.nakladNaKus : NaN;
    const r2 = spocitej(zadani(2, { ...CENY, "T4_MAIN_AXE#2": e }));
    expect(r2.vitez).toBe("koupit");
  });

  it("vyhraje-li nákup, zisk na focus je prázdný, ne nekonečno", () => {
    const r = spocitej(zadani(2, { ...CENY, "T4_MAIN_AXE#2": 100 }));
    expect(r.vitez).toBe("koupit");
    expect(r.metriky!.focus).toBe(0);
    expect(r.metriky!.ziskNaFocus).toBeNull();
  });
});
