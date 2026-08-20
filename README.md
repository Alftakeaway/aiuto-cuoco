# Aiuto Cuoco · ProportionKitchen

> Micro-SaaS avanzato di conversione culinaria: la scalabilità delle ricette **supera la linearità matematica** integrando fisica dei fluidi, termodinamica della cottura e approssimazione chimica degli ingredienti.

**Online:** deploy su Vercel (static) · sorgente su GitHub.

---

## Indice

- [Modulo 1 — Palette, Design System & Dettagli Estetici (UI/UX)](#modulo-1--palette-design-system--dettagli-estetici-uiux)
- [Modulo 2 — Logica Matematica e Fisico-Chimica delle Grammature](#modulo-2--logica-matematica-e-fisico-chimica-delle-grammature)
- [Modulo 3 — Architettura del Codice ed Extraction Logic](#modulo-3--architettura-del-codice-ed-extraction-logic)
- [Modulo 4 — Prototipo Interattivo Completo](#modulo-4--prototipo-interattivo-completo)
- [Modulo 5 — Engine di Stima della Cottura (Termodinamica)](#modulo-5--engine-di-stima-della-cottura-termodinamica)
- [Deploy & Stack](#deploy--stack)

---

## Modulo 1 — Palette, Design System & Dettagli Estetici (UI/UX)

L'interfaccia riduce l'affaticamento visivo in cucina (ambienti ad alta luminosità o vapore) e rispetta **WCAG 2.1 AA**.

### 1.1 Palette Colori Esatta (HEX + variabili CSS)

| Ruolo | HEX | Variabile CSS |
|---|---|---|
| Background principale (chiaro) | `#FAFAFA` | `--bg` |
| Background elementi | `#FFFFFF` | `--surface` |
| Primario (brand/action) | `#E65F2B` | `--primary` |
| Secondario (highlight/attrezzi) | `#2C5E43` | `--secondary` |
| Testo principale | `#1E1E24` | `--text` |
| Errore / allerta | `#D9383A` | `--error` |
| Successo / conferma | `#3A8E62` | `--success` |
| Dark Mode Hands-Free | `#0B0F19` | `--hands` |

```css
:root {
  --bg: #FAFAFA;  --surface: #FFFFFF; --primary: #E65F2B;
  --secondary: #2C5E43; --text: #1E1E24;
  --error: #D9383A; --success: #3A8E62; --hands: #0B0F19;
}
```

### 1.2 Tipografia e Layout

- **Font UI:** `Inter` / `Plus Jakarta Sans` — sans-serif geometrica ad alta leggibilità per le frazioni numeriche.
- **Font numeri/grammature:** `JetBrains Mono` / `Roboto Mono` — monospazio che allinea le colonne dei pesi durante il ridimensionamento (`font-variant-numeric: tabular-nums`).
- **Layout:** mobile-first a singola colonna; su desktop dashboard a 3 colonne:
  1. Input ricetta originale (textarea + geometria teglia);
  2. Configuratore geometrico/porzioni (teglia target, porzioni, dispensa limitata, cottura);
  3. Output interattivo (lista ingredienti, note critiche, stima cottura).

### 1.3 Interfaccia "Mani Sporche" (Hands-Free Mode)

- Pulsante gigante **64×64px** con icona Chef Hat (header + CTA colonna 2).
- Sfondo **Dark Mode Avanzata `#0B0F19`**; testi numerici in `#E65F2B` a **42pt** (leggibili a 1,5 m).
- **Progress bar orizzontale** in cima allo schermo in `#3A8E62` che mostra l'avanzamento della preparazione.
- Navigazione: pulsanti giganti, frecce tastiera, `Space`, tap sull'area centrale, `Esc` per uscire.

---

## Modulo 2 — Logica Matematica e Fisico-Chimica delle Grammature

Tutto il motore è in `js/engine.js` (logica pura, senza DOM) e `js/data.js` (dati statici). Le formule chiave:

### 2.1 Geometria dei Contenitori (Volume Effective Multiplier)

```js
// Cilindro (teglia tonda)
const V = Math.PI * (d / 2) ** 2 * h;
// Parallelepipedo (teglia rettangolare)
const V = l * w * h;
// Fattore di conversione: se h non specificata, h_default = 5 cm
const F = V_target / V_originale;
```

Spessore effettivo del cibo usato dal motore termico: `h` dichiarata, oppure `V/A` (rapporto volume/area).

### 2.2 Algoritmo di Approssimazione Uova (Egg Fractioning)

Uovo medio intero senza guscio: **50 g** (30 g albume, 20 g tuorlo).

```js
const EGG_GRAM = { uova: 50, albume: 30, tuorlo: 20 };

function scaleEggs(linearCount, eggType) {
  const whole = Math.floor(linearCount);
  const frac = linearCount - whole;
  const gr = EGG_GRAM[eggType] || 50;
  if (frac <= 0.2) return whole;                 // arrotonda per difetto
  if (frac >= 0.8) return whole + 1;             // arrotonda per eccesso
  const grams = Math.round(frac * gr);           // split di precisione
  return `${whole} uova intere + ${grams}g di uovo sbattuto`;
}
```

Esempio: `3 uova × F=2,4 → 7,2` → frazione 0,2 → **7 uova**. `2,4 uova` → frazione 0,4 → **"2 uova intere + 20g di uovo sbattuto"**.

### 2.3 Tabella Critica dei Coefficienti di Non-Scalabilità

| Categoria | Esempi | Formula | Condizione |
|---|---|---|---|
| Agenti lievitanti | lievito, bicarbonato | `Q = Q₀ · F^0.75` | solo per `F > 2` (sotto: lineare) |
| Sale & spezie forti | peperoncino, noce moscata | `Q = Q₀ · (1 + ln F)` | sempre |
| Liquidi di idratazione | acqua, latte, panna | `Q = Q₀ · F · 0.995^(F−3)` | solo per `F > 3` |

```js
function scaleLeavening(orig, F) {
  return F <= 2 ? orig * F : orig * Math.pow(F, 0.75);
}
function scaleSpice(orig, F) {
  return orig * (1 + Math.log(F));
}
function scaleHydration(orig, F) {
  return F > 3 ? orig * F * Math.pow(0.995, F - 3) : orig * F;
}
```

Il riconoscimento della categoria avviene per **matching semantico** sul nome dell'ingrediente (vedi `NON_SCALABLE`).

---

## Modulo 3 — Architettura del Codice ed Extraction Logic

### 3.1 Regex Engine per NLU lato client — `parseIngredientLine(text)`

Restituisce `{ amount: float, unit: string, name: string }`. Supporta: frazioni semplici (`1/2`), miste (`2 1/2`), decimali (`1,5` / `1.5`), unicode (`¾`), parole (`un`, `mezzo`), quantità senza unità (`3 uova`) e la preposizione `di`.

```js
function parseIngredientLine(rawLine) {
  let line = rawLine.trim().replace(/,/g, '.').replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, c => FRAC_UNI[c]);
  let amount = 1, rest = line, m;
  if ((m = rest.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/))) {            // 2 1/2
    amount = +m[1] + +m[2] / +m[3]; rest = rest.slice(m[0].length);
  } else if ((m = rest.match(/^(\d+)\s*\/\s*(\d+)/))) {             // 1/2
    amount = +m[1] / +m[2]; rest = rest.slice(m[0].length);
  } else if ((m = rest.match(/^(\d+(?:\.\d+)?)/))) {                // 1,5
    amount = parseFloat(m[1]); rest = rest.slice(m[0].length);
  } else if ((m = rest.match(/^(un|uno|una|mezzo|mezza|due|tre)\b/i))) {
    amount = /^mezz/i.test(m[1]) ? 0.5 : m[1].toLowerCase() === 'due' ? 2
           : m[1].toLowerCase() === 'tre' ? 3 : 1;
    rest = rest.slice(m[0].length);
  }
  rest = rest.replace(/^(di|d'|de|a|da)\s+/i, '').trim();
  m = rest.match(UNIT_RE);                                          // unità canonica
  if (m) { unit = UNIT_MAP[m[1].toLowerCase()]; rest = rest.slice(m[0].length).trim(); }
  else unit = 'pezzi';
  return { amount, unit, name: rest || unit };
}
```

### 3.2 Struttura Dati JSON Standard di una Ricetta

Schema rigoroso che mappa la ricetta con metadati geometrici, flag di non-scalabilità e output calcolati:

```json
{
  "id": "torta-della-nonna",
  "title": "Torta della nonna",
  "geometry": {
    "origin": { "shape": "round", "diameter_cm": 22, "height_cm": 5, "volume_cm3": 1900.6 },
    "target": { "shape": "rect", "length_cm": 30, "width_cm": 20, "height_cm": 7, "volume_cm3": 4200.0 }
  },
  "servings": { "origin": 4, "target": 6 },
  "factor": { "geometric": 2.210, "portions": 1.5, "combined": 3.315 },
  "baking": { "origin": { "minutes": 40, "celsius": 180 }, "estimated": { "minutes": 52, "celsius": 160 } },
  "ingredients": [
    {
      "raw": "200g di farina 00",
      "amount": 200, "unit": "g", "name": "farina 00",
      "category": "linear", "nonScalable": false,
      "scaled": { "amount": 663.0, "unit": "g", "note": null }
    },
    {
      "raw": "3 uova",
      "amount": 3, "unit": "uova", "name": "",
      "category": "egg", "nonScalable": true,
      "scaled": { "amount": 10, "unit": "uova", "text": "10 uova", "note": "frazione ≥ 0.8 → arrotondata per eccesso (+1)" }
    },
    {
      "raw": "1/2 cucchiaino di noce moscata",
      "amount": 0.5, "unit": "cucchiaino", "name": "noce moscata",
      "category": "spice", "nonScalable": true,
      "scaled": { "amount": 1.10, "unit": "cucchiaino", "note": "curva logaritmica 1+ln(F)" }
    }
  ],
  "lockedIngredients": ["latte"]
}
```

---

## Modulo 4 — Prototipo Interattivo Completo

**Architettura multi-file** (HTML + CSS + JS separati per ordine e scalabilità):

| File | Contenuto |
|---|---|
| `index.html` | Solo markup: header, 3 colonne, overlay Hands-Free, tour, toast, footer |
| `css/styles.css` | Design system (palette `:root`, classi base, Hands-Free, tour) |
| `js/data.js` | Dati statici: `UNIT_MAP`, conversioni tazze/cucchiai, esempi, tour, numeri vocali |
| `js/engine.js` | Motore puro (niente DOM): parser, geometria, formule non lineari, fattori, cottura, voce |
| `js/app.js` | UI, stato, eventi, dispensa, regole, Hands-Free, salvataggio, tour + `window.__pkTest` |

I moduli condividono il namespace `window.PK` e vengono caricati come script classici in ordine (`data.js` → `engine.js` → `app.js`), così l'app resta fruibile anche aprendo `index.html` direttamente da `file://` (nessun modulo ES → niente problemi CORS). Il motore puro è testabile in isolamento via `window.PK.*`.

Include:
- Input dimensioni teglia di partenza (tonda `22cm` ↔ rettangolare `30×20cm`) e teglia di arrivo;
- Input "Modalità Dispensa Limitata" per bloccare un ingrediente (quantità originale invariata + chip con rimozione);
- Ricalcolo **in tempo reale** via Event Listener del DOM su ogni campo;
- Fattore geometrico `V₁/V₀`, fattore porzioni e fattore combinato sempre visibili;
- Lista ingredienti con grammature ricalcolate, note critiche e stima cottura.

Avvio locale:

```bash
cd aiuto-cuoco
npx serve .        # oppure: python -m http.server 8080
```

---

## Modulo 5 — Engine di Stima della Cottura (Termodinamica)

```js
function estimateBaking(baseMin, baseC, thickOrig, thickTarget) {
  const delta = thickTarget - thickOrig; // cm
  if (delta > 0.1)
    return { time: baseMin * (1 + 0.15 * delta),   temp: baseC - 10 * delta };   // massa più spessa
  if (delta < -0.1) {
    const m = -delta;
    return { time: Math.max(5, baseMin * (1 - 0.20 * m)), temp: baseC + 5 * m }; // massa più sottile
  }
  return { time: baseMin, temp: baseC };
}
```

- **Impasto più spesso:** `+15%` tempo per ogni cm extra, `−10 °C` al forno (evita esterno bruciato / interno crudo).
- **Impasto più sottile:** `−20%` tempo per ogni cm, `+5 °C` al forno.

---

## Deploy & Stack

| Voce | Valore |
|---|---|
| Nome prodotto | **ProportionKitchen** |
| Nome sito | **Aiuto Cuoco** |
| Stack | HTML5 + Tailwind CSS (CDN) + Vanilla JS · zero build |
| Hosting | **Vercel** (static, `vercel.json` con `cleanUrls`) |
| Repo | GitHub (branch `main`) |

```bash
git init -b main
git add .
git commit -m "feat: ProportionKitchen — Aiuto Cuoco (scalabilità non lineare ricette)"
git remote add origin https://github.com/Alftakeaway/aiuto-cuoco.git
git push -u origin main
vercel --prod
```

---

## Changelog

### v3 — Refactor multi-file (ordine & scalabilità)
- **Separazione HTML / CSS / JS:** `index.html` contiene solo markup; `css/styles.css` il design system; `js/data.js` i dati statici; `js/engine.js` il motore puro (parser, geometria, formule non lineari, fattori, conversioni, cottura, parser vocale); `js/app.js` UI/stato/eventi/salvataggio/tour.
- **Namespace condiviso `window.PK`** con script classici (niente moduli ES): compatibilità totale con `file://` per il QA headless e per l'apertura locale.
- **Testabilità:** `window.__pkTest` continua a esporre `parseVoiceCommand`, `scaleEggs`, `maxFactorFor`, `scaledAmount`, `parseIngredientLine`; il motore puro è richiamabile anche direttamente da `window.PK.*`.
- **QA invariato:** tutte le suite (30+12+18 unit/functional) passano senza regressioni dopo lo split.

### v1.1 — correzione sovrapposizioni & migliorie
- **Bug `<details>`:** la regola author `.slider-row { display:flex }` sovrascriveva la regola UA `details:not([open]) > * { display:none }`, mostrando il contenuto anche a pannello chiuso e sovrapponendolo al pulsante "Modalità Mani Sporche". Risolto con `details:not([open]) > *:not(summary) { display: none !important; }`.
- **Overflow orizzontale mobile (64px):** colonne grid/flex ancorate al min-content degli `<input>` numerici. Risolto con `min-width: 0` sugli input e griglie `minmax(0,1fr)` (`.pan-dims`).
- **Sovrapposizione nome ↔ valore nelle righe ingredienti:** il valore monospaziato con `whitespace-nowrap` (es. testo split uova lungo) schiacciava la colonna del nome a 5px. La riga usa ora `grid-template-columns: minmax(0,1fr) auto`; i valori lunghi (>22 caratteri) passano automaticamente a una riga dedicata full-width (`ing-value.is-long`).
- **Note critiche:** nome+valore sulla stessa riga, spiegazione come blocco sotto (`.crit-line`).
- **Persistenza locale** (`localStorage`, chiave `pk-state-v1`): ricetta, teglie, porzioni, cottura e blocchi sopravvivono al reload.
- **Accessibilità Hands-Free:** attributo `inert` su `header`/`main`/`footer` durante l'overlay + aggiornamento di `theme-color` (`#0B0F19` ↔ `#FAFAFA`).
- **Font adattivo Hands-Free:** testi lunghi (uova frazionate) scalano con `clamp()` (`hf-number.long`).
- **Mobile UX:** `inputmode="decimal"` sui campi numerici, `-webkit-tap-highlight-color` disattivato, safe-area insets su footer e overlay, `overflow-x: clip` di sicurezza.
- **QA automatico:** audit di layout headless (320–1440px, teglia rettangolare, blocchi, Hands-Free) senza overflow né sovrapposizioni non volute; 26 test unitari sul motore di calcolo.

### v2 — sei aree di miglioria
- **Tour di onboarding** (`tourOverlay`/`tourSpotlight`): 5 step guidati con spotlight sull'elemento attivo, navigazione Avanti/Indietro, pulsante "Salta", replay dal pulsante `?` nell'header e flag `pk-tour-done` in localStorage.
- **Dispensa flessibile** (pantry): ogni ingrediente può essere **bloccato 🔒** (quantità originale invariata) oppure **limitato 📦** con un massimo disponibile in qualsiasi unità (g, kg, ml, l, tazze…). Il motore **inverte le formule non lineari** per calcolare il fattore massimo ammesso (lievito `F^exp` → `ratio^(1/exp)`, spezie `1+ln F` → `e^(ratio−1)`, idratazione risolta numericamente) e limita globalmente `F` con avviso dedicato.
- **Comandi vocali** (Web Speech API): `parseVoiceCommand()` puro e testabile riconosce "avanti/prossimo", "indietro", "inforna", "chiudi", "porta le porzioni a otto" (anche numeri in lettere), "ripeti la quantità". Microfono e speaker nella modalità Mani Sporche, con speech synthesis per la lettura ad alta voce.
- **Database regole personalizzabili**: pannello "Regole intelligenti" con parametri modificabili (esponente e soglia lievitanti, riduzione idratazione, pesi uovo) e regole custom per ingrediente (keyword → categoria + esponente). Il pannello non viene ricostruito a ogni tasto per non perdere il focus.
- **Salvataggio / export / condivisione**: ricette salvate con nome (`pk-saved-v2`), export in `.txt` o `.json` via Blob, e **link di condivisione** `?d=` (base64url) che ripristina ricetta, teglie, porzioni, cottura, dispensa e regole su qualsiasi dispositivo.
- **Esempi e conversioni**: 5 ricette d'esempio (torta, pancake, ciambellone, frolla, risotto) caricate in un click; conversioni "senza bilancia" in tazze/cucchiai/cucchiaini per farina, zucchero, burro, cacao e altri ingredienti comuni.
- **Bug fix QA v2:** unità di misura convertite per i limiti dispensa (es. max in kg applicato a ingredienti in g), `parseIngredientLine` ora rimuove la preposizione dopo l'unità ("un pizzico di sale" → nome corretto), colonna singola del layout con `minmax(0,1fr)` per eliminare l'overflow mobile da min-content della select, form regole responsive.