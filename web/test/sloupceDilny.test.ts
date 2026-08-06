/**
 * Volitelné sloupce tabulky v Dílně.
 *
 * Nejcennější test je ten poslední: **ukládají se vypnuté sloupce, ne
 * zapnuté.** Kdyby to bylo obráceně, sloupec přidaný v budoucí verzi by se
 * nikomu neobjevil a nikdo by nevěděl, že existuje.
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

const {
  SLOUPCE, VYCHOZI_SKRYTE, nactiSkryte, prepniSloupec, skryvamePodleCehoRadime,
  ulozSkryte, viditelne,
} = await import("../src/stav/sloupceDilny");

describe("výběr sloupců", () => {
  it("ve výchozím stavu je vypnuté jen Stáří — u ručních cen je vždy prázdné", () => {
    falesne.clear();
    expect(nactiSkryte()).toEqual(["stari"]);
    expect(viditelne(nactiSkryte()).some((s) => s.id === "stari")).toBe(false);
  });

  it("přepínání zapíná a vypíná", () => {
    expect(prepniSloupec([], "marze")).toEqual(["marze"]);
    expect(prepniSloupec(["marze"], "marze")).toEqual([]);
  });

  it("název položky se v nabídce vůbec nevyskytuje — nesmí jít vypnout", () => {
    // Bez názvu jsou řádky k nerozeznání a uživatel by se z toho nedostal.
    expect(SLOUPCE.some((s) => (s.id as string) === "nazev")).toBe(false);
  });

  it("co se uloží, to se načte", () => {
    falesne.clear();
    ulozSkryte(["marze", "likvidita"]);
    expect(nactiSkryte()).toEqual(["marze", "likvidita"]);
  });

  it("prázdný seznam znamená VŠECHNY sloupce zapnuté, ne návrat k výchozímu", () => {
    falesne.clear();
    ulozSkryte([]);
    expect(nactiSkryte()).toEqual([]);
    expect(viditelne(nactiSkryte())).toHaveLength(SLOUPCE.length);
  });
});

describe("aplikace musí nastartovat vždycky", () => {
  it("poškozený obsah vrátí výchozí volbu", () => {
    falesne.clear();
    localStorage.setItem("albion:sloupce-dilny:v1", "{tohle není JSON");
    expect(() => nactiSkryte()).not.toThrow();
    expect(nactiSkryte()).toEqual(VYCHOZI_SKRYTE);
  });

  it("neznámé id sloupce se zahodí — přežije to přejmenování", () => {
    falesne.clear();
    localStorage.setItem("albion:sloupce-dilny:v1", JSON.stringify(["marze", "uz-neexistuje"]));
    expect(nactiSkryte()).toEqual(["marze"]);
  });
});

describe("řazení podle sloupce, který se chystáme vypnout", () => {
  it("pozná se, že se právě podle něj řadí", () => {
    expect(skryvamePodleCehoRadime("marze", "marze")).toBe(true);
    expect(skryvamePodleCehoRadime("marze", "zisk")).toBe(false);
  });

  it("sloupec bez řazení nikdy nevrátí true, i kdyby se řazení jmenovalo stejně", () => {
    // Editovatelná cena se neřadí — vypnutí nesmí sáhnout na řazení.
    expect(skryvamePodleCehoRadime("prodej", "rucni")).toBe(false);
    expect(skryvamePodleCehoRadime("kdeKam", "rucni")).toBe(false);
  });
});
