/**
 * Uložení stavu v prohlížeči.
 *
 * Nejdůležitější vlastnost: **aplikace musí nastartovat vždy.**
 * Uložená data jsou pohodlí, ne nutnost — poškozená nebo ze starší verze
 * se zahodí a jede se dál.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Náhrada localStorage pro testy — v Node neexistuje. */
class FalesneUloziste {
  private data = new Map<string, string>();
  /** Když je nastaveno, `setItem` selže — simuluje překročení kapacity. */
  limitBajtu: number | null = null;

  getItem(k: string) { return this.data.get(k) ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); this.limitBajtu = null; }
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }

  setItem(k: string, v: string) {
    if (this.limitBajtu !== null && v.length > this.limitBajtu) {
      throw new DOMException("kapacita", "QuotaExceededError");
    }
    this.data.set(k, v);
  }
}

const falesne = new FalesneUloziste();
vi.stubGlobal("localStorage", falesne);

// Import až po nastavení globálu — modul si při načtení zjišťuje dostupnost.
const {
  nacti, uloz, zapomen, naCenu,
  nactiUlozenouHistorii, ulozHistorii, zapomenHistorii,
} = await import("../src/stav/uloziste");

const cena = (zmeny: Partial<import("../src/stav/uloziste").UlozenaCena> = {}) => ({
  mesto: "Thetford", zaklad: "T5_ORE", enchant: 0,
  typ: "sell_min" as const, hodnota: 500, zdroj: "aodp" as const,
  cas: new Date().toISOString().slice(0, 19),
  ...zmeny,
});

/** Zápis je odložený — testy si ho musí vynutit. */
async function pockejNaZapis() {
  await new Promise((r) => setTimeout(r, 600));
}

beforeEach(() => falesne.clear());

describe("uložení a načtení", () => {
  it("co se uloží, to se načte", async () => {
    uloz("west", { mesto: "Martlock", focus: true }, [cena()]);
    await pockejNaZapis();

    const nactene = nacti("west");
    expect(nactene.nastaveni?.mesto).toBe("Martlock");
    expect(nactene.nastaveni?.focus).toBe(true);
    expect(nactene.ceny).toHaveLength(1);
    expect(nactene.ceny[0]!.hodnota).toBe(500);
  });

  it("prázdné úložiště vrátí prázdný výsledek, ne chybu", () => {
    expect(nacti("west")).toEqual({ ceny: [] });
  });

  it("ceny se ukládají zvlášť pro každý server", async () => {
    // Ceny z `west` nesmí platit pro `europe` — jsou to oddělené ekonomiky.
    uloz("west", {}, [cena({ hodnota: 111 })]);
    await pockejNaZapis();
    uloz("europe", {}, [cena({ hodnota: 999 })]);
    await pockejNaZapis();

    expect(nacti("west").ceny[0]!.hodnota).toBe(111);
    expect(nacti("europe").ceny[0]!.hodnota).toBe(999);
  });

  it("zapomenutí smaže jen daný server", async () => {
    uloz("west", {}, [cena()]);
    await pockejNaZapis();
    uloz("east", {}, [cena()]);
    await pockejNaZapis();

    zapomen("west");
    expect(nacti("west").ceny).toHaveLength(0);
    expect(nacti("east").ceny).toHaveLength(1);
  });
});

describe("aplikace musí nastartovat vždy", () => {
  it("poškozený obsah nezpůsobí výjimku", () => {
    falesne.setItem("albion:v1:west", "{tohle není JSON");
    expect(() => nacti("west")).not.toThrow();
    expect(nacti("west").ceny).toEqual([]);
  });

  it("data z jiné verze formátu se zahodí", () => {
    falesne.setItem("albion:v1:west", JSON.stringify({
      verze: 99, ulozeno: "x", ceny: [cena()],
    }));
    expect(nacti("west").ceny).toEqual([]);
  });

  it("chybějící pole `ceny` nezpůsobí pád", () => {
    falesne.setItem("albion:v1:west", JSON.stringify({ verze: 1, ulozeno: "x" }));
    expect(() => nacti("west")).not.toThrow();
    expect(nacti("west").ceny).toEqual([]);
  });

  it("nesmyslné položky v seznamu se přeskočí", () => {
    falesne.setItem("albion:v1:west", JSON.stringify({
      verze: 1, ulozeno: "x",
      ceny: [null, { hodnota: "není číslo" }, cena()],
    }));
    expect(nacti("west").ceny).toHaveLength(1);
  });
});

