import{useState,useEffect,useRef,useCallback}from"react";
import{supabase}from"./supabase.js";

const SUBJECTS=["憲法","行政法","民法","民訴","刑法","刑訴","公司法","證交法","保險法","財稅法"];
const SUB_C={"憲法":"#f59e0b","行政法":"#3b82f6","民法":"#10b981","民訴":"#06b6d4","刑法":"#ef4444","刑訴":"#f97316","公司法":"#8b5cf6","證交法":"#ec4899","保險法":"#14b8a6","財稅法":"#6366f1"};
const ITV=[3,7,14,21,30,90],HITV=[1,3,7,10,15,45];
const DC={高:"#c0392b",中:"#e67e22",低:"#27ae60"};
const TC=["#ff6b6b","#ffa94d","#ffd43b","#69db7c","#38d9a9","#4dabf7","#748ffc","#da77f2","#f783ac","#e599f7"];
const RATINGS=[{id:"forgot",label:"完全忘記",color:"#e05252",delta:-2,icon:"😵",fail:"完全忘記"},{id:"hard",label:"勉強記得",color:"#f0a840",delta:-1,icon:"😓"},{id:"good",label:"記住了",color:"#3dba7a",delta:1,icon:"👍"},{id:"easy",label:"很熟",color:"#5b6bff",delta:2,icon:"🔥"}];
const SORTS=[{id:"created_desc",l:"新→舊"},{id:"created_asc",l:"舊→新"},{id:"subject",l:"科目"},{id:"next_date",l:"複習日"},{id:"difficulty",l:"難度"},{id:"name",l:"名稱"}];
const EMPTY_DRAFT={name:"",subject:"憲法",difficulty:"中",notes:"",tags:[],search:"",related:[]};

const gitv=d=>d==="高"?HITV:ITV;
const cNext=(b,s,d)=>{const dy=gitv(d)[s]??gitv(d).at(-1);const x=new Date(b);x.setDate(x.getDate()+dy);return x.toISOString().split("T")[0];};
const td=()=>new Date().toISOString().split("T")[0];
const ddf=ds=>Math.round((new Date(ds)-new Date(td()))/864e5);
const mid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const hsh=s=>{let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return Math.abs(h);};
const tcc=t=>TC[hsh(t)%TC.length];
const db2i=r=>({id:r.id,name:r.name,subject:r.subject,difficulty:r.difficulty,stage:r.stage,created:r.created,nextDate:r.next_date,lastReviewed:r.last_reviewed,mastered:r.mastered,errors:r.errors||[],related:r.related||[],notes:r.notes||"",tags:r.tags||[]});
const i2db=i=>({id:i.id,name:i.name,subject:i.subject,difficulty:i.difficulty,stage:i.stage,created:i.created,next_date:i.nextDate,last_reviewed:i.lastReviewed,mastered:i.mastered,errors:i.errors||[],related:i.related||[],notes:i.notes||"",tags:i.tags||[],updated_at:new Date().toISOString()});
const gRel=(is,all)=>all.filter(i=>(is.related||[]).includes(i.id)||(i.related||[]).includes(is.id)).filter(i=>i.id!==is.id);
const gBack=(is,all)=>all.filter(i=>i.id!==is.id&&(i.notes||"").includes(`[[${is.name}]]`));
function pSort(l){const d={高:0,中:1,低:2};return[...l].sort((a,b)=>{const ad=-ddf(a.nextDate||td()),bd=-ddf(b.nextDate||td());if(ad!==bd)return bd-ad;if((d[a.difficulty]??1)!==(d[b.difficulty]??1))return(d[a.difficulty]??1)-(d[b.difficulty]??1);if((b.errors||[]).length!==(a.errors||[]).length)return(b.errors||[]).length-(a.errors||[]).length;return a.stage-b.stage;});}
function doSort(l,by){const a=[...l];switch(by){case"created_desc":return a.sort((x,y)=>(y.created||"").localeCompare(x.created||""));case"created_asc":return a.sort((x,y)=>(x.created||"").localeCompare(y.created||""));case"subject":return a.sort((x,y)=>SUBJECTS.indexOf(x.subject)-SUBJECTS.indexOf(y.subject));case"next_date":return a.sort((x,y)=>(x.nextDate||"9999").localeCompare(y.nextDate||"9999"));case"difficulty":{const o={高:0,中:1,低:2};return a.sort((x,y)=>(o[x.difficulty]??1)-(o[y.difficulty]??1));}case"name":return a.sort((x,y)=>x.name.localeCompare(y.name,"zh-Hant"));default:return a;}}
function subSt(iss,sub){const s=iss.filter(i=>i.subject===sub);const t=s.length;if(!t)return{total:0,mastered:0,avgPct:0,rr:0};const m=s.filter(i=>i.mastered).length;const avg=s.reduce((a,i)=>a+i.stage,0)/t;let tr=0,rm=0;s.forEach(i=>{const e=(i.errors||[]).length;tr+=i.stage+e;rm+=i.stage;});return{total:t,mastered:m,avgPct:Math.round(avg/6*100),rr:tr>0?Math.round(rm/tr*100):0};}

// ═══ 筆記渲染 ═══
function rNotes(text,issues,onClick){
  if(!text?.trim())return null;
  return text.split("\n").map((line,i)=>{
    const m=line.match(/^(\s*)([-•◦‣] )?(.*)$/);
    if(!m)return mLine(line,0,i,issues,onClick);
    const sp=m[1]||"",bul=m[2]||"",ct=m[3]||"";
    if(bul)return mLine(ct,Math.floor(sp.length/2)+1,i,issues,onClick);
    return mLine(line,0,i,issues,onClick);
  });
}
function mLine(text,ind,key,issues,onClick){
  const parts=text.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|\*[^*]+\*)/).map((p,i)=>{
    const lm=p.match(/^\[\[([^\]]+)\]\]$/);
    if(lm){const f=issues.find(x=>x.name===lm[1]);return<span key={i} onClick={e=>{e.stopPropagation();f&&onClick?.(f.id);}} style={{color:"#5b6bff",cursor:f?"pointer":"default",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:2}}>{lm[1]}{!f&&<span style={{color:"#e05252",fontSize:9,marginLeft:2}}>?</span>}</span>;}
    if(p.startsWith("**")&&p.endsWith("**"))return<strong key={i} style={{color:"#e8eaf0"}}>{p.slice(2,-2)}</strong>;
    if(p.startsWith("*")&&p.endsWith("*"))return<em key={i} style={{color:"#b8a0ff"}}>{p.slice(1,-1)}</em>;
    return<span key={i}>{p}</span>;
  });
  const buls=["•","◦","‣","·"];const cols=["#7b82a0","#5b6bff","#3dba7a","#f0a840","#da77f2"];
  return<div key={key} style={{paddingLeft:ind*20,marginBottom:3,fontSize:13,color:"#e8eaf0",lineHeight:1.8,display:"flex",alignItems:"flex-start"}}>{ind>0&&<span style={{color:cols[Math.min(ind-1,cols.length-1)],marginRight:8,flexShrink:0}}>{buls[Math.min(ind-1,buls.length-1)]}</span>}<span style={{flex:1}}>{parts}</span></div>;
}

