# TODO — otevřené otázky k dořešení

Věci, které nejsou blokující, ale je potřeba je někdy dořešit.
Řazeno podle priority.

---

## 🟡 Střední priorita

### 00. Detail vs. tabulka Dílny — dva modely nákladu (F12)

**Stav:** zapsáno 2026-09-15 při F12 (viz [f12-plan.md](f12-plan.md) §5).

Tabulka Dílny (`jadro/src/cesty.ts`) bere suroviny jen z trhu a počítá
setup fee u buy orderu. Sekce „Koupit, vyrobit, nebo enchantovat?" v detailu
(`jadro/src/retezec.ts`) zvažuje i vlastní zpracování surovin (prkna z klád)
a setup fee nepočítá. Náklad „Enchant / ks" v tabulce a „Enchantovat za"
v detailu se proto můžou lišit. Obojí už vede enchant od vyrobeného .0.

**Možné řešení:** přidat do řetězu setup fee a v tabulce volitelně
brát suroviny z řetězu.

### 01. Enchant .3 → .4 — ověřit ve hře

Herní data (`vylepseni`) mají povýšení jen na .1–.3, takže u .4 kusů
je cesta enchantem vždy „—". Ověřit, jestli ve hře .3 → .4 jde a čím.

### 0. Sazby stanic zastarávají a nejde to poznat

**Stav:** zapsáno 2026-08-10 při F11 (viz [f11-plan.md](f11-plan.md) §5).

Poplatek stanice si nastavuje majitel stavby a **v čase ho mění**. Aplikace
sazby drží jako ruční vstup bez data platnosti, takže po týdnu můžou být
mimo, aniž by na to cokoli upozornilo.

U tržních cen se stáří sleduje a barevně označuje (`barvaStari`), u sazeb
stanic ne. Přitom je to stejný druh údaje: ruční odhad, který zastarává.

**Možné řešení:** ukládat u každé sazby čas zadání a v panelu ji po
X dnech označit stejně jako starou cenu. Levné a konzistentní s tím,
co už aplikace u cen dělá.

**Dopad, dokud se to neudělá:** náklady na crafting i refining můžou být
tiše vedle, a projeví se to jako „aplikace počítá jinak než hra".

### 1. Focus Cost Efficiency — jednotky se rozcházejí 100×

