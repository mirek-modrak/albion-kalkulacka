# F9c — plán a oponentura: přihlašovací zeď

Datum: 2026-08-05
Cíl: **bez přihlášení se kalkulačka nepoužívá.**

**Stav: 🟡 ROZPRACOVÁNO**

---

## Zadání

| Požadavek | Zdroj |
|---|---|
| Bez přihlášení nesmí kalkulačka běžet | Mirek, 2026-08-05 |
| Zvolená varianta: zeď v aplikaci (ne neveřejné hostování) | Mirek, 2026-08-05 |
| Offline tolerance 7 dní | rozhodnuto v návrhu, Mirek nerozporoval |

---

## Co tím získáme a co ne — bez příkras

Kalkulačka je statická stránka na GitHub Pages. Soubory s kódem a herními
daty si stáhne kdokoli, kdo zná adresu, **ještě než se cokoli zeptá na
přihlášení**. Zeď tedy:

| Zastaví | Nezastaví |
|---|---|
| náhodného člověka, kterému někdo přepošle odkaz | někoho, kdo otevře vývojářské nástroje |
| používání Dílny, skenu a převozů bez účtu | stažení `hra.json` a kódu z veřejného balíku |
| přístup k uloženým datům v účtu (to hlídá Firestore) | volání veřejného API cen (AODP je veřejné pro všechny) |

Skutečné uzamčení kódu by znamenalo neveřejné hostování (Cloudflare Access
nebo VPS) — vědomě odloženo, viz varianta B v rozhovoru 2026-08-05.

---

## Návrh

### Kde zeď stojí

`main.tsx` obalí celou aplikaci komponentou `Brana`. Dokud brána nepustí,
`App` se **vůbec nevykreslí** — ne že by se jen schoval CSS třídou.

### Čím je zeď podepřená

Ne seznamem e-mailů v kódu — ten je veřejný a jde obejít. Zeď se opře
o **skutečný pokus přečíst vlastní dokument z Firestore**:

| Odpověď Firestore | Význam | Co brána udělá |
|---|---|---|
| dokument / prázdno | server přístup povolil | pustí dál |
| `permission-denied` | e-mail není na seznamu povolených | odepře, nabídne odhlášení |
| `unavailable`, síťová chyba | nevíme | rozhodne offline pravidlo (níž) |

Rozhoduje tedy server, ne prohlížeč.

### Stavy brány

```
nikdy nepřihlášen ──► přihlašovací obrazovka (Firebase se ani nenačítá)
přihlášen ──► ověřuji ──┬─► pustí dál
                        ├─► odepřeno (jiný účet / odhlásit)
                        └─► offline ──► rozhodne 7denní lhůta
```

### Offline pravidlo

Po každém úspěšném ověření se do prohlížeče zapíše čas (per e-mail).
Když server není dostupný:

- ověření **mladší 7 dnů** → pustí dál, nahoře nenápadná poznámka
  „pracuješ offline",
- starší nebo žádné → nepustí, ale **data v prohlížeči zůstanou** a po
  připojení se objeví.

Důvod: bez toho by výpadek sítě nebo Firebase odřízl uživatele i od dat,
která má fyzicky u sebe. To by byla horší vlastnost než ta, kterou zeď řeší.

### Co zeď NIKDY nesmí

- **mazat data v prohlížeči** při odepření nebo odhlášení — jsou to hodiny
  cizí práce a odepření může být omyl (překlep v seznamu),
- nechat uživatele v pasti — u odepření musí být vždy „odhlásit a zkusit
  jiný účet".

---

## Dopad na dosavadní rozhodnutí

**R7** (F9b) zůstává: kalkulačka je samostatný nástroj s vlastním
přihlášením. Mění se jen to, že přihlášení je nově **povinné**.

Ruší se vlastnost z F9b „bez přihlášení funguje aplikace jako dřív".
Byla vědomá a teď ji vědomě rušíme.

---

## Harmonogram

| Krok | Co |
|---|---|
| 1 | `stav/brana.ts` — čistá logika rozhodování + jednotkové testy |
| 2 | `ui/Brana.tsx` — přihlašovací obrazovka, odepření, offline poznámka |
| 3 | zapojení v `main.tsx`, úprava hlavičky (tlačítko se přesouvá) |
| 4 | proklikání odhlášeného i přihlášeného stavu |
| 5 | nasazení a ověření na živé adrese |

---

# Oponentura — nalezené vady

### 1. 🔴 Zeď opřená o seznam v kódu by byla kulisa

První verze kontrolovala e-mail proti seznamu zapsanému v aplikaci.
Kód je veřejný a v prohlížeči jde změnit cokoli — stačilo by si seznam
přepsat a zeď povolí.

**Změna návrhu:** rozhoduje odpověď Firestore na skutečný pokus o čtení.
Prohlížeč nemá jak si ji vymyslet.

### 2. 🔴 Zeď by odřízla uživatele od jeho vlastních dat

První verze bez sítě nepustila nikam. Jenže data jsou fyzicky
v prohlížeči — uživatel by koukal na přihlašovací obrazovku a nemohl se
dostat k tomu, co má u sebe. Výpadek Firebase = kalkulačka nefunguje
nikomu.

**Změna návrhu:** 7denní offline lhůta od posledního úspěšného ověření.

### 3. 🟡 Odepřený uživatel by uvízl v pasti

První verze u odepření zobrazila jen hlášku. Když se člověk omylem
přihlásí jiným Google účtem (a v Chromu jich má Mirek pět), neměl by
jak se dostat zpátky.

**Změna návrhu:** u odepření je vždy tlačítko „Odhlásit a zkusit jiný účet".

### 4. 🟡 Zeď by zabila načítání Firebase až při kliknutí

F9b zavedlo, že se Firebase (velký balík) stahuje až při kliknutí na
přihlášení. Naivní zeď by ho musela načíst vždy, aby zjistila stav
přihlášení — a zpomalila by start všem.

**Změna návrhu:** když v prohlížeči není příznak „tady se někdo
přihlašoval", zobrazí se přihlašovací obrazovka **bez načtení Firebase**.
Načte se až po kliknutí, přesně jako dosud.

### 5. 🟡 Chybu sítě nesmíme splést s odepřením

Kdyby se `unavailable` vyhodnotilo jako `permission-denied`, aplikace by
při výpadku hlásila „nemáš přístup" — uživatel by si myslel, že ho Mirek
vyhodil ze seznamu.

**Změna návrhu:** brána rozlišuje kódy chyb a nezná jen „prošlo/neprošlo".
Hlášky jsou tři různé.

### 6. 🟢 Dvojí čtení při startu

Brána přečte dokument kvůli ověření a synchronizace hned po ní znovu kvůli
datům. Jsou to dvě čtení místo jednoho.

**Rozhodnutí: ponecháno.** Denní kvóta je 50 000 čtení, při pěti lidech
je to setina procenta. Sloučení by provázalo dvě nezávislé věci a zaplatilo
by se složitostí, ne přínosem.

### 7. 🟢 Odebrání ze seznamu za běhu

Když Mirek někoho odebere, zatímco má ten člověk aplikaci otevřenou, zeď to
nepozná — kontroluje se při startu. Zápis mu ale Firestore odmítne a
aplikace to ohlásí; po obnovení stránky ho zeď nepustí.

**Rozhodnutí: ponecháno.** Průběžné hlídání by znamenalo pravidelné dotazy
na server kvůli případu, který u pěti známých lidí prakticky nenastane.
