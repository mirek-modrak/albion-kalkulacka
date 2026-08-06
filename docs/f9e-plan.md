# F9e — plán a oponentura: volitelné sloupce a ruční prodejní cena

Datum: 2026-08-05
Cíl: **v Dílně přepsat prodejní cenu přímo v tabulce** a **nechat uživatele
si vybrat, které sloupce vidí.**

**Stav: 🟡 ROZPRACOVÁNO**

---

## Zadání

| Požadavek | Zdroj |
|---|---|
| Ruční prodejní cena přímo ve sloupci, jen v Dílně | Mirek, 2026-08-05 |
| Sloupce volitelné — každý si nastaví, co chce vidět | Mirek, 2026-08-05 |

Volitelnost sloupců zároveň ruší spor „nahradit Stáří, nebo přidat sloupec" —
přidá se sloupec a Stáří si každý vypne sám.

---

## Kam se ruční cena zapíše

Tohle je jádro věci: kdyby se zapsala jinam, než odkud výpočet čte, uživatel
zadá číslo a **nic se nezmění**. Výpočet čte cenu výstupu takto
([sken.ts:268](../web/src/stav/sken.ts:268)):

```
mesto = naBM ? "Black Market" : město výroby
typ   = naBM ? buy_max : podle režimu prodeje (sell order / instant)
```

Pravidlo se **nesmí opsat** do UI — rozešlo by se. Proto vznikne jediná
funkce `kamSeProdava()` v `dilna.ts`, odvozená z už spočítaného
`VysledekDilny.mistoProdeje`, a použije ji jak zápis, tak zobrazení.

U volby „nejlevnější" se zapisuje do města, které je **u toho řádku vidět** —
ne do náhodného referenčního, jak to dělá panel surovin.

---

## Volitelné sloupce

Sloupce se přepíšou z natvrdo psaných buněk na **seznam definic**
(id, název, zarovnání, podle čeho se řadí). Tabulka pak vykresluje jen
zapnuté.

**Ukládá se seznam VYPNUTÝCH, ne zapnutých.** Kdyby se ukládaly zapnuté,
sloupec přidaný v budoucnu by se nikomu neobjevil a nikdo by nevěděl,
že existuje.

Volba se **nesynchronizuje** — je to vlastnost zařízení, stejně jako filtry
a předvolby. Na mobilu chce člověk tři sloupce, na počítači devět.

Ve výchozím stavu je vypnuté **Stáří** — u ručně zadaných cen a u 30denního
mediánu je vždycky prázdné (ověřeno v [skladCen.ts:138](../web/src/stav/skladCen.ts:138)).

---

## Harmonogram

| Krok | Co |
|---|---|
| 1 | `stav/sloupceDilny.ts` — definice, uložení, testy |
| 2 | `kamSeProdava()` v `dilna.ts` + testy |
| 3 | přepis tabulky na definice sloupců |
| 4 | editovatelná prodejní cena jako sloupec |
| 5 | nabídka „Sloupce" |
| 6 | proklikání, nasazení |

---

# Oponentura — nalezené vady

### 1. 🔴 Zápis do jiné ceny, než ze které se počítá

První verze chtěla zapisovat „do města řádku". Jenže při prodeji na Black
Market se cena čte z pseudoměsta „Black Market", ne z města výroby — a typ
ceny je `buy_max`, ne cena sell orderu. Uživatel by zadal číslo a zisk by
se nezměnil. Nejhorší druh chyby: vypadá to, že aplikace ignoruje vstup.

**Změna návrhu:** jedna sdílená funkce `kamSeProdava()` odvozená z už
spočítaného `mistoProdeje`. Pravidlo existuje na jednom místě.

### 2. 🔴 Řádek bez ceny slévá pět sloupců do jedné buňky

Dnešní tabulka u řádku bez ceny použije `colSpan={5}`. S volitelnými
sloupci nejde dopředu říct, kolik jich slévat — rozpadlo by se to.

**Změna návrhu:** žádné slévání. V číselných sloupcích bude „—" a hláška
o chybějící ceně se přesune k názvu položky. Vedlejší přínos: půjde řadit
i řádky bez ceny a **editovat u nich cenu** — což je přesně ten případ,
kdy to člověk potřebuje nejvíc.

### 3. 🟡 Řazení podle vypnutého sloupce

Kdyby uživatel vypnul sloupec, podle kterého se zrovna řadí, tabulka by se
řadila podle něčeho neviditelného a vypadala by zpřeházeně.

**Změna návrhu:** vypnutí takového sloupce vrátí řazení na ruční pořadí.

### 4. 🟡 Vypnout se dá i název položky

Bez názvu jsou řádky k nerozeznání a uživatel by se z toho nedostal.

**Změna návrhu:** název a tlačítko na odebrání jsou natvrdo, v nabídce
sloupců se nenabízejí.

### 5. 🟡 Editace uprostřed psaní

Zápis ceny spouští přepočet celé tabulky. Kdyby se zapisovalo při každé
číslici, pole by se přebilo uprostřed psaní.

**Změna návrhu:** zápis až při opuštění pole — stejný vzor jako
[PoleCeny.tsx](../web/src/ui/PoleCeny.tsx), který už v projektu je.
Použije se rovnou ta komponenta, ne nová.

### 6. 🟢 Prodejní cena vs. sloupec „Tržba / ks"

Jsou to skoro stejná čísla — tržba je cena po odečtení ztráty zásilek.
Dva podobné sloupce vedle sebe můžou mást.

**Rozhodnutí: ponechat oba, vypínatelné.** Kdo je nechce oba, jeden si
vypne — přesně proto ta volitelnost vzniká. Nový sloupec se jmenuje
**„Prodej / ks"** a je bez řazení: řadit se dá podle tržby, která z něj
vychází.
