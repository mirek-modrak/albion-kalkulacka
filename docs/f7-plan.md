# F7 — plán, oponentura a výsledek

Datum: 2026-07-22
Cíl: **převoz mezi městy** — kam odvézt, co naložit (scénáře S5 a S6).

**Stav: ✅ HOTOVO** — 222 testů, proklikáno na živých datech.

---

## Proč to není rozšíření stávajícího výpočtu

Dosud aplikace počítá **recept**: vstupy → výstup, s návratností surovin
a poplatkem stanice.

Převoz je **arbitráž**: koupím tady, prodám tam. Žádný recept, a tím pádem:

| Co u výroby platí | U převozu |
|---|---|
| Return rate (bonus města, focus) | **neplatí** — nic se nevyrábí |
| Poplatek stanice | **neplatí** — stanice se nepoužívá |
| Bonus města | **neplatí** |
| Daň z prodeje, setup fee | platí stejně |

Je to tedy **nový výpočet v jádře**, ne parametr toho stávajícího.
Sdílí jen daňové konstanty.

> Kdybych to nacpal do `spocitat()` jako „recept s jedním vstupem
> a nulovým bonusem", vznikla by funkce, která dělá dvě různé věci —
> a při první změně by se jedna z nich tiše rozbila.

---

## Oponentura — nalezené vady

### 1. 🔴 Caerleon se nesmí tiše umístit nahoru

Z F5 víme, že vyhrává nejčastěji. Mirek upozornil, že tam suroviny
těží server, takže tam vznikají nejlepší příležitosti — **a je to
nejrizikovější místo** (leží v černé zóně).

Pořadí podle samotného zisku by ho stavělo první, aniž by zaznělo,
že tam můžeš přijít o celý náklad.

**Oprava:**
- trasy přes Caerleon **označit jako rizikové**
- vstup **„očekávaná ztráta zásilek v %"**, který zisk sníží
- výchozí hodnota nenulová, ať se na to nezapomene

To zároveň řeší [otevřenou otázku z todo.md](todo.md).

### 2. 🔴 Zisk na kus je u převozu k ničemu

Omezením není kapitál ani focus, ale **nosnost mountu**. Položka
s vyšším ziskem na kus, ale desetkrát těžší, je horší volba.

**Oprava:** výchozí metrika **zisk na kilogram**, ne na kus.
A rovnou spočítat, **kolik kusů se vejde** na zvolený mount a **kolik
vydělá jedna cesta**.

### 3. 🔴 Počet dvojic měst roste kvadraticky

7 měst → **42 směrovaných dvojic** na položku. U 115 surovin je to
4 830 kombinací.

**Oprava:** uživatel volí **výchozí město** (kde nakupuje). Tím se to
zúží na 6 dvojic na položku. Cílová města se srovnají mezi sebou.

### 4. 🟡 Ceny nákupu a prodeje jsou z různých stran order booku

Kupuju za `sell_price_min` (beru z nabídky), prodávám buď do
`buy_price_max` (hned), nebo listuju na `sell_price_min` (čekám).

**Oprava:** stejné přepínače jako u výroby. Sdílet, ne duplikovat.

### 5. 🟡 Refining před cestou mění váhu

5× T7 ruda + 1× T6 ingot váží 9,69 kg → 1× T7 ingot váží 1,71 kg.
**Poměr 5,7×.** Na jednu cestu se tedy vejde mnohonásobně víc hodnoty,
když se refinuje předem.

**Oprava:** v tabulce ukázat poměr váhy vstupů k výstupu u surovin,
které jdou refinovat. **Plnou optimalizaci „refinovat a pak vézt"
nechat na F8** (koupit vs. vyrobit) — je to řetěz dvou operací a mísit
to sem by rozmazalo obojí.

### 6. 🟡 Stará data jsou u arbitráže nebezpečnější

U výroby je zastaralá cena nepřesnost. U převozu můžeš dojet a zjistit,
že příležitost už neexistuje — a máš plný mount.

**Oprava:** u převozu **přísnější výchozí práh stáří** (6 h místo 48)
a stáří obou cen, ne jen jedné.

### 7. 🟢 Nosnost mountu

Máme [data/mounts.json](../data/mounts.json) — 35 mountů od 60 do 4 116 kg.

**Oprava:** výběr mountu, výchozí Elder's Transport Ox. Elder's Transport
Mammoth je označený `overit: true` (podezření na chybu) — buď vynechat,
nebo označit.

### 8. 🟢 Vlastní kapacita hráče

Nosnost mountu není celá pravda — postava sama něco unese a to se sčítá.

**Oprava:** volitelný přídavek k nosnosti, výchozí 0. Neznáme přesnou
hodnotu (není v herních datech), takže ať si ji zadá uživatel.

