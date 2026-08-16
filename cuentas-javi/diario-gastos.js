/* ============================================================
   Diario de Gastos — lógica de datos y render
   ============================================================ */

const STORAGE_KEY = 'diarioGastosDB_v1';
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_ABR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const FIJOS_REF_YEAR = 2026; // año de referencia del MASTER
const MASTER_URL = '../excel/finanzas-master.xlsx';
const MASTER_MAX_YEAR = 2040; // horizonte visible/proyectable desde el año base
const MASTER_REFRESH_PARAM = () => `?v=${Date.now()}`;
const MES_ABR_LOWER = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const CONCEPT_ALIASES = { 'nom': 'nómina' }; // compatibilidad con plantillas antiguas
const MASTER_FREQUENCIES = new Set(['mensual','anual','semanal']);

let DB = loadDB();
let ui = {
  year: null,
  monthFilterDiario: 'todos',
  tarjMonth: (new Date().getMonth()+1)
};

// ---------------- Storage ----------------
function loadDB(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const db = JSON.parse(raw);
      if(!db.ipc) db.ipc = { gastos:2, ingresos:0.5 };
      if(!db.fijos) db.fijos = [];
      if(!db.fijosGroups) db.fijosGroups = [];
      return db;
    }
  }catch(e){ console.error('Error leyendo almacenamiento', e); }
  return { years:{}, fijos:[], ipc:{ gastos:2, ingresos:0.5 }, fijosGroups:[] };
}
function saveDB(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
}
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function ensureYear(y){
  y = String(y);
  if(!DB.years[y]) DB.years[y] = { start:0, days:[], cardEntries:[] };
  return DB.years[y];
}

