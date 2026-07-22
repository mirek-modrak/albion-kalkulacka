# Funkční specifikace — co to má umět

Datum: 2026-07-22
Stav: **návrh k projednání**, obsahuje otevřené otázky

Popisuje **co** aplikace dělá. Jak je postavená → [architektura-rozhodnuti.md](architektura-rozhodnuti.md).

---

## Klíčové zjištění: všechno je jeden recept

Ověřeno v `items.xml` 2026-07-22:

```
T5_METALBAR    ←  3× T5_ORE + 1× T4_METALBAR              focus 94
T5_MAIN_SWORD  ←  16× T5_METALBAR + 8× T5_LEATHER         focus 2251
T5_2H_..._HELL ←  ... + 1× T5_ARTEFACT_...                (artefakt = běžný vstup)
```

**Refining i crafting mají identickou strukturu:** seznam `(položka, počet)` → výstup,
plus `craftingfocus`, `itemvalue`, `amountcrafted`.

Důsledky:
- jádro potřebuje **jeden** výpočet receptu, ne dva
- crafting předmětů není samostatná fáze, vypadne skoro zadarmo
- artefakty jsou běžné vstupy (750 druhů), jen se **nevracejí** přes return rate
  → potřebují příznak „nevratná surovina"

---

## Hlavní cíl — čím se poměřuje každé rozhodnutí

Mirek 2026-07-22: *„Obecně můj cíl je co nejefektivněji vydělávat."*
A konkrétněji: *„stáhnu data z AODP a vyjede mi nejziskovější obchody… co se
vyplatí craftit v různých kategoriích (staff nebo plate armor, plate helmet…)"*

**Těžištěm produktu je tedy skener, ne kalkulačka na jednu položku.**
Kalkulačka je detail, do kterého se proklikáš, když chceš vědět proč.

Otázka, na kterou musí aplikace odpovědět na první obrazovce:
> **„Kde se právě teď nejvíc vydělá?"**

Změřeno, že to jde: úplný sken je ~14 dotazů a ~5 sekund (viz
[R10](architektura-rozhodnuti.md)). Nepotřebuje server.

### Šum v datech je očekávaný, ne výjimka

Mirek: *„Vím, že tam jsou starší data a nějaký bordel, ale nějaké trendy
mi to dokáže ukázat."*

Návrh z toho vychází: neúplná a zastaralá data jsou **normální provozní stav**.
Aplikace je nesmí schovávat ani kvůli nim odmítat počítat — musí je
**označit** a nechat rozhodnutí na uživateli:

- u každého řádku stáří dat a stav
- filtr „ukaž jen data mladší než X hodin"
- podezřele vysoká marže označená jako **podezřelá**, ne oslavovaná
  (u tenkého orderbooku bývá 500% marže chyba v datech, ne příležitost)

---

## Scénáře

Očíslované podle toho, jak je Mirek popsal. U každého: co zadáš, co dostaneš.

### S1 — Vyplatí se mi tohle refinovat? ✅ ověřeno prototypem

**Zadáš:** surovinu, tier, enchant, město, focus, premium, poplatek stanice, ceny
**Dostaneš:** rozpad nákladů, daní a poplatků → čistý zisk, marže, zisk/kus, zisk/focus

Hotovo v [prototypu](../prototyp.html), matematika ověřena ručně.

---

### S2 — Co je teď nejvýhodnější refinovat?

**Zadáš:** město, rozsah (např. všechny linky × T4–T8), ceny hromadně
**Dostaneš:** tabulku seřazenou podle zvolené metriky

Metrika je volitelná, protože absolutní zisk vždycky vyhraje T8:

| Metrika | Kdy ji chceš |
|---|---|
| zisk / vložený silver | mám omezený kapitál (výchozí) |
| **zisk / kg** | vejde se mi jen jeden mount ← pravděpodobně nejdůležitější |
| zisk / focus | focus je vzácnější než silver |
| zisk / kus, zisk celkem | absolutní srovnání |

