/**
 * Zlaté vektory pro celý výpočet.
 *
 * Čísla pocházejí z prototypu, kde byla ověřena ručním přepočtem
 * (viz konverzace 2026-07-22). Když se tenhle soubor rozejde, rozešla se
 * matematika — ne test.
 */

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { spocitat } from "../src/vypocet.js";
import type { Cena, HerniData, HerniPolozka, Lokace, Vstup } from "../src/typy.js";

const require = createRequire(import.meta.url);
const data = require("../data/hra.json") as HerniData;

const najdi = (zaklad: string): HerniPolozka => data.polozky.find((x) => x.zaklad === zaklad)!;
const mesto = (nazev: string): Lokace => data.lokace.find((x) => x.nazev === nazev)!;

const cena = (hodnota: number): Cena => ({
  hodnota, zdroj: "rucne", cas: null, mesto: "Thetford", typ: "sell_min",
});

// Uměle sestavené položky v testech níž potřebují typ HerniPolozka.
// Import je nahoře; tenhle komentář jen vysvětluje, proč tam je.

/** Váhy bereme z herních dat — enchant váhu nemění. */
const vahaVstupu = (v: Vstup) => najdi(v.zaklad)?.vaha ?? 0;

describe("refining T5 ingotů v Thetfordu — vektor z prototypu", () => {
  // Zadání shodné s ručním přepočtem: 1000 kusů, ceny 400/300/1000,
  // Thetford (bonus na rudu), bez focusu, premium, poplatek 200.
  const zadani = {
    polozka: najdi("T5_METALBAR"),
    enchant: 0 as const,
    pocetVyrobku: 1000,
    bonusy: { mesto: "Thetford", focus: false, denniBonus: 0 },
    lokace: mesto("Thetford"),
    cenyVstupu: new Map([
      ["T5_ORE#0", cena(400)],
      ["T4_METALBAR#0", cena(300)],
    ]),
    cenaVystupu: cena(1000),
    premium: true,
    sazbaStanice: 200,
    rezimNakupu: "instant" as const,
    rezimProdeje: "order" as const,
  };

  const v = spocitat(zadani, data.konstanty, vahaVstupu);
  if (!v.ok) throw new Error(`výpočet selhal: ${JSON.stringify(v.chyba)}`);
  const r = v.hodnota;

  it("return rate 36,7 % ze součtu bonusů 58", () => {
    expect(r.bonus.bonusCelkem).toBe(58);
    expect(r.bonus.returnRate).toBeCloseTo(0.3671, 4);
    expect(r.bonus.nasobek).toBeCloseTo(1.58, 3);
  });

  it("spotřeba rudy 3000 → 1898,7", () => {
    const ruda = r.vstupy.find((x) => x.zaklad === "T5_ORE")!;
    expect(ruda.nominalne).toBe(3000);
    expect(ruda.efektivne).toBeCloseTo(1898.73, 1);
  });

  it("náklady: 75 949 + 18 987 + 720 = 95 657", () => {
    expect(r.vstupy.find((x) => x.zaklad === "T5_ORE")!.naklad).toBeCloseTo(759_494, 0);
    expect(r.vstupy.find((x) => x.zaklad === "T4_METALBAR")!.naklad).toBeCloseTo(189_873, 0);
    expect(r.poplatekStaniceCelkem).toBeCloseTo(7200, 6);
    expect(r.nakladyCelkem).toBeCloseTo(956_567, 0);
  });

  it("výnos: daň 4 % a setup fee 2,5 %", () => {
    expect(r.trzbaHruba).toBe(1_000_000);
    expect(r.dan).toBeCloseTo(40_000, 6);
    expect(r.setupFeeProdej).toBeCloseTo(25_000, 6);
    expect(r.trzbaCista).toBeCloseTo(935_000, 6);
  });

  it("focus 94 na kus", () => {
    expect(r.focus).toBe(94_000);
  });

  it("váha vstupů 2790 kg, výstupu 760 kg", () => {
    // 3000 × 0,76 + 1000 × 0,51 = 2280 + 510
    expect(r.vahaVstupu).toBeCloseTo(2790, 1);
    expect(r.vahaVystupu).toBeCloseTo(760, 1);
  });
});

