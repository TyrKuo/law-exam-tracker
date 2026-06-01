import{useState,useEffect,useRef,useCallback}from"react";
import{supabase}from"./supabase.js";

const SUBJECTS=["憲法","行政法","民法","民訴","刑法","刑訴","公司法","證交法","保險法","財稅法"];
const SUB_C={"憲法":"#f59e0b","行政法":"#3b82f6","民法":"#10b981","民訴":"#06b6d4","刑法":"#ef4444","刑訴":"#f97316","公司法":"#8b5cf6","證交法":"#ec4899","保險法":"#14b8a6","財稅法":"#6366f1"};
const ITV=[3,7,14,21,30,90],HITV=[1,3,7,10,15,45];
const DC={高:"#f87171",中:"#fb923c",低:"#4ade80"};
const TC=["#ff6b6b","#ffa94d","#ffd43b","#69db7c","#38d9a9","#4dabf7","#748ffc","#da77f2","#f783ac","#e599f7"];
const RATINGS=[
  {id:"forgot",label:"完全忘記",color:"#f87171",delta:-2,icon:"😵",fail:"完全忘記"},
  {id:"hard",label:"勉強記得",color:"#fb923c",delta:-1,icon:"😓"},
  {id:"good",label:"記住了",color:"#34d399",delta:1,icon:"👍"},
  {id:"easy",label:"很熟",color:"#818cf8",delta:2,icon:"🔥"}
];
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

// 筆記渲染：只保留 [[連結]] 功能（whitespace:pre-wrap 保留換行）
function rNotes(text,issues,onClick){
  if(!text?.trim())return null;
  const parts=text.split(/(\[\[[^\]]+\]\])/).map((p,j)=>{
    const m=p.match(/^\[\[([^\]]+)\]\]$/);
    if(!m)return<span key={j}>{p}</span>;
    const f=issues.find(x=>x.name===m[1]);
    return<span key={j} onClick={e=>{e.stopPropagation();f&&onClick?.(f.id);}} style={{color:"#818cf8",cursor:f?"pointer":"default",textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:2}}>{m[1]}{!f&&<span style={{color:"#f87171",fontSize:11,marginLeft:2}}>?</span>}</span>;
  });
  return<div style={{fontSize:15,color:"#eef0f8",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{parts}</div>;
}

const C={bg:"#0d0d0d",sf:"#161616",cd:"#1f1f1f",bd:"#2e2e2e",tx:"#efefef",mt:"#7a7a7a",ac:"#d4d4d4",am:"#262626",dg:"#f87171",dm:"#2a1818",ok:"#4ade80",om:"#172215"};

const css=`*{box-sizing:border-box;margin:0;padding:0}html,body,#root{background:${C.bg};color:${C.tx};min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:2px}
input,select,textarea{background:${C.sf};color:${C.tx};border:1px solid ${C.bd};border-radius:10px;padding:10px 12px;font-size:14px;outline:none;width:100%;font-family:inherit;transition:border-color .15s}
input:focus,select:focus,textarea:focus{border-color:${C.ac}}
textarea{resize:vertical;min-height:130px;line-height:1.8}
button{cursor:pointer;border:none;border-radius:10px;font-size:13px;padding:8px 16px;transition:opacity .15s;font-family:inherit}button:hover{opacity:.82}button:disabled{opacity:.38;cursor:not-allowed}
.tag{display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600}
.prog{height:4px;border-radius:2px;background:${C.bd};overflow:hidden}.progf{height:100%;border-radius:2px;transition:width .4s}
.cb{width:20px;height:20px;border-radius:6px;border:1.5px solid ${C.bd};background:transparent;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center}.cb.ck{background:${C.dg};border-color:${C.dg}}
@keyframes spin{to{transform:rotate(360deg)}}.spinner{width:20px;height:20px;border:2px solid ${C.bd};border-top-color:${C.ac};border-radius:50%;animation:spin .8s linear infinite}
.sw{position:relative}.sw input{padding-right:36px}.sc{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:${C.mt};font-size:16px;padding:2px 4px;cursor:pointer;border-radius:4px}.sc:hover{color:${C.tx}}
@keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fi .22s ease}`;

// ─── 共用元件 ───
const ST=({s})=>{const c=SUB_C[s]||C.ac;return<span className="tag" style={{background:c+"18",color:c,border:`1px solid ${c}35`}}>{s}</span>;};
const CT=({t})=>{const c=tcc(t);return<span className="tag" style={{background:c+"20",color:c,border:`1px solid ${c}45`,fontWeight:600}}>{t}</span>;};
const SI=({v,oc,p})=><div className="sw"><input value={v} onChange={e=>oc(e.target.value)} placeholder={p||"搜尋…"}/>{v&&<button className="sc" onClick={()=>oc("")}>✕</button>}</div>;
const Lb=({ch})=><div style={{fontSize:14,color:C.mt,marginBottom:6,fontWeight:600,letterSpacing:.3}}>{ch}</div>;
const secT={fontSize:13,color:C.mt,fontWeight:600,marginBottom:12,textTransform:"uppercase",letterSpacing:.5};
const Card=({title,children,m=14})=><div style={{marginBottom:m}}>{title&&<div style={secT}>{title}</div>}<div style={{background:C.cd,borderRadius:14,padding:16,border:`1px solid ${C.bd}`}}>{children}</div></div>;
const Ov=({ch,oc})=><div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={oc}><div style={{background:C.cd,border:`1px solid ${C.bd}`,borderRadius:16,minWidth:300,maxWidth:560,width:"100%",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>{ch}</div></div>;
const RB=({onRate,sm})=><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:sm?5:8}}>{RATINGS.map(r=><button key={r.id} onClick={()=>onRate(r)} style={{background:r.color+"15",color:r.color,border:`1px solid ${r.color}35`,padding:sm?"8px 2px":"14px 4px",borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",gap:sm?2:5}}><span style={{fontSize:sm?16:22}}>{r.icon}</span><span style={{fontSize:sm?9:11,fontWeight:700}}>{r.label}</span>{!sm&&<span style={{fontSize:11,color:C.mt}}>{r.delta>0?"+":""}{r.delta}階</span>}</button>)}</div>;

// 圓形進度環
function Ring({pct,size=90,stroke=8,color,label,value}){
  const r=(size-stroke)/2,circ=2*Math.PI*r,dash=Math.min(pct,100)/100*circ;
  return<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.bd} strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dasharray .5s ease"}}/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        fill={C.tx} fontSize={Math.round(size/5.5)} fontWeight={700} fontFamily="inherit">{value}</text>
    </svg>
    <span style={{fontSize:12,color:C.mt,textAlign:"center"}}>{label}</span>
  </div>;
}

// 週視圖長條圖（依 lastReviewed 計題數）
function WeekBar({issues}){
  const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);const k=d.toISOString().split("T")[0];return{date:k,label:["日","一","二","三","四","五","六"][d.getDay()],count:issues.filter(x=>x.lastReviewed===k).length};});
  const max=Math.max(...days.map(d=>d.count),1);const today=td();
  return<div>
    <div style={{display:"flex",alignItems:"flex-end",gap:6,height:56,padding:"0 2px"}}>
      {days.map(d=><div key={d.date} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
        <div style={{width:"100%",height:d.count>0?Math.max(d.count/max*48,6):3,background:d.date===today?C.ac:d.count>0?C.ac+"55":C.bd,borderRadius:4,transition:"height .4s ease"}}/>
      </div>)}
    </div>
    <div style={{display:"flex",gap:6,padding:"5px 2px 0"}}>
      {days.map(d=><div key={d.date} style={{flex:1,textAlign:"center",fontSize:11,color:d.date===today?C.ac:C.mt,fontWeight:d.date===today?700:400}}>{d.label}</div>)}
    </div>
  </div>;
}

// 標籤輸入
function TI({tags,setTags,allTags}){
  const[inp,si]=useState("");const sg=inp.length>=1?allTags.filter(t=>t.includes(inp)&&!tags.includes(t)):[];
  const add=t=>{const tr=t.trim();if(tr&&!tags.includes(tr))setTags([...tags,tr]);si("");};
  return<div>
    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>{tags.map(t=><span key={t} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:6,fontSize:13,fontWeight:600,background:tcc(t)+"20",color:tcc(t),border:`1px solid ${tcc(t)}45`}}>{t}<span onClick={()=>setTags(tags.filter(x=>x!==t))} style={{marginLeft:2,cursor:"pointer",opacity:.7}}>✕</span></span>)}</div>
    <div style={{display:"flex",gap:6}}><input value={inp} onChange={e=>si(e.target.value)} placeholder="輸入標籤" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add(inp);}}} style={{flex:1}}/><button onClick={()=>add(inp)} disabled={!inp.trim()} style={{background:C.ac,color:"#fff",padding:"8px 14px",flexShrink:0,fontSize:14,fontWeight:600}}>加入</button></div>
    {sg.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>{sg.slice(0,8).map(t=><span key={t} onClick={()=>add(t)} style={{display:"inline-flex",padding:"3px 8px",borderRadius:6,fontSize:13,fontWeight:600,background:tcc(t)+"12",color:tcc(t),border:`1px solid ${tcc(t)}30`,cursor:"pointer"}}>+ {t}</span>)}</div>}
  </div>;
}