**Neúplná data se nesmí schovat:** u každého řádku stav
(`ok` / `zastaralé X h` / `chybí cena` / `ručně`) a nad tabulkou „spočítáno 15 z 20".

---

### S2b — Co se vyplatí craftit, po kategoriích 🆕

Rozšíření S2 ze surovin na předměty. Mirkův požadavek:
*„co se vyplatí craftit v různých kategoriích (staff nebo plate armor,
plate helmet apod.)"*

**Zadáš:** město, kategorie (nebo všechny), rozsah tierů
**Dostaneš:** pořadí napříč kategoriemi podle zvolené metriky

Kategorie jsou v herních datech jako `shopsubcategory1` a shodují se
s názvy, které používá `craftingmodifiers.xml` pro bonusy měst
(`sword`, `plate_armor`, `plate_helmet`, `naturestaff`, …).

**Proč to sedí na bonusy měst:** město dává +0,15 na konkrétní kategorie.
Sken po kategoriích tedy rovnou ukáže, jestli se vyplatí craftit to,
na co má tvoje město bonus — nebo něco jiného.

---

### S3 — Vyplatí se craftit tenhle předmět?

Totéž co S1, jen recept má víc vstupů a jiné bonusy města
(crafting +0,15 pro danou kategorii místo refining +0,40).

**Komplikace, kterou refining nemá: kvalita.**
Craftěné předměty mají kvalitu 1–5, ta výrazně mění prodejní cenu.
V `gamedata.xml` je `<CraftingQuality bonus="50" />` — focus zvyšuje šanci
na vyšší kvalitu. AODP ceny jsou **per kvalita**.

→ viz otevřená otázka O2.

---

### S4 — Koupit ingoty, nebo je vyrobit z rudy? 🆕

Vypadává zadarmo z toho, že recepty tvoří řetěz.

**Zadáš:** cílový předmět nebo surovinu
**Dostaneš:** srovnání dvou cest:
- koupit vstup na trhu za tržní cenu
- vyrobit ho o patro níž (a rekurzivně dál dolů)

**Proč to má smysl:** return rate se uplatní na **každém patře**. Vertikální
výroba z rudy může být výrazně levnější než nákup ingotů — nebo naopak,
když je ruda vzácná. Bez tohohle srovnání to nejde poznat.

---

### S5 — Kam se vyplatí odvézt náklad?

**Zadáš:** položku (nebo rozsah), město nákupu, města k porovnání
**Dostaneš:** pro každé cílové město čistý zisk po dani

Teleport je mimo rozsah — jediným omezením je **nosnost mountu**.

---

### S6 — Co naložit na mount?

**Zadáš:** mount (nosnost z [mounts.json](../data/mounts.json)), rozpočet, trasu
**Dostaneš:** co a kolik naložit, aby jedna cesta vydělala nejvíc

Rozhoduje **zisk na kilogram**, ne zisk na kus. Váhy jsou v herních datech.

**Souvislost s refiningem:** 5 kusů T7 rudy váží 8,55 kg, 1 kus T7 ingotu 1,71 kg.
Refinovat **před** cestou sníží váhu 5× → na jednu cestu se vejde mnohonásobně
víc hodnoty. Tohle je pravděpodobně nejsilnější páka v celé hře a kalkulačka
by ji měla umět ukázat.

---

### S7 — Je to skutečná příležitost, nebo chyba v datech? 🆕

Vychází z Mirkova nápadu na sběr historie. Ověřeno, že AODP ji už poskytuje
(30 dní, denní průměry + objemy — viz [R11](architektura-rozhodnuti.md)),
takže se nemusí sbírat a je k dispozici okamžitě.

**Ke každé položce ve skenu se doplní:**

