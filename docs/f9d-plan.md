# F9d — plán a oponentura: filtrování Dílny a tabulkový pohled

Datum: 2026-08-05
Cíl: **udržet přehled v Dílně s desítkami položek.**

**Stav: 🟡 ROZPRACOVÁNO**

---

## Zadání

| Požadavek | Zdroj |
|---|---|
| Řazení a filtrování položek v Dílně | Mirek, 2026-08-05 |
| Filtry: hledání, jen ziskové, skrýt bez ceny, tier, enchant, kategorie | Mirek, 2026-08-05 |
| **Ne**: město výroby, minimální likvidita, stáří cen | Mirek, 2026-08-05 |
| Tabulkový pohled jako **druhá záložka** k porovnání s kartami | Mirek, 2026-08-05 |
| Po vyzkoušení se horší pohled smaže | Mirek, 2026-08-05 |

---

## Východisko

Karty se dnes vykreslují v pořadí, v jakém je uživatel přidal
([TabDilna.tsx](../web/src/ui/TabDilna.tsx)) — žádné řazení, žádný filtr.
U deseti položek to nevadí, u padesáti je to stěna karet.

---

## Návrh

### Rozdělení odpovědnosti

| Kde | Co |
|---|---|
| `stav/filtrDilny.ts` | **veškerá logika** řazení a filtrování, bez Reactu → testovatelné |
| `ui/FiltrDilny.tsx` | lišta s ovládáním, společná pro oba pohledy |
| `ui/TabDilna.tsx` | společný obal (nastavení, vyhledávač, panel surovin) + **volba vykreslení** |

Pohledy se liší **jen vykreslením seznamu**. Vše ostatní je společné —
jinak by se porovnávaly dvě různě fungující věci, ne dva vzhledy.

### Nastavení filtru

```ts
{ hledani, jenZiskove, skrytBezCeny, tiery[], enchanty[], skupiny[], razeni }
```

Prázdné pole = „vše" (ne „nic") — jinak by prázdný výběr schoval všechno.

**Řazení:** ruční (dnešní, výchozí), zisk, marže, zisk/kg, zisk/focus,
název, tier.

### Uložení

Vlastní klíč `albion:filtr-dilny:v1`. **Nesynchronizuje se** — na mobilu
chce člověk vidět něco jiného než na počítači a filtr není práce, o kterou
by byla škoda přijít. Konstrukčně je to zajištěné tím, že
`balicek.sesbirej()` tenhle klíč nečte.

### Tabulkový pohled

Sloupce: položka · kde→kam · zisk za dávku · marže · náklad/ks · tržba/ks ·
likvidita · stáří · odebrat.

Kliknutí na řádek rozbalí pod ním to, co je dnes v kartě po kliknutí na 🔧
(volba města a místa prodeje pro tu jednu položku, návrat na globální).
Bez toho by tabulka neuměla to, co karty, a porovnání by bylo nefér.

---

## Harmonogram

| Krok | Co |
|---|---|
| 1 | `filtrDilny.ts` + jednotkové testy |
| 2 | `FiltrDilny.tsx` a zapojení do dnešní Dílny (karty) |
| 3 | tabulkový pohled + záložka |
| 4 | proklikání obojího včetně úzkého okna, nasazení |

---

# Oponentura — nalezené vady

### 1. 🔴 Dva pohledy = dvě rozcházející se implementace

První verze počítala se samostatnou záložkou, tedy i s vlastním obalem,
vlastním filtrováním a vlastním ovládáním. Za týden by se lišily
v drobnostech a Mirek by neporovnával vzhledy, ale dvě různě funkční
Dílny — a rozhodl by se podle chyby, ne podle přehlednosti.

**Změna návrhu:** jedna komponenta, jeden filtr, jedno místo s daty;
přepínač mění **jen vykreslení seznamu**. Smazání horší varianty pak
znamená smazat jednu větev, ne rozplétat dvě kopie.

### 2. 🔴 Skrytá položka vypadá jako ztracená

Uživatel přidá item, ale zrovna nastavený filtr ho schová. Ve výsledku
to vypadá, že přidání nefungovalo — a člověk ho přidá znovu.

**Změna návrhu:** nad seznamem je vždy vidět „X z Y položek · zrušit filtr",
a po přidání položky, kterou filtr schová, se to výslovně připomene.

### 3. 🟡 Položky bez ceny by při řazení podle zisku vyskočily nahoru

Nemají zisk. Kdyby se bral jako nula, u ztrátových položek by se řadily
před ně — a uživatel by nahoře viděl to, o čem se neví nic.

**Změna návrhu:** položky bez ceny končí při řazení podle peněz vždy dole,
bez ohledu na směr. Při řazení podle názvu nebo tieru se řadí normálně.

### 4. 🟡 Filtr by se synchronizoval mezi zařízeními

Kdyby se uložil do stavu Dílny, odnesl by se balíčkem na server a na mobilu
by přepsal tamní pohled. To je zbytečné vměšování do jiného zařízení.

**Změna návrhu:** vlastní klíč mimo balíček. `sesbirej()` ho nevidí.

### 5. 🟡 Pátá položka v navigaci rozbije úzké okno

Navigace má dnes čtyři záložky a na mobilu je už tak těsná. Pátá ji
přeteče.

**Změna návrhu:** přepínač pohledu **není pátá záložka v hlavní navigaci**,
ale malý přepínač „karty / tabulka" uvnitř Dílny. Ušetří to místo a líp
to vystihuje, že jde o dva pohledy na totéž.

### 6. 🟢 Tier a enchant u položek, které je nemají

Tier se čte z klíče (`T5_...`), enchant za `#`. U položky bez tieru vrátí
rozbor `null`.

**Rozhodnutí:** prázdný výběr = vše, takže dokud si uživatel tier nevybere,
nic se neschovává. Když si tier vybere, položky bez tieru se schovají —
to je očekávané chování.