// 純 textarea 附 [[連結]] 自動提示
function LinkTA({value,onChange,issues,placeholder}){
  const[query,setQuery]=useState("");const[showSug,setShowSug]=useState(false);const ref=useRef(null);
  function handleChange(e){
    const v=e.target.value;onChange(v);
    const pos=e.target.selectionStart;const before=v.slice(0,pos);
    const m=before.match(/\[\[([^\]]*)$/);
    if(m){setQuery(m[1]);setShowSug(true);}else{setShowSug(false);setQuery("");}
  }
  function insertLink(name){
    const ta=ref.current;if(!ta)return;
    const pos=ta.selectionStart;const before=value.slice(0,pos);const after=value.slice(pos);
    const m=before.match(/^([\s\S]*)\[\[([^\]]*)$/);
    if(m)onChange(m[1]+"[["+name+"]]"+after);
    setShowSug(false);setQuery("");setTimeout(()=>ta.focus(),10);
  }
  const sugs=showSug?(issues||[]).filter(i=>!query||i.name.includes(query)).slice(0,6):[];
  return<div style={{position:"relative"}}>
    <textarea ref={ref} value={value} onChange={handleChange}
      placeholder={placeholder||"輸入筆記…\n\n輸入 [[ 可快速插入爭點連結"}
      onBlur={()=>setTimeout(()=>setShowSug(false),150)}
      onFocus={e=>{const pos=e.target.selectionStart;const before=value.slice(0,pos);const m=before.match(/\[\[([^\]]*)$/);if(m){setQuery(m[1]);setShowSug(true);}}}
    />
    {showSug&&sugs.length>0&&<div style={{position:"absolute",left:0,right:0,background:C.cd,border:`1px solid ${C.bd}`,borderRadius:10,zIndex:50,maxHeight:160,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.5)"}}>
      {sugs.map(i=><div key={i.id} onMouseDown={()=>insertLink(i.name)} style={{padding:"9px 14px",cursor:"pointer",fontSize:15,borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",gap:8}}><ST s={i.subject}/><span>{i.name}</span></div>)}
    </div>}
  </div>;
}

// 各科進度列
const SRow=({sub,iss,plog={}})=>{
  const s=subSt(iss,sub);const c=SUB_C[sub];
  const done=Object.values(plog).reduce((sum,day)=>sum+(day[sub]?.count||0),0);
  if(!s.total&&!done)return<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}><span style={{width:52,fontSize:14,color:c,fontWeight:600,flexShrink:0}}>{sub}</span><div className="prog" style={{flex:1}}/><span style={{fontSize:12,color:C.mt,width:70,textAlign:"right"}}>—</span></div>;
  const pc=s.avgPct>=70?"#34d399":s.avgPct>=40?"#fb923c":"#f87171";
  return<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}><span style={{width:52,fontSize:14,color:c,fontWeight:600,flexShrink:0}}>{sub}</span><div className="prog" style={{flex:1}}><div className="progf" style={{width:`${s.avgPct}%`,background:pc}}/></div><span style={{fontSize:12,color:C.mt,width:100,textAlign:"right",flexShrink:0}}>爭{s.mastered}/{s.total} · 解{done}</span></div>;
};

// 編輯面板（通用）
function EP({issue,issues,allTags,editIssue,onDone}){
  const[n,sN]=useState(issue.name);const[sub,sS]=useState(issue.subject);const[df,sD]=useState(issue.difficulty);const[nt,sNt]=useState(issue.notes||"");const[tg,sTg]=useState(issue.tags||[]);const[rs,sRs]=useState("");const[rl,sRl]=useState(issue.related||[]);
  const res=rs.length>=1?issues.filter(i=>(i.name.includes(rs)||i.subject.includes(rs))&&i.id!==issue.id&&!rl.includes(i.id)):[];
  const save=()=>{editIssue(issue.id,{name:n.trim()||issue.name,subject:sub,difficulty:df,related:rl,notes:nt,tags:tg});onDone();};
  return<div style={{borderTop:`1px solid ${C.bd}`,paddingTop:16,marginTop:8}}>
    <div style={{marginBottom:14}}><Lb ch="爭點名稱"/><input value={n} onChange={e=>sN(e.target.value)}/></div>
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:100}}><Lb ch="科目"/><select value={sub} onChange={e=>sS(e.target.value)}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></div>
      <div style={{flex:1,minWidth:80}}><Lb ch="難度"/><select value={df} onChange={e=>sD(e.target.value)}>{["高","中","低"].map(d=><option key={d}>{d}</option>)}</select></div>
    </div>
    <div style={{marginBottom:14}}><Lb ch="筆記"/><LinkTA value={nt} onChange={sNt} issues={issues}/></div>
    <div style={{marginBottom:14}}><Lb ch="標籤"/><TI tags={tg} setTags={sTg} allTags={allTags}/></div>
    <div style={{marginBottom:14}}>
      <Lb ch="關聯爭點"/><SI v={rs} oc={sRs} p="搜尋爭點…"/>
      {res.length>0&&<div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,marginTop:6,maxHeight:140,overflowY:"auto"}}>{res.slice(0,5).map(i=><div key={i.id} onClick={()=>{sRl(r=>[...r,i.id]);sRs("");}} style={{padding:"9px 12px",cursor:"pointer",fontSize:15,borderBottom:`1px solid ${C.bd}`,display:"flex",alignItems:"center",gap:8}}><ST s={i.subject}/><span>{i.name}</span></div>)}</div>}
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:8}}>{rl.map(id=>{const i=issues.find(x=>x.id===id);if(!i)return null;return<span key={id} className="tag" style={{background:C.am,color:C.ac,fontSize:13}}>{i.name}<span onClick={()=>sRl(r=>r.filter(x=>x!==id))} style={{marginLeft:4,cursor:"pointer",opacity:.7}}>✕</span></span>;})}</div>
    </div>
    <div style={{display:"flex",gap:8}}><button onClick={save} style={{flex:1,background:C.ac,color:"#fff",fontWeight:600,padding:11}}>儲存</button><button onClick={onDone} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,padding:11}}>取消</button></div>
  </div>;
}

// ═══ 主 App ═══
export default function App(){
  const[tab,setTab]=useState("dashboard");const[issues,setIssues]=useState(null);const[log,setLog]=useState({});const[plog,setPlog]=useState({});const[books,setBooks]=useState([]);const[bookLog,setBookLog]=useState({});const[sprint,setSprint]=useState(false);const[limit,setLimit]=useState(30);const[sync,setSync]=useState("loading");const[vid,setVid]=useState(null);const[fc,_setFc]=useState(false);const fcR=useRef(false);const setFc=v=>{fcR.current=v;_setFc(v);};const[draft,setDraft]=useState({...EMPTY_DRAFT});const ss=useRef(Date.now());

  const load=useCallback(async()=>{try{setSync("loading");const[iR,lR,sR,dR,pR,bR,blR]=await Promise.all([supabase.from("issues").select("*"),supabase.from("study_log").select("*"),supabase.from("settings").select("*").eq("key","sprint_mode").maybeSingle(),supabase.from("settings").select("*").eq("key","daily_limit").maybeSingle(),supabase.from("practice_log").select("*"),supabase.from("books").select("*"),supabase.from("book_log").select("*")]);if(iR.error)throw iR.error;setIssues((iR.data||[]).map(db2i));const l={};(lR.data||[]).forEach(r=>{l[r.date]=r.minutes;});setLog(l);const pl={};(pR.data||[]).forEach(r=>{if(!pl[r.date])pl[r.date]={};pl[r.date][r.subject]={count:r.count,minutes:r.minutes};});setPlog(pl);setSprint(sR.data?.value===true);if(dR.data?.value)setLimit(dR.data.value);setBooks(bR.data||[]);const bl={};(blR.data||[]).forEach(r=>{bl[r.book_id]=(bl[r.book_id]||0)+r.count;});setBookLog(bl);setSync("synced");}catch(e){console.error(e);setSync("error");}},[]);

  useEffect(()=>{load();const ch=supabase.channel("sync").on("postgres_changes",{event:"*",schema:"public",table:"issues"},()=>{if(!fcR.current)load();}).on("postgres_changes",{event:"*",schema:"public",table:"study_log"},()=>{if(!fcR.current)load();}).on("postgres_changes",{event:"*",schema:"public",table:"settings"},()=>{if(!fcR.current)load();}).on("postgres_changes",{event:"*",schema:"public",table:"practice_log"},()=>{if(!fcR.current)load();}).on("postgres_changes",{event:"*",schema:"public",table:"books"},()=>{if(!fcR.current)load();}).on("postgres_changes",{event:"*",schema:"public",table:"book_log"},()=>{if(!fcR.current)load();}).subscribe();ss.current=Date.now();return()=>{ch.unsubscribe();const el=Math.floor((Date.now()-ss.current)/60000);if(el>0)supabase.from("study_log").upsert({date:td(),minutes:(log[td()]||0)+el});};},[load]);

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
  async function savePractice(sub,cnt,mins){const c=parseInt(cnt)||0,m=parseInt(mins)||0,d=td();setPlog(p=>({...p,[d]:{...p[d],[sub]:{count:c,minutes:m}}}));const{error}=await supabase.from("practice_log").upsert({date:d,subject:sub,count:c,minutes:m},{onConflict:"date,subject"});if(error)throw new Error(error.message||error.code||JSON.stringify(error));}
  async function saveBook(subject,title,total){const{data,error}=await supabase.from("books").insert({subject,title,total:parseInt(total)||0}).select().single();if(error)throw new Error(error.message||error.code||JSON.stringify(error));setBooks(prev=>[...prev,data]);}
  async function deleteBook(id){await supabase.from("books").delete().eq("id",id);setBooks(prev=>prev.filter(b=>b.id!==id));setBookLog(prev=>{const n={...prev};delete n[id];return n;});}
  async function updateBook(id,title,total){const vals={title,total:parseInt(total)||0};const{error}=await supabase.from("books").update(vals).eq("id",id);if(error)throw new Error(error.message);setBooks(prev=>prev.map(b=>b.id===id?{...b,...vals}:b));}
  async function logBookPractice(bookId,date,count){const{data:ex}=await supabase.from("book_log").select("count").eq("book_id",bookId).eq("date",date).maybeSingle();const newCount=(ex?.count||0)+Number(count);await supabase.from("book_log").upsert({book_id:bookId,date,count:newCount});const{data}=await supabase.from("book_log").select("*");const bl={};(data||[]).forEach(r=>{bl[r.book_id]=(bl[r.book_id]||0)+r.count;});setBookLog(bl);}

  const openD=id=>setVid(id);
  const allTags=[...new Set((issues||[]).flatMap(i=>i.tags||[]))].sort();
  const vi=vid?(issues||[]).find(i=>i.id===vid):null;

  if(!issues)return<><style>{css}</style><div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:20}}><div style={{fontSize:40}}>⚖️</div><div style={{fontWeight:700,fontSize:18}}>司法考試複習追蹤器</div><div className="spinner"/><div style={{fontSize:14,color:C.mt}}>{sync==="error"?"連線失敗":"連接中…"}</div>{sync==="error"&&<button onClick={load} style={{background:C.ac,color:"#fff",padding:"10px 24px",fontWeight:600}}>重試</button>}</div></>;

  const allDue=pSort(issues.filter(isDue));const todayDue=allDue.slice(0,limit);const ovf=Math.max(0,allDue.length-limit);
  const scl=sync==="synced"?C.ok:sync==="error"?C.dg:"#fb923c";
  const slb=sync==="synced"?"已同步":sync==="saving"?"儲存中":"讀取中";
  const tabs=[{id:"dashboard",l:"首頁",icon:"⊙"},{id:"add",l:"新增",icon:"＋"},{id:"overview",l:"總覽",icon:"≡"},{id:"stats",l:"統計",icon:"◑"}];

  if(fc)return<><style>{css}</style><FCM issues={issues} queue={todayDue} rate={rate} exit={()=>setFc(false)}/></>;

  return<><style>{css}</style>
    <div style={{minHeight:"100vh",background:C.bg,paddingBottom:68}}>
      {sprint&&<div style={{background:C.dg,color:"#fff",textAlign:"center",padding:"7px 16px",fontWeight:600,fontSize:14}}>⚠ 考前衝刺模式：每 2 天強制複習</div>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:C.sf,borderBottom:`1px solid ${C.bd}`,position:"sticky",top:0,zIndex:100}}>
        <span style={{fontWeight:700,fontSize:17}}>⚖️ 司法考試複習</span>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:12,color:scl}}>● {slb}</span>
          <button onClick={togSp} style={{background:sprint?C.dg+"20":"transparent",color:sprint?C.dg:C.mt,border:`1px solid ${sprint?C.dg:C.bd}`,fontSize:13,padding:"5px 10px"}}>{sprint?"衝刺中":"衝刺模式"}</button>
        </div>
      </div>
      <div style={{padding:"16px 16px 0",maxWidth:680,margin:"0 auto"}}>
        {tab==="dashboard"&&<Dash issues={issues} due={todayDue} ovf={ovf} limit={limit} setLim={setLim} rate={rate} gDue={gDue} openD={openD} startFC={()=>setFc(true)} plog={plog}/>}
        {tab==="add"&&<AddP issues={issues} onAdd={addI} setTab={setTab} allTags={allTags} draft={draft} setDraft={setDraft}/>}
        {tab==="overview"&&<OvW issues={issues} rate={rate} isDue={isDue} editI={editI} delM={delM} del1={del1} allTags={allTags} openD={openD}/>}
        {tab==="stats"&&<StatsP issues={issues} log={log} plog={plog} savePractice={savePractice} books={books} bookLog={bookLog} saveBook={saveBook} deleteBook={deleteBook} logBookPractice={logBookPractice} updateBook={updateBook}/>}
      </div>
      {vi&&<Ov ch={<Det issue={vi} issues={issues} allTags={allTags} editI={editI} del1={del1} rate={rate} isDue={isDue} openD={openD} oc={()=>setVid(null)}/>} oc={()=>setVid(null)}/>}
    </div>
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.sf,borderTop:`1px solid ${C.bd}`,display:"flex",zIndex:100}}>
      {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 4px 8px",background:"transparent",border:"none",borderRadius:0,color:tab===t.id?C.ac:C.mt,display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontSize:12,fontWeight:tab===t.id?700:400,borderTop:`2px solid ${tab===t.id?C.ac:"transparent"}`,transition:"color .15s"}}><span style={{fontSize:18,lineHeight:1}}>{t.icon}</span>{t.l}</button>)}
    </div>
  </>;
}

