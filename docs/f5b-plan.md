# F5b — uložení stavu v prohlížeči

Datum: 2026-07-22
Cíl: **ceny a nastavení přežijí obnovení stránky.**

**Stav: ✅ HOTOVO** — 185 testů, proklikáno.

Není to nová funkce, ale **oprava nedůslednosti z F3**: ruční ceny jsou
navržené jako vědomý zásah, který přežije sken — ale nepřežijí F5.

Databáze to není a nebude. `localStorage` je úložiště přímo v prohlížeči:
žádný server, žádná údržba, funguje offline.

---

## Oponentura — nalezené vady

### 1. 🔴 Změna tvaru dat rozbije aplikaci po aktualizaci

Až se změní struktura `Cena` nebo `NastaveniSkenu`, uložená data ze starší
verze přestanou sedět. Aplikace spadne na datech, která si sama uložila.

**Oprava:** verze schématu v uloženém záznamu. Při nesouladu se
**zahodí, ne opravuje** — cenná data to nejsou, dají se stáhnout znovu.

### 2. 🔴 Poškozený obsah nesmí shodit start

Uživatel může úložiště ručně upravit, prohlížeč ho může useknout při
zaplnění disku.

**Oprava:** načtení celé v `try/catch`, při chybě začít s prázdným skladem.
Aplikace musí nastartovat vždy.

### 3. 🔴 Kapacita `localStorage` je ~5 MB

Sken předmětů přes 7 měst může dát desítky tisíc cen. Při překročení
prohlížeč vyhodí výjimku uprostřed zápisu.

**Oprava:**
- při překročení **zahodit ceny z AODP, ale NIKDY ruční** — ruční jsou
  vědomá práce uživatele, stažené se dají získat znovu jedním kliknutím
- zápis v `try/catch`, selhání nesmí zablokovat práci

### 4. 🟡 Obnovené ceny nesmí vypadat čerstvě

Cena stažená včera po obnovení stránky vypadá stejně jako právě stažená.

**Oprava:** `Cena` už nese `cas`. Ukládat ho beze změny — **nikdy
nepřerazítkovat**. Zavedeno už v R5.

### 5. 🟡 Zápis při každém úhozu je plýtvání

Změna sazby stanice překreslí a uložila by při každém stisku klávesy.

**Oprava:** odložený zápis (~500 ms po poslední změně).

### 6. 🟡 Velmi stará data nemá smysl držet

Cena tři měsíce stará je k ničemu a jen zabírá místo.

**Oprava:** při načtení zahodit ceny starší než 7 dní.
**Ruční ceny se nezahazují** — u nich stáří neznamená totéž.

### 7. 🟢 Server je součástí identity ceny

Ceny z `west` nesmí platit pro `europe`. Sklad je klíčovaný městem,
ale ne serverem.

**Oprava:** uložit stav zvlášť pro každý server (v klíči úložiště).

### 8. 🟢 Uživatel musí mít možnost to smazat

**Oprava:** tlačítko „Zapomenout uložené ceny".

---

## Plán po oponentuře

```
web/src/stav/
├── uloziste.ts     čtení a zápis do localStorage   (vady 1,2,3,5,6,7)
└── skladCen.ts     serializace a obnova            (vady 3,4,6)
```

**Formát:**
```
albion:v1:west → {
  verze: 1,
  ulozeno: "2026-07-22T…",
  nastaveni: {…},
  ceny: [{ mesto, zaklad, enchant, typ, hodnota, zdroj, cas }]
}
```

**Testovat:**
- že se nesouhlasná verze zahodí a aplikace nastartuje
- že se poškozený obsah nezvládne shodit
- že se při přeplnění zahodí AODP ceny, ale ruční zůstanou
- proklikáním: zadat ruční cenu → obnovit stránku → cena je tam

---

## Ověření

**Proklikáno na živých datech:**

| Test | Výsledek |
|---|---|
| Uložení po skenu | ✅ klíč `albion:v1:west`, **247 kB** (limit ~5 MB) |
| Ruční cena 12 345 | ✅ v úložišti jako `zdroj: "rucne"` |
| **Obnovení stránky** | ✅ 115 řádků spočítaných **bez nového skenu** |
| Ruční cena po obnovení | ✅ **12 345**, pořád označená „ručně" |
| Stáří dat po obnovení | ✅ „5 h", „12 h" — **skutečné stáří, nepřerazítkované** |
| „Zahodit ceny" | ✅ ceny pryč, nastavení zůstalo |

Ta předposlední řádka je důležitá: obnovená cena z včerejška vypadá jako
cena z včerejška, ne jako právě stažená. Kdyby se čas přerazítkoval,
uživatel by počítal se starými daty a nevěděl o tom.

**Testy:** 185 (119 jádro + 66 web), typová kontrola čistá.

Testy pokrývají hraniční případy, které nejdou proklikat: poškozený JSON,
nesouhlasná verze formátu, překročená kapacita, ceny starší než týden.

---

## Kde je hranice

`localStorage` **není databáze**:
- data jsou jen v tomhle prohlížeči, na jiném zařízení nejsou
- vyčištění historie prohlížeče je smaže
- kapacita ~5 MB (sken surovin zabere ~250 kB, takže rezerva je velká)

Skutečná databáze přijde až s hlídáním na pozadí (F10), kde musí něco
běžet se zavřeným prohlížečem. Do té doby by byla čistá režie.

## NEOVĚŘENO

- **přepnutí serveru** — kód sklad vyměňuje, ale neproklikáno
- **chování v soukromém režimu** prohlížeče (kód s tím počítá, netestováno)
- **skutečné překročení 5 MB** — testováno jen falešným úložištěm