| Údaj | K čemu je |
|---|---|
| 30denní průměrná cena | srovnávací základ proti aktuální ceně |
| **Zobchodovaný objem** | prodám to vůbec? |
| Trend za 7 / 30 dní | roste, nebo klesá? |
| Odchylka od průměru | **je ta cena vůbec pravá?** |

**Tři pravidla, která z toho plynou pro řazení:**

1. **Marže bez objemu je past.** 500% marže na předmětu, který se za měsíc
   neobchodoval, není příležitost — je to položka, kterou neprodáš.
   Řazení musí umět vážit objemem.
2. **Odchylka od průměru je varování, ne výhra.** Cena desetkrát mimo
   30denní průměr je skoro jistě chyba v datech nebo manipulace.
   Označit, ne oslavovat.
3. **Chybějící cena se dá nahradit průměrem** — ale viditelně označeným,
   aby bylo jasné, že to není aktuální stav trhu.

> Tohle je přímá odpověď na *„vím, že tam jsou starší data a nějaký bordel"* —
> nepořádek se nedá odstranit, ale dá se **rozpoznat a označit**.

---

### S8 — Přehled cen s grafem 📌 zadáno, počítat s tím

Mirek 2026-07-22: *„ty ceny bych pak rád viděl v nějakým přehledném zobrazení
i třeba s grafem objemy/vývoj ceny… jen aby se s tím počítalo."*

**Zadáš:** položku (proklikem z detailu nebo skenu)
**Dostaneš:** přehled ceny v čase + objemu obchodů

Data jsou k dispozici z `/stats/history` (30 dní, denní nebo hodinové body,
`avg_price` + `item_count`) — viz [R11](architektura-rozhodnuti.md).

**Co s tím musí návrh počítat už teď:**
- historie se stahuje pro položku **a všechna zajímavá města naráz**
  (jeden dotaz jich zvládne desítky) → datový model musí umět
  více sérií pro jednu položku
- graf potřebuje **dvě osy** — cena a objem mají úplně jiný rozsah
- data mají díry (chybějící dny) → graf je nesmí interpolovat a tvářit se,
  že tam něco bylo

**Kdy:** až po skenu (F2–F4). Není blokující, ale datový model se navrhne tak,
aby se historie nemusela dolepovat.

---

## Co aplikace NEDĚLÁ

Vymezeno, aby se to nerozlézalo:

- neradí, **kdy** obchodovat (žádné predikce vývoje cen)
- nemodeluje **riziko ganku** — není v datech, byl by to jen odhad
  (případně později jako uživatelský vstup „očekávaná ztráta v % zásilek")
- nemodeluje teleport (mimo rozsah)
- neřeší farming, bylinky, zvířata (mimo rozsah v1)
- **nikam se nepřipojuje ke hře** a nic v ní nedělá — jen počítá z veřejných dat

---

## Otevřené otázky

### O1 — Priorita scénářů
Které z S2–S6 jsou pro tebe nejdůležitější? Určuje pořadí prací.

### O2 — Kvalita craftěných předmětů
Zahrnout kvalitu 1–5 (a tím pravděpodobnostní model, kolik kusů vyjde v jaké
kvalitě), nebo v1 počítat jen se základní kvalitou a kvalitu ignorovat?

**Dopad:** s kvalitou je crafting předmětů výrazně složitější a méně jistý.
Bez ní bude výsledek u předmětů systematicky **podhodnocený** (ne nadhodnocený,
což je bezpečnější směr chyby).

### O3 — Hloubka řetězu u S4
Počítat vertikální výrobu jen o jedno patro (ingot z rudy), nebo celý řetěz
až k surovině (meč z rudy a kůže přes všechny mezistupně)?

### O4 — Rozsah srovnávací tabulky
Kolik řádků naráz je únosné vyplňovat ručně? Vyzkoušet na malém dřív než
stavět velké.

### O5 — Enchantované suroviny v S2
Zahrnout do srovnání i `.1`–`.4`? Rozšíří to tabulku 5×, ale AODP pro ně
často nemá data.
