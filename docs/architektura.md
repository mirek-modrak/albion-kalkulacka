# Architektura — návrh

Datum: 2026-07-22
Stav: **návrh ke schválení**, nic se zatím neimplementuje.

Vychází z [průzkumu](vyzkum-01-mechaniky.md) a z ověřeného [prototypu](../prototyp.html).

---

## Co to má umět

**Teď (v1):**
1. Refining — spočítat čistý zisk
2. Crafting předmětů
3. Převoz / arbitráž mezi městy
4. **Srovnávací režim** — nasypat ceny pro celou škálu surovin a tierů
   a dostat pořadí, co se nejvíc vyplatí

**Později (potvrzeno jako směr):**
- dostupné odkudkoli přes odkaz
- automatické hledání příležitostí (sken všeho)
- zapamatované nastavení
- napojení dalších služeb

---

## Základní princip: tři vrstvy, které o sobě vědí co nejmíň

```
┌──────────────────────────────────────────────┐
│  UI — obrazovky                              │
│  jednoduchý výpočet · srovnávací tabulka     │
└───────────────────┬──────────────────────────┘
                    │ volá
┌───────────────────▼──────────────────────────┐
│  JÁDRO — čisté výpočty                       │
│  žádná síť, žádné DOM, jen čísla → čísla     │
└───────────────────┬──────────────────────────┘
                    │ čte
┌───────────────────▼──────────────────────────┐
│  DATA                                        │
│  herní data (statická) · ceny (proměnlivé)   │
└──────────────────────────────────────────────┘
```

**Proč zrovna takhle:** jádro je jediné místo, kde je herní matematika.
Když ho oddělíme, dá se spustit v prohlížeči i na serveru, dá se otestovat
bez klikání, a hlavně — když se změní vzhled, matematika se nesmí rozbít.

Prototyp už takhle napsaný je (`ČÁST 2 — VÝPOČET (čisté funkce)`),
takže se přenese, ne přepíše.

---

## Vrstva 1 — Herní data

**Zdroj:** `ao-data/ao-bin-dumps` (ověřeno, data přímo z klienta hry).

**Jak:** build skript stáhne `items.xml`, `craftingmodifiers.xml`, `gamedata.xml`
a vygeneruje z nich jeden kompaktní soubor `hra.json` (~desítky kB místo 10,5 MB).

**Co obsahuje:** receptury, itemvalue, focus cost, váhy, bonusy měst,
daňové konstanty, ceny premia.

**Klíčové pravidlo:** generuje se **z konkrétního commitu**, ne z `master`.
Verze se zobrazuje v aplikaci.

> Bez připnutí by se aplikace tiše změnila pod rukama, když SBI vydá patch —
> a nikdo by nevěděl, proč včerejší výpočet dnes vychází jinak.

---

## Vrstva 2 — Ceny

Tohle je nejdůležitější rozhodnutí celého návrhu.

### Cena není číslo

Cena musí nést i to, **odkud je a jak je stará**:

```
Cena {
  hodnota:   12 345
  zdroj:     "aodp" | "rucne"
  cas:       2026-07-22T09:45:00      (u ručních = kdy zadáno)
  mesto:     "Thetford"
  typ:       "sell_min" | "buy_max"
}
```

**Proč:** průzkum ukázal, že data z AODP jsou crowdsourcovaná a mohou být
týden stará, aniž by to bylo poznat. Kdyby cena byla jen číslo, tahle informace
by se ztratila hned na prvním předání a kalkulačka by tvrdila nesmysly
se stejnou sebejistotou jako pravdu.

### Ceny se ukládají podle položky, ne podle „co je právě vybráno"

```
sklad cen:  (mesto, položka, typ) → Cena
```

**Proč:** v srovnávacím režimu zadáš ceny pro dvacet položek naráz.
Kdyby byly navázané na aktuální výběr (jako v prototypu), přepnutím tieru
by zmizely. Takhle zůstanou a dají se použít napříč všemi výpočty.

⚠️ Tohle je změna oproti prototypu — ten ceny při změně tieru maže.
Pro jednu položku je to správně, pro dvacet by to bylo k nepoužití.

### Odkud ceny berou

