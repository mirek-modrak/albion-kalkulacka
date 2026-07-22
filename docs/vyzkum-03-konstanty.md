# Průzkum #3 — globální konstanty z herních dat

Datum: 2026-07-22
Zdroje: `gamedata.xml` (116 kB), `craftingmodifiers.xml` (62 kB) z
[ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps), staženo 2026-07-22.
Poslední commit repozitáře: 2026-07-21 (den před stažením).

**Důvěryhodnost: 🟢🟢 nejvyšší.** Konstanty přímo z klienta hry.
Tím se potvrdila — a v několika bodech **opravila** — čísla, která první průzkum
získal jen nepřímo přes útržky z vyhledávače.

---

## Daně a poplatky ✅ potvrzeno z herních dat

`gamedata.xml`, blok `<MarketPlace><TaxValues>`:

| Konstanta | Hodnota v datech |
|---|---|
| `setupfee` | **0,025** (2,5 %) |
| `transactiontax` | **0,08** (8 %) |
| `smugglersetupfee` | **0,015** (1,5 %) |
| `smugglertransactiontax` | **0,08** (8 %) |
| `minimumtax` | 1 silver (absolutní minimum) |

### 🆕 Nález, který nezmiňoval žádný zdroj

**Black Market má nižší setup fee — 1,5 % místo 2,5 %.**
("smuggler" je interní označení pro Black Market.) Sales tax zůstává 8 %.

Žádný z návodů ani kalkulaček tenhle rozdíl neuvádí. Pro arbitráž přes BM
to není zanedbatelné — je to o 40 % nižší vstupní poplatek.

⚠️ **Premiová sazba 4 % v `gamedata.xml` není.** Konstanta `transactiontax` je jen
jedna (0,08). Půlení pro premium je zřejmě aplikováno jinde (server-side).
Sazba 4 % zůstává potvrzená jen z wiki — pro kalkulačku ji ber jako
konfigurovatelnou, ne jako jistotu.

Navíc existuje `minimumtax = 1 silver` — u velmi levných položek daň nikdy
neklesne pod 1 silver. Kalkulačka to musí ošetřit, jinak u masových levných
obchodů podstřelí náklady.

---

## Focus bonus ✅ potvrzeno — a je to skutečně 0,59

`gamedata.xml`, blok `<ActionFocus>`:

```xml
<ActionFocus costreductionconstant="1.00695555005672">
    <CraftingEfficiency  bonus="0.59" />
    <StudyingEfficiency  bonus="0.59" />
    <CraftingQuality     bonus="50" />
    <ModifyingEfficiency bonus="0.59" />
</ActionFocus>
```

**Číslo +59, které první průzkum získal jen z wiki přes vyhledávač, je potvrzené
přímo z herních dat.** Vzorec return rate tím stojí na pevném základu.

### ⚠️ ROZPOR, který je nutné vyřešit in-game

`costreductionconstant = 1,00695555005672`

Matematicky: `ln(1,00695555) = 0,0069314 = ln(2)/100`, takže
`1,00695555^100 = 2` **přesně**.

To znamená, že vzorec je:
```
focus_cost = base_cost / 1,00695555^FCE
```
a spotřeba focusu se **půlí každých 100 jednotek FCE**.

Jenže dva nezávislé open-source nástroje implementují `0,5^(FCE/10000)`,
tedy půlení každých **10 000**. To je 100× rozdíl.

**Nejpravděpodobnější vysvětlení:** hodnota FCE zobrazená ve hře je 100×
větší než interní jednotka. Obě čísla by pak byla správná, jen v jiných jednotkách.

🔴 **Toto NESMÍ jít do kódu bez ověření ve hře.** Konkrétní test: podívej se
ve hře na svou hodnotu Focus Cost Efficiency u nějaké mastery, a na focus cost
jednoho konkrétního craftu s ní a bez ní. Z toho se poměr určí jednoznačně.

