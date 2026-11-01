// ===== Tracking, charts, PDF (jsPDF) and XLSX (SheetJS) reports =====
import {COMP_LABEL,exDefaults as exD} from "./engine.js";
export const ymd=d=>{d=new Date(d);return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const addDays=(s,n)=>{const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return ymd(d)};
const weekStart=s=>{const d=new Date(s+"T12:00:00");const k=(d.getDay()+6)%7;d.setDate(d.getDate()-k);return ymd(d)};
export const DISCLAIMER="AI scores are movement-quality guidance estimated from a phone camera. This app is not a medical device and does not diagnose or treat. Follow your physiotherapist's advice; stop if you feel pain.";
// normalise a session record (also migrates v1 records that only had repsDone/partials/acc)
export function normSes(s){if(s.correctReps==null){s.correctReps=s.repsDone||0;s.incorrectReps=s.partials||0;s.totalReps=s.correctReps+s.incorrectReps;s.quality=s.acc;s.accuracy=s.totalReps?Math.round(100*s.correctReps/s.totalReps):null;s.migrated=true}
 if(s.presTotal==null)s.presTotal=(+s.presSets||0)*(+s.presReps||0);return s}
export const isDaily=e=>(e.freq||((+e.daysPerWeek||7)>=7?"daily":"weekly"))==="daily";
export const perWeek=e=>isDaily(e)?7*(+e.perDay||1):(+e.perWeek||+e.daysPerWeek||3);
const presDay=e=>(+e.sets||1)*(+e.reps||1)*(isDaily(e)?(+e.perDay||1):1);
const pct=(a,b)=>b?Math.round(100*Math.min(1,a/b)):null;
const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null;
export function stats(rx,sessions,from,to){
 const ex=(rx&&rx.exercises)||[];sessions.forEach(normSes);to=to||ymd(new Date());from=from||(rx&&rx.startDate)||(sessions.length?sessions.map(s=>s.date).sort()[0]:to);
 if(from>to)from=to;const now=ymd(new Date());
 const days=[];for(let d=from;d<=to;d=addDays(d,1)){const ss=sessions.filter(s=>s.date===d);
  const per=ex.map(e=>{const mine=ss.filter(s=>s.exId===e.id);const daily=isDaily(e);const pres=presDay(e);
   const correct=mine.reduce((a,s)=>a+s.correctReps,0),incorrect=mine.reduce((a,s)=>a+s.incorrectReps,0),total=correct+incorrect;
   const comp=daily?pct(correct,pres):(mine.length?pct(correct,pres):null);
   const status=!daily&&!mine.length?"not scheduled":comp>=100?"completed":correct||mine.length?"partial":d<now?"missed":"pending";
   return {exId:e.id,name:e.name,daily,sessions:mine.length,expSessions:daily?(+e.perDay||1):0,pres:daily||mine.length?pres:0,correct,incorrect,total,acc:total?Math.round(100*correct/total):null,comp,status,
    setsDone:mine.reduce((a,s)=>a+(s.setsDone||0),0),durSec:mine.reduce((a,s)=>a+(s.durSec||0),0),quality:avg(mine.filter(s=>s.quality!=null).map(s=>s.quality))}});
  const sc=per.filter(p=>p.comp!=null);const correct=per.reduce((a,p)=>a+p.correct,0),total=per.reduce((a,p)=>a+p.total,0);
  const rom=avg(ss.filter(s=>s.romAvg).map(s=>s.romAvg));
  days.push({date:d,sessions:ss.length,expected:per.reduce((a,p)=>a+p.expSessions,0),compliance:sc.length?avg(sc.map(p=>p.comp)):null,reps:correct,correct,incorrect:total-correct,total,presReps:per.reduce((a,p)=>a+p.pres,0),
   acc:total?Math.round(100*correct/total):null,rom,missed:per.filter(p=>p.status==="missed"||p.status==="partial").map(p=>p.name+" ("+p.status+" "+p.correct+"/"+p.pres+")"),incomplete:ss.filter(s=>!s.complete).length,per})}
 const weeks={};for(const d of days){const w=weekStart(d.date);(weeks[w]=weeks[w]||{week:w,days:[],sessions:0}).days.push(d);weeks[w].sessions+=d.sessions}
 const wk=Object.values(weeks).map(w=>{const short=[];const cs=[];let expS=0;const ss=sessions.filter(s=>weekStart(s.date)===w.week&&s.date>=from&&s.date<=to);
  ex.forEach((e,i)=>{const frac=w.days.length/7;const reqReps=(+e.sets||1)*(+e.reps||1)*perWeek(e)*frac;const reqS=perWeek(e)*frac;expS+=reqS;
   const c=ss.filter(s=>s.exId===e.id).reduce((a,s)=>a+s.correctReps,0);const v=pct(c,reqReps);cs.push(v);if(v<100)short.push(e.name+" "+c+"/"+Math.round(reqReps)+" reps")});
  const correct=ss.reduce((a,s)=>a+s.correctReps,0),total=ss.reduce((a,s)=>a+s.totalReps,0);
  return {week:w.week,sessions:w.sessions,expected:Math.round(expS),compliance:avg(cs.filter(x=>x!=null)),acc:total?Math.round(100*correct/total):null,reps:correct,short}});
 const months={};for(const s of sessions){const m=s.date.slice(0,7);const o=(months[m]=months[m]||{month:m,sessions:0,reps:0,total:0});o.sessions++;o.reps+=s.correctReps;o.total+=s.totalReps}
 const mo=Object.values(months).sort((a,b)=>a.month<b.month?-1:1).map(m=>({month:m.month,sessions:m.sessions,reps:m.reps,acc:m.total?Math.round(100*m.reps/m.total):null}));
 const inRange=sessions.filter(s=>s.date>=from&&s.date<=to);
 const comps={};for(const s of inRange)for(const [k,v] of Object.entries(s.comps||{}))comps[k]=(comps[k]||0)+v;
 const nDays=days.length;
 const perEx=ex.map((e,i)=>{const ss=inRange.filter(s=>s.exId===e.id);const correct=ss.reduce((a,s)=>a+s.correctReps,0),incorrect=ss.reduce((a,s)=>a+s.incorrectReps,0);
  const presPeriod=Math.round((+e.sets||1)*(+e.reps||1)*perWeek(e)*nDays/7);const td=days.find(d=>d.date===now);const ec={};for(const s of ss)for(const [k,v] of Object.entries(s.comps||{}))ec[k]=(ec[k]||0)+v;
  const dc=days.map(d=>d.per[i]).filter(p=>p.comp!=null);
  return {id:e.id,name:e.name,sessions:ss.length,correct,incorrect,total:correct+incorrect,reps:correct,presReps:presPeriod,acc:correct+incorrect?Math.round(100*correct/(correct+incorrect)):null,
   compliance:isDaily(e)?avg(dc.map(p=>p.comp)):pct(correct,presPeriod),quality:avg(ss.filter(s=>s.quality!=null).map(s=>s.quality)),romBest:ss.length?Math.max(...ss.map(s=>s.romMax||0)):null,romTarget:e.targetRom||Math.abs(e.end-e.start),
   today:td?td.per[i]:null,topComps:Object.entries(ec).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>(COMP_LABEL[k]||k)+" ×"+v),daysDone:days.filter(d=>d.per[i].correct>0).length,
   rows:days.map(d=>({date:d.date,compliance:d.per[i].comp,acc:d.per[i].acc}))}});
 const cd=days.filter(d=>d.compliance!=null);const correct=inRange.reduce((a,s)=>a+s.correctReps,0),total=inRange.reduce((a,s)=>a+s.totalReps,0);
 const summary={from,to,sessions:inRange.length,completeSessions:inRange.filter(s=>s.complete).length,reps:correct,correct,incorrect:total-correct,total,presReps:perEx.reduce((a,p)=>a+p.presReps,0),
  acc:total?Math.round(100*correct/total):null,compliance:cd.length?avg(cd.map(d=>d.compliance)):null,
  missedDays:days.filter(d=>d.missed.length&&d.date<now).length,topComps:Object.entries(comps).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>(COMP_LABEL[k]||k)+" ×"+v)};
 return {days,weeks:wk,months:mo,comps,summary,perEx}}
