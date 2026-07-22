# Průzkum #1 — ekonomické mechaniky Albion Online

Datum: 2026-07-22
Metoda: multi-agentní web research (6 vyhledávacích úhlů → 24 zdrojů → 65 tvrzení →
25 ověřováno adversariálně, každé 3 nezávislými hlasy → 21 potvrzeno, 4 vyvrácena).

**Jak číst důvěryhodnost:**
- 🟢 **vysoká** — potvrzeno primárním zdrojem + nezávislou kontrolou
- 🟡 **střední** — doloženo, ale ne primárně nebo bez čísel
- 🔴 **nízká** — jen komunitní zdroj, nutno ověřit ručně
- ⬜ **neověřeno** — průzkum selhal, nutný druhý běh

---

## A) Městské bonusy 🟢

Bonusy měst jsou **stabilní konstanty**, žádná sezónní rotace neexistuje.

| Město | Refining bonus | Crafting bonus |
|---|---|---|
| Thetford | ore (ruda) | — |
| Lymhurst | fiber (vlákno) | — |
| Martlock | hide (kůže) | — |
| Bridgewatch | stone (kámen) | — |
| Fort Sterling | wood (dřevo) | — |
| Caerleon | — | food, gathering gear, tools, war gloves, shapeshifter |
| Brecilien | — | capes, bags, potions |

Hodnoty jednotlivých složek (v jednotkách "production bonus", **ne** v procentech návratnosti):

| Složka | Hodnota |
|---|---|
| Základ města (všech 5 Royal + Caerleon + Brecilien) | +18 |
| Specializace města na **refining** dané suroviny | +40 |
| Specializace města na **crafting** dané kategorie | +15 |
| Focus points | +59 |
| Denní bonus (silver day) | +10 |
| Denní bonus (gold day) | +20 |

**Denní bonus se neváže na město, ale na skupiny předmětů** (až dvě denně, losuje se
při maintenance). V kalkulačce tedy musí být samostatný přepínač, ne součást volby města.

Zdroje: wiki Local_Production_Bonus, wiki Resource_return_rate, albioncodex.

---

## B) Return rate — jádro celého výpočtu 🟢

**Toto je nejdůležitější zjištění celého průzkumu.**

Všechny bonusy se nejdřív **sečtou** do jednoho čísla, a teprve ten součet se převede
na procento návratnosti:

```
production_bonus = 18 + (40 nebo 15 nebo 0) + (59 pokud focus) + (0/10/20 denní bonus)

RRR = 1 − 1 / (1 + production_bonus/100)
    = production_bonus / (100 + production_bonus)
```

Kontrolní hodnoty (vzorec je reprodukuje přesně):

| Součet bonusů | Situace | RRR |
|---|---|---|
| 18 | město bez specializace, bez focusu | 15,25 % |
| 18+15 = 33 | crafting v bonusovém městě | 24,8 % |
| 18+40 = 58 | refining v bonusovém městě | 36,7 % |
| 18+59 = 77 | nebonusové město + focus | 43,5 % |
| 18+15+59 = 92 | crafting bonus + focus | 47,9 % |
| 18+40+59 = 117 | refining bonus + focus | 53,9 % |

**Efektivní náklad na suroviny = nominální náklad × (1 − RRR).**

### Tři pasti, na které si dát pozor 🟢

1. **Nesčítat "15 %" a "+18"** — to jsou tatáž věc vyjádřená dvakrát. 15,25 % je
   *výsledek* z +18. Sečíst je = dvojité započtení.
2. **Bonusy se nikdy nenásobí.** Multiplikativní model dává nesmyslné výsledky (>100 %).
3. **Mastery / specializace do return rate NEVSTUPUJE** 🟡 — ovlivňuje jen
   Focus Cost Efficiency (každých 10 000 FCE půlí spotřebu focusu). Hodně návodů
   to plete. Specializace patří do modelu *spotřeby focusu*, ne do návratnosti surovin.

### Další omezení 🟡

- RRR je **očekávaná hodnota** — hází se stochasticky per surovina. U malých sérií
  se skutečnost od výpočtu odchýlí.
- Artefakty a journaly se zpravidla **nevracejí**.
- Ostrovy a osobní stanice **nedávají základ +18** — návratnost jen z focusu.
- Hideout má vlastní model (return dle power levelu a kvality zóny, komunitně
  cca do 26 % / ~30 % se specializací) 🔴 — nutno ověřit.

---

## C) Daně a poplatky

### Marketplace 🟢

| Položka | Sazba |
|---|---|
| Setup fee | 2,5 % z uvedené ceny |
| Sales tax bez prémia | 8 % z finální prodejní ceny |
| Sales tax s prémiem | 4 % |

