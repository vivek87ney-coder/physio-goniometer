// PDF (jsPDF) and Excel (SheetJS) reports
import { JOINTS, AXIAL, ACT_LABEL } from './bio.js';
import { INFO } from './kb.js';
export const DISCLAIMER='All muscle activity, contraction type, ligament strain and loading values are ESTIMATES inferred from camera-based 3D pose (movement pattern, joint angular velocity and orientation to gravity). They are not EMG, force-plate or imaging measurements. The 3D anatomy is a simplified procedural model. This tool supports, and does not replace, clinical assessment; it is not a medical device.';
export const ymd=d=>{d=new Date(d);return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const f1=v=>v==null||isNaN(v)?'-':(+v).toFixed(1), f0=v=>v==null||isNaN(v)?'-':Math.round(v);
export const mName=k=>{ const id=k.slice(0,-1), s=k.slice(-1); return (INFO.muscle[id]?.n||INFO.ligament[id]?.n||id)+' ('+s+')'; };
export function romRows(S){ const rows=[]; for(const [k,lab] of JOINTS){ const L=S.rom[k+'L'],R=S.rom[k+'R']; if(!L) continue; rows.push([lab,f0(L.min)+' to '+f0(L.max),f0(L.rom),f0(R.min)+' to '+f0(R.max),f0(R.rom),f0(S.asym[k])+'%']); }
  for(const [k,lab] of AXIAL){ const v=S.rom[k]; if(v) rows.push([lab,f0(v.min)+' to '+f0(v.max),f0(v.rom),'','','']); } return rows; }
export function makePDF({patient,session,S,shots,charts,obs,clin}){
  const {jsPDF}=window.jspdf; const d=new jsPDF({unit:'mm',format:'a4'}); let y=14; const PW=210,M=12;
  const np=h=>{ if(y+h>285){ d.addPage(); y=14; } };
  const H=t=>{ np(12); d.setFont('helvetica','bold'); d.setFontSize(12); d.setTextColor(0,70,160); d.text(t,M,y); y+=6; d.setTextColor(0); d.setFont('helvetica','normal'); d.setFontSize(9); };
  const P=t=>{ const ls=d.splitTextToSize(String(t),PW-2*M); np(ls.length*4.2); d.text(ls,M,y); y+=ls.length*4.2+1; };
  const table=(cols,rows,widths)=>{ const tw=widths.reduce((a,b)=>a+b,0),sc=(PW-2*M)/tw; widths=widths.map(w=>w*sc);
    const row=(cells,bold)=>{ const lines=cells.map((c,i)=>d.splitTextToSize(String(c==null?'-':c),widths[i]-1.5)); const h=Math.max(...lines.map(l=>l.length))*3.6+1.6; np(h);
      if(bold){ d.setFillColor(230,238,250); d.rect(M,y-3.2,PW-2*M,h,'F'); } d.setFont('helvetica',bold?'bold':'normal'); let x=M; lines.forEach((l,i)=>{ d.text(l,x+.7,y); x+=widths[i]; }); y+=h; d.setDrawColor(220); d.line(M,y-3.2,PW-M,y-3.2); };
    d.setFontSize(8); row(cols,true); rows.forEach(r=>row(r)); d.setFontSize(9); y+=2; };
  const img=(url,w,h)=>{ np(h+2); d.addImage(url,'JPEG',M,y,w,h); y+=h+3; };
  d.setFont('helvetica','bold'); d.setFontSize(16); d.text('3D Biomechanics & Activity Analysis Report',M,y); y+=6; d.setFontSize(9); d.setFont('helvetica','normal');
  d.text('Generated '+new Date().toLocaleString()+'   Clinician: '+(clin||'-'),M,y); y+=6;
  H('Patient');
  table(['Name','ID','Age','Sex','Height','Condition','Affected side'],[[patient.name,patient.code,patient.age,patient.sex,patient.height,patient.condition,patient.side]],[30,18,10,10,14,45,18]);
  H('Session');
  table(['Date / time','Source','Duration','Frames','Main activity','Activity override'],[[new Date(session.startedAt).toLocaleString(),session.source+(session.fileName?' ('+session.fileName+')':''),f1(S.dur)+' s',S.n,ACT_LABEL[S.main]||S.main,session.override?ACT_LABEL[session.override]:'auto']],[34,34,16,14,30,24]);
  H('Activities detected (rule-based classifier, estimated)');
  table(['Activity','Start s','End s','Duration s','Mean confidence'],S.segments.map(s=>[ACT_LABEL[s.act]||s.act,f1(s.t0/1000),f1(s.t1/1000),f1(s.dur),f0(s.conf*100)+'%']),[50,20,20,20,30]);
  if(S.gait) { H('Gait parameters (estimated)'); table(['Cadence (steps/min)','Stance % L','Stance % R','Cycles (R)','Peak swing knee flex R','Min hip flex R (terminal stance)'],[[f0(S.gait.cadence),f0(S.gait.stanceL),f0(S.gait.stanceR),S.gait.cycles,f0(S.gait.peakSwingKnee),f0(S.gait.minHip)]],[25,18,18,16,28,34]); }
  if(S.sts.count) P(`Sit-to-stand repetitions: ${S.sts.count}, mean duration ${f1(S.sts.mean)} s.`);
  H('Joint angles and range of motion (deg, 3D estimate)');
  table(['Joint / motion','Left min to max','L ROM','Right min to max','R ROM','Asymmetry'],romRows(S),[48,26,14,26,14,18]);
  H('Balance, centre of mass and weight bearing (estimated)');
  table(['Sway (standing, cm RMS)','Mean stability margin (cm, + inside BOS)','Weight bearing L %','Weight bearing R %'],[[f1(S.balance.sway),f1(S.balance.margin),f0(S.balance.wbL),f0(S.balance.wbR)]],[30,40,25,25]);
  if(charts&&charts.length){ H('Comparison with normal reference pattern'); charts.forEach(c=>{ const w=PW-2*M; img(c.url,w,w*c.h/c.w); if(c.note) P(c.note); }); }
  H('Muscle function interpretation (estimated from movement, not EMG)');
  table(['Muscle','% time as agonist','Mean est. demand','Contraction types','Most frequent role'],S.muscles.slice(0,18).map(m=>[mName(m.k),f0(m.agPct)+'%',f0(m.meanI*100)+'%',m.type,m.role]),[40,18,18,50,24]);
  P(S.explain);
  H('Ligament / tendon loading index (0-100, estimated)');
  table(['Structure','Peak','Mean','Function'],S.ligaments.slice(0,14).map(l=>[mName(l.k),f0(l.max*100),f0(l.mean*100),INFO.ligament[l.k.slice(0,-1)]?.a||'']),[40,14,14,80]);
  H('Abnormal patterns / compensations flagged');
  if(S.flags.length) table(['Finding','Duration (s)'],S.flags.map(([k,v])=>[k,f1(v)]),[120,30]); else P('No abnormal pattern exceeded thresholds.');
  if(shots&&shots.length){ H('3D anatomy snapshots'); const w=(PW-2*M-4)/2; for(let i=0;i<shots.length;i+=2){ np(w*0.75+8); d.addImage(shots[i].url,'JPEG',M,y,w,w*0.75); d.text(shots[i].cap,M,y+w*0.75+3.5); if(shots[i+1]){ d.addImage(shots[i+1].url,'JPEG',M+w+4,y,w,w*0.75); d.text(shots[i+1].cap,M+w+4,y+w*0.75+3.5);} y+=w*0.75+7; } }
  H('Clinician observations'); P(obs||'-');
  H('Summary'); P(summaryText(S));
  H('Important'); P(DISCLAIMER);
  return d.output('blob');
}
export function summaryText(S){ const main=ACT_LABEL[S.main]||S.main; const parts=[`Main activity: ${main} (${f1(S.actDur[S.main])} s of ${f1(S.dur)} s).`];
  const big=[]; for(const [k,lab] of JOINTS){ if(S.asym[k]>15&&(S.rom[k+'L'].rom+S.rom[k+'R'].rom)/2>15) big.push(lab.split('(')[0].trim()+' '+f0(S.asym[k])+'%'); } if(big.length) parts.push('L/R ROM asymmetry: '+big.join(', ')+'.');
  parts.push(`Knee ROM L ${f0(S.rom.kneeL?.rom)} / R ${f0(S.rom.kneeR?.rom)} deg; hip flexion ROM L ${f0(S.rom.hipFlexL?.rom)} / R ${f0(S.rom.hipFlexR?.rom)} deg; trunk flexion max ${f0(S.rom.trunkFlex?.max)} deg.`);
  if(S.flags.length) parts.push('Flags: '+S.flags.slice(0,5).map(f=>f[0]).join('; ')+'.'); else parts.push('No compensation flags.');
  const top=S.muscles.slice(0,4).map(m=>mName(m.k)).join(', '); if(top) parts.push('Highest estimated muscle demand: '+top+'.');
  const lt=S.ligaments.slice(0,3).map(l=>mName(l.k)+' '+f0(l.max*100)).join(', '); if(lt) parts.push('Highest estimated passive-structure loading index: '+lt+'.');
  return parts.join(' '); }
export function makeXLSX({patient,session,S,res,obs}){ const X=window.XLSX; const wb=X.utils.book_new(); const add=(n,rows)=>X.utils.book_append_sheet(wb,X.utils.json_to_sheet(rows.length?rows:[{'(none)':''}]),n);
  add('Summary',[{Patient:patient.name,'Patient ID':patient.code||'',Age:patient.age||'',Condition:patient.condition||'',Date:new Date(session.startedAt).toLocaleString(),Source:session.source,'Duration s':+S.dur.toFixed(1),'Main activity':ACT_LABEL[S.main],'Override':session.override||'auto','Cadence':S.gait?Math.round(S.gait.cadence):'','STS reps':S.sts.count,'Sway cm':+S.balance.sway.toFixed(1),'WB L %':Math.round(S.balance.wbL),'WB R %':Math.round(S.balance.wbR),Observations:obs||'',Summary:summaryText(S),Note:DISCLAIMER}]);
  add('Activities',S.segments.map(s=>({Activity:ACT_LABEL[s.act],'Start s':+(s.t0/1000).toFixed(2),'End s':+(s.t1/1000).toFixed(2),'Duration s':+s.dur.toFixed(2),'Confidence %':Math.round(s.conf*100)})));
  add('ROM',romRows(S).map(r=>({Joint:r[0],'Left range':r[1],'Left ROM':r[2],'Right range':r[3],'Right ROM':r[4],Asymmetry:r[5]})));
  add('Muscles (est.)',S.muscles.map(m=>({Muscle:mName(m.k),'% time agonist':Math.round(m.agPct),'Mean demand %':Math.round(m.meanI*100),Contraction:m.type,Role:m.role})));
  add('Ligaments (est.)',S.ligaments.map(l=>({Structure:mName(l.k),'Peak index':Math.round(l.max*100),'Mean index':Math.round(l.mean*100)})));
  add('Flags',S.flags.map(([k,v])=>({Finding:k,'Duration s':+v.toFixed(1)})));
  const keys=['hipFlexL','hipFlexR','kneeL','kneeR','ankleL','ankleR','valgusL','valgusR','shFlexL','shFlexR','shAbdL','shAbdR','elbowL','elbowR','trunkFlex','trunkLat','trunkRot','pelvicObl'];
  add('Frames',res.map(r=>{ const o={'t s':+(r.t/1000).toFixed(3),Activity:r.act,'Conf %':Math.round(r.conf*100),Phase:r.phase}; keys.forEach(k=>o[k]=+r.a[k].toFixed(1)); o['COM x']=+r.com.x.toFixed(3); o['COM y']=+r.com.y.toFixed(3); o['COM z']=+r.com.z.toFixed(3); o['Margin cm']=+(r.margin*100).toFixed(1); o['WB L %']=Math.round(r.wb.L*100); o['WB R %']=Math.round(r.wb.R*100); o['Contact L']=r.contact.L?1:0; o['Contact R']=r.contact.R?1:0; o.Flags=r.flags.join('; '); return o; }));
  const out=X.write(wb,{bookType:'xlsx',type:'array'}); return new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}); }
