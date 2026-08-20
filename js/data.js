/* ============================================================================
   ProportionKitchen · Aiuto Cuoco — DATA (dati statici)
   Unità, conversioni, esempi, tour e numeri vocali.
   Esposto su window.PK. Caricato PRIMA di engine.js e app.js.
   ============================================================================ */
'use strict';
window.PK = window.PK || {};

/* ---------- FRAZIONI UNICODE ---------- */
window.PK.FRAC_UNI = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

/* ---------- UNITÀ DI MISURA (normalizzazione) ---------- */
window.PK.UNIT_MAP = {
  'g': 'g', 'gr': 'g', 'grammo': 'g', 'grammi': 'g', 'gramm': 'g',
  'kg': 'kg', 'chilo': 'kg', 'chili': 'kg', 'chilogrammo': 'kg', 'chilogrammi': 'kg',
  'ml': 'ml', 'millilitro': 'ml', 'millilitri': 'ml', 'cl': 'cl', 'centilitri': 'cl', 'dl': 'dl', 'decilitri': 'dl',
  'l': 'l', 'litro': 'l', 'litri': 'l',
  'tazza': 'tazza', 'tazze': 'tazza', 'tazzina': 'tazzina', 'tazzine': 'tazzina',
  'cucchiaino': 'cucchiaino', 'cucchiaini': 'cucchiaino', 'cc': 'cucchiaino', 'cucch.': 'cucchiaio',
  'cucchiaio': 'cucchiaio', 'cucchiai': 'cucchiaio',
  'pizzico': 'pizzico', 'pizzichi': 'pizzico',
  'uovo': 'uova', 'uova': 'uova', 'uove': 'uova',
  'albume': 'albume', 'albumi': 'albume', 'tuorlo': 'tuorlo', 'tuorli': 'tuorlo',
  'spicchio': 'spicchio', 'spicchi': 'spicchio',
  'bustina': 'bustina', 'bustine': 'bustina', 'sacchetto': 'bustina', 'sacchetti': 'bustina',
  'scatola': 'scatola', 'scatole': 'scatola', 'foglia': 'foglia', 'foglie': 'foglia',
  'rametto': 'rametto', 'rametti': 'rametto', 'manciata': 'manciata', 'manciate': 'manciata',
  'noce': 'noce', 'noci': 'noce', 'pezzo': 'pezzo', 'pezzi': 'pezzo', 'fetta': 'fetta', 'fette': 'fetta'
};

/* ---------- GEOMETRIA ---------- */
window.PK.H_DEFAULT = 5;

/* ---------- CONVERSIONI TAZZE/CUCCHIAI (misure senza bilancia) ---------- */
window.PK.CUP_GRAMS = { 'farina': 120, 'zucchero': 200, 'zucchero di canna': 200, 'burro': 220, 'cacao': 100, 'mandorle': 90, 'farina di mais': 140, 'riso': 190, 'fiocchi': 90, 'yogurt': 240, 'ricotta': 240, 'olio': 210 };
window.PK.SPOON_GRAMS = { 'farina': 8, 'zucchero': 12, 'zucchero di canna': 12, 'cacao': 6, 'burro': 14, 'miele': 21, 'olio': 13.5, 'sale': 15, 'farina di mais': 9 };
window.PK.TSP_GRAMS = { 'zucchero': 5, 'sale': 5, 'lievito': 4, 'bicarbonato': 4, 'cacao': 3 };
window.PK.ML_CUP = 240;
window.PK.ML_TBSP = 15;
window.PK.ML_TSP = 5;

/* ---------- NUMERI VOCALI ---------- */
window.PK.WORD_NUM = { zero: 0, un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12 };

/* ---------- TOUR (ONBOARDING) ---------- */
window.PK.TOUR_STEPS = [
  { sel: '[data-tour="recipe"]', title: '1. Incolla la tua ricetta', body: 'Incolla o scrivi gli ingredienti, uno per riga. Funziona con frazioni (1/2), decimali (1,5 kg) e persino "un pizzico di". Scegli anche una ricetta d\'esempio dal menu qui sopra.' },
  { sel: '[data-tour="pan-orig"]', title: '2. Imposta la teglia', body: 'Scegli forma e dimensioni della teglia di partenza (a sinistra) e di quella di arrivo (al centro). Il fattore geometrico V₁/V₀ viene calcolato all\'istante.' },
  { sel: '[data-tour="pantry"]', title: '3. Porzioni e dispensa', body: 'Regola le porzioni oppure dichiara cosa hai in dispensa: blocca un ingrediente o imposta una quantità massima. Il fattore di scala si adatterà da solo.' },
  { sel: '[data-tour="output"]', title: '4. Leggi il risultato', body: 'Qui trovi le quantità ricalcolate, le note sui coefficienti non lineari e la stima di cottura. Salva, esporta o condividi con un link.' },
  { sel: '[data-tour="hands"]', title: '5. Modalità Mani Sporche', body: 'Tocco l\'area centrale o usa i comandi vocali ("avanti", "cottura", "imposta le porzioni a 8") per seguire la preparazione senza toccare lo schermo.' }
];

/* ---------- ESEMPI DI RICETTE ---------- */
window.PK.EXAMPLES = {
  torta: {
    recipe: '250g di farina 00\n150g di zucchero\n3 uova\n120g di burro\n100ml di latte\n1 bustina di lievito chimico\n1/2 limone (scorza)\n1 pizzico di sale',
    shape: { orig: 'round', target: 'round' },
    dims: { orig: { d: 22, h: 5 }, tgt: { d: 26, h: 5 } },
    serv: { o: 6, t: 8 }, bake: { time: 45, temp: 180 }
  },
  pancake: {
    recipe: '200g di farina 00\n2 uova\n300ml di latte\n30g di zucchero\n1 cucchiaino di lievito chimico\n1 pizzico di sale\n20g di burro',
    shape: { orig: 'round', target: 'rect' },
    dims: { orig: { d: 24, h: 2 }, tgt: { l: 24, w: 18, h: 2 } },
    serv: { o: 4, t: 6 }, bake: { time: 6, temp: 190 }
  },
  ciambellone: {
    recipe: '350g di farina 00\n200g di zucchero\n3 uova\n150ml di olio di semi\n150ml di latte\n1 bustina di lievito chimico\n1 limone (scorza)\n1 pizzico di sale',
    shape: { orig: 'round', target: 'round' },
    dims: { orig: { d: 24, h: 6 }, tgt: { d: 28, h: 6 } },
    serv: { o: 8, t: 10 }, bake: { time: 50, temp: 180 }
  },
  frolla: {
    recipe: '300g di farina 00\n150g di burro\n100g di zucchero a velo\n2 tuorli\n1 uovo\n1 pizzico di sale\n1/2 bacca di vaniglia',
    shape: { orig: 'rect', target: 'rect' },
    dims: { orig: { l: 28, w: 20, h: 1 }, tgt: { l: 32, w: 24, h: 1 } },
    serv: { o: 6, t: 8 }, bake: { time: 20, temp: 180 }
  },
  risotto: {
    recipe: '320g di riso carnaroli\n1 cipolla\n100ml di vino bianco\n1l di brodo vegetale\n60g di burro\n80g di parmigiano\n1 pizzico di zafferano\nsale q.b.',
    shape: { orig: 'rect', target: 'rect' },
    dims: { orig: { l: 20, w: 20, h: 5 }, tgt: { l: 20, w: 20, h: 5 } },
    serv: { o: 4, t: 8 }, bake: { time: 18, temp: 0 }
  }
};