
(function(){
  function ready(fn){ if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  ready(function(){
    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));

    // Theme + brand -----------------------------------------------------------
    const params = new URLSearchParams(location.search);
    const savedTheme = localStorage.getItem("er_theme");
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const startTheme = savedTheme || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", startTheme);
    const brand = params.get("brand");
    if (brand) document.documentElement.style.setProperty("--brand", brand);
    $("#toggleDark")?.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("er_theme", next);
    });

    // Views -------------------------------------------------------------------
    const tableWrap = $("#tableWrap");
    const cardsWrap = $("#cardsWrap");
    $("#viewTable")?.addEventListener("click", () => setView("table"));
    $("#viewCards")?.addEventListener("click", () => setView("cards"));
    function setView(v){
      if (!tableWrap || !cardsWrap) return;
      const btnTable = $("#viewTable"), btnCards = $("#viewCards");
      if (v === "cards"){ cardsWrap.hidden = false; tableWrap.hidden = true; btnCards?.setAttribute("aria-pressed","true"); btnTable?.setAttribute("aria-pressed","false"); }
      else { cardsWrap.hidden = true; tableWrap.hidden = false; btnTable?.setAttribute("aria-pressed","true"); btnCards?.setAttribute("aria-pressed","false"); }
    }

    // Controls ----------------------------------------------------------------
    const tbody = $("#eventsTable tbody");
    const fromInput = $("#fromDate");
    const toInput   = $("#toDate");
    const symInput  = $("#symbols");
    const typesSel  = $("#types");
    const preset14  = $("#preset14");
    const clearBtn  = $("#clearFilters");
    const clearTypes = $("#clearTypes");
    const exportBtn = $("#exportCsv");
    const summaryCounts = $("#summaryCounts");
    const nextEventEl = $("#nextEvent");

    function getSelectedTypes(){ return typesSel ? Array.from(typesSel.selectedOptions).map(o => o.value) : []; }
    function normalizeSymbolsInput(){ return (symInput?.value || "").toUpperCase().split(/[,\s]+/).filter(Boolean); }
    function withinRange(dateStr, from, to){ const d = new Date(dateStr+"T00:00:00-04:00"); return (!from || d >= from) && (!to || d <= to); }
    function matchesSymbols(symbol, syms){ return !syms.length || syms.includes((symbol||"").toUpperCase()); }
    function matchesType(type, selected){ return !selected.length || selected.includes(type); }

    // Date helpers -------------------------------------------------------------
    function parseET(dateStr, time_et){ return new Date((dateStr||"1970-01-01")+"T"+(time_et||"00:00")+":00-04:00"); }
    function fmtDateYMD(dateStr, timeStr){
      const d = parseET(dateStr, timeStr);
      const yyyy = d.getFullYear(), mm = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
      const hh = String(d.getHours()).padStart(2,'0'), mi = String(d.getMinutes()).padStart(2,'0');
      return `${yyyy}/${mm}/${dd}` + (timeStr ? ` ${hh}:${mi}` : "");
    }

    // Multi-sort ---------------------------------------------------------------
    let sortRules = []; // [{key, dir}]
    function compareVals(a,b){
      if (a === b) return 0;
      if (a === undefined || a === null) return -1;
      if (b === undefined || b === null) return 1;
      const na = parseFloat(a), nb = parseFloat(b);
      const bothNum = !Number.isNaN(na) && !Number.isNaN(nb);
      if (bothNum) return na < nb ? -1 : (na > nb ? 1 : 0);
      return String(a).localeCompare(String(b));
    }
    function rowKey(row, key){ return key === 'date' ? parseET(row.date, row.time_et).getTime() : row[key]; }
    function multiCompare(a,b){
      for (const r of sortRules){
        const c = compareVals(rowKey(a,r.key), rowKey(b,r.key));
        if (c !== 0) return c * r.dir;
      }
      return 0;
    }

    // Data & filtering ---------------------------------------------------------
    function filteredRows(){
      const from = fromInput?.value ? new Date(fromInput.value+"T00:00:00-04:00") : null;
      const to   = toInput?.value ? new Date(toInput.value+"T00:00:00-04:00") : null;
      const syms = normalizeSymbolsInput();
      const types= getSelectedTypes();
      const src  = Array.isArray(window.EVENTS) ? window.EVENTS : [];
      return src.filter(e => withinRange(e.date, from, to)).filter(e => matchesSymbols(e.symbol, syms)).filter(e => matchesType(e.type, types)).sort(multiCompare);
    }

    // Summary bar --------------------------------------------------------------
    function updateSummary(rows){
      if (!summaryCounts || !nextEventEl) return;
      const counts = rows.reduce((acc, r) => { acc[r.type] = (acc[r.type]||0)+1; return acc; }, {});
      summaryCounts.innerHTML = Object.entries(counts).map(([k,v]) => `<span class="chip" data-type="${k}">${k}: ${v}</span>`).join("") || "<span class='chip'>No events</span>";
      // Next event countdown
      const upcoming = rows.map(r => ({...r, dt: parseET(r.date, r.time_et)})).filter(r => r.dt.getTime() >= Date.now()).sort((a,b)=> a.dt - b.dt)[0];
      if (!upcoming){ nextEventEl.textContent = "Next event: —"; return; }
      function fmtCountdown(ms){ const s=Math.max(0,Math.floor(ms/1000)); const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60); return (d?d+'d ':'')+(h?h+'h ':'')+(m?m+'m':''); }
      function render(){ const left = upcoming.dt - Date.now(); nextEventEl.textContent = `Next: ${fmtDateYMD(upcoming.date, upcoming.time_et)} — ${upcoming.symbol} • ${upcoming.name} (${fmtCountdown(left)})`; }
      render(); if (window.__nextTimer) clearInterval(window.__nextTimer); window.__nextTimer = setInterval(render, 60*1000);
    }

    // Renderers ----------------------------------------------------------------
    function icsForEvent(evt){
      const dt = parseET(evt.date, evt.time_et), dtEnd = new Date(dt.getTime()+60*60*1000);
      function toICS(d){ const pad=n=>String(n).padStart(2,'0'); return d.getUTCFullYear()+pad(d.getUTCMonth()+1)+pad(d.getUTCDate())+'T'+pad(d.getUTCHours())+pad(d.getUTCMinutes())+pad(d.getUTCSeconds())+'Z'; }
      const uid = `${evt.symbol}-${evt.date}-${(evt.name||'').replace(/\W+/g,'-')}@events-radar`;
      const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Events Radar//EN","BEGIN:VEVENT",`UID:${uid}`,`DTSTAMP:${toICS(new Date())}`,`DTSTART:${toICS(dt)}`,`DTEND:${toICS(dtEnd)}`,`SUMMARY:${evt.symbol} — ${evt.name}`,`DESCRIPTION:${evt.type} | ${evt.domain||""} | ${evt.stage||""}`,`URL:${evt.source||''}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
      return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
    }
    function renderTable(rows){
      if (!tbody) return;
      tbody.innerHTML = "";
      rows.forEach(evt => {
        const tr = document.createElement("tr"); tr.className = "rowGroup";
        tr.innerHTML = `
          <td>${fmtDateYMD(evt.date, evt.time_et)}</td>
          <td>${evt.symbol||""}</td>
          <td>${evt.type||""}</td>
          <td>${evt.domain||""}</td>
          <td>${evt.stage||""}</td>
          <td>${evt.name||""}</td>
          <td>${evt.why||""}</td>
          <td><a download="${evt.symbol}-${evt.date}.ics" href="${icsForEvent(evt)}">ICS</a></td>
          <td>${evt.source ? `<a class="source" href="${evt.source}" target="_blank">link</a>` : ""}</td>`;
        const details = document.createElement("tr"); details.className = "details";
        details.innerHTML = `<td colspan="9"><strong>Notes:</strong> ${evt.notes || "—"}</td>`;
        tr.addEventListener("click", () => tr.classList.toggle("open"));
        tbody.appendChild(tr); tbody.appendChild(details);
      });
    }
    function renderCards(rows){
      const wrap = $("#cardsWrap"); if (!wrap) return;
      const groups = rows.reduce((acc, r) => { (acc[r.symbol] = acc[r.symbol] || []).push(r); return acc; }, {});
      const syms = Object.keys(groups).sort();
      wrap.innerHTML = "";
      syms.forEach(sym => {
        const list = groups[sym].slice().sort((a,b)=> multiCompare(a,b));
        const card = document.createElement("div"); card.className = "card";
        const head = document.createElement("div"); head.className = "head";
        head.innerHTML = `<div class="sym">${sym}</div>`;
        const copyBtn = document.createElement("button"); copyBtn.className = "btn small ghost copy"; copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click",(e)=>{
          e.stopPropagation();
          const lines = list.map(e => `• ${fmtDateYMD(e.date, e.time_et)} — ${e.symbol}: ${e.name} [${e.type}/${e.domain||""}/${e.stage||""}] ${e.why||""}`.trim()).join("\\n");
          if (navigator.clipboard) navigator.clipboard.writeText(lines);
          copyBtn.textContent = "Copied!"; setTimeout(()=> copyBtn.textContent = "Copy", 1200);
        });
        head.appendChild(copyBtn);
        const ul = document.createElement("ul");
        list.forEach(e => {
          const li = document.createElement("li");
          li.innerHTML = `<time>${fmtDateYMD(e.date, e.time_et)}</time> — <strong>${e.name}</strong><br><span>${e.type} · ${e.domain||""} · ${e.stage||""}</span><br><em>${e.why||""}</em>`;
          ul.appendChild(li);
        });
        card.appendChild(head); card.appendChild(ul);
        wrap.appendChild(card);
      });
    }

    function applyFiltersAndRender(){
      const rows = filteredRows();
      renderTable(rows); renderCards(rows); updateSummary(rows);
    }

    // Header sorting: click = single sort; Shift+click = multi-sort add/toggle
    $$("#eventsTable thead th").forEach(th => {
      th.addEventListener("click", (ev) => {
        const key = th.getAttribute("data-key"); if (!key) return;
        const idx = sortRules.findIndex(r => r.key === key);
        if (ev.shiftKey){
          if (idx >= 0){ sortRules[idx].dir *= -1; } else { sortRules.push({key, dir:1}); }
        } else {
          if (idx === 0){ sortRules[0].dir *= -1; } else { sortRules = [{key, dir:1}]; }
        }
        applyFiltersAndRender();
      });
    });

    // Controls wiring
    fromInput?.addEventListener("input", applyFiltersAndRender);
    toInput?.addEventListener("input", applyFiltersAndRender);
    symInput?.addEventListener("input", applyFiltersAndRender);
    typesSel?.addEventListener("input", applyFiltersAndRender);
    clearBtn?.addEventListener("click", () => {
      if (fromInput) fromInput.value = "";
      if (toInput) toInput.value = "";
      if (symInput) symInput.value = "";
      if (typesSel) Array.from(typesSel.options).forEach(o=>o.selected=false);
      sortRules = [];
      applyFiltersAndRender();
    });
    clearTypes?.addEventListener("click", () => {
      if (typesSel) Array.from(typesSel.options).forEach(o=>o.selected=false);
      applyFiltersAndRender();
    });
    preset14?.addEventListener("click", () => {
      const today = new Date(); const to = new Date(today.getTime()+13*24*60*60*1000);
      if (fromInput) fromInput.valueAsDate = today;
      if (toInput) toInput.valueAsDate = to;
      applyFiltersAndRender();
    });

    // Clickable summary chips -> filter by type, toggle off on second click
    summaryCounts?.addEventListener("click", (e) => {
      const chip = e.target.closest('.chip'); if (!chip || !typesSel) return;
      const typ = chip.getAttribute('data-type'); if (!typ) return;
      const selected = Array.from(typesSel.selectedOptions).map(o=>o.value);
      const isOnlyThis = selected.length===1 && selected[0]===typ;
      Array.from(typesSel.options).forEach(o => o.selected = false);
      if (!isOnlyThis){ Array.from(typesSel.options).forEach(o => { if (o.value === typ) o.selected = true; }); }
      applyFiltersAndRender();
    });

    // Initial render when data is ready
    const ready = setInterval(()=>{
      if (Array.isArray(window.EVENTS)){
        clearInterval(ready);
        applyFiltersAndRender();
        setView("table");
      }
    }, 50);
  });
})();