describe("stárnutí cen", () => {
  it("ceny starší než týden se neobnoví", () => {
    const stara = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 19);
    falesne.setItem("albion:v1:west", JSON.stringify({
      verze: 1, ulozeno: "x", ceny: [cena({ cas: stara })],
    }));
    expect(nacti("west").ceny).toHaveLength(0);
  });

  it("RUČNÍ ceny se nezahazují ani po roce", () => {
    // U ručních cen stáří neznamená totéž — je to vědomý zásah uživatele.
    const davno = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 19);
    falesne.setItem("albion:v1:west", JSON.stringify({
      verze: 1, ulozeno: "x", ceny: [cena({ cas: davno, zdroj: "rucne" })],
    }));
    expect(nacti("west").ceny).toHaveLength(1);
  });

  it("čerstvé ceny zůstanou", () => {
    const vcera = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19);
    falesne.setItem("albion:v1:west", JSON.stringify({
      verze: 1, ulozeno: "x", ceny: [cena({ cas: vcera })],
    }));
    expect(nacti("west").ceny).toHaveLength(1);
  });
});

describe("překročení kapacity", () => {
  it("při přeplnění se zahodí ceny z AODP, ale RUČNÍ zůstanou", async () => {
    const mnoho = [
      ...Array.from({ length: 200 }, (_, i) => cena({ zaklad: `T5_POLOZKA_${i}` })),
      cena({ zaklad: "RUCNI_CENA", zdroj: "rucne", hodnota: 777 }),
    ];

    // Kapacita jen na malou část — plný zápis selže, druhý pokus projde.
    falesne.limitBajtu = 400;
    uloz("west", {}, mnoho);
    await pockejNaZapis();
    falesne.limitBajtu = null;

    const nactene = nacti("west").ceny;
    // Ruční je vědomá práce uživatele — nesmí zmizet.
    expect(nactene.some((c) => c.zaklad === "RUCNI_CENA")).toBe(true);
    expect(nactene.every((c) => c.zdroj === "rucne")).toBe(true);
  });

  it("když se nevejde ani to, aplikace nespadne", async () => {
    falesne.limitBajtu = 1;
    expect(() => uloz("west", {}, [cena()])).not.toThrow();
    await pockejNaZapis();
    falesne.limitBajtu = null;
  });
});

describe("historie obchodů má VLASTNÍ klíč", () => {
  const souhrn = (zmeny: Partial<import("../src/stav/skladHistorie").UlozenySouhrn> = {}) => ({
    mesto: "Caerleon", zaklad: "T5_PLANKS", enchant: 0,
    medianTyden: 1000, objemTyden: 5000, objemOkno: 20000,
    minOkno: 900, maxOkno: 1100, dniTydne: 7, dniOkna: 30,
    posledniDen: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    ...zmeny,
  });

  const dnes = () => new Date().toISOString().slice(0, 10);

  it("co se uloží, to se načte — včetně null hodnot", () => {
    ulozHistorii("west", [souhrn(), souhrn({
      mesto: "Lymhurst", objemTyden: null, medianTyden: null, dniTydne: 0,
    })], dnes());

    const n = nactiUlozenouHistorii("west");
    expect(n.souhrny).toHaveLength(2);
    expect(n.konecOkna).toBe(dnes());
    // Null je nositel „nevíme" — po JSON kolečku nesmí být 0.
    const lymhurst = n.souhrny.find((s) => s.mesto === "Lymhurst")!;
    expect(lymhurst.objemTyden).toBeNull();
    expect(lymhurst.objemTyden).not.toBe(0);
  });

  it("PŘEPLNĚNÁ HISTORIE NESMÍ SHODIT CENY", () => {
    // Tohle je celý důvod, proč má historie oddělený klíč. Kdyby seděla
    // ve stejném záznamu jako ceny, zápis by při přeplnění zahodil ceny
    // z AODP — a uživatel by přišel o sken kvůli doplňkovému údaji.
    falesne.setItem("albion:v1:west", JSON.stringify({
      verze: 1, ulozeno: "x",
      ceny: [cena({ hodnota: 12345 })],
    }));

    falesne.limitBajtu = 10;                       // historie se nevejde
    expect(() => ulozHistorii("west", [souhrn()], dnes())).not.toThrow();
    falesne.limitBajtu = null;

    // Ceny musí být netknuté.
    expect(nacti("west").ceny[0]!.hodnota).toBe(12345);
    // Historie prostě není — dopočítá se dalším skenem.
    expect(nactiUlozenouHistorii("west").souhrny).toEqual([]);
  });

  it("zapomenutí historie nesmaže ceny", async () => {
    uloz("west", {}, [cena()]);
    await pockejNaZapis();
    ulozHistorii("west", [souhrn()], dnes());

    zapomenHistorii("west");

    expect(nactiUlozenouHistorii("west").souhrny).toEqual([]);
    expect(nacti("west").ceny).toHaveLength(1);
  });

  it("historie se drží zvlášť pro každý server", () => {
    ulozHistorii("west", [souhrn({ medianTyden: 111 })], dnes());
    ulozHistorii("europe", [souhrn({ medianTyden: 999 })], dnes());

    expect(nactiUlozenouHistorii("west").souhrny[0]!.medianTyden).toBe(111);
    expect(nactiUlozenouHistorii("europe").souhrny[0]!.medianTyden).toBe(999);
  });
});

