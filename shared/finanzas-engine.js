/*
 * Javi Finance Engine v1.0.0
 * Motor compartido para Dashboard financiero e Independencia Financiera.
 *
 * Referencia normativa configurada: 2026.
 * - SEPE: prestación contributiva (70 % primeros 180 días; 60 % después; topes 2026).
 * - SEPE: subsidio mayores de 52 años (80 % IPREM; cotización jubilación 125 % base mínima).
 * - Seguridad Social: edad ordinaria desde 2027 (65 con 38 años y 6 meses; 67 en otro caso).
 * - Seguridad Social: base reguladora y transición 2026-2037.
 * - Tope máximo inicial de pensión 2026 y senda legal +0,115 pp sobre revalorización hasta 2050.
 *
 * Es un estimador orientativo. Los valores futuros (IPREM/base mínima/revalorizaciones) son supuestos,
 * no importes oficiales futuros.
 */
(function(root){
  'use strict';

  const VERSION='1.0.0';
  const RULES={
    referenceYear:2026,
    unemploymentMonths:24,
    unemploymentFirstPeriodMonths:6,
    unemploymentRateFirst:.70,
    unemploymentRateRest:.60,
    unemploymentMin2026:{0:560,1:749,2:749},
    unemploymentMax2026:{0:1225,1:1400,2:1575},
    ipremMonthly2026:600,
    subsidy52Monthly2026:480,
    subsidy52ContributionFactor:1.25,
    minimumContributionBase2026:1424.40,
    pensionMaxMonthly2026:3359.60,
    pensionMaxAnnual2026:47034.40,
    pensionMaxExtraPct:0.115,
    ordinaryAge65ContributionMonths:462,
    pensionMinimumAccessMonths:180
  };

  const VOLUNTARY_REDUCTIONS={
    24:[21.00,19.00,17.00,13.00],23:[17.60,16.50,15.00,12.00],22:[14.65,14.00,13.33,11.00],21:[12.57,12.00,11.43,10.00],
    20:[11.00,10.50,10.00,9.20],19:[9.78,9.33,8.89,8.40],18:[8.80,8.40,8.00,7.60],17:[8.00,7.64,7.27,6.91],
    16:[7.33,7.00,6.67,6.33],15:[6.77,6.46,6.15,5.85],14:[6.29,6.00,5.71,5.43],13:[5.87,5.60,5.33,5.07],
    12:[5.50,5.25,5.00,4.75],11:[5.18,4.94,4.71,4.47],10:[4.89,4.67,4.44,4.22],9:[4.63,4.42,4.21,4.00],
    8:[4.40,4.20,4.00,3.80],7:[4.19,4.00,3.81,3.62],6:[4.00,3.82,3.64,3.45],5:[3.83,3.65,3.48,3.30],
    4:[3.67,3.50,3.33,3.17],3:[3.52,3.36,3.20,3.04],2:[3.38,3.23,3.08,2.92],1:[3.26,3.11,2.96,2.81]
  };
  const INVOLUNTARY_REDUCTIONS={
    48:[30.00,28.00,26.00,24.00],47:[29.38,27.42,25.46,23.50],46:[28.75,26.83,24.92,23.00],45:[28.13,26.25,24.38,22.50],
    44:[27.50,25.67,23.83,22.00],43:[26.88,25.08,23.29,21.50],42:[26.25,24.50,22.75,21.00],41:[25.63,23.92,22.21,20.50],
    40:[25.00,23.33,21.67,20.00],39:[24.38,22.75,21.13,19.50],38:[23.75,22.17,20.58,19.00],37:[23.13,21.58,20.04,18.50],
    36:[22.50,21.00,19.50,18.00],35:[21.88,20.42,18.96,17.50],34:[21.25,19.83,18.42,17.00],33:[20.63,19.25,17.88,16.50],
    32:[20.00,18.67,17.33,16.00],31:[19.38,18.08,16.79,15.50],30:[18.75,17.50,16.25,15.00],29:[18.13,16.92,15.71,14.50],
    28:[17.50,16.33,15.17,14.00],27:[16.88,15.75,14.63,13.50],26:[16.25,15.17,14.08,13.00],25:[15.63,14.58,13.54,12.50],
    24:[15.00,14.00,13.00,12.00],23:[14.38,13.42,12.46,11.50],22:[13.75,12.83,11.92,11.00],21:[12.57,12.00,11.38,10.00],
    20:[11.00,10.50,10.00,9.20],19:[9.78,9.33,8.89,8.40],18:[8.80,8.40,8.00,7.60],17:[8.00,7.64,7.27,6.91],
    16:[7.33,7.00,6.67,6.33],15:[6.77,6.46,6.15,5.85],14:[6.29,6.00,5.71,5.43],13:[5.87,5.60,5.33,5.07],
    12:[5.50,5.25,5.00,4.75],11:[5.18,4.94,4.71,4.47],10:[4.89,4.67,4.44,4.22],9:[4.63,4.42,4.21,4.00],
    8:[4.40,4.20,4.00,3.80],7:[4.19,4.00,3.81,3.62],6:[3.75,3.50,3.25,3.00],5:[3.13,2.92,2.71,2.50],
    4:[2.50,2.33,2.17,2.00],3:[1.88,1.75,1.63,1.50],2:[1.25,1.17,1.08,1.00],1:[0.63,0.58,0.54,0.50]
  };

  function number(value){
    if(typeof value==='number')return Number.isFinite(value)?value:0;
    let s=String(value??'').trim().replace(/\s/g,'').replace(/€/g,'');
    if(!s)return 0;
    if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
    else if(s.includes(','))s=s.replace(',','.');
    else if(/^[-+]?\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
    const n=Number(s);return Number.isFinite(n)?n:0;
  }
  function clamp(n,min,max){return Math.min(max,Math.max(min,n));}
  function localToday(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
  function monthStart(date){const d=date instanceof Date?date:parseDate(date);return d?new Date(d.getFullYear(),d.getMonth(),1):null;}
  function monthKey(date){const d=date instanceof Date?date:parseDate(date);return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:'';}
  function dateKey(date){const d=date instanceof Date?date:parseDate(date);return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';}
  function parseDate(value){
    if(value instanceof Date)return Number.isNaN(value.getTime())?null:new Date(value.getFullYear(),value.getMonth(),value.getDate());
    const m=String(value||'').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);if(!m)return null;
    const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]||1));return Number.isNaN(d.getTime())?null:d;
  }
  function parseMonth(value){const d=parseDate(value);return d?new Date(d.getFullYear(),d.getMonth(),1):null;}
  function addMonths(date,n){const d=monthStart(date);return d?new Date(d.getFullYear(),d.getMonth()+Number(n||0),1):null;}
  function monthDiff(a,b){const x=monthStart(a),y=monthStart(b);return (!x||!y)?0:(y.getFullYear()-x.getFullYear())*12+y.getMonth()-x.getMonth();}
  function maxDate(a,b){return a>b?a:b;}
  function defaultDismissalDate(now=localToday(),earliest='2027-01-01'){
    const current=monthStart(now)||new Date(2027,0,1),min=monthStart(earliest)||new Date(2027,0,1);
    return current<min?min:current;
  }

  function normalizeDateString(v){const d=parseDate(v);return d?dateKey(d):'';}
  function normalizeLifeSummary(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
    const out={
      years:clamp(Math.round(number(raw.years)),0,80),months:clamp(Math.round(number(raw.months)),0,11),days:clamp(Math.round(number(raw.days)),0,31),
      totalDays:Math.max(0,Math.round(number(raw.totalDays))),asOf:normalizeDateString(raw.asOf),firstStart:normalizeDateString(raw.firstStart),currentSince:normalizeDateString(raw.currentSince)
    };
    return Object.values(out).some(Boolean)?out:null;
  }
  function normalizeLifeHistory(raw){
    if(!Array.isArray(raw))return [];
    return raw.slice(0,120).map(item=>{
      if(!item||typeof item!=='object')return null;
      const x={
        label:String(item.label||item.employer||item.situation||'').trim().slice(0,140),start:normalizeDateString(item.start),effectiveStart:normalizeDateString(item.effectiveStart),end:normalizeDateString(item.end),
        regime:String(item.regime||'').trim().slice(0,40),group:String(item.group||'').trim().slice(0,12),days:Math.max(0,Math.round(number(item.days))),kind:String(item.kind||'employment').trim().slice(0,30)
      };
      return (x.label||x.start||x.end||x.days)?x:null;
    }).filter(Boolean);
  }
  function normalizeMonthlyBases(raw){
    const out={};if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
    Object.entries(raw).forEach(([k,v])=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(String(k))&&number(v)>=0)out[String(k)]=number(v);});return out;
  }
  function normalizeAnnualBases(raw){
    const out={};if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
    Object.entries(raw).forEach(([k,v])=>{if(/^\d{4}$/.test(String(k))&&number(v)>=0)out[String(k)]=number(v);});return out;
  }
  function normalizePensionState(raw={}){
    const birthYear=clamp(Math.round(number(raw.birthYear)||1972),1940,2010),birthMonth=clamp(Math.round(number(raw.birthMonth)||1),1,12),targetAge=number(raw.targetAge)===67?67:65;
    const defaultContributionEnd=monthKey(new Date(birthYear+targetAge,birthMonth-1,1));
    const contributionEnd=/^\d{4}-\d{2}$/.test(String(raw.contributionEnd||''))?String(raw.contributionEnd):defaultContributionEnd;
    return {
      birthYear,birthMonth,targetAge,yearsNow:clamp(Math.round(number(raw.yearsNow)),0,60),monthsNow:clamp(Math.round(number(raw.monthsNow)),0,11),
      contributionEnd,contributionEndDate:normalizeDateString(raw.contributionEndDate)||`${contributionEnd}-01`,
      currentBase:Math.max(0,number(raw.currentBase)),historicalBase:Math.max(0,number(raw.historicalBase)),futureGrowth:clamp(number(raw.futureGrowth),-10,20),baseCpi:clamp(number(raw.baseCpi),0,10),
      annualBases:normalizeAnnualBases(raw.annualBases),monthlyBases:normalizeMonthlyBases(raw.monthlyBases),basesReport:raw.basesReport&&typeof raw.basesReport==='object'?raw.basesReport:null,
      lifeSummary:normalizeLifeSummary(raw.lifeSummary),lifeHistory:normalizeLifeHistory(raw.lifeHistory)
    };
  }
  function monthlyBasesForYear(p,year){
    const prefix=String(year)+'-';return Object.entries(p?.monthlyBases||{}).filter(([k,v])=>k.startsWith(prefix)&&number(v)>0).sort((a,b)=>a[0].localeCompare(b[0]));
  }
  function annualAverageFromMonthly(p,year){const rows=monthlyBasesForYear(p,year);return rows.length?rows.reduce((s,[,v])=>s+number(v),0)/rows.length:null;}

  function retirementDate(p,age){const s=normalizePensionState(p);return new Date(s.birthYear+Number(age||s.targetAge),s.birthMonth-1,1);}
  function contributionAnchor(p,now=localToday()){
    const s=normalizePensionState(p),report=parseDate(s.lifeSummary?.asOf),hasCurrent=s.lifeHistory.some(x=>!x.end);
    return report&&hasCurrent?monthStart(report):monthStart(now);
  }
  function contributionMonthsAtSimulationDate(p,date,now=localToday()){
    const s=normalizePensionState(p),target=monthStart(date);let total=s.yearsNow*12+s.monthsNow;
    const anchor=contributionAnchor(s,now);return Math.max(0,total+monthDiff(anchor,target));
  }
  function projectedContributionMonthsAtDate(p,date,now=localToday()){
    const s=normalizePensionState(p),target=monthStart(date),start=monthStart(now);let total=s.yearsNow*12+s.monthsNow;
    const report=parseDate(s.lifeSummary?.asOf),hasCurrent=s.lifeHistory.some(x=>!x.end);
    if(report&&hasCurrent&&report<now)total+=Math.max(0,monthDiff(monthStart(report),start));
    let end=parseMonth(s.contributionEnd)||target;if(end>target)end=target;
    return total+Math.max(0,end>start?monthDiff(start,end):0);
  }
  function pensionPercentage(months){
    const m=Math.max(0,Math.floor(number(months)));if(m<RULES.pensionMinimumAccessMonths)return 0;
    const extra=m-180,first=Math.min(extra,248),rest=Math.max(0,extra-248);return Math.min(100,50+first*.19+rest*.18);
  }
  function ordinaryAgeForContinuedWork(p,now=localToday()){
    const s=normalizePensionState(p),at65=retirementDate(s,65);return projectedContributionMonthsAtDate({...s,contributionEnd:monthKey(at65)},at65,now)>=RULES.ordinaryAge65ContributionMonths?65:67;
  }

  function projectedWorkBaseForMonth(p,date,now=localToday()){
    const s=normalizePensionState(p),d=monthStart(date),key=monthKey(d),year=d.getFullYear(),currentYear=now.getFullYear();
    const exact=number(s.monthlyBases[key]);if(exact>0)return exact;
    if(Object.prototype.hasOwnProperty.call(s.annualBases,String(year)))return Math.max(0,number(s.annualBases[String(year)]));
    const annualReal=annualAverageFromMonthly(s,year);if(annualReal>0&&year<currentYear)return annualReal;
    if(year<currentYear)return Math.max(0,s.historicalBase);
    if(s.currentBase<=0)return Math.max(0,s.historicalBase);
    return s.currentBase*Math.pow(1+s.futureGrowth/100,Math.max(0,year-currentYear));
  }
  function unemploymentBase(p,dismissalDate,now=localToday()){
    const s=normalizePensionState(p),dismissal=monthStart(dismissalDate),values=[];
    for(let i=1;i<=6;i++){const v=projectedWorkBaseForMonth(s,addMonths(dismissal,-i),now);if(v>0)values.push(v);}
    return values.length?values.reduce((a,b)=>a+b,0)/values.length:Math.max(0,s.currentBase);
  }
  function childKey(children){const n=String(children??'0');return n==='1'?'1':n==='2'?'2':'0';}
  function unemploymentGrossForMonth(baseReg,index,children='0'){
    const key=childKey(children),pct=Number(index)<RULES.unemploymentFirstPeriodMonths?RULES.unemploymentRateFirst:RULES.unemploymentRateRest;
    return Math.min(RULES.unemploymentMax2026[key],Math.max(RULES.unemploymentMin2026[key],Math.max(0,number(baseReg))*pct));
  }
  function projectedSubsidy52(date,p){
    const s=normalizePensionState(p),d=monthStart(date),years=Math.max(0,d.getFullYear()-RULES.referenceYear);
    return RULES.subsidy52Monthly2026*Math.pow(1+s.baseCpi/100,years);
  }
  function projectedMinimumBase(p,date){
    const s=normalizePensionState(p),d=monthStart(date),years=Math.max(0,d.getFullYear()-RULES.referenceYear);
    return RULES.minimumContributionBase2026*Math.pow(1+s.baseCpi/100,years);
  }
  function subsidyStartDate(p,dismissalDate){
    const s=normalizePensionState(p),unemploymentEnd=addMonths(dismissalDate,RULES.unemploymentMonths),age52=new Date(s.birthYear+52,s.birthMonth-1,1);return unemploymentEnd>age52?unemploymentEnd:age52;
  }
  function layoffContributionMonthsAt(p,dismissalDate,date,includeSubsidy52=true,now=localToday()){
    const s=normalizePensionState(p),dismissal=monthStart(dismissalDate),target=monthStart(date);if(target<=dismissal)return contributionMonthsAtSimulationDate(s,target,now);
    let current=contributionMonthsAtSimulationDate(s,dismissal,now);const unemploymentEnd=addMonths(dismissal,RULES.unemploymentMonths),paroEnd=target<unemploymentEnd?target:unemploymentEnd;
    if(paroEnd>dismissal)current+=Math.max(0,monthDiff(dismissal,paroEnd));
    if(includeSubsidy52){const subStart=subsidyStartDate(s,dismissal);if(target>subStart)current+=Math.max(0,monthDiff(subStart,target));}
    return current;
  }
  function ordinaryAgeAfterLayoff(p,dismissalDate,includeSubsidy52=true,now=localToday()){
    const s=normalizePensionState(p),at65=retirementDate(s,65);return layoffContributionMonthsAt(s,dismissalDate,at65,includeSubsidy52,now)>=RULES.ordinaryAge65ContributionMonths?65:67;
  }
  function layoffStage(p,dismissalDate,date,includeSubsidy52=true){
    const s=normalizePensionState(p),dismissal=monthStart(dismissalDate),d=monthStart(date);if(d<dismissal)return 'work';
    const unemploymentEnd=addMonths(dismissal,RULES.unemploymentMonths);if(d<unemploymentEnd)return 'unemployment';
    if(includeSubsidy52&&d>=subsidyStartDate(s,dismissal))return 'subsidy';return 'gap';
  }
  function layoffGapBase(p,dismissalDate,date){
    const s=normalizePensionState(p),unemploymentEnd=addMonths(dismissalDate,RULES.unemploymentMonths),d=monthStart(date),gapIndex=Math.max(1,monthDiff(unemploymentEnd,d)+1),min=projectedMinimumBase(s,d);
    if(gapIndex<=60)return min;if(gapIndex<=84)return min*.80;return min*.50;
  }
  function layoffRawBase(p,dismissalDate,date,includeSubsidy52,unemploymentBaseValue,now=localToday()){
    const s=normalizePensionState(p),stage=layoffStage(s,dismissalDate,date,includeSubsidy52);
    if(stage==='work')return projectedWorkBaseForMonth(s,date,now);
    if(stage==='unemployment')return number(unemploymentBaseValue)||unemploymentBase(s,dismissalDate,now);
    if(stage==='subsidy')return projectedMinimumBase(s,date)*RULES.subsidy52ContributionFactor;
    return layoffGapBase(s,dismissalDate,date);
  }
  function updatedMonthlyBase(value,date,retirement,cpiPct){
    const monthsBefore=Math.max(0,monthDiff(date,retirement));if(monthsBefore<=25)return Math.max(0,number(value));
    return Math.max(0,number(value))*Math.pow(1+number(cpiPct)/100,Math.max(0,(monthsBefore-25)/12));
  }
  function methodBRule(year){
    const rules={2026:[302,304,352.33],2027:[304,308,354.67],2028:[306,312,357],2029:[308,316,359.33],2030:[310,320,361.67],2031:[312,324,364],2032:[314,328,366.33],2033:[316,332,368.67],2034:[318,336,371],2035:[320,340,373.33],2036:[322,344,375.67]};
    return rules[Number(year)]||[324,348,378];
  }
  function projectedPensionMaxMonthly(retirementYear,cpiPct){
    let value=RULES.pensionMaxMonthly2026,end=Math.max(RULES.referenceYear,Math.round(number(retirementYear)||RULES.referenceYear));
    const annualReval=Math.max(0,number(cpiPct))+RULES.pensionMaxExtraPct;
    for(let year=RULES.referenceYear+1;year<=end;year++)value*=1+annualReval/100;return value;
  }
  function layoffPensionAtDate(p,dismissalDate,retirement,includeSubsidy52=true,now=localToday()){
    const s=normalizePensionState(p),dismissal=monthStart(dismissalDate),ret=monthStart(retirement),uBase=unemploymentBase(s,dismissal,now),[keep,window,divisor]=methodBRule(ret.getFullYear()),latest=addMonths(ret,-2),series=[];
    for(let i=window-1;i>=0;i--){const date=addMonths(latest,-i),raw=layoffRawBase(s,dismissal,date,includeSubsidy52,uBase,now);series.push({date,raw,updated:updatedMonthlyBase(raw,date,ret,s.baseCpi)});}
    const last300=series.slice(-300),methodA=last300.reduce((sum,x)=>sum+x.updated,0)/350,best=[...series].sort((a,b)=>b.updated-a.updated).slice(0,keep),methodB=best.reduce((sum,x)=>sum+x.updated,0)/divisor;
    const baseReg=Math.max(methodA,methodB),method=methodB>methodA?'B':'A',contributionMonths=layoffContributionMonthsAt(s,dismissal,ret,includeSubsidy52,now),percent=pensionPercentage(contributionMonths),theoretical=baseReg*percent/100,max=projectedPensionMaxMonthly(ret.getFullYear(),s.baseCpi),monthly=Math.min(theoretical,max),annual=monthly*14,equivalent12=annual/12;
    const monthsFromToday=Math.max(0,monthDiff(monthStart(now),ret)),todayFactor=Math.pow(1+s.baseCpi/100,monthsFromToday/12),todayMoney=Math.min(todayFactor>0?monthly/todayFactor:monthly,RULES.pensionMaxMonthly2026);
    return {baseReg,methodA,methodB,method,contributionMonths,percent,theoretical,max,capApplied:theoretical>max,monthly,annual,equivalent12,todayMoney,unemploymentBase:uBase,retirementDate:ret};
  }

  function reductionBand(contributionMonths){const m=Math.max(0,Math.floor(number(contributionMonths)));return m<462?0:m<498?1:m<534?2:3;}
  function earlyReduction(type,contributionMonths,monthsEarly){
    const table=type==='involuntary'?INVOLUNTARY_REDUCTIONS:VOLUNTARY_REDUCTIONS,row=table[clamp(Math.round(number(monthsEarly)),1,type==='involuntary'?48:24)];return row?row[reductionBand(contributionMonths)]:null;
  }
  function findFirstEarlyDate(p,dismissalDate,includeSubsidy52,type='voluntary',now=localToday()){
    const s=normalizePensionState(p),legalAge=ordinaryAgeAfterLayoff(s,dismissalDate,includeSubsidy52,now),legalDate=retirementDate(s,legalAge),maxEarly=type==='involuntary'?48:24,minMonths=type==='involuntary'?396:420,afterParo=addMonths(dismissalDate,RULES.unemploymentMonths);
    let date=maxDate(addMonths(legalDate,-maxEarly),afterParo);while(date<legalDate){const contrib=layoffContributionMonthsAt(s,dismissalDate,date,includeSubsidy52,now);if(contrib>=minMonths){const monthsEarly=Math.max(1,monthDiff(date,legalDate));if(monthsEarly<=maxEarly)return {date,legalAge,legalDate,monthsEarly,contributionMonths:contrib};}date=addMonths(date,1);}return null;
  }
  function layoffEarlyAmount(p,dismissalDate,includeSubsidy52,info,type='voluntary',now=localToday()){
    if(!info)return null;const s=normalizePensionState(p),calc=layoffPensionAtDate(s,dismissalDate,info.date,includeSubsidy52,now),reduction=earlyReduction(type,info.contributionMonths,info.monthsEarly);if(reduction==null)return null;
    let amount=0,cap=calc.max,capApplied=false;if(type==='involuntary'){const reducedTheoretical=calc.theoretical*(1-reduction/100);cap=calc.max*(1-Math.ceil(info.monthsEarly/3)*.005);amount=Math.min(reducedTheoretical,cap);capApplied=reducedTheoretical>cap;}else{const baseForReduction=Math.min(calc.theoretical,calc.max);amount=baseForReduction*(1-reduction/100);cap=baseForReduction;capApplied=calc.theoretical>calc.max;}
    const monthsFromToday=Math.max(0,monthDiff(monthStart(now),info.date)),todayFactor=Math.pow(1+s.baseCpi/100,monthsFromToday/12),todayMoney=todayFactor>0?amount/todayFactor:amount;
    return {...info,...calc,reduction,amount,todayMoney,type,earlyCap:cap,earlyCapApplied:capApplied};
  }

  function baseForYear(p,year,now=localToday()){
    const s=normalizePensionState(p),key=String(year),monthly=monthlyBasesForYear(s,year),currentYear=now.getFullYear();
    if(Object.prototype.hasOwnProperty.call(s.annualBases,key))return {value:Math.max(0,number(s.annualBases[key])),source:monthly.length?`Informe TGSS · ${monthly.length} meses`:'Introducida',kind:'real',override:true};
    if(monthly.length)return {value:annualAverageFromMonthly(s,year)||0,source:`Informe TGSS · ${monthly.length} meses`,kind:'real',override:true};
    const endYear=Number(String(s.contributionEnd||'').slice(0,4))||(s.birthYear+s.targetAge);if(year>endYear)return {value:0,source:'Sin cotizar',kind:'missing',override:false};
    if(year<currentYear){if(s.historicalBase>0)return {value:s.historicalBase,source:'Media historica',kind:'projected',override:false};return {value:0,source:'Falta dato',kind:'missing',override:false};}
    if(year===currentYear){if(s.currentBase>0)return {value:s.currentBase,source:'Base actual',kind:'real',override:false};if(s.historicalBase>0)return {value:s.historicalBase,source:'Media historica',kind:'projected',override:false};return {value:0,source:'Falta dato',kind:'missing',override:false};}
    if(s.currentBase<=0)return {value:0,source:'Falta base actual',kind:'missing',override:false};return {value:s.currentBase*Math.pow(1+s.futureGrowth/100,Math.max(0,year-currentYear)),source:'Proyeccion',kind:'projected',override:false};
  }
  function updatedAnnualBase(base,year,retirementYear,cpiPct){const value=Math.max(0,number(base));if(value<=0)return 0;const targetYear=retirementYear-2;if(year>=targetYear)return value;return value*Math.pow(1+number(cpiPct)/100,Math.max(0,targetYear-year));}
  function calculatePension(p,now=localToday()){
    const s=normalizePensionState(p),currentYear=now.getFullYear(),retirementYear=s.birthYear+s.targetAge,firstYear=retirementYear-29,rows=[],months=[];let explicitCount=0,missingCount=0;
    for(let year=firstYear;year<=retirementYear-1;year++){const info=baseForYear(s,year,now),updated=updatedAnnualBase(info.value,year,retirementYear,s.baseCpi);if(info.override||info.source==='Base actual')explicitCount++;if(info.kind==='missing')missingCount++;rows.push({year,age:year-s.birthYear,base:info.value,updated,source:info.source,kind:info.kind,override:info.override});for(let m=0;m<12;m++)months.push({year,value:updated});}
    const methodA=months.slice(-300).reduce((sum,x)=>sum+x.value,0)/350,methodB=[...months].sort((a,b)=>b.value-a.value).slice(0,324).reduce((sum,x)=>sum+x.value,0)/378,baseReg=Math.max(methodA,methodB),method=methodB>methodA?'B':'A',contributionMonths=projectedContributionMonthsAtDate(s,retirementDate(s,s.targetAge),now),percent=pensionPercentage(contributionMonths),theoreticalMonthly14=baseReg*percent/100,maxMonthly14=projectedPensionMaxMonthly(retirementYear,s.baseCpi),capApplied=theoreticalMonthly14>maxMonthly14,monthly14=Math.min(theoreticalMonthly14,maxMonthly14),annual=monthly14*14,equivalent12=annual/12;
    const ret=retirementDate(s,s.targetAge),monthsToRetirement=Math.max(0,monthDiff(monthStart(now),ret)),todayMoneyFactor=Math.pow(1+s.baseCpi/100,monthsToRetirement/12),todayMoneyRawMonthly14=todayMoneyFactor>0?monthly14/todayMoneyFactor:monthly14,todayMoneyMonthly14=Math.min(todayMoneyRawMonthly14,RULES.pensionMaxMonthly2026),todayMoneyCapApplied=todayMoneyRawMonthly14>RULES.pensionMaxMonthly2026,todayMoneyAnnual=todayMoneyMonthly14*14,ordinaryAge=ordinaryAgeForContinuedWork(s,now);
    return {currentYear,retirementYear,firstYear,rows,methodA,methodB,baseReg,method,contributionMonths,percent,theoreticalMonthly14,maxMonthly14,capApplied,monthly14,annual,equivalent12,ordinaryAge,explicitCount,missingCount,monthsToRetirement,todayMoneyFactor,todayMoneyRawMonthly14,todayMoneyMonthly14,todayMoneyCapApplied,todayMoneyAnnual};
  }

  function calculateLayoffPlan(p,dismissalDate,options={},now=localToday()){
    const s=normalizePensionState(p),dismissal=monthStart(dismissalDate),children=childKey(options.children),includeSubsidy52=options.includeSubsidy52!==false;
    if(!dismissal)return {error:'Fecha de despido no válida.'};
    const ordinaryAge=ordinaryAgeAfterLayoff(s,dismissal,includeSubsidy52,now),ordinaryDate=retirementDate(s,ordinaryAge),uBase=unemploymentBase(s,dismissal,now),unemploymentFirst6=unemploymentGrossForMonth(uBase,0,children),unemploymentRest=unemploymentGrossForMonth(uBase,6,children),unemploymentAverage=(unemploymentFirst6*6+unemploymentRest*18)/24,pension=layoffPensionAtDate(s,dismissal,ordinaryDate,includeSubsidy52,now),subStart=subsidyStartDate(s,dismissal),subsidyAtStart=projectedSubsidy52(subStart,s);
    return {state:s,dismissalDate:dismissal,children,includeSubsidy52,ordinaryAge,retirementDate:ordinaryDate,unemploymentBase:uBase,unemploymentFirst6,unemploymentRest,unemploymentAverage,unemploymentEnd:addMonths(dismissal,RULES.unemploymentMonths),subsidyStart:subStart,subsidyAtStart,pension};
  }
  function incomeForMonth(plan,date,manual={}){
    const d=monthStart(date);if(!plan||plan.error||!d)return {type:'none',label:'Sin ingreso',amount:0};
    if(d>=plan.retirementDate){const monthly=plan.pension?.equivalent12||number(manual.pensionEquivalent12)||0;return {type:'pension',label:'Jubilación',amount:monthly};}
    const idx=monthDiff(plan.dismissalDate,d);if(idx>=0&&idx<RULES.unemploymentMonths){const amount=idx<RULES.unemploymentFirstPeriodMonths?plan.unemploymentFirst6:plan.unemploymentRest;return {type:'paro',label:'Paro',amount};}
    if(plan.includeSubsidy52&&d>=plan.subsidyStart&&d<plan.retirementDate)return {type:'subsidy',label:'Subsidio +52',amount:projectedSubsidy52(d,plan.state)};
    return {type:'none',label:'Sin ingreso',amount:0};
  }

  root.JaviFinanceEngine={
    version:VERSION,rules:RULES,
    number,clamp,localToday,monthStart,monthKey,dateKey,parseDate,parseMonth,addMonths,monthDiff,defaultDismissalDate,
    normalizePensionState,monthlyBasesForYear,annualAverageFromMonthly,retirementDate,contributionMonthsAtSimulationDate,projectedContributionMonthsAtDate,pensionPercentage,ordinaryAgeForContinuedWork,
    projectedWorkBaseForMonth,unemploymentBase,unemploymentGrossForMonth,projectedSubsidy52,projectedMinimumBase,subsidyStartDate,layoffContributionMonthsAt,ordinaryAgeAfterLayoff,layoffStage,layoffGapBase,layoffRawBase,
    updatedMonthlyBase,methodBRule,projectedPensionMaxMonthly,layoffPensionAtDate,reductionBand,earlyReduction,findFirstEarlyDate,layoffEarlyAmount,calculatePension,calculateLayoffPlan,incomeForMonth,
    reductions:{voluntary:VOLUNTARY_REDUCTIONS,involuntary:INVOLUNTARY_REDUCTIONS}
  };
})(typeof window!=='undefined'?window:globalThis);
