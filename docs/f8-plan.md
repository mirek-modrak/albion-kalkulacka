# F8 — plán, oponentura a výsledek

Datum: 2026-07-22
Cíl: **koupit vs. vyrobit** (scénář S4) — vyplatí se ingoty koupit,
nebo je vyrobit z rudy?

**Stav: ✅ HOTOVO** — 241 testů, proklikáno proti ručnímu výpočtu.

---

## Proč to má smysl

Recepty tvoří **řetěz**: T5 ingot potřebuje T4 ingot, ten T3, ten T2.
A na **každém patře** se uplatní return rate.

Když refinuju sám, ušetřím na každé úrovni — úspora se skládá.
Když je ruda vzácná, může být naopak levnější koupit hotové ingoty.
**Bez výpočtu to nejde poznat.**

Jádro algoritmu je rekurze:

```
naklad(položka) =
  min(
    cena na trhu,
    Σ naklad(vstup) × efektivní počet  +  poplatek stanice
  )
```

---

## Oponentura — nalezené vady

### 1. 🔴 Rekurze musí skončit

T2 ingot se dělá z T2 rudy, která **nemá recept** (sbírá se).
Ale kdyby se v datech objevil cyklus, výpočet by se zacyklil a shodil
prohlížeč.

**Oprava:**
- zastavit u položky bez receptu
- **hlídat cestu** — když se položka objeví podruhé, přerušit
- pevný strop hloubky jako pojistka

### 2. 🔴 Táž položka se počítá mnohokrát

T3 ingot je vstupem T4 i (nepřímo) T5. Naivní rekurze ho spočítá
opakovaně — u T8 exponenciálně.

**Oprava:** zapamatovat si mezivýsledky.

### 3. 🔴 Chybějící cena nesmí utnout celý řetěz

Když AODP nemá cenu T6 ingotu, ale má T6 rudu a T5 ingot, **vyrobit
se dá i tak** — jen se nedá srovnat s nákupem.

**Oprava:** rozlišit tři stavy:
- lze koupit i vyrobit → porovnat
- lze **jen vyrobit** → výroba je jediná cesta
- nelze ani jedno → chybí data

> Vrátit „chybí cena" jen proto, že chybí prostřední článek, by zahodilo
> platný výsledek.

### 4. 🟡 Return rate se liší podle patra i města

Bonus města platí jen na svou surovinu. V Thetfordu má ruda +40,
ale dřevo nic — takže u vícestupňového řetězu z různých surovin
se return rate mění.

**Oprava:** počítat bonus pro **každou položku zvlášť**, ne jednou pro celý řetěz.

### 5. 🟡 Poplatek stanice se platí na každém patře

Vyrobit T5 z rudy znamená zaplatit stanici 4× (T2→T3→T4→T5),
ne jednou.

**Oprava:** sečíst poplatky za všechna patra, kde se vyrábí.

### 6. 🟡 Výsledek musí ukázat CESTU, ne jen číslo

„Ušetříš 12 %" je k ničemu, když nevíš, co máš koupit a co vyrobit.

**Oprava:** vypsat řetěz rozhodnutí:
```
T5 ingot   → vyrobit   (ušetří 8 %)
  T4 ingot → vyrobit   (ušetří 15 %)
    T3 ingot → koupit  (výroba by byla o 4 % dražší)
    T4 ruda  → koupit
  T5 ruda    → koupit
```

### 7. 🟡 Hluboká výroba není zadarmo

Vyrobit T5 z rudy stojí čas, focus na každém patře a **hodně místa**.
Kalkulačka ukáže úsporu v silveru, ale ne to, že to trvá čtyřikrát dýl.

**Oprava:** vedle úspory ukázat i **focus celkem** a **počet kroků**.
Ať je vidět, co ta úspora stojí.

### 8. 🟢 Vlastní suroviny

Kdo si rudu nasbírá sám, má nákladovou cenu nula — pak se výroba
vyplatí vždy.

**Oprava:** mimo rozsah. Ruční ceny to řeší: kdo si nasbíral, zadá 0.

---

## Plán po oponentuře

```
jadro/src/
└── retezec.ts        rekurzivní výpočet nákladu       (vady 1,2,3,4,5)

web/src/ui/
└── DetailPolozky     + sekce „koupit vs. vyrobit"     (vady 6,7)
```

