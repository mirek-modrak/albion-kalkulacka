# F6 — plán, oponentura a výsledek

Datum: 2026-07-22
Cíl: **graf ceny a objemu v čase** (scénář S8).

**Stav: ✅ HOTOVO** — 198 testů, proklikáno proti kontrolním hodnotám z API.
Mirek: *„ceny bych rád viděl v nějakým přehledném zobrazení i třeba
s grafem objemy/vývoj ceny."*

---

## Co data dávají — ověřeno naostro 2026-07-22

`GET /api/v2/stats/history/{ids}.json?locations=…&time-scale=24`

```json
{"location":"Thetford","item_id":"T5_METALBAR","quality":1,
 "data":[{"item_count":11671,"avg_price":1129,"timestamp":"2026-06-23T00:00:00"}, …]}
```

| Zjištění | Hodnota |
|---|---|
| 1 položka × 3 města | 3 série, **1,2 kB, 0,17 s** |
| Rozsah | **30 dní** zpětně |
| Cena vs. objem | 1 037–1 678 vs. 4 035–24 456 → **15× jiný rozsah** |
| Caerleon | **29 bodů místo 30** |

Ta poslední řádka je důležitá: **díry v datech jsou skutečné**, ne teorie.

---

## Oponentura — nalezené vady

### 1. 🔴 Graf nesmí díry interpolovat

Caerleon má 29 bodů ze 30. Spojnicový graf by chybějící den prostě
přeskočil a nakreslil rovnou čáru — vypadalo by to, že data jsou úplná.

**Oprava:** chybějící den = **přerušená čára**, ne přímka mezi sousedy.
Graf musí ukázat, že tam nic není.

### 2. 🔴 Cena a objem mají 15× jiný rozsah

V jednom měřítku by objem cenu zcela zploštil.

**Oprava:** dvě osy — cena čárou, objem sloupci na pozadí.
Každá s vlastním měřítkem, obě popsané.

### 3. 🔴 Vykreslovací knihovna by byla nepoměrná

Recharts nebo Chart.js přidá stovky kB kvůli jednomu grafu.

**Oprava:** **vlastní SVG**. Je to čára a pár sloupců — desítky řádků kódu,
žádná závislost, žádný problém s CSP při nasazení.

### 4. 🟡 Historie je další dotaz navíc

Sken už dělá 2–23 dotazů. Historie pro každou položku by limit rozbila.

**Oprava:** historie se tahá **až na vyžádání** — když otevřeš detail.
Ne při skenu.

### 5. 🟡 Data historie se musí kešovat

Otevřít a zavřít detail třikrát = tři dotazy na totéž.

**Oprava:** paměť v rámci session, klíčovaná `(server, položka)`.
Neukládat do prohlížeče — je to 30 dní × N položek a rychle se to
znehodnotí.

### 6. 🟡 `avg_price` není totéž co cena v order booku

Historie dává **průměr uskutečněných obchodů**, sken pracuje se
`sell_price_min` / `buy_price_max` z order booku. Jsou to jiná čísla.

**Oprava:** popsat to v UI. Průměr obchodů je *lepší* ukazatel skutečné
ceny, ale nesmí se plést s tím, za co koupíš teď.

### 7. 🟡 Objem je nejcennější údaj a nesmí zapadnout

Marže bez objemu je past — 500 % na předmětu, co se neobchoduje,
není příležitost.

**Oprava:** vedle grafu **číselný souhrn**: průměrný denní objem,
odchylka aktuální ceny od 30denního průměru.

### 8. 🟢 Položka bez historie

AODP nemusí mít nic.

**Oprava:** čitelná hláška, ne prázdný obdélník.

### 9. 🟢 Zrušení při zavření detailu

Uživatel zavře detail dřív, než dotaz doběhne.

**Oprava:** `AbortController`, stejně jako u skenu.

---

## Plán po oponentuře

```
web/src/
├── data/aodp.ts          + nactiHistorii()                (vady 4,9)
├── stav/historie.ts      keš v paměti                     (vada 5)
└── ui/
    ├── GrafHistorie.tsx  vlastní SVG, dvě osy             (vady 1,2,3)
    └── DetailPolozky.tsx + sekce s grafem a souhrnem      (vady 6,7,8)
```

**Testovat:**
- že se díry nespojují (vada 1)
- že se souhrn počítá jen z existujících bodů
- proklikáním: otevřít detail, ověřit graf a čísla proti API

---

## Vada nalezená až za běhu

| # | Vada | Následek | Oprava |
|---|---|---|---|
| 10 | 🔴 **Historie se nezobrazovala u položek bez ceny** | vložil jsem ji dovnitř větve „má výsledek" | přesunuto ven z podmínky |

Je to obrácená logika, než jsem měl: **když chybí aktuální cena, historie
je jediné, co o položce víme.** Právě tam je nejužitečnější — ukáže,
za kolik se to obchodovalo dřív a jestli o to vůbec někdo stojí.

---

## Ověření

**Čísla porovnána s ručním výpočtem z API** (`T5_METALBAR`, Thetford):

| Údaj | Spočítáno z API | Aplikace |
|---|---|---|
| Průměrná cena | 955 | **955** ✅ |
| Denní objem | 144 203 | **144 203** ✅ |
| Trend 7 dní | +6,6 % | **+6,6 %** ✅ |
| Minimum ceny | 892 | **892** ✅ |

**Test díry** (`T8_PLANKS_LEVEL3` — jen 15 bodů ze 30):

| Kontrola | Výsledek |
|---|---|
| **Úseků čáry** | **2, ne 1** ✅ — čára je v dírách přerušená |
| Bodů na čáře | 15 (jen dny s daty) ✅ |
| Sloupců objemu | 15 ✅ |
| Poznámka | „Data jsou jen za 15 z 30 dní" ✅ |
| Historie u položky **bez ceny** | ✅ po opravě vady 10 |

Ta první řádka je jádro věci: kdyby se body jen spojily, graf by mezi
sousedy nakreslil přímku a vypadalo by to, že data jsou úplná.

**Testy:** 198 (119 jádro + 79 web), typová kontrola čistá.

---

## NEOVĚŘENO

- **vzhled grafu** — snímek obrazovky se nepodařilo pořídit, ověřeno jen
  strukturálně (počty prvků SVG). Stojí za ruční pohled.
- **hodinové rozlišení** (`time-scale=1`) — kód ho umí, používá se denní
- **graf v režimu příležitostí** — ověřeno jen ve skenu jednoho města
- **položka úplně bez historie** — hláška existuje, nevyzkoušena
- **světlý motiv**