describe("historie — aplikace musí nastartovat vždy", () => {
  it("přetočené okno se zahodí celé", () => {
    // Konec okna starší než 30 dní = ani jeden den souhrnu už neplatí.
    // Půlka starých souhrnů je horší než žádné — vypadala by stejně
    // důvěryhodně jako čerstvé.
    const davno = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
    falesne.setItem("albion:h3:west", JSON.stringify({
      verze: 3, konecOkna: davno,
      souhrny: [{ mesto: "Caerleon", zaklad: "T5_PLANKS", enchant: 0 }],
    }));
    expect(nactiUlozenouHistorii("west").souhrny).toEqual([]);
  });

  it("okno staré pár dní zůstane", () => {
    const nedavno = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    falesne.setItem("albion:h3:west", JSON.stringify({
      verze: 3, konecOkna: nedavno,
      souhrny: [{ mesto: "Caerleon", zaklad: "T5_PLANKS", enchant: 0 }],
    }));
    expect(nactiUlozenouHistorii("west").souhrny).toHaveLength(1);
  });

  it("poškozený obsah nezpůsobí výjimku", () => {
    falesne.setItem("albion:h3:west", "{tohle není JSON");
    expect(() => nactiUlozenouHistorii("west")).not.toThrow();
    expect(nactiUlozenouHistorii("west").souhrny).toEqual([]);
  });

  it("jiná verze formátu se zahodí", () => {
    falesne.setItem("albion:h3:west", JSON.stringify({
      verze: 99, konecOkna: null, souhrny: [{ mesto: "Caerleon", zaklad: "T5_PLANKS" }],
    }));
    expect(nactiUlozenouHistorii("west").souhrny).toEqual([]);
  });

  it("nesmyslné položky v seznamu se přeskočí", () => {
    falesne.setItem("albion:h3:west", JSON.stringify({
      verze: 3, konecOkna: null,
      souhrny: [null, { mesto: "Caerleon" }, { mesto: "Caerleon", zaklad: "T5_PLANKS" }],
    }));
    expect(nactiUlozenouHistorii("west").souhrny).toHaveLength(1);
  });

  it("prázdné úložiště vrátí prázdný výsledek", () => {
    expect(nactiUlozenouHistorii("west")).toEqual({ souhrny: [], konecOkna: null });
  });
});

describe("převod na typ jádra", () => {
  it("zachová čas a původ", () => {
    const c = naCenu(cena({ cas: "2026-07-22T10:00:00", zdroj: "rucne" }));
    // Čas se NIKDY nepřerazítkovává — stáří dat musí být skutečné stáří dat.
    expect(c.cas).toBe("2026-07-22T10:00:00");
    expect(c.zdroj).toBe("rucne");
  });
});

describe("úklid starých verzí historie", () => {
  it("osiřelý záznam ze starší verze se smaže", () => {
    // Zvýšení verze ho jen přestane číst. Historie zabírá stovky kB,
    // takže po pár verzích by osiřelé záznamy vytlačily ty živé
    // a historie by se tiše přestala ukládat.
    falesne.setItem("albion:h1:west", JSON.stringify({ verze: 1, konecOkna: null, souhrny: [] }));
    nactiUlozenouHistorii("west");
    expect(falesne.getItem("albion:h1:west")).toBeNull();
  });

  it("úklid se netýká jiného serveru ani cen", () => {
    falesne.setItem("albion:h1:europe", "x");
    falesne.setItem("albion:v1:west", "y");
    nactiUlozenouHistorii("west");
    expect(falesne.getItem("albion:h1:europe")).toBe("x");
    expect(falesne.getItem("albion:v1:west")).toBe("y");
  });
});
