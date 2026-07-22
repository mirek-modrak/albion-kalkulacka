/**
 * Zlaté vektory pro return rate.
 *
 * Hodnoty pocházejí z herních dat a byly ručně přepočítány v prototypu.
 * Když tenhle soubor spadne po aktualizaci herních dat, znamená to, že
 * se změnila čísla, se kterými počítáme — ne že je test špatně.
 */

import { describe, expect, it } from "vitest";
import { faktorSpotreby, nasobekVyroby, returnRate, spocitatBonus } from "../src/bonusy.js";
import type { Lokace } from "../src/typy.js";

const THETFORD: Lokace = {
  nazev: "Thetford",
  typ: "mesto",
  refiningBonus: 0.18,
  craftingBonus: 0.18,
  modifikatory: { ore: 0.4, mace: 0.15 },
};

describe("returnRate — zlaté vektory", () => {
  // Vzorec RRR = bonus/(100+bonus). Tyhle dvojice reprodukuje přesně,
  // což byl hlavní důkaz, že je vzorec správný.
  it.each([
    [18, 0.1525, "město bez specializace, bez focusu"],
    [33, 0.2481, "crafting v bonusovém městě"],
    [58, 0.3671, "refining v bonusovém městě"],
    [77, 0.435, "nebonusové město + focus"],
    [92, 0.4792, "crafting bonus + focus"],
    [117, 0.5392, "refining bonus + focus"],
    [137, 0.5781, "refining bonus + focus + gold day"],
  ])("bonus %i → RRR %f (%s)", (bonus, ocekavano) => {
    expect(returnRate(bonus)).toBeCloseTo(ocekavano, 4);
  });

  it("nulový a záporný bonus dá nulovou návratnost", () => {
    expect(returnRate(0)).toBe(0);
    expect(returnRate(-10)).toBe(0);
  });

  it("nikdy nedosáhne 100 %", () => {
    expect(returnRate(1_000_000)).toBeLessThan(1);
  });
});

describe("nasobekVyroby — past, na kterou se dá naletět", () => {
  it("při 30 % je násobek 1,4286, NE 1,3", () => {
    // Vrácené suroviny se vrací znovu: 1000+300+90+27+… = 1000/0,7
    expect(nasobekVyroby(0.3)).toBeCloseTo(1.4286, 4);
    expect(nasobekVyroby(0.3)).not.toBeCloseTo(1.3, 2);
  });

  it("při 50 % je násobek 2, ne 1,5", () => {
    expect(nasobekVyroby(0.5)).toBeCloseTo(2, 6);
  });

  it("odpovídá faktoru spotřeby", () => {
    for (const rrr of [0, 0.1525, 0.3671, 0.5781]) {
      expect(nasobekVyroby(rrr) * faktorSpotreby(rrr)).toBeCloseTo(1, 10);
    }
  });
});

describe("spocitatBonus — skládání ze zdrojů", () => {
  it("Thetford + ruda + focus + gold day = 137", () => {
    const r = spocitatBonus(
      { mesto: "Thetford", focus: true, denniBonus: 20 },
      THETFORD, true, "ore", 59,
    );
    expect(r.bonusCelkem).toBe(137);
    expect(r.returnRate).toBeCloseTo(0.5781, 4);
    expect(r.rucni).toBe(false);
  });

  it("Thetford + KŮŽE nedostane bonus 40 — město má bonus na rudu", () => {
    const r = spocitatBonus(
      { mesto: "Thetford", focus: false, denniBonus: 0 },
      THETFORD, true, "hide", 59,
    );
    expect(r.bonusCelkem).toBe(18);
    expect(r.returnRate).toBeCloseTo(0.1525, 4);
  });

  it("položka bez kategorie dostane jen základ města", () => {
    const r = spocitatBonus(
      { mesto: "Thetford", focus: false, denniBonus: 0 },
      THETFORD, true, null, 59,
    );
    expect(r.bonusCelkem).toBe(18);
  });

  it("bez lokace (ostrov) nedá základ vůbec, jen focus", () => {
    const r = spocitatBonus(
      { mesto: "?", focus: true, denniBonus: 0 },
      undefined, true, "ore", 59,
    );
    expect(r.bonusCelkem).toBe(59);
  });

  it("ruční hodnota přebije všechno ostatní", () => {
    const r = spocitatBonus(
      { mesto: "Thetford", focus: true, denniBonus: 20, rucniReturnRate: 0.26 },
      THETFORD, true, "ore", 59,
    );
    expect(r.returnRate).toBe(0.26);
    expect(r.rucni).toBe(true);
    expect(r.nasobek).toBeCloseTo(1.3514, 4);
  });

  it("crafting používá craftingBonus, ne refiningBonus", () => {
    const lokace: Lokace = { ...THETFORD, refiningBonus: 0.18, craftingBonus: 0.05 };
    const r = spocitatBonus(
      { mesto: "Thetford", focus: false, denniBonus: 0 }, lokace, false, "mace", 59,
    );
    // 5 základ + 15 mace = 20
    expect(r.bonusCelkem).toBeCloseTo(20, 6);
  });
});