| Zdroj | Kdy |
|---|---|
| **Ruční zadání** | vždycky možné, má přednost |
| **AODP z prohlížeče** | jednotlivé výpočty — limit 60/min je per-IP, každý uživatel má svůj |
| **AODP přes náš server** | jen hromadný sken (viz níže) |

Ruční zadání není nouzové řešení, ale **rovnocenná cesta** — proto je
prototyp postavený tak, že AODP jen předvyplňuje políčka.

---

## Vrstva 3 — Jádro výpočtů

Čisté funkce bez závislostí. Co v něm bude:

- identita položky, receptury, return rate
- výpočet refiningu (hotovo v prototypu)
- výpočet craftingu
- výpočet převozu
- **validace vstupů na hranici** — viz Bezpečnost

### Identita položky je strukturovaná, ne řetězec

```
Polozka { linka: "ore", tier: 5, enchant: 4 }
```

Z ní se odvozuje:
- ID pro herní data: `T5_METALBAR_LEVEL4`
- ID pro AODP: `T5_METALBAR_LEVEL4@4`

**Proč:** ty dva formáty se liší. V prototypu jsem na tomhle už jednou
chybu udělal. Kdyby se nosil jen řetězec, chyba by se opakovala pokaždé,
když někdo napíše nové místo, kde se ID skládá.

---

## Srovnávací režim — jak bude fungovat

Tvůj scénář: *nasypu ceny nákupu v Thetfordu a ceny výkupu ingotů v Thetfordu
pro všechny, a vyjde mi, co je nejefektivnější.*

```
1. Vybereš město + linku (nebo všechny linky)
2. Tabulka: řádek = tier × enchant, sloupce = cena raw / cena refined
3. Vyplníš ručně nebo předvyplníš z AODP
4. Jádro spočítá každý řádek zvlášť
5. Seřadí podle zvolené metriky
```

### Podle čeho řadit — tohle je důležitější, než se zdá

Absolutní zisk na kus je **zavádějící metrika**. T8 vydělá víc než T4 skoro
vždycky, ale spotřebuje mnohonásobně víc kapitálu, focusu i místa na mountu.

Proto bude metrika **volitelná**:

| Metrika | Kdy ji chceš |
|---|---|
| **Zisk / vložený silver** (ROI) | výchozí — mám omezený kapitál |
| Zisk / focus | mám omezený focus (ten je vzácný) |
| **Zisk / kg** | vejde se mi jen jeden mount, co vézt? |
| Zisk / kus | absolutní srovnání |
| Zisk celkem | mám všeho dost |

> „Zisk / kg" je pro tebe pravděpodobně nejužitečnější, protože teleport
> nepoužíváš — omezením je nosnost mountu na jednu cestu.

### Neúplná data se nesmí schovat

Sken dvaceti položek, kde pro pět chybí cena, **nesmí** vrátit pořadí pěti
zbývajících, jako by byly všechny. Každý řádek nese stav:

```
ok · zastaralé (X h) · chybí cena · zadáno ručně
```

A nad tabulkou je vždy vidět: **„spočítáno 15 z 20"**.

> Bez toho by chyběl přesně ten řádek, který byl nejvýhodnější, a nikdo
> by se to nedozvěděl.

---

## Server — kdy a proč

**Zatím ne.** Aplikace poběží jako statický web (soubory, žádný běžící proces).

**Server přidáme, až bude potřeba jedna z těchto věcí:**

| Funkce | Proč vyžaduje server |
|---|---|
| Automatický sken všeho | tisíce dotazů → limit jednoho uživatele nestačí |
| Nastavení napříč zařízeními | musí se někam uložit |
| Discord / upozornění | něco musí běžet, když nemáš otevřený prohlížeč |

Do té doby: nastavení v paměti prohlížeče, hosting zdarma, **nulová údržba
a žádná plocha pro útok**.

### Až server bude, tak takhle

- **Jen cache + sken.** Výpočty zůstávají v jádře, které je sdílené —
  server žádnou matematiku duplikovat nebude.
- **Cache nikdy nepřerazítkuje čas.** Uloží AODP odpověď i s původními
  časovými značkami. Stáří, které uvidíš, je skutečné stáří dat, ne stáří cache.
- **Sjednocení souběžných dotazů.** Když deset lidí naráz chce ceny
  Thetfordu, jde ven jeden dotaz, ne deset.
- **Vlastní limit na uživatele**, aby jeden nevyčerpal limit všem.