---

## Plán po oponentuře

```
jadro/src/
└── prevoz.ts           NOVÝ výpočet arbitráže             (vady 1,2,4)

web/src/
├── stav/prevoz.ts      srovnání cílových měst             (vada 3)
└── ui/
    ├── TabulkaPrevozu.tsx                                  (vady 2,5,6)
    └── OvladaciPanel    + mount, ztráta zásilek            (vady 1,7,8)
```

**Nový režim** vedle stávajících dvou:
```
Nejlepší příležitosti · Sken jednoho města · PŘEVOZ
```

Tím se zároveň dořeší členění, na které se Mirek ptal — tři režimy
odpovídají třem různým otázkám, ne třem činnostem.

**Testovat:**
- že se u převozu NEUPLATŇUJE return rate ani poplatek stanice
- že se ztráta zásilek propíše do zisku
- že kusů na mount sedí na nosnost a váhu
- proklikáním: srovnat s ručním výpočtem

---

## Ověření

**Proklikáno na živých datech** (AODP, west, nákup v Thetfordu):

```
106 ziskových tras z 342 spočítaných · 47 přes Caerleon (riziko)
Nejčastější cíl: Caerleon (47×), Brecilien (22×), Lymhurst (12×)
```

### Klíčový test — riziko mění vítěze

| Ztráta zásilek | Vítěz | Ziskových tras | „už se nevyplatí" |
|---|---|---|---|
| 0 % | **Caerleon** | — | — |
| 5 % | Caerleon | **106** | 33 |
| 23 % | **Brecilien** | — | — |
| 30 % | Brecilien | **17** | 114 |
| 60 % | — | **2** | 128 |

Mezi 7 % a 23 % **Caerleon z prvního místa vypadne**. Přesně o to šlo:
bez toho vstupu by kalkulačka stavěla nejrizikovější trasu nahoru,
protože počítá jen ceny.

Tím je zároveň vyřešená [otevřená otázka o Caerleonu](todo.md).

### Oprava po Mirkově výtce

První verze měla riziko jako **rozbalovací seznam s nálepkami**
(„0 % — bezpečná trasa", „30 % — riziková trasa").

Mirek: *„nedával bych jim tam strojově procenta, protože to my nedokážeme
odhadnout… zkušený hráč má jiné riziko vs nováček. Ať si s tím mohou
pohrát sami."*

Má pravdu — ta čísla i nálepky jsem si vymyslel. Předstírat, že umíme
odhadnout riziko trasy, je horší než to přiznat.

**Předěláno na:**
- **volný posuvník 0–100 %** + číselné pole, žádné přednastavené stupně
- **žádné hodnotící nálepky** — my nevíme, co je „bezpečné"
- v textu je napsáno, že to odhadnout neumíme a proč
- „z 100 zásilek dojede 55" — okamžitá zpětná vazba
- **sloupec „Dopad rizika"** na každém řádku, aby bylo vidět, o kolik
  to zisk srazilo; řádky, které se překlopí do ztráty, jsou označené
  „už se nevyplatí"

### Kontrola matematiky

Marže 23,9 % (bez rizika) → 17,7 % (při 5 %) sedí přesně:
`1,239 × 0,95 − 1 = 0,177` ✅

Kusů na mount: Elder's Transport Ox 4 116 kg ÷ 0,76 kg = **5 415** ✅
(a u T4 s 0,51 kg → 8 070 ✅)

Zisk za cestu: 5 415 × 0,76 × 26 372 = **108 530 000** ✅ (aplikace: 108 530 743)

**Testy:** 222 (143 jádro + 79 web), typová kontrola čistá.

---

## Co je jinak než u výroby

Ověřeno testem, ne jen návrhem:

| | Výroba | Převoz |
|---|---|---|
| Return rate | ano | **ne** — nic se nevyrábí |
| Poplatek stanice | ano | **ne** |
| Bonus města | ano | **ne** |
| Daň, setup fee | ano | ano |
| Výchozí metrika | marže | **zisk na kilogram** |

Test `výsledek neobsahuje return rate ani bonus` hlídá, že se to
nezamíchá při budoucích úpravách.

---

## NEOVĚŘENO

- **převoz předmětů** (zbraně, brnění) — testováno na surovinách
- **refining před cestou** — poměr váhy 5,7× je spočítaný, ale plná
  optimalizace „koupit rudu, refinovat, odvézt ingoty" patří do F8
- **vlastní kapacita hráče** — v plánu jako vada 8, nakonec neimplementováno
  (neznáme hodnotu a mount je dominantní)
- **Elder's Transport Mammoth** — v nabídce s `(?)`, hodnota neověřena
- **výběr jiného mountu** — seznam funguje, přepnutí nevyzkoušeno