const C={bg:"#111318",sf:"#1a1d24",cd:"#1f2330",bd:"#2e3347",tx:"#e8eaf0",mt:"#7b82a0",ac:"#5b6bff",am:"#1e2550",dg:"#e05252",dm:"#3d1a1a",ok:"#3dba7a",om:"#1a3d2d"};
const css=`*{box-sizing:border-box;margin:0;padding:0}html,body,#root{background:${C.bg};color:${C.tx};min-height:100vh}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:3px}
input,select,textarea{background:${C.sf};color:${C.tx};border:1px solid ${C.bd};border-radius:6px;padding:8px 10px;font-size:14px;outline:none;width:100%;font-family:inherit}input:focus,select:focus,textarea:focus{border-color:${C.ac}}
button{cursor:pointer;border:none;border-radius:6px;font-size:13px;padding:7px 14px;transition:opacity .15s;font-family:inherit}button:hover{opacity:.85}button:disabled{opacity:.4}
.tag{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600}
.prog{height:6px;border-radius:3px;background:${C.bd};overflow:hidden}.progf{height:100%;border-radius:3px;transition:width .3s}
.cb{width:18px;height:18px;border-radius:3px;border:1.5px solid ${C.bd};background:transparent;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center}.cb.ck{background:${C.dg};border-color:${C.dg}}
@keyframes spin{to{transform:rotate(360deg)}}.spinner{width:16px;height:16px;border:2px solid ${C.bd};border-top-color:${C.ac};border-radius:50%;animation:spin .8s linear infinite}
.sw{position:relative}.sw input{padding-right:32px}.sc{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:${C.mt};font-size:16px;padding:4px;cursor:pointer}.sc:hover{color:${C.tx}}
textarea.nl{min-height:140px;font-size:14px;line-height:1.8;resize:vertical;border-radius:0 0 6px 6px;border-top:none}
.tb{display:flex;gap:4px;padding:6px 8px;background:${C.sf};border:1px solid ${C.bd};border-bottom:none;border-radius:6px 6px 0 0;flex-wrap:wrap;align-items:center}
.tb button{padding:5px 10px;font-size:12px;background:${C.bg};color:${C.mt};border:1px solid ${C.bd};border-radius:4px;min-width:36px}
.tb button:hover{color:${C.ac};border-color:${C.ac}}
.ne-preview{background:${C.bg};border:1px solid ${C.bd};border-radius:6px;padding:10px 12px;margin-bottom:8px;max-height:200px;overflow-y:auto;min-height:40px}
@keyframes fi{from{opacity:0;transform:rotateX(-10deg)}to{opacity:1;transform:rotateX(0)}}.fi{animation:fi .3s ease}`;

// ═══ 共用元件 ═══
const ST=({s})=>{const c=SUB_C[s]||C.ac;return<span className="tag" style={{background:c+"20",color:c,border:`1px solid ${c}40`}}>{s}</span>;};
const CT=({t})=>{const c=tcc(t);return<span className="tag" style={{background:c+"25",color:c,border:`1px solid ${c}50`,fontWeight:600}}>{t}</span>;};
const SI=({v,oc,p})=><div className="sw"><input value={v} onChange={e=>oc(e.target.value)} placeholder={p||"🔍 搜尋…"}/>{v&&<button className="sc" onClick={()=>oc("")}>✕</button>}</div>;
const Sec=({t,ch})=><div style={{marginBottom:22}}><div style={{fontSize:11,fontWeight:600,color:C.mt,letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>{t}</div>{ch}</div>;
const SB=({l,v,c})=><div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,padding:"12px 15px"}}><div style={{fontSize:11,color:C.mt,marginBottom:4}}>{l}</div><div style={{fontSize:22,fontWeight:700,color:c||C.tx}}>{v}</div></div>;
const Lb=({ch})=><div style={{fontSize:12,color:C.mt,marginBottom:5,fontWeight:600}}>{ch}</div>;
const Ov=({ch,oc})=><div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={oc}><div style={{background:C.cd,border:`1px solid ${C.bd}`,borderRadius:12,minWidth:280,maxWidth:540,width:"100%",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>{ch}</div></div>;
const RB=({onRate,sm})=><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:sm?6:8}}>{RATINGS.map(r=><button key={r.id} onClick={()=>onRate(r)} style={{background:r.color+"20",color:r.color,border:`1px solid ${r.color}40`,padding:sm?"8px 2px":"12px 4px",borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",gap:sm?2:4}}><span style={{fontSize:sm?14:20}}>{r.icon}</span><span style={{fontSize:sm?9:11,fontWeight:600}}>{r.label}</span>{!sm&&<span style={{fontSize:9,color:C.mt}}>{r.delta>0?"+":""}{r.delta}階</span>}</button>)}</div>;

function TI({tags,setTags,allTags}){const[inp,si]=useState("");const sg=inp.length>=1?allTags.filter(t=>t.includes(inp)&&!tags.includes(t)):[];const add=t=>{const tr=t.trim();if(tr&&!tags.includes(tr))setTags([...tags,tr]);si("");};
  return<div><div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>{tags.map(t=><span key={t} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:4,fontSize:11,fontWeight:600,background:tcc(t)+"25",color:tcc(t),border:`1px solid ${tcc(t)}50`}}>{t}<span onClick={()=>setTags(tags.filter(x=>x!==t))} style={{marginLeft:2,cursor:"pointer",opacity:.7}}>✕</span></span>)}</div><div style={{display:"flex",gap:6}}><input value={inp} onChange={e=>si(e.target.value)} placeholder="輸入標籤" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add(inp);}}} style={{flex:1}}/><button onClick={()=>add(inp)} disabled={!inp.trim()} style={{background:C.ac,color:"#fff",padding:"6px 12px",flexShrink:0,fontSize:12}}>加入</button></div>{sg.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>{sg.slice(0,8).map(t=><span key={t} onClick={()=>add(t)} style={{display:"inline-flex",padding:"3px 8px",borderRadius:4,fontSize:11,fontWeight:600,background:tcc(t)+"15",color:tcc(t),border:`1px solid ${tcc(t)}30`,cursor:"pointer"}}>+ {t}</span>)}</div>}</div>;}

const SRow=({sub,iss})=>{const s=subSt(iss,sub);const c=SUB_C[sub];if(!s.total)return<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{width:50,fontSize:12,color:c,fontWeight:600,flexShrink:0}}>{sub}</span><div className="prog" style={{flex:1}}><div className="progf" style={{width:"0%"}}/></div><span style={{fontSize:10,color:C.mt,width:140,textAlign:"right"}}>0 題</span></div>;const pc=s.avgPct>=70?"#3dba7a":s.avgPct>=40?"#f0a840":"#e05252";return<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{width:50,fontSize:12,color:c,fontWeight:600,flexShrink:0}}>{sub}</span><div className="prog" style={{flex:1}}><div className="progf" style={{width:`${s.avgPct}%`,background:pc}}/></div><span style={{fontSize:10,color:C.mt,width:140,textAlign:"right",flexShrink:0}}>進度{s.avgPct}% · 記住{s.rr}% · {s.mastered}/{s.total}</span></div>;};

