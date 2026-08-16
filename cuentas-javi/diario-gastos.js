/* ============================================================
   Diario de Gastos — lógica de datos y render
   ============================================================ */

const STORAGE_KEY = 'diarioGastosDB_v1';
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_ABR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const FIJOS_REF_YEAR = 2026; // año de referencia del MASTER
const MASTER_URLS = ['../excel/finanzas-master.xlsx','./excel/finanzas-master.xlsx'];
const BOOTSTRAP_2026_URLS = ['../excel/2026.xlsx','./excel/2026.xlsx'];
const BOOTSTRAP_2027_URLS = ['../excel/2027.xlsx','./excel/2027.xlsx'];
const BOOTSTRAP_VERSION = 3;
const MASTER_MAX_YEAR = 2040; // horizonte visible/proyectable desde el año base
const MASTER_REFRESH_PARAM = () => `?v=${Date.now()}`;
const MES_ABR_LOWER = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const CONCEPT_ALIASES = { 'nom': 'nómina' }; // compatibilidad con plantillas antiguas
const MASTER_FREQUENCIES = new Set(['mensual','anual','semanal']);

// Gist central del dashboard. El ID es público; el token NUNCA se incluye en el JSON.
const GIST_ID = 'bcb12de9d4e6b476062a8d13a676532f';
const GIST_FILE = 'diario-gastos.json';
const GIST_API_URL = `https://api.github.com/gists/${GIST_ID}`;
const GIST_API_VERSION = '2026-03-10';
const GIST_TIMEOUT_MS = 12000;
const GIST_TOKEN_SESSION_KEY = 'diarioGastos_gistToken_session';
const GIST_TOKEN_LOCAL_KEY = 'diarioGastos_gistToken_local';
const GIST_REMEMBER_KEY = 'diarioGastos_gistToken_remember';

const gistSync = {
  ready: false,
  suppress: false,
  token: null,
  rememberToken: false,
  timer: null,
  syncing: false,
  remoteUpdatedAt: null,
  lastStatus: null
};

