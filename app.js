
(function(){
  function ready(fn){ 
    if (document.readyState !== 'loading') fn(); 
    else document.addEventListener('DOMContentLoaded', fn); 
  }

  ready(function(){
    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));

    // ---- Theme + brand color ----
    const params = new URLSearchParams(location.search);
    const savedTheme = localStorage.getItem("er_theme");
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const startTheme = savedTheme || (systemPrefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", startTheme);
    const brand = params.get("brand");
    if (brand) document.documentElement.style.setProperty("--brand", brand);

    const toggleDark = $("#toggleDark");
    if (toggleDark){
      toggleDark.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme");
        const next = cur === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("er_theme", next);
      });
    } else {
      console.warn("toggleDark button not found");
    }

    // ---- View toggle ----
    const tableWrap = $("#tableWrap");
    const cardsWrap = $("#cardsWrap");
    const btnTable = $("#viewTable");
    const btnCards = $("#viewCards");

    function setView(v){
      if (!tableWrap || !cardsWrap || !btnTable || !btnCards) return;
      if (v === "cards"){
        cardsWrap.hidden = false; tableWrap.hidden = true;
        btnCards.setAttribute("aria-pressed","true"); btnTable.setAttribute("aria-pressed","false");
      } else {
        cardsWrap.hidden = true; tableWrap.hidden = false;
        btnTable.setAttribute("aria-pressed","true"); btnCards.setAttribute("aria-pressed","false");
      }
    }

    if (btnTable) btnTable.addEventListener("click", () => setView("table"));
    if (btnCards) btnCards.addEventListener("click", () => setView("cards"));

    // ---- Controls ----
    const tbody = $("#eventsTable tbody");
    const fromInput = $("#fromDate");
    const toInput   = $("#toDate");
    const symInput  = $("#symbols");
    const typesSel  = $("#types");
    const preset14  = $("#preset14");
    const clearBtn  = $("#clearFilters");
    const exportBtn = $("#exportCsv");

    function getSelectedTypes(){ return typesSel ? Array.from(typesSel.selectedOptions).map(o => o.value) : []; }
    function normalizeSymbolsInput(){ return (symInput?.value || "").toUpperCase().split(/[,\s]+/).filter(Boolean); }
    function withinRange(dateStr, from, to){ const d = new Date(dateStr+"T00:00:00-04:00"); return (!from || d >= from) && (!to || d <= to); }
    function matchesSymbols(symbol, syms){ return !syms.length || syms.includes((symbol||"").toUpperCase()); }
    function matchesType(type, selected){ return !selected.length || selected.includes(type); }
    const pad=n=>String(n).padStart(2,'0');
    const fmtDate=d=>d.toLocaleDateString("en-US",{year:'numeric',month:'short',day:'2-digit'});

    function parseET(dateStr, time_et){
      return new Date((dateStr||"1970-01-01") + "T" + (time_et || "09:00") + ":00-04:00");
    }

    function filteredRows(){
      const from = fromInput?.value ? new Date(fromInput.value+"T00:00:00-04:00") : null;
      const to   = toInput?.value ? new Date(toInput.value+"T00:00:00-04:00") : null;
      const syms = normalizeSymbolsInput();
      const types= getSelectedTypes();
      const src  = Array.isArray(window.EVENTS) ? window.EVENTS : [];
      return src
        .filter(e => withinRange(e.date, from, to))
        .filter(e => matchesSymbols(e.symbol, syms))
        .filter(e => matchesType(e.type, types))
        .sort((a,b)=> (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0)));
    }

    // ---- Summary ----
    const summaryCounts = $("#summaryCounts");
    const nextEventEl = $("#nextEvent");

    function updateSummary(rows){
      if (!summaryCounts || !nextEventEl) return;
      const counts = rows.reduce((acc, r) => { acc[r.type] = (acc[r.type]||0)+1; return acc; }, {});
      summaryCounts.innerHTML = Object.entries(counts).map(([k,v]) => `<span class="chip">${k}: ${v}</span>`).join("") || "<span class='chip'>No events</span>";

      const upcoming = rows
        .map(r => ({...r, dt: parseET(r.date, r.time_et)}))
        .filter(r => r.dt.getTime() >= Date.now())
        .sort((a,b)=> a.dt - b.dt)[0];

      if (!upcoming){ nextEventEl.textContent = "Next event: —"; return; }

      function fmtCountdown(ms){
        const s = Math.max(0, Math.floor(ms/1000));
        const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60);
        return (d?d+"d ":"") + (h?h+"h ":"") + (m?m+"m":"");
      }
      function render(){
        const left = upcoming.dt - Date.now();
        nextEventEl.textContent = `Next: ${fmtDate(upcoming.dt)} ${(upcoming.time_et||"")} — ${upcoming.symbol} • ${upcoming.name} (${fmtCountdown(left)})`;
      }
      render();
      if (window.__nextTimer) clearInterval(window.__nextTimer);
      window.__nextTimer = setInterval(render, 60*1000);
    }

    // ---- Renderers ----
    function icsForEvent(evt){
      const dt = parseET(evt.date, evt.time_et);
      const dtEnd = new Date(dt.getTime()+60*60*1000);
      function toICS(d){return d.getUTCFullYear()+String(d.getUTCMonth()+1).padStart(2,'0')+String(d.getUTCDate()).padStart(2,'0')+"T"+String(d.getUTCHours()).padStart(2,'0')+String(d.getUTCMinutes()).padStart(2,'0')+String(d.getUTCSeconds()).padStart(2,'0')+"Z"}
      const uid = `${evt.symbol}-${evt.date}-${(evt.name||'').replace(/\W+/g,'-')}@events-radar`;
      const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Events Radar//EN","BEGIN:VEVENT",
        `UID:${uid}`,`DTSTAMP:${toICS(new Date())}`,`DTSTART:${toICS(dt)}`,`DTEND:${toICS(dtEnd)}`,
        `SUMMARY:${evt.symbol} — ${evt.name}`,
        `DESCRIPTION:${evt.type} | ${evt.domain||""} | ${evt.stage||""}`,
        `URL:${evt.source||''}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
      return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
    }

    function renderTable(rows){
      if (!tbody) return;
      tbody.innerHTML = "";
      rows.forEach(evt => {
        const tr = document.createElement("tr"); tr.className = "rowGroup";
        tr.innerHTML = `
          <td>${fmtDate(new Date(evt.date))}${evt.time_et ? " " + evt.time_et : ""}</td>
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

    const cardsWrap = $("#cardsWrap");
    function renderCards(rows){
      if (!cardsWrap) return;
      const groups = rows.reduce((acc, r) => { (acc[r.symbol] = acc[r.symbol] || []).push(r); return acc; }, {});
      const syms = Object.keys(groups).sort();
      cardsWrap.innerHTML = "";
      syms.forEach(sym => {
        const list = groups[sym].slice().sort((a,b)=> (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        const card = document.createElement("div"); card.className = "card";
        const head = document.createElement("div"); head.className = "head";
        const title = document.createElement("div"); title.className = "sym"; title.textContent = sym;
        const copyBtn = document.createElement("button"); copyBtn.className = "btn small ghost copy"; copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const lines = list.map(e => {
            const dt = fmtDate(new Date(e.date));
            const t  = e.time_et ? (" " + e.time_et) : "";
            return `• ${dt}${t} — ${e.symbol}: ${e.name} [${e.type}/${e.domain||""}/${e.stage||""}] ${e.why||""}`.trim();
          }).join("\n");
          if (navigator.clipboard) navigator.clipboard.writeText(lines);
          copyBtn.textContent = "Copied!"; setTimeout(()=> copyBtn.textContent = "Copy", 1200);
        });
        head.appendChild(title); head.appendChild(copyBtn);
        const ul = document.createElement("ul");
        list.forEach(e => {
          const li = document.createElement("li");
          li.innerHTML = `<time>${fmtDate(new Date(e.date))}${e.time_et?" "+e.time_et:""}</time> — <strong>${e.name}</strong><br><span>${e.type} · ${e.domain||""} · ${e.stage||""}</span><br><em>${e.why||""}</em>`;
          ul.appendChild(li);
        });
        card.appendChild(head); card.appendChild(ul);
        cardsWrap.appendChild(card);
      });
    }

    function applyFiltersAndRender(){
      const rows = filteredRows();
      updateSummary(rows);
      renderTable(rows);
      renderCards(rows);
    }

    // Header click sort
    $$("#eventsTable thead th").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.getAttribute("data-key");
        if (!key) return;
        if (Array.isArray(window.EVENTS)) window.EVENTS.sort((a,b)=> (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
        applyFiltersAndRender();
      });
    });

    // Controls wiring (null-safe)
    if (fromInput) fromInput.addEventListener("input", applyFiltersAndRender);
    if (toInput) toInput.addEventListener("input", applyFiltersAndRender);
    if (symInput) symInput.addEventListener("input", applyFiltersAndRender);
    if (typesSel) typesSel.addEventListener("input", applyFiltersAndRender);
    if (preset14) preset14.addEventListener("click", () => {
      const today = new Date(); const to = new Date(today.getTime()+13*24*60*60*1000);
      if (fromInput) fromInput.valueAsDate = today;
      if (toInput) toInput.valueAsDate = to;
      applyFiltersAndRender();
    });
    if (clearBtn) clearBtn.addEventListener("click", () => {
      if (fromInput) fromInput.value="";
      if (toInput) toInput.value="";
      if (symInput) symInput.value="";
      if (typesSel) Array.from(typesSel.options).forEach(o=>o.selected=false);
      applyFiltersAndRender();
    });
    if (exportBtn) exportBtn.addEventListener("click", () => {
      const body = $("#eventsTable tbody");
      if (!body) return;
      const rows = Array.from(body.querySelectorAll(".rowGroup")).map(tr => {
        const tds = tr.querySelectorAll("td");
        return {date:tds[0].innerText,symbol:tds[1].innerText,type:tds[2].innerText,domain:tds[3].innerText,stage:tds[4].innerText,event:tds[5].innerText,why:tds[6].innerText,source:(tr.nextElementSibling.querySelector("a.source")||{}).href||""};
      });
      const header=["Date (ET)","Symbol","Type","Domain","Stage","Event","Why it matters","Source"];
      const csv=[header.join(","),...rows.map(r=>header.map(h=>{const key={"Date (ET)":"date","Symbol":"symbol","Type":"type","Domain":"domain","Stage":"stage","Event":"event","Why it matters":"why","Source":"source"}[h];const val=(r[key]||"").replace(/\"/g,'\"\"');return `"${val}"`;}).join(","))].join("\r\n");
      const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="events.csv"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    });

    // Initial render once EVENTS exists
    const ready = setInterval(()=>{
      if (Array.isArray(window.EVENTS)){
        clearInterval(ready);
        applyFiltersAndRender();
      }
    }, 50);

    // Default view
    setView("table");
  });
})();