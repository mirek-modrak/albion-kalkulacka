/**
 * Balíček dat uživatele — co se synchronizuje mezi zařízeními.
 *
 * Nejdůležitější vlastnost: **`jePrazdny` se nesmí splést.** Podle něj
 * se rozhoduje, jestli se nabídne přepsat data serverem, a chyba tady
 * znamená tiše smazané hodiny práce, ne rozbité vykreslení.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Náhrada localStorage pro testy — v Node neexistuje. */
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

const { VERZE_BALICKU, jePrazdny, jePrilisNovy, popis, pouzij, sesbirej } =
  await import("../src/stav/balicek");
const { nactiRefining } = await import("../src/stav/refining");
const { nactiDilnu } = await import("../src/stav/dilna");
const { PRAZDNY_REFINING } = await import("../src/stav/refining");
const { PRAZDNY_STAV } = await import("../src/stav/dilna");

const PRAZDNY_BALICEK = {
  dilna: PRAZDNY_STAV, presety: [],
  refining: PRAZDNY_REFINING, presetyRefiningu: [],
  servery: {},
};

beforeEach(() => uloziste.clear());

describe("jePrazdny — podle něj se rozhoduje o přepsání dat", () => {
  it("opravdu prázdný balíček je prázdný", () => {
    expect(jePrazdny(PRAZDNY_BALICEK)).toBe(true);
    expect(jePrazdny(null)).toBe(true);
    expect(jePrazdny(undefined)).toBe(true);
  });

  it("NEPRÁZDNÝ REFINING se NESMÍ hlásit jako prázdno", () => {
    // Tenhle test je celý důvod, proč soubor vznikl. Kdyby `jePrazdny`
    // koukalo jen na dílnu (jako před F10), zařízení s padesáti surovinami
    // v refiningu a prázdnou dílnou by při prvním přihlášení dostalo
    // nabídku „vezmi server" a seznam by zmizel.
    expect(jePrazdny({
      ...PRAZDNY_BALICEK,
      refining: { ...PRAZDNY_REFINING, klice: ["T5_METALBAR#0"] },
    })).toBe(false);
  });

  it("neprázdné presety refiningu taky nejsou prázdno", () => {
    expect(jePrazdny({
      ...PRAZDNY_BALICEK,
      presetyRefiningu: [{ nazev: "moje", stav: PRAZDNY_REFINING }],
    })).toBe(false);
  });

  it("neprázdná dílna dál není prázdno — nic se nerozbilo", () => {
    expect(jePrazdny({
      ...PRAZDNY_BALICEK,
      dilna: { ...PRAZDNY_STAV, klice: ["T5_MAIN_SWORD#0"] },
    })).toBe(false);
  });
});

describe("popis — uživatel musí vědět, o čem rozhoduje", () => {
  it("zmíní i suroviny z refiningu", () => {
    const p = popis({
      ...PRAZDNY_BALICEK,
      refining: { ...PRAZDNY_REFINING, klice: ["T5_METALBAR#0", "T6_METALBAR#0"] },
    });
    expect(p).toContain("2");
    expect(p).toContain("refiningu");
  });

  it("prázdný balíček se popíše jako prázdný", () => {
    expect(popis(PRAZDNY_BALICEK)).toBe("prázdné");
  });
});

describe("čtení staršího balíčku", () => {
  it("verze 1 bez refiningu se použije a nespadne", () => {
    // Starý tvar: refining v datech vůbec není.
    const stary = { dilna: PRAZDNY_STAV, presety: [], servery: {} };
    expect(() => pouzij(stary as never)).not.toThrow();
    expect(nactiRefining()).toEqual(PRAZDNY_REFINING);
  });

  it("poškozený refining se očistí, neuloží se rozbitý", () => {
    pouzij({
      ...PRAZDNY_BALICEK,
      refining: { klice: ["T5_METALBAR#0", 42], konfig: { ztrataDoProdeje: 99 } },
    } as never);
    const r = nactiRefining();
    expect(r.klice).toEqual(["T5_METALBAR#0"]);
    // 99 je mimo rozsah 0–1 → ořeže se na 1, ne že se uloží nesmysl.
    expect(r.konfig.ztrataDoProdeje).toBe(1);
  });

  it("dílna se čte dál stejně", () => {
    pouzij({ ...PRAZDNY_BALICEK, dilna: { ...PRAZDNY_STAV, klice: ["T5_MAIN_SWORD#0"] } });
    expect(nactiDilnu().klice).toEqual(["T5_MAIN_SWORD#0"]);
  });
});

describe("verze balíčku", () => {
  it("je 2 — refining přibyl ve F10", () => {
    expect(VERZE_BALICKU).toBe(2);
  });

  it("novější formát se odmítne číst, ne přepsat", () => {
    // Ochrana proti tomu, aby starší build přepsal data novějšího.
    expect(jePrilisNovy({ verze: VERZE_BALICKU + 1 })).toBe(true);
    expect(jePrilisNovy({ verze: VERZE_BALICKU })).toBe(false);
    expect(jePrilisNovy(null)).toBe(false);
  });
});

describe("sesbirej — co se posílá na server", () => {
  it("obsahuje refining i jeho presety", () => {
    const d = sesbirej();
    expect(d).toHaveProperty("refining");
    expect(d).toHaveProperty("presetyRefiningu");
  });

  it("kolečko sesbírej → použij → sesbírej nic neztratí", () => {
    pouzij({
      ...PRAZDNY_BALICEK,
      refining: { ...PRAZDNY_REFINING, klice: ["T5_METALBAR#0"] },
      dilna: { ...PRAZDNY_STAV, klice: ["T5_MAIN_SWORD#0"] },
    });
    const prvni = sesbirej();
    pouzij(prvni);
    const druhy = sesbirej();
    expect(druhy.refining.klice).toEqual(["T5_METALBAR#0"]);
    expect(druhy.dilna.klice).toEqual(["T5_MAIN_SWORD#0"]);
    expect(JSON.stringify(druhy)).toBe(JSON.stringify(prvni));
  });
});