// bar = compliance %, line = accuracy
export function chart(rows,label,keyX,w=700,h=260){const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,w,h);
 const L=40,B=h-40,T=24,W=w-L-10;g.strokeStyle="#ccc";g.fillStyle="#555";g.font="11px sans-serif";for(let y=0;y<=100;y+=25){const yy=B-(B-T)*y/100;g.beginPath();g.moveTo(L,yy);g.lineTo(L+W,yy);g.stroke();g.fillText(y+"%",4,yy+4)}
 const n=rows.length||1,bw=W/n;rows.forEach((r,i)=>{if(r.compliance!=null){g.fillStyle=r.compliance>=80?"#30a14e":r.compliance>=50?"#e0a800":"#d93025";const bh=(B-T)*r.compliance/100;g.fillRect(L+i*bw+bw*.15,B-bh,bw*.7,bh)}
  if(n<=16||i%Math.ceil(n/16)===0){g.fillStyle="#333";g.save();g.translate(L+i*bw+bw/2,B+6);g.rotate(.6);g.fillText(String(r[keyX]).slice(5),0,6);g.restore()}});
 g.strokeStyle="#0a84ff";g.lineWidth=2;g.beginPath();let st=false;rows.forEach((r,i)=>{if(r.acc==null)return;const x=L+i*bw+bw/2,y=B-(B-T)*r.acc/100;st?g.lineTo(x,y):g.moveTo(x,y);st=true});g.stroke();
 rows.forEach((r,i)=>{if(r.acc==null)return;g.fillStyle="#0a84ff";g.beginPath();g.arc(L+i*bw+bw/2,B-(B-T)*r.acc/100,3,0,7);g.fill()});
 g.fillStyle="#000";g.font="bold 13px sans-serif";g.fillText(label,L,15);g.font="11px sans-serif";g.fillStyle="#30a14e";g.fillRect(w-230,6,10,10);g.fillStyle="#000";g.fillText("Compliance",w-216,15);g.fillStyle="#0a84ff";g.fillRect(w-140,10,14,3);g.fillStyle="#000";g.fillText("Accuracy (AI)",w-122,15);return c}
