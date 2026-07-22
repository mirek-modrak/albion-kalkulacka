# F4 — plán, oponentura a výsledek

Datum: 2026-07-22
Cíl: rozšířit sken ze surovin na **předměty podle kategorií** (scénář S3).

**Stav: ✅ HOTOVO** — 158 testů, proklikáno na živých datech.
Mirkův požadavek: *„co se vyplatí craftit v různých kategoriích
(staff nebo plate armor, plate helmet apod.)"*

---

## Plán (první verze)

1. Výběr, co se skenuje: suroviny / zbraně / brnění / … / vše
2. Sken sestaví ID podle výběru
3. Tabulka a detail fungují beze změny — počítá je tatáž funkce

---

## Co je v datech

| | Počet |
|---|---|
| Kategorií výbavy | **53** |
| Předmětů výbavy | 1 620 |
| ID včetně enchantů | **7 031** |

Nejčetnější kategorie: `gatherergear` 120, `other` 118, `offhand` 95,
`tools` 83, pak trojice `leather_/plate_/cloth_` × `helmet/armor/shoes`
po ~48, a zbraně (`dagger` 46, `sword` 43, `bow` 42, `firestaff` 42…).

**Náročnost skenu** (170 ID na dotaz, odstup 1,1 s):

| Rozsah | Dotazů | Čas |
|---|---|---|
| Suroviny | 2 | ~2 s |
| Jedna kategorie zbraní | 1 | ~1 s |
| Všechny zbraně | 17 | ~19 s |
| **Všechna výbava** | **42** | **~46 s** |

---

## Oponentura — nalezené vady

### 1. 🔴 Vstupy předmětů nejsou ve skenu, ale jejich ceny jsou nutné

T5 meč potřebuje T5 ingot a T5 kůži. Když se skenují jen zbraně,
ceny surovin nikdo nestáhne a **všechny řádky skončí na „chybí cena"**.

**Oprava:** množina ID = vybrané položky **∪ jejich vstupy**, i když
vstupy do výběru nepatří. (Ve F2 to platilo taky, ale tam se vstupy
s výstupy z velké části překrývaly, takže to nebylo vidět.)

### 2. 🔴 Sken „vše" trvá ~46 s bez zpětné vazby

Uživatel neví, jestli to běží, nebo zamrzlo.

**Oprava:** ukazatel průběhu s počtem dávek a možnost **zrušit**.
Průběh už je zaveden z F2, chybí zrušení.

### 3. 🟡 Kvalita předmětů

Craftěné předměty mají kvalitu 1–5 a cena se podle ní výrazně liší.
AODP vrací ceny per kvalita.

**Rozhodnutí (otázka O2 z funkční specifikace):** ve F4 počítat
**jen základní kvalitu**. Důvody:
- kvalita závisí na pravděpodobnostním modelu, který zatím nemáme ověřený
- chyba jde směrem **podhodnocení** zisku, což je bezpečnější než opak
- ztrojnásobila by se velikost odpovědi

Musí to být **napsané v UI**, ne schované v dokumentaci.

### 4. 🟡 Enchantovaná výbava má jiné ID než suroviny

Suroviny: `T5_METALBAR_LEVEL4@4`. Výbava: `T5_MAIN_SWORD@4`.
Ošetřeno v `identita.ts` už z F1 — ale sken to musí použít, ne skládat ID sám.

**Oprava:** ID skládat výhradně přes `aodpId(polozka, druh)`.

### 5. 🟡 53 kategorií je na výběr moc

Uživatel nechce rolovat 53 položkami, chce „zbraně" nebo „plate brnění".

**Oprava:** skupiny nad kategoriemi (zbraně, brnění, doplňky, nástroje,
sběrné vybavení) + možnost vybrat konkrétní kategorii.

### 6. 🟡 Kategorie `other` (118 předmětů)

Sběrný koš — jsou v něm věci, které spolu nesouvisí. Zařadit ho do
skupiny „ostatní", ne mezi smysluplné kategorie.

### 7. 🟢 Bonus města se u výbavy počítá jinak

Refining +0,40 na surovinu, crafting +0,15 na kategorii.
Jádro to už rozlišuje podle `druh` — ověřit testem, ne předpokládat.

### 8. 🟢 Artefaktové předměty

750 receptur má artefaktový vstup, který se **nevrací** přes return rate.
Jádro to řeší příznakem `vratna`. Sken musí ceny artefaktů také stáhnout
(spadají pod vadu 1).

---

## Plán po oponentuře

```
web/src/
├── data/
│   └── kategorie.ts     skupiny nad 53 kategoriemi          (vady 5,6)
├── stav/
│   └── sken.ts          výběr rozsahu, ID = položky ∪ vstupy (vady 1,4)
└── ui/
    └── OvladaciPanel    volba rozsahu + poznámka o kvalitě   (vada 3)
```

**Testovat:**
- že ID obsahuje vstupy, které nejsou ve výběru (vada 1)
- že se enchantovaná výbava skládá správně (vada 4)
- proklikáním: sken jedné kategorie zbraní, kontrola výpočtu v detailu

---

## Vada nalezená až za běhu

| # | Vada | Jak se projevila | Oprava |
|---|---|---|---|
| 9 | 🔴 **Názvy položek byly syrová ID** | tabulka ukazovala `T4 2h_dualsword.2` | generátor tahá herní názvy z `formatted/items.txt` |

Plán s tím vůbec nepočítal — u surovin to nevadilo, protože jsem měl
ručně napsaný převod pro pět linek. U 1 620 předmětů to přestalo stačit.

**Proč `formatted/items.txt` a ne `localization.xml`:** 1,1 MB proti 70 MB
za totéž, co potřebujeme. Formát řádku:
```
  12: T5_MAIN_SWORD    : Expert's Broadsword
```

Přidalo to ~90 kB do `hra.json`. Ověření hlídá, že bez názvu není víc
než 10 % položek — kdyby se formát změnil, pozná se to.

---

## Ověření

**Proklikáno na živých datech** (AODP, west):

| Test | Výsledek |
|---|---|
| Přepnutí na Zbraně | ✅ odhad 230 → 3 754 položek, 2 → 23 dotazů |
| Kategorie s počty | ✅ „dýky 46", „meče 43", „luky 42"… |
| Zúžení na meče | ✅ 284 položek, 2 dotazy |
| Varování o kvalitě | ✅ vidět v UI, ne schované v dokumentaci |
| Názvy položek | ✅ „T7 Grandmaster's Claymore" místo `T7_2H_CLAYMORE` |
| **Crafting bonus** | Thetford **15,3 %**, Lymhurst (bonus na meče) **24,8 %** ✅ |

Ta poslední řádka je klíčová: **24,8 % odpovídá zlatému vektoru** z průzkumu
pro bonus 33 (18 základ + 15 crafting). Potvrzuje, že jádro správně rozlišuje
refining (+0,40) od craftingu (+0,15) podle druhu položky.

Zajímavé: v Lymhurstu se spočítalo 37 z 203 kombinací, v Thetfordu jen 10 —
v „městě mečů" jsou meče prostě častěji obchodované, takže o nich AODP ví víc.

**Testy:** 158 (119 jádro + 39 web), typová kontrola čistá.

---

## NEOVĚŘENO

- **sken vší výbavy** (~46 s) — testovány jen jednotlivé kategorie
- **zrušení běžícího skenu** — tlačítko existuje, nevyzkoušeno
- **artefaktové předměty** — jádro je řeší příznakem `vratna`, ale konkrétní
  artefaktová zbraň neprošla kontrolou výpočtu
- **kvalita 2–5** — záměrně mimo rozsah, viz vada 3
