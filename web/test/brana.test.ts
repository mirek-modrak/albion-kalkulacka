/**
 * Přihlašovací zeď — rozhodování.
 *
 * Testuje se především **negativní prostor**: co má zeď zastavit.
 * Že pustí povoleného uživatele, je ta snadnější půlka.
 */

import { describe, expect, it, vi } from "vitest";

class FalesneUloziste {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}
vi.stubGlobal("localStorage", new FalesneUloziste());

const {
  OFFLINE_LHUTA_MS, posledniOvereni, prelozChybu, rozhodni, zapisOvereni,
} = await import("../src/stav/brana");

const TED = 1_800_000_000_000;

describe("zeď zastaví toho, koho má", () => {
  it("server odepřel → nepustí, i kdyby se uživatel ověřil před chvílí", () => {
    // Odebrání ze seznamu musí platit okamžitě. Kdyby tady rozhodovala
    // offline lhůta, vyhozený uživatel by měl ještě týden přístup.
    const stav = rozhodni("odepreno", TED - 1000, TED);
    expect(stav).toEqual({ druh: "odepreno", duvod: "neniNaSeznamu" });
  });

  it("server nedostupný a uživatel se nikdy neověřil → nepustí", () => {
    expect(rozhodni("nedostupno", null, TED)).toEqual({
      druh: "odepreno", duvod: "offlinePrilisDlouho",
    });
  });

  it("server nedostupný a ověření starší než lhůta → nepustí", () => {
    const stary = TED - OFFLINE_LHUTA_MS - 1;
    expect(rozhodni("nedostupno", stary, TED)).toEqual({
      druh: "odepreno", duvod: "offlinePrilisDlouho",
    });
  });
});

describe("zeď pustí toho, koho má", () => {
  it("server povolil → pustí a nehlásí offline", () => {
    expect(rozhodni("povoleno", null, TED)).toEqual({ druh: "pusteno", offline: false });
  });

  it("server nedostupný, ale ověření je čerstvé → pustí s poznámkou", () => {
    const vcera = TED - 24 * 60 * 60 * 1000;
    expect(rozhodni("nedostupno", vcera, TED)).toEqual({ druh: "pusteno", offline: true });
  });

  it("hranice lhůty přesně → ještě pustí", () => {
    expect(rozhodni("nedostupno", TED - OFFLINE_LHUTA_MS, TED)).toEqual({
      druh: "pusteno", offline: true,
    });
  });
});

describe("výpadek sítě se nesmí tvářit jako odepření", () => {
  it("permission-denied = server řekl ne", () => {
    expect(prelozChybu("permission-denied")).toBe("odepreno");
  });

  it("unavailable = server neodpověděl", () => {
    expect(prelozChybu("unavailable")).toBe("nedostupno");
  });

  it("neznámá i chybějící chyba se bere jako nedostupnost, ne jako odepření", () => {
    // Opatrnější směr: raději pustit podle offline lhůty, než někomu
    // tvrdit „nemáš přístup" kvůli chybě, které nerozumíme.
    expect(prelozChybu("cosi-jineho")).toBe("nedostupno");
    expect(prelozChybu(undefined)).toBe("nedostupno");
  });
});

describe("záznam o ověření", () => {
  it("co se zapíše, to se přečte — a drží se zvlášť pro každý e-mail", () => {
    zapisOvereni("a@x.cz", TED);
    zapisOvereni("b@x.cz", TED - 5000);
    expect(posledniOvereni("a@x.cz")).toBe(TED);
    expect(posledniOvereni("b@x.cz")).toBe(TED - 5000);
  });

  it("neznámý e-mail nemá záznam", () => {
    expect(posledniOvereni("nikdo@x.cz")).toBeNull();
  });

  it("poškozený záznam se tváří jako žádný, ne jako nula", () => {
    // Nula by znamenala „ověřen v roce 1970" → offline lhůta by ho
    // vyhodnotila jako dávno prošlou. To je náhodou správně, ale spoléhat
    // se na náhodu nechceme.
    localStorage.setItem("albion:overeno:x@x.cz", "tohle není číslo");
    expect(posledniOvereni("x@x.cz")).toBeNull();
  });
});
