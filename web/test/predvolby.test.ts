/**
 * Předvolby, které si aplikace pamatuje mezi spuštěními.
 *
 * Vzniklo z chyby: vybraný server se nikde neukládal, aplikace vždycky
 * nastartovala na `west` a načetla jeho nastavení. Kdo hraje na Europe,
 * viděl po každém obnovení stránky cizí město a „chybí cena".
 */

import { describe, expect, it, vi } from "vitest";

class FalesneUloziste {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
}
const falesne = new FalesneUloziste();
vi.stubGlobal("localStorage", falesne);

const { nactiPredvolby, ulozPredvolby, vychoziPredvolby } =
  await import("../src/stav/predvolby");

const NOSNOST = 4116;

describe("volba serveru přežije obnovení stránky", () => {
  it("co se uloží, to se načte", () => {
    falesne.clear();
    ulozPredvolby({ ...vychoziPredvolby(NOSNOST), server: "europe" });
    expect(nactiPredvolby(NOSNOST).server).toBe("europe");
  });

  it("bez uložených předvoleb se začíná na `west`", () => {
    falesne.clear();
    expect(nactiPredvolby(NOSNOST).server).toBe("west");
  });

  it("pamatuje se i metrika, stáří dat, přepínač jen ziskové a otevřená záložka", () => {
    falesne.clear();
    ulozPredvolby({
      ...vychoziPredvolby(NOSNOST),
      metrika: "ziskNaKg", maxStari: 168, jenZiskove: true, rezim: "dilna",
    });
    const p = nactiPredvolby(NOSNOST);
    expect(p.metrika).toBe("ziskNaKg");
    expect(p.maxStari).toBe(168);
    expect(p.jenZiskove).toBe(true);
    expect(p.rezim).toBe("dilna");
  });

  it("pamatuje se nastavení převozu", () => {
    falesne.clear();
    ulozPredvolby({
      ...vychoziPredvolby(NOSNOST),
      prevoz: { vychoziMesto: "Martlock", nosnostKg: 999, ztrataZasilek: 0.2 },
      metrikaPrevozu: "marze",
    });
    const p = nactiPredvolby(NOSNOST);
    expect(p.prevoz).toEqual({ vychoziMesto: "Martlock", nosnostKg: 999, ztrataZasilek: 0.2 });
    expect(p.metrikaPrevozu).toBe("marze");
  });
});

describe("aplikace musí nastartovat vždycky", () => {
  it("poškozený obsah nezpůsobí pád a vrátí výchozí předvolby", () => {
    falesne.clear();
    localStorage.setItem("albion:predvolby:v1", "{tohle není JSON");
    expect(() => nactiPredvolby(NOSNOST)).not.toThrow();
    expect(nactiPredvolby(NOSNOST)).toEqual(vychoziPredvolby(NOSNOST));
  });

  it("neexistující server se zahodí — jinak by aplikace ukazovala prázdno", () => {
    falesne.clear();
    localStorage.setItem("albion:predvolby:v1", JSON.stringify({ server: "mars" }));
    expect(nactiPredvolby(NOSNOST).server).toBe("west");
  });

  it("nesmyslné hodnoty se nahradí výchozími, ne aby shodily start", () => {
    falesne.clear();
    localStorage.setItem("albion:predvolby:v1", JSON.stringify({
      metrika: "vymyšlená", maxStari: "není číslo", jenZiskove: "možná",
      rezim: 42, metrikaPrevozu: null, prevoz: "taky ne",
    }));
    const p = nactiPredvolby(NOSNOST);
    expect(p).toEqual(vychoziPredvolby(NOSNOST));
  });

  it("chybějící část předvoleb se doplní výchozí, zbytek zůstane", () => {
    falesne.clear();
    localStorage.setItem("albion:predvolby:v1", JSON.stringify({ server: "east" }));
    const p = nactiPredvolby(NOSNOST);
    expect(p.server).toBe("east");
    expect(p.metrika).toBe(vychoziPredvolby(NOSNOST).metrika);
    expect(p.prevoz.nosnostKg).toBe(NOSNOST);
  });
});
