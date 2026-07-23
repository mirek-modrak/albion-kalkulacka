/**
 * Výpočet arbitráže.
 *
 * Nejdůležitější vlastnost: u převozu se **nic nevyrábí**, takže NEPLATÍ
 * return rate ani poplatek stanice. Kdyby se sem zatoulaly, výsledky by
 * vypadaly věrohodně a byly by systematicky nadhodnocené.
 */

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { kusuNaMount, spocitatPrevoz, ziskZaCestu } from "../src/prevoz.js";
import type { Cena, HerniData } from "../src/typy.js";

const require = createRequire(import.meta.url);
const data = require("../data/hra.json") as HerniData;

const cena = (hodnota: number, mesto = "Thetford"): Cena => ({
  hodnota, zdroj: "rucne", cas: null, mesto, typ: "sell_min",
});

const zaklad = {
  vahaKusu: 0.76,
  pocet: 100,
  cenaNakup: cena(1000, "Thetford"),
  cenaProdej: cena(1500, "Martlock"),
  premium: true,
  rezimNakupu: "instant" as const,
  rezimProdeje: "order" as const,
};

describe("základní výpočet", () => {
  const v = spocitatPrevoz(zaklad, data.konstanty);

  it("náklad je prostě cena × počet, bez return rate", () => {
    // U výroby by se náklad snížil o vrácené suroviny. Tady ne — nic se nevyrábí.
    expect(v.nakladNakup).toBe(100_000);
    expect(v.nakladyCelkem).toBe(100_000);
  });

  it("instant nákup neplatí setup fee", () => {
    expect(v.setupFeeNakup).toBe(0);
  });

  it("daň a setup fee na prodejní straně", () => {
    expect(v.trzbaHruba).toBe(150_000);
    expect(v.dan).toBeCloseTo(6_000, 6);         // 4 % s premiem
    expect(v.setupFeeProdej).toBeCloseTo(3_750, 6); // 2,5 %
    expect(v.trzbaCista).toBeCloseTo(140_250, 6);
  });

  it("zisk = čistá tržba − náklady", () => {
    expect(v.zisk).toBeCloseTo(40_250, 6);
  });

  it("zisk na kilogram — rozhodující metrika u převozu", () => {
    // 100 kusů × 0,76 kg = 76 kg
    expect(v.vahaCelkem).toBeCloseTo(76, 6);
    expect(v.ziskNaKg).toBeCloseTo(40_250 / 76, 4);
  });
});

describe("co u převozu NEPLATÍ", () => {
  it("žádný poplatek stanice — stanice se nepoužívá", () => {
    const v = spocitatPrevoz(zaklad, data.konstanty);
    // Součet nákladů musí být přesně nákup + případný setup fee, nic navíc.
    expect(v.nakladyCelkem).toBe(v.nakladNakup + v.setupFeeNakup);
  });

  it("výsledek neobsahuje return rate ani bonus", () => {
    const v = spocitatPrevoz(zaklad, data.konstanty) as unknown as Record<string, unknown>;
    expect(v["bonus"]).toBeUndefined();
    expect(v["poplatekStaniceCelkem"]).toBeUndefined();
  });
});

describe("riziko ztráty zásilek", () => {
  it("ztráta se odečítá z TRŽBY, ne z nákladů", () => {
    // Co ztratíš, to jsi zaplatil a neprodáš — proto náklady zůstávají.
    const bez = spocitatPrevoz(zaklad, data.konstanty);
    const s20 = spocitatPrevoz({ ...zaklad, ztrataZasilek: 0.2 }, data.konstanty);

    expect(s20.nakladyCelkem).toBe(bez.nakladyCelkem);
    expect(s20.trzbaHruba).toBeCloseTo(bez.trzbaHruba * 0.8, 6);
    expect(s20.zisk).toBeLessThan(bez.zisk);
  });

  it("zisk bez rizika se uchová pro srovnání", () => {
    const v = spocitatPrevoz({ ...zaklad, ztrataZasilek: 0.3 }, data.konstanty);
    expect(v.ziskBezRizika).toBeGreaterThan(v.zisk);
  });

  it("100% ztráta = přijdeš o celý náklad", () => {
    const v = spocitatPrevoz({ ...zaklad, ztrataZasilek: 1 }, data.konstanty);
    expect(v.trzbaHruba).toBe(0);
    expect(v.dan).toBe(0);
    expect(v.zisk).toBeCloseTo(-100_000, 6);
  });

  it("dost velké riziko udělá ze ziskové trasy ztrátovou", () => {
    // Přesně tohle má bránit tomu, aby se rizikové trasy stavěly nahoru.
    const bezpecna = spocitatPrevoz(zaklad, data.konstanty);
    const riskantni = spocitatPrevoz({ ...zaklad, ztrataZasilek: 0.5 }, data.konstanty);
    expect(bezpecna.zisk).toBeGreaterThan(0);
    expect(riskantni.zisk).toBeLessThan(0);
  });

  it("nesmyslné hodnoty se omezí", () => {
    expect(spocitatPrevoz({ ...zaklad, ztrataZasilek: -1 }, data.konstanty).zisk)
      .toBeCloseTo(spocitatPrevoz(zaklad, data.konstanty).zisk, 6);
    expect(spocitatPrevoz({ ...zaklad, ztrataZasilek: 5 }, data.konstanty).trzbaHruba).toBe(0);
  });
});

