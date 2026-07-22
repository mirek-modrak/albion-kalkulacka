# F2 — plán, oponentura a výsledek

Datum: 2026-07-22
Cíl: **sken surovin** — stáhnout ceny, spočítat všechny kombinace, seřadit.
Odpovídá na otázku *„co je teď nejvýhodnější refinovat?"* (scénář S2).

**Stav: ✅ HOTOVO** — 134 testů, build 172 kB gzip, proklikáno na živých datech.

---

## Plán (první verze)

1. `web/` — Vite + React + TypeScript + Tailwind
2. Klient pro AODP — batchování dotazů
3. Sken: pro zvolené město stáhnout ceny, spočítat každou kombinaci, seřadit
4. Tabulka s volbou metriky a stavem u každého řádku

---

## Rozsah skenu

| | Počet |
|---|---|
| Refined suroviny (5 linek × T2–T8, enchant 0–4 kromě kamene) | ~135 |
| Raw suroviny (vstupy) | ~130 |
| **ID celkem** | **~265** |
| Dotazů na AODP (~170 ID na dotaz) | **2** |

Měřeno v [R10](architektura-rozhodnuti.md): jeden dotaz zvládne 170 ID
× více měst, odpověď do 0,4 s.

---

## Oponentura — nalezené vady

### 1. 🔴 Změna města během skenu přepíše výsledky staršími

Uživatel klikne na Thetford, pak rychle na Martlock. Odpověď pro Thetford
dorazí později a přepíše správný výsledek.

**Oprava:** každý sken má pořadové číslo. Odpověď se zahodí, pokud
mezitím začal novější. Bez toho by tabulka ukazovala jiné město, než je
vybrané — a nikdo by si toho nevšiml.

### 2. 🔴 Vstupy skenu se překrývají s jeho výstupy

T5 ingot potřebuje T4 ingot, který je sám položkou ve skenu.
Naivní řešení by stahovalo ceny dvakrát.

**Oprava:** sestavit množinu VŠECH potřebných ID (výstupy ∪ vstupy)
a stáhnout ji jednou.

### 3. 🔴 Řazení podle absolutního zisku je zavádějící

T8 vydělá víc než T4 skoro vždy, ale spotřebuje mnohonásobně víc kapitálu.

**Oprava:** metrika volitelná, **výchozí marže** (zisk na vložený silver).
Pro převozy zisk na kg.

### 4. 🟡 Neúplná data se nesmí schovat

Chybějící cena u 5 z 20 položek nesmí vrátit pořadí zbylých 15, jako by
to bylo všechno.

**Oprava:** stav u každého řádku + „spočítáno 15 z 20" nad tabulkou.

### 5. 🟡 Zastaralá data vypadají stejně jako čerstvá

**Oprava:** stáří u každého řádku, filtr „jen data mladší než X hodin".

### 6. 🟡 Rate limit AODP

60 dotazů/min udržitelně. Sken jsou 2 dotazy, ale opakované klikání
to nasčítá.

**Oprava:** minimální odstup mezi skeny, ošetření HTTP 429.

### 7. 🟡 Import 3,4 MB JSON do prohlížeče není odzkoušený

Deklarováno jako neověřené na konci F1.

**Oprava:** ověřit hned na začátku F2, ne až na konci. Když to bude
problém, řeší se rozdělením souboru — ne přepisem aplikace.

### 8. 🟡 Sken potřebuje ceny NÁKUPU i PRODEJE téže položky

T4 ingot se kupuje (jako vstup) i prodává (jako výstup). To jsou dvě různé
ceny — `sell_price_min` vs `buy_price_max`.

**Oprava:** sklad cen klíčovaný `(město, položka, typ)`, jak určuje
[R5](architektura-rozhodnuti.md). Jedno stažení naplní obě.

### 9. 🟢 Podezřele vysoká marže

Marže 500 % je skoro jistě chyba v datech nebo tenký orderbook.

**Oprava v F2:** označit řádky s marží nad prahem jako podezřelé.
Plné řešení (porovnání s 30denním průměrem) až v S7.