// ---------------- Utils ----------------
function fmt(n){
  if(n===null||n===undefined||isNaN(n)) return '0';
  n = Number(n);
  const neg = n<0;
  n = Math.abs(n);
  const intPart = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '−' : '') + intPart;
}
function fmtSigned(n){
  const s = fmt(Math.abs(n));
  return (n<0?'−':'+') + s;
}
// Formato editable con separador de miles (punto) y decimales opcionales (coma)
function fmtEditable(n){
  if(n===null||n===undefined||n===''||isNaN(n)) return '';
  return Number(n).toLocaleString('es-ES', {minimumFractionDigits:0, maximumFractionDigits:2});
}
// Convierte un texto en formato español (1.234,56) a número JS
function parseEsNumber(str){
  if(str===null||str===undefined) return 0;
  str = String(str).trim().replace(/−/g,'-');
  if(!str) return 0;
  str = str.replace(/\./g,'').replace(',', '.');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(()=>t.classList.remove('show'), 2600);
}
function parseDateISO(d){
  // d: JS Date or 'yyyy-mm-dd' string
  if(d instanceof Date) return d;
  return new Date(d+'T00:00:00');
}
function isoDate(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// ---------------- Cálculo de saldos ----------------
function getSortedDays(year){
  const yd = ensureYear(year);
  const entries = yd.days.slice();
  entries.sort((a,b)=> a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
  let running = yd.start||0;
  return entries.map(e=>{
    running += Number(e.amount)||0;
    return Object.assign({}, e, {balance: running});
  });
}

function monthlyAggregates(year){
  const yd = ensureYear(year);
  const sorted = getSortedDays(year);
  const months = [];
  let lastBalance = yd.start||0;
  for(let m=1;m<=12;m++){
    const dayEntries = sorted.filter(e=> parseDateISO(e.date).getMonth()+1 === m);
    const ingresos = dayEntries.filter(e=>Number(e.amount)>0).reduce((s,e)=>s+Number(e.amount),0);
    const gastosOtros = dayEntries.filter(e=>Number(e.amount)<0 && !/^tarjetas/i.test(e.concept||'')).reduce((s,e)=>s+Number(e.amount),0);
    const catEntries = yd.cardEntries.filter(c=>Number(c.month)===m);
    const tarjeta = catEntries.reduce((s,c)=>s+Number(c.amount||0),0);
    const saldoFin = dayEntries.length ? dayEntries[dayEntries.length-1].balance : lastBalance;
    lastBalance = saldoFin;
    months.push({m, ingresos, gastosOtros, tarjeta, saldoFin, count:dayEntries.length});
  }
  return months;
}

function yearTotals(year){
  const yd = ensureYear(year);
  const sorted = getSortedDays(year);
  const ingresos = sorted.filter(e=>Number(e.amount)>0).reduce((s,e)=>s+Number(e.amount),0);
  const gastos = sorted.filter(e=>Number(e.amount)<0).reduce((s,e)=>s+Number(e.amount),0);
  const tarjeta = yd.cardEntries.reduce((s,c)=>s+Number(c.amount||0),0);
  const saldoFinal = sorted.length ? sorted[sorted.length-1].balance : (yd.start||0);
  return { start: yd.start||0, saldoFinal, ingresos, gastos, ahorro: ingresos+gastos, tarjeta };
}

// ============================================================
// RENDER: shell (year select, tabs, ticker)
// ============================================================
function populateYearSelect(){
  const sel = document.getElementById('yearSelect');
  const set = new Set(Object.keys(DB.years).map(Number));
  if(DB.fijos && DB.fijos.length){
    // Solo se añaden al selector los años de Gastos Fijos >= FIJOS_REF_YEAR
    // (2026 en adelante); columnas de referencia anteriores (p.ej. 2025)
    // no aparecen aquí, aunque sigan visibles en la pestaña Gastos fijos.
    fijosYears().filter(y=>y>=FIJOS_REF_YEAR).forEach(y=>set.add(Number(y)));
  }
  // Orden: año actual en adelante primero (ascendente), y los años ya
  // pasados van al final del selector (también ascendente entre ellos).
  const currentYear = new Date().getFullYear();
  const allYears = Array.from(set).sort((a,b)=>a-b);
  const futuros = allYears.filter(y=>y>=currentYear);
  const pasados = allYears.filter(y=>y<currentYear);
  const years = [...futuros, ...pasados].map(String);
  sel.innerHTML = years.map(y=>`<option value="${y}">${y}${DB.years[y]?'':' (sin datos)'}</option>`).join('');
  // Selección por defecto (al entrar): el año actual si existe en la lista;
  // si no, el primero disponible. Solo se aplica si aún no hay selección
  // válida (no pisa una elección manual del usuario durante la sesión).
  if(!ui.year || !years.includes(ui.year)){
    ui.year = years.includes(String(currentYear)) ? String(currentYear) : (years.length ? years[0] : null);
  }
  if(ui.year) sel.value = ui.year;
}

function renderTicker(){
  const box = document.getElementById('tickerBox');
  const yearLabel = document.getElementById('tickerYear');
  const valEl = document.getElementById('tickerValue');
  const deltaEl = document.getElementById('tickerDelta');
  if(!ui.year){
    yearLabel.textContent = '—'; valEl.textContent='0'; deltaEl.textContent='';
    box.innerHTML = '<div class="ticker-empty">Importa un Excel o añade movimientos para ver la evolución del saldo.</div>';
    return;
  }
  yearLabel.textContent = ui.year;
  const sorted = getSortedDays(ui.year);
  const start = ensureYear(ui.year).start||0;
  const finalBal = sorted.length ? sorted[sorted.length-1].balance : start;
  valEl.textContent = fmt(finalBal);
  const delta = finalBal - start;
  deltaEl.textContent = ` ${fmtSigned(delta)} € en el año`;
  deltaEl.style.color = delta>=0 ? '#8FE3C0' : '#F0B39F';

  if(!sorted.length){
    box.innerHTML = '<div class="ticker-empty">Sin movimientos todavía para '+ui.year+'.</div>';
    return;
  }
  // build step points across the year
  const points = [{x: new Date(Number(ui.year),0,1).getTime(), y:start}];
  sorted.forEach(e=> points.push({x: parseDateISO(e.date).getTime(), y:e.balance}));
  const W=1000,H=64,PAD=4;
  const minX = points[0].x, maxX = points[points.length-1].x;
  const ys = points.map(p=>p.y);
  let minY = Math.min(...ys, start), maxY = Math.max(...ys, start);
  if(minY===maxY){ minY-=1; maxY+=1; }
  const sx = x => PAD + (W-2*PAD) * ( (x-minX) / Math.max(1,(maxX-minX)) );
  const sy = y => H-PAD - (H-2*PAD) * ( (y-minY) / (maxY-minY) );
  // step-after path
  let d = `M ${sx(points[0].x).toFixed(1)} ${sy(points[0].y).toFixed(1)}`;
  for(let i=1;i<points.length;i++){
    d += ` L ${sx(points[i].x).toFixed(1)} ${sy(points[i-1].y).toFixed(1)}`;
    d += ` L ${sx(points[i].x).toFixed(1)} ${sy(points[i].y).toFixed(1)}`;
  }
  const lastX = sx(points[points.length-1].x), lastY = sy(points[points.length-1].y);
  const areaD = d + ` L ${lastX.toFixed(1)} ${H-PAD} L ${sx(points[0].x).toFixed(1)} ${H-PAD} Z`;
  const zeroY = sy(0);
  const zeroLine = (0>=minY && 0<=maxY) ? `<line x1="0" y1="${zeroY.toFixed(1)}" x2="${W}" y2="${zeroY.toFixed(1)}" stroke="#3A473F" stroke-width="1" stroke-dasharray="3,3"/>` : '';
  box.innerHTML = `<svg class="ticker-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${zeroLine}
    <path d="${areaD}" fill="rgba(201,146,46,0.16)" stroke="none"/>
    <path d="${d}" fill="none" stroke="#C9922E" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.6" fill="#F5F8F4"/>
  </svg>`;
}

// ============================================================
// RENDER: Resumen
// ============================================================
function renderResumen(){
  const kpiRow = document.getElementById('kpiRow');
  const sub = document.getElementById('resumenSub');
  const chartBox = document.getElementById('monthChart');
  if(!ui.year){
    kpiRow.innerHTML = emptyKpis();
    sub.textContent = '';
    chartBox.innerHTML = emptyState('Sin datos', 'Importa tu Excel o crea un año para empezar.');
    return;
  }
  const t = yearTotals(ui.year);
  sub.textContent = ui.year;
  kpiRow.innerHTML = `
    ${kpiCard('Saldo inicial', fmt(t.start)+' €','')}
    ${kpiCard('Saldo final', fmt(t.saldoFinal)+' €', t.saldoFinal>=t.start?'pos':'neg')}
    ${kpiCard('Ingresos', fmt(t.ingresos)+' €','pos')}
    ${kpiCard('Gastos', fmt(t.gastos)+' €','neg')}
    ${kpiCard('Ahorro neto', fmtSigned(t.ahorro)+' €', t.ahorro>=0?'pos':'neg')}
    ${kpiCard('Gasto tarjeta', fmt(t.tarjeta)+' €','card')}
  `;
  const months = monthlyAggregates(ui.year);
  chartBox.innerHTML = buildMonthChartSVG(months);
}
function emptyKpis(){
  return ['Saldo inicial','Saldo final','Ingresos','Gastos','Ahorro neto','Gasto tarjeta']
    .map(l=>kpiCard(l,'—','')).join('');
}
function kpiCard(label,value,cls){
  return `<div class="kpi ${cls||''}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>`;
}
function emptyState(title,sub){
  return `<div class="empty-state"><div class="big">·</div><div><strong>${title}</strong></div><div>${sub}</div></div>`;
}

function buildMonthChartSVG(months){
  const W=900,H=280, padL=34,padR=10,padT=14,padB=26;
  const innerW = W-padL-padR, innerH = H-padT-padB;
  const slot = innerW/12;
  const maxBar = Math.max(1, ...months.map(m=>Math.max(m.ingresos, Math.abs(m.gastosOtros), m.tarjeta)));
  const saldos = months.map(m=>m.saldoFin);
  let minS = Math.min(...saldos), maxS = Math.max(...saldos);
  if(minS===maxS){minS-=1;maxS+=1;}
  const barW = slot/4;
  let bars='', line='';
  const pts=[];
  months.forEach((m,i)=>{
    const cx = padL + slot*i + slot/2;
    const baseY = padT+innerH;
    const hIng = (m.ingresos/maxBar)*innerH;
    const hGasto = (Math.abs(m.gastosOtros)/maxBar)*innerH;
    const hTarj = (m.tarjeta/maxBar)*innerH;
    const x0 = cx - slot/2 + slot*0.12;
    bars += rect(x0, baseY-hIng, barW*0.9, hIng, 'var(--pos)');
    bars += rect(x0+barW, baseY-hGasto, barW*0.9, hGasto, 'var(--neg)');
    bars += rect(x0+barW*2, baseY-hTarj, barW*0.9, hTarj, 'var(--card)');
    const sy = padT + innerH - ((m.saldoFin-minS)/(maxS-minS))*innerH;
    pts.push([cx, sy]);
  });
  line = 'M ' + pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L ');
  const dots = pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="var(--gold)"/>`).join('');
  const labels = months.map((m,i)=>`<text x="${(padL+slot*i+slot/2).toFixed(1)}" y="${H-8}" font-size="10.5" fill="var(--ink-soft)" text-anchor="middle" font-family="Inter,sans-serif">${MESES_ABR[i]}</text>`).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}">
    <line x1="${padL}" y1="${padT+innerH}" x2="${W-padR}" y2="${padT+innerH}" stroke="var(--line)" stroke-width="1"/>
    ${bars}
    <path d="${line}" fill="none" stroke="var(--gold)" stroke-width="1.8"/>
    ${dots}
    ${labels}
  </svg>`;
}
function rect(x,y,w,h,fill){
  if(h<0){ y=y+h; h=Math.abs(h); }
  h = Math.max(h,0.6);
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${fill}"/>`;
}

// ============================================================
// RENDER: Diario
// ============================================================
function populateMonthFilter(){
  const sel = document.getElementById('monthFilter');
  sel.innerHTML = '<option value="todos">Todos los meses</option>' +
    MESES.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');
  sel.value = ui.monthFilterDiario;
}
function renderDiario(){
  const wrap = document.getElementById('diarioTableWrap');
  if(!ui.year){ wrap.innerHTML = emptyState('Sin año seleccionado','Crea o importa un año primero.'); return; }
  let sorted = getSortedDays(ui.year);
  if(ui.monthFilterDiario!=='todos'){
    sorted = sorted.filter(e=> parseDateISO(e.date).getMonth()+1 === Number(ui.monthFilterDiario));
  }
  if(!sorted.length){
    wrap.innerHTML = emptyState('Sin movimientos','No hay movimientos para este filtro.');
    return;
  }
  // Si estamos viendo el año en curso, la línea de hoy (o la más próxima)
  // sube arriba del todo; lo anterior a hoy queda archivado abajo, para
  // no tener que hacer scroll entre los movimientos ya pasados cada vez.
  const currentYear = new Date().getFullYear();
  const isYearActual = Number(ui.year) === currentYear;
  const todayIso = isoDate(new Date());
  const futuros = isYearActual ? sorted.filter(e=> e.date >= todayIso) : sorted;
  const pasados = isYearActual ? sorted.filter(e=> e.date < todayIso) : [];

  const rowHtml = (e, archived)=>{
    const cls = Number(e.amount)>=0 ? 'amount-pos':'amount-neg';
    return `<tr data-id="${e.id}"${archived?' class="fila-archivada"':''}>
      <td><input class="row-input mono" type="date" value="${e.date}" data-field="date"></td>
      <td><input class="row-input" type="text" value="${escapeHtml(e.concept||'')}" data-field="concept"></td>
      <td class="num-cell"><input class="row-input num mono ${cls}" type="text" inputmode="decimal" value="${fmt(e.amount)}" data-field="amount"></td>
      <td class="num-cell mono balance-cell ${Number(e.balance)<0?'neg':''}">${fmt(e.balance)} €</td>
      <td style="width:30px"><button class="icon-btn" data-del="${e.id}" title="Eliminar">✕</button></td>
    </tr>`;
  };
  let rows = futuros.map(e=>rowHtml(e,false)).join('');
  if(pasados.length){
    rows += `<tr class="diario-archivo-sep"><td colspan="5">Archivado · movimientos anteriores a hoy (no se recalculan automáticamente)</td></tr>`;
    rows += pasados.map(e=>rowHtml(e,true)).join('');
  }
  wrap.innerHTML = `<table>
    <thead><tr><th style="width:130px">Fecha</th><th>Concepto</th><th style="width:140px">Importe</th><th style="width:160px">Saldo</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  wrap.querySelectorAll('input[data-field]').forEach(inp=>{
    inp.addEventListener('change', e=>{
      const tr = e.target.closest('tr');
      const id = tr.getAttribute('data-id');
      const field = e.target.getAttribute('data-field');
      const yd = ensureYear(ui.year);
      const entry = yd.days.find(x=>x.id===id);
      if(!entry) return;
      entry[field] = field==='amount' ? parseEsNumber(e.target.value) : e.target.value;
      saveDB();
      renderAll();
    });
  });
  wrap.querySelectorAll('button[data-del]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      const id = e.target.getAttribute('data-del');
      if(!confirm('¿Eliminar este movimiento?')) return;
      const yd = ensureYear(ui.year);
      yd.days = yd.days.filter(x=>x.id!==id);
      saveDB();
      renderAll();
      toast('Movimiento eliminado');
    });
  });
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================
// RENDER: Tarjeta
// ============================================================
function populateTarjMonthSelect(){
  const sel = document.getElementById('tarjMonthSelect');
  sel.innerHTML = MESES.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');
  sel.value = ui.tarjMonth;
}
function renderTarjeta(){
  document.getElementById('tarjMonthLabel').textContent = ui.year ? MESES[ui.tarjMonth-1] : '—';
  const catBox = document.getElementById('catBars');
  const monthlyBox = document.getElementById('tarjMonthlyWrap');
  if(!ui.year){
    catBox.innerHTML = emptyState('Sin año','Selecciona un año primero.');
    monthlyBox.innerHTML='';
    return;
  }
  const yd = ensureYear(ui.year);
  const entries = yd.cardEntries.filter(c=>Number(c.month)===Number(ui.tarjMonth));
  if(!entries.length){
    catBox.innerHTML = emptyState('Sin gastos de tarjeta', 'Añade uno o importa el Excel.');
  } else {
    const byCat = {};
    entries.forEach(e=>{ byCat[e.category] = (byCat[e.category]||0) + Number(e.amount||0); });
    const list = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
    const max = Math.max(...list.map(x=>x[1]));
    catBox.innerHTML = list.map(([cat,val])=>`
      <div style="margin-bottom:9px;">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px;">
          <span>${escapeHtml(cat)}</span><span class="mono">${fmt(val)} €</span>
        </div>
        <div style="background:var(--panel-alt);border-radius:5px;height:8px;overflow:hidden;">
          <div style="background:var(--card);height:100%;width:${(val/max*100).toFixed(1)}%;"></div>
        </div>
      </div>`).join('');
    catBox.innerHTML += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-weight:600;">
      <span>Total</span><span class="mono">${fmt(list.reduce((s,[,v])=>s+v,0))} €</span></div>`;
  }
  const monthAgg = monthlyAggregates(ui.year);
  monthlyBox.innerHTML = `<table>
    <thead><tr><th>Mes</th><th class="num-cell">Total tarjeta</th></tr></thead>
    <tbody>${monthAgg.map(m=>`<tr><td>${MESES[m.m-1]}</td><td class="num-cell mono">${fmt(m.tarjeta)} €</td></tr>`).join('')}</tbody>
  </table>`;
}

// ============================================================
// RENDER: Gastos fijos
// ============================================================
function fijosYears(){
  const set = new Set();
  DB.fijos.forEach(f=> Object.keys(f.values||{}).forEach(y=>set.add(Number(y))));
  if(DB.masterLoaded){
    for(let y=FIJOS_REF_YEAR; y<=MASTER_MAX_YEAR; y++) set.add(y);
  }
  if(!set.size){
    const base = ui.year ? Number(ui.year) : new Date().getFullYear();
    for(let i=0;i<6;i++) set.add(base+i);
  }
  return Array.from(set).sort((a,b)=>a-b);
}

function masterGroupId(group){
  return 'master:' + String(group||'sinGrupo').trim();
}

function parseMasterRows(rows){
  if(!Array.isArray(rows) || !rows.length) return [];
  const header = rows[0].map(v=>String(v==null?'':v).trim().toLowerCase());
  const idx = {};
  header.forEach((h,i)=>{ if(h) idx[h]=i; });
  const required = ['id','tipo','grupo','concepto','valor_base','ano_base','frecuencia','meses','medio','activo','orden'];
  if(required.some(k=>idx[k]===undefined)) return [];

  const items = [];
  for(const row of rows.slice(1)){
    const id = row[idx.id];
    const concepto = row[idx.concepto];
    if(id==null || concepto==null) continue;
    const tipoRaw = String(row[idx.tipo]??'').trim().toLowerCase();
    if(tipoRaw!=='ingreso' && tipoRaw!=='gasto') continue;
    const base = Number(row[idx.valor_base]);
    const anoBase = Number(row[idx.ano_base]) || FIJOS_REF_YEAR;
    const frecuenciaRaw = String(row[idx.frecuencia]??'').trim().toLowerCase();
    const frecuencia = MASTER_FREQUENCIES.has(frecuenciaRaw) ? frecuenciaRaw : 'mensual';
    const mesesRaw = row[idx.meses];
    const meses = mesesRaw==null || String(mesesRaw).trim()==='' ? [] : String(mesesRaw).split('|').map(x=>Number(x.trim())).filter(m=>m>=1&&m<=12);
    const medio = String(row[idx.medio]??'cuenta').trim().toLowerCase()==='tarjeta' ? 'tarjeta' : 'cuenta';
    const activo = Number(row[idx.activo]) !== 0;
    const grupo = String(row[idx.grupo]??'').trim();
    const orden = Number(row[idx.orden]) || 9999;
    if(!Number.isFinite(base)) continue;
    items.push({
      id:String(id),
      name:String(concepto).trim(),
      tipo: grupo==='gastosVacaciones' ? 'vacaciones' : tipoRaw,
      groupId: masterGroupId(grupo),
      masterGroup: grupo,
      masterId:String(id),
      masterTipo:tipoRaw,
      frecuencia,
      meses,
      medio,
      activo,
      orden,
      source:'master',
      values:{[anoBase]:base}
    });
  }
  return items;
}

function buildMasterGroups(items){
  const existing = Array.isArray(DB.fijosGroups) ? DB.fijosGroups.filter(g=>!String(g.id||'').startsWith('master:')) : [];
  const seen = new Map();
  items.forEach((item,i)=>{
    if(!seen.has(item.groupId)) seen.set(item.groupId, {id:item.groupId,name:item.masterGroup||'Sin grupo',order:i});
  });
  DB.fijosGroups = [...seen.values(), ...existing];
}

function installMasterItems(items){
  if(!items.length) return false;
  const manual = (DB.fijos||[]).filter(f=>f.source!=='master');
  DB.fijos = [...items, ...manual];
  buildMasterGroups(items);
  DB.masterLoaded = true;
  DB.masterLoadedAt = new Date().toISOString();
  items.forEach(item=>{
    item.values = item.values || {};
    const baseYear = Object.keys(item.values).map(Number).sort((a,b)=>a-b)[0] || FIJOS_REF_YEAR;
    recomputeForwardFijo(item, baseYear);
  });
  return true;
}

function masterMonths(item, year){
  if(!item || !item.activo) return [];
  if(item.frecuencia==='mensual') return Array.from({length:12},(_,i)=>i+1);
  if(item.frecuencia==='anual') return item.meses.length ? item.meses : [1];
  if(item.frecuencia==='semanal') return Array.from({length:12},(_,i)=>i+1);
  return item.meses.length ? item.meses : [1];
}

function daysInMonth(year,month){ return new Date(year, month, 0).getDate(); }
function monthlyBudgetForMaster(item, year, month){
  const unit = Math.abs(Number(item?.values?.[year])||0);
  if(!item || !item.activo) return 0;
  if(item.frecuencia==='mensual') return unit;
  if(item.frecuencia==='anual') return item.meses.includes(month) ? unit : 0;
  if(item.frecuencia==='semanal') return unit * 52 / 12;
  return item.meses.includes(month) ? unit : 0;
}

function masterDateHint(concept, month){
  const candidates = PLANTILLA_2027_DIAS.filter(t=>t.concept===concept && Number(t.date.slice(5,7))===month);
  if(candidates.length) return Number(candidates[0].date.slice(8,10));
  const all = PLANTILLA_2027_DIAS.filter(t=>t.concept===concept);
  if(all.length) return Number(all[0].date.slice(8,10));
  return concept && /nomina|nómina|ing/i.test(concept) ? 1 : 5;
}

function validDateDay(year,month,day){ return Math.min(Math.max(1,day), daysInMonth(year,month)); }

function generarAnoDesdePlantilla(year){
  const yearStr = String(year);
  const todayIso = isoDate(new Date());
  const existing = DB.years[yearStr];
  const prevDays = existing && existing.days ? existing.days.slice() : [];
  const prevCard = existing && existing.cardEntries ? existing.cardEntries.slice() : [];

  const activeMaster = DB.fijos.filter(f=>f.source==='master' && f.activo);
  const generatedDayKeys = new Set();
  const generatedCardKeys = new Set();
  const prevDaysMap = new Map(prevDays.map(d=>[d.date+'|'+d.concept,d]));
  const prevCardMap = new Map(prevCard.map(c=>[c.month+'|'+c.category+'|'+(c.masterId||''),c]));
  // Migración: las versiones anteriores generaban estos elementos desde una plantilla JS.
  // Se consideran generados (no manuales) para evitar duplicarlos al activar MASTER.
  const legacyDayKeys = new Set(PLANTILLA_2027_DIAS.map(t=>(yearStr+t.date.slice(4))+'|'+t.concept));
  for(let m=1;m<=12;m++) legacyDayKeys.add(isoDate(new Date(year,m,0))+'|'+`Tarjetas ${MESES_ABR[m-1]}`);
  const legacyCardKeys = new Set(PLANTILLA_2027_TARJETA.map(t=>t.month+'|'+t.category));

  // Conserva movimientos que no pertenecen al Master (manuales/Extras).
  const manualDays = prevDays.filter(d=>!d.sourceMaster && !legacyDayKeys.has(d.date+'|'+d.concept));
  const manualCard = prevCard.filter(c=>!c.sourceMaster && !legacyCardKeys.has(c.month+'|'+c.category));
  const days = manualDays.slice();
  const cardEntries = manualCard.slice();

  activeMaster.filter(item=>item.medio==='cuenta').forEach(item=>{
    const months = masterMonths(item, year);
    months.forEach(month=>{
      if(item.frecuencia==='semanal'){
        for(let d=1; d<=daysInMonth(year,month); d+=7){
          const date = isoDate(new Date(year,month-1,d));
          if(date<todayIso) continue;
          const concept = item.name;
          const prev = prevDaysMap.get(date+'|'+concept);
          days.push({id:prev?.id||uid(),date,concept,amount:item.tipo==='ingreso'?Math.abs(Number(item.values?.[year])||0):-Math.abs(Number(item.values?.[year])||0),sourceMaster:true,masterId:item.masterId});
          generatedDayKeys.add(date+'|'+concept);
        }
      } else {
        if(item.frecuencia==='anual' && !item.meses.includes(month)) return;
        const day = validDateDay(year,month,masterDateHint(item.name,month));
        const date = isoDate(new Date(year,month-1,day));
        const key = date+'|'+item.name;
        if(date<todayIso) {
          const prev = prevDaysMap.get(key);
          if(prev) days.push(prev);
          generatedDayKeys.add(key);
          return;
        }
        const prev = prevDaysMap.get(key);
        const amount = item.tipo==='ingreso' ? Math.abs(Number(item.values?.[year])||0) : -Math.abs(Number(item.values?.[year])||0);
        days.push({id:prev?.id||uid(),date,concept:item.name,amount,sourceMaster:true,masterId:item.masterId});
        generatedDayKeys.add(key);
      }
    });
  });

  // Tarjeta se guarda como presupuesto mensual por categoría.
  activeMaster.filter(item=>item.medio==='tarjeta' && item.tipo!=='ingreso').forEach(item=>{
    for(let month=1;month<=12;month++){
      const amount = monthlyBudgetForMaster(item,year,month);
      const key = month+'|'+item.name+'|'+item.masterId;
      if(amount<=0) continue;
      const prev = prevCardMap.get(key);
      const mesCerrado = isoDate(new Date(year,month,0)) < todayIso;
      if(mesCerrado && prev){
        cardEntries.push(prev);
      }else{
        cardEntries.push({id:prev?.id||uid(),month,category:item.name,amount,sourceMaster:true,masterId:item.masterId});
      }
      generatedCardKeys.add(key);
    }
  });

  // Cierres de tarjeta: uno por mes con la suma de categorías Master.
  for(let month=1;month<=12;month++){
    const total = cardEntries.filter(c=>Number(c.month)===month && c.sourceMaster).reduce((sum,c)=>sum+Number(c.amount||0),0);
    const concept = `Tarjetas ${MESES_ABR[month-1]}`;
    const date = isoDate(new Date(year,month,0));
    const prev = prevDaysMap.get(date+'|'+concept);
    const mesCerrado = date < todayIso;
    if(total>0){
      if(mesCerrado && prev) days.push(prev);
      else days.push({id:prev?.id||uid(),date,concept,amount:-total,sourceMaster:true,masterId:'CARD_CLOSE_'+month});
    }
  }

  let start = 0;
  const prevYear = DB.years[String(year-1)];
  if(prevYear){
    const prevSorted = getSortedDays(year-1);
    start = prevSorted.length ? prevSorted[prevSorted.length-1].balance : (prevYear.start||0);
  }
  DB.years[yearStr] = {start,days,cardEntries};
}

function sincronizarDiarioConFijos(){
  const years = fijosYears().filter(y=>y>FIJOS_REF_YEAR && DB.years[String(y)]).sort((a,b)=>a-b);
  years.forEach(year=>generarAnoDesdePlantilla(year));
}

function generarTodosLosAnosProyectados(){
  const years = fijosYears().filter(y=>y>FIJOS_REF_YEAR).sort((a,b)=>a-b);
  if(!years.length){ toast(`No hay años posteriores a ${FIJOS_REF_YEAR} configurados en el Master`); return; }
  const yaConDatos = years.filter(y=>{ const yd=DB.years[String(y)]; return yd && ((yd.days&&yd.days.length)||(yd.cardEntries&&yd.cardEntries.length)); });
  if(yaConDatos.length){
    if(!confirm(`Los años ${yaConDatos.join(', ')} ya tienen movimientos. ¿Regenerar todos (${years.join(', ')}) desde MASTER? Los movimientos manuales se conservarán y los meses ya cerrados no cambiarán.`)) return;
  }
  years.forEach(year=>generarAnoDesdePlantilla(year));
  ui.year = String(years[0]||FIJOS_REF_YEAR+1);
  saveDB(); renderAll();
  toast(`Generados desde MASTER: ${years.join(', ')}`);
}

function ipcRateFor(tipo){
  const cfg = DB.ipc || { gastos:2, ingresos:0.5 };
  if(tipo==='ingreso') return Number(cfg.ingresos)||0;
  if(tipo==='puntual') return 0;
  return Number(cfg.gastos)||0; // gasto y vacaciones usan el IPC de gastos
}
// Recalcula en cascada los años POSTERIORES a fromYear, usando el valor de fromYear como base
function recomputeForwardFijo(item, fromYear){
  const rate = ipcRateFor(item.tipo);
  const years = fijosYears().filter(y=>y>fromYear).sort((a,b)=>a-b);
  let prev = Number(item.values[fromYear]);
  if(isNaN(prev)) return;
  years.forEach(y=>{
    prev = prev * (1 + rate/100);
    item.values[y] = Math.round(prev*100)/100;
  });
}
function ensureGroupsArr(){
  if(!DB.fijosGroups) DB.fijosGroups = [];
  return DB.fijosGroups;
}
function sortedGroups(){
  return [...ensureGroupsArr()].sort((a,b)=> a.name.localeCompare(b.name, 'es'));
}
function moveFijoGroup(id, dir){
  const arr = ensureGroupsArr();
  const idx = arr.findIndex(g=>g.id===id);
  if(idx<0) return;
  const newIdx = idx+dir;
  if(newIdx<0 || newIdx>=arr.length) return;
  const tmp = arr[idx]; arr[idx]=arr[newIdx]; arr[newIdx]=tmp;
  saveDB(); renderFijos();
}
function deleteFijoGroup(id){
  if(!confirm('¿Eliminar este grupo? Las partidas pasarán a "Sin grupo".')) return;
  DB.fijos.forEach(f=>{ if(f.groupId===id) f.groupId=null; });
  DB.fijosGroups = ensureGroupsArr().filter(g=>g.id!==id);
  saveDB(); renderFijos();
}
// Elimina una columna de año entera de Gastos fijos (p.ej. una columna de
// referencia colada al importar, como 2025), borrando ese valor de todas
// las partidas. Si el año es el FIJOS_REF_YEAR o posterior, avisa de que
// afecta a la proyección con IPC.
function deleteFijosYear(year){
  const y = Number(year);
  const msg = y>=FIJOS_REF_YEAR
    ? `El año ${y} se usa como referencia/proyección de Gastos fijos. ¿Seguro que quieres eliminar esta columna?`
    : `¿Eliminar la columna ${y} de Gastos fijos? Se borrará ese importe en todas las partidas.`;
  if(!confirm(msg)) return;
  DB.fijos.forEach(f=>{ if(f.values) delete f.values[y]; });
  sincronizarDiarioConFijos();
  saveDB(); renderAll();
  toast(`Columna ${y} eliminada de Gastos fijos`);
}

function renderFijos(){
  const wrap = document.getElementById('fijosTableWrap');
  const years = fijosYears();
  if(!DB.fijos.length){
    wrap.innerHTML = emptyState('Sin gastos fijos','Importa la hoja "Gastos" del Excel o añade una partida.');
    return;
  }
  const groups = ensureGroupsArr();
  const groupsAz = sortedGroups();
  const totalCols = 3 + years.length + 1; // partida+tipo+grupo + años + borrar
  const head = years.map(y=>`<th class="num-cell">${y}${y>FIJOS_REF_YEAR?' *':''} <button class="icon-btn" data-del-year="${y}" title="Eliminar columna ${y}" style="font-size:11px;padding:1px 3px;">✕</button></th>`).join('');

  function rowHtml(f){
    const tipo = ['ingreso','vacaciones','puntual'].includes(f.tipo) ? f.tipo : 'gasto';
    const rowCls = tipo==='ingreso' ? 'fijos-row-ingreso' : 'fijos-row-gasto';
    const isMaster = f.source==='master';
    const lock = isMaster ? ' disabled title="Gestionado desde finanzas-master.xlsx"' : '';
    const cells = years.map(y=>`<td class="num-cell"><input class="row-input num mono" type="text" inputmode="decimal" data-year="${y}" value="${f.values && f.values[y]!==undefined ? fmt(f.values[y]) : ''}"${lock}></td>`).join('');
    return `<tr data-id="${f.id}" class="${rowCls}">
      <td><input class="row-input" type="text" value="${escapeHtml(f.name)}" data-field="name"${lock}></td>
      <td><select class="row-input" data-field="tipo"${lock}>
        <option value="gasto" ${tipo==='gasto'?'selected':''}>Gasto</option>
        <option value="ingreso" ${tipo==='ingreso'?'selected':''}>Ingreso</option>
        <option value="vacaciones" ${tipo==='vacaciones'?'selected':''}>Vacaciones</option>
        <option value="puntual" ${tipo==='puntual'?'selected':''}>Puntual</option>
      </select></td>
      <td><select class="row-input" data-field="groupId"${lock}>
        <option value="">Sin grupo</option>
        ${groupsAz.map(g=>`<option value="${g.id}" ${f.groupId===g.id?'selected':''}>${escapeHtml(g.name)}</option>`).join('')}
      </select></td>
      ${cells}
      <td style="width:30px"><button class="icon-btn" data-del="${f.id}">✕</button></td>
    </tr>`;
  }
  function groupHeaderHtml(g, idx){
    return `<tr class="fijos-group-row">
      <td colspan="${totalCols}">
        <div class="fijos-group-inner">
          <span class="fijos-group-actions">
            <button class="icon-btn" data-group-up="${g.id}" title="Subir grupo" ${idx===0?'disabled':''}>▲</button>
            <button class="icon-btn" data-group-down="${g.id}" title="Bajar grupo" ${idx===groups.length-1?'disabled':''}>▼</button>
            <button class="icon-btn" data-group-del="${g.id}" title="Eliminar grupo">✕</button>
          </span>
          <input class="fijos-group-name-input" type="text" value="${escapeHtml(g.name)}" data-group-rename="${g.id}">
        </div>
      </td>
    </tr>`;
  }

  let bodyHtml = '';
  groups.forEach((g,idx)=>{
    const items = DB.fijos.filter(f=>f.groupId===g.id);
    bodyHtml += groupHeaderHtml(g, idx);
    bodyHtml += items.length
      ? items.map(rowHtml).join('')
      : `<tr class="fijos-group-empty"><td colspan="${totalCols}">Sin partidas en este grupo.</td></tr>`;
  });
  const ungrouped = DB.fijos.filter(f=> !f.groupId || !groups.some(g=>g.id===f.groupId));
  if(ungrouped.length){
    if(groups.length) bodyHtml += `<tr class="fijos-group-row"><td colspan="${totalCols}"><span class="fijos-group-name-static">Sin grupo</span></td></tr>`;
    bodyHtml += ungrouped.map(rowHtml).join('');
  }

  const totalsGastos = years.map(y=>{
    const t = DB.fijos.filter(f=>f.tipo!=='ingreso').reduce((s,f)=> s + Number((f.values&&f.values[y])||0), 0);
    return `<td class="num-cell mono" style="font-weight:600">${fmt(t)} €</td>`;
  }).join('');
  const totalsIngresos = years.map(y=>{
    const t = DB.fijos.filter(f=>f.tipo==='ingreso').reduce((s,f)=> s + Number((f.values&&f.values[y])||0), 0);
    return `<td class="num-cell mono" style="font-weight:600">${fmt(t)} €</td>`;
  }).join('');
  const totalsNeto = years.map(y=>{
    const gastos = DB.fijos.filter(f=>f.tipo!=='ingreso').reduce((s,f)=> s + Number((f.values&&f.values[y])||0), 0);
    const ingresos = DB.fijos.filter(f=>f.tipo==='ingreso').reduce((s,f)=> s + Number((f.values&&f.values[y])||0), 0);
    const neto = ingresos - gastos;
    return `<td class="num-cell mono ${neto>=0?'amount-pos':'amount-neg'}" style="font-weight:700">${fmt(neto)} €</td>`;
  }).join('');
  wrap.innerHTML = `<table>
    <thead><tr><th>Partida</th><th>Tipo</th><th>Grupo</th>${head}<th></th></tr></thead>
    <tbody>${bodyHtml}<tr class="fijos-gap-row"><td colspan="${totalCols}"></td></tr></tbody>
    <tfoot>
      <tr class="fijos-total-gastos"><td style="font-weight:600">Total gastos<br><span style="font-weight:400;font-size:10.5px">(gasto+vac.+puntual)</span></td><td></td><td></td>${totalsGastos}<td></td></tr>
      <tr class="fijos-total-ingresos"><td style="font-weight:600">Total ingresos<br><span style="font-weight:400;font-size:10.5px">(ingreso)</span></td><td></td><td></td>${totalsIngresos}<td></td></tr>
      <tr class="fijos-total-neto"><td style="font-weight:700">Neto<br><span style="font-weight:400;font-size:10.5px">(ingresos − gastos)</span></td><td></td><td></td>${totalsNeto}<td></td></tr>
    </tfoot>
  </table>
  <div class="fijos-note">* Años proyectados automáticamente desde ${FIJOS_REF_YEAR} según el IPC de gastos/ingresos.</div>`;

  wrap.querySelectorAll('input[data-field="name"]').forEach(inp=>{
    inp.addEventListener('change', e=>{
      const id = e.target.closest('tr').getAttribute('data-id');
      const item = DB.fijos.find(x=>x.id===id);
      if(item){ item.name = e.target.value; saveDB(); }
    });
  });
  wrap.querySelectorAll('select[data-field="tipo"]').forEach(sel=>{
    sel.addEventListener('change', e=>{
      const id = e.target.closest('tr').getAttribute('data-id');
      const item = DB.fijos.find(x=>x.id===id);
      if(!item) return;
      item.tipo = e.target.value;
      recomputeForwardFijo(item, FIJOS_REF_YEAR);
      sincronizarDiarioConFijos();
      saveDB(); renderAll();
    });
  });
  wrap.querySelectorAll('select[data-field="groupId"]').forEach(sel=>{
    sel.addEventListener('change', e=>{
      const id = e.target.closest('tr').getAttribute('data-id');
      const item = DB.fijos.find(x=>x.id===id);
      if(!item) return;
      item.groupId = e.target.value || null;
      saveDB(); renderFijos();
    });
  });
  wrap.querySelectorAll('input[data-year]').forEach(inp=>{
    inp.addEventListener('change', e=>{
      const id = e.target.closest('tr').getAttribute('data-id');
      const item = DB.fijos.find(x=>x.id===id);
      if(!item) return;
      item.values = item.values||{};
      const y = Number(e.target.getAttribute('data-year'));
      item.values[y] = parseEsNumber(e.target.value);
      recomputeForwardFijo(item, y);
      sincronizarDiarioConFijos();
      saveDB();
      renderAll();
    });
  });
  wrap.querySelectorAll('button[data-del]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      if(!confirm('¿Eliminar esta partida?')) return;
      const id = e.target.getAttribute('data-del');
      DB.fijos = DB.fijos.filter(x=>x.id!==id);
      sincronizarDiarioConFijos();
      saveDB(); renderAll();
    });
  });
  wrap.querySelectorAll('button[data-del-year]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      deleteFijosYear(e.target.getAttribute('data-del-year'));
    });
  });
  wrap.querySelectorAll('input[data-group-rename]').forEach(inp=>{
    inp.addEventListener('change', e=>{
      const id = e.target.getAttribute('data-group-rename');
      const g = ensureGroupsArr().find(x=>x.id===id);
      if(!g) return;
      const nuevo = e.target.value.trim();
      if(!nuevo){ e.target.value = g.name; return; }
      g.name = nuevo;
      saveDB(); renderFijos();
    });
  });
  wrap.querySelectorAll('button[data-group-up]').forEach(btn=>{
    btn.addEventListener('click', e=> moveFijoGroup(e.target.getAttribute('data-group-up'), -1));
  });
  wrap.querySelectorAll('button[data-group-down]').forEach(btn=>{
    btn.addEventListener('click', e=> moveFijoGroup(e.target.getAttribute('data-group-down'), 1));
  });
  wrap.querySelectorAll('button[data-group-del]').forEach(btn=>{
    btn.addEventListener('click', e=> deleteFijoGroup(e.target.getAttribute('data-group-del')));
  });
}