// ═══ 閃卡（snapshot queue 修復閃爍）═══
function FCM({issues,queue,rate,exit}){
  const[snapQueue]=useState(()=>[...queue]);
  const[idx,setIdx]=useState(0);const[fl,setFl]=useState(false);const[res,setRes]=useState([]);const[done,setDone]=useState(false);const[busy,setBusy]=useState(false);
  const startRef=useRef(Date.now());const[elapsed,setElapsed]=useState(0);
  useEffect(()=>{const id=setInterval(()=>setElapsed(Math.floor((Date.now()-startRef.current)/1000)),1000);return()=>clearInterval(id);},[]);
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const cur=snapQueue[idx];const rel=cur?gRel(cur,issues):[];const bl=cur?gBack(cur,issues):[];

  async function go(r){
    if(busy)return;setBusy(true);
    await rate(cur,r);
    setRes(p=>[...p,{issue:cur,rating:r}]);
    setTimeout(()=>{setFl(false);if(idx+1>=snapQueue.length)setDone(true);else setIdx(idx+1);setBusy(false);},300);
  }

  if(!snapQueue.length)return<div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:20}}><div style={{fontSize:48}}>🎉</div><div style={{fontSize:20,fontWeight:700}}>今天沒有到期爭點！</div><button onClick={exit} style={{background:C.ac,color:"#fff",padding:"12px 32px",fontWeight:600,fontSize:17}}>返回</button></div>;

  if(done){const ct={};RATINGS.forEach(r=>ct[r.id]=0);res.forEach(r=>ct[r.rating.id]++);return<div style={{minHeight:"100vh",background:C.bg,padding:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}><div style={{fontSize:48}}>📊</div><div style={{fontSize:20,fontWeight:700}}>完成！共 {res.length} 張</div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,width:"100%",maxWidth:400}}>{RATINGS.map(r=><div key={r.id} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:14,textAlign:"center"}}><div style={{fontSize:24}}>{r.icon}</div><div style={{fontSize:13,color:r.color,fontWeight:700,marginTop:4}}>{r.label}</div><div style={{fontSize:26,fontWeight:700,marginTop:4}}>{ct[r.id]}</div></div>)}</div><div style={{fontSize:16,color:C.mt}}>總用時 <span style={{color:C.ok,fontFamily:"monospace",fontWeight:700}}>{fmt(elapsed)}</span></div><button onClick={exit} style={{background:C.ac,color:"#fff",padding:"12px 32px",fontWeight:600,fontSize:17,marginTop:8}}>返回首頁</button></div>;}

  return<div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:C.sf,borderBottom:`1px solid ${C.bd}`}}>
      <button onClick={exit} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:14,padding:"5px 12px"}}>✕ 退出</button>
      <span style={{fontSize:15,color:C.mt,fontWeight:600}}>{idx+1} / {snapQueue.length}</span>
      <span style={{fontSize:15,color:C.ok,fontFamily:"monospace",fontWeight:600}}>⏱ {fmt(elapsed)}</span>
      <div className="prog" style={{width:100}}><div className="progf" style={{width:`${idx/snapQueue.length*100}%`,background:C.ac}}/></div>
    </div>
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px 16px",maxWidth:600,margin:"0 auto",width:"100%"}}>
      <div style={{width:"100%",background:C.cd,border:`1px solid ${C.bd}`,borderRadius:16,padding:24,marginBottom:20}}>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}><ST s={cur.subject}/><span className="tag" style={{background:"transparent",color:DC[cur.difficulty],border:`1px solid ${DC[cur.difficulty]}`}}>{cur.difficulty}</span><span style={{fontSize:13,color:C.mt,marginLeft:"auto"}}>階段 {cur.stage}/6</span></div>
        <div style={{fontSize:20,fontWeight:700,textAlign:"center",padding:"24px 0",lineHeight:1.5}}>{cur.name}</div>
        {(cur.tags||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center",marginTop:8}}>{cur.tags.map(t=><CT key={t} t={t}/>)}</div>}
      </div>
      {!fl
        ?<button onClick={()=>setFl(true)} style={{background:C.ac,color:"#fff",padding:"14px 48px",fontSize:17,fontWeight:700,borderRadius:12}}>翻牌查看 ▼</button>
        :<div className="fi" style={{width:"100%"}}>
          <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:20,marginBottom:20,maxHeight:"38vh",overflowY:"auto"}}>
            {(cur.notes||"").trim()?rNotes(cur.notes,issues,null):<div style={{color:C.mt,textAlign:"center",padding:20,fontSize:16}}>（尚無筆記）</div>}
            {rel.length>0&&<div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.bd}`}}><span style={{fontSize:13,color:C.mt}}>關聯：</span>{rel.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.am,color:C.ac,fontSize:13}}>{r.name}</span>)}</div>}
            {bl.length>0&&<div style={{marginTop:8}}><span style={{fontSize:13,color:C.mt}}>被提及：</span>{bl.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.sf,color:C.mt,fontSize:13,border:`1px solid ${C.bd}`}}>{r.name}</span>)}</div>}
          </div>
          <div style={{fontSize:14,color:C.mt,textAlign:"center",marginBottom:12}}>你記得多少？</div>
          <RB onRate={go}/>
        </div>}
    </div>
  </div>;
}

// ═══ 詳細頁 ═══
function Det({issue:is,issues,allTags,editI,del1,rate,isDue,openD,oc}){
  const[ed,sEd]=useState(false);const[cd,sCd]=useState(false);
  const itv=gitv(is.difficulty);const rel=gRel(is,issues);const bl=gBack(is,issues);const due=isDue(is);
  return<div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
      <div><div style={{fontWeight:700,fontSize:17,marginBottom:8,lineHeight:1.4}}>{is.name}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}><ST s={is.subject}/><span className="tag" style={{background:"transparent",color:DC[is.difficulty],border:`1px solid ${DC[is.difficulty]}`}}>{is.difficulty}</span>{is.mastered&&<span className="tag" style={{background:C.om,color:C.ok}}>已掌握</span>}{due&&!is.mastered&&<span className="tag" style={{background:C.dm,color:C.dg}}>今日到期</span>}</div>
      </div>
      <div style={{display:"flex",gap:5}}>{!ed&&<button onClick={()=>sEd(true)} style={{background:C.am,color:C.ac,fontSize:14,padding:"5px 12px"}}>編輯</button>}<button onClick={oc} style={{background:"transparent",color:C.mt,fontSize:20,padding:"2px 8px",border:"none",lineHeight:1}}>✕</button></div>
    </div>
    {!ed?<>
      {(is.tags||[]).length>0&&<div style={{marginBottom:12,display:"flex",flexWrap:"wrap",gap:4}}>{is.tags.map(t=><CT key={t} t={t}/>)}</div>}
      <div style={{marginBottom:14}}><div style={{display:"flex",gap:3,marginBottom:6}}>{itv.map((_,i)=><div key={i} style={{flex:1,height:4,borderRadius:2,background:i<is.stage?C.ac:C.bd}}/>)}</div><div style={{fontSize:14,color:C.mt}}>階段 {Math.min(is.stage,6)}/6{!is.mastered&&is.nextDate&&` · 下次：${is.nextDate}（${ddf(is.nextDate)===0?"今天":ddf(is.nextDate)>0?`${ddf(is.nextDate)}天後`:`逾期${-ddf(is.nextDate)}天`}）`}</div></div>
      {(is.notes||"").trim()&&<div style={{marginBottom:14}}><div style={{fontSize:14,color:C.mt,fontWeight:600,marginBottom:6}}>筆記</div><div style={{background:C.sf,borderRadius:10,padding:"12px 14px"}}>{rNotes(is.notes,issues,openD)}</div></div>}
      {rel.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:14,color:C.mt,fontWeight:600,marginBottom:6}}>關聯爭點</div><div style={{display:"flex",flexDirection:"column",gap:6}}>{rel.map(r=><div key={r.id} onClick={()=>openD(r.id)} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:"10px 14px",cursor:"pointer",fontSize:15}}><ST s={r.subject}/><span style={{marginLeft:6,fontWeight:500}}>{r.name}</span>{(r.notes||"").trim()&&<div style={{marginTop:4,fontSize:13,color:C.mt,maxHeight:36,overflow:"hidden"}}>{r.notes.slice(0,80)}{r.notes.length>80?"…":""}</div>}</div>)}</div></div>}
      {bl.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:14,color:C.mt,fontWeight:600,marginBottom:6}}>被提及（反向連結）</div><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{bl.map(r=><span key={r.id} onClick={()=>openD(r.id)} className="tag" style={{background:C.sf,color:C.ac,cursor:"pointer",padding:"5px 12px",fontSize:14,border:`1px solid ${C.bd}`}}>{r.name}</span>)}</div></div>}
      {(is.errors||[]).length>0&&<div style={{marginBottom:14}}><div style={{fontSize:14,color:C.mt,fontWeight:600,marginBottom:6}}>錯誤紀錄</div><div style={{background:C.sf,borderRadius:10,padding:"10px 12px"}}>{is.errors.map((e,i)=><div key={i} style={{fontSize:14,color:C.dg,marginBottom:2}}>{e.date} · {e.reason}</div>)}</div></div>}
      {due&&!is.mastered&&<div style={{marginBottom:14}}><div style={{fontSize:14,color:C.mt,textAlign:"center",marginBottom:10}}>你記得多少？</div><RB onRate={async r=>{await rate(is,r);oc();}}/></div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,borderTop:`1px solid ${C.bd}`}}><div style={{fontSize:13,color:C.mt}}>建立：{is.created}</div>{!cd?<button onClick={()=>sCd(true)} style={{background:"transparent",color:C.dg,border:`1px solid ${C.dg}`,fontSize:13,padding:"5px 12px"}}>刪除</button>:<div style={{display:"flex",gap:5}}><button onClick={()=>{del1(is.id);oc();}} style={{background:C.dg,color:"#fff",fontSize:13,padding:"5px 12px",fontWeight:600}}>確認刪除</button><button onClick={()=>sCd(false)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:13,padding:"5px 10px"}}>取消</button></div>}</div>
    </>:<EP issue={is} issues={issues} allTags={allTags} editIssue={editI} onDone={()=>sEd(false)}/>}
  </div>;
}

// ═══ Dashboard ═══
function Dash({issues,due,ovf,limit,setLim,rate,gDue,openD,startFC,plog}){
  const[el,sEl]=useState(false);const[tmp,sTmp]=useState(limit);
  const total=issues.length;const mastered=issues.filter(i=>i.mastered).length;
  const masteredPct=total?Math.round(mastered/total*100):0;
  const overallPct=total?Math.round((mastered*6+issues.filter(i=>!i.mastered).reduce((a,i)=>a+i.stage,0))/(total*6)*100):0;
  const gr=SUBJECTS.reduce((a,s)=>{const d=due.filter(i=>i.subject===s);if(d.length)a[s]=d;return a;},{});
  const up=issues.filter(i=>!i.mastered&&ddf(gDue(i))>0&&ddf(gDue(i))<=7).sort((a,b)=>gDue(a).localeCompare(gDue(b)));
  return<div>
    <div style={{display:"flex",justifyContent:"space-around",padding:"24px 8px 20px",background:C.cd,borderRadius:16,marginBottom:14,border:`1px solid ${C.bd}`}}>
      <Ring pct={overallPct} color={C.ac} label="整體進度" value={`${overallPct}%`} size={88}/>
      <Ring pct={masteredPct} color={C.ok} label="已掌握率" value={`${masteredPct}%`} size={88}/>
      <Ring pct={Math.min(due.length/Math.max(limit,1)*100,100)} color={due.length>0?"#fb923c":C.ok} label="今日待複習" value={due.length} size={88}/>
    </div>
    {due.length>0
      ?<button onClick={startFC} style={{width:"100%",background:`linear-gradient(135deg,${C.ac},#8b5cf6)`,color:"#fff",padding:14,fontSize:17,fontWeight:700,borderRadius:14,marginBottom:14,border:"none"}}>🃏 開始閃卡複習 · {due.length} 張</button>
      :<div style={{textAlign:"center",padding:"12px 16px",background:C.om,borderRadius:12,marginBottom:14,color:C.ok,fontSize:16,fontWeight:600}}>✓ 今日複習完成！</div>}
    <Card title="本週複習"><WeekBar issues={issues}/></Card>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,padding:"10px 14px",background:C.sf,borderRadius:12,border:`1px solid ${C.bd}`,flexWrap:"wrap"}}>
      <span style={{fontSize:14,color:C.mt}}>每日上限：</span>
      {!el?<><span style={{fontSize:16,fontWeight:700}}>{limit} 題</span>{ovf>0&&<span style={{fontSize:13,color:C.dg}}>（{ovf} 題延後）</span>}<button onClick={()=>{sTmp(limit);sEl(true);}} style={{background:"transparent",color:C.ac,border:`1px solid ${C.ac}`,fontSize:13,padding:"3px 10px",marginLeft:"auto"}}>調整</button></>
        :<><input type="number" value={tmp} onChange={e=>sTmp(Number(e.target.value))} min={1} max={200} style={{width:64,textAlign:"center",padding:"4px 6px",fontSize:16}}/><button onClick={()=>{setLim(tmp);sEl(false);}} style={{background:C.ac,color:"#fff",fontSize:13,padding:"5px 12px",fontWeight:600}}>確認</button><button onClick={()=>sEl(false)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:13,padding:"5px 10px"}}>取消</button></>}
    </div>
    <Card title="各科進度">{SUBJECTS.map(s=><SRow key={s} sub={s} iss={issues} plog={plog}/>)}</Card>
    {Object.keys(gr).length>0&&<div style={{marginBottom:14}}>
      <div style={secT}>今日複習（{due.length}）</div>
      {Object.entries(gr).map(([s,l])=><div key={s} style={{marginBottom:14}}><div style={{fontSize:14,fontWeight:700,color:SUB_C[s],marginBottom:6}}>{s}</div><div style={{display:"flex",flexDirection:"column",gap:6}}>{l.map(i=><Row key={i.id} i={i} rate={rate} openD={openD}/>)}</div></div>)}
    </div>}
    {up.length>0&&<div style={{marginBottom:14}}>
      <div style={secT}>未來 7 天到期</div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>{up.map(i=>{const d=ddf(gDue(i));return<div key={i.id} onClick={()=>openD(i.id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,cursor:"pointer"}}><span style={{fontSize:15,fontWeight:500}}>{i.name}</span><div style={{display:"flex",gap:6,alignItems:"center"}}><ST s={i.subject}/><span style={{fontSize:13,color:C.mt,flexShrink:0}}>{d}天後</span></div></div>;})}</div>
    </div>}
  </div>;
}