let DB = loadDB();
let TEMPLATE_2027 = DB.template2027 || null;
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
      if(!('bootstrap' in db)) db.bootstrap = {version:0};
      if(!('template2027' in db)) db.template2027 = null;
      if(!('masterLoaded' in db)) db.masterLoaded = false;
      return db;
    }
  }catch(e){ console.error('Error leyendo almacenamiento', e); }
  return { years:{}, template2027:null, bootstrap:{version:0}, masterLoaded:false, fijos:[], ipc:{ gastos:2, ingresos:0.5 }, fijosGroups:[] };
}
function saveDB(options={}){
  const shouldSync = options.sync !== false;
  if(gistSync.ready && shouldSync && !gistSync.suppress){
    DB.updatedAt = new Date().toISOString();
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
  if(gistSync.ready && shouldSync && !gistSync.suppress){
    scheduleGistSync();
  }
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
  const isYearActual = Number(ui.year) === currentYear && Number(ui.year) !== FIJOS_REF_YEAR;
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

// ============================================================
// PLANTILLA 2027+ — estructura externa en excel/2027.xlsx
// La plantilla NO se embebe en HTML/JS ni se guarda como plantilla
// maestra en el JSON. Se carga desde el archivo Excel cuando hace falta.
// ============================================================
function normalizeTemplateKey(s){
  return normalizeName(String(s||'').trim());
}

function templateMasterAliases(concept, medium){
  const k = normalizeTemplateKey(concept);
  const aliases = [];
  if(medium==='cuenta'){
    if(/^nom/.test(k)) aliases.push(normalizeName('Nómina'));
    if(/^extra/.test(k)) aliases.push(normalizeName('Paga Extra'));
    if(k===normalizeName('Casa Mad')) aliases.push(normalizeName('Casa Madrid'));
    if(k===normalizeName('Regalo Navidad')) aliases.push(normalizeName('Regalo Navidad Niños'));
  }else if(medium==='tarjeta'){
    const map = {
      'cloudapple':'cloud',
      'semsanta':'semanasanta',
      'findeano':'finano',
      'seguro':'segurocoche',
      'revision':'revisioncoche',
      'numerito':'numeritocoche'
    };
    if(map[k]) aliases.push(map[k]);
  }
  return aliases;
}

function masterMatchesForTemplate(concept, medium){
  const exact = DB.fijos.filter(f=>f.source==='master' && f.activo && f.medio===medium && normalizeTemplateKey(f.name)===normalizeTemplateKey(concept));
  if(exact.length) return exact;
  const aliases = templateMasterAliases(concept, medium);
  for(const alias of aliases){
    const matches = DB.fijos.filter(f=>f.source==='master' && f.activo && f.medio===medium && normalizeTemplateKey(f.name)===alias);
    if(matches.length) return matches;
  }
  return [];
}

function templateMatchInfo(){
  const accountNames = Array.from(new Set((TEMPLATE_2027?.days||[]).map(x=>x.concept).filter(Boolean)));
  const accountInfo = accountNames.map(name=>({concept:name,matches:masterMatchesForTemplate(name,'cuenta')}));
  const cardNames = Array.from(new Set((TEMPLATE_2027?.cardEntries||[]).map(x=>x.category).filter(Boolean)));
  const cardInfo = cardNames.map(name=>({concept:name,matches:masterMatchesForTemplate(name,'tarjeta')}));
  return {accountInfo,cardInfo};
}

function setBootstrapStatus(msg, ok=null){
  const el=document.getElementById('bootstrapStatus');
  if(!el) return;
  el.textContent=msg;
  el.style.color = ok===false ? 'var(--neg)' : (ok===true ? 'var(--pos)' : 'var(--ink-soft)');
}

function bootstrapStateText(){
  const has2026 = !!(DB.years && DB.years[String(FIJOS_REF_YEAR)] && DB.years[String(FIJOS_REF_YEAR)].days?.length===365);
  const has2027 = !!(TEMPLATE_2027 && TEMPLATE_2027.days?.length===365);
  const hasMaster = !!DB.masterLoaded && Array.isArray(DB.fijos) && DB.fijos.some(f=>f.source==='master');
  return `Base: 2026 ${has2026?'✓':'—'} · estructura 2027 ${has2027?'✓':'—'} · MASTER ${hasMaster?'✓':'—'}`;
}

function templateDayKey(year, day, concept){
  return String(year)+String(day.date).slice(4)+'|'+String(concept||'');
}
function templateCardKey(month, category){
  return String(month)+'|'+normalizeTemplateKey(category);
}

function generarAnoDesdePlantilla(year){
  if(!TEMPLATE_2027) throw new Error('La plantilla 2027 no está cargada');
  const yearStr=String(year);
  const existing=DB.years[yearStr];
  const prevDays=existing?.days ? existing.days.slice() : [];
  const prevCard=existing?.cardEntries ? existing.cardEntries.slice() : [];
  const templateDayKeys=new Set(TEMPLATE_2027.days.map(t=>templateDayKey(year,t,t.concept)));
  const templateCardKeys=new Set(TEMPLATE_2027.cardEntries.map(c=>templateCardKey(c.month,c.category)));
  const manualDays=prevDays.filter(d=>!d.sourceTemplate2027&&!d.sourceMaster&&!templateDayKeys.has(d.date+'|'+String(d.concept||'')));
  const manualCard=prevCard.filter(c=>!c.sourceTemplate2027&&!c.sourceMaster&&!templateCardKeys.has(templateCardKey(c.month,c.category)));
  const prevDaysMap=new Map(prevDays.map(d=>[d.date+'|'+String(d.concept||''),d]));
  const prevCardMap=new Map(prevCard.map(c=>[templateCardKey(c.month,c.category),c]));
  const days=[];
  TEMPLATE_2027.days.forEach(t=>{
    const date=String(year)+String(t.date).slice(4);
    const key=date+'|'+String(t.concept||'');
    const prev=prevDaysMap.get(key);
    days.push({id:prev?.id||uid(),date,concept:t.concept||'',amount:0,sourceTemplate2027:true});
  });
  const cardEntries=[];
  TEMPLATE_2027.cardEntries.forEach(c=>{
    const prev=prevCardMap.get(templateCardKey(c.month,c.category));
    cardEntries.push({id:prev?.id||uid(),month:Number(c.month),category:c.category,amount:0,sourceTemplate2027:true});
  });
  days.push(...manualDays);
  cardEntries.push(...manualCard);
  let start=0;
  const prevYear=DB.years[String(year-1)];
  if(prevYear){
    const sorted=getSortedDays(year-1);
    start=sorted.length?sorted[sorted.length-1].balance:(prevYear.start||0);
  }
  DB.years[yearStr]={start,days,cardEntries};
}

function sincronizarDiarioConFijos(){
  // En esta fase el MASTER actualiza Gastos fijos, pero no rellena dinero en 2027+.
}

function generarTodosLosAnosProyectados(){
  if(!TEMPLATE_2027){ toast('Carga la plantilla 2027 primero'); return; }
  const years=fijosYears().filter(y=>y>FIJOS_REF_YEAR).sort((a,b)=>a-b);
  if(!years.length){ toast(`No hay años posteriores a ${FIJOS_REF_YEAR} configurados en el Master`); return; }
  years.forEach(year=>generarAnoDesdePlantilla(year));
  ui.year=String(years[0]);
  saveDB(); renderAll();
  toast(`Estructura generada: ${years.join(', ')}`);
}

function parseGastosSheet(rows){
  return parseMasterRows(rows);
}

function parseGastosSheet(rows){
  return parseMasterRows(rows);
}

function masterFingerprint(items){
  return JSON.stringify((items||[]).map(item=>({
    id:item.id,name:item.name,tipo:item.tipo,groupId:item.groupId,masterGroup:item.masterGroup,masterTipo:item.masterTipo,
    frecuencia:item.frecuencia,meses:item.meses,medio:item.medio,activo:item.activo,orden:item.orden,
    values:item.values
  })).sort((a,b)=>String(a.id).localeCompare(String(b.id))));
}

async function loadMasterBuffer(buf, sourceLabel='MASTER', options={}){
  const wb = XLSX.read(buf, {type:'array', cellDates:true});
  const masterName = wb.SheetNames.find(name=>/^master$/i.test(name.trim()));
  if(!masterName) throw new Error('No se encontró la hoja MASTER');
  const ws = wb.Sheets[masterName];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
  const items = parseMasterRows(rows);
  if(!items.length) throw new Error('La hoja MASTER no contiene partidas válidas');
  const current = (DB.fijos||[]).filter(f=>f.source==='master');
  const changed = masterFingerprint(items) !== masterFingerprint(current);
  if(changed){
    installMasterItems(items);
    DB.masterLoaded=true;
    if(options.syncStructure!==false) sincronizarDiarioConFijos();
    if(options.persist!==false){
      DB.updatedAt = new Date().toISOString();
      saveDB({sync: options.sync !== false});
    }
    if(options.render!==false) renderAll();
    setMasterStatus(`MASTER actualizado · ${items.length} partidas`, true);
  }else{
    DB.masterLoaded=true;
    setMasterStatus(`MASTER al día · ${items.length} partidas`, true);
  }
  setBootstrapStatus(bootstrapStateText(), true);
  return {count:items.length,changed};
}

// ============================================================
// IMPORTACIÓN 2026 / PLANTILLA 2027 SOLO PARA BOOTSTRAP INICIAL
// ============================================================
const CARD_2026_PAIRS = [[5,6],[8,9],[11,12]]; // F/G, I/J, L/M (0-indexed)

function merge2026CardEntries(rows){
  const monthStarts=[];
  rows.forEach((row,idx)=>{
    const v=row[5];
    if(typeof v==='string' && MESES.includes(v.trim())) monthStarts.push({row:idx,month:MESES.indexOf(v.trim())+1});
  });
  const agg=new Map();
  for(let i=0;i<monthStarts.length;i++){
    const start=monthStarts[i].row+1;
    const end=i+1<monthStarts.length?monthStarts[i+1].row:rows.length;
    const month=monthStarts[i].month;
    for(let r=start;r<end;r++){
      const row=rows[r]||[];
      for(const [nameCol,valCol] of CARD_2026_PAIRS){
        const rawName=row[nameCol], rawVal=row[valCol];
        if(rawName==null || String(rawName).trim()==='') continue;
        if(typeof rawVal!=='number' || !Number.isFinite(rawVal)) continue;
        const category=String(rawName).trim();
        const key=`${month}|${normalizeName(category)}`;
        const existing=agg.get(key);
        if(existing) existing.amount+=rawVal;
        else agg.set(key,{id:uid(),month,category,amount:rawVal});
      }
    }
  }
  return Array.from(agg.values());
}

function parse2026Sheet(rows){
  const days=[]; let start=0; let startFound=false;
  for(const row of rows){
    const d=row?.[0];
    if(!(d instanceof Date) || d.getFullYear()!==FIJOS_REF_YEAR) continue;
    const dateIso=isoDate(d);
    if(!startFound && typeof row?.[3]==='number'){ start=row[3]; startFound=true; }
    const concept=row?.[1]==null?'':String(row[1]).trim();
    const amount=typeof row?.[2]==='number' && Number.isFinite(row[2])?row[2]:0;
    days.push({id:uid(),date:dateIso,concept,amount,source:'2026-bootstrap'});
  }
  if(days.length!==365) throw new Error(`Se esperaban 365 días de 2026 y se han leído ${days.length}`);
  return {start,days,cardEntries:merge2026CardEntries(rows),source:'2026-bootstrap'};
}

async function read2026WorkbookBuffer(buf){
  const wb=XLSX.read(buf,{type:'array',cellDates:true});
  const sheetName=wb.SheetNames.find(name=>/^2026$/i.test(name.trim()))||wb.SheetNames[0];
  if(!sheetName) throw new Error('No se encontró la hoja de 2026');
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,raw:true,defval:null});
  return parse2026Sheet(rows);
}