describe("chování na hranicích", () => {
  const zaklad = {
    polozka: najdi("T5_METALBAR"),
    enchant: 0 as const,
    pocetVyrobku: 100,
    bonusy: { mesto: "Thetford", focus: false, denniBonus: 0 },
    lokace: mesto("Thetford"),
    cenaVystupu: cena(1000),
    premium: true,
    sazbaStanice: 200,
    rezimNakupu: "instant" as const,
    rezimProdeje: "order" as const,
    cenyVstupu: new Map([["T5_ORE#0", cena(400)], ["T4_METALBAR#0", cena(300)]]),
  };

  it("chybějící cena vrátí chybu, NEPOČÍTÁ s nulou", () => {
    const v = spocitat({ ...zaklad, cenyVstupu: new Map([["T5_ORE#0", cena(400)]]) },
      data.konstanty, vahaVstupu);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.chyba).toEqual({ druh: "chybi-cena", zaklad: "T4_METALBAR", enchant: 0 });
  });

  it("nulová cena se bere jako chybějící", () => {
    const v = spocitat({ ...zaklad, cenyVstupu: new Map([["T5_ORE#0", cena(0)], ["T4_METALBAR#0", cena(300)]]) },
      data.konstanty, vahaVstupu);
    expect(v.ok).toBe(false);
  });

  it("neexistující enchant vrátí chybu", () => {
    const v = spocitat({ ...zaklad, polozka: najdi("T5_STONEBLOCK"), enchant: 3 },
      data.konstanty, vahaVstupu);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.chyba.druh).toBe("chybi-varianta");
  });

  it("minimální daň 1 silver za kus se uplatní u levných položek", () => {
    // Cena 5 silver → 4 % je 0,2, ale minimum je 1 za kus.
    const v = spocitat({ ...zaklad, cenaVystupu: cena(5) }, data.konstanty, vahaVstupu);
    if (!v.ok) throw new Error("mělo projít");
    expect(v.hodnota.dan).toBe(100); // 100 kusů × 1 silver
  });

  it("Black Market má nižší setup fee", () => {
    const bezny = spocitat(zaklad, data.konstanty, vahaVstupu);
    const bm = spocitat({ ...zaklad, prodejNaBlackMarketu: true }, data.konstanty, vahaVstupu);
    if (!bezny.ok || !bm.ok) throw new Error("mělo projít");
    expect(bm.hodnota.setupFeeProdej).toBeLessThan(bezny.hodnota.setupFeeProdej);
    expect(bm.hodnota.setupFeeProdej).toBeCloseTo(100_000 * 0.015, 6);
  });

  it("buy order přidá setup fee na nákupní straně", () => {
    const instant = spocitat(zaklad, data.konstanty, vahaVstupu);
    const order = spocitat({ ...zaklad, rezimNakupu: "order" }, data.konstanty, vahaVstupu);
    if (!instant.ok || !order.ok) throw new Error("mělo projít");
    expect(instant.hodnota.setupFeeNakup).toBe(0);
    expect(order.hodnota.setupFeeNakup).toBeCloseTo(instant.hodnota.nakladSuroviny * 0.025, 6);
  });

  it("bez premia je daň dvojnásobná", () => {
    const s = spocitat(zaklad, data.konstanty, vahaVstupu);
    const bez = spocitat({ ...zaklad, premium: false }, data.konstanty, vahaVstupu);
    if (!s.ok || !bez.ok) throw new Error("mělo projít");
    expect(bez.hodnota.dan).toBeCloseTo(s.hodnota.dan * 2, 6);
  });

  it("lepší return rate = nižší náklady", () => {
    const bez = spocitat(zaklad, data.konstanty, vahaVstupu);
    const sFocusem = spocitat(
      { ...zaklad, bonusy: { mesto: "Thetford", focus: true, denniBonus: 0 } },
      data.konstanty, vahaVstupu,
    );
    if (!bez.ok || !sFocusem.ok) throw new Error("mělo projít");
    expect(sFocusem.hodnota.nakladSuroviny).toBeLessThan(bez.hodnota.nakladSuroviny);
  });
});