Dokud to není ověřeno, focus modelovat jako **vstup od uživatele**
(„kolik focusu mě to reálně stojí"), ne dopočítávat.

---

## Premium ✅ ceny přímo z dat

```xml
<PremiumPackage days="30"  goldcost="3750"/>
<PremiumPackage days="90"  goldcost="10500"/>
<PremiumPackage days="180" goldcost="19500"/>
<PremiumPackage days="360" goldcost="36000"/>
```

Nejlevnější je 360denní balíček — 100 gold/den oproti 125 u měsíčního.

Focus strop **30 000** je nepřímo potvrzen: `<StatBonus attribute="craftingfocus"
change="30000"/>` jako odměna za první nákup premia.

⚠️ **Cenu premia v silveru nikdy nezadrátovat.** Kurz gold/silver je plovoucí
a liší se podle serveru dramaticky — k 2026-07-22 13:00 UTC:
Americas 7 790, Europe 7 601, Asia **12 813** silver/gold.
Kalkulačka to musí číst živě z `/api/v2/stats/gold.json`.

### Laborer — konstanty nalezeny
```xml
<LabourerSettings happinessperbarsegment="100" maxbarsegments="9" maxyield="1.5"
                  maxsafedistancefromhouse="1" maxsafedistancetimeout="3"/>
```
Maximální výnos je násobek **1,5** při plné spokojenosti (9 segmentů × 100).
Přesná mechanika převodu na silver ale v datech není → **neověřeno**.

---

## Bonusy lokací ✅ potvrzeno z `craftingmodifiers.xml`

### Royal města — struktura je jednoznačná

```xml
<!--thetford-->
<craftinglocation clusterid="0000">
    <refiningbonus value="0.18" islandvalue="0" />
    <craftingbonus value="0.18" islandvalue="0" />
    <craftingmodifier name="ore" value="0.40" />
    <craftingmodifier name="meat_pig" value="0.10"/>
    <craftingmodifier name="mace" value="0.15" />
    ... (dalších 4 kategorie po 0.15)
</craftinglocation>
```

| Město | clusterid | Refining +0,40 | Crafting +0,15 (5 kategorií) |
|---|---|---|---|
| Thetford | 0000 | **ore** | mace, naturestaff, firestaff, leather_armor, cloth_helmet |
| Lymhurst | 1000 | **fiber** | sword, bow, … |
| Bridgewatch | 2000 | **rock** | … |
| Martlock | 3004 | **hide** | … |
| Fort Sterling | 4000 | **wood** | … |
| Caerleon | 3003 | — | gatherergear, tools, food, knuckles, shapeshifterstaff |
| Brecilien | 5000 | — | cape, bag, potion |

**Potvrzeno:** base 0,18 pro refining i crafting, specializace +0,40 refining
/ +0,15 crafting. Vše přesně jak předpokládal průzkum #1.

### 🆕 Tři detaily, které nikde jinde nejsou

1. **Interní název kategorie je `rock`, ne `stone`.** Kalkulačka musí použít
   `rock`, jinak nedohledá bonus Bridgewatche.
2. **`islandvalue="0"`** — ostrovy mají prokazatelně nulový základní bonus.
   Potvrzuje domněnku z průzkumu #1 tvrdým zdrojem.
3. **Existují i modifikátory na jídlo** (`meat_pig` 0,10 v Thetfordu) — nižší
   sazba 0,10, samostatná kategorie. Pro v1 mimo rozsah, ale existuje.

### Hideouty ⚠️ komunitní čísla jsou zavádějící

```xml
<craftinglocation continent="OUTLANDS" biome="SWAMP" clusterquality="Q1">
    <refiningbonus value="0.15" />
    <craftingmodifier name="mace" value="0.01" />   ← a 4 další kategorie
</craftinglocation>
```

| Kvalita clusteru | Refining | Crafting (jen 5 kategorií podle biomu) |
|---|---|---|
| Q1 | 0,15 | 0,01 |
| Q2 | 0,15 | 0,06 |
| Q3 | 0,15 | 0,11 |
| Q4 | 0,15 | 0,16 |
| Q5 | 0,15 | 0,21 |
| Q6 | 0,15 | 0,26 |

**Tři věci, které komunitní „hideout dává 26 %" zamlčuje:**

1. **Refining v hideoutu je horší než ve městě** — 0,15 vs. 0,18. Hideout
   se na refining nevyplatí, ať je kvalita clusteru jakákoli.
2. **Bloky hideoutů nemají obecný `<craftingbonus>`.** Craftíš-li kategorii,
   která není v seznamu pro daný biom, dostaneš **nulu** — ne 0,18 jako ve městě.
3. Škála 0,01–0,26 platí jen pro **5 kategorií podle biomu** (SWAMP = mace,
   naturestaff, firestaff, leather_armor, cloth_helmet).

Biomy: SWAMP, FOREST, STEPPE, HIGHLAND, MOUNTAIN — každý má vlastní pětici.

⚠️ **Power cores** (+1 % obecný / +2 % specialista za level, stropy ~26 %/~30 %)
jsou **samostatná, stohující se mechanika** a v `craftingmodifiers.xml` nejsou.
Shoda čísla 26 % s Q6 je náhoda — nesmí se slučovat. Tato čísla zůstávají
jen na úrovni wiki 🔴.

---

## Transport fee — částečně, ale s hypotézou

`gamedata.xml`:
```xml
<TravelSettings basetravelcost="0">
    <TierModifier tier="1..8" modifier="30.0" />   ← všechny tiery stejně
</TravelSettings>
```

`items.xml` má u každé položky `fasttravelfactor`, který se **zdvojnásobuje po tieru**:

| Tier | fasttravelfactor |
|---|---|
| T2, T3 | 1 |
| T4 | 2 |
| T5 | 4 |
| T6 | 8 |
| T7 | 16 |
| T8 | 32 |

🟡 **Hypotéza:** poplatek za transport ≈ `fasttravelfactor × 30 × počet kusů`.
Sedí to strukturálně (jeden faktor per item, jeden globální modifikátor),
ale **není ověřeno** a `basetravelcost="0"` naznačuje, že jde jen o část vzorce.

🔴 **Neověřit → nepoužít.** Konkrétní test ve hře: otevři teleport s known
množstvím T5 a T6 zboží a porovnej zobrazenou cenu s výpočtem.

---

## Co zůstává neověřené

| Co | Proč |
|---|---|
| **Kapacita mountů** | V `items.xml` je `maxload`, ale **všech 813 výskytů je nula**. Kapacity budou v `spells.xml` (9 MB, mounted buffy) nebo `characters.xml`. Nedohledáno. |
| **Bezpečnost tras, riziko ganku** | Není a nebude v datech — je to herní zkušenost, ne konstanta. Bude muset být uživatelský odhad. |
| **FCE jednotky** | Rozpor 100 vs. 10 000 — viz výše. Nutný test ve hře. |
| **Premium sazba daně 4 %** | V `gamedata.xml` není. |
| **Laborer → silver** | Konstanty jsou, převodní mechanika ne. |
| **Nutrition = IV × 0,1125** | Potvrzeno jen vývojářským postem z 11/2021 přes proxy, ne z dat. V `items.xml` je `nutrition` jen u jídla. |

---

## Souhrn: co je připraveno k implementaci

**🟢 Bezpečně použitelné (herní data):**
receptury refiningu · item value · focus cost per craft · váhy ·
bonusy všech lokací · marketplace poplatky vč. Black Marketu ·
focus bonus 0,59 · ceny premia · struktura AODP API

**🟡 Použitelné, ale jako konfigurovatelná hodnota:**
premium daň 4 % · nutrition koeficient · sazba stanice (zadává uživatel)

**🔴 Nepoužívat bez ověření ve hře:**
FCE jednotky · transport fee vzorec · power core bonusy · kapacity mountů

---

## Poznámka k udržovatelnosti

Repozitář `ao-bin-dumps` má i **serverové varianty** souborů
(`gamedata_europe.xml`, `gamedata_asia.xml` + `_patch` soubory).
Pokud by se konstanty mezi servery lišily, je to tam vidět —
stojí za kontrolu, až se rozhodne, které servery kalkulačka podpoří.