---

## Stress-test — co se v návrhu změnilo

Plán jsem po napsání prohnal kontrolními čočkami. Nalezené vady jsou
opravené v návrhu výše, ne odsunuté do sekce „rizika".

| # | Čočka | Vada | Oprava v návrhu |
|---|---|---|---|
| 1 | Souběh | Deset uživatelů přes server = deset dotazů na AODP, limit pryč | Cache + sjednocení souběžných dotazů; interaktivní výpočty jdou z prohlížeče (limit je per-IP) |
| 2 | Atomicita | Sken s částečně chybějícími cenami vrátí zavádějící pořadí | Stav u každého řádku + „spočítáno 15 z 20" |
| 3 | Schéma | Dva různé formáty ID (`_LEVEL4` vs `@4`) | Strukturovaná identita, formáty se odvozují |
| 4 | Provoz | Cache přidá skryté stáří navrch stáří dat | Cache nepřerazítkuje čas, zobrazuje se původní |
| 5 | Provoz | Herní data se změní patchem pod rukama | Generovat z připnutého commitu, verzi zobrazit |
| 6 | Bezpečnost | Záporná nebo absurdní cena rozbije pořadí | Validace na hranici jádra |
| 7 | Schéma | Ruční return rate + změna města = tichý nesoulad | Override je viditelný a explicitně přebíjí (v prototypu už je) |
| 8 | Návrh | Řazení podle absolutního zisku vždy vyhraje T8 | Volitelná metrika, výchozí ROI |
| 9 | Schéma | Ceny navázané na aktuální výběr se ztratí | Sklad cen podle položky, ne podle výběru |

Devět vad na první verzi znamená, že první verze byla povrchní —
proto jsem hledal dál, než by stačilo.

---

## Co ještě nevím

- **Přesná podoba srovnávací tabulky** — kolik řádků naráz je únosné
  vyplňovat ručně. Vyzkoušíme na malém rozsahu dřív, než postavíme velkou.
- **Zda crafting předmětů zvládne stejný model** — receptury předmětů jsem
  z `items.xml` ještě neextrahoval, jen suroviny.
- **FCE jednotky** — viz [todo.md](todo.md), zatím obchází vstupem od uživatele.

---

## Stack — rozhodnuto podle precedentu

Zjištěno z `C:\Mirek\WEB\Projekt_Samvio_ostatni_app\shared\docs` (2026-07-22):

| Aplikace v ekosystému | Stack |
|---|---|
| Samvio (samvio.cz) | Next.js + TypeScript |
| **Předáno PWA** | **React + Vite + Tailwind + TypeScript** |
| FotoEvidence PWA | React + Vite, ještě `.jsx` |
| Backendy | C# ASP.NET 9 + PostgreSQL |
| Nasazení | VPS + Docker + Coolify, domény pod samvio.cz |

**Volba: React + Vite + Tailwind + TypeScript** — shodně s Předánem,
nejnovějším precedentem pro aplikaci.

- kalkulačka je aplikace, ne obsahový web → Vite, ne Next.js
- Tailwind i dark/light režim jsou v ekosystému zavedené
- nasazení: další kontejner v Coolify, subdoména pod samvio.cz

### Rozpor, který z toho vyplynul — a jak je vyřešený

Plán počítal se sdíleným jádrem mezi prohlížečem a serverem.
Jenže precedent pro servery je **C#**, zatímco jádro bude v TypeScriptu.

Dvě špatné cesty:
- porušit precedent a psát server v Node
- mít herní vzorce ve dvou jazycích → **dva zdroje pravdy, které se rozejdou**

**Řešení: server nikdy nepočítá herní matematiku.** Je to výhradně cache cen:
stáhne z AODP, uloží, vrátí. Sken funguje tak, že server pošle balík cen
a klient je propočítá jádrem v TypeScriptu.

Platí tedy zároveň:
- C# precedent pro serverovou část
- jediný zdroj pravdy pro vzorce

> Co by se mohlo pokazit, i kdyby tohle fungovalo správně: při skenu velkého
> rozsahu poputuje na klienta velký balík cen. Pokud by to bylo neúnosné,
> řešením je zúžit rozsah nebo stránkovat — **ne** začít počítat na serveru.
> To pravidlo musí platit i pod tlakem, jinak se vzorce rozdvojí.
