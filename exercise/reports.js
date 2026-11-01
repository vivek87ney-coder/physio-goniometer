// ===== Tracking, charts, PDF (jsPDF) and XLSX (SheetJS) reports =====
import {COMP_LABEL} from "./engine.js";
export const ymd=d=>{d=new Date(d);return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const addDays=(s,n)=>{const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return ymd(d)};
const weekStart=s=>{const d=new Date(s+"T12:00:00");const k=(d.getDay()+6)%7;d.setDate(d.getDate()-k);return ymd(d)};
export const DISCLAIMER="AI scores are movement-quality guidance estimated from a phone camera. This app is not a medical device and does not diagnose or treat. Follow your physiotherapist's advice; stop if you feel pain.";
export function stats(rx,sessions,from,to){
 const ex=(rx&&rx.exercises)||[];to=to||ymd(new Date());from=from||(rx&&rx.startDate)||(sessions.length?sessions.map(s=>s.date).sort()[0]:to);
 if(from>to)from=to;
 const days=[];for(let d=from;d<=to;d=addDays(d,1)){const ss=sessions.filter(s=>s.date===d);const per=ex.map(e=>{const mine=ss.filter(s=>s.exId===e.id);const daily=(+e.daysPerWeek||7)>=7;const exp=daily?(+e.perDay||1):0;
   return {exId:e.id,name:e.name,done:mine.length,complete:mine.filter(s=>s.complete).length,exp,daily}});
  const expT=per.reduce((a,p)=>a+p.exp,0),doneT=per.reduce((a,p)=>a+Math.min(p.done,p.exp||p.done),0);
  const reps=ss.reduce((a,s)=>a+s.repsDone,0),presReps=ss.reduce((a,s)=>a+s.presSets*s.presReps,0);
  const acc=ss.length?Math.round(ss.reduce((a,s)=>a+(s.acc||0),0)/ss.length):null;const rom=ss.filter(s=>s.romAvg).length?Math.round(ss.reduce((a,s)=>a+(s.romAvg||0),0)/ss.filter(s=>s.romAvg).length):null;
  const missed=per.filter(p=>p.daily&&p.done<p.exp).map(p=>p.name+(p.done?" (partial "+p.done+"/"+p.exp+")":" (missed)"));
  const incomplete=ss.filter(s=>!s.complete).length;
  days.push({date:d,sessions:ss.length,expected:expT,compliance:expT?Math.round(100*Math.min(1,doneT/expT)):(ss.length?100:null),reps,presReps,acc,rom,missed,incomplete,per})}
 const weeks={};for(const d of days){const w=weekStart(d.date);(weeks[w]=weeks[w]||{week:w,days:[],sessions:0}).days.push(d);weeks[w].sessions+=d.sessions}
 const wk=Object.values(weeks).map(w=>{let exp=0,done=0;const short=[];for(const e of ex){const req=(+e.perDay||1)*(+e.daysPerWeek||7)*(w.days.length/7);const n=sessions.filter(s=>s.exId===e.id&&weekStart(s.date)===w.week).length;exp+=req;done+=Math.min(n,req);if(n<Math.floor(req))short.push(e.name+" "+n+"/"+Math.round(req))}
  const ss=sessions.filter(s=>weekStart(s.date)===w.week);return {week:w.week,sessions:w.sessions,expected:Math.round(exp),compliance:exp?Math.round(100*done/exp):null,acc:ss.length?Math.round(ss.reduce((a,s)=>a+(s.acc||0),0)/ss.length):null,reps:ss.reduce((a,s)=>a+s.repsDone,0),short}});
 const months={};for(const s of sessions){const m=s.date.slice(0,7);(months[m]=months[m]||{month:m,sessions:0,reps:0,acc:[]}).sessions++;months[m].reps+=s.repsDone;months[m].acc.push(s.acc||0)}
 const mo=Object.values(months).sort((a,b)=>a.month<b.month?-1:1).map(m=>({month:m.month,sessions:m.sessions,reps:m.reps,acc:Math.round(m.acc.reduce((a,b)=>a+b,0)/m.acc.length)}));
 const comps={};for(const s of sessions)for(const [k,v] of Object.entries(s.comps||{}))comps[k]=(comps[k]||0)+v;
 const inRange=sessions.filter(s=>s.date>=from&&s.date<=to);const cd=days.filter(d=>d.compliance!=null);
 const summary={from,to,sessions:inRange.length,completeSessions:inRange.filter(s=>s.complete).length,reps:inRange.reduce((a,s)=>a+s.repsDone,0),presReps:inRange.reduce((a,s)=>a+s.presSets*s.presReps,0),
  acc:inRange.length?Math.round(inRange.reduce((a,s)=>a+(s.acc||0),0)/inRange.length):null,compliance:cd.length?Math.round(cd.reduce((a,d)=>a+d.compliance,0)/cd.length):null,
  missedDays:days.filter(d=>d.missed.length&&d.date<ymd(new Date())).length,topComps:Object.entries(comps).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>(COMP_LABEL[k]||k)+" ×"+v)};
 const perEx=ex.map(e=>{const ss=inRange.filter(s=>s.exId===e.id);return {name:e.name,sessions:ss.length,acc:ss.length?Math.round(ss.reduce((a,s)=>a+(s.acc||0),0)/ss.length):null,romBest:ss.length?Math.max(...ss.map(s=>s.romMax||0)):null,romTarget:e.targetRom||Math.abs(e.end-e.start),reps:ss.reduce((a,s)=>a+s.repsDone,0),presReps:ss.reduce((a,s)=>a+s.presSets*s.presReps,0)}});
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
export function sessionRows(sessions){return sessions.slice().sort((a,b)=>a.startedAt<b.startedAt?-1:1).map(s=>({Date:s.date,Time:new Date(s.startedAt).toTimeString().slice(0,5),Exercise:s.exName,"Duration (min)":+(s.durSec/60).toFixed(1),"Sets done":s.setsDone,"Sets prescribed":s.presSets,"Reps done":s.repsDone,"Reps prescribed":s.presSets*s.presReps,"Partial reps":s.partials||0,"Accuracy % (AI)":s.acc,"ROM avg (°)":s.romAvg,"ROM best (°)":s.romMax,"Target ROM (°)":s.targetRom,Compensations:Object.entries(s.comps||{}).map(([k,v])=>(COMP_LABEL[k]||k)+" ×"+v).join("; "),Complete:s.complete?"Yes":"No"}))}
export function makeXLSX(patient,rx,sessions,st){const X=window.XLSX;const wb=X.utils.book_new();const add=(n,rows)=>X.utils.book_append_sheet(wb,X.utils.json_to_sheet(rows.length?rows:[{"(none)":""}]),n);
 add("Summary",[{Patient:patient.name,"Patient ID":patient.code||"",Condition:patient.condition||"",Therapist:rx.therapist||"",From:st.summary.from,To:st.summary.to,Sessions:st.summary.sessions,"Complete sessions":st.summary.completeSessions,"Reps done":st.summary.reps,"Reps prescribed":st.summary.presReps,"Avg accuracy % (AI)":st.summary.acc,"Avg daily compliance %":st.summary.compliance,"Days with missed sessions":st.summary.missedDays,"Top compensations":st.summary.topComps.join("; "),Note:DISCLAIMER}]);
 add("Prescription",rx.exercises.map(e=>({Exercise:e.name,"Primary angle":e.metric,"Start°":e.start,"End°":e.end,"Target ROM°":e.targetRom||Math.abs(e.end-e.start),Reps:e.reps,Sets:e.sets,"Rest s":e.rest,"Duration min":e.duration,"Times/day":e.perDay,"Days/week":e.daysPerWeek,"Watch for":(e.comps||[]).map(c=>COMP_LABEL[c]||c).join(", "),Instructions:e.instructions||""})));
 add("Sessions",sessionRows(sessions));
 add("Reps",sessions.flatMap(s=>(s.reps||[]).map((r,i)=>({Date:s.date,Exercise:s.exName,Set:r.set,Rep:i+1,"Accuracy %":r.acc,"Shape (DTW) %":r.shape,"ROM %":r.romPct,"Tempo %":r.tempo,"ROM °":r.rom,"Peak °":r.peak,"Duration s":r.dur,Compensations:r.comps.map(c=>COMP_LABEL[c]||c).join(", ")}))));
 add("Daily",st.days.map(d=>({Date:d.date,Sessions:d.sessions,Expected:d.expected,"Compliance %":d.compliance,"Reps done":d.reps,"Reps prescribed":d.presReps,"Accuracy %":d.acc,"ROM avg °":d.rom,"Incomplete sessions":d.incomplete,Missed:d.missed.join("; ")})));
 add("Weekly",st.weeks.map(w=>({"Week of":w.week,Sessions:w.sessions,Expected:w.expected,"Compliance %":w.compliance,"Accuracy %":w.acc,Reps:w.reps,Shortfall:w.short.join("; ")})));
 add("Monthly",st.months.map(m=>({Month:m.month,Sessions:m.sessions,Reps:m.reps,"Accuracy %":m.acc})));
 const out=X.write(wb,{bookType:"xlsx",type:"array"});return new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}
export function makePDF(patient,rx,sessions,st){const {jsPDF}=window.jspdf;const d=new jsPDF({unit:"mm",format:"a4"});let y=14;const PW=210,M=12;
 const np=h=>{if(y+h>285){d.addPage();y=14}};const H=t=>{np(12);d.setFont("helvetica","bold");d.setFontSize(12);d.setTextColor(0,70,160);d.text(t,M,y);y+=6;d.setTextColor(0);d.setFont("helvetica","normal");d.setFontSize(9)};
 const P=(t)=>{const ls=d.splitTextToSize(String(t),PW-2*M);np(ls.length*4.2);d.text(ls,M,y);y+=ls.length*4.2+1};
 const table=(cols,rows,widths)=>{const tw=widths.reduce((a,b)=>a+b,0),sc=(PW-2*M)/tw;widths=widths.map(w=>w*sc);const row=(cells,bold)=>{const lines=cells.map((c,i)=>d.splitTextToSize(String(c==null?"–":c),widths[i]-1.5));const h=Math.max(...lines.map(l=>l.length))*3.6+1.6;np(h);
   if(bold){d.setFillColor(230,238,250);d.rect(M,y-3.2,PW-2*M,h,"F")}d.setFont("helvetica",bold?"bold":"normal");let x=M;lines.forEach((l,i)=>{d.text(l,x+.7,y);x+=widths[i]});y+=h;d.setDrawColor(220);d.line(M,y-3.2,PW-M,y-3.2)};
  d.setFontSize(8);row(cols,true);rows.forEach(r=>row(r));d.setFontSize(9);y+=2};
 d.setFont("helvetica","bold");d.setFontSize(16);d.text("Home Exercise Progress Report",M,y);y+=6;d.setFontSize(9);d.setFont("helvetica","normal");d.text("Generated "+new Date().toLocaleString()+"  ·  Period "+st.summary.from+" to "+st.summary.to,M,y);y+=6;
 H("Patient");table(["Name","ID","Age/Sex","Condition","Therapist","Prescription"],[[patient.name,patient.code||"",(patient.age||"")+" "+(patient.sex||""),patient.condition||"",rx.therapist||"","v"+(rx.version||1)+" from "+(rx.startDate||"")]],[30,18,16,40,30,30]);
 H("Summary");const s=st.summary;table(["Sessions","Complete","Reps done / prescribed","Avg accuracy (AI)","Avg daily compliance","Days with missed sessions"],[[s.sessions,s.completeSessions,s.reps+" / "+s.presReps,fmt(s.acc)+"%",fmt(s.compliance)+"%",s.missedDays]],[20,20,32,28,30,32]);
 P("Most frequent compensations: "+(s.topComps.join(", ")||"none detected"));
 H("Prescription");table(["Exercise","Dose","Frequency","Angle start-end","Target ROM","Watch for"],rx.exercises.map(e=>[e.name,e.sets+"×"+e.reps+", rest "+e.rest+"s",e.perDay+"×/day, "+e.daysPerWeek+" d/wk",e.start+"° to "+e.end+"°",(e.targetRom||Math.abs(e.end-e.start))+"°",(e.comps||[]).map(c=>COMP_LABEL[c]||c).join(", ")]),[30,24,24,24,16,50]);
 H("Prescribed vs completed, quality and ROM (per exercise)");table(["Exercise","Sessions","Reps done / prescribed","Avg accuracy","Best ROM / target"],st.perEx.map(p=>[p.name,p.sessions,p.reps+" / "+p.presReps,fmt(p.acc)+"%",fmt(p.romBest)+"° / "+p.romTarget+"°"]),[40,20,35,25,35]);
 H("Daily compliance & accuracy");const c1=chart(st.days.slice(-31),"Daily","date");np(70);d.addImage(c1.toDataURL("image/jpeg",0.85),"JPEG",M,y,PW-2*M,(PW-2*M)*c1.height/c1.width);y+=(PW-2*M)*c1.height/c1.width+3;
 const c2=chart(st.weeks.map(w=>({...w,week:w.week})),"Weekly","week");np(70);d.addImage(c2.toDataURL("image/jpeg",0.85),"JPEG",M,y,PW-2*M,(PW-2*M)*c2.height/c2.width);y+=(PW-2*M)*c2.height/c2.width+3;
 H("Daily performance");table(["Date","Sessions / expected","Compliance","Reps / prescribed","Accuracy","ROM avg","Missed / incomplete"],st.days.map(x=>[x.date,x.sessions+" / "+x.expected,fmt(x.compliance)+"%",x.reps+" / "+x.presReps,fmt(x.acc)+"%",fmt(x.rom)+"°",[...x.missed,x.incomplete?x.incomplete+" incomplete":""].filter(Boolean).join("; ")]),[20,20,18,22,16,14,50]);
 H("Weekly compliance");table(["Week of","Sessions / expected","Compliance","Accuracy","Reps","Shortfall"],st.weeks.map(w=>[w.week,w.sessions+" / "+w.expected,fmt(w.compliance)+"%",fmt(w.acc)+"%",w.reps,w.short.join("; ")]),[22,24,20,18,14,60]);
 H("Session log");table(["Date","Time","Exercise","Min","Sets","Reps","Acc.","ROM avg/best","Compensations"],sessionRows(sessions).map(r=>[r.Date,r.Time,r.Exercise,r["Duration (min)"],r["Sets done"]+"/"+r["Sets prescribed"],r["Reps done"]+"/"+r["Reps prescribed"],r["Accuracy % (AI)"]+"%",r["ROM avg (°)"]+"/"+r["ROM best (°)"],r.Compensations]),[18,10,26,9,10,12,10,16,50]);
 H("Important");P(DISCLAIMER);return d.output("blob")}
