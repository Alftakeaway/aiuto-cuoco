/* ============================================================================
   ProportionKitchen · Aiuto Cuoco — APP (UI, stato, eventi)
   DOM, stato, rendering, dispensa, regole, hands-free, voce, salvataggio, tour.
   Dipende da window.PK (data.js + engine.js). Espone window.__pkTest per QA.
   ============================================================================ */
(() => {
  'use strict';
  const PK = window.PK = window.PK || {};
  const { TOUR_STEPS, EXAMPLES } = PK;
  const {
    parseIngredientLine, volumeOfPan, effectiveThickness, scaleIngredient,
    scaledAmount, maxFactorFor, categoryOf, isEggIngredient, defaultRules,
    normalizeRules, estimateBaking, conversionSuffix, scaleEggs,
    parseVoiceCommand, fmtNum, fmtG
  } = PK;

  /* ---------- DOM REFS ---------- */
  const $ = id => document.getElementById(id);
  const recipeText = $('recipeText'), ingList = $('ingList'), notesBox = $('notesBox'), warnBox = $('warnBox');
  const factorBadge = $('factorBadge'), geoFactorLabel = $('geoFactorLabel'), geoDetail = $('geoDetail');
  const comboFactorLabel = $('comboFactorLabel'), comboDetail = $('comboDetail'), servFactorLabel = $('servFactorLabel'), ingCount = $('ingCount');
  const origVolLabel = $('origVolLabel'), tgtVolLabel = $('tgtVolLabel');
  const bakeTimeOut = $('bakeTimeOut'), bakeTempOut = $('bakeTempOut'), bakeNote = $('bakeNote');

  const state = {
    origShape: 'round', targetShape: 'round',
    pantry: [],          // { id, name, max (number|null), unit, lock }
    rules: defaultRules(),
    saved: [],           // { id, name, ts, data }
    steps: [], hfIndex: 0,
    voiceEnabled: false, speakEnabled: false
  };

  /* ---------- HELPERS ---------- */
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const readInputs = ids => { const o = {}; ids.forEach(id => (o[id] = $(id).value)); return o; };
  const num = id => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : null; };

  function getPanDims(pan) {
    const shape = state[pan + 'Shape'];
    if (shape === 'round') return { d: num(pan === 'orig' ? 'origD' : 'tgtD') || 0, h: num(pan === 'orig' ? 'origH' : 'tgtH') || 0 };
    return {
      l: num(pan === 'orig' ? 'origL' : 'tgtL') || 0,
      w: num(pan === 'orig' ? 'origW' : 'tgtW') || 0,
      h: num(pan === 'orig' ? 'origH2' : 'tgtH2') || 0
    };
  }

  /* ---------- RENDER: CORE ---------- */
  let lastResults = [], lastF = 1, lastFreq = 1;

  function recompute() {
    const origDims = getPanDims('orig'), tgtDims = getPanDims('target');
    const v0 = volumeOfPan(state.origShape, origDims);
    const v1 = volumeOfPan(state.targetShape, tgtDims);
    const Fgeo = v1 / v0;
    const s0 = num('servOrig') || 1, s1 = num('servTgt') || 1;
    const Fserv = s1 / s0;
    const Frequested = Fgeo * Fserv;

    // Vincoli della dispensa → F applicato
    const lines = recipeText.value.split('\n').map(l => l.trim()).filter(Boolean);
    const ingredients = lines.map(parseIngredientLine).filter(Boolean);

    let Fapplied = Frequested;
    const limits = [];
    for (const item of state.pantry) {
      const matches = ingredients.filter(ing => ing.name.toLowerCase().includes(item.name.toLowerCase()));
      if (!matches.length) continue;
      for (const ing of matches) {
        const fm = maxFactorFor(ing, item, state.rules);
        if (fm < Fapplied - 1e-9) { Fapplied = fm; limits.length = 0; }
        if (Math.abs(fm - Fapplied) < 1e-9) limits.push({ item, ing, fm });
      }
    }
    if (limits.length && Fapplied >= Frequested - 1e-9) limits.length = 0;

    // Scala con il fattore applicato
    const results = ingredients.map(ing => scaleIngredient(ing, Fapplied, state.rules, state.pantry));
    lastResults = results; lastF = Fapplied; lastFreq = Frequested;

    // Etichette volumi
    origVolLabel.textContent = `V₀ = ${state.origShape === 'round' ? `π·(${origDims.d / 2})²·${origDims.h || 5}` : `${origDims.l}·${origDims.w}·${origDims.h || 5}`} = ${fmtNum(v0, 1)} cm³`;
    tgtVolLabel.textContent = `V₁ = ${state.targetShape === 'round' ? `π·(${tgtDims.d / 2})²·${tgtDims.h || 5}` : `${tgtDims.l}·${tgtDims.w}·${tgtDims.h || 5}`} = ${fmtNum(v1, 1)} cm³`;

    factorBadge.textContent = `F = ${fmtNum(Fapplied)}×`;
    geoFactorLabel.textContent = `${fmtNum(Fgeo)}×`;
    geoDetail.textContent = `V₁/V₀ = ${fmtNum(v1, 0)}/${fmtNum(v0, 0)} cm³`;
    comboFactorLabel.textContent = `${fmtNum(Fapplied)}×`;
    comboDetail.textContent = Fapplied < Frequested - 1e-9
      ? `richiesto ${fmtNum(Frequested)}× · limitato dalla dispensa`
      : `richiesto ${fmtNum(Frequested)}× · porzioni × geo`;
    servFactorLabel.textContent = `${fmtNum(Fserv)}×`;

    $('ingrList').innerHTML = [...new Set(ingredients.map(i => i.name))].map(n => `<option value="${escapeHtml(n)}">`).join('');

    renderList(results);
    renderNotes(results, Fapplied);
    renderWarn(limits, Frequested, Fapplied);
    renderBaking(origDims, tgtDims);
    buildSteps(results, Fapplied);
    renderRulesDetected();
    persist();
  }

  function renderList(results) {
    ingCount.textContent = `${results.length} ingredienti`;
    ingList.innerHTML = results.map(r => {
      const display = r.eggText ? r.eggText : `${fmtG(r.scaled)} ${r.unit}`;
      const isLong = display.length > 22;
      const conv = r.eggText ? null : conversionSuffix(r, r.scaled, r.unit);
      const chips = [];
      if (r.locked) chips.push('<span class="chip bg-error/10 text-error ml-1">🔒 bloccato</span>');
      if (r.limited) chips.push(`<span class="chip bg-error/10 text-error ml-1">📦 max ${fmtG(r.scaled)} ${r.unit}</span>`);
      return `<div class="ing-row">
        <div class="ing-name">
          <span class="font-semibold text-[15px] capitalize">${escapeHtml(r.name)}</span>
          ${chips.join('')}
          ${r.note && !r.locked ? `<div class="text-[11px] text-[#6E6A63] mt-0.5">${escapeHtml(r.note)}</div>` : ''}
        </div>
        <div class="ing-value font-num font-bold text-primary text-lg ${isLong ? 'is-long' : ''}">
          ${escapeHtml(display)}
          ${conv ? `<div class="ing-alt">${escapeHtml(conv)}</div>` : ''}
        </div>
      </div>`;
    }).join('') || `<div class="text-sm text-[#6E6A63] py-4 text-center">Inserisci almeno un ingrediente.</div>`;
  }

  function renderWarn(limits, Frequested, Fapplied) {
    if (limits.length && Fapplied < Frequested - 1e-9) {
      const items = limits.map(l => `${l.ing.name} (hai ${fmtG(l.item.max)} ${l.item.unit})`).join(', ');
      warnBox.className = 'segment border-[#FBE3D8] bg-[#FFEFEB]';
      warnBox.innerHTML = `<div class="segment-title !text-error mb-1">⚠️ Dispensa limitata</div>
        <p class="text-[13px] leading-relaxed">
          Attenzione: hai solo <b>${items}</b>. Il fattore di scala è limitato a
          <b class="font-num">${fmtNum(Fapplied)}×</b> invece dei <b class="font-num">${fmtNum(Frequested)}×</b> richiesti.
          Aumenta la disponibilità o riduci le porzioni/teglia per ottenere l'intera dose.
        </p>`;
    } else {
      warnBox.className = 'hidden';
      warnBox.innerHTML = '';
    }
  }

  function renderNotes(results, F) {
    const critical = results.filter(r => !r.locked && !r.limited && r.note && !isEggIngredient(r));
    const eggs = results.filter(r => !r.locked && isEggIngredient(r));
    let html = '';
    if (eggs.length) {
      html += `<div class="segment border-[#FBE3D8] bg-[#FFF7F2]">
        <div class="segment-title mb-1">🥚 Split uova — precisione industriale</div>
        ${eggs.map(e => `<div class="crit-line">
          <div class="crit-head"><span class="capitalize font-semibold">${escapeHtml(e.name)}</span><span class="font-num font-bold text-primary">${escapeHtml(e.eggText)}</span></div>
          <span class="crit-note">${escapeHtml(e.note)}</span>
        </div>`).join('')}
      </div>`;
    }
    if (critical.length) {
      html += `<div class="segment border-[#FBE3D8] bg-[#FFF7F2]">
        <div class="segment-title mb-1">⚠️ Coefficienti di non-scalabilità applicati</div>
        ${critical.map(c => `<div class="crit-line">
          <div class="crit-head"><span class="capitalize font-semibold">${escapeHtml(c.name)}</span><span class="font-num font-bold text-primary">${escapeHtml(fmtG(c.scaled) + ' ' + c.unit)}</span></div>
          <span class="crit-note">${escapeHtml(c.note)}</span>
        </div>`).join('')}
      </div>`;
    }
    notesBox.innerHTML = html;
  }

  function renderBaking(origDims, tgtDims) {
    const baseMin = num('bakeTime') || 40, baseC = num('bakeTemp') || 180;
    const t0 = effectiveThickness(state.origShape, origDims);
    const t1 = effectiveThickness(state.targetShape, tgtDims);
    const r = estimateBaking(baseMin, baseC, t0, t1);
    bakeTimeOut.textContent = `${fmtNum(Math.round(r.time))} min`;
    bakeTempOut.textContent = `${fmtNum(Math.round(r.temp))} °C`;
    bakeNote.textContent = r.note + (r.delta !== 0 ? ` Spessore: ${fmtNum(t0, 1)} cm → ${fmtNum(t1, 1)} cm.` : ` Spessore: ${fmtNum(t0, 1)} cm.`);
  }

  /* ---------- DISPENSA (PANTRY) ---------- */
  let pantryId = 0;
  function addPantry(name, amount, unit) {
    name = (name || '').trim();
    if (!name) return;
    const numeric = amount !== '' && amount != null && isFinite(parseFloat(amount)) ? parseFloat(amount) : null;
    const finalUnit = unit || 'auto';
    if (numeric == null) {
      if (state.pantry.some(p => p.lock && p.name.toLowerCase() === name.toLowerCase())) return;
      state.pantry.push({ id: ++pantryId, name, max: null, unit: finalUnit, lock: true });
    } else {
      if (numeric <= 0) return;
      state.pantry.push({ id: ++pantryId, name, max: numeric, unit: finalUnit, lock: false });
    }
    $('pantryName').value = ''; $('pantryAmount').value = ''; $('pantryUnit').value = '';
    renderPantry();
    recompute();
  }
  function removePantry(id) {
    state.pantry = state.pantry.filter(p => p.id !== id);
    renderPantry();
    recompute();
  }
  function renderPantry() {
    $('pantryList').innerHTML = state.pantry.map(p =>
      `<span class="chip bg-error/10 text-error">${p.lock ? '🔒' : '📦'} ${escapeHtml(p.name)}${p.lock ? '' : `: max ${fmtG(p.max)} ${p.unit}`}
        <button type="button" data-id="${p.id}" class="font-bold hover:opacity-70" aria-label="Rimuovi ${escapeHtml(p.name)}">✕</button></span>`
    ).join('') || '<span class="text-[11px] text-[#6E6A63]">Nessun vincolo. Aggiungi ingredienti per bloccare o limitare le quantità.</span>';
    $('pantryList').querySelectorAll('button').forEach(b => b.addEventListener('click', () => removePantry(+b.dataset.id)));
  }

  /* ---------- REGOLE UI ---------- */
  function renderRulesDetected() {
    const r = state.rules;
    const detected = lastResults.map(ing => {
      const cat = ing.locked || ing.limited ? null : categoryOf(ing.name, r);
      return { name: ing.name, cat: cat ? cat.category : 'lineare' };
    });
    const detRows = [...new Map(detected.map(d => [d.name, d])).values()]
      .map(d => `<div class="flex justify-between text-[12px] border-b border-dashed border-[#FBE3D8] py-1">
        <span class="capitalize">${escapeHtml(d.name)}</span>
        <span class="chip ${d.cat === 'lineare' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}">${d.cat}</span></div>`).join('');
    $('rulesDetected').innerHTML = detRows || '<div class="text-[11px] text-[#6E6A63]">Aggiungi ingredienti per vedere le categorie.</div>';
  }

  function renderRulesCustom() {
    const customRows = (state.rules.custom || []).map((c, i) =>
      `<div class="flex items-center gap-2 text-[12px]">
        <span class="chip bg-secondary/10 text-secondary flex-1">${escapeHtml(c.keyword)} → ${c.category}${c.exp != null ? ` · exp ${c.exp}` : ''}</span>
        <button type="button" data-ci="${i}" class="font-bold text-error hover:opacity-70" aria-label="Rimuovi regola">✕</button>
      </div>`).join('');
    $('rulesCustom').innerHTML = customRows || '<div class="text-[11px] text-[#6E6A63]">Nessuna regola personalizzata.</div>';
    document.querySelectorAll('#rulesCustom [data-ci]').forEach(b => b.addEventListener('click', () => {
      state.rules.custom.splice(+b.dataset.ci, 1);
      recompute();
      renderRulesUI();
    }));
  }

  function renderRulesUI() {
    const r = state.rules;
    $('rulesBox').innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        <div><label class="label" for="ruleExp">Lievito / bicarbonato: esponente (F^exp)</label>
          <input id="ruleExp" class="input font-num" type="number" step="0.05" min="0.1" max="1" value="${r.leavening.exp}" /></div>
        <div><label class="label" for="ruleThr">…oltre F=</label>
          <input id="ruleThr" class="input font-num" type="number" step="0.5" min="1" max="10" value="${r.leavening.threshold}" /></div>
        <div><label class="label" for="ruleRed">Idratazione: riduzione % oltre F=</label>
          <input id="ruleRed" class="input font-num" type="number" step="0.1" min="0" max="10" value="${(r.hydration.reduction * 100).toFixed(1)}" /></div>
        <div><label class="label" for="ruleThrH">…oltre F=</label>
          <input id="ruleThrH" class="input font-num" type="number" step="0.5" min="1" max="10" value="${r.hydration.threshold}" /></div>
        <div><label class="label" for="ruleWhole">Uovo intero (g)</label>
          <input id="ruleWhole" class="input font-num" type="number" step="1" min="1" value="${r.egg.whole}" /></div>
        <div><label class="label" for="ruleWhite">Albume (g)</label>
          <input id="ruleWhite" class="input font-num" type="number" step="1" min="1" value="${r.egg.white}" /></div>
      </div>
      <div>
        <div class="text-[12px] font-bold mb-1">Categoria rilevata nei tuoi ingredienti</div>
        <div id="rulesDetected"></div>
      </div>
      <div>
        <div class="text-[12px] font-bold mb-1">Regole personalizzate</div>
        <div id="rulesCustom"></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 mt-2 items-end">
          <div><label class="label" for="ruleKeyword">Ingrediente</label><input id="ruleKeyword" class="input font-num" type="text" placeholder="es. lievito di birra" /></div>
          <div><label class="label" for="ruleCat">Categoria</label>
            <select id="ruleCat" class="input font-num"><option value="leavening">Lievitante</option><option value="spice">Spezia</option><option value="hydration">Idratazione</option></select></div>
          <div><label class="label" for="ruleExpC">Exp (solo liev.)</label><input id="ruleExpC" class="input font-num" type="number" step="0.05" min="0.1" max="1.5" placeholder="0.75" /></div>
          <button id="ruleAdd" class="btn-ghost px-3" type="button">＋ Aggiungi</button>
        </div>
      </div>`;

    $('ruleExp').addEventListener('input', e => { state.rules.leavening.exp = parseFloat(e.target.value) || 0.75; recompute(); });
    $('ruleThr').addEventListener('input', e => { state.rules.leavening.threshold = parseFloat(e.target.value) || 2; recompute(); });
    $('ruleRed').addEventListener('input', e => { state.rules.hydration.reduction = (parseFloat(e.target.value) || 0) / 100; recompute(); });
    $('ruleThrH').addEventListener('input', e => { state.rules.hydration.threshold = parseFloat(e.target.value) || 3; recompute(); });
    $('ruleWhole').addEventListener('input', e => { state.rules.egg.whole = parseFloat(e.target.value) || 50; recompute(); });
    $('ruleWhite').addEventListener('input', e => { state.rules.egg.white = parseFloat(e.target.value) || 30; recompute(); });
    $('ruleAdd').addEventListener('click', () => {
      const kw = $('ruleKeyword').value.trim();
      if (!kw) return;
      const exp = $('ruleExpC').value === '' ? null : parseFloat($('ruleExpC').value);
      state.rules.custom.push({ keyword: kw, category: $('ruleCat').value, exp });
      $('ruleKeyword').value = ''; $('ruleExpC').value = '';
      recompute();
      renderRulesUI();
    });
    renderRulesDetected();
    renderRulesCustom();
  }

  /* ---------- HANDS-FREE STEPS ---------- */
  function buildSteps(results, F) {
    const steps = results.map(r => ({
      label: r.eggText ? 'Uova' : 'Ingrediente',
      name: r.name,
      value: r.eggText ? r.eggText.replace(/^(\d+)/, '$1') : `${fmtG(r.scaled)} ${r.unit}`,
      note: r.locked ? '🔒 quantità originale (dispensa limitata)' : (r.note || '')
    }));
    steps.push({
      label: 'Cottura', name: 'Inforna', value: `${bakeTimeOut.textContent} @ ${bakeTempOut.textContent}`, note: bakeNote.textContent
    });
    state.steps = steps;
    state.hfIndex = Math.min(state.hfIndex, steps.length - 1);
  }

  function renderHf() {
    const s = state.steps[state.hfIndex];
    if (!s) return;
    $('hfCounter').textContent = `${state.hfIndex + 1} / ${state.steps.length}`;
    $('hfStepLabel').textContent = s.label;
    const valEl = $('hfValue');
    valEl.textContent = s.value;
    valEl.classList.toggle('long', s.value.length > 14);
    $('hfName').textContent = s.name;
    $('hfNote').textContent = s.note || '';
    $('hfProgress').style.width = `${((state.hfIndex + 1) / state.steps.length) * 100}%`;
    if (state.speakEnabled) speak(`${s.name}. ${s.value}. ${s.note || ''}`.replace(/\s+/g, ' ').trim());
  }

  function openHands() {
    if (!state.steps.length) recompute();
    state.hfIndex = 0;
    $('handsOverlay').classList.remove('hidden');
    $('handsOverlay').classList.add('flex');
    document.body.style.overflow = 'hidden';
    document.querySelectorAll('header, main, footer').forEach(el => el.setAttribute('inert', ''));
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0B0F19');
    renderHf();
  }
  function closeHands() {
    $('handsOverlay').classList.add('hidden');
    $('handsOverlay').classList.remove('flex');
    document.body.style.overflow = '';
    document.querySelectorAll('header, main, footer').forEach(el => el.removeAttribute('inert'));
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#FAFAFA');
    stopMic();
  }
  function hfStep(dir) {
    state.hfIndex = Math.max(0, Math.min(state.steps.length - 1, state.hfIndex + dir));
    renderHf();
  }

  /* ---------- VOCE (WEB SPEECH API) ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;

  function handleVoiceCommand(text) {
    const cmd = parseVoiceCommand(text);
    switch (cmd.action) {
      case 'next': hfStep(1); break;
      case 'prev': hfStep(-1); break;
      case 'bake': state.hfIndex = state.steps.length - 1; renderHf(); break;
      case 'close': closeHands(); break;
      case 'servings': $('servTgt').value = cmd.value; recompute(); speak(`Porzioni impostate a ${cmd.value}.`); break;
      case 'speak': {
        const s = state.steps[state.hfIndex];
        if (s) speak(`${s.name}. ${s.value}. ${s.note || ''}`.replace(/\s+/g, ' ').trim());
        break;
      }
      default: speak('Comando non riconosciuto. Dì avanti, indietro, cottura, o imposta le porzioni.'); break;
    }
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'it-IT'; u.rate = 1; u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const it = voices.find(v => /^it/i.test(v.lang));
    if (it) u.voice = it;
    window.speechSynthesis.speak(u);
  }

  function toggleMic() {
    if (!SR) { toast('La sintesi/riconoscimento vocale non è supportato da questo browser.'); return; }
    state.voiceEnabled = !state.voiceEnabled;
    const mic = $('hfMic');
    mic.classList.toggle('mic-listening', state.voiceEnabled);
    mic.setAttribute('aria-pressed', state.voiceEnabled ? 'true' : 'false');
    $('hfVoiceStatus').classList.toggle('hidden', !state.voiceEnabled);
    if (state.voiceEnabled) { startRecognizer(); } else { stopRecognizer(); }
  }
  function startRecognizer() {
    if (!SR) return;
    try {
      recognizer = new SR();
      recognizer.lang = 'it-IT';
      recognizer.continuous = true;
      recognizer.interimResults = false;
      recognizer.onresult = e => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          handleVoiceCommand(t);
        }
      };
      recognizer.onerror = () => { state.voiceEnabled = false; $('hfMic').classList.remove('mic-listening'); $('hfVoiceStatus').classList.add('hidden'); };
      recognizer.start();
    } catch (e) { /* già attivo o non permesso */ }
  }
  function stopRecognizer() { if (recognizer) { try { recognizer.stop(); } catch (e) {} } recognizer = null; }
  function stopMic() { state.voiceEnabled = false; stopRecognizer(); $('hfMic').classList.remove('mic-listening'); $('hfMic').setAttribute('aria-pressed', 'false'); $('hfVoiceStatus').classList.add('hidden'); }
  function toggleSpeaker() {
    state.speakEnabled = !state.speakEnabled;
    $('hfSpeaker').setAttribute('aria-pressed', state.speakEnabled ? 'true' : 'false');
    $('hfSpeaker').classList.toggle('!text-primary', state.speakEnabled);
    toast(state.speakEnabled ? 'Lettura vocale attiva.' : 'Lettura vocale disattivata.');
  }

  /* ---------- SHAPE TOGGLE ---------- */
  function syncShapeUI() {
    document.querySelectorAll('.shape-toggle button').forEach(btn => {
      const active = state[btn.dataset.pan + 'Shape'] === btn.dataset.shape;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.pan-dims').forEach(el => {
      el.classList.toggle('hidden', state[el.dataset.pan + 'Shape'] !== el.dataset.shape);
    });
  }
  function bindShapeToggles() {
    document.querySelectorAll('.shape-toggle').forEach(grp => {
      grp.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          state[btn.dataset.pan + 'Shape'] = btn.dataset.shape;
          syncShapeUI();
          recompute();
        });
      });
    });
  }

  /* ---------- ESEMPI DI RICETTE ---------- */
  function applyExample(id) {
    const ex = EXAMPLES[id];
    if (!ex) return;
    recipeText.value = ex.recipe;
    state.origShape = ex.shape.orig; state.targetShape = ex.shape.target;
    const setD = (prefix, d) => {
      const o = { d: '', h: '', l: '', w: '' };
      Object.entries(d).forEach(([k, v]) => { o[k] = String(v); });
      const shape = prefix === 'orig' ? ex.shape.orig : ex.shape.target;
      ['d', 'h', 'l', 'w'].forEach(k => {
        const id = k === 'h' ? (shape === 'rect' ? prefix + 'H2' : prefix + 'H') : prefix + k.toUpperCase();
        const el = $(id);
        if (el) el.value = o[k];
      });
    };
    setD('orig', ex.dims.orig); setD('tgt', ex.dims.tgt);
    $('servOrig').value = ex.serv.o; $('servTgt').value = ex.serv.t;
    $('bakeTime').value = ex.bake.time; $('bakeTemp').value = ex.bake.temp;
    state.pantry = [];
    renderPantry();
    syncShapeUI();
    recompute();
    toast(`Esempio caricato: ${$('exampleSelect').selectedOptions[0].textContent.trim()}`);
  }

  /* ---------- SALVATAGGIO / ESPORTAZIONE / CONDIVISIONE ---------- */
  const SAVED_KEY = 'pk-saved-v2';
  const STORE_KEY = 'pk-state-v2';
  function collectState(includeSaved) {
    const s = {
      r: recipeText.value,
      o: readInputs(['origD', 'origH', 'origL', 'origW', 'origH2']),
      t: readInputs(['tgtD', 'tgtH', 'tgtL', 'tgtW', 'tgtH2']),
      s: readInputs(['servOrig', 'servTgt']),
      b: readInputs(['bakeTime', 'bakeTemp']),
      p: state.pantry,
      sh: { orig: state.origShape, target: state.targetShape },
      ru: state.rules
    };
    if (includeSaved) s.sv = state.saved;
    return s;
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(collectState(false)));
      localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved));
    } catch (e) { /* storage non disponibile */ }
  }
  function restore() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
    if (!d) return false;
    if (typeof d.r === 'string') recipeText.value = d.r;
    const apply = m => { if (!m) return; Object.keys(m).forEach(id => { const el = $(id); if (el) el.value = m[id]; }); };
    apply(d.o); apply(d.t); apply(d.s); apply(d.b);
    if (Array.isArray(d.p)) state.pantry = d.p;
    if (d.sh) { if (['round', 'rect'].includes(d.sh.orig)) state.origShape = d.sh.orig; if (['round', 'rect'].includes(d.sh.target)) state.targetShape = d.sh.target; }
    if (d.ru) state.rules = normalizeRules(d.ru);
    try { const sv = JSON.parse(localStorage.getItem(SAVED_KEY)); if (Array.isArray(sv)) state.saved = sv; } catch (e) {}
    return true;
  }

  function toast(msg) {
    $('toastMsg').textContent = msg;
    $('toast').classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => $('toast').classList.remove('show'), 2600);
  }

  function saveRecipe() {
    $('saveRow').classList.remove('hidden');
    $('saveName').focus();
  }
  function confirmSave() {
    const name = $('saveName').value.trim() || `Ricetta ${state.saved.length + 1}`;
    state.saved.unshift({ id: Date.now(), name, ts: Date.now(), data: collectState(false) });
    state.saved = state.saved.slice(0, 20);
    $('saveName').value = '';
    $('saveRow').classList.add('hidden');
    persist();
    renderSaved();
    toast(`💾 "${name}" salvata.`);
  }
  function renderSaved() {
    $('savedCount').textContent = state.saved.length;
    $('savedList').innerHTML = state.saved.length
      ? state.saved.map((s, i) => `<div class="flex items-center gap-2 text-[13px]">
          <span class="flex-1 min-w-0 truncate font-semibold">${escapeHtml(s.name)}</span>
          <span class="text-[11px] text-[#6E6A63] font-num">${new Date(s.ts).toLocaleDateString('it-IT')}</span>
          <button type="button" data-load="${i}" class="btn-ghost !py-1 !px-2 text-xs" title="Carica">↻</button>
          <button type="button" data-del="${i}" class="btn-ghost !py-1 !px-2 text-xs text-error" title="Elimina">🗑</button>
        </div>`).join('')
      : '<div class="text-[12px] text-[#6E6A63]">Nessuna ricetta salvata. Premi 💾 Salva per conservarla.</div>';
    $('savedList').querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => loadSaved(+b.dataset.load)));
    $('savedList').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { state.saved.splice(+b.dataset.del, 1); persist(); renderSaved(); }));
  }
  function loadSaved(i) {
    const s = state.saved[i];
    if (!s) return;
    applyShareData(s.data);
    toast(`Caricata "${s.name}".`);
  }

  function exportRecipe() {
    const name = $('saveName').value.trim() || 'ricetta-adattata';
    const lines = [
      '=== ' + 'ProportionKitchen · Aiuto Cuoco — Ricetta adattata ===',
      `Fattore applicato: ${fmtNum(lastF)}×` + (lastF < lastFreq - 1e-9 ? ` (richiesto ${fmtNum(lastFreq)}×, limitato dalla dispensa)` : ` (richiesto ${fmtNum(lastFreq)}×)`),
      '',
      'INGREDIENTI:',
      ...lastResults.map(r => `- ${r.name}: ${r.eggText ? r.eggText : fmtG(r.scaled) + ' ' + r.unit}${r.locked ? ' (bloccato)' : ''}`),
      '',
      'COTTURA:',
      `${bakeTimeOut.textContent} a ${bakeTempOut.textContent}`,
      bakeNote.textContent,
      '',
      'Generato da https://aiuto-cuoco.vercel.app'
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, name.replace(/[^\wàèéìòù -]/gi, '').trim() || 'ricetta', 'txt');
    toast('📤 Ricetta esportata in formato .txt');
  }
  function exportJson() {
    const name = $('saveName').value.trim() || 'ricetta-adattata';
    const payload = JSON.stringify({ meta: { app: 'ProportionKitchen', version: 2, exported: new Date().toISOString() }, ...collectState(false) }, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, name.replace(/[^\wàèéìòù -]/gi, '').trim() || 'ricetta', 'json');
    toast('📤 Ricetta esportata in formato .json');
  }
  function downloadBlob(blob, name, ext) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function shareLink() {
    const data = collectState(false);
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = location.origin + location.pathname + '?d=' + encoded;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('🔗 Link copiato negli appunti!')).catch(() => { prompt('Copia il link:', url); });
  }
  function readShare() {
    const m = location.search.match(/[?&]d=([^&]+)/);
    if (!m) return;
    try {
      const json = decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))));
      applyShareData(JSON.parse(json));
      history.replaceState({}, '', location.pathname);
    } catch (e) { toast('Link non valido.'); }
  }
  function applyShareData(data) {
    if (!data) return;
    if (typeof data.r === 'string') recipeText.value = data.r;
    const apply = m => { if (!m) return; Object.keys(m).forEach(id => { const el = $(id); if (el) el.value = m[id]; }); };
    apply(data.o); apply(data.t); apply(data.s); apply(data.b);
    if (Array.isArray(data.p)) state.pantry = data.p;
    if (data.sh) { if (['round', 'rect'].includes(data.sh.orig)) state.origShape = data.sh.orig; if (['round', 'rect'].includes(data.sh.target)) state.targetShape = data.sh.target; }
    if (data.ru) state.rules = normalizeRules(data.ru);
    renderPantry();
    syncShapeUI();
    recompute();
  }

  /* ---------- TOUR (ONBOARDING) ---------- */
  function startTour() {
    tourIndex = 0;
    $('tourOverlay').classList.remove('hidden');
    $('tourOverlay').classList.add('flex');
    document.body.style.overflow = 'hidden';
    renderTourStep();
  }
  function endTour(savePref) {
    $('tourOverlay').classList.add('hidden');
    $('tourOverlay').classList.remove('flex');
    $('tourSpotlight').classList.add('hidden');
    document.body.style.overflow = '';
    if (savePref && $('tourDontShow').checked) { try { localStorage.setItem('pk-tour-done', '1'); } catch (e) {} }
  }
  let tourIndex = 0;
  function renderTourStep() {
    const s = TOUR_STEPS[tourIndex];
    $('tourStep').textContent = `${tourIndex + 1} / ${TOUR_STEPS.length}`;
    $('tourTitle').textContent = s.title;
    $('tourBody').textContent = s.body;
    $('tourPrev').disabled = tourIndex === 0;
    $('tourNext').textContent = tourIndex === TOUR_STEPS.length - 1 ? 'Inizia!' : 'Avanti →';
    const target = document.querySelector(s.sel);
    const r = target ? target.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const spot = $('tourSpotlight');
    spot.classList.remove('hidden');
    spot.style.left = (r.left - 6) + 'px';
    spot.style.top = (r.top - 6) + 'px';
    spot.style.width = (r.width + 12) + 'px';
    spot.style.height = (r.height + 12) + 'px';
  }

  /* ---------- EVENT LISTENERS (real-time) ---------- */
  ['recipeText', 'origD', 'origH', 'origL', 'origW', 'origH2', 'tgtD', 'tgtH', 'tgtL', 'tgtW', 'tgtH2',
   'servOrig', 'servTgt', 'bakeTime', 'bakeTemp'].forEach(id => $(id).addEventListener('input', recompute));

  $('exampleSelect').addEventListener('change', e => applyExample(e.target.value));

  $('pantryAdd').addEventListener('click', () => addPantry($('pantryName').value, $('pantryAmount').value, $('pantryUnit').value));
  $('pantryName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPantry($('pantryName').value, $('pantryAmount').value, $('pantryUnit').value); } });
  $('pantryAmount').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPantry($('pantryName').value, $('pantryAmount').value, $('pantryUnit').value); } });

  $('saveBtn').addEventListener('click', saveRecipe);
  $('saveConfirm').addEventListener('click', confirmSave);
  $('saveCancel').addEventListener('click', () => $('saveRow').classList.add('hidden'));
  $('saveName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmSave(); } });
  $('exportBtn').addEventListener('click', () => {
    const t = $('exportBtn').textContent.trim();
    if (t.includes('.json')) { exportJson(); } else { exportRecipe(); }
    $('exportBtn').textContent = t.includes('.json') ? '📤 Esporta' : '📤 Esporta .json';
    clearTimeout($('exportBtn')._t); $('exportBtn')._t = setTimeout(() => { $('exportBtn').textContent = '📤 Esporta'; }, 2200);
  });
  $('shareBtn').addEventListener('click', shareLink);

  $('handsBtn').addEventListener('click', openHands);
  $('handsBtn2').addEventListener('click', openHands);
  $('hfClose').addEventListener('click', closeHands);
  $('hfPrev').addEventListener('click', () => hfStep(-1));
  $('hfNext').addEventListener('click', () => hfStep(1));
  $('hfMic').addEventListener('click', toggleMic);
  $('hfSpeaker').addEventListener('click', toggleSpeaker);

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('handsOverlay').classList.contains('hidden')) closeHands();
      else if (!$('tourOverlay').classList.contains('hidden')) endTour(false);
    }
    if (!$('handsOverlay').classList.contains('hidden')) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); hfStep(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); hfStep(-1); }
    }
  });

  $('handsOverlay').addEventListener('click', e => { if (!e.target.closest('button')) hfStep(1); });

  $('tourBtn').addEventListener('click', startTour);
  $('tourOverlay').addEventListener('click', e => { if (!e.target.closest('.tour-card')) endTour(false); });
  $('tourSkip').addEventListener('click', () => endTour(true));
  $('tourNext').addEventListener('click', () => { if (tourIndex === TOUR_STEPS.length - 1) endTour(true); else { tourIndex++; renderTourStep(); } });
  $('tourPrev').addEventListener('click', () => { if (tourIndex > 0) { tourIndex--; renderTourStep(); } });
  window.addEventListener('resize', () => { if (!$('tourOverlay').classList.contains('hidden')) renderTourStep(); });
  window.addEventListener('scroll', () => { if (!$('tourOverlay').classList.contains('hidden')) renderTourStep(); }, { passive: true });

  bindShapeToggles();
  document.querySelectorAll('input[type="number"]').forEach(i => i.setAttribute('inputmode', 'decimal'));

  /* ---------- INIT ---------- */
  readShare();
  const restored = restore();
  syncShapeUI();
  renderPantry();
  renderRulesUI();
  renderSaved();
  recompute();
  if (!restored) {
    let done = false;
    try { done = !!localStorage.getItem('pk-tour-done'); } catch (e) {}
    if (!done) setTimeout(startTour, 600);
  }

  // Esposto per QA/debug (non usato dall'app)
  window.__pkTest = {
    parseVoiceCommand,
    scaleEggs: PK.scaleEggs,
    maxFactorFor,
    scaledAmount,
    parseIngredientLine
  };
})();