function Row({i,rate,openD}){
  const[sr,sSr]=useState(false);
  return<div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",gap:8,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>openD(i.id)}><span style={{fontSize:15,fontWeight:600}}>{i.name}</span><span style={{marginLeft:6}}><ST s={i.subject}/></span><span className="tag" style={{marginLeft:4,background:"transparent",color:DC[i.difficulty],border:`1px solid ${DC[i.difficulty]}`,fontSize:12}}>{i.difficulty}</span>{(i.tags||[]).length>0&&<span style={{marginLeft:5,fontSize:12,color:tcc(i.tags[0])}}>🏷{i.tags.length}</span>}{(i.notes||"").trim()&&<span style={{marginLeft:5,fontSize:12,color:C.mt}}>📝</span>}</div>
      <button onClick={e=>{e.stopPropagation();sSr(!sr);}} style={{background:C.am,color:C.ac,fontSize:13,padding:"6px 12px",flexShrink:0,fontWeight:600}}>{sr?"收起":"評分"}</button>
    </div>
    {sr&&<div style={{padding:"0 14px 12px"}}><RB onRate={async r=>{await rate(i,r);sSr(false);}} sm/></div>}
  </div>;
}

// ═══ 新增（草稿暫存）═══
function AddP({issues,onAdd,setTab,allTags,draft,setDraft}){
  const{name,subject,difficulty,notes,tags,search,related}=draft;
  const up=(k,v)=>setDraft(d=>({...d,[k]:v}));
  const res=search.length>=1?issues.filter(i=>(i.name.includes(search)||i.subject.includes(search))&&!related.includes(i.id)):[];
  const submit=()=>{if(!name.trim())return;onAdd({name:name.trim(),subject,difficulty,related,notes,tags});setDraft({...EMPTY_DRAFT});setTab("overview");};
  return<div style={{maxWidth:600}}>
    <div style={{fontSize:20,fontWeight:700,marginBottom:20}}>新增爭點</div>
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div><Lb ch="爭點名稱"/><input value={name} onChange={e=>up("name",e.target.value)} placeholder="例：法人格否認理論的要件" onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div><Lb ch="科目"/><select value={subject} onChange={e=>up("subject",e.target.value)}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></div>
        <div><Lb ch="難度"/><select value={difficulty} onChange={e=>up("difficulty",e.target.value)}>{["高","中","低"].map(d=><option key={d}>{d}</option>)}</select></div>
      </div>
      <div><Lb ch="筆記"/><LinkTA value={notes} onChange={v=>up("notes",v)} issues={issues}/></div>
      <div><Lb ch="標籤"/><TI tags={tags} setTags={v=>up("tags",v)} allTags={allTags}/></div>
      <div>
        <Lb ch="關聯爭點"/><SI v={search} oc={v=>up("search",v)} p="搜尋現有爭點…"/>
        {res.length>0&&<div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,marginTop:6,maxHeight:160,overflowY:"auto"}}>{res.slice(0,8).map(i=><div key={i.id} onClick={()=>{up("related",[...related,i.id]);up("search","");}} style={{padding:"9px 14px",cursor:"pointer",borderBottom:`1px solid ${C.bd}`,fontSize:15,display:"flex",alignItems:"center",gap:8}}><ST s={i.subject}/><span>{i.name}</span></div>)}</div>}
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:8}}>{related.map(id=>{const i=issues.find(x=>x.id===id);if(!i)return null;return<span key={id} className="tag" style={{background:C.am,color:C.ac,padding:"4px 10px"}}>{i.name}<span onClick={()=>up("related",related.filter(x=>x!==id))} style={{marginLeft:5,cursor:"pointer",opacity:.7}}>✕</span></span>;})}</div>
      </div>
      <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:10,padding:"12px 14px",fontSize:14,color:C.mt}}>第一次複習日：<strong style={{color:C.tx}}>{cNext(td(),0,difficulty)}（{difficulty==="高"?"1":"3"} 天後）</strong><br/>間隔：{gitv(difficulty).join(" → ")} 天</div>
      <button onClick={submit} disabled={!name.trim()} style={{background:C.ac,color:"#fff",padding:13,fontWeight:700,fontSize:17,borderRadius:12}}>新增爭點</button>
    </div>
  </div>;
}

