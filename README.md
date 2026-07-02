# Delovne ure — Kamnoseštvo Čakš (Vercel verzija)

Ta mapa je popolna spletna aplikacija, pripravljena za objavo na Vercel z
resnično bazo podatkov (Vercel KV), namesto Claudovega `window.storage`,
ki deluje samo znotraj Claude.ai.

Potrebuješ približno 15–20 minut in te tri stvari (vse brezplačne):
- Node.js nameščen na računalniku (https://nodejs.org — izberi "LTS" verzijo)
- GitHub račun (https://github.com)
- Vercel račun (https://vercel.com — najlažje se prijaviš kar z GitHub računom)

---

## 1. korak — Namesti odvisnosti in preizkusi lokalno

Odpri terminal (ukazno vrstico) v tej mapi in poženi:

```
npm install
npm run dev
```

Nato v brskalniku odpri http://localhost:3000 — aplikacija se bo prikazala,
shranjevanje podatkov pa še ne bo delovalo (bazo dodamo v 4. koraku).
To je normalno, samo preveri, da se stran naloži brez napak.

Ustavi ukaz s Ctrl+C, ko si preveril/a.

---

## 2. korak — Naloži kodo na GitHub

1. Pojdi na https://github.com/new in ustvari nov repozitorij
   (npr. ime "delovne-ure-caks"). Naj bo **Private** (zaseben).
2. V terminalu, v tej mapi, poženi (GitHub ti po ustvarjanju repozitorija
   pokaže točno te ukaze, samo zamenjaj naslov s svojim):

```
git init
git add .
git commit -m "Prva verzija"
git branch -M main
git remote add origin https://github.com/TVOJ-UPORABNIK/delovne-ure-caks.git
git push -u origin main
```

---

## 3. korak — Poveži z Vercel

1. Pojdi na https://vercel.com/new
2. Izberi "Import Git Repository" in izberi repozitorij, ki si ga pravkar naložil/a.
3. Pusti vse nastavitve privzete (Next.js zazna samodejno) in klikni **Deploy**.
4. Počakaj minuto ali dve — dobiš svojo povezavo, nekaj v stilu
   `https://delovne-ure-caks.vercel.app`.

Stran bo delovala, shranjevanje podatkov pa še ne — to uredimo v naslednjem koraku.

---

## 4. korak — Dodaj bazo podatkov (Vercel KV)

1. V nadzorni plošči projekta na Vercel pojdi na zavihek **Storage**.
2. Klikni **Create Database** → izberi **KV** (Redis-podobna baza za
   shranjevanje ključ-vrednost, natanko to, kar aplikacija potrebuje).
3. Daj ji ime (npr. "caks-baza") in klikni **Create**.
4. Vercel te vpraša, ali jo želiš povezati s projektom — izberi svoj projekt
   in potrdi. To samodejno doda potrebne skrivnostne ključe (env spremenljivke)
   v projekt.
5. Pojdi nazaj na zavihek **Deployments** in pri zadnji objavi klikni "..." →
   **Redeploy** (da aplikacija zdaj dobi dostop do baze).

---

## 5. korak — Preizkusi

Odpri svojo Vercel povezavo na telefonu. Ob prvem obisku te aplikacija vpraša,
da nastaviš **geslo administratorja** — enako kot prej v Claude verziji.
Nato dodaš zaposlene, in vsi lahko uporabljajo isto povezavo.

To povezavo (npr. `https://delovne-ure-caks.vercel.app`) pošlji sodelavcem,
naj si jo shranijo na začetni zaslon telefona.

---

## Kako pozneje kaj spremeniti

Če boš želel/a, da ti kdaj v prihodnje pomagam z novo funkcijo, mi samo
prilepi trenutno kodo (datoteka `components/App.jsx`) v pogovor, jaz jo
popravim, ti pa spremenjeno datoteko naložiš nazaj v GitHub repozitorij
(lahko kar prek GitHub spletne strani, z "Upload files" oz. "Edit" gumbom) —
Vercel nato samodejno znova objavi novo verzijo.

## Če kaj ne dela

- Če stran po 4. koraku še vedno ne shranjuje podatkov, preveri, da si res
  naredil "Redeploy" po povezavi baze.
- Če `npm install` javi napako, preveri, da imaš nameščen Node.js (ukaz
  `node -v` v terminalu naj izpiše številko različice).