describe("poplatky", () => {
  it("buy order přidá setup fee na nákupní straně", () => {
    const v = spocitatPrevoz({ ...zaklad, rezimNakupu: "order" }, data.konstanty);
    expect(v.setupFeeNakup).toBeCloseTo(2_500, 6);
  });

  it("instant prodej neplatí setup fee", () => {
    const v = spocitatPrevoz({ ...zaklad, rezimProdeje: "instant" }, data.konstanty);
    expect(v.setupFeeProdej).toBe(0);
  });

  it("bez premia je daň dvojnásobná", () => {
    const s = spocitatPrevoz(zaklad, data.konstanty);
    const bez = spocitatPrevoz({ ...zaklad, premium: false }, data.konstanty);
    expect(bez.dan).toBeCloseTo(s.dan * 2, 6);
  });

  it("Black Market má nižší setup fee", () => {
    const bezny = spocitatPrevoz(zaklad, data.konstanty);
    const bm = spocitatPrevoz({ ...zaklad, prodejNaBlackMarketu: true }, data.konstanty);
    expect(bm.setupFeeProdej).toBeLessThan(bezny.setupFeeProdej);
  });

  it("minimální daň platí i u převozu", () => {
    const v = spocitatPrevoz({ ...zaklad, cenaProdej: cena(5) }, data.konstanty);
    expect(v.dan).toBe(100);   // 100 kusů × 1 silver
  });
});

describe("nosnost mountu", () => {
  it("kolik kusů se vejde", () => {
    // Elder's Transport Ox = 4 116 kg, T5 váží 0,76 kg
    expect(kusuNaMount(4116, 0.76)).toBe(5415);
  });

  it("těžší položka = míň kusů", () => {
    expect(kusuNaMount(4116, 2.56)).toBeLessThan(kusuNaMount(4116, 0.76));
  });

  it("zaokrouhluje DOLŮ — půl kusu neexistuje", () => {
    expect(kusuNaMount(10, 3)).toBe(3);
  });

  it("nulová váha nespadne", () => {
    expect(kusuNaMount(4116, 0)).toBe(0);
  });

  it("zisk za cestu = plně naložený mount", () => {
    const z = ziskZaCestu(4116, 0.76, 100);
    expect(z).toBeCloseTo(5415 * 0.76 * 100, 2);
  });

  it("bez zisku na kg není zisk za cestu", () => {
    expect(ziskZaCestu(4116, 0.76, null)).toBeNull();
  });
});

describe("váha rozhoduje jinak než zisk na kus", () => {
  it("lehčí položka s nižším ziskem na kus může být lepší volba", () => {
    // Přesně proto je výchozí metrika zisk na kilogram, ne na kus.
    const lehka = spocitatPrevoz(
      { ...zaklad, vahaKusu: 0.23, cenaProdej: cena(1200) }, data.konstanty,
    );
    const tezka = spocitatPrevoz(
      { ...zaklad, vahaKusu: 2.56, cenaProdej: cena(1500) }, data.konstanty,
    );

    expect(lehka.ziskNaKus).toBeLessThan(tezka.ziskNaKus);
    expect(lehka.ziskNaKg!).toBeGreaterThan(tezka.ziskNaKg!);
  });
});