// ═══ 總覽 ═══
function OvW({issues,rate,isDue,editI,delM,del1,allTags,openD}){
  const[sf,sSf]=useState("全部");const[stf,sStf]=useState("全部");const[tf,sTf]=useState("全部");const[sq,sSq]=useState("");const[sb,sSb]=useState("created_desc");const[eid,sEid]=useState(null);const[sel,sSel]=useState(new Set());const[dm,sDm]=useState(false);
  let f=issues;if(sf!=="全部")f=f.filter(i=>i.subject===sf);if(stf==="今日待複習")f=f.filter(isDue);else if(stf==="進行中")f=f.filter(i=>!i.mastered&&!isDue(i));else if(stf==="已掌握")f=f.filter(i=>i.mastered);if(tf!=="全部")f=f.filter(i=>(i.tags||[]).includes(tf));if(sq.trim()){const q=sq.trim().toLowerCase();f=f.filter(i=>i.name.toLowerCase().includes(q)||i.subject.includes(q)||(i.notes||"").toLowerCase().includes(q)||(i.tags||[]).some(t=>t.includes(q)));}f=doSort(f,sb);
  const tS=id=>sSel(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  return<div>
    <div style={{marginBottom:14}}>
      <SI v={sq} oc={sSq} p="🔍 搜尋爭點名稱、筆記、標籤…"/>
      <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center",marginTop:10}}>
        <select value={sf} onChange={e=>sSf(e.target.value)} style={{width:"auto",borderRadius:8,padding:"6px 10px"}}><option>全部</option>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select>
        <select value={stf} onChange={e=>sStf(e.target.value)} style={{width:"auto",borderRadius:8,padding:"6px 10px"}}>{["全部","今日待複習","進行中","已掌握"].map(x=><option key={x}>{x}</option>)}</select>
        {allTags.length>0&&<select value={tf} onChange={e=>sTf(e.target.value)} style={{width:"auto",borderRadius:8,padding:"6px 10px"}}><option>全部</option>{allTags.map(t=><option key={t}>{t}</option>)}</select>}
        <select value={sb} onChange={e=>sSb(e.target.value)} style={{width:"auto",borderRadius:8,padding:"6px 10px"}}>{SORTS.map(o=><option key={o.id} value={o.id}>{o.l}</option>)}</select>
        <span style={{fontSize:14,color:C.mt}}>共 {f.length} 筆</span>
        <div style={{marginLeft:"auto"}}>{!dm?<button onClick={()=>sDm(true)} style={{background:"transparent",color:C.dg,border:`1px solid ${C.dg}`,fontSize:14,padding:"6px 12px"}}>批量刪除</button>:<div style={{display:"flex",gap:6,alignItems:"center"}}><button onClick={()=>sel.size===f.length?sSel(new Set()):sSel(new Set(f.map(i=>i.id)))} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:14,padding:"6px 10px"}}>{sel.size===f.length?"取消全選":"全選"}</button><button onClick={()=>{delM([...sel]);sSel(new Set());sDm(false);}} disabled={!sel.size} style={{background:C.dg,color:"#fff",fontSize:14,padding:"6px 12px",fontWeight:600}}>刪除{sel.size?` (${sel.size})`:""}</button><button onClick={()=>{sSel(new Set());sDm(false);}} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:14,padding:"6px 10px"}}>取消</button></div>}</div>
      </div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {f.map(i=><Cd key={i.id} i={i} issues={issues} due={isDue(i)} rate={rate} editing={eid===i.id} sEid={sEid} editI={editI} dm={dm} sel={sel.has(i.id)} tS={()=>tS(i.id)} del1={del1} allTags={allTags} openD={openD}/>)}
      {!f.length&&<div style={{color:C.mt,textAlign:"center",padding:48,fontSize:16}}>沒有符合條件的爭點</div>}
    </div>
  </div>;
}

function Cd({i,issues,due,rate,editing,sEid,editI,dm,sel,tS,del1,allTags,openD}){
  const[sn,sSn]=useState(false);const[cd,sCd]=useState(false);const[sr,sSr]=useState(false);
  const itv=gitv(i.difficulty);const rel=gRel(i,issues);const bl=gBack(i,issues);
  return<div style={{background:sel?C.dm:C.cd,border:`1px solid ${sel?C.dg:due?C.dg+"80":C.bd}`,borderRadius:12,padding:"14px 16px"}}>
    <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
      {dm&&<div onClick={tS} className={`cb${sel?" ck":""}`} style={{marginTop:2}}>{sel&&<span style={{color:"#fff",fontSize:13,fontWeight:700}}>✓</span>}</div>}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6,marginBottom:10}}>
          <div><span style={{fontWeight:700,fontSize:16}}>{i.name}</span><span style={{marginLeft:6}}><ST s={i.subject}/></span><span className="tag" style={{marginLeft:4,background:"transparent",color:DC[i.difficulty],border:`1px solid ${DC[i.difficulty]}`,fontSize:12}}>{i.difficulty}</span>{i.mastered&&<span className="tag" style={{marginLeft:4,background:C.om,color:C.ok}}>已掌握</span>}{due&&!i.mastered&&<span className="tag" style={{marginLeft:4,background:C.dm,color:C.dg}}>今日到期</span>}</div>
          {!dm&&<div style={{display:"flex",gap:5}}><button onClick={()=>editing?sEid(null):sEid(i.id)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:13,padding:"4px 10px"}}>編輯</button><button onClick={()=>sCd(true)} style={{background:"transparent",color:C.dg,border:`1px solid ${C.dg}`,fontSize:13,padding:"4px 10px"}}>刪除</button></div>}
        </div>
        {(i.tags||[]).length>0&&<div style={{marginBottom:8,display:"flex",flexWrap:"wrap",gap:4}}>{i.tags.map(t=><CT key={t} t={t}/>)}</div>}
        <div style={{marginBottom:10}}><div style={{display:"flex",gap:3,marginBottom:5}}>{itv.map((_,x)=><div key={x} style={{flex:1,height:4,borderRadius:2,background:x<i.stage?C.ac:C.bd}}/>)}</div><div style={{fontSize:13,color:C.mt}}>階段 {Math.min(i.stage,6)}/6{!i.mastered&&i.nextDate&&` · 下次：${i.nextDate}（${ddf(i.nextDate)===0?"今天":ddf(i.nextDate)>0?`${ddf(i.nextDate)}天後`:`逾期${-ddf(i.nextDate)}天`}）`}</div></div>
        {(i.notes||"").trim()&&<div style={{marginBottom:8}}><span onClick={()=>sSn(!sn)} style={{fontSize:13,color:C.ac,cursor:"pointer",fontWeight:600}}>{sn?"▼ 收起筆記":"▶ 查看筆記"}</span>{sn&&<div style={{marginTop:6,background:C.sf,borderRadius:8,padding:"10px 12px"}}>{rNotes(i.notes,issues,openD)}</div>}</div>}
        {rel.length>0&&<div style={{marginBottom:7}}><span style={{fontSize:13,color:C.mt}}>關聯：</span>{rel.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.am,color:C.ac,fontSize:13}}>{r.name}</span>)}</div>}
        {bl.length>0&&<div style={{marginBottom:7}}><span style={{fontSize:13,color:C.mt}}>被提及：</span>{bl.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.sf,color:C.mt,fontSize:13,border:`1px solid ${C.bd}`}}>{r.name}</span>)}</div>}
        {(i.errors||[]).length>0&&<div style={{marginBottom:8,background:C.sf,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:12,color:C.mt,marginBottom:3}}>錯誤紀錄</div>{i.errors.map((e,x)=><div key={x} style={{fontSize:13,color:C.dg}}>{e.date} · {e.reason}</div>)}</div>}
        {editing&&<EP issue={i} issues={issues} allTags={allTags} editIssue={editI} onDone={()=>sEid(null)}/>}
        {due&&!i.mastered&&!dm&&!editing&&<div style={{marginTop:8}}>{!sr?<button onClick={()=>sSr(true)} style={{width:"100%",background:C.am,color:C.ac,padding:9,fontWeight:600,fontSize:14}}>評分</button>:<RB onRate={async r=>{await rate(i,r);sSr(false);}} sm/>}</div>}
        {cd&&<div style={{marginTop:10,background:C.dm,border:`1px solid ${C.dg}`,borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:14,color:C.dg}}>確定刪除？</span><div style={{display:"flex",gap:6}}><button onClick={()=>del1(i.id)} style={{background:C.dg,color:"#fff",fontSize:14,padding:"5px 12px",fontWeight:600}}>確認</button><button onClick={()=>sCd(false)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:14,padding:"5px 10px"}}>取消</button></div></div>}
      </div>
    </div>
  </div>;
}

