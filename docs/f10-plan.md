# F10 — karta Refining

**Zadání (Mirek, 2026-08-10):** *„Chtěl bych dodělat jednu kartu na refining.
Obdoba dílny, ale pouze pro refining. Musí tam být snadno nastavitelné
a přehledné kde koupit, kde refining, kde prodat, marže, filtry (města,
suroviny) a zase seznam vlastních."*

Rozsah schválen v plné variantě: jádro karty + logistika + „koupit vs. vyrobit".

---

## 1. Proč to není Dílna s jiným seznamem

### a) Dnešní výpočet neumí oddělit město nákupu

V [sken.ts](../web/src/stav/sken.ts) se ceny vstupů čtou vždy z
`nastaveni.mesto`, tedy z města výroby:

```ts
const cena = sklad.ziskej(nastaveni.mesto, vstup.zaklad, vstup.enchant, typNakup);
```

Prodej má vlastní město (`mistoProdeje`), nákup ne. „Kde koupit ≠ kde
refinovat" dnes nejde nastavit vůbec. Je to hlavní nová schopnost F10.

### b) Black Market pro refining neexistuje

Ověřeno už v F5 a zapsáno v [sken.ts](../web/src/stav/sken.ts):
T5 Planks i T5 Metal Bar mají na BM v týdenním okně **nulový objem**.
`bmObchodujeSkupinu(SUROVINY_ID)` proto vrací `false`.

Celá větev „prodat na BM / vézt na BM / nižší setup fee na BM", která
v Dílně tvoří půlku složitosti, v refiningu **odpadá**. Prodává se
výhradně na jednu ze 7 městských tržnic.

### c) Město refiningu je největší páka ve hře

Z `jadro/data/hra.json` (ověřeno 2026-08-10):

| Linka | Město s bonusem | Bonus celkem | Return rate |
|---|---|---|---|
| ruda → ingoty (`ore`) | Thetford | 18 + 40 = 58 % | **36,7 %** |
| vlákno → látka (`fiber`) | Lymhurst | 58 % | 36,7 % |
| kámen → bloky (`rock`) | Bridgewatch | 58 % | 36,7 % |
| kůže → leather (`hide`) | Martlock | 58 % | 36,7 % |
| dřevo → prkna (`wood`) | Fort Sterling | 58 % | 36,7 % |
| kdekoli jinde — **včetně Caerleonu a Brecilienu** | — | 18 % | 15,3 % |

Refined suroviny mají v datech `kategorie` shodnou s klíčem modifikátoru
města (`T4_METALBAR` → `ore`), takže `spocitatBonus` to spočítá správně
bez jakékoli změny jádra. Caerleon a Brecilien **nemají modifikátor na
žádnou surovinu** — refinovat tam je vždy horší volba než v matičním městě.

Ze stejné hromady rudy vyrobíš v Thetfordu o ~34 % víc ingotů než
v Caerleonu. Karta to musí ukazovat jako sloupec, ne to schovat do zisku.

---

## 2. Datový model

### Konfigurace