function parse2027TemplateRows(rows){
  const days=[];
  for(const row of rows){
    const d=row?.[0];
    if(!(d instanceof Date) || d.getFullYear()!==2027) continue;
    days.push({date:isoDate(d),concept:row?.[1]==null?'':String(row[1]).trim()});
  }
  if(days.length!==365) throw new Error(`Se esperaban 365 días de 2027 y se han leído ${days.length}`);

  const agg=new Map();
  for(const row of rows){
    const d=row?.[0];
    if(!(d instanceof Date) || d.getFullYear()!==2027) continue;
    const month=d.getMonth()+1;
    for(const col of [5,7,9]){ // F, H, J
      const raw=row?.[col];
      if(raw==null || raw instanceof Date) continue;
      const category=String(raw).trim();
      if(!category || MESES.includes(category)) continue;
      const key=`${month}|${normalizeName(category)}`;
      if(!agg.has(key)) agg.set(key,{id:uid(),month,category,amount:0});
    }
  }
  return {year:2027,days,cardEntries:Array.from(agg.values()),source:'2027-bootstrap'};
}

async function read2027WorkbookBuffer(buf){
  const wb=XLSX.read(buf,{type:'array',cellDates:true});
  const sheetName=wb.SheetNames.find(name=>/^2027$/i.test(name.trim()))||wb.SheetNames[0];
  if(!sheetName) throw new Error('No se encontró la hoja de 2027');
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,raw:true,defval:null});
  return parse2027TemplateRows(rows);
}