### 10. 🟢 Kámen nemá enchanty

**Oprava:** kombinace se generují z herních dat (`maxEnchant`),
ne pevným seznamem 0–4.

---

## Plán po oponentuře

```
web/
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── data/
    │   ├── hra.ts          načtení herních dat + rejstříky
    │   └── aodp.ts         klient AODP: batchování, odstup, chyby   (vady 6,8)
    ├── stav/
    │   ├── skladCen.ts     (město, položka, typ) → Cena             (vada 8)
    │   └── sken.ts         sestavení kombinací, spuštění, pořadí    (vady 1,2,10)
    └── ui/
        ├── OvladaciPanel.tsx
        ├── TabulkaSkenu.tsx                                          (vady 3,4,5,9)
        └── Odznak.tsx      stáří dat a stav
```

**Pořadí prací:**
1. ověřit import herních dat v prohlížeči (vada 7) — **nejdřív, ne nakonec**
2. klient AODP + sklad cen
3. logika skenu
4. tabulka

**Testovat:** logiku skenu zlatými vektory v `jadro/`-stylu, UI proklikáním
podle pravidel projektu.

---

## Vady nalezené až za běhu

| # | Vada | Jak se projevila | Oprava |
|---|---|---|---|
| 11 | 🔴 **Zastaralá closure** | `spustitSken` četl nastavení z okamžiku vykreslení; kdo přepnul město a hned klikl, stáhl jiné město, než měl vybrané | nastavení se čte přes `ref` v okamžiku spuštění |
| 12 | 🟡 Vite nainstalovaný dvakrát | vitest si přitáhl Vite 7, web měl Vite 6 → nesouhlasné typy | sjednoceno na jednu verzi |
| 13 | 🟡 Řádky bez ceny hlásily „ručně" | `null` znamenalo dvě různé věci: ručně zadáno i žádná cena | rozlišeno podle toho, zda řádek má výsledek |

**Vada 11 je poučná:** ochrana proti zastaralé odpovědi (pořadové číslo skenu)
byla v plánu a fungovala. Ale byl tam druhý, jemnější problém — zastaralý
*vstup*. Plán ošetřil, co dorazí zpátky, ne to, co odejde ven.

---

## Ověření

**Proklikáno na živých datech** (Albion Online Data Project, west):

| Test | Výsledek |
|---|---|
| Herní data v prohlížeči | ✅ načtena, 3,8 MB → **172 kB gzip** |
| Sken Thetford bez focusu | 110 z 115 kombinací, 8 ziskových |
| Sken Thetford **s focusem** | 110 z 115, **66 ziskových** |
| Sken Martlock | 115 z 115, 5 ziskových |
| Návratnost podle města | ingoty v Thetfordu 36,7 %, prkna 15,3 % ✅ |
| Návratnost s focusem | 43,5 % (18+59) ✅ |
| Přepnutí města | tabulka ukazuje vybrané město ✅ |
| Volba metriky mění pořadí | marže → `T4 prkna.2`, zisk → `T4 prkna.3` ✅ |
| Řádky bez ceny | „—", ne „ručně" ✅ |
| Neúplnost je vidět | „Spočítáno 110 z 115" ✅ |

**Testy:** 134 (119 jádro + 15 web), typová kontrola čistá, build prochází.

### Poznatek z reálného provozu

Se zapnutým focusem je ziskových **66 kombinací místo 8**. Focus zvedne
návratnost z 15,3 % na 43,5 % a tím překlopí většinu operací ze ztráty
do zisku. To je přesně ten druh věci, kterou skener má ukázat.

---

## NEOVĚŘENO

- **sken na serverech europe a east** — jen west
- **režimy buy order / instant sell** — jen výchozí kombinace
- **filtr stáří dat a „jen ziskové"** — komponenty existují, neproklikány
- **HTTP 429** — odstup mezi dotazy je nastavený, ale limit se nepodařilo
  vyvolat (a záměrně jsem ho nevyvolával)
- **světlý motiv** — testováno jen v tmavém