**Setup fee se platí okamžitě při založení nebo úpravě orderu — u nákupního
i prodejního, a i když se order nikdy nevyplní.** Kalkulačka to musí započítat
na obou stranách obchodu.

### Poplatek za stanici 🟢

**Nepočítá se jako procento hodnoty předmětu**, ale jako **silver za 100 nutrition**:

```
poplatek = spotřebovaná_nutrition × (sazba_za_100_nutrition) / 100
```

- Systém zavedl update *Lands Awakened* (nahradil starší % z item value).
- Strop poplatku snížen v update *Foundations* z 10 000 na 1 000 silver / 100 nutrition.
  ⚠️ Neověřeno, zda strop platí i v 2026.
- Sazbu nastavuje vlastník stanice → **musí být vstupem od uživatele**.

Nutrition se odvozuje z item value zhruba jako `Nutrition = Item Value × 0,1125` 🔴
— komunitní koeficient, oficiálně nepotvrzený.

---

## G) Black Market (Caerleon) 🟡

BM má **simulovaný sklad a dynamickou cenotvorbu**: když padne equipment drop z moba
nebo truhly, hra zkontroluje stav skladu BM. Je-li předmět skladem, mob ho dropne
a stav se sníží; není-li, vytvoří se buy order. Po nahromadění nevyplněných buy orderů
BM zvedá cenu.

**Důsledek pro kalkulačku:** BM cenu nelze zadrátovat, musí se tahat živě
(AODP ji vystavuje jako samostatnou lokaci). Cena se navíc může pohnout, zatímco
jsi na cestě. U málo poptávaných položek se naopak nehne i měsíc → tam je hlavním
rizikem zastaralost dat, ne volatilita.

Přesná číselná křivka eskalace ceny nebyla nikdy publikována.

---

## H) Zdroj cenových dat — Albion Online Data Project (AODP)

**Toto je ověřeno živě, včetně reálných HTTP odpovědí — nejtvrdší část průzkumu.** 🟢

### Tři oddělené regionální hosty

```
https://west.albion-online-data.com     (Americas)
https://east.albion-online-data.com     (Asia)
https://europe.albion-online-data.com   (Europe)
```

Data se mezi nimi **nesdílejí** — jde o oddělené herní světy s oddělenou ekonomikou.
Kalkulačka musí volit base URL podle serveru uživatele.

### API kontrakt (v2)

```
GET /api/v2/stats/prices/{item_ids}.json?locations=A,B&qualities=N
GET /api/v2/stats/history/{items}.json?time-scale=1|6|24
GET /api/v2/stats/charts/{items}.json
GET /api/v2/stats/gold.json
```

- `item_ids` čárkou oddělené **v cestě**, ne v query
- batchování více položek × více měst v jednom requestu je podporované,
  limit je délka URL **4096 znaků**
- `.json` lze nahradit `.xml`

Ukázka odpovědi (živý test 2026-07-22):
```json
{"item_id":"T4_BAG","city":"Bridgewatch","quality":2,
 "sell_price_min":4494,"sell_price_min_date":"2026-07-22T09:45:00"}
```

### Rate limity 🟢

- dokumentované: **180 req/min** a **300 req/5 min**
- ⚠️ **Vázající je ten druhý** → udržitelná rychlost je **60 req/min**, ne 180
- server vyžaduje gzip/deflate kompresi
- enforcement reálně existuje (během testu throttling po ~4 requestech)
- → kalkulačka musí **batchovat, cachovat a mít backoff**

### ⚠️ Zásadní datová vada 🟢

Ceny **nejsou scrapovány serverově**, ale **crowdsourcovány**: hráči si instalují
klienta, který odposlouchává síťový provoz hry a odesílá parsované market pakety.
Klient umí nahrát **pouze to, co hráč sám otevřel v herní tržnici**.

Důsledky:
- data existují jen pro položky/města/kvality, které někdo nedávno prohlížel
- AODP starou hodnotu **nemaže**, jen ji drží dál → tichá zastaralost
- od ledna 2024 SBI **šifruje market pakety** pro část účtů — těm se nahrává
  gold a price history, ale živé market ordery ne
- evropský a asijský host mají výrazně **řidší data** než west

**Implementační povinnost:** každý cenový záznam nese vlastní timestamp
(`sell_price_min_date`, `buy_price_min_date`, …). Kalkulačka **musí**:
- odmítat / vizuálně označit řádky starší než konfigurovatelný práh
- odmítat sentinelové řádky `0001-01-01T00:00:00` s cenou 0 (= nikdy nenaskenováno)