async function fetchWorkbookFromCandidates(urls){
  let lastErr=null;
  for(const baseUrl of urls){
    try{
      const res=await fetch(baseUrl+MASTER_REFRESH_PARAM(),{cache:'no-store'});
      if(!res.ok){lastErr=new Error(`HTTP ${res.status} · ${baseUrl}`);continue;}
      return await res.arrayBuffer();
    }catch(err){lastErr=err;}
  }
  throw lastErr||new Error('No se pudo localizar el archivo');
}

async function cargarMasterAutomatico(){
  setMasterStatus('Cargando MASTER…');
  try{
    const buf=await fetchWorkbookFromCandidates(MASTER_URLS);
    await loadMasterBuffer(buf,'GitHub',{sync:true,persist:true,render:true});
    return true;
  }catch(err){
    console.warn('No se pudo cargar MASTER automáticamente:',err);
    setMasterStatus(`MASTER no disponible · ${err.message||'revisa la carpeta excel'}`,false);
    return false;
  }
}

function hasCompletedBootstrap(db){
  return !!(db && db.bootstrap && Number(db.bootstrap.version)>=BOOTSTRAP_VERSION
    && db.years && db.years[String(FIJOS_REF_YEAR)]?.days?.length===365
    && db.template2027?.days?.length===365
    && db.template2027?.cardEntries
    && db.masterLoaded);
}

