# F3 — plán, oponentura a výsledek

Datum: 2026-07-22
Cíl: **detail položky** — proklik ze skenu na rozpad výpočtu a ruční ceny.
Scénář S1 zabudovaný do skeneru.

**Stav: ✅ HOTOVO** — 149 testů, proklikáno na živých datech.

---

## Plán (první verze)

1. Kliknutí na řádek tabulky otevře detail
2. Detail ukáže rozpad: bonusy → spotřeba → náklady → výnos → zisk
3. Ceny jdou v detailu přepsat ručně
4. Změna ceny se promítne zpět do skenu

---

## Oponentura — nalezené vady

### 1. 🔴 Sken přepíše ručně zadanou cenu

Uživatel opraví cenu, kterou AODP hlásí špatně, pak spustí nový sken —
a oprava zmizí. Ztratí se vědomý zásah, a tiše.

**Oprava:** ručně zadaná cena je **přednostní** a stažení ji nepřepíše.
V detailu musí být vidět, že je ruční, a tlačítko na návrat k ceně z AODP.

> Bez tohohle by uživatel opravoval totéž znovu po každém skenu, až by
> na opravy rezignoval.

### 2. 🔴 Detail musí jít otevřít i u řádku BEZ ceny

To je jeho hlavní užití — chybí cena, tak ji chci doplnit. Kdyby detail
šel otevřít jen u spočítaných řádků, ruční zadání by bylo nedostupné
přesně tam, kde ho člověk potřebuje.

**Oprava:** detail funguje i s `vysledek === null`; ukáže, které ceny
chybí, a nabídne políčka.

### 3. 🟡 Není vidět, KTEROU cenu upravuji

Sklad rozlišuje `sell_min` a `buy_max`. Který se použije, závisí na
nastavení nákup/prodej. Uživatel upraví „cenu rudy", pak přepne režim —
a hodnota se přestane používat, aniž by tušil proč.

**Oprava:** u každého políčka napsat, o který typ ceny jde.

### 4. 🟡 Jedna cena ovlivní víc řádků skenu

T4 ingot je vstupem pro T5 a zároveň výstupem T4. Úprava jeho ceny změní
obě položky.

**Oprava:** není to chyba, ale musí to být čitelné — po úpravě se
přepočítá celý sken, ne jen otevřený detail.

### 5. 🟡 Vstup bez omezení rozbije pořadí

Záporná cena nebo 10^15 udělá z tabulky nesmysl. Jádro validaci nedělá
(a nemá — je to čistá matematika).

**Oprava:** ošetřit na hranici UI, kde vstup vzniká.

### 6. 🟡 Dvojí formátování čísel

Tabulka i detail zobrazují tytéž hodnoty. Dvě kopie formátování se rozejdou.

**Oprava:** společný modul `format.ts`.

### 7. 🟢 Zavření detailu

Musí jít zavřít klávesou Escape a kliknutím mimo, ne jen křížkem.

### 8. 🟢 Detail nesmí počítat vlastní matematikou

Kdyby si detail počítal sám, mohl by ukazovat jiná čísla než řádek,
ze kterého se otevřel.

**Oprava:** detail dostane **tentýž** `RadekSkenu`, který je v tabulce.

---

## Plán po oponentuře

```
web/src/
├── ui/
│   ├── format.ts          společné formátování čísel        (vada 6)
│   ├── DetailPolozky.tsx  rozpad + ruční ceny               (vady 2,3,7,8)
│   └── TabulkaSkenu.tsx   řádek se stane klikatelným
└── stav/
    └── skladCen.ts        přednost ručních cen              (vada 1)
```

**Testovat:**
- přednost ručních cen zlatými vektory
- omezení vstupu
- UI proklikáním: otevřít detail u spočítaného i nespočítaného řádku,
  zadat cenu, ověřit promítnutí do skenu, přežití po novém skenu

---

## Vada nalezená až při psaní

| # | Vada | Následek | Oprava |
|---|---|---|---|
| 9 | 🔴 Detail držený jako **objekt** řádku | po úpravě ceny by ukazoval stará čísla — řádky se při přepočtu vytvářejí znovu | drží se **klíč**, řádek se dohledá v čerstvých datech |

---

## Ověření

**Proklikáno na živých datech** (AODP, west, Thetford):

| Krok | Výsledek |
|---|---|
| Otevřít detail u řádku **bez ceny** | ✅ otevřel se, vypsal chybějící ceny a nabídl políčka |
| U každého políčka je vidět typ ceny | ✅ „nejnižší sell order" |
| Zadat ceny ručně (100 / 200) | ✅ spočítalo |
| **Ruční přepočet ověřen na papíře** | 63,29 × 100 = 6 329 + poplatek 90, daň 800, fee 500 → **zisk 12 281** ✅ |
| Return rate a násobek | 36,7 % a 1,580× ✅ |
| Promítnutí do tabulky | ✅ řádek ukazuje 12 281 a odznak „ručně" |
| **Nový sken ručních cen nepřepsal** | ✅ „2× ponechána ruční cena", řádek beze změny |
| Tlačítko „ručně ✕" | ✅ vrátí se k AODP; když tam cena není, řádek zase hlásí chybějící |
| Zavření klávesou Escape | ✅ |
| Zavření kliknutím mimo | ✅ |

**Testy:** 149 (119 jádro + 30 web), typová kontrola čistá.

---

## NEOVĚŘENO

- **klávesová dostupnost** — řádky se otevírají myší, ne klávesou Tab/Enter
- **velmi dlouhé detaily na mobilu** — modál roluje, ale netestováno na úzké obrazovce
- **současná úprava ceny a běžící sken** — sken ruční ceny nepřepíše,
  ale souběh nebyl vyvolán úmyslně