```ts
/** Sentinelové hodnoty — nesmí se srazit s názvem města. */
export const NAKUP_NEJLEVNEJI    = "__nejlevneji__";
export const REFINING_NEJL_BONUS = "__nejlepsi-bonus__";
export const REFINING_NEJV_ZISK  = "__nejvyssi-zisk__";
export const PRODEJ_NEJLEPSI     = "__nejlepsi-cena__";

export interface KonfigRefiningu {
  /** Město nákupu surovin, nebo NAKUP_NEJLEVNEJI. */
  mestoNakupu: string;
  /** Město refiningu, nebo jeden ze dvou auto-režimů. */
  mestoRefiningu: string;
  /** Město prodeje, nebo PRODEJ_NEJLEPSI. */
  mestoProdeje: string;
  /**
   * Jen při NAKUP_NEJLEVNEJI: true = všechny vstupy v jednom městě
   * (jedna zastávka), false = každý vstup tam, kde je nejlevnější.
   * Výchozí true — tak se reálně hraje.
   */
  jednoNakupniMesto: boolean;
  /** Ztráta na úseku nákup → refining, 0–1. Zdražuje NÁKLAD. */
  ztrataDoRefiningu: number;
  /** Ztráta na úseku refining → prodej, 0–1. Snižuje TRŽBU. */
  ztrataDoProdeje: number;
}

export interface StavRefiningu {
  klice: string[];                              // `T5_METALBAR#0`
  konfig: KonfigRefiningu;                      // globální
  override: Record<string, KonfigRefiningu>;    // přepis per položka
  zdrojCen: ZdrojCen;                           // orderbook | historie
}
```

Úložiště: `albion:refining:v1`, `albion:refining-presety:v1`,
`albion:filtr-refiningu:v1`, `albion:sloupce-refiningu:v1`.
Stejné rozdělení jako u Dílny: **seznam a konfigurace se synchronizují**
(je to vlastní práce), **filtr a sloupce ne** (vlastnost zařízení).

### Výsledek řádku

```ts
export interface VysledekRefiningu {
  klic: string;
  /** Efektivní města po rozhodnutí auto-režimů. */
  mestoNakupu: string;          // "__ruzna__" při nákupu po vstupech
  mestoRefiningu: string;
  mestoProdeje: string;
  /** Které město vyhrálo u kterého vstupu — pro sloupec „Koupit kde". */
  nakupPoVstupech: { zaklad: string; enchant: number; mesto: string; cena: number }[];
  radek: RadekSkenu | null;     // stejný typ jako sken → sdílené sloupce
  /** Druhý nejlepší kandidát, když vyhrál o < 5 % — do tooltipu. */
  tesnyVitez: { mesto: string; zisk: number } | null;
  /** Koupit, nebo si vyrobit nižší tier? Null, když se nedá určit. */
  retezec: UzelRetezce | null;
  /** Váha surovin na dávku a jízdy mountem. */
  vahaVstupuKg: number;
  jizdDoRefiningu: number | null;   // null = nákup a refining v jednom městě
  jizdDoProdeje: number | null;
}
```

---

## 3. Změny v existujícím kódu

### 3.1 Jádro — `jadro/src/vypocet.ts`

Nové **volitelné** pole:

```ts
/**
 * Podíl surovin ztracených cestou DO dílny, 0–1.
 *
 * Liší se od `ztrataZasilek` směrem účinku a to je celý důvod, proč je
 * to druhé pole a ne totéž:
 *   - ztracená surovina cestou do dílny → musíš koupit VÍC → vyšší NÁKLAD
 *   - ztracený výrobek cestou na trh    → neprodáš ho    → nižší TRŽBA
 *
 * Použít jedno místo druhého dá tiše špatná čísla, která vypadají rozumně.
 */