const fmt=v=>v==null?"–":v;
const asc=t=>String(t).replace(/≥/g,">=").replace(/≤/g,"<=").replace(/→/g,"->").replace(/×/g,"x").replace(/[–—]/g,"-").replace(/·/g,"|");
const freqTxt=e=>isDaily(e)?(e.perDay||1)+"×/day, daily":perWeek(e)+"×/week";
export function sessionRows(sessions){return sessions.map(normSes).slice().sort((a,b)=>a.startedAt<b.startedAt?-1:1).map(s=>({Date:s.date,Time:new Date(s.startedAt).toTimeString().slice(0,5),Exercise:s.exName,"Duration (min)":+(s.durSec/60).toFixed(1),"Sets completed":s.setsDone,"Sets prescribed":s.presSets,"Prescribed reps":s.presTotal,"Actual reps (total)":s.totalReps,"Correct reps":s.correctReps,"Incorrect reps":s.incorrectReps,"Accuracy % (correct/total)":s.accuracy,"Quality score % (AI)":s.quality,"ROM avg (°)":s.romAvg,"ROM best (°)":s.romMax,"Target ROM (°)":s.targetRom,Compensations:Object.entries(s.comps||{}).map(([k,v])=>(COMP_LABEL[k]||k)+" ×"+v).join("; "),Complete:s.complete?"Yes":"No"}))}
export function dailyRows(st){const out=[];for(const d of st.days){for(const p of d.per)out.push({Date:d.date,Exercise:p.name,Frequency:p.daily?"daily":"weekly","Status":p.status,"Prescribed reps":p.pres,"Correct reps":p.correct,"Incorrect reps":p.incorrect,"Total reps":p.total,"Sets completed":p.setsDone,"Sessions":p.sessions,"Duration (min)":+(p.durSec/60).toFixed(1),"Accuracy %":p.acc,"Compliance %":p.comp});
 out.push({Date:d.date,Exercise:"OVERALL",Frequency:"",Status:d.missed.length?"incomplete":"ok","Prescribed reps":d.presReps,"Correct reps":d.correct,"Incorrect reps":d.incorrect,"Total reps":d.total,"Sets completed":"",Sessions:d.sessions,"Duration (min)":"","Accuracy %":d.acc,"Compliance %":d.compliance})}return out}