// ═══ 筆記編輯器（即時預覽+工具列）═══
function NE({value,onChange,issues}){
  const ref=useRef(null);
  const[lnk,sLnk]=useState(false);
  const[lq,sLq]=useState("");
  const[showPv,setPv]=useState(true);

  function ins(before,after=""){const ta=ref.current;if(!ta)return;const s=ta.selectionStart,e=ta.selectionEnd,sel=value.substring(s,e);const nv=value.substring(0,s)+before+sel+after+value.substring(e);onChange(nv);setTimeout(()=>{ta.focus();const p=s+before.length+(sel?sel.length+after.length:0);ta.setSelectionRange(p,p);},10);}
  function addBul(){const ta=ref.current;if(!ta)return;const s=ta.selectionStart;const ls=value.lastIndexOf("\n",s-1)+1;const nv=value.substring(0,ls)+"- "+value.substring(ls);onChange(nv);setTimeout(()=>{ta.focus();ta.setSelectionRange(s+2,s+2);},10);}
  function addInd(){const ta=ref.current;if(!ta)return;const s=ta.selectionStart;const ls=value.lastIndexOf("\n",s-1)+1;const nv=value.substring(0,ls)+"  "+value.substring(ls);onChange(nv);setTimeout(()=>{ta.focus();ta.setSelectionRange(s+2,s+2);},10);}
  function insLink(name){ins(`[[${name}]]`);sLnk(false);sLq("");}
  const lr=lq.length>=1?(issues||[]).filter(i=>i.name.includes(lq)).slice(0,6):[];

  return<div>
    {showPv&&value.trim()&&<div className="ne-preview"><div style={{fontSize:11,color:C.mt,marginBottom:6,display:"flex",justifyContent:"space-between"}}><span>預覽</span><span onClick={()=>setPv(false)} style={{cursor:"pointer"}}>收合 ▲</span></div>{rNotes(value,issues||[],null)}</div>}
    {!showPv&&value.trim()&&<div style={{fontSize:11,color:C.ac,marginBottom:4,cursor:"pointer"}} onClick={()=>setPv(true)}>展開預覽 ▼</div>}
    <div className="tb">
      <button onClick={addBul} title="項目">• 項目</button>
      <button onClick={addInd} title="縮排">↳ 縮排</button>
      <button onClick={()=>sLnk(!lnk)} title="連結" style={lnk?{color:C.ac,borderColor:C.ac}:{}}>🔗 連結</button>
      <button onClick={()=>ins("**","**")} title="粗體"><strong>B</strong></button>
      <button onClick={()=>ins("*","*")} title="斜體"><em>I</em></button>
    </div>
    {lnk&&<div style={{background:C.sf,border:`1px solid ${C.bd}`,borderLeft:`1px solid ${C.bd}`,borderRight:`1px solid ${C.bd}`,padding:8}}>
      <input value={lq} onChange={e=>sLq(e.target.value)} placeholder="搜尋爭點名稱…" style={{fontSize:13,padding:"6px 8px"}} autoFocus/>
      {lr.length>0&&<div style={{marginTop:4,maxHeight:120,overflowY:"auto"}}>{lr.map(i=><div key={i.id} onClick={()=>insLink(i.name)} style={{padding:"6px 8px",cursor:"pointer",fontSize:12,borderBottom:`1px solid ${C.bd}`}}><ST s={i.subject}/> <span style={{marginLeft:4}}>{i.name}</span></div>)}</div>}
      {lq&&!lr.length&&<div style={{fontSize:11,color:C.mt,padding:"6px 0"}}>找不到，可直接輸入 [[{lq}]]</div>}
    </div>}
    <textarea ref={ref} className="nl" value={value} onChange={e=>onChange(e.target.value)} placeholder="輸入筆記…&#10;&#10;工具列可快速插入格式" onKeyDown={e=>{
      if(e.key==="Enter"){const ta=e.target;const pos=ta.selectionStart;const ls=value.lastIndexOf("\n",pos-1)+1;const line=value.substring(ls,pos);const bm=line.match(/^(\s*)([-•◦‣] )/);if(bm){e.preventDefault();const indent=bm[1]+bm[2];const nv=value.substring(0,pos)+"\n"+indent+value.substring(pos);onChange(nv);setTimeout(()=>{ta.focus();const np=pos+1+indent.length;ta.setSelectionRange(np,np);},10);}}
      if(e.key==="Tab"){e.preventDefault();addInd();}
    }}/>
  </div>;
}

// ═══ 共用編輯面板 ═══
function EP({issue,issues,allTags,editIssue,onDone}){
  const[n,sN]=useState(issue.name);const[sub,sS]=useState(issue.subject);const[df,sD]=useState(issue.difficulty);const[nt,sNt]=useState(issue.notes||"");const[tg,sTg]=useState(issue.tags||[]);const[rs,sRs]=useState("");const[rl,sRl]=useState(issue.related||[]);
  const res=rs.length>=1?issues.filter(i=>(i.name.includes(rs)||i.subject.includes(rs))&&i.id!==issue.id&&!rl.includes(i.id)):[];
  const save=()=>{editIssue(issue.id,{name:n.trim()||issue.name,subject:sub,difficulty:df,related:rl,notes:nt,tags:tg});onDone();};
  return<div style={{borderTop:`1px solid ${C.bd}`,paddingTop:12}}>
    <div style={{marginBottom:10}}><Lb ch="爭點名稱"/><input value={n} onChange={e=>sN(e.target.value)}/></div>
    <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}><div><Lb ch="科目"/><select value={sub} onChange={e=>sS(e.target.value)} style={{width:"auto"}}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></div><div><Lb ch="難度"/><select value={df} onChange={e=>sD(e.target.value)} style={{width:"auto"}}>{["高","中","低"].map(d=><option key={d}>{d}</option>)}</select></div></div>
    <div style={{marginBottom:10}}><Lb ch="筆記"/><NE value={nt} onChange={sNt} issues={issues}/></div>
    <div style={{marginBottom:10}}><Lb ch="標籤"/><TI tags={tg} setTags={sTg} allTags={allTags}/></div>
    <Lb ch="關聯爭點"/><SI v={rs} oc={sRs} p="搜尋爭點…"/>
    {res.length>0&&<div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:5,marginTop:4,marginBottom:6,maxHeight:120,overflowY:"auto"}}>{res.slice(0,5).map(i=><div key={i.id} onClick={()=>{sRl(r=>[...r,i.id]);sRs("");}} style={{padding:"7px 10px",cursor:"pointer",fontSize:12}}>{i.subject} · {i.name}</div>)}</div>}
    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6,marginBottom:10}}>{rl.map(id=>{const i=issues.find(x=>x.id===id);if(!i)return null;return<span key={id} className="tag" style={{background:C.am,color:C.ac,fontSize:11}}>{i.name}<span onClick={()=>sRl(r=>r.filter(x=>x!==id))} style={{marginLeft:3,cursor:"pointer",opacity:.7}}>✕</span></span>;})}</div>
    <div style={{display:"flex",gap:8}}><button onClick={save} style={{background:C.ac,color:"#fff",fontSize:13,padding:"9px 20px"}}>儲存</button><button onClick={onDone} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:13,padding:"9px 16px"}}>取消</button></div>
  </div>;
}

