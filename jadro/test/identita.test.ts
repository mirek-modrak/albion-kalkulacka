/**
 * Identita položky.
 *
 * Tohle je místo, kde jsem v prototypu udělal chybu, a kde se struktura
 * herních dat mezi surovinami a výbavou LIŠÍ. Proto sem patří nejvíc testů.
 */

import { describe, expect, it } from "vitest";
import { aodpId, herniId, klicPolozky, stejnaPolozka, tierZeZakladu, zAodpId } from "../src/identita.js";

describe("herniId", () => {
  it("bez enchantu je základ nezměněný — u obou druhů", () => {
    expect(herniId({ zaklad: "T5_METALBAR", enchant: 0 }, "surovina")).toBe("T5_METALBAR");
    expect(herniId({ zaklad: "T5_MAIN_SWORD", enchant: 0 }, "vybava")).toBe("T5_MAIN_SWORD");
  });

  it("surovina s enchantem dostane příponu _LEVELn", () => {
    expect(herniId({ zaklad: "T5_METALBAR", enchant: 4 }, "surovina")).toBe("T5_METALBAR_LEVEL4");
  });

  it("výbava s enchantem se NEMĚNÍ — enchant je vnořený prvek", () => {
    expect(herniId({ zaklad: "T5_MAIN_SWORD", enchant: 3 }, "vybava")).toBe("T5_MAIN_SWORD");
  });
});

describe("aodpId", () => {
  it("bez enchantu bez zavináče", () => {
    expect(aodpId({ zaklad: "T5_METALBAR", enchant: 0 }, "surovina")).toBe("T5_METALBAR");
  });

  it("surovina: _LEVELn A ZÁROVEŇ @n", () => {
    expect(aodpId({ zaklad: "T5_METALBAR", enchant: 4 }, "surovina")).toBe("T5_METALBAR_LEVEL4@4");
  });

  it("výbava: jen @n, bez _LEVELn", () => {
    expect(aodpId({ zaklad: "T5_MAIN_SWORD", enchant: 2 }, "vybava")).toBe("T5_MAIN_SWORD@2");
  });
});

describe("zAodpId — rozklad zpět", () => {
  it.each([
    ["T5_METALBAR", "T5_METALBAR", 0],
    ["T5_METALBAR_LEVEL4@4", "T5_METALBAR", 4],
    ["T5_MAIN_SWORD@2", "T5_MAIN_SWORD", 2],
    ["T8_PLANKS_LEVEL1@1", "T8_PLANKS", 1],
  ])("%s → %s ench %i", (id, zaklad, enchant) => {
    expect(zAodpId(id)).toEqual({ zaklad, enchant });
  });

  it("je opačnou operací k aodpId (obousměrně, oba druhy)", () => {
    for (const [zaklad, druh] of [["T6_CLOTH", "surovina"], ["T6_2H_BOW", "vybava"]] as const) {
      for (const enchant of [0, 1, 2, 3, 4] as const) {
        const id = aodpId({ zaklad, enchant }, druh);
        expect(zAodpId(id)).toEqual({ zaklad, enchant });
      }
    }
  });
});

describe("pomocné", () => {
  it("tier se přečte z prefixu", () => {
    expect(tierZeZakladu("T5_METALBAR")).toBe(5);
    expect(tierZeZakladu("NECO_JINEHO")).toBeNull();
  });

  it("stejnaPolozka rozliší enchant", () => {
    expect(stejnaPolozka({ zaklad: "A", enchant: 0 }, { zaklad: "A", enchant: 0 })).toBe(true);
    expect(stejnaPolozka({ zaklad: "A", enchant: 0 }, { zaklad: "A", enchant: 1 })).toBe(false);
  });

  it("klíč je jednoznačný", () => {
    expect(klicPolozky({ zaklad: "T5_METALBAR", enchant: 4 })).toBe("T5_METALBAR#4");
  });
});