async function bootstrapFromExcelOnce(){
  setGistStatus('loading','☁ Inicialización · cargando Excel…');
  setBootstrapStatus('Cargando 2026 + estructura 2027 + MASTER…');
  const [b2026,b2027,bMaster]=await Promise.all([
    fetchWorkbookFromCandidates(BOOTSTRAP_2026_URLS),
    fetchWorkbookFromCandidates(BOOTSTRAP_2027_URLS),
    fetchWorkbookFromCandidates(MASTER_URLS)
  ]);
  const parsed2026=await read2026WorkbookBuffer(b2026);
  const parsed2027=await read2027WorkbookBuffer(b2027);

  if(!DB.years) DB.years={};
  DB.years[String(FIJOS_REF_YEAR)]=parsed2026;
  DB.template2027=parsed2027;
  TEMPLATE_2027=parsed2027;
  if(!DB.ipc) DB.ipc={gastos:2,ingresos:0.5};
  if(!DB.fijos) DB.fijos=[];
  if(!DB.fijosGroups) DB.fijosGroups=[];

  await loadMasterBuffer(bMaster,'GitHub',{syncStructure:false,persist:false,render:false});

  DB.bootstrap={
    version:BOOTSTRAP_VERSION,
    completedAt:new Date().toISOString(),
    sources:{year2026:'2026.xlsx',template2027:'2027.xlsx',master:'finanzas-master.xlsx'}
  };
  DB.updatedAt=new Date().toISOString();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(DB));
  renderAll();
  setBootstrapStatus(bootstrapStateText(),true);
  if(gistSync.token){
    await syncGistNow();
  }else{
    setGistStatus('pending','☁ Inicialización guardada localmente · añade token para guardarla en Gist');
  }
  toast('Inicialización completada desde los 3 Excel');
  return true;
}

async function initializeData(){
  let remote=null;
  try{ remote=await fetchGistRemote(); }
  catch(err){ console.warn('Gist no disponible durante el arranque:',err); }

  const remoteData=remote?.exists?remote.payload?.data:null;
  const remoteReady=hasCompletedBootstrap(remoteData);
  const localReady=hasCompletedBootstrap(DB);

  if(remoteReady){
    const remoteUpdatedAt=remote.payload.updatedAt||remote.gist?.updated_at||null;
    gistSync.remoteUpdatedAt=remoteUpdatedAt;
    const localUpdatedAt=DB.updatedAt||null;
    if(!localUpdatedAt || Date.parse(remoteUpdatedAt||0)>=Date.parse(localUpdatedAt||0)){
      gistSync.suppress=true;
      applyGistData(remoteData);
      DB.updatedAt=remoteUpdatedAt||DB.updatedAt||new Date().toISOString();
      saveDB({sync:false});
      gistSync.suppress=false;
      setGistStatus('ok',`☁ Última actualización del Gist · ${formatSyncDate(DB.updatedAt)}`);
    }else{
      setGistStatus('pending',`☁ Gist conectado · cambios locales pendientes · Gist ${formatSyncDate(remoteUpdatedAt)}`);
      if(gistSync.token) scheduleGistSync();
    }
    setBootstrapStatus(bootstrapStateText(),true);
    return true;
  }

  if(localReady && !remote?.exists){
    setBootstrapStatus(bootstrapStateText(),true);
    if(gistSync.token){
      setGistStatus('syncing','☁ Gist · creando copia central…');
      await syncGistNow();
    }else{
      setGistStatus('pending',`☁ Gist conectado · sin archivo todavía · cambios locales pendientes`);
    }
    return true;
  }

  try{
    return await bootstrapFromExcelOnce();
  }catch(err){
    console.error('No se pudo completar la inicialización desde Excel:',err);
    if(localReady){
      setBootstrapStatus(bootstrapStateText(),true);
      setGistStatus('error',`⚠ Inicialización no disponible · mostrando copia local de ${formatSyncDate(DB.updatedAt)}`);
      return true;
    }
    setBootstrapStatus(`Error inicializando Excel · ${err.message||'revisa GitHub'}`,false);
    setGistStatus('error','⚠ No se pudo inicializar el dashboard');
    return false;
  }
}

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
document.getElementById('btnGist').addEventListener('click', openGistPanel);
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


