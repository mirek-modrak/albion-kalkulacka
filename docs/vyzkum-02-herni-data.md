# Průzkum #2a — receptury přímo z herních dat

Datum: 2026-07-22
Zdroj: `items.xml` z repozitáře [ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps)
(rozbalená datová sada přímo z klienta hry, 10,5 MB, staženo 2026-07-22)

**Důvěryhodnost: 🟢🟢 nejvyšší možná.** Nejde o komunitní interpretaci ani wiki —
jsou to definice, se kterými počítá sama hra. Tím je uzavřená sekce E,
kterou první průzkum nedokázal ověřit vůbec.

---

## E) Refining — poměry vstupů ✅ VYŘEŠENO

### Pravidlo je jednotné pro všech 5 linek

Ověřeno strojově na všech 115 položkách kategorie `refinedresources`.
**Ore→bar, hide→leather, fiber→cloth, wood→planks i rock→stoneblock mají
naprosto identické poměry.** Žádná linka není výjimka.

| Tier | Raw surovina | + Refined o tier níž | → Výstup |
|---|---|---|---|
| T2 | 1× | — | 1× |
| T3 | 2× | 1× | 1× |
| T4 | 2× | 1× | 1× |
| T5 | 3× | 1× | 1× |
| T6 | 4× | 1× | 1× |
| T7 | 5× | 1× | 1× |
| T8 | 5× | 1× | 1× |

⚠️ **Pozor na dvě místa, kde by se dala čekat pravidelnost, a není:**
- T4 potřebuje **2** raw, ne 3 (posloupnost je 1, 2, 2, 3, 4, 5, 5 — ne lineární)
- T8 potřebuje **5** raw, stejně jako T7 (nepokračuje na 6)

### Alternativní receptura s faction tokenem

Každý tier od T4 výš má **druhou variantu**, která ušetří 1 raw surovinu
výměnou za 1 faction token:

```
T5_PLANKS = 3× T5_WOOD + 1× T4_PLANKS
          = 2× T5_WOOD + 1× T1_FACTION_FOREST_TOKEN_1 + 1× T4_PLANKS
```

Tokeny jsou podle linky: `FOREST` (wood), `MOUNTAIN` (ore), a obdobně dál.

**Důsledek pro kalkulačku:** u každého tieru existují dvě cesty a která je
levnější, závisí na ceně tokenu vs. ceně jedné raw suroviny. Kalkulačka by
měla umět obě, nebo aspoň vybrat levnější.

### Enchantované suroviny (.1 / .2 / .3 / **.4**) ✅

⚠️ **OPRAVA 2026-07-22:** původně jsem zde uvedl jen .1–.3. V `items.xml`
existuje i **`_LEVEL4`** — pro T4–T8, u všech linek kromě kamene, jako plnohodnotný
recept se stejnými poměry. Chyba vznikla špatným rozpočítáním 27 položek na linku:
správně je 7 (ench 0, T2–T8) + 5×4 (ench 1–4, T4–T8) = 27, ne 7 + 5×3.


Poměry jsou **stejné jako u neenchantovaných**. Rozdíl je ve složení:

```
T4_PLANKS_LEVEL1 = 2× T4_WOOD_LEVEL1 (.1)  + 1× T3_PLANKS (.0!)   ← nižší refined je ČISTÝ
T5_PLANKS_LEVEL1 = 3× T5_WOOD_LEVEL1 (.1)  + 1× T4_PLANKS_LEVEL1 (.1)
T6_PLANKS_LEVEL1 = 4× T6_WOOD_LEVEL1 (.1)  + 1× T5_PLANKS_LEVEL1 (.1)
```

**Klíčové pravidlo:** enchantovaná řada začíná až na **T4**. Protože T3
enchantovaný neexistuje, T4 enchant si bere jako vstup **neenchantovaný T3 refined**.
Od T5 výš už se míchá enchantovaná raw s **enchantovanou** refined o stejné úrovni.

Enchant se tedy **nemíchá napříč úrovněmi** — .2 řada bere .2 vstupy, .3 bere .3.

⚠️ **Stoneblock nemá enchantované varianty vůbec.** Zatímco planks/metalbar/
leather/cloth mají po 27 položkách (7 tierů s ench 0 + 5 tierů × ench 1–4),
stoneblock má jen 7. Kalkulačka nesmí nabízet enchantovaný kámen.
Ověřeno: `grep -c 'T[0-9]_STONEBLOCK_LEVEL' items.xml` → **0**.

---

## F) Item value ✅ VYŘEŠENO — je to prostý součet

Předchozí průzkum tenhle vzorec neověřil. Data ho potvrzují jednoznačně:

```
itemvalue(výstup) = Σ (itemvalue(vstup) × počet)
```

Kontrola na dřevěné lince (čísla přímo z `items.xml`):