// ============================================================
// MODALES
// ============================================================
function openModal(html, onOpen){
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalBackdrop').classList.add('active');
  if(onOpen) onOpen();
}
function closeModal(){
  document.getElementById('modalBackdrop').classList.remove('active');
}
document.getElementById('modalBackdrop').addEventListener('click', e=>{
  if(e.target.id==='modalBackdrop') closeModal();
});

function modalAddMovimiento(){
  const today = isoDate(new Date());
  const groups = sortedGroups();
  const fijoOptions = groups.map(g=>{
    const items = DB.fijos.filter(f=>f.groupId===g.id);
    if(!items.length) return '';
    return `<optgroup label="${escapeHtml(g.name)}">${items.map(f=>`<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}</optgroup>`;
  }).join('');
  const ungrouped = DB.fijos.filter(f=> !f.groupId || !groups.some(g=>g.id===f.groupId));
  const ungroupedOptions = ungrouped.length
    ? `<optgroup label="Sin grupo">${ungrouped.map(f=>`<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}</optgroup>`
    : '';
  openModal(`
    <h3>Nuevo movimiento</h3>
    <div class="field-row"><label>Fecha</label><input class="field" type="date" id="mFecha" value="${today}"></div>
    <div class="field-row"><label>Partida de Gastos fijos (opcional)</label>
      <select class="field" id="mFijoSelect">
        <option value="">— Concepto manual —</option>
        ${fijoOptions}${ungroupedOptions}
      </select>
    </div>
    <div class="field-row"><label>Concepto</label><input class="field" type="text" id="mConcepto" placeholder="Ej. Supermercado"></div>
    <div class="field-row"><label>Importe (negativo = gasto)</label><input class="field" type="number" step="0.01" id="mImporte" placeholder="-45.30"></div>
    <div class="modal-actions">
      <button class="btn ghost" id="mCancel">Cancelar</button>
      <button class="btn primary" id="mSave">Guardar</button>
    </div>
  `, ()=>{
    function aplicarFijo(){
      const id = document.getElementById('mFijoSelect').value;
      if(!id) return;
      const item = DB.fijos.find(f=>f.id===id);
      if(!item) return;
      document.getElementById('mConcepto').value = item.name;
      const fechaVal = document.getElementById('mFecha').value;
      const year = fechaVal ? new Date(fechaVal+'T00:00:00').getFullYear() : new Date().getFullYear();
      const val = item.values && item.values[year]!==undefined ? Number(item.values[year]) : null;
      if(val!==null){
        const signed = item.tipo==='ingreso' ? Math.abs(val) : -Math.abs(val);
        document.getElementById('mImporte').value = signed;
      } else {
        toast(`Esa partida no tiene importe para ${year}, revisa a mano`);
      }
    }
    document.getElementById('mFijoSelect').addEventListener('change', e=>{
      if(!e.target.value){
        document.getElementById('mConcepto').value = '';
        document.getElementById('mImporte').value = '';
        return;
      }
      aplicarFijo();
    });
    document.getElementById('mFecha').addEventListener('change', aplicarFijo);
    document.getElementById('mCancel').onclick = closeModal;
    document.getElementById('mSave').onclick = ()=>{
      const fecha = document.getElementById('mFecha').value;
      const concepto = document.getElementById('mConcepto').value.trim();
      const importe = Number(document.getElementById('mImporte').value);
      if(!fecha || !importe){ toast('Falta fecha o importe'); return; }
      const y = new Date(fecha+'T00:00:00').getFullYear();
      const yd = ensureYear(y);
      yd.days.push({id:uid(), date:fecha, concept:concepto, amount:importe});
      if(String(y)!==ui.year){ ui.year = String(y); }
      saveDB(); closeModal(); renderAll();
      toast('Movimiento añadido');
    };
  });
}

function modalAddCategoria(){
  openModal(`
    <h3>Nuevo gasto de tarjeta</h3>
    <div class="field-row"><label>Mes</label>
      <select class="field" id="cMes">${MESES.map((m,i)=>`<option value="${i+1}" ${i+1===Number(ui.tarjMonth)?'selected':''}>${m}</option>`).join('')}</select>
    </div>
    <div class="field-row"><label>Categoría</label><input class="field" type="text" id="cCategoria" placeholder="Ej. Comida"></div>
    <div class="field-row"><label>Importe</label><input class="field" type="number" step="0.01" id="cImporte" placeholder="45.30"></div>
    <div class="modal-actions">
      <button class="btn ghost" id="cCancel">Cancelar</button>
      <button class="btn primary" id="cSave">Guardar</button>
    </div>
  `, ()=>{
    document.getElementById('cCancel').onclick = closeModal;
    document.getElementById('cSave').onclick = ()=>{
      const mes = Number(document.getElementById('cMes').value);
      const categoria = document.getElementById('cCategoria').value.trim();
      const importe = Number(document.getElementById('cImporte').value);
      if(!categoria || !importe){ toast('Falta categoría o importe'); return; }
      const yd = ensureYear(ui.year);
      yd.cardEntries.push({id:uid(), month:mes, category:categoria, amount:importe});
      saveDB(); closeModal(); renderAll();
      toast('Gasto de tarjeta añadido');
    };
  });
}

function modalAddFijo(){
  const groups = sortedGroups();
  openModal(`
    <h3>Nueva partida fija</h3>
    <div class="field-row"><label>Nombre</label><input class="field" type="text" id="fNombre" placeholder="Ej. Gimnasio"></div>
    <div class="field-row"><label>Tipo</label>
      <select class="field" id="fTipo">
        <option value="gasto">Gasto</option>
        <option value="ingreso">Ingreso</option>
        <option value="vacaciones">Vacaciones</option>
        <option value="puntual">Puntual</option>
      </select>
    </div>
    <div class="field-row"><label>Grupo</label>
      <select class="field" id="fGrupo">
        <option value="">Sin grupo</option>
        ${groups.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('')}
        <option value="__new__">+ Nuevo grupo…</option>
      </select>
    </div>
    <div class="field-row" id="fGrupoNuevoRow" style="display:none"><label>Nombre del grupo nuevo</label><input class="field" type="text" id="fGrupoNuevo" placeholder="Ej. Casa"></div>
    <div class="field-row"><label>Importe en ${FIJOS_REF_YEAR} (año de referencia)</label><input class="field" type="number" step="0.01" id="fImporte" placeholder="30"></div>
    <div class="modal-actions">
      <button class="btn ghost" id="fCancel">Cancelar</button>
      <button class="btn primary" id="fSave">Guardar</button>
    </div>
  `, ()=>{
    document.getElementById('fGrupo').addEventListener('change', e=>{
      document.getElementById('fGrupoNuevoRow').style.display = e.target.value==='__new__' ? '' : 'none';
    });
    document.getElementById('fCancel').onclick = closeModal;
    document.getElementById('fSave').onclick = ()=>{
      const nombre = document.getElementById('fNombre').value.trim();
      const tipo = document.getElementById('fTipo').value;
      const importe = Number(document.getElementById('fImporte').value)||0;
      const grupoSel = document.getElementById('fGrupo').value;
      if(!nombre){ toast('Falta el nombre'); return; }
      let groupId = null;
      if(grupoSel==='__new__'){
        const nuevoNombre = document.getElementById('fGrupoNuevo').value.trim();
        if(nuevoNombre){
          const g = {id:uid(), name:nuevoNombre};
          ensureGroupsArr().push(g);
          groupId = g.id;
        }
      } else if(grupoSel){
        groupId = grupoSel;
      }
      const item = { id:uid(), name:nombre, tipo, groupId, values:{} };
      item.values[FIJOS_REF_YEAR] = importe;
      recomputeForwardFijo(item, FIJOS_REF_YEAR);
      DB.fijos.push(item);
      sincronizarDiarioConFijos();
      saveDB(); closeModal(); renderAll();
      toast('Partida añadida');
    };
  });
}

function modalAddGroup(){
  openModal(`
    <h3>Nuevo grupo</h3>
    <div class="field-row"><label>Nombre</label><input class="field" type="text" id="gNombre" placeholder="Ej. Casa"></div>
    <div class="modal-actions">
      <button class="btn ghost" id="gCancel">Cancelar</button>
      <button class="btn primary" id="gSave">Crear</button>
    </div>
  `, ()=>{
    document.getElementById('gCancel').onclick = closeModal;
    document.getElementById('gSave').onclick = ()=>{
      const nombre = document.getElementById('gNombre').value.trim();
      if(!nombre){ toast('Falta el nombre'); return; }
      ensureGroupsArr().push({id:uid(), name:nombre});
      saveDB(); closeModal(); renderFijos();
      toast('Grupo creado');
    };
  });
}

function modalIPC(){
  const cfg = DB.ipc || { gastos:2, ingresos:0.5 };
  openModal(`
    <h3>IPC de proyección</h3>
    <div class="field-row"><label>IPC Gastos (%)</label><input class="field" type="number" step="0.1" id="ipcGastos" value="${cfg.gastos}"></div>
    <div class="field-row"><label>IPC Ingresos (%)</label><input class="field" type="number" step="0.1" id="ipcIngresos" value="${cfg.ingresos}"></div>
    <div style="font-size:12px;color:var(--ink-soft);margin-top:-4px;margin-bottom:4px;">Se aplica cada año a partir de ${FIJOS_REF_YEAR}, sobre el valor del año anterior.</div>
    <div class="modal-actions">
      <button class="btn ghost" id="ipcCancel">Cancelar</button>
      <button class="btn primary" id="ipcSave">Guardar</button>
    </div>
  `, ()=>{
    document.getElementById('ipcCancel').onclick = closeModal;
    document.getElementById('ipcSave').onclick = ()=>{
      const g = Number(document.getElementById('ipcGastos').value);
      const i = Number(document.getElementById('ipcIngresos').value);
      DB.ipc = { gastos: isNaN(g)?2:g, ingresos: isNaN(i)?0.5:i };
      DB.fijos.forEach(item=> recomputeForwardFijo(item, FIJOS_REF_YEAR));
      sincronizarDiarioConFijos();
      saveDB(); closeModal(); renderAll();
      toast('IPC actualizado');
    };
  });
}

// ============================================================
// GENERAR AÑO DESDE PLANTILLA (estructura fija de conceptos/días
// y bloques de tarjeta, tomada de un Excel de referencia; los
// importes siempre se recalculan en vivo desde Gastos Fijos)
// ============================================================

// ---- Utilidades de emparejamiento de nombres con Gastos Fijos ----
function normalizeName(s){
  return String(s||'').trim().toLowerCase();
}
function stripMonthSuffix(name){
  const parts = String(name||'').trim().split(/\s+/);
  if(parts.length>=2){
    const last = parts[parts.length-1].toLowerCase();
    if(MES_ABR_LOWER.includes(last)){
      return parts.slice(0,-1).join(' ');
    }
  }
  return null;
}
// Busca en DB.fijos una partida cuyo nombre coincida (exacto, o el nombre
// sin el sufijo de mes, p.ej. "Nom Ene" -> "Nom" -> alias "Nómina").
// Si no encuentra nada, devuelve null (=> importe 0).
function findFijoMatch(rawName){
  const norm = normalizeName(rawName);
  let item = DB.fijos.find(f=> normalizeName(f.name)===norm);
  if(item) return item;
  const base = stripMonthSuffix(rawName);
  if(base){
    const baseNorm = normalizeName(base);
    const aliased = CONCEPT_ALIASES[baseNorm] || baseNorm;
    item = DB.fijos.find(f=> normalizeName(f.name)===aliased);
    if(item) return item;
  }
  return null;
}
// Importe con signo para el Diario: ingreso => positivo, resto => negativo
// (misma convención que ya usa el modal "Nuevo movimiento").
function fijoAmountForYear(item, year){
  if(!item || !item.values) return 0;
  const val = Number(item.values[year]);
  if(isNaN(val)) return 0;
  return item.tipo==='ingreso' ? Math.abs(val) : -Math.abs(val);
}
// Importe sin signo para bloques de Tarjeta (siempre magnitud de gasto).
function fijoMagnitudeForYear(item, year){
  if(!item || !item.values) return 0;
  const val = Number(item.values[year]);
  if(isNaN(val)) return 0;
  return Math.abs(val);
}

const PLANTILLA_2027_DIAS = [{"date": "2027-01-02", "concept": "ING"}, {"date": "2027-01-03", "concept": "ING"}, {"date": "2027-01-04", "concept": "Limpieza"}, {"date": "2027-01-05", "concept": "Tele"}, {"date": "2027-01-06", "concept": "Móvil"}, {"date": "2027-01-07", "concept": "Casa Mad"}, {"date": "2027-01-08", "concept": "Pádel"}, {"date": "2027-01-11", "concept": "Regalo Navidad"}, {"date": "2027-01-19", "concept": "Spotify"}, {"date": "2027-01-21", "concept": "Seguro Madrid"}, {"date": "2027-01-25", "concept": "Luz"}, {"date": "2027-01-26", "concept": "Gas"}, {"date": "2027-01-27", "concept": "Bonus"}, {"date": "2027-01-28", "concept": "Nom Ene"}, {"date": "2027-02-01", "concept": "ING"}, {"date": "2027-02-02", "concept": "Casa Mad"}, {"date": "2027-02-03", "concept": "Móvil"}, {"date": "2027-02-04", "concept": "Limpieza"}, {"date": "2027-02-05", "concept": "Pádel"}, {"date": "2027-02-12", "concept": "Cumple Niños"}, {"date": "2027-02-20", "concept": "Seguro Madrid"}, {"date": "2027-02-22", "concept": "Luz"}, {"date": "2027-02-23", "concept": "Agua"}, {"date": "2027-02-26", "concept": "Nom Feb"}, {"date": "2027-03-01", "concept": "ING"}, {"date": "2027-03-02", "concept": "Casa Mad"}, {"date": "2027-03-03", "concept": "Móvil"}, {"date": "2027-03-04", "concept": "Limpieza"}, {"date": "2027-03-05", "concept": "Pádel"}, {"date": "2027-03-11", "concept": "Cumple Niños"}, {"date": "2027-03-14", "concept": "Extra Mar"}, {"date": "2027-03-22", "concept": "Seguro Madrid"}, {"date": "2027-03-25", "concept": "Luz"}, {"date": "2027-03-26", "concept": "Gas"}, {"date": "2027-03-29", "concept": "Nom Mar"}, {"date": "2027-03-31", "concept": "ING"}, {"date": "2027-04-01", "concept": "Tele"}, {"date": "2027-04-03", "concept": "Casa Mad"}, {"date": "2027-04-04", "concept": "Móvil"}, {"date": "2027-04-05", "concept": "Limpieza"}, {"date": "2027-04-07", "concept": "Pádel"}, {"date": "2027-04-23", "concept": "Seguro Madrid"}, {"date": "2027-04-25", "concept": "Luz"}, {"date": "2027-04-26", "concept": "Agua"}, {"date": "2027-04-28", "concept": "Nom Abr"}, {"date": "2027-05-01", "concept": "ING"}, {"date": "2027-05-03", "concept": "Casa Mad"}, {"date": "2027-05-04", "concept": "Móvil"}, {"date": "2027-05-05", "concept": "Limpieza"}, {"date": "2027-05-06", "concept": "Pádel"}, {"date": "2027-05-21", "concept": "Seguro Madrid"}, {"date": "2027-05-26", "concept": "Luz"}, {"date": "2027-05-27", "concept": "Gas"}, {"date": "2027-05-30", "concept": "Nom May"}, {"date": "2027-06-02", "concept": "ING"}, {"date": "2027-06-03", "concept": "Casa Mad"}, {"date": "2027-06-04", "concept": "Móvil"}, {"date": "2027-06-05", "concept": "Limpieza"}, {"date": "2027-06-06", "concept": "Pádel"}, {"date": "2027-06-16", "concept": "Extra Jun"}, {"date": "2027-06-21", "concept": "Seguro Madrid"}, {"date": "2027-06-25", "concept": "Luz"}, {"date": "2027-06-26", "concept": "Agua"}, {"date": "2027-06-28", "concept": "Nom Jun"}, {"date": "2027-06-30", "concept": "ING"}, {"date": "2027-07-01", "concept": "Tele"}, {"date": "2027-07-02", "concept": "Casa Mad"}, {"date": "2027-07-03", "concept": "Móvil"}, {"date": "2027-07-04", "concept": "Limpieza"}, {"date": "2027-07-05", "concept": "ING"}, {"date": "2027-07-09", "concept": "Pádel"}, {"date": "2027-07-24", "concept": "Seguro Madrid"}, {"date": "2027-07-26", "concept": "Luz"}, {"date": "2027-07-27", "concept": "Gas"}, {"date": "2027-07-29", "concept": "Nom Jul"}, {"date": "2027-08-01", "concept": "ING"}, {"date": "2027-08-02", "concept": "Casa Mad"}, {"date": "2027-08-03", "concept": "Móvil"}, {"date": "2027-08-04", "concept": "Limpieza"}, {"date": "2027-08-21", "concept": "Seguro Madrid"}, {"date": "2027-08-26", "concept": "Luz"}, {"date": "2027-08-27", "concept": "Agua"}, {"date": "2027-08-29", "concept": "Nom Ago"}, {"date": "2027-09-01", "concept": "ING"}, {"date": "2027-09-02", "concept": "Casa Mad"}, {"date": "2027-09-03", "concept": "Móvil"}, {"date": "2027-09-04", "concept": "Limpieza"}, {"date": "2027-09-08", "concept": "Pádel"}, {"date": "2027-09-14", "concept": "Cumple Niños"}, {"date": "2027-09-21", "concept": "Seguro Madrid"}, {"date": "2027-09-24", "concept": "Luz"}, {"date": "2027-09-25", "concept": "Gas"}, {"date": "2027-09-27", "concept": "Nom Sep"}, {"date": "2027-09-30", "concept": "ING"}, {"date": "2027-10-02", "concept": "Casa Mad"}, {"date": "2027-10-03", "concept": "Móvil"}, {"date": "2027-10-04", "concept": "Limpieza"}, {"date": "2027-10-05", "concept": "Tele"}, {"date": "2027-10-06", "concept": "Pádel"}, {"date": "2027-10-22", "concept": "Seguro Madrid"}, {"date": "2027-10-26", "concept": "Luz"}, {"date": "2027-10-27", "concept": "Agua"}, {"date": "2027-10-29", "concept": "Nom Oct"}, {"date": "2027-10-31", "concept": "ING"}, {"date": "2027-11-02", "concept": "Casa Mad"}, {"date": "2027-11-03", "concept": "Móvil"}, {"date": "2027-11-04", "concept": "Limpieza"}, {"date": "2027-11-06", "concept": "Pádel"}, {"date": "2027-11-17", "concept": "Cumple Niños"}, {"date": "2027-11-22", "concept": "Seguro Madrid"}, {"date": "2027-11-23", "concept": "Luz"}, {"date": "2027-11-24", "concept": "Gas"}, {"date": "2027-11-28", "concept": "Nom Nov"}, {"date": "2027-12-02", "concept": "Casa Mad"}, {"date": "2027-12-03", "concept": "Móvil"}, {"date": "2027-12-04", "concept": "ING"}, {"date": "2027-12-05", "concept": "Limpieza"}, {"date": "2027-12-06", "concept": "Pádel"}, {"date": "2027-12-17", "concept": "Extra Dic"}, {"date": "2027-12-21", "concept": "Seguro Madrid"}, {"date": "2027-12-22", "concept": "Luz"}, {"date": "2027-12-23", "concept": "Agua"}, {"date": "2027-12-27", "concept": "Nom Dic"}];
const PLANTILLA_2027_TARJETA = [{"month": 1, "category": "Gastos"}, {"month": 1, "category": "Gasolina"}, {"month": 1, "category": "Cloud Apple"}, {"month": 1, "category": "Farmacia"}, {"month": 1, "category": "Otros"}, {"month": 1, "category": "Fin de año"}, {"month": 1, "category": "Peluquería"}, {"month": 1, "category": "Gym"}, {"month": 1, "category": "Trabajo"}, {"month": 1, "category": "Dentista"}, {"month": 1, "category": "Carrefour"}, {"month": 1, "category": "Fijos"}, {"month": 1, "category": "Cepsa"}, {"month": 2, "category": "Gastos"}, {"month": 2, "category": "Gasolina"}, {"month": 2, "category": "Cloud Apple"}, {"month": 2, "category": "Farmacia"}, {"month": 2, "category": "Otros"}, {"month": 2, "category": "Sky"}, {"month": 2, "category": "Peluquería"}, {"month": 2, "category": "Gym"}, {"month": 2, "category": "Trabajo"}, {"month": 2, "category": "Dentista"}, {"month": 2, "category": "Carrefour"}, {"month": 2, "category": "Fijos"}, {"month": 2, "category": "Cepsa"}, {"month": 3, "category": "Gastos"}, {"month": 3, "category": "Gasolina"}, {"month": 3, "category": "Cloud Apple"}, {"month": 3, "category": "Farmacia"}, {"month": 3, "category": "Peluquería"}, {"month": 3, "category": "Otros"}, {"month": 3, "category": "Gym"}, {"month": 3, "category": "Trabajo"}, {"month": 3, "category": "Dentista"}, {"month": 3, "category": "Carrefour"}, {"month": 3, "category": "Fijos"}, {"month": 3, "category": "Cepsa"}, {"month": 4, "category": "Gastos"}, {"month": 4, "category": "Gasolina"}, {"month": 4, "category": "Cloud Apple"}, {"month": 4, "category": "Farmacia"}, {"month": 4, "category": "Otros"}, {"month": 4, "category": "SemSanta"}, {"month": 4, "category": "Peluquería"}, {"month": 4, "category": "Gym"}, {"month": 4, "category": "Trabajo"}, {"month": 4, "category": "Dentista"}, {"month": 4, "category": "Carrefour"}, {"month": 4, "category": "Fijos"}, {"month": 4, "category": "Cepsa"}, {"month": 5, "category": "Gastos"}, {"month": 5, "category": "Gasolina"}, {"month": 5, "category": "Cloud Apple"}, {"month": 5, "category": "Otros"}, {"month": 5, "category": "Numerito"}, {"month": 5, "category": "Peluquería"}, {"month": 5, "category": "Cloud"}, {"month": 5, "category": "Trabajo"}, {"month": 5, "category": "Gym"}, {"month": 5, "category": "Farmacia"}, {"month": 5, "category": "Dentista"}, {"month": 5, "category": "Carrefour"}, {"month": 5, "category": "Fijos"}, {"month": 5, "category": "Cepsa"}, {"month": 6, "category": "Gastos"}, {"month": 6, "category": "Gasolina"}, {"month": 6, "category": "Cloud Apple"}, {"month": 6, "category": "Farmacia"}, {"month": 6, "category": "Peluquería"}, {"month": 6, "category": "Otros"}, {"month": 6, "category": "Gym"}, {"month": 6, "category": "Trabajo"}, {"month": 6, "category": "Dentista"}, {"month": 6, "category": "Carrefour"}, {"month": 6, "category": "Fijos"}, {"month": 6, "category": "Cepsa"}, {"month": 7, "category": "Gastos"}, {"month": 7, "category": "Gasolina"}, {"month": 7, "category": "Cloud Apple"}, {"month": 7, "category": "Otros"}, {"month": 7, "category": "YouTube"}, {"month": 7, "category": "Peluquería"}, {"month": 7, "category": "Verano 1"}, {"month": 7, "category": "Trabajo"}, {"month": 7, "category": "Gym"}, {"month": 7, "category": "Farmacia"}, {"month": 7, "category": "Dentista"}, {"month": 7, "category": "Carrefour"}, {"month": 7, "category": "Fijos"}, {"month": 7, "category": "Cepsa"}, {"month": 8, "category": "Gastos"}, {"month": 8, "category": "Gasolina"}, {"month": 8, "category": "Cloud Apple"}, {"month": 8, "category": "Farmacia"}, {"month": 8, "category": "Otros"}, {"month": 8, "category": "Seguro"}, {"month": 8, "category": "Peluquería"}, {"month": 8, "category": "Gym"}, {"month": 8, "category": "Trabajo"}, {"month": 8, "category": "Dentista"}, {"month": 8, "category": "Carrefour"}, {"month": 8, "category": "Fijos"}, {"month": 8, "category": "Cepsa"}, {"month": 9, "category": "Gastos"}, {"month": 9, "category": "Gasolina"}, {"month": 9, "category": "Cloud Apple"}, {"month": 9, "category": "Otros"}, {"month": 9, "category": "Revisión"}, {"month": 9, "category": "Peluquería"}, {"month": 9, "category": "Verano 2"}, {"month": 9, "category": "Trabajo"}, {"month": 9, "category": "Gym"}, {"month": 9, "category": "Farmacia"}, {"month": 9, "category": "Dentista"}, {"month": 9, "category": "Carrefour"}, {"month": 9, "category": "Fijos"}, {"month": 9, "category": "Cepsa"}, {"month": 10, "category": "Gastos"}, {"month": 10, "category": "Gasolina"}, {"month": 10, "category": "Cloud Apple"}, {"month": 10, "category": "Farmacia"}, {"month": 10, "category": "Peluquería"}, {"month": 10, "category": "Otros"}, {"month": 10, "category": "Gym"}, {"month": 10, "category": "Trabajo"}, {"month": 10, "category": "Dentista"}, {"month": 10, "category": "Carrefour"}, {"month": 10, "category": "Fijos"}, {"month": 10, "category": "Cepsa"}, {"month": 11, "category": "Gastos"}, {"month": 11, "category": "Gasolina"}, {"month": 11, "category": "Cloud Apple"}, {"month": 11, "category": "Farmacia"}, {"month": 11, "category": "Peluquería"}, {"month": 11, "category": "Otros"}, {"month": 11, "category": "Lotería"}, {"month": 11, "category": "Trabajo"}, {"month": 11, "category": "Gym"}, {"month": 11, "category": "Carrefour"}, {"month": 11, "category": "Fijos"}, {"month": 11, "category": "Cepsa"}, {"month": 12, "category": "Gastos"}, {"month": 12, "category": "Gasolina"}, {"month": 12, "category": "Cloud Apple"}, {"month": 12, "category": "Farmacia"}, {"month": 12, "category": "Peluquería"}, {"month": 12, "category": "Otros"}, {"month": 12, "category": "Fin de Año"}, {"month": 12, "category": "Trabajo"}, {"month": 12, "category": "Gym"}, {"month": 12, "category": "Carrefour"}, {"month": 12, "category": "Fijos"}, {"month": 12, "category": "Cepsa"}, {"month": 12, "category": "Salir"}, {"month": 12, "category": "Gasolina"}];

// Genera UN año completo a partir de la plantilla (basada originalmente en
// 2027, se reutiliza el patrón día-del-mes/mes para cualquier año): conceptos
// y días desde la plantilla, importes siempre recalculados en vivo desde
// Gastos Fijos (DB.fijos) para ESE año concreto. Si un concepto/categoría no
// tiene una partida con el mismo nombre en Gastos Fijos, su importe queda a 0.
// Los cierres "Tarjetas <Mes>" se calculan como el cierre real de tarjeta de
// ese mes (igual que el botón "Cerrar mes (tarjeta)").
// El saldo inicial (start) se encadena con el saldo final (31 dic) del año
// anterior, si existe en DB.years — así el conjunto funciona como un
// acumulado real año a año.
//
// Los movimientos ya PASADOS (fecha anterior a hoy) nunca se recalculan al
// volver a generar: se conservan tal cual estén guardados, aunque cambien los
// importes en Gastos Fijos. Solo se actualizan los movimientos futuros. Los
// movimientos manuales que no correspondan a ninguna línea de la plantilla
// (los que tú añadas a mano) también se conservan siempre, sean del pasado o
// del futuro.
function parseGastosSheet(rows){
  return parseMasterRows(rows);
}

async function loadMasterBuffer(buf, sourceLabel='MASTER'){
  const wb = XLSX.read(buf, {type:'array', cellDates:true});
  const masterName = wb.SheetNames.find(name=>/^master$/i.test(name.trim()));
  if(!masterName) throw new Error('No se encontró la hoja MASTER');
  const ws = wb.Sheets[masterName];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
  const items = parseMasterRows(rows);
  if(!items.length) throw new Error('La hoja MASTER no contiene partidas válidas');
  installMasterItems(items);
  // Recalcula automáticamente los años 2027+ que ya existían.
  sincronizarDiarioConFijos();
  saveDB();
  renderAll();
  setMasterStatus(`MASTER actualizado · ${items.length} partidas`, true);
  return items.length;
}

async function cargarMasterAutomatico(){
  setMasterStatus('Cargando MASTER…');
  try{
    const res = await fetch(MASTER_URL + MASTER_REFRESH_PARAM(), {cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const count = await loadMasterBuffer(buf,'GitHub');
    if(!DB.years[String(FIJOS_REF_YEAR+1)] && count){
      // No crea años automáticamente para no alterar el flujo del usuario;
      // el botón Generar años proyectados sigue siendo explícito.
    }
  }catch(err){
    console.warn('No se pudo cargar MASTER automáticamente:', err);
    setMasterStatus('MASTER no disponible · usa «Importar Excel»', false);
  }
}

document.getElementById('importFile').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    const buf = await file.arrayBuffer();
    const count = await loadMasterBuffer(buf,'archivo');
    toast(`MASTER importado: ${count} partidas`);
  }catch(err){
    console.error(err);
    setMasterStatus('No se pudo leer MASTER', false);
    toast('No se pudo leer la hoja MASTER');
  }finally{
    e.target.value='';
  }
});


document.getElementById('importFile').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array', cellDates:true});
    let importedYears = 0, importedFijos = 0;
    wb.SheetNames.forEach(name=>{
      if(/^\d{4}$/.test(name.trim())){
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
        const parsed = parseYearSheet(rows, parseInt(name,10));
        DB.years[name] = parsed;
        importedYears++;
        ui.year = name;
      } else if(/^gastos$/i.test(name.trim())){
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
        const items = parseGastosSheet(rows);
        if(items.length){ DB.fijos = items; importedFijos = items.length; }
      }
    });
    // Si solo se ha importado la hoja "Gastos" (sin hojas de año), se
    // sincronizan los años ya generados con los nuevos importes/IPC.
    if(importedFijos>0 && importedYears===0){
      sincronizarDiarioConFijos();
    }
    saveDB();
    renderAll();
    toast(`Importado: ${importedYears} año(s), ${importedFijos} partida(s) fijas`);
  }catch(err){
    console.error(err);
    toast('No se pudo leer el archivo');
  }
  e.target.value = '';
});