// ============================================================
// GIST: sincronización central
// ============================================================
function gistHeaders(token){
  const h = {
    'Accept':'application/vnd.github+json',
    'X-GitHub-Api-Version': GIST_API_VERSION
  };
  if(token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function gistFetch(url, options={}){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), GIST_TIMEOUT_MS);
  return fetch(url, {...options, signal:controller.signal}).finally(()=>clearTimeout(timer));
}

function setGistStatus(kind, text){
  const el = document.getElementById('gistStatus');
  if(!el) return;
  el.textContent = text;
  el.dataset.kind = kind || '';
  gistSync.lastStatus = {kind, text};
}

function formatSyncDate(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);
}

function localToken(){
  try{
    const remembered = localStorage.getItem(GIST_REMEMBER_KEY)==='1';
    if(remembered){
      const t = localStorage.getItem(GIST_TOKEN_LOCAL_KEY);
      if(t) return {token:t, remember:true};
    }
    const s = sessionStorage.getItem(GIST_TOKEN_SESSION_KEY);
    if(s) return {token:s, remember:false};
  }catch(e){ console.warn('No se pudo leer el token local:', e); }
  return {token:null, remember:false};
}

function setGistToken(token, remember){
  gistSync.token = String(token||'').trim() || null;
  gistSync.rememberToken = !!remember;
  try{
    if(gistSync.token){
      sessionStorage.setItem(GIST_TOKEN_SESSION_KEY, gistSync.token);
      if(remember){
        localStorage.setItem(GIST_REMEMBER_KEY, '1');
        localStorage.setItem(GIST_TOKEN_LOCAL_KEY, gistSync.token);
      }else{
        localStorage.removeItem(GIST_REMEMBER_KEY);
        localStorage.removeItem(GIST_TOKEN_LOCAL_KEY);
      }
    }else{
      sessionStorage.removeItem(GIST_TOKEN_SESSION_KEY);
      localStorage.removeItem(GIST_REMEMBER_KEY);
      localStorage.removeItem(GIST_TOKEN_LOCAL_KEY);
    }
  }catch(e){ console.warn('No se pudo guardar la preferencia del token:', e); }
}

function clearRememberedGistToken(){
  try{
    localStorage.removeItem(GIST_REMEMBER_KEY);
    localStorage.removeItem(GIST_TOKEN_LOCAL_KEY);
    sessionStorage.removeItem(GIST_TOKEN_SESSION_KEY);
  }catch(e){}
  gistSync.token = null;
  gistSync.rememberToken = false;
}

function gistPayload(){
  const snapshots = {};
  Object.keys(DB.years||{}).forEach(y=>{
    snapshots[y] = {
      yearTotals: yearTotals(y),
      monthlyAggregates: monthlyAggregates(y)
    };
  });
  return {
    schemaVersion: 1,
    dashboard: 'diario-gastos',
    updatedAt: DB.updatedAt || new Date().toISOString(),
    data: JSON.parse(JSON.stringify(DB)),
    calculatedSnapshots: snapshots,
    calculatedAt: new Date().toISOString(),
    engineVersion: 'gist-sync-1.0'
  };
}