describe("nevratné suroviny", () => {
  it("data označují runy/duše/relikvie jako nevratné", () => {
    const mec = najdi("T5_MAIN_SWORD");
    for (const v of mec.vylepseni) expect(v.vstupy.every((x) => !x.vratna)).toBe(true);
  });

  it("běžné suroviny vratné jsou", () => {
    const v = najdi("T5_METALBAR").varianty.find((x) => x.enchant === 0 && !x.sFactionTokenem)!;
    expect(v.vstupy.every((x) => x.vratna)).toBe(true);
  });

  it("VÝPOČET na nevratnou surovinu return rate neuplatní", () => {
    // Uměle vyrobená položka: jeden vstup vratný, druhý ne, jinak shodné.
    // Kdyby se return rate uplatňoval na oba, spotřeba by vyšla stejná.
    const umela: HerniPolozka = {
      zaklad: "TEST_POLOZKA", druh: "vybava", tier: 5, vaha: 1, itemValue: 32,
      kategorie: null, maxEnchant: 0, vylepseni: [],
      varianty: [{
        enchant: 0, pocetVyrobenych: 1, focus: 0, cas: 0, sFactionTokenem: false,
        vstupy: [
          { zaklad: "VRATNA", enchant: 0, pocet: 10, vratna: true },
          { zaklad: "NEVRATNA", enchant: 0, pocet: 10, vratna: false },
        ],
      }],
    };

    const v = spocitat({
      polozka: umela, enchant: 0, pocetVyrobku: 100,
      bonusy: { mesto: "x", focus: false, denniBonus: 0, rucniReturnRate: 0.5 },
      lokace: undefined,
      cenyVstupu: new Map([["VRATNA#0", cena(100)], ["NEVRATNA#0", cena(100)]]),
      cenaVystupu: cena(10_000), premium: true, sazbaStanice: 0,
      rezimNakupu: "instant", rezimProdeje: "instant",
    }, data.konstanty, () => 1);

    if (!v.ok) throw new Error("mělo projít");
    const vratna = v.hodnota.vstupy.find((x) => x.zaklad === "VRATNA")!;
    const nevratna = v.hodnota.vstupy.find((x) => x.zaklad === "NEVRATNA")!;

    expect(vratna.nominalne).toBe(1000);
    expect(nevratna.nominalne).toBe(1000);
    // Při RRR 50 % se vratné spotřebuje polovina, nevratné všechno.
    expect(vratna.efektivne).toBeCloseTo(500, 6);
    expect(nevratna.efektivne).toBeCloseTo(1000, 6);
    expect(nevratna.naklad).toBeCloseTo(vratna.naklad * 2, 6);
  });

  it("recept vyrábějící víc kusů dělí spotřebu správně", () => {
    const umela: HerniPolozka = {
      zaklad: "TEST_DAVKA", druh: "vybava", tier: 5, vaha: 1, itemValue: 0,
      kategorie: null, maxEnchant: 0, vylepseni: [],
      varianty: [{
        enchant: 0, pocetVyrobenych: 5, focus: 100, cas: 0, sFactionTokenem: false,
        vstupy: [{ zaklad: "X", enchant: 0, pocet: 10, vratna: false }],
      }],
    };

    const v = spocitat({
      polozka: umela, enchant: 0, pocetVyrobku: 100,
      bonusy: { mesto: "x", focus: false, denniBonus: 0, rucniReturnRate: 0 },
      lokace: undefined,
      cenyVstupu: new Map([["X#0", cena(1)]]),
      cenaVystupu: cena(1000), premium: true, sazbaStanice: 0,
      rezimNakupu: "instant", rezimProdeje: "instant",
    }, data.konstanty, () => 1);

    if (!v.ok) throw new Error("mělo projít");
    // 100 kusů = 20 dávek × 10 vstupů = 200, ne 1000
    expect(v.hodnota.vstupy[0]!.nominalne).toBe(200);
    expect(v.hodnota.focus).toBe(2000);
  });
});

describe("crafting předmětu prochází stejným výpočtem", () => {
  it("T5 meč se spočítá bez zvláštního kódu", () => {
    const v = spocitat({
      polozka: najdi("T5_MAIN_SWORD"),
      enchant: 0,
      pocetVyrobku: 10,
      bonusy: { mesto: "Martlock", focus: false, denniBonus: 0 },
      lokace: mesto("Martlock"),
      cenyVstupu: new Map([["T5_METALBAR#0", cena(900)], ["T5_LEATHER#0", cena(700)]]),
      cenaVystupu: cena(30_000),
      premium: true,
      sazbaStanice: 200,
      rezimNakupu: "instant",
      rezimProdeje: "order",
    }, data.konstanty, vahaVstupu);

    if (!v.ok) throw new Error(`selhalo: ${JSON.stringify(v.chyba)}`);
    // 16 ingotů + 8 kůží na kus, 10 kusů
    expect(v.hodnota.vstupy.find((x) => x.zaklad === "T5_METALBAR")!.nominalne).toBe(160);
    expect(v.hodnota.vstupy.find((x) => x.zaklad === "T5_LEATHER")!.nominalne).toBe(80);
    expect(v.hodnota.focus).toBe(22_510);
  });
});