export function makeXLSX(patient,rx,sessions,st){const X=window.XLSX;const wb=X.utils.book_new();const used=new Set();const add=(n,rows)=>{n=n.replace(/[\\/?*\[\]:]/g," ").slice(0,28);let m=n,k=2;while(used.has(m))m=n.slice(0,25)+" "+k++;used.add(m);X.utils.book_append_sheet(wb,X.utils.json_to_sheet(rows.length?rows:[{"(none)":""}]),m)};
 const s=st.summary;add("Summary",[{Patient:patient.name,"Patient ID":patient.code||"",Condition:patient.condition||"",Therapist:rx.therapist||"",From:s.from,To:s.to,Sessions:s.sessions,"Prescribed reps":s.presReps,"Correct reps":s.correct,"Incorrect reps":s.incorrect,"Accuracy % (correct/total)":s.acc,"Overall daily compliance %":s.compliance,"Days with missed/partial exercises":s.missedDays,"Top compensations":s.topComps.join("; "),Note:DISCLAIMER}]);
 add("Prescription",rx.exercises.map(e=>({Exercise:e.name,"Primary angle":e.metric,"Start°":e.start,"End°":e.end,"Target ROM°":e.targetRom||Math.abs(e.end-e.start),Reps:e.reps,Sets:e.sets,"Rest s":e.rest,"Duration min":e.duration,Frequency:freqTxt(e),"Correct if ROM ≥ % target":exD(e).romThr,"Similarity ≥ %":exD(e).simThr,"Tempo s":exD(e).tMin+"–"+exD(e).tMax,"Watch for":(e.comps||[]).map(c=>COMP_LABEL[c]||c).join(", "),Instructions:e.instructions||"",Precautions:e.precautions||""})));
 add("Per exercise",st.perEx.map(p=>({Exercise:p.name,Sessions:p.sessions,"Prescribed reps (period)":p.presReps,"Correct reps":p.correct,"Incorrect reps":p.incorrect,"Accuracy %":p.acc,"Compliance %":p.compliance,"Quality % (AI)":p.quality,"Days done":p.daysDone,"Best ROM °":p.romBest,"Target ROM °":p.romTarget,"Top issues":p.topComps.join("; ")})));
 add("Daily consolidated",dailyRows(st));
 rx.exercises.forEach((e,i)=>add("Ex"+(i+1)+" "+e.name,sessionRows(sessions.filter(s=>s.exId===e.id))));
 add("All sessions",sessionRows(sessions));
 add("Reps",sessions.flatMap(s=>(s.reps||[]).map((r,i)=>({Date:s.date,Exercise:s.exName,Set:r.set,Rep:i+1,Result:r.ok===false?"incorrect":"correct",Reasons:(r.why||[]).join(", "),"Quality %":r.acc,"Similarity %":r.shape,"ROM %":r.romPct,"Tempo %":r.tempo,"ROM °":r.rom,"Peak °":r.peak,"Duration s":r.dur,Compensations:(r.comps||[]).map(c=>COMP_LABEL[c]||c).join(", ")}))));
 add("Weekly",st.weeks.map(w=>({"Week of":w.week,Sessions:w.sessions,Expected:w.expected,"Compliance %":w.compliance,"Accuracy %":w.acc,"Correct reps":w.reps,Shortfall:w.short.join("; ")})));
 const out=X.write(wb,{bookType:"xlsx",type:"array"});return new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}