document.getElementById('btnExport').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(DB,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `diario-gastos-backup-${isoDate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ============================================================
// EVENTOS UI
// ============================================================
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-'+btn.dataset.view).classList.add('active');
  });
});
document.getElementById('yearSelect').addEventListener('change', e=>{
  ui.year = e.target.value; renderAll();
});
document.getElementById('btnGenerarProyeccion').addEventListener('click', generarTodosLosAnosProyectados);
document.getElementById('btnSyncMaster').addEventListener('click', cargarMasterAutomatico);
document.getElementById('btnAddMov').addEventListener('click', modalAddMovimiento);
document.getElementById('btnAddCat').addEventListener('click', modalAddCategoria);
document.getElementById('btnAddFijo').addEventListener('click', modalAddFijo);
document.getElementById('btnAddGroup').addEventListener('click', modalAddGroup);
document.getElementById('btnIPC').addEventListener('click', modalIPC);
document.getElementById('monthFilter').addEventListener('change', e=>{
  ui.monthFilterDiario = e.target.value; renderDiario();
});
document.getElementById('tarjMonthSelect').addEventListener('change', e=>{
  ui.tarjMonth = Number(e.target.value); renderTarjeta();
});
document.getElementById('btnCerrarMes').addEventListener('click', ()=>{
  if(!ui.year){ toast('Selecciona un año'); return; }
  const m = ui.monthFilterDiario==='todos' ? (new Date().getMonth()+1) : Number(ui.monthFilterDiario);
  const yd = ensureYear(ui.year);
  const catEntries = yd.cardEntries.filter(c=>Number(c.month)===m);
  if(!catEntries.length){ toast('No hay gastos de tarjeta ese mes'); return; }
  const total = catEntries.reduce((s,c)=>s+Number(c.amount||0),0);
  const concept = `Tarjetas ${MESES_ABR[m-1]}`;
  const lastDay = new Date(Number(ui.year), m, 0); // last day of month
  const dateIso = isoDate(lastDay);
  let existing = yd.days.find(d=> d.concept===concept);
  if(existing){ existing.amount = -total; existing.date = dateIso; }
  else{ yd.days.push({id:uid(), date:dateIso, concept, amount:-total}); }
  saveDB(); renderAll();
  toast(`Mes cerrado: −${fmt(total)} € en tarjeta`);
});

function setMasterStatus(msg, ok=null){
  const el=document.getElementById('masterStatus');
  if(!el) return;
  el.textContent=msg;
  el.style.color = ok===false ? 'var(--neg)' : (ok===true ? 'var(--pos)' : 'var(--ink-soft)');
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll(){
  populateYearSelect();
  populateMonthFilter();
  populateTarjMonthSelect();
  renderTicker();
  renderResumen();
  renderDiario();
  renderTarjeta();
  renderFijos();
}
renderAll();
cargarMasterAutomatico();