Další rizika dat: manipulované outlier ordery, tenké order booky, nesoulad quality levels.

---

## I) Existující řešení

### albiononlinehub.com 🟡 — nejlepší reference pro UX
Closed-source, bez repozitáře → **inspirace pro vstupy a prezentaci, ne pro vzorce.**

- *Market Flips*: vstupy zdrojové/cílové město (vč. Caerleonu a Black Marketu), tier,
  enchant, min/max unit profit, a zvlášť **"Max Age (minutes)"** zvlášť pro revenue
  a cost data. Výstupy: operation cost, revenue, unit profit, possible total profit, margin %.
- *Refining Profit*: oddělené město nákupu suroviny / refiningu / prodeje, vlastní RRR,
  přepínače focus a premium, volba buy/sell order režimu ceny, station fee, market tax.
- **Mezera, kterou má i on:** nemodeluje skutečné náklady a riziko přepravy
  (žádná kapacita mountu, teleport fee, riziko gank) — jen cenový diferenciál.

### albionfreemarket.com/crafting 🟡 — nejlepší vstupní model
- RRR se buď **automaticky odvodí** z pěti vstupů (item, location, focus, daily bonus,
  hideout power level), **nebo jde zadat ručně jako override** ← tohle stojí za převzetí
- ceny materiálů se volí **per materiál** včetně režimu (sell order / buy order /
  market average / EMV) a města nákupu
- setup fee a sales tax se počítají z typu ceny a přepínače Premium, s volbou
  "No Sales Tax" pro případ, kdy se produkt neprodává přes tržnici

### AlbionKit (github.com/cosmic-fi/albionkit) 🟢 — MIT, TypeScript
Aktivní (poslední push 2026-07-03). Moduly: crafting calculator, farming, cooking,
alchemy, animal breeding, enchanting, labourer yield, market flipper, gold price tracker.

⚠️ Jen 5 hvězd a 76 commitů → **korektnost jeho matematiky nikdo neprověřil**.
Použitelné jako katalog featur, ne jako zdroj vzorců.

---

## ⬜ CO SE NEPODAŘILO OVĚŘIT — chybí pro kompletní kalkulačku

| Sekce | Co chybí | Dopad |
|---|---|---|
| **E) Refining poměry** | tabulka T2–T8 + enchanty .1–.3: kolik raw + kolik nižšího refined na 1 výstup | **Blokující.** Bez toho nelze spočítat refining vůbec. |
| **F) Crafting vzorce** | item value, item power, výpočet focus cost | Blokující pro crafting. |
| **D) Premium** | co mění kromě daně 8→4 % (focus regen, laborer) | Střední — ovlivňuje, zda modelovat focus jako neomezený |
| **G) Logistika** | teleport fee sazby, co lze/nelze teleportovat, weight limity mountů, Royal roads vs. červené/černé zóny | Blokující pro převozové aktivity |
| **C-iii)** | rozdíl v poplatcích hideout vs. městská stanice | Nízký |

---

## ⚠️ Metodické omezení tohoto běhu

`wiki.albiononline.com` a `forum.albiononline.com` vracely **HTTP 403** na automatický
fetch. Veškerý obsah oficiální wiki a vývojářských threadů byl získán přes extrakci
vyhledávače, **nikoli přímým čtením stránky**.

→ **Doporučení:** než se čísla 18 / 40 / 15 / 59 / 10 / 20 zadrátují, ať je Mirek
(nebo někdo ručně v prohlížeči) potvrdí přímo na stránkách `Local_Production_Bonus`
a `Resource_return_rate`.

Naopak AODP API bylo ověřeno **živě** — ta část je spolehlivá.

---

## 🚫 Vyvrácená tvrzení — nepoužívat

1. ~~AlbionKit čerpá data z AODP API~~ (0-3) — zdroj jeho dat je neznámý
2. ~~AlbionKit má Market Flipper s cross-city arbitráží~~ (0-3)
3. ~~Return rate hodnoty "15 % / ~25 % / ~48 % / ~53 % gold day"~~ (0-3) —
   správné hodnoty **vždy odvozovat z formule**, ne z těchto čísel
4. ~~Adresář 3rd-party tools na AODP potvrzuje AODP jako standardní zdroj~~ (1-2) —
   je to self-submitted marketing

---

## 📌 Časová citlivost → důsledek pro architekturu

- **Nejstabilnější:** kombinační formule RRR (roky beze změny) → může být v kódu
- **Nejvíce driftuje:** číselné konstanty bonusů (18/40/15/59) a strop poplatku stanice
  → **musí být v konfiguraci, ne v kódu**
- **Mění se denně:** denní bonus → vstup od uživatele
