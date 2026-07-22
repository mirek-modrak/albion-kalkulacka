# F1 — plán, oponentura a výsledek

Datum: 2026-07-22
Cíl: `jadro/` — herní matematika jako samostatný balíček + zlaté vektory + generátor herních dat.

**Stav: ✅ HOTOVO** — 119 testů zelených, typová kontrola čistá,
přestavba od nuly ověřena.

---

## Plán (první verze)

1. Kořenový `package.json` s npm workspaces: `jadro/`, `nastroje/`
2. `nastroje/` — skript, který stáhne herní data a vygeneruje kompaktní JSON
3. `jadro/src/` — typy, identita položky, return rate, výpočet receptu
4. `jadro/test/` — zlaté vektory (vitest)

---

## Oponentura — nalezené vady

Před psaním kódu prohnáno kontrolními čočkami. **Deset nálezů**, všechny
promítnuté do plánu níže.

### 1. 🔴 Identita položky se liší podle druhu (nalezeno v datech)

**Suroviny:** enchant = samostatná položka
```xml
<simpleitem uniquename="T5_METALBAR_LEVEL1" enchantmentlevel="1">
```
→ AODP ID: `T5_METALBAR_LEVEL1@1`

**Výbava:** enchant = vnořený prvek, `uniquename` se nemění
```xml
<weapon uniquename="T5_MAIN_SWORD">
  <enchantment enchantmentlevel="1"> … </enchantment>
```
→ AODP ID: `T5_MAIN_SWORD@1`

**Oprava:** v generovaných datech příznak `druh: "surovina" | "vybava"`.
Odvození ID **na jediném místě** (`identita.ts`), otestované pro oba druhy.

> Kdyby se to nechalo na volajícím, chyba se zopakuje pokaždé, když někdo
> napíše nové místo, kde se ID skládá. V prototypu jsem ji už jednou udělal.

### 2. 🔴 Build nesmí záviset na síti

Generátor stahuje z GitHubu. Kdyby běžel při každém buildu, nešlo by
sestavit aplikaci offline a výpadek GitHubu by shodil nasazení.

**Oprava:** vygenerovaný `hra.json` je **součástí repozitáře**.
Regenerace je vědomý krok (`npm run generuj`), ne součást buildu.

### 3. 🟡 Přerušené stažení zanechá poškozená data

**Oprava:** zapisovat do dočasného souboru, ověřit obsah, teprve pak
přejmenovat. Nikdy nepsat rovnou do cílového souboru.

### 4. 🟡 Rozbor XML regulárními výrazy je křehký

Při průzkumu jsem XML pročítal `grep`em. Pro produkci to nestačí —
změna formátování by tiše změnila výsledek.

**Oprava:** skutečný XML parser (`fast-xml-parser`) v `nastroje/`.
`jadro/` zůstává **bez jakýchkoli závislostí**.

### 5. 🟡 Připnutí verze herních dat

**Oprava:** generátor bere data z **konkrétního commitu**, jeho SHA zapíše
do `hra.json` a aplikace ho zobrazí.

### 6. 🟡 Některé suroviny se nevracejí

Průzkum: artefakty a journaly se přes return rate zpravidla nevracejí
(střední důvěryhodnost, v datech to není označené).

**Oprava:** vstup receptu nese příznak `vratna: boolean`.
Výchozí odvození: artefakty a runy/duše/relikvie = nevratné.
**Označit v dokumentaci jako neověřené** a nechat konfigurovatelné.

> Kdyby se to neřešilo, kalkulačka by u artefaktových předmětů
> podhodnocovala náklady — tedy nadhodnocovala zisk. Nebezpečný směr chyby.

### 7. 🟡 Recept nemusí vyrábět 1 kus

`amountcrafted` může být větší než 1.

**Oprava:** nikdy nepředpokládat 1, vždy dělit `amountcrafted`.

### 8. 🟡 Recept má víc variant

Každá surovina od T4 má alternativu s faction tokenem. Výbava má
variantu pro každý stupeň enchantu.

**Oprava:** v datech **pole variant**, ne jedna. Volající vybírá.
Výchozí = varianta bez faction tokenů.

### 9. 🟢 Focus a čas patří k variantě, ne k položce

`craftingfocus` je atribut `craftingrequirements`, tedy varianty.
U výbavy se liší podle stupně enchantu.

**Oprava:** focus a čas ukládat u varianty.

### 10. 🟢 Zaokrouhlování

Hra zaokrouhluje focus **nahoru** na celé číslo. Silver má desetinná místa
u mezivýpočtů.

**Oprava:** vnitřně počítat v plovoucí čárce, zaokrouhlovat až při zobrazení.
Výjimka: focus po slevě zaokrouhlit nahoru (až se bude řešit FCE).

---

## 🆕 Nález mimo rozsah F1: enchant jde získat dvěma cestami