function isValidGistPayload(payload){
  return !!payload && typeof payload==='object' && (
    (payload.data && typeof payload.data==='object') ||
    (payload.years && typeof payload.years==='object')
  );
}

function normalizeGistPayload(payload){
  if(payload && payload.data && typeof payload.data==='object'){
    return {
      data: payload.data,
      updatedAt: payload.updatedAt || payload.data.updatedAt || null,
      calculatedAt: payload.calculatedAt || null,
      engineVersion: payload.engineVersion || null
    };
  }
  return {data: payload, updatedAt: payload?.updatedAt || null, calculatedAt:null, engineVersion:null};
}

async function fetchGistRemote(){
  const res = await gistFetch(GIST_API_URL, {headers:gistHeaders()});
  if(!res.ok){
    if(res.status===404) return {exists:false, payload:null, response:res};
    throw new Error(`Gist HTTP ${res.status}`);
  }
  const gist = await res.json();
  const file = gist.files && gist.files[GIST_FILE];
  if(!file) return {exists:false, payload:null, response:res, gist};
  let text = file.content;
  if(file.truncated && file.raw_url){
    const rawRes = await gistFetch(file.raw_url, {headers:gistHeaders()});
    if(!rawRes.ok) throw new Error(`Gist raw HTTP ${rawRes.status}`);
    text = await rawRes.text();
  }
  const payload = JSON.parse(text);
  if(!isValidGistPayload(payload)) throw new Error('El archivo del Gist no tiene un formato válido');
  const normalized = normalizeGistPayload(payload);
  return {exists:true, payload:normalized, gist, response:res};
}

function applyGistData(data){
  const clean = JSON.parse(JSON.stringify(data||{}));
  if(!clean.ipc) clean.ipc = {gastos:2, ingresos:0.5};
  if(!clean.fijos) clean.fijos = [];
  if(!clean.fijosGroups) clean.fijosGroups = [];
  if(!clean.years) clean.years = {};
  if(!('bootstrap' in clean)) clean.bootstrap={version:0};
  if(!('template2027' in clean)) clean.template2027=null;
  if(!('masterLoaded' in clean)) clean.masterLoaded=false;
  delete clean.token;
  DB = clean;
  TEMPLATE_2027 = DB.template2027 || null;
}

function scheduleGistSync(){
  if(!gistSync.ready || !gistSync.token) {
    if(gistSync.ready && DB.updatedAt && (!gistSync.remoteUpdatedAt || Date.parse(DB.updatedAt) > Date.parse(gistSync.remoteUpdatedAt))){
      setGistStatus('pending', '☁ Cambios locales pendientes · añade token para sincronizar');
    }
    return;
  }
  clearTimeout(gistSync.timer);
  setGistStatus('syncing', '☁ Gist · sincronizando…');
  gistSync.timer = setTimeout(()=>syncGistNow(), 700);
}

async function syncGistNow(){
  if(!gistSync.token || gistSync.syncing) return false;
  gistSync.syncing = true;
  try{
    setGistStatus('syncing', '☁ Gist · sincronizando…');
    const payload = gistPayload();
    const body = JSON.stringify({
      files: {[GIST_FILE]: {content: JSON.stringify(payload, null, 2)}}
    });
    const res = await gistFetch(GIST_API_URL, {
      method:'PATCH',
      headers:{...gistHeaders(gistSync.token), 'Content-Type':'application/json'},
      body
    });
    if(res.status===401 || res.status===403){
      throw new Error('Token sin permiso para escribir el Gist');
    }
    if(!res.ok) throw new Error(`Gist HTTP ${res.status}`);
    gistSync.remoteUpdatedAt = payload.updatedAt;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
    setGistStatus('ok', `☁ Última actualización del Gist · ${formatSyncDate(payload.updatedAt)}`);
    return true;
  }catch(err){
    console.warn('No se pudo sincronizar Gist:', err);
    setGistStatus('error', '⚠ Gist · error de sincronización · cambios guardados localmente');
    return false;
  }finally{
    gistSync.syncing = false;
  }
}

