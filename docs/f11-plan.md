# F11 — nastavení na třech úrovních

**Zadání (Mirek, 2026-08-10):** *„Toto nastavení je společné pro všechny
(dílna, refining apod) nebo je to jen pro refining? Měla by být unikátní
pro refining. Navíc ceny za poplatek stanic může být unikátní pro zbroj,
pro hole, pro refining."*

---

## 1. Dnešní stav

V [App.tsx](../web/src/App.tsx) je **jeden objekt `nastaveni`**, který
dostávají všechny karty. Ukládá se zvlášť pro každý herní server, ale ne
pro každou kartu. Přepsání poplatku stanice v Refiningu ho tedy změní
i v Dílně.

To není jen nepohodlí. Poplatek stanice je **vlastnost konkrétní stavby**,
kterou nastavuje její majitel — Tavírna v Thetfordu má jiný než Mage's
Tower v Lymhurstu. Jedno číslo pro všechno je proto principiálně špatně,
ne jen hrubé.

---

## 2. Tři osy, ne jedna

| Úroveň | Co | Proč právě sem |
|---|---|---|
| **Globální** | server, premium, denní bonus | vlastnost účtu a herního dne, ne činnosti |
| **Per karta** | počet kusů, focus, režim nákupu, režim prodeje | dávka u refiningu je jiná než u craftingu; focus můžeš chtít pálit jen na jedno |
| **Per stanice** | poplatek stanice | devět staveb, každá s vlastní sazbou |

Rozdělení „per karta“ samo o sobě nestačí — i uvnitř Dílny se plátové
brnění a hole vyrábějí v jiných budovách.

### Karty a co je pro ně relevantní

| Karta | počet kusů | focus | režimy | poplatek |
|---|---|---|---|---|
| Příležitosti, Sken města, Dílna, Refining | ano | ano | ano | ano |
| Převoz | ano | **ne** | ano | **ne** |

Převoz nic nevyrábí — focus ani poplatek se u něj neuplatní a nemají se
zobrazovat.

---

## 3. Stanice

Herní data stanici **neobsahují**. `items.xml` má jen `craftingcategory`
(`sword`, `plate_armor`, `ore`…), takže mapování kategorie → stavba musí
vzniknout tady, a je to **odhad, který potřebuje potvrdit hráčem**.

Návrh:

| Stanice | Kategorie |
|---|---|
| Tavírna | `ore` (refining) |
| Koželužna | `hide` |
| Tkalcovna | `fiber` |
| Pila | `wood` |
| Kamenictví | `rock` |
| Warrior's Forge | sword, axe, mace, hammer, knuckles, crossbow, plate_helmet, plate_armor, plate_shoes, shieldtype |
| Hunter's Lodge | bow, spear, dagger, quarterstaff, naturestaff, leather_helmet, leather_armor, leather_shoes |
| Mage's Tower | firestaff, froststaff, arcanestaff, holystaff, cursestaff, cloth_helmet, cloth_armor, cloth_shoes, offhand, offhands |
| Toolmaker | tools, gatherergear, bag, cape |

**Uloží se mapa, ne pole**, a neznámá kategorie spadne na výchozí sazbu.
Bez toho by kategorie přidaná patchem tiše počítala s nulou.

---

## 4. Změny v kódu

| Soubor | Co |
|---|---|
| `web/src/stav/nastaveni.ts` | **nový** — tři úrovně, načtení, uložení, migrace |
| `web/src/stav/stanice.ts` | **nový** — mapa kategorie → stanice, sazby, `sazbaProPolozku` |
| `web/src/stav/sken.ts` | `NastaveniSkenu` se skládá ze tří úrovní; `sazbaStanice` se odvodí z položky |
| `jadro/src/retezec.ts` | `sazbaStanice: number` → **funkce podle položky** |
| `web/src/ui/OvladaciPanel.tsx` | rozdělit na globální a per kartu, skrýt nepoužitelné |
| `web/src/ui/PanelStanic.tsx` | **nový** — sazby, jen ty relevantní pro kartu |
| `web/src/stav/balicek.ts` | přidat nová nastavení, verze **3** |
| `web/src/App.tsx` | držet tři objekty místo jednoho |

