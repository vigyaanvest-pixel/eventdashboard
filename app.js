
(function(){
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // Theme + brand color -------------------------------------------------------
  const params = new URLSearchParams(location.search);
  const savedTheme = localStorage.getItem("er_theme");
  const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (systemPrefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
  const brand = params.get("brand");
  if (brand) document.documentElement.style.setProperty("--brand", brand);

  $("#toggleDark").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("er_theme", next);
  });

  // View toggle ---------------------------------------------------------------
  const tableWrap = $("#tableWrap");
  const cardsWrap = $("#cardsWrap");
  const btnTable = $("#viewTable");
  const btnCards = $("#viewCards");
  function setView(v){
    if (v === "cards"){
      cardsWrap.hidden = false; tableWrap.hidden = true;
      btnCards.setAttribute("aria-pressed","true"); btnTable.setAttribute("aria-pressed","false");
    } else {
      cardsWrap.hidden = true; tableWrap.hidden = false;
      btnTable.setAttribute("aria-pressed","true"); btnCards.setAttribute("aria-pressed","false");
    }
  }
  btnTable.addEventListener("click", () => setView("table"));
  btnCards.addEventListener("click", () => setView("cards"));

  // Controls ------------------------------------------------------------------
  const tbody = $("#eventsTable tbody");
  const fromInput = $("#fromDate");
  const toInput   = $("#toDate");
  const symInput  = $("#symbols");
  const typesSel  = $("#types");
  const preset14  = $("#preset14");
  const clearBtn  = $("#clearFilters");
  const exportBtn = $("#exportCsv");

  function getSelectedTypes(){ return Array.from(typesSel.selectedOptions).map(o => o.value); }
  function normalizeSymbolsInput(){ return symInput.value.toUpperCase().split(/[,\s]+/).filter(Boolean); }
  function withinRange(dateStr, from, to){ const d = new Date(dateStr+"T00:00:00-04:00"); return (!from || d >= from) && (!to || d <= to); }
  function matchesSymbols(symbol, syms){ return !syms.length || syms.includes(symbol.toUpperCase()); }
  function matchesType(type, selected){ return !selected.length || selected.includes(type); }
  const pad=n=>String(n).padStart(2,'0');
  const fmtDate=d=>d.toLocaleDateString("en-US",{year:'numeric',month:'short',day:'2-digit'});

  function parseET(dateStr, time_et){
    // Treat as ET; build a Date by appending -04:00 (no DST handling needed for countdown hint)
    return new Date(dateStr + "T" + (time_et || "09:00") + ":00-04:00");
  }

  // Data & filtering ----------------------------------------------------------
  function filteredRows(){
    const from = fromInput.value ? new Date(fromInput.value+"T00:00:00-04:00") : null;
    const to   = toInput.value ? new Date(toInput.value+"T00:00:00-04:00") : null;
    const syms = normalizeSymbolsInput();
    const types= getSelectedTypes();
    const rows = (window.EVENTS||[])
      .filter(e => withinRange(e.date, from, to))
      .filter(e => matchesSymbols(e.symbol, syms))
      .filter(e => matchesType(e.type, types))
      .sort((a,b)=> (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0)));
    return rows;
  }

  // Summary bar ---------------------------------------------------------------
  const summaryCounts = $("#summaryCounts");
  const nextEventEl = $("#nextEvent");
  function updateSummary(rows){
    const counts = rows.reduce((acc, r) => { acc[r.type] = (acc[r.type]||0)+1; return acc; }, {});
    summaryCounts.innerHTML = Object.entries(counts).map(([k,v]) => `<span class="chip">${k}: ${v}</span>`).join("") || "<span class='chip'>No events</span>";
    // Next event
    const upcoming = rows
      .map(r => ({...r, dt: parseET(r.date, r.time_et)}))
      .filter(r => r.dt.getTime() >= Date.now())
      .sort((a,b)=> a.dt - b.dt)[0];
    if (!upcoming) { nextEventEl.textContent = "Next event: —"; return; }
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

  // Render: table -------------------------------------------------------------
  function renderTable(rows){
    tbody.innerHTML = "";
    rows.forEach(evt => {
      const tr = document.createElement("tr"); tr.className = "rowGroup";
      tr.innerHTML = `
        <td>${fmtDate(new Date(evt.date))}${evt.time_et ? " " + evt.time_et : ""}</td>
        <td>${evt.symbol}</td>
        <td>${evt.type}</td>
        <td>${evt.domain||""}</td>
        <td>${evt.stage||""}</td>
        <td>${evt.name}</td>
        <td>${evt.why||""}</td>
        <td><a download="${evt.symbol}-${evt.date}.ics" href="${icsForEvent(evt)}">ICS</a></td>
        <td>${evt.source ? `<a class="source" href="${evt.source}" target="_blank">link</a>` : ""}</td>`;
      const details = document.createElement("tr"); details.className = "details";
      details.innerHTML = `<td colspan="9"><strong>Notes:</strong> ${evt.notes || "—"}</td>`;
      tr.addEventListener("click", () => tr.classList.toggle("open"));
      tbody.appendChild(tr); tbody.appendChild(details);
    });
  }

  // Render: cards -------------------------------------------------------------
  function renderCards(rows){
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

  // Utilities -----------------------------------------------------------------
  const pad2 = n => String(n).padStart(2,'0');
  function icsForEvent(evt){
    const dt = new Date(evt.date+"T"+(evt.time_et||"09:00")+":00-04:00");
    const dtEnd = new Date(dt.getTime()+60*60*1000);
    function toICS(d){return d.getUTCFullYear()+pad2(d.getUTCMonth()+1)+pad2(d.getUTCDate())+"T"+pad2(d.getUTCHours())+pad2(d.getUTCMinutes())+pad2(d.getUTCSeconds())+"Z"}
    const uid = `${evt.symbol}-${evt.date}-${(evt.name||'').replace(/\W+/g,'-')}@events-radar`;
    const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Events Radar//EN","BEGIN:VEVENT",
      `UID:${uid}`,`DTSTAMP:${toICS(new Date())}`,`DTSTART:${toICS(dt)}`,`DTEND:${toICS(dtEnd)}`,
      `SUMMARY:${evt.symbol} — ${evt.name}`,
      `DESCRIPTION:${evt.type} | ${evt.domain||""} | ${evt.stage||""}`,
      `URL:${evt.source||''}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  }

  function applyFiltersAndRender(){
    if (!window.EVENTS){ return; }
    const rows = filteredRows();
    updateSummary(rows);
    renderTable(rows);
    renderCards(rows);
  }

  // Header click sort (table-only simple sort)
  $$("#eventsTable thead th").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-key");
      if (!key) return;
      window.EVENTS.sort((a,b)=> (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
      applyFiltersAndRender();
    });
  });

  // Controls wiring
  [fromInput,toInput,symInput,typesSel].forEach(el => el.addEventListener("input", applyFiltersAndRender));
  preset14.addEventListener("click", () => {
    const today = new Date(); const to = new Date(today.getTime()+13*24*60*60*1000);
    fromInput.valueAsDate = today; toInput.valueAsDate = to; applyFiltersAndRender();
  });
  clearBtn.addEventListener("click", () => {
    fromInput.value=""; toInput.value=""; symInput.value=""; Array.from(typesSel.options).forEach(o=>o.selected=false); applyFiltersAndRender();
  });
  exportBtn.addEventListener("click", () => {
    const rows = Array.from($("#eventsTable tbody").querySelectorAll(".rowGroup")).map(tr => {
      const tds = tr.querySelectorAll("td");
      return {date:tds[0].innerText,symbol:tds[1].innerText,type:tds[2].innerText,domain:tds[3].innerText,stage:tds[4].innerText,event:tds[5].innerText,why:tds[6].innerText,source:(tr.nextElementSibling.querySelector("a.source")||{}).href||""};
    });
    const header=["Date (ET)","Symbol","Type","Domain","Stage","Event","Why it matters","Source"];
    const csv=[header.join(","),...rows.map(r=>header.map(h=>{const key={"Date (ET)":"date","Symbol":"symbol","Type":"type","Domain":"domain","Stage":"stage","Event":"event","Why it matters":"why","Source":"source"}[h];const val=(r[key]||"").replace(/\"/g,'\"\"');return `"${val}"`;}).join(","))].join("\r\n");
    const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="events.csv"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });

  // Wait for eventbundle.js then render
  const ready = setInterval(()=>{
    if (window.EVENTS){
      clearInterval(ready);
      applyFiltersAndRender();
    }
  }, 50);

  // Default to table view
  setView("table");
})();