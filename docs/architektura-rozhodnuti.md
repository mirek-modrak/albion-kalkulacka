# Architektura — rozhodnutí a jejich zdůvodnění

Datum: 2026-07-22
Stav: **návrh ke schválení**

Doplňuje [architektura.md](architektura.md) o systematický rozbor.
Každé rozhodnutí má: kontext → možnosti → volba → důsledek → kdy to přehodnotit.

---

## R0. OPRAVA: „server nikdy nepočítá" byla chyba

**Původní návrh:** veškerá herní matematika jen v prohlížeči, server pouze cache cen.
**Důvod:** vyhnout se vzorcům ve dvou jazycích (TypeScript vs. C#).

**Proč to neobstojí:** požadavek *automatické hlídání příležitostí + upozornění*
vyžaduje vyhodnocení ve chvíli, kdy uživatel **nemá otevřený prohlížeč**.
Server, který neumí spočítat zisk, nemůže rozhodnout, jestli poslat upozornění.

Návrh tedy vylučoval jednu ze čtyř funkcí, které byly zadány jako směr.

**Vada je v návrhu, ne v požadavku.** Řeší ji R2 a R3 níže.

---

## R1. Model nasazení — statická SPA, ne SSR

**Kontext:** kalkulačka nemá veřejný obsah k indexování, nemá stránky na sdílení
do vyhledávačů, a její výstup je závislý na vstupech uživatele.

| Možnost | Pro | Proti |
|---|---|---|
| **Statická SPA (Vite)** | žádný běžící proces, hosting triviální, funguje i offline s ručními cenami | žádné SEO (nepotřebujeme) |
| SSR (Next.js) | SEO, server rovnou po ruce | běžící proces navíc, složitější nasazení, výhody nevyužijeme |

**→ Volba: statická SPA (React + Vite + Tailwind + TypeScript).**

Shoduje se s precedentem Předána, které je rovněž aplikace, ne obsahový web.

**Přehodnotit, až:** budeme chtít veřejné sdílitelné stránky s výsledky,
které mají být dohledatelné.

---

## R2. Kde žije herní matematika — samostatný balíček

**Kontext:** vzorce potřebuje prohlížeč (interaktivní výpočty) i server
(vyhodnocení upozornění na pozadí). Vzorce jsou **subtilní** — v jedné session
jsme už udělali dvě chyby v jejich přepisu:
- záměna `1 + r` za `1/(1 − r)` u return rate
- vynechání enchantu `.4` a chybějící focus pro efektivní úroveň 12

Další pasti stejného druhu: výjimka u T4 (bere neenchantovaný T3),
`minimumtax = 1 silver`, kategorie `rock` místo `stone`.

**Toto jsou přesně ty věci, které se při ručním přepisu do druhého jazyka
zkomolí — a nikdo si toho nevšimne, protože výsledek pořád vypadá věrohodně.**

| Možnost | Pro | Proti |
|---|---|---|
| Vzorce dvakrát (TS + C#) | drží C# precedent na serveru | **dva zdroje pravdy**, tichý rozchod, každá změna = dvě úpravy |
| **Jeden balíček v TS, používá ho web i server** | jeden zdroj pravdy | server musí umět TS → odchylka od C# precedentu |
| Vzorce jako data + interpret | jazykově neutrální | vlastní jazyk navíc, přehnané |

**→ Volba: jeden balíček `jadro/` v TypeScriptu, bez závislostí.**

Struktura:
```
jadro/          ← herní matematika, čisté funkce, žádná síť ani UI
web/            ← React aplikace, používá jadro/
sluzba/         ← (později) běh na pozadí, používá jadro/
```

**Důsledek:** serverová část poběží v Node/TypeScriptu, ne v C#.
Zdůvodnění odchylky viz R3.

---

## R3. Odchylka od C# precedentu — vědomá a úzce vymezená

**Kontext:** backendy ekosystému (Předáno, FotoEvidence) jsou C# ASP.NET 9.
Precedent má podle pravidel projektu přednost před teorií.

**Proč je tady odchylka na místě:**

| Existující backendy dělají | Tato služba dělá |
|---|---|
| autentizaci, multi-tenant izolaci | nic z toho (v1 bez účtů) |
| správu obchodních dat v PostgreSQL | cache veřejných cen |
| EF Core migrace, Global Query Filter | žádné schéma uživatelských dat |

Jsou to jiné druhy služeb. Precedent vznikl pro **aplikační backendy
s obchodní logikou a daty zákazníků**. Tahle služba je stahovač a plánovač.

**Navíc: Node už v ekosystému je.** Předáno i FotoEvidence se staví Vitem,
tedy Nodem — jen zatím jen při buildu, ne za běhu. Nasazení přes Docker/Coolify
je pro Node kontejner stejné jako pro .NET.

**→ Volba: služba na pozadí v Node/TypeScriptu. Odchylka platí POUZE pro
tuto službu.** Kdyby kalkulačka někdy potřebovala skutečný aplikační backend
(účty, platby, zákaznická data), platí zpátky C# precedent.

**Pojistka, kdyby se přesto někdy psalo v C#:** viz R8 (testovací vektory).

---

## R4. Kdo co počítá — dělba, ne zákaz

Opravené oproti původnímu „server nikdy nepočítá":

| Úloha | Kde běží | Proč |
|---|---|---|
| Interaktivní výpočet | **prohlížeč** | okamžitá odezva, funguje s ručními cenami, nezatěžuje server |
| Hromadný sken, který spustíš | **prohlížeč** nad cenami ze serveru | výsledek chceš vidět hned, počítá se stejným kódem |
| Hlídání příležitostí na pozadí | **služba** | musí běžet i se zavřeným prohlížečem |
| Odeslání upozornění | **služba** | totéž |

Obojí volá **stejný balíček `jadro/`**. Není to duplicita, je to jedna
knihovna spuštěná na dvou místech.

---

## R5. Ceny — model a původ

Beze změny oproti [architektura.md](architektura.md), shrnutí:

- cena nese **hodnotu + zdroj + čas + město + typ orderu**, nikdy holé číslo
- sklad cen klíčovaný **položkou**, ne aktuálním výběrem
- ruční zadání je rovnocenná cesta, ne nouzovka
- cache **nikdy nepřerazítkuje čas** — stáří dat je skutečné stáří dat

**Zdroje podle situace:**

| Situace | Odkud |
|---|---|
| Jednotlivý výpočet | prohlížeč → AODP přímo (limit 60/min je per-IP) |
| Hromadný sken | prohlížeč → naše cache → AODP |
| Hlídání na pozadí | služba → AODP, plánovaně a pomalu |

---

## R6. Uchování dat — až s upozorněními, ne dřív

| Fáze | Kde je nastavení | Proč |
|---|---|---|
| v1 | paměť prohlížeče | žádná databáze, žádná osobní data, žádné GDPR |
| s upozorněními | PostgreSQL | pravidlo hlídání musí přežít zavřený prohlížeč |

**Až databáze bude:** PostgreSQL podle precedentu ekosystému.
Uloží se **minimum** — co hlídat, jaký práh, kam poslat.
Žádná historie výpočtů, dokud pro ni nebude důvod.

**Spouštěč:** první požadavek na upozornění. Ne dřív.

---

## R7. Účty a přihlášení — ROZHODNUTO: samostatný nástroj

**Rozhodnutí Mirka 2026-07-22: kalkulačka je samostatný nástroj**, ne aplikace
v Samvio marketplace.

Důsledky:
- **žádné účty ani SSO** — v1 je nepotřebuje a nebudeme je stavět dopředu
- **žádné napojení na Samvio SSO** (`sso_token`), žádná vazba na jeho uživatele
- vlastní doména nebo subdoména, rozhodne se až u F6
- **C# precedent se tím dál oslabuje** — kalkulačka nesdílí s ekosystémem
  ani uživatele, ani data, ani doménu. Odchylka z R3 je tím ještě lépe podložená.

**Proč začít takhle a ne opačně:** začlenit samostatný nástroj do ekosystému
lze později. Vydělit zpět nástroj, který už je propletený s SSO a účty,
je výrazně dražší.

**Přehodnotit, až:** by kalkulačka měla mít víc uživatelů než Mirka
a potřebovala je rozlišovat.

---

## R8. Testování — vzorce se testují vektory, ne klikáním

**Kontext:** herní vzorce jsou jediné místo, kde tichá chyba znehodnotí
úplně všechno. Zároveň jsou to čisté funkce → testují se triviálně.

**→ Sada „zlatých vektorů":** tabulka vstupů a ověřených výstupů,
odvozená z herních dat a z ručních propočtů (ty už z prototypu máme:
36,7 % / 43,5 % / 57,8 %, poplatek 7,20, focus 4 714…).

Dvojí užitek:
1. běžná ochrana proti regresi
2. **kdyby se někdy psala druhá implementace v C#, musí projít stejnými
   vektory** — tím se riziko rozchodu srazí na minimum

Testovat se bude **jádro** (rychlé, bez prohlížeče). UI se ověřuje proklikáním
podle pravidel projektu.

---

## R9. Herní data — generovat, verzovat, připnout

- build skript stáhne `items.xml`, `craftingmodifiers.xml`, `gamedata.xml`
  z **konkrétního commitu** `ao-data/ao-bin-dumps`
- vygeneruje kompaktní `hra.json` (desítky kB místo 10,5 MB)
- verze se **zobrazuje v aplikaci**
- aktualizace je vědomý krok, ne samovolná změna

**Proč:** bez připnutí by se čísla změnila pod rukama při patchi a nikdo
by nevěděl proč.

---

## R10. Sken celého trhu zvládne prohlížeč — server na něj není potřeba

**Změřeno naostro 2026-07-22** proti `west.albion-online-data.com`:

| Test | Výsledek |
|---|---|
| 35 surovin × 6 měst | 210 cen, 8,4 kB, 0,26 s, URL 538/4096 znaků |
| **170 předmětů × 6 měst × 3 kvality** | **3 060 cen, 49,6 kB, 0,32 s, URL 3411/4096** |

Do jednoho dotazu se vejde **~170–200 ID** (strop je délka URL 4096 znaků),
a `locations` i `qualities` násobí výsledek, ne počet dotazů.

**Odhad pro úplný sken:**

| Rozsah | Dotazů | Čas | Objem |
|---|---|---|---|
| Suroviny (245 ID) | ~2 | < 1 s | ~30 kB |
| Předměty (1 898 ID) | ~12 | ~4 s | ~600 kB |
| **Vše dohromady** | **~14** | **~5 s** | ~0,6 MB |
| Vše včetně enchantů (~9 500) | ~56 | ~60 s | ~3 MB |

Limit AODP je 60 dotazů/min **per IP**, tedy per uživatel.
Úplný sken spotřebuje čtvrtinu minutového rozpočtu jednoho člověka.

### Důsledek pro architekturu

**Server není potřeba ani pro hromadný sken.** Původní plán ho pro sken
předpokládal (R4, F7) — měření to vyvrátilo.

Zůstává jediný důvod, proč by server někdy vznikl:
**vyhodnocení a odeslání upozornění, když má uživatel zavřený prohlížeč.**

To zároveň znamená:
- fáze F7 se odsouvá dál a zmenšuje
- rozhodnutí R2/R3 (jádro v TS, služba v Node) **platí dál** — jen se týká
  menší a vzdálenější věci, než se zdálo
- do té doby je aplikace **čistě statická**, bez běžícího procesu

> Co by se mohlo pokazit, i kdyby tohle fungovalo správně: AODP může limity
> nebo dávkování kdykoli změnit. Proto musí být velikost dávky konfigurovatelná
> a sken odolný vůči částečnému selhání — dojede zbytek a řekne, co chybí.

---

## R11. Historii a odšumění nesbíráme sami — AODP je už má

**Kontext:** Mirkův návrh (2026-07-22) — nechat sken běžet samostatně, ukládat
data, dělat průměry, tím odfiltrovat jednorázový šum, doplňovat chybějící ceny
a vidět, o co je zájem.

Záměr je správný. Než na něj ale stavět server a databázi, ověřeno, co dává
existující endpoint `/api/v2/stats/history`.

**Změřeno naostro 2026-07-22:**

```json
{"location":"Thetford","item_id":"T5_METALBAR","quality":1,
 "data":[{"item_count":127586,"avg_price":905,"timestamp":"2026-06-23T00:00:00"}, …]}
```

| Co Mirek chtěl | Co AODP history dává |
|---|---|
| průměry pro odfiltrování šumu | `avg_price` — denní průměr **skutečných obchodů** |
| vidět, o co je zájem | `item_count` — **zobchodovaný objem** |
| sbírat měsíc dat | **30 dní zpětně, hned teď** |
| doplňovat chybějící ceny | poslední známý průměr |

Batchuje se stejně jako ceny: 35 položek × 3 města = 2 986 bodů, 34 kB, 0,27 s.
`time-scale` umí 1 h / 6 h / 24 h.

### Proč je to lepší než vlastní sběr

1. **Hned, ne za měsíc.** Vlastní sběr by měsíc nedával nic.
2. **`avg_price` je průměr uskutečněných obchodů**, ne order booku. Náš vlastní
   sběr by ukládal `sell_price_min` — a ten může být jeden trollí order.
   AODP tedy šum filtruje **lépe**, než bychom uměli.
3. **Objem obchodů se z order booku nedá odvodit vůbec.** Vlastní sběr
   snapshotů by tuhle informaci nikdy nezískal.
4. Žádný server, žádná databáze, žádná údržba, žádná záloha.

### Co vlastní sběr přesto dává navíc

| Věc | Hodnota |
|---|---|
| Historie **delší než 30 dní** | jediný skutečný přínos |
| Historie **naší vypočtené ziskovosti** | dá se dopočítat z cenové historie, není nutné ukládat |
| Pokrytí položek, které AODP nemá | žádná — je to tentýž crowdsourcovaný zdroj |

**→ Volba: použít `/stats/history`. Vlastní sběr NEstavět.**

**Přehodnotit, až:** budeme prokazatelně potřebovat delší řadu než 30 dní.
Teprve tehdy má smysl ukládat denní snímky — a i pak stačí ukládat
**už zprůměrovanou historii z AODP**, ne vlastní snímky order booku.

### Co to odemyká funkčně

Tohle je významnější než úspora práce — mění to, co umí skener říct:

1. **Detekce podezřelých cen** — porovnat aktuální cenu s 30denním průměrem.
   Odchylka desetinásobku = chyba v datech nebo manipulace, ne příležitost.
2. **Řazení podle objemu, ne jen marže** — vysoká marže na předmětu, který
   nikdo neobchoduje, je bezcenná, protože ho neprodáš.
3. **Doplnění chybějících cen** posledním známým průměrem, viditelně označené.
4. **Trend** — roste, nebo klesá cena za 7 / 30 dní.

---

## Postup po fázích

Přeuspořádáno 2026-07-22 podle cíle *„co nejefektivněji vydělávat"* —
těžištěm je **skener**, ne kalkulačka na jednu položku.

| Fáze | Co vznikne | Scénáře | Stav |
|---|---|---|---|
| **F1** | `jadro/` — jeden výpočet receptu + zlaté vektory + generátor herních dat | základ pro vše | ✅ |
| **F2** | `web/` — sken surovin: stáhne ceny, spočítá vše, seřadí | **S2** | ✅ |
| **F3** | detail položky, proklik ze skenu, ruční ceny | **S1** | ✅ |
| **F4** | rozšíření skenu na předměty podle kategorií | **S3** | ← další |
| **F5** | **nejlepší příležitosti napříč všemi městy** | **S9** | |
| **F6** | graf ceny a objemu v čase (z `/stats/history`) | **S8** | |
| **F7** | srovnání měst pro převoz + zisk na kg + nosnost mountu | **S5, S6** | |
| **F8** | koupit vs. vyrobit (řetěz receptů) | **S4** | |
| **F9** | nasazení na VPS (Coolify, subdoména) | — | |
| **F10** | `sluzba/` — hlídání a upozornění na pozadí | až bude potřeba | |

### Proč je S9 (napříč městy) až za F4, a ne hned

Obojí rozšiřuje sken, ale v jiné ose: **F4 rozšiřuje CO** se skenuje
(předměty navíc k surovinám), **F5 rozšiřuje KDE** (všech 7 měst).

Kdyby se udělalo F5 první, muselo by se po F4 rozšiřovat znovu.
V tomhle pořadí se srovnání měst postaví **jednou a rovnou pokryje
suroviny i předměty**.

Datově to nic nestojí: AODP násobí odpověď přes `locations`, ne počet
dotazů — 205 ID × 7 měst je jeden dotaz (ověřeno, 1 435 cen za 0,48 s).

**Změny oproti původnímu pořadí:**
- sken (F2) je hned po jádře, ne až třetí — je to jádro produktu, ne nadstavba
- crafting předmětů (F4) postoupil, protože sdílí výpočet s refiningem (viz
  [funkční specifikace](funkcni-specifikace.md)) — není to samostatná práce
- server (dřív F7) se odsunul až za nasazení, protože sken ho nepotřebuje (R10)

**Po F2 už máš nástroj, který odpovídá na otázku „kde se teď nejvíc vydělá".**

---

## Co zůstává nerozhodnuto

1. ~~Samostatný nástroj, nebo aplikace v Samvio?~~ → **rozhodnuto, viz R7:
   samostatný nástroj.**
2. **Rozsah srovnávací tabulky** — kolik řádků je únosné vyplňovat ručně.
   Vyzkoušet na malém dřív než stavět velké.
3. **FCE jednotky** — viz [todo.md](todo.md), obchází se vstupem od uživatele.
4. **Receptury předmětů** — z `items.xml` zatím vytažené jen suroviny.