ztrataVstupu?: number;
```

Účinek:

```ts
const ztrataVst = Math.min(Math.max(z.ztrataVstupu ?? 0, 0), 0.99);
const faktorNakupu = 1 / (1 - ztrataVst);
// nakladSuroviny i vahaVstupuCelkem se násobí faktorem
```

Strop 0,99 (ne 1) proto, že při 100 % je náklad nekonečný a výsledek by
nebyl číslo. UI stejně nabízí jen 0–50 % (precedent z F7).

**Zlaté vektory:** nový test v `jadro/test/vypocet.test.ts` — 0 % (musí
vyjít bit-shodně se stávajícím vektorem, jinak jsme rozbili zpětnou
kompatibilitu), 20 %, a hraniční 100 % (nesmí vrátit `Infinity` ani `NaN`).

### 3.2 `web/src/stav/sken.ts`

Dvě volitelná pole v `NastaveniSkenu`:

```ts
/** Kde se kupují vstupy. Chybí = ve městě výroby (dosavadní chování). */
mestoNakupu?: string;
/** Ztráta surovin cestou do dílny. Chybí = 0. */
ztrataVstupu?: number;
```

`spocitatSken` použije `nastaveni.mestoNakupu ?? nastaveni.mesto` pro
ceny vstupů a předá `ztrataVstupu` do `spocitat`. **Vyjmenovat kladnou
hodnotu, ne `!== undefined`** — stejný precedent jako u `mistoProdeje`,
kde uložené nastavení ze starší verze pole nemá.

Karty Sken / Příležitosti / Dílna pole nenastavují → chovají se přesně
jako dnes. Ověří se tím, že projdou stávající testy beze změny.

### 3.3 `web/src/stav/filtrDilny.ts` → zobecnění

Dnes je funkce vázaná na `VysledekDilny`, ale používá z něj jen `.klic`
a `.radek`. Zúží se na strukturální rozhraní:

```ts
export interface PolozkaSeznamu {
  klic: string;
  radek: RadekSkenu | null;
}
```

a `filtrujARad<T extends PolozkaSeznamu>(...)` se udělá generická.
Dílna se nemění ani o řádek, Refining používá týž filtr. **Kopie souboru
by znamenala dvě místa pravdy pro řazení** — to je přesně ta chyba, kvůli
které se v F9e sjednocoval seznam sloupců.

Přidá se filtr **linka** (`ore` / `hide` / `fiber` / `wood` / `rock`) místo
skupiny kategorií a filtry na **město refiningu** a **město prodeje**
(užitečné hlavně při auto-výběru — „ukaž jen to, co se refinuje v Thetfordu").

### 3.4 `web/src/App.tsx`

- nová záložka `refining` (`Rezim` v `predvolby.ts` se rozšíří; neznámá
  hodnota z uloženého se už dnes zahodí přes `jedna()`, takže starší
  předvolby přežijí)
- stahování cen pro refining: `potrebnaIdsZ(refiningKombinace)`,
  města = **7 měst bez Black Marketu** (BM refined suroviny neobchoduje →
  osmina přenosu navíc pro nic)
- historie i pro vstupy (jako Dílna), aby šel 30denní medián použít jako
  zdroj ceny surovin
- dialog „co s ručními cenami" před stažením — stejný jako v Dílně
- detail položky se otevírá pro efektivní města řádku

### 3.5 `web/src/stav/balicek.ts` — **pozor, tady je riziko ztráty dat**

- `DataBalicku` dostane `refining: StavRefiningu` a `presetyRefiningu`
- `VERZE_BALICKU` 1 → **2**
- čtení verze 1: chybějící refining → prázdný stav (ne pád)
- **`jePrazdny()` a `popis()` musí počítat i refining.** Dnes koukají jen
  na dílnu, presety a ruční ceny. Kdyby měl někdo jen refining seznam,
  balíček by se hlásil jako „prázdné" a dialog při přihlášení by nabídl
  přepsat ho serverem — tedy tiše smazat hodiny práce.

**Provozní důsledek:** po nasazení musí každé zařízení načíst novou verzi
aplikace. Zařízení se starým buildem uvidí verzi 2, vyhodnotí ji přes
`jePrilisNovy()` jako „novější, než umím" a **přestane zapisovat**
(číst bude dál). To je správné chování — chrání data — ale musí se to vědět
dopředu, ne se to objevit jako „mobil přestal synchronizovat".

---

## 4. Rozhodování o městech (auto-režimy)

### Kolik se toho počítá

Naivně 7 (nákup) × 7 (refining) × 7 (prodej) = 343 výpočtů na řádek.
Nepotřebné: **město prodeje je nezávislé** na zbytku — vybírá se podle
prodejní ceny po dani a ztrátě, což na nákladech nezávisí. Zůstává
7 × 7 = 49 plných výpočtů na řádek.

U 30 položek v seznamu je to ~1 500 volání `spocitat` na jeden přepočet.
**Změří se před nasazením** stejnou metodou jako v F5 (3 240 řádků = 9,4 s
vykreslení) a když to bude nad ~300 ms, přidá se strop stejně jako
`STROP_RADKU`, včetně viditelné hlášky, kolik se zahodilo.

### Nákup „nejlevněji" po vstupech

Řeší se **syntetickým skladem cen**, ne zvláštní větví ve výpočtu:
pro řádek se postaví malý `SkladCen`, do kterého se pod sentinelovým
městem uloží pro každý vstup ta nejlevnější nalezená cena. `spocitatSken`
pak běží beze změny a nemá o ničem tušit. Vedlejší produkt: víme, které
město u kterého vstupu vyhrálo → sloupec „Koupit kde".

### Auto-výběr nesmí doporučovat neexistující trasy

Ceny z AODP sbírají hráči; v malém městě je běžně cena tři dny stará nebo
z jediného zbloudilého orderu. Bez ošetření by karta se zcela správnou
matematikou poslala hráče na trasu, kde reálně nikdo nic nenabízí.

V designu:
1. auto-výběr **přeskočí ceny starší než globální filtr stáří**
2. řádek nese stáří **nejstarší** ze všech použitých cen (všechna tři města)
3. likvidita se bere z **města prodeje**
4. když vítěz vyhrál o **méně než 5 %**, ukáže se v tooltipu i druhý
   v pořadí (`tesnyVitez`) — rozdíl v šumu není doporučení

---

## 5. Vzhled karty

```
┌ Globální nastavení ─────────────────────────────────────────────┐
│ Kupuju v: [nejlevněji ▾]  ☑ všechno v jednom městě              │
│ Refinuju v: [nejlepší bonus ▾]   Prodávám v: [nejlepší cena ▾]  │
│ Ceny z: [poslední z tržnice ▾]                     [presety]    │
│ Riziko nákup→refining: ▓▓░░ 5 %   refining→prodej: ▓░░░ 2 %     │
└─────────────────────────────────────────────────────────────────┘
[ hledej surovinu…                                              ✕ ]
┌ Rychlé přidání ─────────────────────────────────────────────────┐
│         T2  T3  T4  T5  T6  T7  T8                              │
│ ruda    ▫   ▫   ▪   ▪   ▫   ▫   ▫    (klik = přidat/odebrat)    │
│ kůže    ▫   ▫   ▫   ▪   ▫   ▫   ▫                               │
│ …                                                                │
└─────────────────────────────────────────────────────────────────┘
[ filtry: linka · tier · enchant · město refiningu · město prodeje │
          jen ziskové · skrýt bez ceny ]              [sloupce ▾]
