/**
 * Nastavení na třech úrovních.
 *
 * Nejdůležitější vlastnost: **migrace nesmí změnit čísla.** Kdyby stará
 * hodnota poplatku nebo dávky spadla na výchozí, uživateli by se po
 * aktualizaci tiše přepočítalo všechno a vypadalo by to, že se rozbil
 * výpočet.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

class FalesneUloziste {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
}

const uloziste = new FalesneUloziste();
vi.stubGlobal("localStorage", uloziste);

const {
  KARTY, VYCHOZI_GLOBALNI, VYCHOZI_KARTA, nactiNastaveni, ocistiNastaveni,
  ulozNastaveni, vychoziNastaveni, zeSpolecneho,
} = await import("../src/stav/nastaveni");
const { STANICE, VYCHOZI_SAZBA, sazbaProKategorii } = await import("../src/stav/stanice");
const { ulozIhned } = await import("../src/stav/uloziste");

beforeEach(() => uloziste.clear());

describe("migrace ze společného nastavení", () => {
  const stare = {
    premium: false, denniBonus: 10, pocetVyrobku: 250, focus: true,
    rezimNakupu: "order" as const, rezimProdeje: "instant" as const, sazbaStanice: 385,
  };

  it("stará sazba platí pro VŠECHNY stanice", () => {
    // Tohle je jádro migrace. Bez toho by po aktualizaci Tavírna i kovárna
    // spadly na výchozí sazbu a náklady by se změnily samy od sebe.
    const n = zeSpolecneho(stare);
    for (const s of STANICE) expect(n.sazby[s.id]).toBe(385);
    expect(sazbaProKategorii(n.sazby, "ore")).toBe(385);
    expect(sazbaProKategorii(n.sazby, "holystaff")).toBe(385);
  });

  it("stará dávka, focus a režimy platí pro VŠECHNY karty", () => {
    const n = zeSpolecneho(stare);
    for (const k of KARTY) {
      expect(n.karty[k].pocetVyrobku).toBe(250);
      expect(n.karty[k].focus).toBe(true);
      expect(n.karty[k].rezimNakupu).toBe("order");
      expect(n.karty[k].rezimProdeje).toBe("instant");
    }
  });

  it("premium a denní bonus jdou do globální úrovně", () => {
    const n = zeSpolecneho(stare);
    expect(n.globalni.premium).toBe(false);
    expect(n.globalni.denniBonus).toBe(10);
  });

  it("karty jsou NEZÁVISLÉ kopie, ne sdílený objekt", () => {
    // Kdyby sdílely referenci, změna dávky v Refiningu by ji změnila
    // i v Dílně — tedy přesně ta vada, kvůli které se to rozdělovalo.
    const n = zeSpolecneho(stare);
    n.karty.refining.pocetVyrobku = 999;
    expect(n.karty.dilna.pocetVyrobku).toBe(250);
  });

  it("chybějící stará hodnota nespadne, vezme se výchozí", () => {
    const n = zeSpolecneho({});
    expect(n.globalni).toEqual(VYCHOZI_GLOBALNI);
    expect(n.karty.dilna).toEqual(VYCHOZI_KARTA);
    // Bez staré sazby zůstanou stanice nenastavené → výchozí, ne nula.
    expect(sazbaProKategorii(n.sazby, "ore")).toBe(VYCHOZI_SAZBA);
    expect(sazbaProKategorii(n.sazby, "ore")).toBeGreaterThan(0);
  });

  it("sazba 0 se zachová — vlastní stanice zdarma existuje", () => {
    const n = zeSpolecneho({ ...stare, sazbaStanice: 0 });
    expect(sazbaProKategorii(n.sazby, "ore")).toBe(0);
  });
});

describe("načtení z úložiště", () => {
  it("bez uložených dat vezme staré nastavení skenu a převede ho", () => {
    ulozIhned("west", { sazbaStanice: 385, pocetVyrobku: 250, premium: false }, []);
    const n = nactiNastaveni("west");
    expect(sazbaProKategorii(n.sazby, "ore")).toBe(385);
    expect(n.karty.dilna.pocetVyrobku).toBe(250);
    expect(n.globalni.premium).toBe(false);
  });

  it("uložené nové nastavení má přednost před migrací", () => {
    ulozIhned("west", { sazbaStanice: 385 }, []);
    const nove = vychoziNastaveni();
    nove.sazby = { tavirna: 111 };
    ulozNastaveni("west", nove);

    expect(sazbaProKategorii(nactiNastaveni("west").sazby, "ore")).toBe(111);
  });

  it("servery se nemíchají", () => {
    const zapad = vychoziNastaveni();
    zapad.sazby = { tavirna: 111 };
    ulozNastaveni("west", zapad);

    expect(sazbaProKategorii(nactiNastaveni("europe").sazby, "ore")).toBe(VYCHOZI_SAZBA);
  });

  it("úplně prázdné úložiště dá výchozí nastavení, ne pád", () => {
    const n = nactiNastaveni("west");
    expect(n.karty.refining.pocetVyrobku).toBe(VYCHOZI_KARTA.pocetVyrobku);
    expect(KARTY.every((k) => n.karty[k] !== undefined)).toBe(true);
  });

  it("poškozený obsah nespadne", () => {
    localStorage.setItem("albion:nastaveni:v1:west", "{tohle není json");
    expect(() => nactiNastaveni("west")).not.toThrow();
  });
});

describe("očištění", () => {
  it("nesmyslný vstup dá platné nastavení pro všechny karty", () => {
    for (const x of [null, undefined, 42, "text", [], {}]) {
      const n = ocistiNastaveni(x);
      expect(KARTY.every((k) => n.karty[k].pocetVyrobku >= 1)).toBe(true);
    }
  });

  it("nulová nebo záporná dávka se opraví na 1", () => {
    // Dělí se jí při přepočtu na kus — nula by dala Infinity.
    expect(ocistiNastaveni({ karty: { dilna: { pocetVyrobku: 0 } } }).karty.dilna.pocetVyrobku)
      .toBe(1);
    expect(ocistiNastaveni({ karty: { dilna: { pocetVyrobku: -5 } } }).karty.dilna.pocetVyrobku)
      .toBe(1);
  });

  it("neplatný režim spadne na výchozí", () => {
    const n = ocistiNastaveni({ karty: { dilna: { rezimNakupu: "vymysleny" } } });
    expect(n.karty.dilna.rezimNakupu).toBe(VYCHOZI_KARTA.rezimNakupu);
  });

  it("kolečko uložit → načíst nic neztratí", () => {
    const n = vychoziNastaveni();
    n.globalni.denniBonus = 20;
    n.karty.refining.pocetVyrobku = 500;
    n.karty.dilna.pocetVyrobku = 10;
    n.sazby = { tavirna: 385, forge: 500 };
    ulozNastaveni("west", n);

    const zpet = nactiNastaveni("west");
    expect(zpet.globalni.denniBonus).toBe(20);
    expect(zpet.karty.refining.pocetVyrobku).toBe(500);
    expect(zpet.karty.dilna.pocetVyrobku).toBe(10);
    expect(zpet.sazby.tavirna).toBe(385);
    expect(zpet.sazby.forge).toBe(500);
  });
});