**Kde to žije:** v detailu položky, ne jako čtvrtý režim. Je to
doplňující pohled na konkrétní položku, ne samostatná otázka.

**Testovat:**
- že rekurze skončí i u zacykleného vstupu
- že se táž položka nepočítá dvakrát
- že „jen vyrobit" je platný výsledek, ne chyba
- že se poplatek stanice počítá na každém patře
- proklikáním: srovnat s ručním výpočtem na T5

---

## 🆕 Nález v datech: transmutace surovin

Při psaní se ukázalo, že **raw suroviny od T4 výš MAJÍ recept**:

```
T5_ORE ← 1× T4_ORE,  focus 0,  silver 781
```

Je to **transmutace** — přeměna suroviny na vyšší tier. Nestojí focus,
ale **pevný poplatek v silveru**:

| Položka | Poplatek |
|---|---|
| T5 ruda | 781 |
| T6 ruda | 1 250 |
| T7 ruda | 2 500 |
| T8 ruda | 5 000 |

**A generátor ten atribut neukládal.** Transmutace by tedy vypadala
skoro zadarmo a řetězový výpočet by ji chybně doporučoval.

Opraveno napříč: `Varianta.silver` v typech, čtení v generátoru, započtení
v `vypocet.ts` i `retezec.ts`, kontrola v ověření generátoru.

> Kdyby se to neopravilo, kalkulačka by u drahých surovin radila
> „transmutuj z nižšího tieru" — a to by stálo o 781–5 000 silver za kus víc,
> než by ukazovala.

---

## Vada nalezená až za běhu

| # | Vada | Následek | Oprava |
|---|---|---|---|
| 9 | 🔴 **Řetěz se nepřepočítal po změně ceny** | ruční oprava se projevila ve skenu, ale ne v řetězu | čítač `verzeCen` v závislostech |

Sklad cen je **proměnlivý objekt** — jeho odkaz se úpravou nemění, takže
`useMemo` změnu uvnitř nezaznamená. Tutéž past jsem už jednou řešil
v `App.tsx` a v nové komponentě jsem na ni zapomněl.

Odhalilo to až proklikání: zadal jsem T4 baru cenu 5 000 a řetěz dál
ukazoval 266.

---

## Ověření

### Kontrola matematiky proti ručnímu výpočtu

T5 ingot v Thetfordu (ruda 440, T4 bar 266, RRR 36,7 %):

```
1,8987 × 440  =  835,4     (efektivní spotřeba rudy)
0,6329 × 266  =  168,3     (efektivní spotřeba T4 baru)
poplatek stanice  =  7,2
                   ───────
                   1 010,9     ← aplikace: 1 011,0 ✅
```

Úspora proti nákupu za 1 140 = **11 %** ✅

### Rekurze jde do hloubky, když se to vyplatí

Při běžných cenách se řetěz zastaví na prvním patře — mezistupně
je levnější koupit. Po ručním zdražení T4 baru na 5 000 se **zanořil**:

```
T5 Titanium Steel Bar   vyrobit   1 030,4
  └ T5 Titanium Ore     koupit      440,0
  └ T4 Steel Bar        vyrobit     296,6   ← místo nákupu za 5 000
      └ T4 Iron Ore     koupit      146,0
      └ T3 Bronze Bar   …
```

### Zjištění o trhu

Při současných cenách **nemá žádná položka vícekrokový řetěz** — vždycky
je levnější mezistupně koupit. To není chyba, ale informace: trh
s mezistupni je efektivní a vertikální výroba se vyplatí jen při
neobvyklých cenách.

Transmutace se rovněž nikde nevyplatila — 781 silver je víc, než stojí
T5 ruda na trhu (440).

**Testy:** 241 (162 jádro + 79 web), typová kontrola čistá.

---

## NEOVĚŘENO

- **řetěz u předmětů** (meč z ingotů a kůže) — testováno na surovinách
- **enchantované řetězy** s reálnými cenami
- **hluboký řetěz na živých datech** — vyvolán jen ručním zdražením
- chování při **velmi hlubokém řetězu** (T8 přes všechna patra) — strop
  hloubky existuje, nevyzkoušen na reálné položce