// ═══ 主 App ═══
export default function App(){
  const[tab,setTab]=useState("dashboard");const[issues,setIssues]=useState(null);const[log,setLog]=useState({});const[sprint,setSprint]=useState(false);const[limit,setLimit]=useState(30);const[modal,setModal]=useState(null);const[sync,setSync]=useState("loading");const[js,setJs]=useState("");const[vid,setVid]=useState(null);const[fc,_setFc]=useState(false);const fcR=useRef(false);const setFc=v=>{fcR.current=v;_setFc(v);};const[draft,setDraft]=useState({...EMPTY_DRAFT});const ss=useRef(Date.now());

  const load=useCallback(async()=>{try{setSync("loading");const[iR,lR,sR,dR]=await Promise.all([supabase.from("issues").select("*"),supabase.from("study_log").select("*"),supabase.from("settings").select("*").eq("key","sprint_mode").maybeSingle(),supabase.from("settings").select("*").eq("key","daily_limit").maybeSingle()]);if(iR.error)throw iR.error;setIssues((iR.data||[]).map(db2i));const l={};(lR.data||[]).forEach(r=>{l[r.date]=r.minutes;});setLog(l);setSprint(sR.data?.value===true);if(dR.data?.value)setLimit(dR.data.value);setSync("synced");}catch(e){console.error(e);setSync("error");}},[]);

  useEffect(()=>{load();const ch=supabase.channel("sync").on("postgres_changes",{event:"*",schema:"public",table:"issues"},()=>{if(!fcR.current)load();}).on("postgres_changes",{event:"*",schema:"public",table:"study_log"},()=>{if(!fcR.current)load();}).on("postgres_changes",{event:"*",schema:"public",table:"settings"},()=>{if(!fcR.current)load();}).subscribe();ss.current=Date.now();return()=>{ch.unsubscribe();const el=Math.floor((Date.now()-ss.current)/60000);if(el>0)supabase.from("study_log").upsert({date:td(),minutes:(log[td()]||0)+el});};},[load]);

  const gDue=i=>{if(sprint&&i.stage<6){const d=new Date(i.lastReviewed||i.created);d.setDate(d.getDate()+2);return d.toISOString().split("T")[0];}return i.nextDate;};
  const isDue=i=>!i.mastered&&i.stage<6&&gDue(i)<=td();
  async function sv(i){setSync("saving");const{error}=await supabase.from("issues").upsert(i2db(i));setSync(error?"error":"synced");}
  async function rate(is,r){const ns=Math.max(0,Math.min(6,is.stage+r.delta));const m=ns>=6;const errs=r.fail?[...(is.errors||[]),{date:td(),reason:r.fail}]:(is.errors||[]);const next={...is,stage:ns,lastReviewed:td(),nextDate:m?null:cNext(td(),ns,is.difficulty),mastered:m,errors:errs};setIssues(a=>a.map(i=>i.id===is.id?next:i));await sv(next);}
  async function addI(is){const n={...is,id:mid(),created:td(),stage:0,nextDate:cNext(td(),0,is.difficulty),lastReviewed:null,mastered:false,errors:[],related:is.related||[]};setIssues(a=>[...a,n]);await sv(n);}
  async function editI(id,ch){const u=issues.find(i=>i.id===id);if(!u)return;const n={...u,...ch};setIssues(a=>a.map(i=>i.id===id?n:i));await sv(n);}
  async function delM(ids){setIssues(a=>a.filter(i=>!ids.includes(i.id)));setSync("saving");await supabase.from("issues").delete().in("id",ids);setSync("synced");}
  async function del1(id){setIssues(a=>a.filter(i=>i.id!==id));if(vid===id)setVid(null);setSync("saving");await supabase.from("issues").delete().eq("id",id);setSync("synced");}
  async function togSp(){const n=!sprint;setSprint(n);await supabase.from("settings").upsert({key:"sprint_mode",value:n});}
  async function setLim(v){const val=Math.max(1,Math.min(200,v));setLimit(val);await supabase.from("settings").upsert({key:"daily_limit",value:val});}
  const jumpTo=name=>{setJs(name);setTab("overview");setVid(null);};
  const openD=id=>setVid(id);
  const allTags=[...new Set((issues||[]).flatMap(i=>i.tags||[]))].sort();
  const vi=vid?(issues||[]).find(i=>i.id===vid):null;

  if(!issues)return<><style>{css}</style><div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,color:C.mt,padding:20}}><div style={{fontSize:32}}>⚖️</div><div style={{color:C.tx,fontWeight:600,fontSize:16}}>司法考試複習追蹤器</div><div className="spinner"/><div style={{fontSize:12}}>{sync==="error"?"連線失敗":"連接中…"}</div>{sync==="error"&&<button onClick={load} style={{background:C.ac,color:"#fff",padding:"8px 20px"}}>重試</button>}</div></>;

  const allDue=pSort(issues.filter(isDue));const todayDue=allDue.slice(0,limit);const ovf=Math.max(0,allDue.length-limit);
  const scl=sync==="synced"?C.ok:sync==="error"?C.dg:"#f0a840";const slb=sync==="synced"?"● 已同步":sync==="saving"?"● 儲存中":"● 讀取中";
  const tabs=[{id:"dashboard",l:"首頁"},{id:"add",l:"新增"},{id:"overview",l:"總覽"},{id:"stats",l:"統計"}];

  if(fc)return<><style>{css}</style><FCM issues={issues} queue={todayDue} rate={rate} exit={()=>setFc(false)}/></>;

  return<><style>{css}</style><div style={{minHeight:"100vh",background:C.bg}}>
    {sprint&&<div style={{background:C.dg,color:"#fff",textAlign:"center",padding:8,fontWeight:600,fontSize:12}}>⚠ 考前衝刺模式</div>}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:C.sf,borderBottom:`1px solid ${C.bd}`,position:"sticky",top:0,zIndex:100,flexWrap:"wrap",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontWeight:700,fontSize:14}}>⚖️ 司法考試複習</span><span style={{fontSize:10,color:scl}}>{slb}</span></div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?C.ac:"transparent",color:tab===t.id?"#fff":C.mt,border:`1px solid ${tab===t.id?C.ac:C.bd}`,padding:"6px 12px",borderRadius:6,fontSize:13}}>{t.l}</button>)}<button onClick={togSp} style={{background:sprint?C.dg:"transparent",color:sprint?"#fff":C.mt,border:`1px solid ${sprint?C.dg:C.bd}`,padding:"6px 12px",borderRadius:6,fontSize:13}}>{sprint?"衝刺中":"衝刺"}</button></div>
    </div>
    <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
      {tab==="dashboard"&&<Dash issues={issues} due={todayDue} allN={allDue.length} ovf={ovf} limit={limit} setLim={setLim} mins={log[td()]||0} rate={rate} gDue={gDue} openD={openD} startFC={()=>setFc(true)}/>}
      {tab==="add"&&<AddP issues={issues} onAdd={addI} setTab={setTab} allTags={allTags} draft={draft} setDraft={setDraft}/>}
      {tab==="overview"&&<OvW issues={issues} rate={rate} isDue={isDue} editI={editI} delM={delM} del1={del1} allTags={allTags} js={js} setJs={setJs}/>}
      {tab==="stats"&&<StatsP issues={issues} log={log}/>}
    </div>
    {vi&&!modal&&<Ov ch={<Det issue={vi} issues={issues} allTags={allTags} editI={editI} del1={del1} rate={rate} isDue={isDue} openD={openD} oc={()=>setVid(null)}/>} oc={()=>setVid(null)}/>}
  </div></>;
}

