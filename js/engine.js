/* ============================================================================
   ProportionKitchen · Aiuto Cuoco — ENGINE (motore puro di calcolo)
   Parser ingredienti, geometria, formule non lineari, fattori, conversioni,
   cottura e parser vocale. Nessun accesso al DOM: tutto testabile in isolamento.
   Dipende da window.PK (data.js). Espone le funzioni su window.PK.
   ============================================================================ */
(() => {
  'use strict';
  const PK = window.PK = window.PK || {};
  const { FRAC_UNI, UNIT_MAP, H_DEFAULT, CUP_GRAMS, SPOON_GRAMS, TSP_GRAMS, ML_CUP, ML_TBSP, ML_TSP, WORD_NUM } = PK;

  /* ---------- REGEX ENGINE / NLU ---------- */
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  const UNIT_RE = new RegExp('^(?:' + Object.keys(UNIT_MAP).sort((a, b) => b.length - a.length).map(escapeRe).join('|') + ')\\b');

  /**
   * parseIngredientLine — estrae {amount, unit, name} da una riga di ricetta.
   * Gestisce frazioni (1/2, 2 1/2), decimali (1,5), unicode (¾), parole (un,
   * mezzo), quantità senza unità (3 uova) e la preposizione "di".
   */
  function parseIngredientLine(rawLine) {
    let line = rawLine.trim().replace(/,/g, '.').replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, ch => FRAC_UNI[ch]);
    if (!line) return null;
    let amount = 1, rest = line, m;
    if ((m = rest.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/))) { amount = parseInt(m[1]) + parseInt(m[2]) / parseInt(m[3]); rest = rest.slice(m[0].length); }
    else if ((m = rest.match(/^(\d+)\s*\/\s*(\d+)/))) { amount = parseInt(m[1]) / parseInt(m[2]); rest = rest.slice(m[0].length); }
    else if ((m = rest.match(/^(\d+(?:\.\d+)?)/))) { amount = parseFloat(m[1]); rest = rest.slice(m[0].length); }
    else if ((m = rest.match(/^(un|uno|una|mezzo|mezza|due|tre)\b/i))) {
      amount = /^mezz/i.test(m[1]) ? 0.5 : (m[1].toLowerCase() === 'due' ? 2 : (m[1].toLowerCase() === 'tre' ? 3 : 1));
      rest = rest.slice(m[0].length);
    }
    rest = rest.replace(/^[\s,'’]+/, '').replace(/^(di|d'|de|a|da)\s+/i, '').trim();
    let unit = null;
    if ((m = rest.match(UNIT_RE))) { unit = UNIT_MAP[m[0].toLowerCase()]; rest = rest.slice(m[0].length).replace(/^[\s,'’]+/, '').trim(); }
    else unit = 'pezzi';
    rest = rest.replace(/^[\s,'’]+/, '').replace(/^(di|d'|de|a|da)\s+/i, '').replace(/\s+/g, ' ').trim();
    return { amount, unit, name: rest || unit };
  }

  /* ---------- GEOMETRIA DEI CONTENITORI ---------- */
  function volumeOfPan(shape, dims) {
    const h = (dims.h && dims.h > 0) ? dims.h : H_DEFAULT;
    if (shape === 'round') { const r = dims.d / 2; return Math.PI * r * r * h; }
    return dims.l * dims.w * h;
  }
  function areaOfPan(shape, dims) {
    if (shape === 'round') { const r = dims.d / 2; return Math.PI * r * r; }
    return dims.l * dims.w;
  }
  function effectiveThickness(shape, dims) {
    if (dims.h && dims.h > 0) return dims.h;
    return volumeOfPan(shape, dims) / areaOfPan(shape, dims);
  }

  /* ---------- REGOLE PERSONALIZZABILI (LA MIA DISPENSA INTELLIGENTE) ---------- */
  function defaultRules() {
    return {
      leavening: { keywords: ['lievito', 'bicarbonato', 'soda', 'tartaro', 'ammoniaca', 'cream'], exp: 0.75, threshold: 2 },
      spice: { keywords: ['peperoncino', 'noce moscata', 'pepe', 'cayenna', 'zenzero', 'curcuma', 'chiodi', 'cardamomo', 'pimento', 'paprika'] },
      hydration: { keywords: ['acqua', 'latte', 'brodo', 'panna', 'vino', 'birra', 'siero'], reduction: 0.005, threshold: 3 },
      egg: { whole: 50, white: 30, yolk: 20 },
      custom: [] // { keyword, category: 'leavening'|'spice'|'hydration', exp? }
    };
  }

  function normalizeRules(r) {
    const def = defaultRules();
    const out = { ...def, ...r };
    out.leavening = { ...def.leavening, ...(r.leavening || {}) };
    out.spice = { ...def.spice, ...(r.spice || {}) };
    out.hydration = { ...def.hydration, ...(r.hydration || {}) };
    out.egg = { ...def.egg, ...(r.egg || {}) };
    out.custom = Array.isArray(r.custom) ? r.custom : [];
    return out;
  }

  function matchKeywords(name, keywords) {
    const n = name.toLowerCase();
    return (keywords || []).some(k => n.includes(k.toLowerCase()));
  }

  /** Assegna la categoria a un ingrediente, consultando prima le regole custom. */
  function categoryOf(name, rules) {
    const n = name.toLowerCase();
    for (const c of rules.custom || []) {
      if (n.includes(c.keyword.toLowerCase())) return { category: c.category, custom: true, exp: c.exp };
    }
    if (matchKeywords(n, rules.leavening.keywords)) return { category: 'leavening' };
    if (matchKeywords(n, rules.spice.keywords)) return { category: 'spice' };
    if (matchKeywords(n, rules.hydration.keywords)) return { category: 'hydration' };
    return null;
  }

  function isEggIngredient(ing) {
    return ing.unit === 'uova' || ing.unit === 'albume' || ing.unit === 'tuorlo' || /uova?|albume|tuorlo/i.test(ing.name);
  }

  /* ---------- FORMULE NON LINEARI — parametrizzate dalle regole ---------- */
  function scaleLeavening(orig, F, r) {
    if (F <= r.threshold) return { q: orig * F, note: `lineare (F≤${r.threshold})` };
    return { q: orig * Math.pow(F, r.exp), note: `attenuata F^${r.exp} (F=${F.toFixed(2)}) → ${(Math.pow(F, r.exp) / F * 100).toFixed(0)}% del valore lineare` };
  }
  function scaleSpice(orig, F) {
    return { q: orig * (1 + Math.log(F)), note: `curva logaritmica 1+ln(F) → ${((1 + Math.log(F)) / F * 100).toFixed(0)}% del valore lineare` };
  }
  function scaleHydration(orig, F, r) {
    let q = orig * F;
    if (F > r.threshold) {
      const reduction = Math.pow(1 - r.reduction, F - r.threshold);
      q = q * reduction;
      return { q, note: `idratazione ridotta del ${((1 - reduction) * 100).toFixed(1)}% (F=${F.toFixed(2)})` };
    }
    return { q, note: `lineare (F≤${r.threshold})` };
  }

  /* EGG FRACTIONING — split a precisione industriale (pesi regolabili) */
  function scaleEggs(linearCount, eggType, egg) {
    const whole = Math.floor(linearCount);
    const frac = linearCount - whole;
    const gr = egg[eggType] || egg.whole;
    const label = eggType === 'uova' ? 'uova' : eggType;
    if (frac <= 0.2) return { value: whole, text: `${whole} ${label}`, note: 'frazione ≤ 0.2 → arrotondata per difetto' };
    if (frac >= 0.8) return { value: whole + 1, text: `${whole + 1} ${label}`, note: 'frazione ≥ 0.8 → arrotondata per eccesso (+1)' };
    const grams = Math.round(frac * gr);
    const unitTxt = eggType === 'uova' ? 'uovo sbattuto' : eggType;
    return { value: linearCount, text: `${whole} ${eggType === 'uova' ? 'uova intere' : eggType} + ${grams}g di ${unitTxt}`, note: `split industriale: frazione 0.${Math.round(frac * 10)} → ${grams}g` };
  }

  /* ---------- MOTORE PRINCIPALE DI RIDIMENSIONAMENTO ---------- */
  function scaleIngredient(ing, F, rules, pantry) {
    const constraint = pantry.find(p => ing.name.toLowerCase().includes(p.name.toLowerCase()));
    if (constraint) {
      if (constraint.lock) {
        return { ...ing, scaled: ing.amount, factor: 1, locked: true, note: '🔒 Dispensa limitata: quantità originale invariata' };
      }
      // limitato dal massimo disponibile (converte la disponibilità nell'unità dell'ingrediente)
      const capBase = baseAmount(constraint.max, constraint.unit);
      const perIngUnit = baseAmount(1, ing.unit);
      let capInIng = capBase / (perIngUnit || 1);
      if (isEggIngredient(ing) && (constraint.unit === 'g' || constraint.unit === 'kg')) {
        const eggWeight = rules.egg[ing.unit] || rules.egg.whole;
        capInIng = capBase / eggWeight;
      }
      const scaledQ = scaledAmount(ing, F, rules);
      const maxQ = Math.min(scaledQ, capInIng);
      const limited = maxQ < scaledQ - 1e-9;
      return { ...ing, scaled: maxQ, factor: maxQ / ing.amount, limited, note: limited ? `📦 dispensa: hai max ${fmtG(capInIng)} ${ing.unit} — quantità adattata` : null };
    }

    if (isEggIngredient(ing)) {
      const r = scaleEggs(ing.amount * F, ing.unit, rules.egg);
      return { ...ing, scaled: r.value, eggText: r.text, factor: F, note: r.note };
    }

    const cat = categoryOf(ing.name, rules);
    if (cat && cat.category === 'leavening') {
      const r = scaleLeavening(ing.amount, F, rules.leavening);
      return { ...ing, scaled: r.q, factor: r.q / ing.amount, note: `Agente lievitante — ${r.note}${cat.custom ? ' (regola personalizzata)' : ''}` };
    }
    if (cat && cat.category === 'spice') {
      const r = scaleSpice(ing.amount, F);
      return { ...ing, scaled: r.q, factor: r.q / ing.amount, note: `Spezia forte — ${r.note}${cat.custom ? ' (regola personalizzata)' : ''}` };
    }
    if (cat && cat.category === 'hydration') {
      const r = scaleHydration(ing.amount, F, rules.hydration);
      return { ...ing, scaled: r.q, factor: r.q / ing.amount, note: `Liquido di idratazione — ${r.note}${cat.custom ? ' (regola personalizzata)' : ''}` };
    }
    return { ...ing, scaled: ing.amount * F, factor: F, note: null };
  }

  /** quantità scalata di un ingrediente per un dato F (senza vincoli dispensa) */
  function scaledAmount(ing, F, rules) {
    if (isEggIngredient(ing)) return ing.amount * F;
    const cat = categoryOf(ing.name, rules);
    if (cat && cat.category === 'leavening') return scaleLeavening(ing.amount, F, rules.leavening).q;
    if (cat && cat.category === 'spice') return scaleSpice(ing.amount, F).q;
    if (cat && cat.category === 'hydration') return scaleHydration(ing.amount, F, rules.hydration).q;
    return ing.amount * F;
  }

  /* ---------- FATTORE MASSIMO AMMESSO DALLA DISPENSA (inversione formule) ---------- */
  function maxFactorFor(ing, item, rules) {
    if (item.lock) return 1;
    if (item.max == null) return Infinity;
    if (isEggIngredient(ing)) {
      if (item.unit === 'g' || item.unit === 'kg') {
        const eggWeight = rules.egg[ing.unit] || rules.egg.whole;
        const gramsNeeded = ing.amount * eggWeight;
        return baseAmount(item.max, item.unit) / gramsNeeded;
      }
      return item.max / ing.amount; // conteggio uova (o auto)
    }
    const baseOrig = baseAmount(ing.amount, ing.unit);
    const baseMax = baseAmount(item.max, item.unit);
    if (!baseOrig) return Infinity;
    const ratio = baseMax / baseOrig;
    const cat = categoryOf(ing.name, rules);
    if (cat && cat.category === 'leavening') {
      const r = rules.leavening;
      const thrQ = Math.pow(r.threshold, r.exp); // quantità raggiunta con F=threshold
      return ratio <= thrQ ? Math.min(ratio, r.threshold) : Math.pow(ratio, 1 / r.exp);
    }
    if (cat && cat.category === 'spice') return Math.exp(ratio - 1); // inverti 1+ln(F)
    if (cat && cat.category === 'hydration') {
      const r = rules.hydration;
      let lo = 1, hi = 1000;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const val = baseOrig * mid * Math.pow(1 - r.reduction, Math.max(0, mid - r.threshold));
        if (val < baseMax) lo = mid; else hi = mid;
      }
      return lo;
    }
    return ratio; // lineare
  }

  /* ---------- CONVERSIONI IN TAZZE/CUCCHIAI (misure senza bilancia) ---------- */
  /** baseAmount — converte una quantità nella sua unità di base (grammi, ml o conteggio). */
  function baseAmount(value, unit) {
    switch (unit) {
      case 'kg': return value * 1000;
      case 'l': return value * 1000;
      case 'cl': return value * 10;
      case 'dl': return value * 100;
      case 'tazza': return value * ML_CUP;
      case 'cucchiaio': return value * ML_TBSP;
      case 'cucchiaino': return value * ML_TSP;
      case 'g': case 'ml': case 'uova': case '': case 'auto': case 'pezzi': default: return value;
    }
  }

  function conversionSuffix(ing, qty, unit) {
    const n = ing.name.toLowerCase();
    const find = table => Object.keys(table).find(k => n.includes(k));
    if (unit === 'g' || unit === 'kg') {
      const grams = unit === 'kg' ? qty * 1000 : qty;
      if (grams < 3) return null;
      const cup = find(CUP_GRAMS);
      if (cup) {
        const cups = grams / CUP_GRAMS[cup];
        if (cups >= 1) return `≈ ${fmtNum(cups)} tazze`;
        const tbsp = grams / SPOON_GRAMS[cup];
        return tbsp >= 1 ? `≈ ${fmtNum(tbsp)} cucchiai` : `≈ ${fmtNum(grams / (TSP_GRAMS[cup] || 5))} cucchiaini`;
      }
      const tbsp = find(SPOON_GRAMS);
      if (tbsp) { const t = grams / SPOON_GRAMS[tbsp]; return t >= 1 ? `≈ ${fmtNum(t)} cucchiai` : `≈ ${fmtNum(grams / (TSP_GRAMS[tbsp] || 5))} cucchiaini`; }
      return null;
    }
    if (unit === 'ml' || unit === 'l') {
      const ml = unit === 'l' ? qty * 1000 : qty;
      if (ml < 5) return null;
      const cups = ml / ML_CUP;
      if (cups >= 1) return `≈ ${fmtNum(cups)} tazze`;
      const tbsp = ml / ML_TBSP;
      if (tbsp >= 1) return `≈ ${fmtNum(tbsp)} cucchiai`;
      return `≈ ${fmtNum(ml / ML_TSP)} cucchiaini`;
    }
    return null;
  }

  /* ---------- THERMODYNAMIC BAKING ENGINE ---------- */
  function estimateBaking(baseMin, baseC, thickOrig, thickTarget) {
    const delta = thickTarget - thickOrig;
    if (delta > 0.1) {
      const time = baseMin * (1 + 0.15 * delta);
      const temp = baseC - 10 * delta;
      return { time, temp, delta, note: `Impasto più spesso (+${delta.toFixed(1)} cm): tempo +${(0.15 * delta * 100).toFixed(0)}% e forno −${(10 * delta).toFixed(0)}°C per non bruciare l'esterno lasciando l'interno crudo.` };
    }
    if (delta < -0.1) {
      const m = -delta;
      const time = Math.max(5, baseMin * (1 - 0.20 * m));
      const temp = baseC + 5 * m;
      return { time, temp, delta, note: `Impasto più sottile (−${m.toFixed(1)} cm): tempo −${(0.20 * m * 100).toFixed(0)}% e forno +${(5 * m).toFixed(0)}°C.` };
    }
    return { time: baseMin, temp: baseC, delta: 0, note: 'Spessore invariato: mantieni tempo e temperatura originali.' };
  }

  /* ---------- FORMATTAZIONE ---------- */
  const fmtNum = (n, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)).toLocaleString('it-IT', { maximumFractionDigits: d }) : '—');
  const fmtG = n => (Math.round(n * 10) / 10).toLocaleString('it-IT', { maximumFractionDigits: 1 });

  /* ---------- PARSER VOCALE (funzione pura, testabile) ---------- */
  function parseVoiceCommand(text) {
    const t = (' ' + text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ') + ' ').replace(/\s+/g, ' ');
    const has = re => re.test(t);
    if (has(/(chiudi|esci|stop|basta|annulla|torna alla ricetta|indietro tutto)/)) return { action: 'close' };
    if (has(/(cottura|inforna|inforno|cuoci|forno|ultimo passo)/)) return { action: 'bake' };
    if (has(/(avanti|prossimo|successivo|next|dopo|via|il prossimo passo)/)) return { action: 'next' };
    if (has(/(indietro|precedente|prima|previous|back)/)) return { action: 'prev' };
    let m = t.match(/(?:porta|metti|imposta|aumenta|alza|incrementa|riduci|abbassa|diminuisci).{0,20}?porzioni?\s+(?:a\s+|a\s*)(\d+|[a-zàèéìòù]+)/);
    if (m) {
      const n = WORD_NUM[m[1]] ?? parseInt(m[1], 10);
      if (n) {
        if (has(/(riduci|abbassa|diminuisci)/)) return { action: 'servings', value: n };
        return { action: 'servings', value: n };
      }
    }
    m = t.match(/(\d+|[a-zàèéìòù]+)\s+porzioni?/);
    if (m) {
      const n = WORD_NUM[m[1]] ?? parseInt(m[1], 10);
      if (n) return { action: 'servings', value: n };
    }
    if (has(/(ripeti|dimmi|quale|cosa|mostra|leggi)/)) return { action: 'speak' };
    return { action: 'unknown' };
  }

  /* ---------- EXPORT (window.PK) ---------- */
  PK.escapeRe = escapeRe;
  PK.parseIngredientLine = parseIngredientLine;
  PK.volumeOfPan = volumeOfPan;
  PK.areaOfPan = areaOfPan;
  PK.effectiveThickness = effectiveThickness;
  PK.defaultRules = defaultRules;
  PK.normalizeRules = normalizeRules;
  PK.matchKeywords = matchKeywords;
  PK.categoryOf = categoryOf;
  PK.isEggIngredient = isEggIngredient;
  PK.scaleLeavening = scaleLeavening;
  PK.scaleSpice = scaleSpice;
  PK.scaleHydration = scaleHydration;
  PK.scaleEggs = scaleEggs;
  PK.scaleIngredient = scaleIngredient;
  PK.scaledAmount = scaledAmount;
  PK.maxFactorFor = maxFactorFor;
  PK.baseAmount = baseAmount;
  PK.conversionSuffix = conversionSuffix;
  PK.estimateBaking = estimateBaking;
  PK.fmtNum = fmtNum;
  PK.fmtG = fmtG;
  PK.parseVoiceCommand = parseVoiceCommand;
})();