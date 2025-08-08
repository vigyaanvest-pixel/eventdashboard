
(function(){
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const tbody = $("#eventsTable tbody");
  const fromInput = $("#fromDate");
  const toInput   = $("#toDate");
  const symInput  = $("#symbols");
  const typesSel  = $("#types");
  const preset14  = $("#preset14");
  const clearBtn  = $("#clearFilters");
  const exportBtn = $("#exportCsv");

  function getSelectedTypes(){ return Array.from(typesSel.selectedOptions).map(o=>o.value); }
  function normalizeSymbolsInput(){ return symInput.value.toUpperCase().split(/[,\s]+/).filter(Boolean); }
  function withinRange(dateStr, from, to){ const d=new Date(dateStr+"T00:00:00"); return (!from||d>=from)&&(!to||d<=to); }
  function matchesSymbols(symbol, syms){ return !syms.length || syms.includes(symbol.toUpperCase()); }
  function matchesType(type, selected){ return !selected.length || selected.includes(type); }
  const pad=n=>String(n).padStart(2,'0');
  const fmtDate=d=>d.toLocaleDateString("en-US",{year:'numeric',month:'short',day:'2-digit'});

  function icsForEvent(evt){
    const dt=new Date(evt.date+"T"+(evt.time_et||"09:00")+":00-04:00");
    const dtEnd=new Date(dt.getTime()+60*60*1000);
    function toICS(d){return d.getUTCFullYear()+""+pad(d.getUTCMonth()+1)+pad(d.getUTCDate())+"T"+pad(d.getUTCHours())+pad(d.getUTCMinutes())+pad(d.getUTCSeconds())+"Z";}
    const uid=`${evt.symbol}-${evt.date}-${evt.name.replace(/\W+/g,'-')}@events-radar`;
    const ics=[
      "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Events Radar//EN","BEGIN:VEVENT",
      `UID:${uid}`,`DTSTAMP:${toICS(new Date())}`,`DTSTART:${toICS(dt)}`,`DTEND:${toICS(dtEnd)}`,
      `SUMMARY:${evt.symbol} — ${evt.name}`,
      `DESCRIPTION:${evt.type} | ${evt.domain||""} | ${evt.stage||""}`,
      `URL:${evt.source||''}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8,"+encodeURIComponent(ics);
  }

  function renderRows(rows){
    tbody.innerHTML="";
    rows.forEach(evt=>{
      const tr=document.createElement("tr"); tr.className="rowGroup";
      tr.innerHTML=`
        <td>${fmtDate(new Date(evt.date))}${evt.time_et?" "+evt.time_et:""}</td>
        <td>${evt.symbol}</td>
        <td><span class="badge ${evt.type}">${evt.type}</span></td>
        <td>${evt.domain||""}</td>
        <td>${evt.stage||""}</td>
        <td>${evt.name}</td>
        <td>${evt.why||""}</td>
        <td><a download="${evt.symbol}-${evt.date}.ics" href="${icsForEvent(evt)}">ICS</a></td>
        <td>${evt.source?`<a class="source" href="${evt.source}" target="_blank">link</a>`:""}</td>`;
      const details=document.createElement("tr"); details.className="details";
      details.innerHTML=`<td colspan="9"><strong>Notes:</strong> ${evt.notes||"—"}</td>`;
      tr.addEventListener("click",()=>{ tr.classList.toggle("open"); });
      tbody.appendChild(tr); tbody.appendChild(details);
    });
  }

  function sortByDateThenSymbol(a,b){ if(a.date<b.date) return -1; if(a.date>b.date) return 1; if(a.symbol<b.symbol) return -1; if(a.symbol>b.symbol) return 1; return 0; }

  function applyFilters(){
    const from=fromInput.value?new Date(fromInput.value+"T00:00:00"):null;
    const to=toInput.value?new Date(toInput.value+"T00:00:00"):null;
    const syms=normalizeSymbolsInput(); const types=getSelectedTypes();
    const rows=window.EVENTS.filter(e=>withinRange(e.date,from,to)).filter(e=>matchesSymbols(e.symbol,syms)).filter(e=>matchesType(e.type,types)).sort(sortByDateThenSymbol);
    renderRows(rows);
  }

  // Simple header click sort
  $$("#eventsTable thead th").forEach(th=>{
    th.addEventListener("click",()=>{
      const key=th.getAttribute("data-key"); if(!key) return;
      const sorted=[...window.EVENTS].sort((a,b)=> (a[key]<b[key]?-1:(a[key]>b[key]?1:0)) );
      renderRows(sorted);
    });
  });

  [fromInput,toInput,symInput,typesSel].forEach(el=>el.addEventListener("input",applyFilters));
  $("#preset14").addEventListener("click",()=>{
    const today=new Date(); const to=new Date(today.getTime()+13*24*60*60*1000);
    fromInput.valueAsDate=today; toInput.valueAsDate=to; applyFilters();
  });
  $("#clearFilters").addEventListener("click",()=>{
    fromInput.value=""; toInput.value=""; symInput.value=""; Array.from(typesSel.options).forEach(o=>o.selected=false); applyFilters();
  });
  $("#exportCsv").addEventListener("click",()=>{
    const rows=Array.from(tbody.querySelectorAll(".rowGroup")).map(tr=>{
      const tds=tr.querySelectorAll("td");
      return {date:tds[0].innerText,symbol:tds[1].innerText,type:tds[2].innerText,domain:tds[3].innerText,stage:tds[4].innerText,event:tds[5].innerText,why:tds[6].innerText,source:(tr.nextElementSibling.querySelector("a.source")||{}).href||""};
    });
    const header=["Date (ET)","Symbol","Type","Domain","Stage","Event","Why it matters","Source"];
    const csv=[header.join(","),...rows.map(r=>header.map(h=>{const key={"Date (ET)":"date","Symbol":"symbol","Type":"type","Domain":"domain","Stage":"stage","Event":"event","Why it matters":"why","Source":"source"}[h];const val=(r[key]||"").replace(/\"/g,'\"\"');return `"${val}"`;}).join(","))].join("\r\n");
    const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="events.csv"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });

  // Wait until eventbundle.js loads
  const ready=setInterval(()=>{ if(window.EVENTS){ clearInterval(ready); applyFilters(); } },50);
})();