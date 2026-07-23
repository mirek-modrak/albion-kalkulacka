# F5 — plán, oponentura a výsledek

Datum: 2026-07-22
Cíl: **nejlepší příležitosti napříč všemi městy** (scénář S9).

**Stav: ✅ HOTOVO** — 171 testů, proklikáno na živých datech.
Mirkův požadavek: *„bokem by mělo být co je globálně nejefektivnější,
tedy jaký item a kde."*

---

## Plán (první verze)

1. Stáhnout ceny pro všech 7 měst naráz
2. Spočítat každou kombinaci **v každém městě**
3. Seřadit globálně a ukázat, kde vyhrála

---

## Oponentura — nalezené vady

### 1. 🔴 Sedmkrát víc řádků zahltí tabulku

115 kombinací surovin × 7 měst = **805 řádků**. U zbraní 203 × 7 = 1 421.
Tabulka, kde je táž položka sedmkrát, je nepoužitelná.

**Oprava:** seskupit **podle položky** a ukázat jen její nejlepší město.
Ostatní města dostupná v detailu.

> Uživatel se neptá „která z 805 dvojic", ale „co mám dělat" —
> a k tomu potřebuje jeden řádek na položku.

### 2. 🔴 Sklad cen je klíčovaný městem, ale sken počítá jen s jedním

`spocitatSken` bere `nastaveni.mesto`. Pro srovnání měst se musí volat
pro každé město zvlášť a výsledky spojit.

**Oprava:** nová funkce `spocitatNapricMesty`, která volá stávající
výpočet v cyklu. **Nekopírovat logiku** — jen ji obalit.

### 3. 🔴 Bonus města závisí na položce, ne jen na městě

Thetford má +0,40 na rudu, ale nic na dřevo. Lymhurst má +0,15 na meče.
Naivní „projdi města" by to zvládl, ale musí se předat správná `Lokace`
pro každé město zvlášť.

**Oprava:** ověřit testem, že táž položka dostane v různých městech
různý return rate.

### 4. 🟡 Chybějící data zkreslí srovnání

Když AODP nemá cenu v Caerleonu, ale má v Martlocku, vypadne
„Martlock je nejlepší" — přitom v Caerleonu to mohlo být lepší.

**Oprava:** u každého řádku ukázat, **v kolika městech ze 7** se to
podařilo spočítat. Málo měst = slabší výsledek, ne lepší.

### 5. 🟡 Model jednoho města musí být explicitní

Nákup, výroba i prodej ve stejném městě. Rozpad přes víc měst by dal
vyšší čísla, ale znamenal by cesty pěšky.

**Oprava:** napsat to v UI. Rozhodnuto už v S9.

### 6. 🟡 Objem dat

205 ID × 7 měst = 1 435 cen na dotaz (ověřeno). U zbraní to bude
~3 700 ID × 7 měst v ~23 dotazech — odpověď v řádu MB.

**Oprava:** rate limit už je ošetřen odstupem; ověřit, že to prohlížeč
unese. Změřit.

### 7. 🟡 Rozdíl mezi městy je zajímavější než absolutní hodnota

„Nejlepší je Martlock" neřekne, jestli je to o 2 % nebo 3× lepší.

**Oprava:** ukázat i **druhé nejlepší město** a rozdíl mezi nimi.

### 8. 🟢 Přepínání mezi režimy

Sken jednoho města a sken napříč městy jsou dva pohledy na totéž.

**Oprava:** přepínač nahoře, sdílené nastavení (focus, premium, poplatek).

---

## Plán po oponentuře

```
web/src/
├── stav/
│   └── napricMesty.ts    obal nad spocitatSken pro N měst    (vady 2,3)
└── ui/
    ├── TabulkaPrilezitosti.tsx   1 řádek = 1 položka         (vady 1,4,7)
    └── PrepinacRezimu.tsx                                     (vada 8)
```

**Datový tvar:**
```
PrilezitostPolozky {
  polozka, enchant, nazev
  nejlepsi:  { mesto, vysledek }
  druhe:     { mesto, vysledek } | null     ← vada 7
  spocitanoMest: number                     ← vada 4
  vsechnaMesta: { mesto, vysledek }[]       ← pro detail
}
```

**Testovat:**
- že táž položka dostane v různých městech různý return rate (vada 3)
- že se řadí podle nejlepšího města, ne podle prvního nalezeného
- proklikáním: srovnat s výsledkem skenu jednoho města — musí sedět

---

## Vada nalezená až za běhu

| # | Vada | Následek | Oprava |
|---|---|---|---|
| 9 | 🔴 **Tabulka příležitostí neoznačovala podezřelé řádky** | marže 688 % vedla pořadí bez varování | sloupec Stav, stejně jako u skenu města |

Sken jednoho města podezřelé řádky označoval už z F2. Při psaní nové tabulky
se to nepřeneslo — a projevilo se to hned na živých datech, kde první řádek
měl marži 688 % a náskok +13 782 %.

> Skener, který nahoře ukáže deset falešných zlatých dolů, je horší
> než žádný, protože ztratíš důvěru v celek.

### Poučení z chybného testu

Jeden test nejdřív padal: „úplné srovnání u 25 ze 115". Ukázalo se, že
**chyba byla v testu, ne v kódu** — plnil jsem ceny podle `HRA.polozky`,
jenže **raw suroviny T2 a T3 tam nejsou**, protože nemají recept (sbírají se).

Aplikace to řeší správně: `potrebnaIds` bere vstupy z receptů, ne ze seznamu
položek. Testovací příprava teď plní ceny podle téhož zdroje.

---

## Ověření

**Proklikáno na živých datech** (AODP, west, všech 7 měst):

| Test | Výsledek |
|---|---|
| Objem dat pro 7 měst | **1 414 cen, 47 kB, 0,33 s** — jeden dotaz |
| Souhrn | „29 ziskových z 115 · úplné srovnání u 12" |
| Náskok nad druhým městem | ✅ zobrazuje se |
| Pokrytí měst | ✅ „6/7", „3/7" — vidět, kde data chybí |
| Podezřelé řádky | ✅ označeno po opravě vady 9 |
| Detail se srovnáním měst | ✅ Thetford +5 624 513, Martlock +36 986 |
| Přepnutí na sken jednoho města | ✅ obě tabulky fungují |

### Zjištění, které potvrdilo domněnku z plánu

**Nejčastěji vyhrává Caerleon (10×), pak Martlock (5×) a Bridgewatch (4×).**

Caerleon přitom **nemá bonus na žádnou surovinu**. Potvrzuje se tedy,
co plán předpokládal: bonus města sám o sobě nerozhoduje — v bonusovém
městě všichni refinují, takže je tam surovina dražší a produkt levnější.

Kdyby kalkulačka jen doporučila „vyráběj tam, kde máš bonus", byla by
v deseti z 29 případů vedle.

**Testy:** 171 (119 jádro + 52 web), typová kontrola čistá.

---

## NEOVĚŘENO

- **režim příležitostí pro předměty** (zbraně × 7 měst) — testováno
  jen na surovinách; datově by to mělo být ~23 dotazů
- **ruční úprava ceny v režimu příležitostí** — ceny se ukládají pro
  zobrazované město, ale nevyzkoušeno
- **filtry stáří a „jen ziskové"** v novém režimu
- **světlý motiv**