// ═══ 統計 helpers ═══
const fmm=m=>{if(!m)return"—";const h=Math.floor(m/60),mn=m%60;return h?`${h}h${mn?mn+"m":""}`:`${mn}m`;};
const addDays=(s,n)=>{const d=new Date(s);d.setDate(d.getDate()+n);return d.toISOString().split("T")[0];};
const wkStart=s=>{const d=new Date(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().split("T")[0];};
const sumLog=(log,dates)=>dates.reduce((a,d)=>a+(log[d]||0),0);

// ═══ 統計 ═══
function StatsP({issues,log,plog,savePractice,books,bookLog,saveBook,deleteBook,logBookPractice,updateBook}){
  const today=td();
  const MIL="#22c55e";const MIL_DIM="rgba(34,197,94,0.12)";

  // sub-tab
  const[stab,setStab]=useState("home");

  // 主頁 state
  const[sub,setSub]=useState(SUBJECTS[0]);
  const[cnt,setCnt]=useState("");const[mins,setMins]=useState("");
  const[saving,setSaving]=useState(false);const[saveErr,setSaveErr]=useState(null);
  const[selBook,setSelBook]=useState(null);
  const[addingBook,setAddingBook]=useState(false);
  const[newBTitle,setNewBTitle]=useState("");const[newBTotal,setNewBTotal]=useState("");
  const[bookSaving,setBookSaving]=useState(false);
  const[editingBook,setEditingBook]=useState(null);
  const[editBTitle,setEditBTitle]=useState("");const[editBTotal,setEditBTotal]=useState("");const[editBSaving,setEditBSaving]=useState(false);
  async function handleEditBook(){setEditBSaving(true);try{await updateBook(editingBook,editBTitle,editBTotal);setEditingBook(null);}catch(e){setSaveErr("書籍更新失敗："+e.message);}finally{setEditBSaving(false);}}
  useEffect(()=>{setSelBook(null);setAddingBook(false);},[sub]);
  async function handleAdd(){if(!cnt&&!mins)return;setSaving(true);setSaveErr(null);try{await savePractice(sub,cnt,mins);}catch(e){setSaveErr("儲存失敗："+e.message);setSaving(false);return;}if(selBook&&cnt){try{await logBookPractice(selBook,today,Number(cnt));}catch(e){setSaveErr("書籍進度儲存失敗（請確認 book_log RLS 已停用）："+e.message);}}setCnt("");setMins("");setSelBook(null);setSaving(false);}
  async function handleAddBook(){if(!newBTitle.trim()||!newBTotal)return;setBookSaving(true);try{await saveBook(sub,newBTitle.trim(),newBTotal);setNewBTitle("");setNewBTotal("");setAddingBook(false);}catch(e){const msg=e.message||"";setSaveErr(msg.includes("schema cache")||msg.includes("does not exist")?"請先至 Supabase Dashboard → SQL Editor 建立 books / book_log 資料表（見說明文件）":"書籍新增失敗："+msg);}finally{setBookSaving(false);}}

  // 日 state
  const[viewYM,setViewYM]=useState(today.slice(0,7));
  const[selDay,setSelDay]=useState(today);

  // 週 state
  const[viewQ,setViewQ]=useState(()=>{const d=new Date();return`${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}`;});
  const[selWk,setSelWk]=useState(wkStart(today));

  // 月 state
  const[viewY,setViewY]=useState(new Date().getFullYear());
  const[selM,setSelM]=useState(today.slice(0,7));

  // ── shared UI ──
  const MilSL=({ch})=><div style={{display:"flex",alignItems:"center",gap:8,padding:"20px 0 10px",fontFamily:"monospace",fontSize:12,letterSpacing:2,color:MIL}}><span style={{flexShrink:0}}>◈</span><span style={{flexShrink:0}}>{ch}</span><span style={{flex:1,height:1,background:MIL,opacity:.22}}/></div>;
  const NavBtn=({onClick,ch})=><button onClick={onClick} style={{background:"transparent",border:`1px solid ${C.bd}`,color:C.tx,padding:"6px 14px",borderRadius:6,fontSize:16,lineHeight:1}}>{ch}</button>;
  const GridLines=()=><>{[25,50,75].map(p=><div key={p} style={{position:"absolute",left:0,right:0,bottom:`${p}%`,height:1,background:MIL_DIM}}/>)}</>;

  // ── 主頁 data ──
  const inBase={background:"transparent",border:"none",borderBottom:`1px solid ${C.bd}`,borderRadius:0,padding:"6px 4px",fontSize:16,fontFamily:"monospace",color:C.tx,outline:"none",textAlign:"center"};
  const todayEntries=SUBJECTS.filter(s=>plog[today]?.[s]);
  const days7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return d.toISOString().split("T")[0];});
  const sub7=SUBJECTS.map(s=>({sub:s,total:days7.reduce((a,d)=>a+(plog[d]?.[s]?.count||0),0)}));
  const max7=Math.max(...sub7.map(x=>x.total),1);
  const l30=Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-29+i);const k=d.toISOString().split("T")[0];return{date:k,mins:log[k]||0};});
  const mm=Math.max(...l30.map(d=>d.mins),1);
  const ec={};["完全忘記","要件不完整","與其他爭點混淆","其他"].forEach(r=>ec[r]=0);
  issues.forEach(i=>(i.errors||[]).forEach(e=>{if(ec[e.reason]!==undefined)ec[e.reason]++;}));
  const me=Math.max(...Object.values(ec),1);
  const cf=issues.map(i=>({...i,cc:(i.errors||[]).filter(e=>e.reason==="與其他爭點混淆").length})).filter(i=>i.cc>0).sort((a,b)=>b.cc-a.cc).slice(0,5);

  // ── 日 data ──
  const calY=parseInt(viewYM.slice(0,4));const calM=parseInt(viewYM.slice(5,7));
  const daysInM=new Date(calY,calM,0).getDate();
  const startDow=(new Date(calY,calM-1,1).getDay()+6)%7;
  const calDates=Array.from({length:daysInM},(_,i)=>{const d=new Date(calY,calM-1,i+1);return d.toISOString().split("T")[0];});
  const calMax=Math.max(...calDates.map(d=>log[d]||0),1);
  const prevYM=()=>{const d=new Date(calY,calM-2,1);setViewYM(d.toISOString().slice(0,7));};
  const nextYM=()=>{const d=new Date(calY,calM,1);setViewYM(d.toISOString().slice(0,7));};

  // ── 週 data ──
  const[qY,qQ]=viewQ.split("-Q").map(Number);
  const qStart=new Date(qY,(qQ-1)*3,1);const qEnd=new Date(qY,qQ*3,0);
  const qWks=[];{let w=wkStart(qStart.toISOString().split("T")[0]);while(new Date(w)<=qEnd){qWks.push(w);w=addDays(w,7);}}
  const wkDates=wk=>Array.from({length:7},(_,i)=>addDays(wk,i));
  const prevQ=()=>{const nq=qQ===1?4:qQ-1;setViewQ(`${qQ===1?qY-1:qY}-Q${nq}`);};
  const nextQ=()=>{const nq=qQ===4?1:qQ+1;setViewQ(`${qQ===4?qY+1:qY}-Q${nq}`);};
  const selWkDs=wkDates(selWk);const selWkMax=Math.max(...selWkDs.map(d=>log[d]||0),1);

  // ── 月 data ──
  const mNames=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const moDates=(y,m)=>Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${y}-${String(m).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`);
  const moMins=(y,m)=>sumLog(log,moDates(y,m));
  const selMY=parseInt(selM.slice(0,4));const selMM=parseInt(selM.slice(5,7));
  const selMWks=[];{let w=wkStart(moDates(selMY,selMM)[0]);const end=new Date(selMY,selMM,0);while(new Date(w)<=end){selMWks.push(w);w=addDays(w,7);}}
  const selMWkMax=Math.max(...selMWks.map(w=>sumLog(log,wkDates(w))),1);

  // ── 趨勢 data ──
  const t30=Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-29+i);const k=d.toISOString().split("T")[0];return{date:k,mins:log[k]||0};});
  const tMax30=Math.max(...t30.map(d=>d.mins),1);
  const t12wk=Array.from({length:12},(_,i)=>{const w=addDays(wkStart(today),-(11-i)*7);return{wk:w,total:sumLog(log,wkDates(w))};});
  const tMaxWk=Math.max(...t12wk.map(w=>w.total),1);
  const t12mo=Array.from({length:12},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(11-i));return{label:mNames[d.getMonth()],y:d.getFullYear(),m:d.getMonth()+1};}).map(x=>({...x,total:moMins(x.y,x.m)}));
  const tMaxMo=Math.max(...t12mo.map(x=>x.total),1);
  const t14=Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()-13+i);return d.toISOString().split("T")[0];});
  const t14Max=Math.max(...t14.map(d=>SUBJECTS.reduce((a,s)=>a+(plog[d]?.[s]?.count||0),0)),1);

  return<div style={{paddingBottom:8}}>
    {/* ── sub-tab bar ── */}
    <div style={{display:"flex",gap:4,marginBottom:16,overflowX:"auto",paddingBottom:2}}>
      {[["home","主頁"],["day","日"],["week","週"],["month","月"],["trend","趨勢"]].map(([id,lbl])=><button key={id} onClick={()=>setStab(id)} style={{background:"transparent",border:`1px solid ${stab===id?MIL:C.bd}`,borderRadius:16,padding:"5px 14px",fontSize:14,fontFamily:"monospace",color:stab===id?MIL:C.mt,whiteSpace:"nowrap",flexShrink:0,cursor:"pointer"}}>{lbl}</button>)}
    </div>

    {/* ───── 主頁 ───── */}
    {stab==="home"&&<div>
      <MilSL ch="今日練習記錄"/>
      <div style={{marginBottom:4}}>
        {todayEntries.length>0
          ?<div style={{marginBottom:10}}>{todayEntries.map(s=>{const d=plog[today][s];const linkedBooks=books.filter(b=>b.subject===s&&(bookLog[b.id]||0)>0);return<div key={s} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:`1px solid ${C.bd}`}}>
            <span style={{width:8,height:8,background:SUB_C[s],flexShrink:0,display:"inline-block"}}/>
            <span style={{flex:1,fontSize:14,fontFamily:"monospace"}}>{s}</span>
            {linkedBooks.length>0&&<span style={{fontSize:11,fontFamily:"monospace",color:MIL,background:MIL+"18",padding:"1px 5px",borderRadius:3}}>📖{linkedBooks.map(b=>b.title).join("、")}</span>}
            <span style={{fontSize:14,fontFamily:"monospace",color:MIL}}>{d.count}題</span>
            <span style={{fontSize:14,fontFamily:"monospace",color:C.mt,marginLeft:8}}>{d.minutes}分</span>
          </div>;})}
          </div>
          :<div style={{fontSize:13,color:C.mt,padding:"4px 0 10px",fontFamily:"monospace"}}>— NO RECORD —</div>
        }
        <div style={{padding:"10px 0",borderTop:`1px solid ${C.bd}`}}>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
            <select value={sub} onChange={e=>setSub(e.target.value)} style={{flex:1,background:C.sf,color:C.tx,border:`1px solid ${C.bd}`,borderRadius:6,padding:"6px 8px",fontSize:15,outline:"none"}}>
              {SUBJECTS.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <input type="number" inputMode="numeric" min="0" placeholder="題數" value={cnt} onChange={e=>setCnt(e.target.value)} style={{...inBase,width:64}}/>
            <input type="number" inputMode="numeric" min="0" placeholder="分鐘" value={mins} onChange={e=>setMins(e.target.value)} style={{...inBase,width:64}}/>
            <button onClick={handleAdd} disabled={saving||(!cnt&&!mins)} style={{background:MIL,color:"#000",fontWeight:700,fontSize:17,padding:"7px 14px",borderRadius:6,flexShrink:0}}>{saving?"…":"＋"}</button>
          </div>
          {/* 書籍 chips */}
          {books.filter(b=>b.subject===sub).length>0&&<div style={{fontSize:11,color:C.mt,fontFamily:"monospace",marginBottom:4}}>點選書籍可連結本次題數記錄：</div>}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
            {books.filter(b=>b.subject===sub).map(b=>{const done=bookLog[b.id]||0;const pct=b.total>0?Math.min(100,Math.round(done/b.total*100)):0;const isSel=selBook===b.id;return<div key={b.id} style={{display:"flex",alignItems:"center",gap:0,border:`1px solid ${isSel?MIL:C.bd}`,borderRadius:4,overflow:"hidden",cursor:"pointer",background:isSel?MIL+"18":"transparent"}} onClick={()=>setSelBook(isSel?null:b.id)}>
              <span style={{padding:"4px 8px",fontSize:13,fontFamily:"monospace",color:isSel?MIL:C.tx,userSelect:"none"}}>{isSel?"✓ ":""}{b.title} <span style={{color:C.mt,fontSize:11}}>{pct}%</span></span>
              <span onClick={e=>{e.stopPropagation();deleteBook(b.id);if(selBook===b.id)setSelBook(null);}} style={{padding:"4px 6px",fontSize:11,color:C.mt,borderLeft:`1px solid ${C.bd}`,cursor:"pointer",userSelect:"none"}}>✕</span>
            </div>;})}
            {!addingBook&&<button onClick={()=>setAddingBook(true)} style={{background:"transparent",border:`1px dashed ${C.bd}`,borderRadius:4,padding:"4px 8px",fontSize:13,color:C.mt,cursor:"pointer"}}>＋ 新書</button>}
          </div>
          {/* inline 新增書籍表單 */}
          {addingBook&&<div style={{display:"flex",gap:6,alignItems:"center",marginTop:8}}>
            <input placeholder="書名" value={newBTitle} onChange={e=>setNewBTitle(e.target.value)} style={{...inBase,flex:1,textAlign:"left"}}/>
            <input type="number" inputMode="numeric" min="1" placeholder="總題數" value={newBTotal} onChange={e=>setNewBTotal(e.target.value)} style={{...inBase,width:72}}/>
            <button onClick={handleAddBook} disabled={bookSaving||!newBTitle.trim()||!newBTotal} style={{background:MIL,color:"#000",fontWeight:700,fontSize:15,padding:"5px 10px",borderRadius:4}}>{bookSaving?"…":"✓"}</button>
            <button onClick={()=>{setAddingBook(false);setNewBTitle("");setNewBTotal("");}} style={{background:"transparent",border:`1px solid ${C.bd}`,color:C.mt,fontSize:15,padding:"5px 10px",borderRadius:4}}>✕</button>
          </div>}
        </div>
        {saveErr&&<div style={{fontSize:13,color:C.dg,fontFamily:"monospace",paddingBottom:8}}>{saveErr}</div>}
      </div>
      {books.length>0&&<><MilSL ch="書籍進度"/>
      <div style={{marginBottom:8}}>{SUBJECTS.filter(s=>books.some(b=>b.subject===s)).map(s=>{const sBooks=books.filter(b=>b.subject===s);return<div key={s} style={{marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
          <span style={{width:6,height:6,background:SUB_C[s],display:"inline-block",flexShrink:0}}/>
          <span style={{fontSize:13,fontFamily:"monospace",color:SUB_C[s],fontWeight:600}}>{s}</span>
        </div>
        {sBooks.map(b=>{const done=bookLog[b.id]||0;const pct=b.total>0?Math.min(100,Math.round(done/b.total*100)):0;
          if(editingBook===b.id)return<div key={b.id} style={{display:"flex",gap:5,alignItems:"center",marginBottom:7,paddingLeft:14}}>
            <input value={editBTitle} onChange={e=>setEditBTitle(e.target.value)} style={{...inBase,flex:1,textAlign:"left"}}/>
            <input type="number" value={editBTotal} onChange={e=>setEditBTotal(e.target.value)} style={{...inBase,width:64}} placeholder="總題"/>
            <button onClick={handleEditBook} disabled={editBSaving} style={{background:MIL,color:"#000",fontWeight:700,fontSize:13,padding:"4px 8px",borderRadius:4}}>{editBSaving?"…":"✓"}</button>
            <button onClick={()=>setEditingBook(null)} style={{background:"transparent",border:`1px solid ${C.bd}`,color:C.mt,fontSize:13,padding:"4px 8px",borderRadius:4}}>✕</button>
          </div>;
          return<div key={b.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7,paddingLeft:14}}>
            <span style={{flex:1,fontSize:13,fontFamily:"monospace",color:C.tx,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.title}</span>
            <div style={{width:80,height:5,background:C.bd,flexShrink:0,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:MIL,transition:"width .4s"}}/>
            </div>
            <span style={{fontSize:12,fontFamily:"monospace",color:C.mt,flexShrink:0,width:64,textAlign:"right"}}>{done}/{b.total} {pct}%</span>
            <button onClick={()=>{setEditingBook(b.id);setEditBTitle(b.title);setEditBTotal(String(b.total));}} style={{background:"transparent",border:`1px solid ${C.bd}`,color:C.mt,fontSize:11,padding:"2px 5px",borderRadius:3,flexShrink:0}}>✎</button>
          </div>;})}
      </div>;})}
      </div></>}
      <MilSL ch="近 7 日題數"/>
      <div style={{marginBottom:8}}>
        {sub7.every(x=>x.total===0)?<div style={{fontSize:13,color:C.mt,padding:"6px 0",fontFamily:"monospace"}}>— NO DATA —</div>
          :sub7.map(({sub,total})=><div key={sub} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
            <span style={{width:52,fontSize:13,fontFamily:"monospace",color:C.mt,flexShrink:0}}>{sub}</span>
            <div style={{flex:1,height:6,background:C.bd,position:"relative",overflow:"hidden"}}>
              {[25,50,75].map(p=><div key={p} style={{position:"absolute",left:`${p}%`,top:0,bottom:0,width:1,background:MIL_DIM}}/>)}
              <div style={{position:"absolute",top:0,left:0,bottom:0,width:`${total>0?Math.max(Math.round(total/max7*100),3):0}%`,background:MIL,transition:"width .4s"}}/>
            </div>
            <span style={{fontSize:13,fontFamily:"monospace",color:total>0?MIL:C.mt,width:28,textAlign:"right"}}>{total||"—"}</span>
          </div>)}
      </div>
      <MilSL ch="各科複習進度"/>
      <div style={{marginBottom:8}}>{SUBJECTS.map(s=>{const st=subSt(issues,s);const filled=Math.round(st.avgPct/100*6);const pdone=Object.values(plog).reduce((sum,day)=>sum+(day[s]?.count||0),0);return<div key={s} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{width:52,fontSize:13,fontFamily:"monospace",color:SUB_C[s],flexShrink:0,fontWeight:600}}>{s}</span>
        <div style={{flex:1,display:"flex",gap:2}}>{Array.from({length:6},(_,x)=><div key={x} style={{flex:1,height:8,background:x<filled?MIL:C.bd}}/>)}</div>
        <span style={{fontSize:12,fontFamily:"monospace",color:C.mt,width:100,textAlign:"right",flexShrink:0}}>爭{st.mastered}/{st.total} · 解{pdone}</span>
      </div>;})}
      </div>
      <MilSL ch="每日複習時間（近 30 天）"/>
      <div style={{marginBottom:8}}>
        <div style={{position:"relative",height:80}}>
          <GridLines/>
          <div style={{display:"flex",alignItems:"flex-end",gap:2,height:"100%",position:"relative",zIndex:2}}>
            {l30.map((d,i)=>{const h=Math.round(d.mins/mm*72);return<div key={i} title={`${d.date}: ${d.mins}分`} style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"flex-end",height:"100%"}}><div style={{width:"100%",height:h||2,background:d.date===today?MIL:MIL_DIM,minHeight:2}}/></div>;})}
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.mt,marginTop:6,fontFamily:"monospace"}}><span>T-30</span><span>TODAY</span></div>
      </div>
      <MilSL ch="失敗原因排行"/>
      <div style={{marginBottom:8}}>{Object.entries(ec).sort((a,b)=>b[1]-a[1]).map(([r,c],n)=><div key={r} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{width:20,fontSize:12,fontFamily:"monospace",color:MIL,flexShrink:0}}>[{n+1}]</span>
        <span style={{width:110,fontSize:14,color:C.mt,flexShrink:0}}>{r}</span>
        <div style={{flex:1,height:4,background:C.bd,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.round(c/me*100)}%`,background:MIL,transition:"width .4s"}}/></div>
        <span style={{fontSize:14,fontFamily:"monospace",color:MIL,width:24,textAlign:"right"}}>{c}</span>
      </div>)}</div>
      {cf.length>0&&<><MilSL ch="高頻混淆爭點"/><div style={{marginBottom:8}}>{cf.map(i=><div key={i.id} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.bd}`,fontSize:15,fontFamily:"monospace"}}><span>{i.name}<span style={{marginLeft:6}}><ST s={i.subject}/></span></span><span style={{color:C.dg,fontWeight:700}}>{i.cc}x</span></div>)}</div></>}
    </div>}

    {/* ───── 日 ───── */}
    {stab==="day"&&<div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <NavBtn onClick={prevYM} ch="◀"/><span style={{fontFamily:"monospace",fontSize:16,fontWeight:700}}>{calY}年{calM}月</span><NavBtn onClick={nextYM} ch="▶"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {["一","二","三","四","五","六","日"].map(d=><div key={d} style={{textAlign:"center",fontSize:12,color:C.mt,fontFamily:"monospace",padding:"3px 0"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {Array.from({length:startDow},(_,i)=><div key={"e"+i}/>)}
        {calDates.map(date=>{const m=log[date]||0;const isSel=selDay===date;const isT=date===today;
          return<div key={date} onClick={()=>setSelDay(date)} style={{background:m>0?`rgba(34,197,94,${0.12+m/calMax*0.78})`:C.cd,border:`1.5px solid ${isSel?MIL:isT?"rgba(34,197,94,.4)":"transparent"}`,borderRadius:4,padding:"6px 2px 4px",cursor:"pointer",textAlign:"center",minHeight:50}}>
            <div style={{fontSize:14,fontFamily:"monospace",color:isT?MIL:C.tx,fontWeight:isT?700:400}}>{parseInt(date.slice(8))}</div>
            {m>0&&<div style={{fontSize:11,fontFamily:"monospace",color:MIL,marginTop:2,lineHeight:1.2}}>{fmm(m)}</div>}
          </div>;})}
      </div>
      {(()=>{const dm=log[selDay]||0;const dp=plog[selDay]||{};const ds=SUBJECTS.filter(s=>dp[s]);const dm2=Math.max(...ds.map(s=>dp[s]?.minutes||0),1);
        return<div style={{marginTop:14,padding:"12px 0",borderTop:`1px solid ${C.bd}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
            <span style={{fontFamily:"monospace",fontSize:13,color:C.mt}}>{selDay}</span>
            <span style={{fontFamily:"monospace",fontSize:20,fontWeight:700,color:dm?MIL:C.mt}}>{fmm(dm)}</span>
          </div>
          {ds.length>0&&ds.map(s=>{const d=dp[s];return<div key={s} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{width:8,height:8,background:SUB_C[s],flexShrink:0,display:"inline-block"}}/>
            <span style={{width:48,fontSize:13,fontFamily:"monospace",color:C.mt,flexShrink:0}}>{s}</span>
            <div style={{flex:1,height:6,background:C.bd,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${Math.round((d.minutes||0)/dm2*100)}%`,background:SUB_C[s]}}/>
            </div>
            <span style={{fontSize:12,fontFamily:"monospace",color:C.mt,width:56,textAlign:"right",flexShrink:0}}>{d.count}題 {d.minutes}分</span>
          </div>;})}
          {ds.length===0&&<div style={{fontSize:13,color:C.mt,fontFamily:"monospace"}}>— 無記錄 —</div>}
        </div>;})()}
    </div>}

    {/* ───── 週 ───── */}
    {stab==="week"&&<div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <NavBtn onClick={prevQ} ch="◀"/><span style={{fontFamily:"monospace",fontSize:16,fontWeight:700}}>{qY} Q{qQ}</span><NavBtn onClick={nextQ} ch="▶"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
        {qWks.map(wk=>{const total=sumLog(log,wkDates(wk));const isSel=selWk===wk;
          return<div key={wk} onClick={()=>setSelWk(wk)} style={{background:C.cd,border:`1.5px solid ${isSel?MIL:C.bd}`,borderRadius:6,padding:"10px 8px",cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:13,fontFamily:"monospace",color:C.mt,marginBottom:4}}>{wk.slice(5,7)}/{wk.slice(8)}~</div>
            <div style={{fontSize:15,fontFamily:"monospace",color:total?MIL:C.mt,fontWeight:700}}>{fmm(total)}</div>
          </div>;})}
      </div>
      <div style={{marginTop:14,padding:"12px 0",borderTop:`1px solid ${C.bd}`}}>
        <div style={{fontFamily:"monospace",fontSize:13,color:C.mt,marginBottom:10}}>
          {selWk} ~ {addDays(selWk,6)} · 合計 <span style={{color:MIL,fontWeight:700}}>{fmm(sumLog(log,selWkDs))}</span>
        </div>
        <div style={{position:"relative",height:80}}>
          <GridLines/>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:"100%",position:"relative",zIndex:2}}>
            {selWkDs.map((d,i)=>{const m=log[d]||0;const h=Math.round(m/selWkMax*76);const isT=d===today;
              return<div key={d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                <div style={{width:"100%",height:h||2,background:isT?MIL:MIL_DIM,minHeight:2}}/>
                <div style={{fontSize:11,color:isT?MIL:C.mt,fontFamily:"monospace",marginTop:4}}>{["一","二","三","四","五","六","日"][i]}</div>
              </div>;})}
          </div>
        </div>
      </div>
    </div>}

    {/* ───── 月 ───── */}
    {stab==="month"&&<div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <NavBtn onClick={()=>setViewY(y=>y-1)} ch="◀"/><span style={{fontFamily:"monospace",fontSize:16,fontWeight:700}}>{viewY}</span><NavBtn onClick={()=>setViewY(y=>y+1)} ch="▶"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
        {Array.from({length:12},(_,i)=>{const ym=`${viewY}-${String(i+1).padStart(2,"0")}`;const total=moMins(viewY,i+1);const isSel=selM===ym;
          return<div key={ym} onClick={()=>setSelM(ym)} style={{background:C.cd,border:`1.5px solid ${isSel?MIL:C.bd}`,borderRadius:6,padding:"10px 8px",cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:13,fontFamily:"monospace",color:C.mt,marginBottom:4}}>{mNames[i]}</div>
            <div style={{fontSize:15,fontFamily:"monospace",color:total?MIL:C.mt,fontWeight:700}}>{fmm(total)}</div>
          </div>;})}
      </div>
      {(()=>{const mTotal=moMins(selMY,selMM);const mDs=moDates(selMY,selMM);const mAct=mDs.filter(d=>log[d]>0).length;
        return<div style={{marginTop:14,padding:"12px 0",borderTop:`1px solid ${C.bd}`}}>
          <div style={{display:"flex",justifyContent:"space-around",marginBottom:12}}>
            {[["月合計",fmm(mTotal)],[`日均(${mAct}天)`,fmm(mAct?Math.round(mTotal/mAct):0)],["活躍/天數",`${mAct}/${mDs.length}`]].map(([l,v])=><div key={l} style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:C.mt,fontFamily:"monospace",marginBottom:2}}>{l}</div>
              <div style={{fontSize:17,fontWeight:700,color:MIL,fontFamily:"monospace"}}>{v}</div>
            </div>)}
          </div>
          <div style={{position:"relative",height:80}}>
            <GridLines/>
            <div style={{display:"flex",alignItems:"flex-end",gap:3,height:"100%",position:"relative",zIndex:2}}>
              {selMWks.map(wk=>{const wt=sumLog(log,wkDates(wk));const h=Math.round(wt/selMWkMax*76);
                return<div key={wk} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}>
                  <div style={{width:"100%",height:h||2,background:MIL_DIM,minHeight:2}}/>
                  <div style={{fontSize:8,color:C.mt,fontFamily:"monospace",marginTop:4}}>{wk.slice(5,7)}/{wk.slice(8)}</div>
                </div>;})}
            </div>
          </div>
        </div>;})()}
    </div>}

    {/* ───── 趨勢 ───── */}
    {stab==="trend"&&<div>
      <MilSL ch={`每日複習時間（近 30 天）max: ${fmm(tMax30)}`}/>
      <div style={{position:"relative",height:90,marginBottom:4}}>
        <GridLines/>
        <div style={{display:"flex",alignItems:"flex-end",gap:2,height:"100%",position:"relative",zIndex:2}}>
          {t30.map((d,i)=>{const h=Math.round(d.mins/tMax30*86);return<div key={i} title={`${d.date}: ${fmm(d.mins)}`} style={{flex:1,height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
            <div style={{width:"100%",height:h||2,background:d.date===today?MIL:MIL_DIM,minHeight:2}}/>
          </div>;})}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.mt,fontFamily:"monospace",marginBottom:16}}><span>T-30</span><span>TODAY</span></div>

      <MilSL ch={`每週複習時間（近 12 週）max: ${fmm(tMaxWk)}`}/>
      <div style={{position:"relative",height:90,marginBottom:4}}>
        <GridLines/>
        <div style={{display:"flex",alignItems:"flex-end",gap:3,height:"100%",position:"relative",zIndex:2}}>
          {t12wk.map(({wk,total},i)=>{const h=Math.round(total/tMaxWk*86);return<div key={i} title={`${wk}~: ${fmm(total)}`} style={{flex:1,height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
            <div style={{width:"100%",height:h||2,background:MIL_DIM,minHeight:2}}/>
          </div>;})}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.mt,fontFamily:"monospace",marginBottom:16}}><span>{t12wk[0]?.wk?.slice(5)}</span><span>THIS WK</span></div>

      <MilSL ch={`每月複習時間（近 12 月）max: ${fmm(tMaxMo)}`}/>
      <div style={{position:"relative",height:90,marginBottom:4}}>
        <GridLines/>
        <div style={{display:"flex",alignItems:"flex-end",gap:3,height:"100%",position:"relative",zIndex:2}}>
          {t12mo.map(({label,total},i)=>{const h=Math.round(total/tMaxMo*86);return<div key={i} title={`${label}: ${fmm(total)}`} style={{flex:1,height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
            <div style={{width:"100%",height:h||2,background:MIL_DIM,minHeight:2}}/>
          </div>;})}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.mt,fontFamily:"monospace",marginBottom:16}}><span>{t12mo[0]?.label}</span><span>THIS MO</span></div>

      <MilSL ch="每日科目題數（近 14 天）"/>
      <div style={{position:"relative",height:90,marginBottom:4}}>
        <GridLines/>
        <div style={{display:"flex",alignItems:"flex-end",gap:2,height:"100%",position:"relative",zIndex:2}}>
          {t14.map((date,i)=>{
            const segs=SUBJECTS.map(s=>({s,c:plog[date]?.[s]?.count||0})).filter(x=>x.c>0);
            const total=segs.reduce((a,x)=>a+x.c,0);
            const h=Math.round(total/t14Max*86);
            let offset=0;
            return<div key={i} title={`${date}: ${total}題`} style={{flex:1,height:"100%",position:"relative"}}>
              {h>0&&segs.map(({s,c})=>{const sh=Math.round(c/total*h)||1;const b=offset;offset+=sh;return<div key={s} style={{position:"absolute",bottom:b,left:0,right:0,height:sh,background:SUB_C[s]}}/>;} )}
              {h===0&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:C.bd}}/>}
            </div>;})}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.mt,fontFamily:"monospace",marginBottom:8}}><span>T-14</span><span>TODAY</span></div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"4px 10px"}}>
        {SUBJECTS.filter(s=>t14.some(d=>plog[d]?.[s]?.count>0)).map(s=><span key={s} style={{fontSize:11,fontFamily:"monospace",color:C.mt,display:"flex",alignItems:"center",gap:3}}><span style={{width:7,height:7,background:SUB_C[s],display:"inline-block",flexShrink:0}}/>{s}</span>)}
      </div>
    </div>}
  </div>;
}