### Proč `retezec.ts` v jádru

„Koupit, nebo vyrobit?" prochází patra: T5 meč (Warrior's Forge) ← T5 ingot
(Tavírna) ← T4 ingot (Tavírna). Na každém patře platí **jiná stanice**.
Dnes bere `KontextRetezce` jedno číslo, takže by se sazba Warrior's Forge
uplatnila i na tavení ingotů. Musí to být funkce nad položkou.

---

## 5. Oponentura — nalezené defekty

| # | Čočka | Defekt | Oprava v designu |
|---|---|---|---|
| 1 | Migrace | Nový tvar zahodí `sazbaStanice`, `focus` i `pocetVyrobku` → uživatel přijde o nastavené hodnoty a čísla se tiše změní | Stará hodnota **naseedí všechny** stanice i všechny karty. Po aktualizaci musí čísla vyjít stejně, dokud uživatel sám něco nezmění. |
| 2 | Kompatibilita | Verze balíčku 3 podruhé za den odstřihne starý build od zápisu | Vědomé; do README a do hlášky. Zvážit, jestli nespojit s F10 do jedné vlny. |
| 3 | Atomicita | Nová nastavení mimo balíček = nesynchronizují se a na druhém zařízení chybí | Do `DataBalicku`, včetně `jePrazdny` a `popis` — stejná past jako u refiningu ve F10. |
| 4 | Konzistence | Když si UI odvodí stanici jinak než výpočet, uživatel přepíše sazbu a čísla se nezmění | Jediná funkce `sazbaProPolozku`, ze které čte UI i výpočet. Precedent: `kamSeProdava`. |
| 5 | Řetězec | Sazba jedné stanice uplatněná na všechna patra podhodnotí nebo nadhodnotí náklad | Funkce v `KontextRetezce` (§4). |
| 6 | UI | Devět políček v panelu je stěna | Sekce „Poplatky stanic“, rozbalovací, a **jen stanice relevantní pro danou kartu** (Refining pět linek, Dílna podle položek v seznamu). |
| 7 | Budoucí data | Kategorie přidaná patchem by spadla na sazbu 0 = poplatek zdarma | Mapa + výchozí sazba, nikdy nula jako fallback. |
| 8 | Rozsah | Focus a poplatek u Převozu jsou ovladače, které nic nedělají | Podle tabulky v §2 se u Převozu nezobrazí. |

### Co by se mohlo pokazit, i kdyby to fungovalo správně?

Mapování kategorie → stanice je **odhad, ne herní data**. Když se splete
(hole v jiné budově, než myslím), bude aplikace počítat správně, ale
se sazbou z budovy, do které nechodíš. Proto se mapování před nasazením
potvrzuje s hráčem a stanice je v UI vidět u položky — ne schovaná
v konfiguraci.

Druhá věc: sazby stanic se ve hře **mění v čase**, majitel je přenastavuje.
Aplikace je drží jako ruční vstup bez data platnosti, takže po týdnu
můžou být mimo, aniž by to šlo poznat. Zvážit u nich stáří stejně jako
u cen — mimo rozsah téhle fáze, ale patří to do TODO.

---

## 6. Postup

| Krok | Co | Ověření |
|---|---|---|
| 1 | `stanice.ts` — mapa a `sazbaProPolozku` | testy: každá skenovaná kategorie má stanici; neznámá spadne na výchozí, ne na nulu |
| 2 | `retezec.ts` — sazba jako funkce | zlatý vektor: meč + ingot z různých stanic dá jiné číslo než jedna sazba na všechno |
| 3 | `nastaveni.ts` — tři úrovně a migrace | testy: stará data naseedí všechny karty i stanice; čísla se nezmění |
| 4 | `sken.ts` + `App.tsx` — zapojení | stávající testy beze změny |
| 5 | `OvladaciPanel` + `PanelStanic` | typová kontrola |
| 6 | `balicek.ts` — verze 3, `jePrazdny`, `popis` | test čtení balíčku v1, v2 i v3 |
| 7 | Ověření | testy, build a **proklikání**: změna sazby v Refiningu se NESMÍ projevit v Dílně; změna počtu kusů taky ne; premium se naopak projevit MUSÍ |