| Výstup | Výpočet ze vstupů | itemvalue v datech |
|---|---|---|
| T3_PLANKS | 2×2 (T3_WOOD) + 8 (T2_PLANKS)… viz pozn. | 8 ✅ |
| T4_PLANKS | 2×4 + 8 = 16 | 16 ✅ |
| T5_PLANKS | 3×5,34 + 16 = 32,02 | 32 ✅ |
| T6_PLANKS | 4×8 + 32 = 64 | 64 ✅ |
| T7_PLANKS | 5×12,8 + 64 = 128 | 128 ✅ |
| T8_PLANKS | 5×25,6 + 128 = 256 | 256 ✅ |

Item value **refined** surovin zdvojnásobuje po tieru: 4, 8, 16, 32, 64, 128, 256.
Každá úroveň enchantu ji rovněž **zdvojnásobí** (T4: .0=16, .1=32, .2=64, .3=128).

Item value **raw** surovin naopak pravidelná není — je nutné ji brát z dat,
ne dopočítávat: T3_WOOD=2, T4=4, T5=5,34, T6=8, T7=12,8, T8=25,6.

### ⚠️ Nutrition se v items.xml jako atribut craftingu NENACHÁZÍ
Atribut `nutrition` tam je jen u **jídla** (food items), ne u receptur. Komunitní
koeficient `Nutrition = Item Value × 0,1125` tedy **zůstává neověřený** — jen už
víme, že item value, ze které se počítá, je spolehlivá.

---

## F) Focus cost ✅ přímo z dat

`craftingrequirements` nese atribut `craftingfocus` — **je to konkrétní číslo
v datech, žádný vzorec se nemusí odvozovat.**

Posloupnost focus cost (společná pro všechny linky):

| Efektivní úroveň | Focus |
|---|---|
| T2 | 18 |
| T3 | 31 |
| T4 | 54 |
| T5 | 94 |
| T6 | 164 |
| T7 | 287 |
| T8 | 503 |
| ↑ dál pro enchanty | 880, 1539, 2694, **4714** |

Nejvyšší možná kombinace je T8 s enchantem .4 = efektivní úroveň 12 →
**4 714 focusu** za jeden kus (a itemvalue 4 096).

**Zajímavé zjištění:** focus nezávisí na tieru a enchantu zvlášť, ale na jejich
**součtu**. T4.1 stojí 94 focusu — přesně tolik jako T5.0. T8.3 stojí 2694
(= pokračování téže řady o 3 kroky dál).

Poměr mezi sousedními členy je konstantní ≈ **1,746**.

Součástí dat je i `time` (doba craftu) — pro kalkulačku využitelné,
pokud budeme počítat zisk za hodinu.

---

## Váhy — pro modelování přepravy ✅

Váha je v datech u každé položky a **je stejná pro raw i refined stejného tieru**,
a **enchant ji nemění**:

| Tier | kg / kus |
|---|---|
| T2 | 0,23 |
| T3 | 0,34 |
| T4 | 0,51 |
| T5 | 0,76 |
| T6 | 1,14 |
| T7 | 1,71 |
| T8 | 2,56 |

**Důsledek pro převozy:** refining před přepravou váhu **snižuje dramaticky** —
z 5 kusů T7 raw (5×1,71 = 8,55 kg) vznikne 1 kus T7 refined (1,71 kg).
To je zásadní vstup do rozhodnutí "refinovat před převozem, nebo po něm".

Položky mají i `fasttravelfactor` (T5=4, T6=8, T7=16) — pravděpodobně
násobitel poplatku za rychlé cestování. **Nutno ověřit**, jak přesně se používá;
pokud ano, je to přímý vstup pro výpočet teleport fee.

---

## Co z toho plyne pro architekturu

1. **Receptury nedávat do kódu ručně.** Stáhnout `items.xml` a vygenerovat z něj
   datový soubor. Je to jediný způsob, jak přežít patche bez ručního přepisování.
2. `items.xml` má 10,5 MB → parsovat jednou při buildu, ne za běhu.
3. Existuje i `formatted/items.json` (24 MB) — hotový JSON, pokud by XML vadilo.
4. Ceny (AODP) a receptury (ao-bin-dumps) jsou **dva nezávislé zdroje** —
   spojuje je `uniquename` / `item_id`. Formát je stejný (`T5_METALBAR`),
   takže napojení je přímé.

---

## Zbývá neověřeno (řeší běžící průzkum #2b)

- Nutrition koeficient a tím přesný poplatek stanice
- Focus Cost Efficiency — potvrdit halving po 10 000
- Zásoba a regenerace focus points, vliv premium
- Teleport fee sazby a role `fasttravelfactor`
- Kapacity mountů, riziko trasy
- Hideout return rate podle power levelu