export function makePDF(patient,rx,sessions,st){const {jsPDF}=window.jspdf;const d=new jsPDF({unit:"mm",format:"a4"});let y=14;const PW=210,M=12;
 const np=h=>{if(y+h>285){d.addPage();y=14}};const H=(t,sz)=>{np(14);d.setFont("helvetica","bold");d.setFontSize(sz||12);d.setTextColor(0,70,160);d.text(asc(t),M,y);y+=6;d.setTextColor(0);d.setFont("helvetica","normal");d.setFontSize(9)};
 const P=(t)=>{const ls=d.splitTextToSize(asc(t),PW-2*M);np(ls.length*4.2);d.text(ls,M,y);y+=ls.length*4.2+1};
 const table=(cols,rows,widths)=>{const tw=widths.reduce((a,b)=>a+b,0),sc=(PW-2*M)/tw;widths=widths.map(w=>w*sc);const row=(cells,bold)=>{const lines=cells.map((c,i)=>d.splitTextToSize(asc(c==null?"-":c),widths[i]-1.5));const h=Math.max(...lines.map(l=>l.length))*3.6+1.6;np(h);
   if(bold){d.setFillColor(230,238,250);d.rect(M,y-3.2,PW-2*M,h,"F")}d.setFont("helvetica",bold?"bold":"normal");let x=M;lines.forEach((l,i)=>{d.text(l,x+.7,y);x+=widths[i]});y+=h;d.setDrawColor(220);d.line(M,y-3.2,PW-M,y-3.2)};
  d.setFontSize(8);row(cols,true);rows.forEach(r=>row(r));d.setFontSize(9);y+=2};
 const img=c=>{const h=(PW-2*M)*c.height/c.width;np(h+2);d.addImage(c.toDataURL("image/jpeg",0.85),"JPEG",M,y,PW-2*M,h);y+=h+3};
 d.setFont("helvetica","bold");d.setFontSize(16);d.text("Home Exercise Progress Report",M,y);y+=6;d.setFontSize(9);d.setFont("helvetica","normal");d.text("Generated "+new Date().toLocaleString()+"  |  Period "+st.summary.from+" to "+st.summary.to,M,y);y+=6;
 H("Patient");table(["Name","ID","Age/Sex","Condition","Therapist","Prescription"],[[patient.name,patient.code||"",(patient.age||"")+" "+(patient.sex||""),patient.condition||"",rx.therapist||"","v"+(rx.version||1)+" from "+(rx.startDate||"")]],[30,18,16,40,30,30]);
 H("Overall summary");const s=st.summary;table(["Sessions","Prescribed reps","Correct","Incorrect","Accuracy","Overall compliance","Days missed/partial"],[[s.sessions,s.presReps,s.correct,s.incorrect,fmt(s.acc)+"%",fmt(s.compliance)+"%",s.missedDays]],[18,22,18,18,18,26,26]);
 P("Only correct repetitions (ROM, trajectory similarity, tempo and no significant compensation all within target) count towards the prescription. Most frequent issues: "+(s.topComps.join(", ")||"none detected"));
 H("Per-exercise summary");table(["Exercise","Dose / frequency","Prescribed","Correct","Incorrect","Accuracy","Compliance","Best ROM / target"],st.perEx.map((p,i)=>{const e=rx.exercises[i];return [p.name,e.sets+"×"+e.reps+", "+freqTxt(e),p.presReps,p.correct,p.incorrect,fmt(p.acc)+"%",fmt(p.compliance)+"%",fmt(p.romBest)+"° / "+p.romTarget+"°"]}),[30,30,16,14,14,16,18,22]);
 rx.exercises.forEach((e,i)=>{const p=st.perEx[i];d.addPage();y=14;H((i+1)+". "+e.name,13);
  P("Prescription: "+e.sets+" sets × "+e.reps+" reps, rest "+e.rest+" s, ~"+e.duration+" min, "+freqTxt(e)+". Correct rep = ROM ≥ "+exD(e).romThr+"% of target ("+(e.start)+"° → "+e.end+"°), similarity ≥ "+exD(e).simThr+"%, rep time "+exD(e).tMin+"–"+exD(e).tMax+" s, no significant compensation.");
  if(e.precautions)P("Precautions: "+e.precautions);
  table(["Sessions","Prescribed reps","Correct","Incorrect","Accuracy","Compliance","Days done","Top issues"],[[p.sessions,p.presReps,p.correct,p.incorrect,fmt(p.acc)+"%",fmt(p.compliance)+"%",p.daysDone+"/"+st.days.length,p.topComps.join(", ")||"none"]],[16,20,14,14,16,18,14,50]);
  img(chart(p.rows.slice(-31),"Daily compliance & accuracy – "+e.name,"date"));
  H("Daily status");table(["Date","Status","Prescribed","Correct","Incorrect","Sets","Min","Accuracy","Compliance"],st.days.map(x=>{const q=x.per[i];return [x.date,q.status,q.pres,q.correct,q.incorrect,q.setsDone,+(q.durSec/60).toFixed(1),fmt(q.acc)+"%",fmt(q.comp)+"%"]}),[20,20,16,14,14,10,10,16,18]);
  H("Session records");table(["Date","Time","Min","Sets","Prescribed","Total","Correct","Incorrect","Acc.","Compensations"],sessionRows(sessions.filter(x=>x.exId===e.id)).map(r=>[r.Date,r.Time,r["Duration (min)"],r["Sets completed"]+"/"+r["Sets prescribed"],r["Prescribed reps"],r["Actual reps (total)"],r["Correct reps"],r["Incorrect reps"],fmt(r["Accuracy % (correct/total)"])+"%",r.Compensations]),[18,10,9,10,15,11,12,13,10,50])});
 d.addPage();y=14;H("Daily consolidated (all exercises)",13);img(chart(st.days.slice(-31),"Overall daily compliance & accuracy","date"));
 table(["Date","Exercise","Status","Prescribed","Correct","Incorrect","Accuracy","Compliance"],dailyRows(st).map(r=>[r.Date,r.Exercise,r.Status,r["Prescribed reps"],r["Correct reps"],r["Incorrect reps"],fmt(r["Accuracy %"])+"%",fmt(r["Compliance %"])+"%"]),[20,40,22,18,16,16,16,18]);
 H("Weekly compliance");table(["Week of","Sessions / expected","Compliance","Accuracy","Correct reps","Shortfall"],st.weeks.map(w=>[w.week,w.sessions+" / "+w.expected,fmt(w.compliance)+"%",fmt(w.acc)+"%",w.reps,w.short.join("; ")]),[22,24,20,18,18,60]);
 H("Important");P(DISCLAIMER);return d.output("blob")}