```

Mřížka na rychlé přidání jde udělat jen tady: refined surovin je ~115
(5 linek × T2–T8 × enchanty), kdežto výbavy je 3 240 — proto má Dílna jen
vyhledávač.

### Sloupce

| id | Název | Výchozí |
|---|---|---|
| `kdeKoupit` | Koupit kde | ✅ |
| `kdeRefinovat` | Refinovat kde | ✅ |
| `kdeProdat` | Prodat kde | ✅ |
| `vraceni` | Vrácení % | ✅ |
| `prodej` | Prodej / ks (ručně přepsatelný) | ✅ |
| `zisk`, `marze` | Zisk / dávku, Marže | ✅ |
| `naklad` | Náklad / ks | ✅ |
| `likvidita` | Likvidita | ✅ |
| `nizsiTier` | Nižší tier: koupit / vyrobit | ✅ |
| `jizdy` | Váha a jízdy | vypnuto |
| `ziskNaKus`, `ziskNaKg`, `ziskNaFocus`, `trzba`, `stari`, `tier` | | vypnuto |

Ukládá se seznam **vypnutých**, ne zapnutých — precedent z
[sloupceDilny.ts](../web/src/stav/sloupceDilny.ts): jinak by se sloupec
přidaný v budoucí verzi nikomu neobjevil.

### Rozklik řádku

- přepis konfigurace jen pro tuhle položku (jako Dílna)
- **nákupní seznam pro dávku**: „na 100× T5 Metal Bar kup 126× T5 Ore
  a 63× T4 Metal Bar" — to, co reálně děláš u tržnice
- rozpad return rate: „18 % základ Thetford + 40 % bonus na rudu
  + 59 % focus = 117 % → vrátí se 53,9 %"
- řetězec koupit/vyrobit pro nižší tier (modul `retezec.ts` už existuje,
  zatím ho žádná karta nepoužívá per řádek)

---

## 6. Oponentura — defekty nalezené před odevzdáním

Podle pravidla v CLAUDE.md prošel plán čočkami. Osm defektů, všechny
opravené v **designu**, ne odsunuté do sekce „rizika".

| # | Čočka | Defekt | Oprava v designu |
|---|---|---|---|
| 1 | Atomicita / data | `jePrazdny()` nezná refining → dialog nabídne přepsat neprázdný stav prázdným serverem | §3.5 — `jePrazdny` a `popis` počítají i refining |
| 2 | Kompatibilita | bump verze balíčku odstřihne starý build od zápisu | §3.5 — vědomé rozhodnutí + poznámka do README |
| 3 | Schema clarity | jedna ztráta pro obě cesty dá tiše špatná čísla | §3.1 — `ztrataVstupu` (náklad) vs. `ztrataZasilek` (tržba) |
| 4 | Výkon | 343 kombinací × počet řádků na každý přepočet | §4 — prodej je nezávislý → 49; měření před nasazením |
| 5 | Data quality | auto pošle hráče na trasu s třídenní cenou | §4 — filtr stáří, nejstarší cena, likvidita, těsný vítěz |
| 6 | Herní realita | dva vstupy mohou být nejlevnější každý jinde | §2 — přepínač `jednoNakupniMesto`, výchozí „jedna zastávka" |
| 7 | Concurrency / UI | ruční prodejní cena při auto-výběru: přepis změní vítěze → pole „uteče" do jiného města | při ručním zápisu se městu prodeje **zafixuje override** a řádek to označí jantarově (jako override v Dílně) |
| 8 | UI / pravdivost | panel surovin pro hromadnou editaci nemá při auto-nákupu jednoznačné město (Dílna to řeší fallbackem na Caerleon — tady by to lhalo) | panel se při auto-nákupu **nezobrazí**, místo něj hláška „pro ruční zadání zvol konkrétní město" |

### Co by se mohlo pokazit, i kdyby to fungovalo správně?

Ceny z AODP jsou crowdsourcované. Karta může se zcela správnou matematikou
doporučit „kup v Bridgewatch, refinuj v Thetfordu, prodej v Lymhurstu"
na trase, kde reálně nikdo nic nenabízí ani nekupuje. Proto je stáří,
likvidita a těsný vítěz **součástí návrhu, ne ozdobou** — a proto se
auto-výběr drží filtru stáří.

Druhá věc: `ztrataDoRefiningu` i `ztrataDoProdeje` jsou **odhady hráče**,
ne data. Dva lidé dostanou z téže karty jiné pořadí. To je záměr (F7
precedent), ale znamená to, že karta není „pravda", nýbrž model.

---

## 7. Postup prací

| Krok | Co | Ověření |
|---|---|---|
| 1 | `jadro/src/vypocet.ts` — `ztrataVstupu` | zlaté vektory: 0 % bit-shodně se stávajícím, 20 %, hraniční 100 % |
| 2 | `web/src/stav/sken.ts` — `mestoNakupu`, `ztrataVstupu` | stávající testy musí projít **beze změny** |
| 3 | `web/src/stav/filtrDilny.ts` zobecnit | stávající testy Dílny beze změny |
| 4 | `web/src/stav/refining.ts` — stav, auto-výběr, syntetický sklad, řetězec, jízdy | nové testy: auto-výběr, těsný vítěz, obě ztráty, per-vstup nákup |
| 5 | `sloupceRefiningu.ts`, `TabRefining.tsx`, `TabulkaRefiningu.tsx` | typová kontrola |
| 6 | `App.tsx` — záložka, stahování, detail | měření výkonu přepočtu |
| 7 | `balicek.ts`, `predvolby.ts` — sync, verze 2 | test čtení balíčku v1 i v2, `jePrazdny` s prázdnou dílnou a neprázdným refiningem |
| 8 | Ověření | `npm test`, `npm run kontrola`, `npm run build` + **proklikání přes dev server** |

### Povinné proklikání (CLAUDE.md: UI změny vyžadují UI ověření)

Backend testy ani build nedokazují, že karta funguje. Projede se:

1. přidat T5 Metal Bar → stáhnout ceny → řádek má číslo, ne „chybí cena"
2. přepnout refining na Caerleon → **vrácení % musí klesnout** z 36,7 na 15,3
   a zisk spadnout (negativní scénář: ověřuje, že bonus města opravdu působí)
3. nastavit riziko nákup→refining na 50 % → **náklad musí vzrůst**, ne tržba
   klesnout (negativní scénář na defekt #3)
4. auto-výběr → přepsat prodejní cenu ručně → **město se zafixuje** a označí
5. filtr na linku „ruda" → zmizí kůže i dřevo
6. vypnout sloupec, podle kterého se řadí → tabulka se nesmí zpřeházet
7. odhlásit/přihlásit se s prázdnou dílnou a neplným refiningem →
   **nesmí se nabídnout přepsání prázdným** (negativní scénář na defekt #1)
