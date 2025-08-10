(function(){
  function ready(fn){ if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  ready(function(){
    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));

    // Analytics wrapper
    const track = (name, params={}) => { try { if (window.gtag) window.gtag('event', name, params); } catch(e){} };

    // Views -------------------------------------------------------------------
    // CTA UTM already baked into href in HTML; add click tracking
    document.getElementById('ctaPaid')?.addEventListener('click', () => track('cta_click_paid_signals', {position:'topbar'}));

    const params = new URLSearchParams(location.search);
    const savedTheme = localStorage.getItem("er_theme");
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const startTheme = savedTheme || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", startTheme);
    $("#toggleDark")?.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("er_theme", next);
    });

    // Views -------------------------------------------------------------------
    const tableWrap = $("#tableWrap");
    const cardsWrap = $("#cardsWrap");
    const calWrap   = $("#calendarWrap");
    const btnTable = $("#viewTable");
    const btnCards = $("#viewCards");
    const btnCal   = $("#viewCalendar");

    function setView(v){
      track('view_' + v);
      const map = {table:tableWrap, cards:cardsWrap, calendar:calWrap};
      for (const k of Object.keys(map)){
        if (!map[k]) continue;
        map[k].hidden = (k !== v);
        const btn = k==='table'?btnTable:(k==='cards'?btnCards:btnCal);
        btn?.setAttribute("aria-pressed", k===v ? "true":"false");
      }
    }
    btnTable?.addEventListener("click", () => setView("table"));
    btnCards?.addEventListener("click", () => setView("cards"));
    btnCal?.addEventListener("click", () => setView("calendar"));

    // Controls ----------------------------------------------------------------
    const tbody = $("#eventsTable tbody");
    const fromInput = $("#fromDate");
    const toInput   = $("#toDate");
    const symInput  = $("#symbols");
    const typesSel  = $("#types");
    const preset14  = $("#preset14");
    const clearBtn  = $("#clearFilters");
    const clearTypes= $("#clearTypes");
    const exportBtn = $("#exportCsv");
    const summaryCounts = $("#summaryCounts");
    const nextEventEl = $("#nextEvent");

    function getSelectedTypes(){ return typesSel ? Array.from(typesSel.selectedOptions).map(o => o.value) : []; }
    function normalizeSymbolsInput(){ 
      const raw = (symInput?.value || "").toUpperCase().split(/[,\s]+/).filter(Boolean);
      return raw;
    }
    function withinRange(dateStr, from, to){ const d = new Date(dateStr+"T00:00:00-04:00"); return (!from || d >= from) && (!to || d <= to); }
    function matchesSymbols(symbol, syms){ if (!syms.length) return true; return syms.includes((symbol||"").toUpperCase()); }
    function matchesType(type, selected){ return !selected.length || selected.includes(type); }

    function parseET(dateStr, time_et){ return new Date((dateStr||"1970-01-01")+"T"+(time_et||"00:00")+":00-04:00"); }
    function fmtDateYMD(dateStr, timeStr){
      const d = parseET(dateStr, timeStr);
      const yyyy = d.getFullYear(), mm = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
      const hh = String(d.getHours()).padStart(2,'0'), mi = String(d.getMinutes()).padStart(2,'0');
      return `${yyyy}/${mm}/${dd}` + (timeStr ? ` ${hh}:${mi}` : "");
    }

    let sortRules = [];
    function compareVals(a,b){
      if (a === b) return 0;
      if (a == null) return -1;
      if (b == null) return 1;
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

    function filteredRows(){
      const from = fromInput?.value ? new Date(fromInput.value+"T00:00:00-04:00") : null;
      const to   = toInput?.value ? new Date(toInput.value+"T00:00:00-04:00") : null;
      const syms = normalizeSymbolsInput();
      const types= getSelectedTypes();
      const src  = Array.isArray(window.EVENTS) ? window.EVENTS : [];
      return src.filter(e => withinRange(e.date, from, to))
                .filter(e => matchesSymbols(e.symbol, syms))
                .filter(e => matchesType(e.type, types))
                .sort(multiCompare);
    }

    function updateSummary(rows){
      if (!summaryCounts || !nextEventEl) return;
      const counts = rows.reduce((acc, r) => { acc[r.type] = (acc[r.type]||0)+1; return acc; }, {});
      summaryCounts.innerHTML = Object.entries(counts).map(([k,v]) => `<span class="chip" data-type="${k}">${k}: ${v}</span>`).join("") || "<span class='chip'>No events</span>";
      const upcoming = rows.map(r => ({...r, dt: parseET(r.date, r.time_et)})).filter(r => r.dt.getTime() >= Date.now()).sort((a,b)=> a.dt - b.dt)[0];
      if (!upcoming){ nextEventEl.textContent = "Next event: —"; return; }
      function fmtCountdown(ms){ const s=Math.max(0,Math.floor(ms/1000)); const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60); return (d?d+'d ':'')+(h?h+'h ':'')+(m?m+'m':''); }
      function render(){ const left = upcoming.dt - Date.now(); nextEventEl.textContent = `Next: ${fmtDateYMD(upcoming.date, upcoming.time_et)} — ${(upcoming.symbol||'—')} • ${upcoming.name} (${fmtCountdown(left)})`; }
      render(); if (window.__nextTimer) clearInterval(window.__nextTimer); window.__nextTimer = setInterval(render, 60*1000);
    }

    function icsForEvent(evt){
      const dt = parseET(evt.date, evt.time_et), dtEnd = new Date(dt.getTime()+60*60*1000);
      function toICS(d){ const pad=n=>String(n).padStart(2,'0'); return d.getUTCFullYear()+pad(d.getUTCMonth()+1)+pad(d.getUTCDate())+'T'+pad(d.getUTCHours())+pad(d.getUTCMinutes())+pad(d.getUTCSeconds())+'Z'; }
      const uid = `${evt.symbol||'GLOBAL'}-${evt.date}-${(evt.name||'').replace(/\\W+/g,'-')}@events-radar`;
      const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Events Radar//EN","BEGIN:VEVENT",`UID:${uid}`,`DTSTAMP:${toICS(new Date())}`,`DTSTART:${toICS(dt)}`,`DTEND:${toICS(dtEnd)}`,`SUMMARY:${(evt.symbol||'Global')} — ${evt.name}`,`DESCRIPTION:${evt.type} | ${evt.domain||""} | ${evt.stage||""}`,`URL:${evt.source||''}`,"END:VEVENT","END:VCALENDAR"].join("\\r\\n");
      return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
    }
    function renderTable(rows){
      if (!tbody) return;
      tbody.innerHTML = "";
      rows.forEach(evt => {
        const tr = document.createElement("tr"); tr.className = "rowGroup";
        tr.innerHTML = `
          <td>${fmtDateYMD(evt.date, evt.time_et)}</td>
          <td>${evt.symbol||"—"}</td>
          <td>${evt.type||""}</td>
          <td>${evt.domain||""}</td>
          <td>${evt.stage||""}</td>
          <td>${evt.name||""}</td>
          <td>${evt.why||""}</td>
          <td><a download="${(evt.symbol||'GLOBAL')}-${evt.date}.ics" href="${icsForEvent(evt)}">ICS</a></td>
          <td>${evt.source ? `<a class="source" href="${evt.source}" target="_blank">link</a>` : ""}</td>`;
        const details = document.createElement("tr"); details.className = "details";
        details.innerHTML = `<td colspan="9"><strong>Notes:</strong> ${evt.notes || "—"} <a class="teaser" href="https://vigyaanvest.com/?utm_source=events&utm_medium=teaser&utm_campaign=events_bundle" target="_blank" rel="noopener">Subscribers get trade setups & risk levels → Learn more</a></td>`;
        tr.addEventListener("click", () => tr.classList.toggle("open"));
        tbody.appendChild(tr); tbody.appendChild(details);
        const symCell = tr.querySelector('td:nth-child(2)');
        symCell?.classList.add('clickable');
        symCell?.addEventListener('click', (ev)=>{ ev.stopPropagation(); var t=symCell.textContent.trim(); if(t) track('symbol_click',{value:t}); });
      });
    }
    function renderCards(rows){
      const wrap = $("#cardsWrap"); if (!wrap) return;
      const groups = rows.reduce((acc, r) => { const key = r.symbol || "GLOBAL"; (acc[key] = acc[key] || []).push(r); return acc; }, {});
      const syms = Object.keys(groups).sort();
      wrap.innerHTML = "";
      syms.forEach(sym => {
        const list = groups[sym].slice().sort(multiCompare);
        const card = document.createElement("div"); card.className = "card";
        const head = document.createElement("div"); head.className = "head";
        head.innerHTML = `<div class="sym">${sym === "GLOBAL" ? "Global (Macro/Micro)" : sym}</div>`;
        const copyBtn = document.createElement("button"); copyBtn.className = "btn small ghost copy"; copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click",(e)=>{
          e.stopPropagation();
          const lines = list.map(e => `• ${fmtDateYMD(e.date, e.time_et)} — ${(e.symbol||'Global')}: ${e.name} [${e.type}/${e.domain||""}/${e.stage||""}] ${e.why||""}`.trim()).join("\\n");
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

    const calGrid = $("#calendarGrid");
    const calTitle= $("#calTitle");
    let calAnchor = null;

    function monthStart(date){ return new Date(date.getFullYear(), date.getMonth(), 1); }
    function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
    function dayLabel(d){ return d.toLocaleDateString('en-US',{day:'2-digit'}); }
    function monthLabel(d){ return d.toLocaleDateString('en-US',{year:'numeric', month:'long'}); }

    function updateCalendar(rows){
      if (!calGrid || !calTitle) return;
      const dates = rows.map(r => parseET(r.date, r.time_et));
      const pivot = dates.length ? new Date(Math.min.apply(null, dates)) : new Date();
      if (!calAnchor) calAnchor = monthStart(pivot);
      calTitle.textContent = monthLabel(calAnchor);

      calGrid.innerHTML = "";
      const startDow = (new Date(calAnchor.getFullYear(),calAnchor.getMonth(),1)).getDay();
      const firstCellDate = addDays(calAnchor, -startDow);
      const daysToRender = 42;
      const byDay = rows.reduce((acc,r)=>{ const k = r.date; (acc[k]=acc[k]||[]).push(r); return acc; },{});

      for (let i=0;i<daysToRender;i++){
        const d = addDays(firstCellDate, i);
        const yyyy = d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
        const key = `${yyyy}-${mm}-${dd}`;
        const evs = byDay[key] || [];
        const cell = document.createElement('div'); cell.className = 'dayCell';
        if (d.getMonth() !== calAnchor.getMonth()) cell.style.opacity = 0.55;
        cell.innerHTML = `<div class="dayHead"><span>${dayLabel(d)}</span><span>${evs.length?evs.length:''}</span></div>`;
        const list = document.createElement('div'); list.className = 'dayEvents';
        evs.sort((a,b)=> parseET(a.date,a.time_et) - parseET(b.date,b.time_et)).forEach(e=>{
          const item = document.createElement('div'); item.className = 'ev type-' + e.type.replace(/ /g,'\\ ');
          const dotClass = (
              e.type === 'Macro' ? 'Macro' :
              e.type === 'Market Micro' ? 'MarketMicro' :
              e.type === 'Regulatory' ? 'Regulatory' :
              e.type === 'Policy / Legislation' ? 'PolicyLegislation' :
              e.type === 'Company' ? 'Company' :
              e.type === 'Sector Conf' ? 'SectorConf' : 'IndustryPrint'
          );
          item.title = `${fmtDateYMD(e.date,e.time_et)} — ${(e.symbol||'Global')} • ${e.type} • ${e.name}`;
          item.innerHTML = `<span class="dot ${dotClass}"></span>${(e.time_et||'')} ${(e.symbol||'—')} ${e.name}`;
          list.appendChild(item);
        });
        cell.appendChild(list);
        calGrid.appendChild(cell);
      }
    }

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

    summaryCounts?.addEventListener("click", (e) => {
      track('summary_chip_click');
      const chip = e.target.closest('.chip'); if (!chip || !typesSel) return;
      const typ = chip.getAttribute('data-type'); if (!typ) return;
      const selected = Array.from(typesSel.selectedOptions).map(o=>o.value);
      const isOnlyThis = selected.length===1 && selected[0]===typ;
      Array.from(typesSel.options).forEach(o => o.selected = false);
      if (!isOnlyThis){ Array.from(typesSel.options).forEach(o => { if (o.value === typ) o.selected = true; }); }
      applyFiltersAndRender();
    });

    fromInput?.addEventListener("input", ()=>{ track('date_filter',{which:'from', value:fromInput?.value||''}); applyFiltersAndRender(); });
    toInput?.addEventListener("input", ()=>{ track('date_filter',{which:'to', value:toInput?.value||''}); applyFiltersAndRender(); });
    symInput?.addEventListener("input", applyFiltersAndRender);
    typesSel?.addEventListener("input", ()=>{ track('type_filter',{types:getSelectedTypes().join('|')}); applyFiltersAndRender(); });
    clearTypes?.addEventListener("click", () => { if (typesSel) Array.from(typesSel.options).forEach(o=>o.selected=false); applyFiltersAndRender(); });
    clearBtn?.addEventListener("click", () => {
      if (fromInput) fromInput.value = "";
      if (toInput) toInput.value = "";
      if (symInput) symInput.value = "";
      if (typesSel) Array.from(typesSel.options).forEach(o=>o.selected=false);
      sortRules = []; calAnchor = null;
      applyFiltersAndRender();
    });
    preset14?.addEventListener("click", () => {
      const today = new Date(); const to = new Date(today.getTime()+13*24*60*60*1000);
      if (fromInput) fromInput.valueAsDate = today;
      if (toInput) toInput.valueAsDate = to;
      applyFiltersAndRender();
    });
    exportBtn?.addEventListener("click", () => { track('export_csv');
      const body = $("#eventsTable tbody"); if (!body) return;
      const rows = Array.from(body.querySelectorAll(".rowGroup")).map(tr => {
        const tds = tr.querySelectorAll("td");
        return {date:tds[0].innerText,symbol:tds[1].innerText,type:tds[2].innerText,domain:tds[3].innerText,stage:tds[4].innerText,event:tds[5].innerText,why:tds[6].innerText,source:(tr.nextElementSibling.querySelector("a.source")||{}).href||""};
      });
      const header=["Date (ET)","Symbol","Type","Domain","Stage","Event","Why it matters","Source"];
      const csv=[header.join(","),...rows.map(r=>header.map(h=>{const key={"Date (ET)":"date","Symbol":"symbol","Type":"type","Domain":"domain","Stage":"stage","Event":"event","Why it matters":"why","Source":"source"}[h];const val=(r[key]||"").replace(/\\"/g,'\\\\"');return `"`+val+`"`;}).join(","))].join("\\r\\n");
      const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="events.csv"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    });

    function applyFiltersAndRender(){
      const rows = filteredRows();
      renderTable(rows); renderCards(rows); updateCalendar(rows); updateSummary(rows);
    }

    (function(){
      try{
        const today = new Date();
        const to = new Date(today.getTime()+13*24*60*60*1000);
        const inRange = (d)=> { const x=new Date(d+'T00:00:00-04:00'); return x>=today && x<=to; };
        const count = (Array.isArray(window.EVENTS)?window.EVENTS:[]).filter(e=>inRange(e.date)).length;
        if (count){
          document.title = `VigyaanVest — Events Radar (${count} next 2 weeks)`;
          const ogT = document.getElementById('ogTitle'); if (ogT) ogT.setAttribute('content', document.title);
        }
      }catch(e){}
    })();

    const ready = setInterval(()=>{
      if (Array.isArray(window.EVENTS)){
        clearInterval(ready);
        applyFiltersAndRender();
        setView("table");
      }
    }, 50);
  });
})();