// ═══ 閃卡 ═══
function FCM({issues,queue,rate,exit}){
  const[idx,setIdx]=useState(0);const[fl,setFl]=useState(false);const[res,setRes]=useState([]);const[done,setDone]=useState(false);
  const cur=queue[idx];const rel=cur?gRel(cur,issues):[];const bl=cur?gBack(cur,issues):[];
  async function go(r){await rate(cur,r);setRes(p=>[...p,{issue:cur,rating:r}]);setFl(false);idx+1>=queue.length?setDone(true):setIdx(idx+1);}
  if(!queue.length)return<div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:20}}><div style={{fontSize:40}}>🎉</div><div style={{fontSize:18,fontWeight:600}}>今天沒有到期爭點！</div><button onClick={exit} style={{background:C.ac,color:"#fff",padding:"10px 24px"}}>返回</button></div>;
  if(done){const ct={};RATINGS.forEach(r=>ct[r.id]=0);res.forEach(r=>ct[r.rating.id]++);return<div style={{minHeight:"100vh",background:C.bg,padding:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}><div style={{fontSize:40}}>📊</div><div style={{fontSize:18,fontWeight:600}}>完成！共 {res.length} 張</div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,width:"100%",maxWidth:400}}>{RATINGS.map(r=><div key={r.id} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,padding:12,textAlign:"center"}}><div style={{fontSize:20}}>{r.icon}</div><div style={{fontSize:11,color:r.color,fontWeight:600,marginTop:4}}>{r.label}</div><div style={{fontSize:22,fontWeight:700,marginTop:4}}>{ct[r.id]}</div></div>)}</div><button onClick={exit} style={{background:C.ac,color:"#fff",padding:"10px 24px",marginTop:8}}>返回首頁</button></div>;}
  return<div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:C.sf,borderBottom:`1px solid ${C.bd}`}}><button onClick={exit} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:12,padding:"5px 12px"}}>✕ 退出</button><span style={{fontSize:13,color:C.mt}}>{idx+1}/{queue.length}</span><div className="prog" style={{width:120}}><div className="progf" style={{width:`${idx/queue.length*100}%`,background:C.ac}}/></div></div>
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,maxWidth:600,margin:"0 auto",width:"100%"}}>
      <div style={{width:"100%",background:C.cd,border:`1px solid ${C.bd}`,borderRadius:12,padding:24,marginBottom:20}}>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}><ST s={cur.subject}/><span className="tag" style={{background:"transparent",color:DC[cur.difficulty],border:`1px solid ${DC[cur.difficulty]}`}}>{cur.difficulty}</span><span style={{fontSize:11,color:C.mt,marginLeft:"auto"}}>階段 {cur.stage}/6</span></div>
        <div style={{fontSize:20,fontWeight:700,textAlign:"center",padding:"20px 0",lineHeight:1.5}}>{cur.name}</div>
        {(cur.tags||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center",marginTop:8}}>{cur.tags.map(t=><CT key={t} t={t}/>)}</div>}
      </div>
      {!fl?<button onClick={()=>setFl(true)} style={{background:C.ac,color:"#fff",padding:"14px 40px",fontSize:16,fontWeight:600,borderRadius:10}}>翻牌查看 ▼</button>
      :<div className="fi" style={{width:"100%"}}><div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:20,marginBottom:20,maxHeight:"40vh",overflowY:"auto"}}>{(cur.notes||"").trim()?rNotes(cur.notes,issues,null):<div style={{color:C.mt,textAlign:"center",padding:16}}>（尚無筆記）</div>}{rel.length>0&&<div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.bd}`}}><span style={{fontSize:11,color:C.mt}}>關聯：</span>{rel.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.am,color:C.ac,fontSize:11}}>{r.name}</span>)}</div>}{bl.length>0&&<div style={{marginTop:8}}><span style={{fontSize:11,color:C.mt}}>被提及：</span>{bl.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.sf,color:C.mt,fontSize:11,border:`1px solid ${C.bd}`}}>{r.name}</span>)}</div>}</div><div style={{fontSize:13,color:C.mt,textAlign:"center",marginBottom:12}}>你記得多少？</div><RB onRate={go}/></div>}
    </div>
  </div>;
}

// ═══ 詳細頁 ═══
function Det({issue:is,issues,allTags,editI,del1,rate,isDue,openD,oc}){
  const[ed,sEd]=useState(false);const[cd,sCd]=useState(false);const itv=gitv(is.difficulty);const rel=gRel(is,issues);const bl=gBack(is,issues);const due=isDue(is);
  return<div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}><div><div style={{fontWeight:700,fontSize:16,marginBottom:6}}>{is.name}</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}><ST s={is.subject}/><span className="tag" style={{background:"transparent",color:DC[is.difficulty],border:`1px solid ${DC[is.difficulty]}`}}>{is.difficulty}</span>{is.mastered&&<span className="tag" style={{background:C.om,color:C.ok}}>已掌握</span>}{due&&!is.mastered&&<span className="tag" style={{background:C.dm,color:C.dg}}>今日到期</span>}</div></div><div style={{display:"flex",gap:4}}>{!ed&&<button onClick={()=>sEd(true)} style={{background:C.am,color:C.ac,fontSize:12,padding:"4px 10px"}}>編輯</button>}<button onClick={oc} style={{background:"transparent",color:C.mt,fontSize:18,padding:"2px 6px",border:"none"}}>✕</button></div></div>
    {!ed?<>
      {(is.tags||[]).length>0&&<div style={{marginBottom:12,display:"flex",flexWrap:"wrap",gap:4}}>{is.tags.map(t=><CT key={t} t={t}/>)}</div>}
      <div style={{marginBottom:12}}><div style={{display:"flex",gap:3,marginBottom:4}}>{itv.map((_,i)=><div key={i} style={{flex:1,height:6,borderRadius:3,background:i<is.stage?C.ac:C.bd}}/>)}</div><div style={{fontSize:12,color:C.mt}}>階段 {Math.min(is.stage,6)}/6{!is.mastered&&is.nextDate&&` · 下次：${is.nextDate}（${ddf(is.nextDate)===0?"今天":ddf(is.nextDate)>0?`${ddf(is.nextDate)}天後`:`逾期${-ddf(is.nextDate)}天`}）`}</div></div>
      {(is.notes||"").trim()&&<div style={{marginBottom:12}}><Lb ch="筆記"/><div style={{background:C.sf,borderRadius:6,padding:"12px 14px"}}>{rNotes(is.notes,issues,openD)}</div></div>}
      {rel.length>0&&<div style={{marginBottom:12}}><Lb ch="關聯爭點"/><div style={{display:"flex",flexDirection:"column",gap:6}}>{rel.map(r=><div key={r.id} onClick={()=>openD(r.id)} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,padding:"9px 12px",cursor:"pointer",fontSize:13}}><ST s={r.subject}/> <span style={{marginLeft:4,fontWeight:500}}>{r.name}</span>{(r.notes||"").trim()&&<div style={{marginTop:4,fontSize:11,color:C.mt,maxHeight:40,overflow:"hidden"}}>{r.notes.slice(0,80)}{r.notes.length>80?"…":""}</div>}</div>)}</div></div>}
      {bl.length>0&&<div style={{marginBottom:12}}><Lb ch="被提及（反向連結）"/><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{bl.map(r=><span key={r.id} onClick={()=>openD(r.id)} className="tag" style={{background:C.sf,color:C.ac,cursor:"pointer",padding:"4px 10px",fontSize:12,border:`1px solid ${C.bd}`}}>{r.name}</span>)}</div></div>}
      {(is.errors||[]).length>0&&<div style={{marginBottom:12}}><Lb ch="錯誤紀錄"/><div style={{background:C.sf,borderRadius:6,padding:"8px 10px"}}>{is.errors.map((e,i)=><div key={i} style={{fontSize:12,color:C.dg,marginBottom:2}}>{e.date} · {e.reason}</div>)}</div></div>}
      {due&&!is.mastered&&<div style={{marginBottom:12}}><div style={{fontSize:12,color:C.mt,marginBottom:8,textAlign:"center"}}>你記得多少？</div><RB onRate={async r=>{await rate(is,r);oc();}}/></div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:11,color:C.mt}}>建立：{is.created}</div>{!cd?<button onClick={()=>sCd(true)} style={{background:"transparent",color:C.dg,border:`1px solid ${C.dg}`,fontSize:11,padding:"4px 10px"}}>刪除</button>:<div style={{display:"flex",gap:4}}><button onClick={()=>{del1(is.id);oc();}} style={{background:C.dg,color:"#fff",fontSize:11,padding:"4px 10px"}}>確認</button><button onClick={()=>sCd(false)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:11,padding:"4px 10px"}}>取消</button></div>}</div>
    </>:<EP issue={is} issues={issues} allTags={allTags} editIssue={editI} onDone={()=>sEd(false)}/>}
  </div>;
}

// ═══ Dashboard ═══
function Dash({issues,due,allN,ovf,limit,setLim,mins,rate,gDue,openD,startFC}){
  const[el,sEl]=useState(false);const[tmp,sTmp]=useState(limit);
  const gr=SUBJECTS.reduce((a,s)=>{const d=due.filter(i=>i.subject===s);if(d.length)a[s]=d;return a;},{});
  const up=issues.filter(i=>!i.mastered&&ddf(gDue(i))>0&&ddf(gDue(i))<=7).sort((a,b)=>gDue(a).localeCompare(gDue(b)));
  return<div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:12}}><SB l="今日到期" v={`${due.length}/${allN}`} c={C.dg}/><SB l="複習時間" v={`${mins} 分`} c={C.ac}/><SB l="總爭點" v={issues.length}/><SB l="已掌握" v={issues.filter(i=>i.mastered).length} c={C.ok}/></div>
    {due.length>0&&<button onClick={startFC} style={{width:"100%",background:"linear-gradient(135deg,#5b6bff,#8b5cf6)",color:"#fff",padding:14,fontSize:15,fontWeight:700,borderRadius:10,marginBottom:16,border:"none"}}>🃏 開始閃卡複習（{due.length} 張）</button>}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,padding:"8px 12px",background:C.sf,borderRadius:6,border:`1px solid ${C.bd}`,flexWrap:"wrap"}}><span style={{fontSize:12,color:C.mt}}>每日上限：</span>{!el?<><span style={{fontSize:14,fontWeight:600}}>{limit} 題</span>{ovf>0&&<span style={{fontSize:11,color:C.dg}}>（{ovf} 題延後）</span>}<button onClick={()=>{sTmp(limit);sEl(true);}} style={{background:"transparent",color:C.ac,border:`1px solid ${C.ac}`,fontSize:11,padding:"3px 10px",marginLeft:"auto"}}>調整</button></>:<><input type="number" value={tmp} onChange={e=>sTmp(Number(e.target.value))} min={1} max={200} style={{width:60,textAlign:"center",padding:4,fontSize:14}}/><button onClick={()=>{setLim(tmp);sEl(false);}} style={{background:C.ac,color:"#fff",fontSize:11,padding:"4px 10px"}}>確認</button><button onClick={()=>sEl(false)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:11,padding:"4px 10px"}}>取消</button></>}</div>
    <Sec t="各科複習進度" ch={SUBJECTS.map(s=><SRow key={s} sub={s} iss={issues}/>)}/>
    {Object.keys(gr).length>0&&<Sec t={`今日複習（${due.length}）`} ch={Object.entries(gr).map(([s,l])=><div key={s} style={{marginBottom:14}}><div style={{fontSize:12,fontWeight:600,color:SUB_C[s],marginBottom:6}}>{s}</div><div style={{display:"flex",flexDirection:"column",gap:6}}>{l.map(i=><Row key={i.id} i={i} rate={rate} openD={openD}/>)}</div></div>)}/>}
    {up.length>0&&<Sec t="未來 7 天到期" ch={<div style={{display:"flex",flexDirection:"column",gap:6}}>{up.map(i=>{const d=ddf(gDue(i));return<div key={i.id} onClick={()=>openD(i.id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,cursor:"pointer"}}><span style={{fontSize:13}}>{i.name}</span><div style={{display:"flex",gap:6,alignItems:"center"}}><ST s={i.subject}/><span style={{fontSize:11,color:C.mt}}>{d}天後</span></div></div>;})}</div>}/>}
  </div>;
}

function Row({i,rate,openD}){const[sr,sSr]=useState(false);
  return<div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",gap:8,flexWrap:"wrap"}}><div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>openD(i.id)}><span style={{fontSize:13,fontWeight:500}}>{i.name}</span><span style={{marginLeft:6}}><ST s={i.subject}/></span><span className="tag" style={{marginLeft:3,background:"transparent",color:DC[i.difficulty],border:`1px solid ${DC[i.difficulty]}`,fontSize:10}}>{i.difficulty}</span>{(i.tags||[]).length>0&&<span style={{marginLeft:4,fontSize:10,color:tcc(i.tags[0])}}>🏷{i.tags.length}</span>}{(i.notes||"").trim()&&<span style={{marginLeft:4,fontSize:10,color:C.mt}}>📝</span>}</div><button onClick={e=>{e.stopPropagation();sSr(!sr);}} style={{background:C.am,color:C.ac,fontSize:11,padding:"5px 10px",flexShrink:0}}>{sr?"收起":"評分"}</button></div>{sr&&<div style={{padding:"0 12px 10px"}}><RB onRate={async r=>{await rate(i,r);sSr(false);}} sm/></div>}</div>;
}

// ═══ 新增（草稿暫存）═══
function AddP({issues,onAdd,setTab,allTags,draft,setDraft}){
  const{name,subject,difficulty,notes,tags,search,related}=draft;
  const up=(k,v)=>setDraft(d=>({...d,[k]:v}));
  const res=search.length>=1?issues.filter(i=>(i.name.includes(search)||i.subject.includes(search))&&!related.includes(i.id)):[];
  const submit=()=>{if(!name.trim())return;onAdd({name:name.trim(),subject,difficulty,related,notes,tags});setDraft({...EMPTY_DRAFT});setTab("overview");};
  return<div style={{maxWidth:600}}><Sec t="新增爭點" ch={<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div><Lb ch="爭點名稱"/><input value={name} onChange={e=>up("name",e.target.value)} placeholder="例：法人格否認理論的要件" onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><Lb ch="科目"/><select value={subject} onChange={e=>up("subject",e.target.value)}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></div><div><Lb ch="難度"/><select value={difficulty} onChange={e=>up("difficulty",e.target.value)}>{["高","中","低"].map(d=><option key={d}>{d}</option>)}</select></div></div>
    <div><Lb ch="筆記"/><NE value={notes} onChange={v=>up("notes",v)} issues={issues}/></div>
    <div><Lb ch="標籤"/><TI tags={tags} setTags={v=>up("tags",v)} allTags={allTags}/></div>
    <div><Lb ch="關聯爭點"/><SI v={search} oc={v=>up("search",v)} p="搜尋現有爭點…"/>{res.length>0&&<div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:4,maxHeight:160,overflowY:"auto"}}>{res.slice(0,8).map(i=><div key={i.id} onClick={()=>{up("related",[...related,i.id]);up("search","");}} style={{padding:"8px 12px",cursor:"pointer",borderBottom:`1px solid ${C.bd}`,fontSize:13}}><ST s={i.subject}/> <span style={{marginLeft:4}}>{i.name}</span></div>)}</div>}<div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:6}}>{related.map(id=>{const i=issues.find(x=>x.id===id);if(!i)return null;return<span key={id} className="tag" style={{background:C.am,color:C.ac,padding:"3px 8px"}}>{i.name}<span onClick={()=>up("related",related.filter(x=>x!==id))} style={{marginLeft:4,cursor:"pointer",opacity:.7}}>✕</span></span>;})}</div></div>
    <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,padding:"10px 12px",fontSize:12,color:C.mt}}>第一次複習日：<strong style={{color:C.tx}}>{cNext(td(),0,difficulty)}（{difficulty==="高"?"1":"3"} 天後）</strong><br/>間隔：{gitv(difficulty).join(" → ")} 天</div>
    <button onClick={submit} disabled={!name.trim()} style={{background:C.ac,color:"#fff",padding:11,fontWeight:600,fontSize:14}}>新增爭點</button>
  </div>}/></div>;
}

// ═══ 總覽 ═══
function OvW({issues,rate,isDue,editI,delM,del1,allTags,js,setJs}){
  const[sf,sSf]=useState("全部");const[stf,sStf]=useState("全部");const[tf,sTf]=useState("全部");const[sq,sSq]=useState(js||"");const[sb,sSb]=useState("created_desc");const[eid,sEid]=useState(null);const[sel,sSel]=useState(new Set());const[dm,sDm]=useState(false);
  useEffect(()=>{if(js){sSq(js);setJs("");}},[js]);
  let f=issues;if(sf!=="全部")f=f.filter(i=>i.subject===sf);if(stf==="今日待複習")f=f.filter(isDue);else if(stf==="進行中")f=f.filter(i=>!i.mastered&&!isDue(i));else if(stf==="已掌握")f=f.filter(i=>i.mastered);if(tf!=="全部")f=f.filter(i=>(i.tags||[]).includes(tf));if(sq.trim()){const q=sq.trim().toLowerCase();f=f.filter(i=>i.name.toLowerCase().includes(q)||i.subject.includes(q)||(i.notes||"").toLowerCase().includes(q)||(i.tags||[]).some(t=>t.includes(q)));}f=doSort(f,sb);
  const tS=id=>sSel(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  return<div>
    <div style={{marginBottom:12}}><SI v={sq} oc={sSq} p="🔍 搜尋爭點名稱、筆記、標籤…"/><div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center",marginTop:10}}>
      <select value={sf} onChange={e=>sSf(e.target.value)} style={{width:"auto"}}><option>全部</option>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select>
      <select value={stf} onChange={e=>sStf(e.target.value)} style={{width:"auto"}}>{["全部","今日待複習","進行中","已掌握"].map(x=><option key={x}>{x}</option>)}</select>
      {allTags.length>0&&<select value={tf} onChange={e=>sTf(e.target.value)} style={{width:"auto"}}><option>全部</option>{allTags.map(t=><option key={t}>{t}</option>)}</select>}
      <select value={sb} onChange={e=>sSb(e.target.value)} style={{width:"auto"}}>{SORTS.map(o=><option key={o.id} value={o.id}>{o.l}</option>)}</select>
      <span style={{fontSize:12,color:C.mt}}>共 {f.length} 筆</span>
      <div style={{marginLeft:"auto"}}>{!dm?<button onClick={()=>sDm(true)} style={{background:"transparent",color:C.dg,border:`1px solid ${C.dg}`,fontSize:12,padding:"6px 10px"}}>批量刪除</button>:<div style={{display:"flex",gap:6,alignItems:"center"}}><button onClick={()=>sel.size===f.length?sSel(new Set()):sSel(new Set(f.map(i=>i.id)))} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:12,padding:"6px 9px"}}>{sel.size===f.length?"取消全選":"全選"}</button><button onClick={()=>{delM([...sel]);sSel(new Set());sDm(false);}} disabled={!sel.size} style={{background:C.dg,color:"#fff",fontSize:12,padding:"6px 10px"}}>刪除{sel.size?` (${sel.size})`:""}</button><button onClick={()=>{sSel(new Set());sDm(false);}} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:12,padding:"6px 9px"}}>取消</button></div>}</div>
    </div></div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {f.map(i=><Cd key={i.id} i={i} issues={issues} due={isDue(i)} rate={rate} editing={eid===i.id} sEid={sEid} editI={editI} dm={dm} sel={sel.has(i.id)} tS={()=>tS(i.id)} del1={del1} allTags={allTags}/>)}
      {!f.length&&<div style={{color:C.mt,textAlign:"center",padding:40}}>沒有符合條件的爭點</div>}
    </div>
  </div>;
}

function Cd({i,issues,due,rate,editing,sEid,editI,dm,sel,tS,del1,allTags}){
  const[sn,sSn]=useState(false);const[cd,sCd]=useState(false);const[sr,sSr]=useState(false);
  const itv=gitv(i.difficulty);const rel=gRel(i,issues);const bl=gBack(i,issues);
  return<div style={{background:sel?C.dm:C.cd,border:`1px solid ${sel?C.dg:due?C.dg:C.bd}`,borderRadius:8,padding:"13px 15px"}}>
    <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
      {dm&&<div onClick={tS} className={`cb${sel?" ck":""}`} style={{marginTop:2}}>{sel&&<span style={{color:"#fff",fontSize:11,fontWeight:700}}>✓</span>}</div>}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6,marginBottom:9}}><div><span style={{fontWeight:600,fontSize:14}}>{i.name}</span><span style={{marginLeft:6}}><ST s={i.subject}/></span><span className="tag" style={{marginLeft:3,background:"transparent",color:DC[i.difficulty],border:`1px solid ${DC[i.difficulty]}`,fontSize:10}}>{i.difficulty}</span>{i.mastered&&<span className="tag" style={{marginLeft:3,background:C.om,color:C.ok}}>已掌握</span>}{due&&!i.mastered&&<span className="tag" style={{marginLeft:3,background:C.dm,color:C.dg}}>今日到期</span>}</div>{!dm&&<div style={{display:"flex",gap:4}}><button onClick={()=>editing?sEid(null):sEid(i.id)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:11,padding:"3px 8px"}}>編輯</button><button onClick={()=>sCd(true)} style={{background:"transparent",color:C.dg,border:`1px solid ${C.dg}`,fontSize:11,padding:"3px 8px"}}>刪除</button></div>}</div>
        {(i.tags||[]).length>0&&<div style={{marginBottom:7,display:"flex",flexWrap:"wrap",gap:4}}>{i.tags.map(t=><CT key={t} t={t}/>)}</div>}
        <div style={{marginBottom:9}}><div style={{display:"flex",gap:3,marginBottom:4}}>{itv.map((_,x)=><div key={x} style={{flex:1,height:5,borderRadius:3,background:x<i.stage?C.ac:C.bd}}/>)}</div><div style={{fontSize:11,color:C.mt}}>階段 {Math.min(i.stage,6)}/6{!i.mastered&&i.nextDate&&` · 下次：${i.nextDate}（${ddf(i.nextDate)===0?"今天":ddf(i.nextDate)>0?`${ddf(i.nextDate)}天後`:`逾期${-ddf(i.nextDate)}天`}）`}</div></div>
        {(i.notes||"").trim()&&<div style={{marginBottom:8}}><span onClick={()=>sSn(!sn)} style={{fontSize:11,color:C.ac,cursor:"pointer"}}>{sn?"▼ 收起筆記":"▶ 查看筆記"}</span>{sn&&<div style={{marginTop:4,background:C.sf,borderRadius:5,padding:"8px 10px"}}>{rNotes(i.notes,issues,null)}</div>}</div>}
        {rel.length>0&&<div style={{marginBottom:7}}><span style={{fontSize:11,color:C.mt}}>關聯：</span>{rel.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.am,color:C.ac,fontSize:11}}>{r.name}</span>)}</div>}
        {bl.length>0&&<div style={{marginBottom:7}}><span style={{fontSize:11,color:C.mt}}>被提及：</span>{bl.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.sf,color:C.mt,fontSize:11,border:`1px solid ${C.bd}`}}>{r.name}</span>)}</div>}
        {(i.errors||[]).length>0&&<div style={{marginBottom:8,background:C.sf,borderRadius:5,padding:"8px 10px"}}><div style={{fontSize:10,color:C.mt,marginBottom:3}}>錯誤紀錄</div>{i.errors.map((e,x)=><div key={x} style={{fontSize:11,color:C.dg}}>{e.date} · {e.reason}</div>)}</div>}
        {editing&&<EP issue={i} issues={issues} allTags={allTags} editIssue={editI} onDone={()=>sEid(null)}/>}
        {due&&!i.mastered&&!dm&&!editing&&<div style={{marginTop:6}}>{!sr?<button onClick={()=>sSr(true)} style={{width:"100%",background:C.am,color:C.ac,padding:8}}>評分</button>:<RB onRate={async r=>{await rate(i,r);sSr(false);}} sm/>}</div>}
        {cd&&<div style={{marginTop:8,background:C.dm,border:`1px solid ${C.dg}`,borderRadius:6,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:C.dg}}>確定刪除？</span><div style={{display:"flex",gap:6}}><button onClick={()=>del1(i.id)} style={{background:C.dg,color:"#fff",fontSize:12,padding:"5px 10px"}}>確認</button><button onClick={()=>sCd(false)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:12,padding:"5px 10px"}}>取消</button></div></div>}
      </div>
    </div>
  </div>;
}

// ═══ 統計 ═══
function StatsP({issues,log}){
  const l30=Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-29+i);const k=d.toISOString().split("T")[0];return{date:k,mins:log[k]||0};});const mm=Math.max(...l30.map(d=>d.mins),1);
  const ec={};["完全忘記","要件不完整","與其他爭點混淆","其他"].forEach(r=>ec[r]=0);issues.forEach(i=>(i.errors||[]).forEach(e=>{if(ec[e.reason]!==undefined)ec[e.reason]++;}));const me=Math.max(...Object.values(ec),1);
  const cf=issues.map(i=>({...i,cc:(i.errors||[]).filter(e=>e.reason==="與其他爭點混淆").length})).filter(i=>i.cc>0).sort((a,b)=>b.cc-a.cc).slice(0,5);
  return<div style={{display:"flex",flexDirection:"column",gap:24}}>
    <Sec t="各科複習進度" ch={SUBJECTS.map(s=><SRow key={s} sub={s} iss={issues}/>)}/>
    <Sec t="每日複習時間（近 30 天）" ch={<><div style={{display:"flex",alignItems:"flex-end",gap:2,height:80}}>{l30.map((d,i)=>{const h=Math.round(d.mins/mm*74);return<div key={i} title={`${d.date}: ${d.mins}分`} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}><div style={{width:"100%",height:h||2,background:d.date===td()?C.ac:C.am,borderRadius:2,minHeight:2}}/></div>;})}</div><div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.mt,marginTop:4}}><span>30天前</span><span>今天</span></div></>}/>
    <Sec t="失敗原因排行" ch={Object.entries(ec).sort((a,b)=>b[1]-a[1]).map(([r,c])=><div key={r} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{width:110,fontSize:12,color:C.mt,flexShrink:0}}>{r}</span><div className="prog" style={{flex:1}}><div className="progf" style={{width:`${Math.round(c/me*100)}%`,background:C.dg}}/></div><span style={{fontSize:12,color:C.mt,width:24,textAlign:"right"}}>{c}</span></div>)}/>
    {cf.length>0&&<Sec t="高頻混淆爭點" ch={cf.map(i=><div key={i.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.bd}`,fontSize:13}}><span>{i.name}<span style={{marginLeft:6}}><ST s={i.subject}/></span></span><span style={{color:C.dg,fontWeight:600}}>{i.cc} 次</span></div>)}/>}
  </div>;
}