async function replaceFromGist(){
  setGistStatus('loading', '☁ Gist · trayendo datos…');
  try{
    const remote = await fetchGistRemote();
    if(!remote.exists) throw new Error('No existe aún el archivo del dashboard en el Gist');
    gistSync.suppress = true;
    applyGistData(remote.payload.data);
    DB.updatedAt = remote.payload.updatedAt || remote.gist?.updated_at || new Date().toISOString();
    saveDB({sync:false});
    renderAll();
    gistSync.remoteUpdatedAt = DB.updatedAt;
    setGistStatus('ok', `☁ Última actualización del Gist · ${formatSyncDate(DB.updatedAt)}`);
    toast('Datos traídos del Gist');
    return true;
  }catch(err){
    console.warn(err);
    setGistStatus('error', '⚠ No se pudo traer el Gist');
    toast('No se pudo traer el Gist');
    return false;
  }finally{
    gistSync.suppress = false;
  }
}

function openGistPanel(){
  const saved = localToken();
  openModal(`
    <h3>☁ Gist</h3>
    <div class="field-row"><label>Gist ID</label><input class="field" type="text" value="${GIST_ID}" readonly></div>
    <div class="field-row"><label>Archivo</label><input class="field" type="text" value="${GIST_FILE}" readonly></div>
    <div class="field-row"><label>Token de GitHub</label><input class="field" type="password" id="gistTokenInput" name="gistToken" autocomplete="current-password" spellcheck="false" value="${escapeHtml(saved.token||'')}"></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-soft);margin:-4px 0 12px;">
      <input type="checkbox" id="gistRemember" ${saved.remember?'checked':''}>
      Recordar token en este dispositivo
    </label>
    <div style="font-size:11.5px;color:var(--ink-soft);line-height:1.45;margin-bottom:12px;">
      El token solo se usa para escribir. No se guarda en el Gist ni se incluye en el JSON. El gestor de contraseñas del navegador puede ofrecer guardarlo.
    </div>
    <div class="modal-actions">
      <button class="btn ghost" id="gistClear">Borrar token</button>
      <button class="btn ghost" id="gistFetch">Traer del Gist</button>
      <button class="btn" id="gistSaveNow">Guardar ahora</button>
      <button class="btn primary" id="gistSaveClose">Guardar y cerrar</button>
    </div>
  `, ()=>{
    document.getElementById('gistClear').onclick = ()=>{ clearRememberedGistToken(); document.getElementById('gistTokenInput').value=''; document.getElementById('gistRemember').checked=false; setGistStatus('pending', '☁ Sin token · solo lectura del Gist'); };
    document.getElementById('gistFetch').onclick = async ()=>{ await replaceFromGist(); };
    document.getElementById('gistSaveNow').onclick = async ()=>{
      const token = document.getElementById('gistTokenInput').value.trim();
      const remember = document.getElementById('gistRemember').checked;
      setGistToken(token, remember);
      if(!token){ setGistStatus('pending', '☁ Sin token · solo lectura del Gist'); toast('Token borrado'); return; }
      await syncGistNow();
    };
    document.getElementById('gistSaveClose').onclick = async ()=>{
      const token = document.getElementById('gistTokenInput').value.trim();
      const remember = document.getElementById('gistRemember').checked;
      setGistToken(token, remember);
      if(token) await syncGistNow();
      closeModal();
    };
  });
}

function initGistSync(){
  const saved = localToken();
  gistSync.token = saved.token;
  gistSync.rememberToken = saved.remember;
  gistSync.ready = true;
}

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

async function initDashboard(){
  initGistSync();
  renderAll();
  await initializeData();
  // MASTER sí se refresca en cada arranque para detectar nuevos conceptos, renombres e importes.
  await cargarMasterAutomatico();
  setBootstrapStatus(bootstrapStateText(), true);
  renderAll();
}

initDashboard();