```xml
<enchantment enchantmentlevel="1">
  <craftingrequirements>  … T5_METALBAR_LEVEL1 …     ← vyrobit z enchantovaných surovin
  <upgraderequirements>   <upgraderesource uniquename="T5_RUNE"/>  ← nebo vylepšit runou
```

Průzkum tuhle mechaniku nedokázal ověřit — data ji potvrzují.
Stupně: `_RUNE` (.1), `_SOUL` (.2), pravděpodobně `_RELIC` (.3).

**Je to samostatná otázka na kalkulačku:** co je levnější — vyrobit
z enchantovaných surovin, nebo vylepšit hotový předmět?

**Rozhodnutí:** do F1 se nepočítá, ale generátor `upgraderequirements`
**uloží**, aby se kvůli tomu nemusela data znovu generovat.

---

## Plán po oponentuře

```
albion-kalkulacka/
├── package.json          workspaces: jadro, nastroje
├── jadro/                BEZ ZÁVISLOSTÍ
│   ├── src/
│   │   ├── typy.ts       datové typy
│   │   ├── identita.ts   Polozka → herní ID / AODP ID   (vada 1)
│   │   ├── bonusy.ts     production bonus, return rate
│   │   ├── recept.ts     výběr varianty, spotřeba        (vady 6,7,8,9)
│   │   ├── vypocet.ts    náklady, daně, zisk             (vada 10)
│   │   └── index.ts
│   ├── data/hra.json     VERZOVÁNO V REPU                (vada 2)
│   └── test/             zlaté vektory
└── nastroje/
    └── generuj-data.mjs  stáhne z připnutého commitu     (vady 3,4,5)
```

**Zlaté vektory** — hodnoty ověřené ručně v prototypu:

| Vstup | Očekáváno |
|---|---|
| bonus 18 | RRR 15,25 % |
| bonus 58 (Thetford+ruda) | RRR 36,71 % |
| bonus 77 (18+59 focus) | RRR 43,50 % |
| bonus 137 (18+40+59+20) | RRR 57,81 % |
| T5 refining, 1000 ks | spotřeba raw 3000 → 1898,7 |
| T5, poplatek 200/100 nutr. | 7,20 silver/kus |
| T8`.4` | focus 4714, itemvalue 4096 |
| T4`.2` nižší vstup | `T3_METALBAR` (čistý) |
| T5 meč | 16× T5_METALBAR + 8× T5_LEATHER |

---

## Druhá oponentura — po napsání kódu

Dvě vady se ukázaly **až při spuštění**, což je samo o sobě poučení:
plán je nutný, ale nenahradí ověření na reálných datech.

### Vady nalezené za běhu

| # | Vada | Jak se projevila | Oprava |
|---|---|---|---|
| 11 | 🔴 `<enchantments>` je obalový prvek | meč neměl žádné enchanty ani vylepšení | čtení přes obal |
| 12 | 🔴 Lokace byly clusterid (`0000`) | jména by se nespárovala s AODP | tabulka clusterid → jméno města |
| 13 | 🟡 **Ověření obě vady propustilo** | prošlo, přestože data byla vadná | doplněny kontrolní body přesně na ně |
| 14 | 🟡 `COMMIT = "master"` | rozhodnutí R9 říká připnout, kód nepřipínal | zjišťuje se SHA a zapisuje do dat |
| 15 | 🟡 `typ` u lokace chyběl v typech | test to obcházel přetypováním | doplněno do `Lokace` |
| 16 | 🟡 `marze` a `navratnostKapitalu` byly totéž | dvě jména pro jedno číslo mate | zrušena duplicita |
| 17 | 🟡 Test nevratných surovin testoval jen data | neověřoval, že to výpočet respektuje | přidán test s umělou položkou |
| 18 | 🟢 Chyběl `.gitignore` a `README.md` | — | doplněno |

**Vada 13 je nejdůležitější.** Ověření v generátoru prošlo, přestože meč
neměl enchanty a města neměla jména. Kontroly testovaly jen to, co mě
napadlo dopředu — ne to, co se reálně rozbilo.

> Poučení do dalších fází: když se najde chyba v datech, prvním krokem
> není ji opravit, ale **přidat kontrolu, která ji chytí**. Jinak se vrátí.

### Obava, kterou rozpustilo měření

`hra.json` má 3,4 MB, což vypadalo jako problém pro web.
**Po kompresi je to 103 kB.** Žádné ořezávání není potřeba.

---

## Výsledek

```
119 testů  ·  4 soubory  ·  typová kontrola bez chyb
2 810 položek  ·  11 921 variant receptů  ·  140 lokací (7 měst)
hra.json: 3,4 MB na disku → 103 kB po kompresi
commit herních dat: 51fe5ae5ba683cfd13864a92043fbeb51990503d
```

**Ověřeno:** smazání `hra.json` → regenerace → testy → typová kontrola
proběhne celé od nuly bez zásahu.

**NEOVĚŘENO:** jádro zatím nikdo nepoužil z prohlížeče — to přijde v F2.
Testy běží v Node. Import 3,4 MB JSON do webové aplikace není odzkoušený.