**Stav:** odloženo (Mirek 2026-07-22: „nech jako TODO, nižší priorita")

**Problém:**
V `gamedata.xml` je konstanta:
```xml
<ActionFocus costreductionconstant="1.00695555005672">
```
Platí `1,00695555^100 = 2` **přesně** → spotřeba focusu se půlí každých
**100** jednotek FCE.

Dva nezávislé open-source nástroje ale implementují `0,5^(FCE/10000)`,
tedy půlení každých **10 000**.

**Hypotéza (neověřená):** hodnota FCE zobrazená ve hře je 100× větší než
interní jednotka. Pak by obojí sedělo.

**Jak ověřit:** ve hře se podívat na hodnotu Focus Cost Efficiency u konkrétní
mastery a na focus cost jednoho konkrétního craftu s ní a bez ní.
Z poměru se to určí jednoznačně.

**Do té doby:** focus modelovat jako **vstup od uživatele** („kolik focusu
mě to reálně stojí"), ne dopočítávat. Kalkulačka tím není blokovaná —
jen nemůže focus předpovědět automaticky.

**Související:** kolik FCE dává jedna úroveň mastery a jedna úroveň
specializace, se také nepodařilo zjistit (jediný zdroj uvádí 30 FCE za
úroveň mastery, pro specializaci nic).

---

### 2. Kapacita Elder's Transport Mammoth — podezření na chybu

**Stav:** zapsáno s příznakem `"overit": true` v [data/mounts.json](../data/mounts.json)

Hodnota **41 162 kg** je přesně 10× Elder's Transport Ox (4 116 kg).
Vypadá to na chybu v přepisu na wiki.

V herních datech to ověřit nejde — `maxload` je v `items.xml` u všech
813 výskytů nula a ve `spells.xml` atribut vůbec není. Jde o server-side
konfiguraci.

**Jak ověřit:** ve hře najet na Elder's Transport Mammoth a přečíst
zobrazenou nosnost.

**Dopad:** pokud je hodnota chybná, kalkulačka by u tohoto jednoho mountu
navrhovala 10× větší zásilky, než se reálně vejdou.

---

### 3. Caerleon je zvláštní případ — ✅ VYŘEŠENO ve F7

**Stav:** vyřešeno 2026-07-22 v rámci [F7](f7-plan.md).

Řešení: vstup **„očekávaná ztráta zásilek"** (0–50 %), který se odečítá
z tržby. Trasy přes Caerleon jsou navíc označené jako `riziko`.

Ověřeno, že to funguje: při 0 % ztráty vede Caerleon, při 50 % ho přebere
Brecilien. Bez toho vstupu by kalkulačka stavěla nejrizikovější trasu
nahoru, protože počítá jen ceny.

Zbývá otevřené: riziko je zatím **jediná hodnota pro všechny trasy**.
Kdyby bylo potřeba rozlišovat (Caerleon rizikovější než cesta mezi
královskými městy), musel by být odhad per trasa.

<details>
<summary>Původní zápis</summary>

Mirek: *„Caerleon je speciální. Tam vykopává suroviny server a ne hráči,
takže tam vznikají nejlepší příležitosti — ale je to nejvíc riskantní.
Proto jsem uvažoval dát to bokem."*

**Proč to není maličkost:** F5 ukázala, že Caerleon vyhrává nejčastěji
(10× z 29 ziskových). Kalkulačka ho tedy staví nahoru, ale **nemodeluje
riziko cesty** — Caerleon leží uprostřed černé zóny a náklad se dá ztratit.

Srovnávat ho s královskými městy 1:1 je proto zavádějící: ukazuje se
jako nejlepší, protože se počítá jen cena, ne pravděpodobnost, že tam
vůbec dojedeš.

**Možná řešení (rozhodnout, až na to dojde):**
- oddělit Caerleon do samostatné sekce, ne do společného pořadí
- přidat uživatelský vstup „očekávaná ztráta zásilek v %" a započítat ho
- označit řádky, kde vyhrává Caerleon, jako rizikové

Souvisí s [S5/S6](funkcni-specifikace.md) (převoz) — riziko trasy je tam
už vedeno jako věc, která není v datech a musí být odhadem.

</details>

---

## 🔵 Nízká priorita

### 3. Premiová sazba daně 4 %

V `gamedata.xml` je jen jedna konstanta `transactiontax = 0.08`.
Půlení pro premium tam není — je zřejmě server-side.

Sazba 4 % je potvrzená jen z wiki. **Řešení:** držet ji jako
konfigurovatelnou hodnotu, ne jako zadrátovanou konstantu.

### 4. Nutrition = Item Value × 0,1125

Potvrzeno vývojářským postem z 11/2021 (přes textový proxy), ne z herních dat.
V `items.xml` je atribut `nutrition` jen u jídla, ne u receptur.

**Řešení:** koeficient držet v konfiguraci.

### 5. Power cores — bonus hideoutu

Wiki uvádí +1 % obecný / +2 % specialista za power level, stropy ~26 %/~30 %.
V `craftingmodifiers.xml` tyto hodnoty **nejsou** — je to samostatná,
stohující se mechanika.

Relevantní jen pokud budeme někdy modelovat hideouty. Pro v1 mimo rozsah.

### 6. Laborer → silver

`gamedata.xml` má `<LabourerSettings maxyield="1.5" maxbarsegments="9"
happinessperbarsegment="100"/>`, ale převodní mechanika na silver v datech není.

Mimo rozsah v1.

---

## ✅ Vyřešeno / mimo rozsah

### Teleport a transport fee — MIMO ROZSAH
Mirek 2026-07-22: *„teleport se nikdy nevyplatí, takže se vždy bude běhat
pěšky. Není potřeba zvažovat."*

Kalkulačka tedy **nemodeluje poplatek za teleport**. Jediným logistickým
limitem je **nosnost mountu** — kolik se vejde na jednu cestu.

Hypotéza `fasttravelfactor × 30 × počet` se tím stává nepotřebnou.

### Riziko ganku
Není a nebude v herních datech — je to herní zkušenost, ne konstanta.
Pokud se bude modelovat, tak jako uživatelský odhad (např. „očekávaná
ztráta v % zásilek").
