import{useState,useEffect,useRef,useCallback}from"react";
import{supabase}from"./supabase.js";

// ── 常數 ──
const SUBJECTS=["憲法","行政法","民法","民訴","刑法","刑訴","公司法","證交法","保險法","財稅法"];
const SUB_CLR={"憲法":"#f59e0b","行政法":"#3b82f6","民法":"#10b981","民訴":"#06b6d4","刑法":"#ef4444","刑訴":"#f97316","公司法":"#8b5cf6","證交法":"#ec4899","保險法":"#14b8a6","財稅法":"#6366f1"};
const ITV=[3,7,14,21,30,90],HITV=[1,3,7,10,15,45];
const DIFF_CLR={高:"#c0392b",中:"#e67e22",低:"#27ae60"};
const TAG_CLR=["#ff6b6b","#ffa94d","#ffd43b","#69db7c","#38d9a9","#4dabf7","#748ffc","#da77f2","#f783ac","#e599f7"];
const RATINGS=[
  {id:"forgot",label:"完全忘記",color:"#e05252",delta:-2,icon:"😵",fail:"完全忘記"},
  {id:"hard",label:"勉強記得",color:"#f0a840",delta:-1,icon:"😓",fail:null},
  {id:"good",label:"記住了",color:"#3dba7a",delta:1,icon:"👍",fail:null},
  {id:"easy",label:"很熟",color:"#5b6bff",delta:2,icon:"🔥",fail:null},
];
const SORT_OPTS=[{id:"created_desc",label:"新→舊"},{id:"created_asc",label:"舊→新"},{id:"subject",label:"科目"},{id:"next_date",label:"複習日"},{id:"difficulty",label:"難度"},{id:"name",label:"名稱"}];
const EMPTY_DRAFT={name:"",subject:SUBJECTS[0],difficulty:"中",notes:"",tags:[],search:"",related:[]};

// ── 工具函式 ──
const gitv=d=>d==="高"?HITV:ITV;
const calcNext=(b,st,d)=>{const days=gitv(d)[st]??gitv(d).at(-1);const x=new Date(b);x.setDate(x.getDate()+days);return x.toISOString().split("T")[0];};
const today=()=>new Date().toISOString().split("T")[0];
const dDiff=ds=>Math.round((new Date(ds)-new Date(today()))/864e5);
const mkId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const hsh=s=>{let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return Math.abs(h);};
const tagClr=t=>TAG_CLR[hsh(t)%TAG_CLR.length];

const db2i=r=>({id:r.id,name:r.name,subject:r.subject,difficulty:r.difficulty,stage:r.stage,created:r.created,nextDate:r.next_date,lastReviewed:r.last_reviewed,mastered:r.mastered,errors:r.errors||[],related:r.related||[],notes:r.notes||"",tags:r.tags||[]});
const i2db=i=>({id:i.id,name:i.name,subject:i.subject,difficulty:i.difficulty,stage:i.stage,created:i.created,next_date:i.nextDate,last_reviewed:i.lastReviewed,mastered:i.mastered,errors:i.errors||[],related:i.related||[],notes:i.notes||"",tags:i.tags||[],updated_at:new Date().toISOString()});
const getRel=(iss,all)=>all.filter(i=>(iss.related||[]).includes(i.id)||(i.related||[]).includes(iss.id)).filter(i=>i.id!==iss.id);
const getBack=(iss,all)=>all.filter(i=>i.id!==iss.id&&(i.notes||"").includes(`[[${iss.name}]]`));

function pSort(list){const d={高:0,中:1,低:2};return[...list].sort((a,b)=>{const ad=-dDiff(a.nextDate||today()),bd=-dDiff(b.nextDate||today());if(ad!==bd)return bd-ad;if((d[a.difficulty]??1)!==(d[b.difficulty]??1))return(d[a.difficulty]??1)-(d[b.difficulty]??1);if((b.errors||[]).length!==(a.errors||[]).length)return(b.errors||[]).length-(a.errors||[]).length;return a.stage-b.stage;});}
function doSort(list,by){const a=[...list];switch(by){case"created_desc":return a.sort((x,y)=>(y.created||"").localeCompare(x.created||""));case"created_asc":return a.sort((x,y)=>(x.created||"").localeCompare(y.created||""));case"subject":return a.sort((x,y)=>SUBJECTS.indexOf(x.subject)-SUBJECTS.indexOf(y.subject));case"next_date":return a.sort((x,y)=>(x.nextDate||"9999").localeCompare(y.nextDate||"9999"));case"difficulty":{const o={高:0,中:1,低:2};return a.sort((x,y)=>(o[x.difficulty]??1)-(o[y.difficulty]??1));}case"name":return a.sort((x,y)=>x.name.localeCompare(y.name,"zh-Hant"));default:return a;}}
function subStats(issues,sub){const si=issues.filter(i=>i.subject===sub);const t=si.length;if(!t)return{total:0,mastered:0,avgPct:0,remRate:0};const m=si.filter(i=>i.mastered).length;const avg=si.reduce((s,i)=>s+i.stage,0)/t;let tr=0,rem=0;si.forEach(i=>{const e=(i.errors||[]).length;tr+=i.stage+e;rem+=i.stage;});return{total:t,mastered:m,avgPct:Math.round(avg/6*100),remRate:tr>0?Math.round(rem/tr*100):0};}

// ── 筆記渲染（階層+雙向連結）──
function renderNotes(text,issues,onClick){
  if(!text?.trim())return null;
  return text.split("\n").map((line,i)=>{
    let ind=0;const stripped=line.replace(/^(\s*)-\s*/,(m,sp)=>{ind=Math.floor(sp.length/2)+1;return"";});
    if(ind===0&&line.match(/^\s*-\s*/)){ind=1;return mkLine(line.replace(/^\s*-\s*/,""),ind,i,issues,onClick);}
    return mkLine(ind>0?stripped:line,ind,i,issues,onClick);
  });
}
function mkLine(text,ind,key,issues,onClick){
  const parts=text.split(/(\[\[[^\]]+\]\])/g).map((p,i)=>{
    const m=p.match(/^\[\[([^\]]+)\]\]$/);
    if(m){const f=issues.find(x=>x.name===m[1]);return<span key={i} onClick={()=>f&&onClick?.(f.id)} style={{color:"#5b6bff",cursor:f?"pointer":"default",textDecoration:"underline",textDecorationStyle:"dotted"}}>{m[1]}</span>;}
    return<span key={i}>{p}</span>;
  });
  return<div key={key} style={{paddingLeft:ind*16,marginBottom:2,fontSize:13,color:"#e8eaf0",lineHeight:1.7,display:"flex",alignItems:"flex-start"}}>{ind>0&&<span style={{color:"#7b82a0",marginRight:6,flexShrink:0}}>•</span>}<span>{parts}</span></div>;
}

// ── 色彩方案 ──
const C={bg:"#111318",sf:"#1a1d24",cd:"#1f2330",bd:"#2e3347",tx:"#e8eaf0",mt:"#7b82a0",ac:"#5b6bff",am:"#1e2550",dg:"#e05252",dm:"#3d1a1a",ok:"#3dba7a",om:"#1a3d2d"};

const css=`
*{box-sizing:border-box;margin:0;padding:0}html,body,#root{background:${C.bg};color:${C.tx};min-height:100vh}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:3px}
input,select,textarea{background:${C.sf};color:${C.tx};border:1px solid ${C.bd};border-radius:6px;padding:8px 10px;font-size:14px;outline:none;width:100%;font-family:inherit}input:focus,select:focus,textarea:focus{border-color:${C.ac}}
button{cursor:pointer;border:none;border-radius:6px;font-size:13px;padding:7px 14px;transition:opacity .15s;font-family:inherit}button:hover{opacity:.85}button:disabled{opacity:.4}
.tag{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600}
.prog{height:6px;border-radius:3px;background:${C.bd};overflow:hidden}.progf{height:100%;border-radius:3px;transition:width .3s}
.cb{width:18px;height:18px;border-radius:3px;border:1.5px solid ${C.bd};background:transparent;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center}.cb.checked{background:${C.dg};border-color:${C.dg}}
@keyframes spin{to{transform:rotate(360deg)}}.spinner{width:16px;height:16px;border:2px solid ${C.bd};border-top-color:${C.ac};border-radius:50%;animation:spin .8s linear infinite}
.swrap{position:relative}.swrap input{padding-right:32px}.sclr{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:${C.mt};font-size:16px;padding:4px;cursor:pointer}.sclr:hover{color:${C.tx}}
textarea.nlg{min-height:140px;font-size:14px;line-height:1.7;resize:vertical}
@keyframes flipIn{from{opacity:0;transform:rotateX(-10deg)}to{opacity:1;transform:rotateX(0)}}.flip-in{animation:flipIn .3s ease}
`;

// ── 共用小元件 ──
const Stag=({s:sub})=>{const c=SUB_CLR[sub]||C.ac;return<span className="tag" style={{background:c+"20",color:c,border:`1px solid ${c}40`}}>{sub}</span>;};
const Ctag=({t})=>{const c=tagClr(t);return<span className="tag" style={{background:c+"25",color:c,border:`1px solid ${c}50`,fontWeight:600}}>{t}</span>;};
const SI=({value:v,onChange:oc,placeholder:p})=><div className="swrap"><input value={v} onChange={e=>oc(e.target.value)} placeholder={p||"🔍 搜尋…"}/>{v&&<button className="sclr" onClick={()=>oc("")}>✕</button>}</div>;
const Sec=({title:t,children:ch})=><div style={{marginBottom:22}}><div style={{fontSize:11,fontWeight:600,color:C.mt,letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>{t}</div>{ch}</div>;
const SB=({label:l,value:v,color:c})=><div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,padding:"12px 15px"}}><div style={{fontSize:11,color:C.mt,marginBottom:4}}>{l}</div><div style={{fontSize:22,fontWeight:700,color:c||C.tx}}>{v}</div></div>;
const Lb=({children:ch})=><div style={{fontSize:12,color:C.mt,marginBottom:5,fontWeight:600}}>{ch}</div>;
const Ov=({children:ch,onClose:oc})=><div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={oc}><div style={{background:C.cd,border:`1px solid ${C.bd}`,borderRadius:12,minWidth:280,maxWidth:540,width:"100%",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>{ch}</div></div>;

// 四級評分按鈕列
const RateButtons=({onRate,size="md"})=>{const p=size==="sm"?"8px 2px":"12px 4px";const fs=size==="sm"?14:20;const ls=size==="sm"?9:11;
  return<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:size==="sm"?6:8}}>{RATINGS.map(r=><button key={r.id} onClick={()=>onRate(r)} style={{background:r.color+"20",color:r.color,border:`1px solid ${r.color}40`,padding:p,borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",gap:size==="sm"?2:4}}><span style={{fontSize:fs}}>{r.icon}</span><span style={{fontSize:ls,fontWeight:600}}>{r.label}</span>{size!=="sm"&&<span style={{fontSize:9,color:C.mt}}>{r.delta>0?`+${r.delta}`:r.delta}階</span>}</button>)}</div>;};

// 標籤輸入
function TI({tags,setTags,allTags}){const[inp,setInp]=useState("");const sug=inp.length>=1?allTags.filter(t=>t.includes(inp)&&!tags.includes(t)):[];const add=t=>{const tr=t.trim();if(tr&&!tags.includes(tr))setTags([...tags,tr]);setInp("");};
  return<div><div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>{tags.map(t=><span key={t} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:4,fontSize:11,fontWeight:600,background:tagClr(t)+"25",color:tagClr(t),border:`1px solid ${tagClr(t)}50`}}>{t}<span onClick={()=>setTags(tags.filter(x=>x!==t))} style={{marginLeft:2,cursor:"pointer",opacity:.7}}>✕</span></span>)}</div><div style={{display:"flex",gap:6}}><input value={inp} onChange={e=>setInp(e.target.value)} placeholder="輸入標籤" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add(inp);}}} style={{flex:1}}/><button onClick={()=>add(inp)} disabled={!inp.trim()} style={{background:C.ac,color:"#fff",padding:"6px 12px",flexShrink:0,fontSize:12}}>加入</button></div>{sug.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>{sug.slice(0,8).map(t=><span key={t} onClick={()=>add(t)} style={{display:"inline-flex",padding:"3px 8px",borderRadius:4,fontSize:11,fontWeight:600,background:tagClr(t)+"15",color:tagClr(t),border:`1px solid ${tagClr(t)}30`,cursor:"pointer"}}>+ {t}</span>)}</div>}</div>;}

// 進度條元件
const StRow=({sub,issues:iss})=>{const st=subStats(iss,sub);const c=SUB_CLR[sub];if(!st.total)return<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{width:50,fontSize:12,color:c,fontWeight:600,flexShrink:0}}>{sub}</span><div className="prog" style={{flex:1}}><div className="progf" style={{width:"0%"}}/></div><span style={{fontSize:10,color:C.mt,width:140,textAlign:"right"}}>0 題</span></div>;const pc=st.avgPct>=70?"#3dba7a":st.avgPct>=40?"#f0a840":"#e05252";return<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{width:50,fontSize:12,color:c,fontWeight:600,flexShrink:0}}>{sub}</span><div className="prog" style={{flex:1}}><div className="progf" style={{width:`${st.avgPct}%`,background:pc}}/></div><span style={{fontSize:10,color:C.mt,width:140,textAlign:"right",flexShrink:0}}>進度{st.avgPct}% · 記住{st.remRate}% · {st.mastered}/{st.total}</span></div>;};

// ── 編輯面板（共用於 DetailModal 和 IssueCard）──
function EditPanel({issue,issues,allTags,editIssue,onDone}){
  const[n,sN]=useState(issue.name);const[sub,sSub]=useState(issue.subject);const[diff,sDiff]=useState(issue.difficulty);const[notes,sNotes]=useState(issue.notes||"");const[tags,sTags]=useState(issue.tags||[]);const[rs,sRs]=useState("");const[rel,sRel]=useState(issue.related||[]);
  const res=rs.length>=1?issues.filter(i=>(i.name.includes(rs)||i.subject.includes(rs))&&i.id!==issue.id&&!rel.includes(i.id)):[];
  function save(){editIssue(issue.id,{name:n.trim()||issue.name,subject:sub,difficulty:diff,related:rel,notes,tags});onDone();}
  return<div style={{borderTop:`1px solid ${C.bd}`,paddingTop:12}}>
    <div style={{marginBottom:10}}><Lb>爭點名稱</Lb><input value={n} onChange={e=>sN(e.target.value)}/></div>
    <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}><div><Lb>科目</Lb><select value={sub} onChange={e=>sSub(e.target.value)} style={{width:"auto"}}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></div><div><Lb>難度</Lb><select value={diff} onChange={e=>sDiff(e.target.value)} style={{width:"auto"}}>{["高","中","低"].map(d=><option key={d}>{d}</option>)}</select></div></div>
    <div style={{marginBottom:10}}><Lb>筆記 <span style={{fontWeight:400}}>（[[爭點名]] 連結 · - 階層）</span></Lb><textarea className="nlg" value={notes} onChange={e=>sNotes(e.target.value)}/></div>
    <div style={{marginBottom:10}}><Lb>標籤</Lb><TI tags={tags} setTags={sTags} allTags={allTags}/></div>
    <Lb>關聯爭點</Lb><SI value={rs} onChange={sRs} placeholder="搜尋爭點…"/>
    {res.length>0&&<div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:5,marginTop:4,marginBottom:6,maxHeight:120,overflowY:"auto"}}>{res.slice(0,5).map(i=><div key={i.id} onClick={()=>{sRel(r=>[...r,i.id]);sRs("");}} style={{padding:"7px 10px",cursor:"pointer",fontSize:12}}>{i.subject} · {i.name}</div>)}</div>}
    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6,marginBottom:10}}>{rel.map(id=>{const i=issues.find(x=>x.id===id);if(!i)return null;return<span key={id} className="tag" style={{background:C.am,color:C.ac,fontSize:11}}>{i.name}<span onClick={()=>sRel(r=>r.filter(x=>x!==id))} style={{marginLeft:3,cursor:"pointer",opacity:.7}}>✕</span></span>;})}</div>
    <div style={{display:"flex",gap:8}}><button onClick={save} style={{background:C.ac,color:"#fff",fontSize:13,padding:"9px 20px"}}>儲存變更</button><button onClick={onDone} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:13,padding:"9px 16px"}}>取消</button></div>
  </div>;
}

// ══════════════════════════════════════════
// ── 主 App ──
// ══════════════════════════════════════════
export default function App(){
  const[tab,setTab]=useState("dashboard");
  const[issues,setIssues]=useState(null);
  const[studyLog,setStudyLog]=useState({});
  const[sprintMode,setSprintMode]=useState(false);
  const[dailyLimit,setDailyLimit]=useState(30);
  const[modal,setModal]=useState(null);
  const[syncStatus,setSyncStatus]=useState("loading");
  const[jumpSearch,setJumpSearch]=useState("");
  const[viewId,setViewId]=useState(null);
  const[fcMode,setFcMode]=useState(false);
  const[draft,setDraft]=useState({...EMPTY_DRAFT});
  const ss=useRef(Date.now());

  const load=useCallback(async()=>{
    try{setSyncStatus("loading");
      const[iR,lR,sR,dR]=await Promise.all([supabase.from("issues").select("*"),supabase.from("study_log").select("*"),supabase.from("settings").select("*").eq("key","sprint_mode").maybeSingle(),supabase.from("settings").select("*").eq("key","daily_limit").maybeSingle()]);
      if(iR.error)throw iR.error;setIssues((iR.data||[]).map(db2i));
      const log={};(lR.data||[]).forEach(r=>{log[r.date]=r.minutes;});setStudyLog(log);
      setSprintMode(sR.data?.value===true);if(dR.data?.value)setDailyLimit(dR.data.value);setSyncStatus("synced");
    }catch(e){console.error(e);setSyncStatus("error");}
  },[]);

  useEffect(()=>{load();const ch=supabase.channel("sync").on("postgres_changes",{event:"*",schema:"public",table:"issues"},load).on("postgres_changes",{event:"*",schema:"public",table:"study_log"},load).on("postgres_changes",{event:"*",schema:"public",table:"settings"},load).subscribe();ss.current=Date.now();return()=>{ch.unsubscribe();const el=Math.floor((Date.now()-ss.current)/60000);if(el>0)supabase.from("study_log").upsert({date:today(),minutes:(studyLog[today()]||0)+el});};},[load]);

  const getDue=i=>{if(sprintMode&&i.stage<6){const d=new Date(i.lastReviewed||i.created);d.setDate(d.getDate()+2);return d.toISOString().split("T")[0];}return i.nextDate;};
  const isDue=i=>!i.mastered&&i.stage<6&&getDue(i)<=today();

  async function save(i){setSyncStatus("saving");const{error}=await supabase.from("issues").upsert(i2db(i));setSyncStatus(error?"error":"synced");}

  async function rate(issue,r){
    const ns=Math.max(0,Math.min(6,issue.stage+r.delta));const m=ns>=6;
    const errs=r.fail?[...(issue.errors||[]),{date:today(),reason:r.fail}]:(issue.errors||[]);
    const next={...issue,stage:ns,lastReviewed:today(),nextDate:m?null:calcNext(today(),ns,issue.difficulty),mastered:m,errors:errs};
    setIssues(a=>a.map(i=>i.id===issue.id?next:i));await save(next);return next;
  }
  async function addIssue(iss){const n={...iss,id:mkId(),created:today(),stage:0,nextDate:calcNext(today(),0,iss.difficulty),lastReviewed:null,mastered:false,errors:[],related:iss.related||[]};setIssues(a=>[...a,n]);await save(n);}
  async function editIssue(id,ch){const u=issues.find(i=>i.id===id);if(!u)return;const n={...u,...ch};setIssues(a=>a.map(i=>i.id===id?n:i));await save(n);}
  async function delMany(ids){setIssues(a=>a.filter(i=>!ids.includes(i.id)));setSyncStatus("saving");await supabase.from("issues").delete().in("id",ids);setSyncStatus("synced");}
  async function delOne(id){setIssues(a=>a.filter(i=>i.id!==id));if(viewId===id)setViewId(null);setSyncStatus("saving");await supabase.from("issues").delete().eq("id",id);setSyncStatus("synced");}
  async function togSprint(){const n=!sprintMode;setSprintMode(n);await supabase.from("settings").upsert({key:"sprint_mode",value:n});}
  async function setLimit(v){const val=Math.max(1,Math.min(200,v));setDailyLimit(val);await supabase.from("settings").upsert({key:"daily_limit",value:val});}

  const jumpTo=name=>{setJumpSearch(name);setTab("overview");setViewId(null);};
  const openDet=id=>setViewId(id);
  const allTags=[...new Set((issues||[]).flatMap(i=>i.tags||[]))].sort();
  const viewIssue=viewId?(issues||[]).find(i=>i.id===viewId):null;

  if(!issues)return<><style>{css}</style><div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,color:C.mt,padding:20}}><div style={{fontSize:32}}>⚖️</div><div style={{color:C.tx,fontWeight:600,fontSize:16}}>司法考試複習追蹤器</div><div className="spinner"/><div style={{fontSize:12}}>{syncStatus==="error"?"連線失敗":"連接中…"}</div>{syncStatus==="error"&&<button onClick={load} style={{background:C.ac,color:"#fff",padding:"8px 20px"}}>重試</button>}</div></>;

  const allDue=pSort(issues.filter(isDue));const todayDue=allDue.slice(0,dailyLimit);const overflow=Math.max(0,allDue.length-dailyLimit);
  const scl=syncStatus==="synced"?C.ok:syncStatus==="error"?C.dg:"#f0a840";
  const slb=syncStatus==="synced"?"● 已同步":syncStatus==="saving"?"● 儲存中":"● 讀取中";
  const tabs=[{id:"dashboard",l:"首頁"},{id:"add",l:"新增"},{id:"overview",l:"總覽"},{id:"stats",l:"統計"}];

  if(fcMode)return<><style>{css}</style><FC issues={issues} queue={todayDue} rate={rate} exit={()=>setFcMode(false)}/></>;

  return<><style>{css}</style>
    <div style={{minHeight:"100vh",background:C.bg}}>
      {sprintMode&&<div style={{background:C.dg,color:"#fff",textAlign:"center",padding:8,fontWeight:600,fontSize:12}}>⚠ 考前衝刺模式</div>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:C.sf,borderBottom:`1px solid ${C.bd}`,position:"sticky",top:0,zIndex:100,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontWeight:700,fontSize:14}}>⚖️ 司法考試複習</span><span style={{fontSize:10,color:scl}}>{slb}</span></div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?C.ac:"transparent",color:tab===t.id?"#fff":C.mt,border:`1px solid ${tab===t.id?C.ac:C.bd}`,padding:"6px 12px",borderRadius:6,fontSize:13}}>{t.l}</button>)}<button onClick={togSprint} style={{background:sprintMode?C.dg:"transparent",color:sprintMode?"#fff":C.mt,border:`1px solid ${sprintMode?C.dg:C.bd}`,padding:"6px 12px",borderRadius:6,fontSize:13}}>{sprintMode?"衝刺中":"衝刺"}</button></div>
      </div>
      <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>
        {tab==="dashboard"&&<Dash issues={issues} todayDue={todayDue} allDueN={allDue.length} overflow={overflow} limit={dailyLimit} setLimit={setLimit} mins={studyLog[today()]||0} rate={rate} getDue={getDue} openDet={openDet} startFC={()=>setFcMode(true)}/>}
        {tab==="add"&&<Add issues={issues} onAdd={addIssue} setTab={setTab} allTags={allTags} draft={draft} setDraft={setDraft}/>}
        {tab==="overview"&&<Ovw issues={issues} rate={rate} isDue={isDue} editIssue={editIssue} delMany={delMany} delOne={delOne} allTags={allTags} jumpSearch={jumpSearch} setJumpSearch={setJumpSearch}/>}
        {tab==="stats"&&<Stat issues={issues} studyLog={studyLog}/>}
      </div>
      {modal?.type==="related"&&<Ov onClose={()=>setModal(null)}><div style={{padding:20}}><div style={{fontWeight:600,marginBottom:10,fontSize:15}}>相關爭點提醒</div>{modal.related.map(r=><div key={r.id} onClick={()=>{setModal(null);openDet(r.id);}} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,padding:"9px 12px",marginBottom:8,fontSize:13,cursor:"pointer"}}><Stag s={r.subject}/> <span style={{marginLeft:4}}>{r.name}</span></div>)}<button onClick={()=>setModal(null)} style={{marginTop:12,background:C.ac,color:"#fff",width:"100%",padding:10}}>了解</button></div></Ov>}
      {viewIssue&&!modal&&<Ov onClose={()=>setViewId(null)}><Det issue={viewIssue} issues={issues} allTags={allTags} editIssue={editIssue} delOne={delOne} rate={rate} isDue={isDue} openDet={openDet} onClose={()=>setViewId(null)}/></Ov>}
    </div></>;
}

// ── 閃卡模式 ──
function FC({issues,queue,rate,exit}){
  const[idx,setIdx]=useState(0);const[flipped,setFlipped]=useState(false);const[results,setResults]=useState([]);const[done,setDone]=useState(false);
  const cur=queue[idx];const rel=cur?getRel(cur,issues):[];const bl=cur?getBack(cur,issues):[];

  async function go(r){await rate(cur,r);setResults(p=>[...p,{issue:cur,rating:r}]);setFlipped(false);if(idx+1>=queue.length)setDone(true);else setIdx(idx+1);}

  if(!queue.length)return<div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:20}}><div style={{fontSize:40}}>🎉</div><div style={{fontSize:18,fontWeight:600}}>今天沒有到期爭點！</div><button onClick={exit} style={{background:C.ac,color:"#fff",padding:"10px 24px",fontSize:14}}>返回</button></div>;

  if(done){const ct={};RATINGS.forEach(r=>ct[r.id]=0);results.forEach(r=>ct[r.rating.id]++);
    return<div style={{minHeight:"100vh",background:C.bg,padding:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <div style={{fontSize:40}}>📊</div><div style={{fontSize:18,fontWeight:600}}>複習完成！共 {results.length} 張</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,width:"100%",maxWidth:400}}>{RATINGS.map(r=><div key={r.id} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:8,padding:12,textAlign:"center"}}><div style={{fontSize:20}}>{r.icon}</div><div style={{fontSize:11,color:r.color,fontWeight:600,marginTop:4}}>{r.label}</div><div style={{fontSize:22,fontWeight:700,marginTop:4}}>{ct[r.id]}</div></div>)}</div>
      <button onClick={exit} style={{background:C.ac,color:"#fff",padding:"10px 24px",fontSize:14,marginTop:8}}>返回首頁</button>
    </div>;}

  return<div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:C.sf,borderBottom:`1px solid ${C.bd}`}}>
      <button onClick={exit} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:12,padding:"5px 12px"}}>✕ 退出</button>
      <span style={{fontSize:13,color:C.mt}}>{idx+1}/{queue.length}</span>
      <div className="prog" style={{width:120}}><div className="progf" style={{width:`${idx/queue.length*100}%`,background:C.ac}}/></div>
    </div>
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,maxWidth:600,margin:"0 auto",width:"100%"}}>
      <div style={{width:"100%",background:C.cd,border:`1px solid ${C.bd}`,borderRadius:12,padding:24,marginBottom:20}}>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}><Stag s={cur.subject}/><span className="tag" style={{background:"transparent",color:DIFF_CLR[cur.difficulty],border:`1px solid ${DIFF_CLR[cur.difficulty]}`}}>{cur.difficulty}</span><span style={{fontSize:11,color:C.mt,marginLeft:"auto"}}>階段 {cur.stage}/6</span></div>
        <div style={{fontSize:20,fontWeight:700,textAlign:"center",padding:"20px 0",lineHeight:1.5}}>{cur.name}</div>
        {(cur.tags||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center",marginTop:8}}>{cur.tags.map(t=><Ctag key={t} t={t}/>)}</div>}
      </div>
      {!flipped?<button onClick={()=>setFlipped(true)} style={{background:C.ac,color:"#fff",padding:"14px 40px",fontSize:16,fontWeight:600,borderRadius:10}}>翻牌查看 ▼</button>
      :<div className="flip-in" style={{width:"100%"}}>
        <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:12,padding:20,marginBottom:20,maxHeight:"40vh",overflowY:"auto"}}>
          {(cur.notes||"").trim()?renderNotes(cur.notes,issues,null):<div style={{color:C.mt,textAlign:"center",padding:16,fontSize:13}}>（尚無筆記）</div>}
          {rel.length>0&&<div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.bd}`}}><span style={{fontSize:11,color:C.mt}}>關聯：</span>{rel.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.am,color:C.ac,fontSize:11}}>{r.name}</span>)}</div>}
          {bl.length>0&&<div style={{marginTop:8}}><span style={{fontSize:11,color:C.mt}}>被提及：</span>{bl.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.sf,color:C.mt,fontSize:11,border:`1px solid ${C.bd}`}}>{r.name}</span>)}</div>}
        </div>
        <div style={{fontSize:13,color:C.mt,textAlign:"center",marginBottom:12}}>你記得多少？</div>
        <RateButtons onRate={go}/>
      </div>}
    </div>
  </div>;
}

// ── 爭點詳細頁 ──
function Det({issue,issues,allTags,editIssue,delOne,rate,isDue,openDet,onClose}){
  const[editing,setEditing]=useState(false);const[confirmDel,setConfirmDel]=useState(false);
  const itv=gitv(issue.difficulty);const rel=getRel(issue,issues);const bl=getBack(issue,issues);const due=isDue(issue);

  return<div style={{padding:20}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
      <div><div style={{fontWeight:700,fontSize:16,marginBottom:6}}>{issue.name}</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}><Stag s={issue.subject}/><span className="tag" style={{background:"transparent",color:DIFF_CLR[issue.difficulty],border:`1px solid ${DIFF_CLR[issue.difficulty]}`}}>{issue.difficulty}</span>{issue.mastered&&<span className="tag" style={{background:C.om,color:C.ok}}>已掌握</span>}{due&&!issue.mastered&&<span className="tag" style={{background:C.dm,color:C.dg}}>今日到期</span>}</div></div>
      <div style={{display:"flex",gap:4}}>{!editing&&<button onClick={()=>setEditing(true)} style={{background:C.am,color:C.ac,fontSize:12,padding:"4px 10px"}}>編輯</button>}<button onClick={onClose} style={{background:"transparent",color:C.mt,fontSize:18,padding:"2px 6px",border:"none"}}>✕</button></div>
    </div>
    {!editing?<>
      {(issue.tags||[]).length>0&&<div style={{marginBottom:12,display:"flex",flexWrap:"wrap",gap:4}}>{issue.tags.map(t=><Ctag key={t} t={t}/>)}</div>}
      <div style={{marginBottom:12}}><div style={{display:"flex",gap:3,marginBottom:4}}>{itv.map((_,i)=><div key={i} style={{flex:1,height:6,borderRadius:3,background:i<issue.stage?C.ac:C.bd}}/>)}</div><div style={{fontSize:12,color:C.mt}}>階段 {Math.min(issue.stage,6)}/6{!issue.mastered&&issue.nextDate&&` · 下次：${issue.nextDate}（${dDiff(issue.nextDate)===0?"今天":dDiff(issue.nextDate)>0?`${dDiff(issue.nextDate)}天後`:`逾期${-dDiff(issue.nextDate)}天`}）`}</div></div>
      {(issue.notes||"").trim()&&<div style={{marginBottom:12}}><Lb>筆記 <span style={{fontWeight:400}}>（[[名稱]] 可點擊跳轉）</span></Lb><div style={{background:C.sf,borderRadius:6,padding:"10px 12px"}}>{renderNotes(issue.notes,issues,openDet)}</div></div>}
      {rel.length>0&&<div style={{marginBottom:12}}><Lb>關聯爭點</Lb><div style={{display:"flex",flexDirection:"column",gap:6}}>{rel.map(r=><div key={r.id} onClick={()=>openDet(r.id)} style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,padding:"9px 12px",cursor:"pointer",fontSize:13}}><Stag s={r.subject}/> <span style={{marginLeft:4,fontWeight:500}}>{r.name}</span>{(r.notes||"").trim()&&<div style={{marginTop:4,fontSize:11,color:C.mt,maxHeight:40,overflow:"hidden"}}>{r.notes.slice(0,80)}{r.notes.length>80?"…":""}</div>}</div>)}</div></div>}
      {bl.length>0&&<div style={{marginBottom:12}}><Lb>被提及（反向連結）</Lb><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{bl.map(r=><span key={r.id} onClick={()=>openDet(r.id)} className="tag" style={{background:C.sf,color:C.ac,cursor:"pointer",padding:"4px 10px",fontSize:12,border:`1px solid ${C.bd}`}}>{r.name}</span>)}</div></div>}
      {(issue.errors||[]).length>0&&<div style={{marginBottom:12}}><Lb>錯誤紀錄</Lb><div style={{background:C.sf,borderRadius:6,padding:"8px 10px"}}>{issue.errors.map((e,i)=><div key={i} style={{fontSize:12,color:C.dg,marginBottom:2}}>{e.date} · {e.reason}</div>)}</div></div>}
      {due&&!issue.mastered&&<div style={{marginBottom:12}}><div style={{fontSize:12,color:C.mt,marginBottom:8,textAlign:"center"}}>你記得多少？</div><RateButtons onRate={async r=>{await rate(issue,r);onClose();}}/></div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontSize:11,color:C.mt}}>建立：{issue.created}</div>{!confirmDel?<button onClick={()=>setConfirmDel(true)} style={{background:"transparent",color:C.dg,border:`1px solid ${C.dg}`,fontSize:11,padding:"4px 10px"}}>刪除</button>:<div style={{display:"flex",gap:4}}><button onClick={()=>{delOne(issue.id);onClose();}} style={{background:C.dg,color:"#fff",fontSize:11,padding:"4px 10px"}}>確認</button><button onClick={()=>setConfirmDel(false)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:11,padding:"4px 10px"}}>取消</button></div>}</div>
    </>:<EditPanel issue={issue} issues={issues} allTags={allTags} editIssue={editIssue} onDone={()=>setEditing(false)}/>}
  </div>;
}

// ── Dashboard ──
function Dash({issues,todayDue,allDueN,overflow,limit,setLimit,mins,rate,getDue,openDet,startFC}){
  const[editLim,setEditLim]=useState(false);const[tmp,setTmp]=useState(limit);
  const grouped=SUBJECTS.reduce((a,sub)=>{const d=todayDue.filter(i=>i.subject===sub);if(d.length)a[sub]=d;return a;},{});
  const upcoming=issues.filter(i=>!i.mastered&&dDiff(getDue(i))>0&&dDiff(getDue(i))<=7).sort((a,b)=>getDue(a).localeCompare(getDue(b)));
  return<div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:12}}><SB label="今日到期" value={`${todayDue.length}/${allDueN}`} color={C.dg}/><SB label="複習時間" value={`${mins} 分`} color={C.ac}/><SB label="總爭點" value={issues.length}/><SB label="已掌握" value={issues.filter(i=>i.mastered).length} color={C.ok}/></div>
    {todayDue.length>0&&<button onClick={startFC} style={{width:"100%",background:"linear-gradient(135deg,#5b6bff,#8b5cf6)",color:"#fff",padding:14,fontSize:15,fontWeight:700,borderRadius:10,marginBottom:16,border:"none"}}>🃏 開始閃卡複習（{todayDue.length} 張）</button>}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,padding:"8px 12px",background:C.sf,borderRadius:6,border:`1px solid ${C.bd}`,flexWrap:"wrap"}}><span style={{fontSize:12,color:C.mt}}>每日上限：</span>{!editLim?<><span style={{fontSize:14,fontWeight:600}}>{limit} 題</span>{overflow>0&&<span style={{fontSize:11,color:C.dg}}>（{overflow} 題延後）</span>}<button onClick={()=>{setTmp(limit);setEditLim(true);}} style={{background:"transparent",color:C.ac,border:`1px solid ${C.ac}`,fontSize:11,padding:"3px 10px",marginLeft:"auto"}}>調整</button></>:<><input type="number" value={tmp} onChange={e=>setTmp(Number(e.target.value))} min={1} max={200} style={{width:60,textAlign:"center",padding:4,fontSize:14}}/><button onClick={()=>{setLimit(tmp);setEditLim(false);}} style={{background:C.ac,color:"#fff",fontSize:11,padding:"4px 10px"}}>確認</button><button onClick={()=>setEditLim(false)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:11,padding:"4px 10px"}}>取消</button></>}</div>
    <Sec title="各科複習進度">{SUBJECTS.map(sub=><StRow key={sub} sub={sub} issues={issues}/>)}</Sec>
    {Object.keys(grouped).length>0&&<Sec title={`今日複習（${todayDue.length}）`}>{Object.entries(grouped).map(([sub,list])=><div key={sub} style={{marginBottom:14}}><div style={{fontSize:12,fontWeight:600,color:SUB_CLR[sub],marginBottom:6}}>{sub}</div><div style={{display:"flex",flexDirection:"column",gap:6}}>{list.map(i=><Row key={i.id} issue={i} rate={rate} openDet={openDet}/>)}</div></div>)}</Sec>}
    {upcoming.length>0&&<Sec title="未來 7 天到期"><div style={{display:"flex",flexDirection:"column",gap:6}}>{upcoming.map(i=>{const d=dDiff(getDue(i));return<div key={i.id} onClick={()=>openDet(i.id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,cursor:"pointer"}}><span style={{fontSize:13}}>{i.name}</span><div style={{display:"flex",gap:6,alignItems:"center"}}><Stag s={i.subject}/><span style={{fontSize:11,color:C.mt}}>{d}天後</span></div></div>;})}</div></Sec>}
  </div>;
}

function Row({issue:i,rate,openDet}){
  const[sr,setSr]=useState(false);
  return<div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",gap:8,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>openDet(i.id)}>
        <span style={{fontSize:13,fontWeight:500}}>{i.name}</span><span style={{marginLeft:6}}><Stag s={i.subject}/></span><span className="tag" style={{marginLeft:3,background:"transparent",color:DIFF_CLR[i.difficulty],border:`1px solid ${DIFF_CLR[i.difficulty]}`,fontSize:10}}>{i.difficulty}</span>
        {(i.tags||[]).length>0&&<span style={{marginLeft:4,fontSize:10,color:tagClr(i.tags[0])}}>🏷{i.tags.length}</span>}
        {(i.notes||"").trim()&&<span style={{marginLeft:4,fontSize:10,color:C.mt}}>📝</span>}
      </div>
      <button onClick={e=>{e.stopPropagation();setSr(!sr);}} style={{background:C.am,color:C.ac,fontSize:11,padding:"5px 10px",flexShrink:0}}>{sr?"收起":"評分"}</button>
    </div>
    {sr&&<div style={{padding:"0 12px 10px"}}><RateButtons onRate={async r=>{await rate(i,r);setSr(false);}} size="sm"/></div>}
  </div>;
}

// ── 新增爭點（草稿暫存）──
function Add({issues,onAdd,setTab,allTags,draft,setDraft}){
  const{name,subject,difficulty,notes,tags,search,related}=draft;
  const up=(k,v)=>setDraft(d=>({...d,[k]:v}));
  const res=search.length>=1?issues.filter(i=>(i.name.includes(search)||i.subject.includes(search))&&!related.includes(i.id)):[];
  function submit(){if(!name.trim())return;onAdd({name:name.trim(),subject,difficulty,related,notes,tags});setDraft({...EMPTY_DRAFT});setTab("overview");}
  return<div style={{maxWidth:600}}><Sec title="新增爭點"><div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div><Lb>爭點名稱</Lb><input value={name} onChange={e=>up("name",e.target.value)} placeholder="例：法人格否認理論的要件" onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div><Lb>科目</Lb><select value={subject} onChange={e=>up("subject",e.target.value)}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></div><div><Lb>難度</Lb><select value={difficulty} onChange={e=>up("difficulty",e.target.value)}>{["高","中","低"].map(d=><option key={d}>{d}</option>)}</select></div></div>
    <div><Lb>筆記 <span style={{fontWeight:400}}>（[[爭點名]] 連結 · - 階層）</span></Lb><textarea className="nlg" value={notes} onChange={e=>up("notes",e.target.value)} placeholder={"要件：\n- 第一要件：…\n  - 子項目\n- 第二要件：…\n\n參見：[[其他爭點名稱]]"}/></div>
    <div><Lb>標籤</Lb><TI tags={tags} setTags={v=>up("tags",v)} allTags={allTags}/></div>
    <div><Lb>關聯爭點</Lb><SI value={search} onChange={v=>up("search",v)} placeholder="搜尋現有爭點…"/>{res.length>0&&<div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,marginTop:4,maxHeight:160,overflowY:"auto"}}>{res.slice(0,8).map(i=><div key={i.id} onClick={()=>{up("related",[...related,i.id]);up("search","");}} style={{padding:"8px 12px",cursor:"pointer",borderBottom:`1px solid ${C.bd}`,fontSize:13}}><Stag s={i.subject}/> <span style={{marginLeft:4}}>{i.name}</span></div>)}</div>}<div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:6}}>{related.map(id=>{const i=issues.find(x=>x.id===id);if(!i)return null;return<span key={id} className="tag" style={{background:C.am,color:C.ac,padding:"3px 8px"}}>{i.name}<span onClick={()=>up("related",related.filter(x=>x!==id))} style={{marginLeft:4,cursor:"pointer",opacity:.7}}>✕</span></span>;})}</div></div>
    <div style={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,padding:"10px 12px",fontSize:12,color:C.mt}}>第一次複習日：<strong style={{color:C.tx}}>{calcNext(today(),0,difficulty)}（{difficulty==="高"?"1":"3"} 天後）</strong><br/>間隔：{gitv(difficulty).join(" → ")} 天</div>
    <button onClick={submit} disabled={!name.trim()} style={{background:C.ac,color:"#fff",padding:11,fontWeight:600,fontSize:14}}>新增爭點</button>
  </div></Sec></div>;
}

// ── 爭點總覽 ──
function Ovw({issues,rate,isDue,editIssue,delMany,delOne,allTags,jumpSearch,setJumpSearch}){
  const[sf,sSf]=useState("全部");const[stf,sStf]=useState("全部");const[tf,sTf]=useState("全部");const[sq,sSq]=useState(jumpSearch||"");const[sb,sSb]=useState("created_desc");const[eid,sEid]=useState(null);const[sel,sSel]=useState(new Set());const[dm,sDm]=useState(false);
  useEffect(()=>{if(jumpSearch){sSq(jumpSearch);setJumpSearch("");}},[jumpSearch]);
  let f=issues;
  if(sf!=="全部")f=f.filter(i=>i.subject===sf);
  if(stf==="今日待複習")f=f.filter(isDue);else if(stf==="進行中")f=f.filter(i=>!i.mastered&&!isDue(i));else if(stf==="已掌握")f=f.filter(i=>i.mastered);
  if(tf!=="全部")f=f.filter(i=>(i.tags||[]).includes(tf));
  if(sq.trim()){const q=sq.trim().toLowerCase();f=f.filter(i=>i.name.toLowerCase().includes(q)||i.subject.includes(q)||(i.notes||"").toLowerCase().includes(q)||(i.tags||[]).some(t=>t.includes(q)));}
  f=doSort(f,sb);
  const togSel=id=>sSel(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const selAll=()=>sel.size===f.length?sSel(new Set()):sSel(new Set(f.map(i=>i.id)));
  const confirmDel=()=>{delMany([...sel]);sSel(new Set());sDm(false);};
  return<div>
    <div style={{marginBottom:12}}><SI value={sq} onChange={sSq} placeholder="🔍 搜尋爭點名稱、筆記、標籤…"/>
      <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center",marginTop:10}}>
        <select value={sf} onChange={e=>sSf(e.target.value)} style={{width:"auto"}}><option>全部</option>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select>
        <select value={stf} onChange={e=>sStf(e.target.value)} style={{width:"auto"}}>{["全部","今日待複習","進行中","已掌握"].map(x=><option key={x}>{x}</option>)}</select>
        {allTags.length>0&&<select value={tf} onChange={e=>sTf(e.target.value)} style={{width:"auto"}}><option>全部</option>{allTags.map(t=><option key={t}>{t}</option>)}</select>}
        <select value={sb} onChange={e=>sSb(e.target.value)} style={{width:"auto"}}>{SORT_OPTS.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select>
        <span style={{fontSize:12,color:C.mt}}>共 {f.length} 筆</span>
        <div style={{marginLeft:"auto"}}>{!dm?<button onClick={()=>sDm(true)} style={{background:"transparent",color:C.dg,border:`1px solid ${C.dg}`,fontSize:12,padding:"6px 10px"}}>批量刪除</button>:<div style={{display:"flex",gap:6,alignItems:"center"}}><button onClick={selAll} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:12,padding:"6px 9px"}}>{sel.size===f.length?"取消全選":"全選"}</button><button onClick={confirmDel} disabled={!sel.size} style={{background:C.dg,color:"#fff",fontSize:12,padding:"6px 10px"}}>刪除{sel.size?` (${sel.size})`:""}</button><button onClick={()=>{sSel(new Set());sDm(false);}} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:12,padding:"6px 9px"}}>取消</button></div>}</div>
      </div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {f.map(i=><Card key={i.id} issue={i} issues={issues} isDue={isDue(i)} rate={rate} editing={eid===i.id} setEditing={sEid} editIssue={editIssue} dm={dm} selected={sel.has(i.id)} togSel={()=>togSel(i.id)} delOne={delOne} allTags={allTags}/>)}
      {!f.length&&<div style={{color:C.mt,textAlign:"center",padding:40}}>沒有符合條件的爭點</div>}
    </div>
  </div>;
}

function Card({issue:i,issues,isDue,rate,editing,setEditing,editIssue,dm,selected,togSel,delOne,allTags}){
  const[sn,sSn]=useState(false);const[cd,sCd]=useState(false);const[sr,sSr]=useState(false);
  const itv=gitv(i.difficulty);const rel=getRel(i,issues);const bl=getBack(i,issues);
  return<div style={{background:selected?C.dm:C.cd,border:`1px solid ${selected?C.dg:isDue?C.dg:C.bd}`,borderRadius:8,padding:"13px 15px"}}>
    <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
      {dm&&<div onClick={togSel} className={`cb${selected?" checked":""}`} style={{marginTop:2}}>{selected&&<span style={{color:"#fff",fontSize:11,fontWeight:700}}>✓</span>}</div>}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6,marginBottom:9}}>
          <div><span style={{fontWeight:600,fontSize:14}}>{i.name}</span><span style={{marginLeft:6}}><Stag s={i.subject}/></span><span className="tag" style={{marginLeft:3,background:"transparent",color:DIFF_CLR[i.difficulty],border:`1px solid ${DIFF_CLR[i.difficulty]}`,fontSize:10}}>{i.difficulty}</span>{i.mastered&&<span className="tag" style={{marginLeft:3,background:C.om,color:C.ok}}>已掌握</span>}{isDue&&!i.mastered&&<span className="tag" style={{marginLeft:3,background:C.dm,color:C.dg}}>今日到期</span>}</div>
          {!dm&&<div style={{display:"flex",gap:4}}><button onClick={()=>editing?setEditing(null):setEditing(i.id)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:11,padding:"3px 8px"}}>編輯</button><button onClick={()=>sCd(true)} style={{background:"transparent",color:C.dg,border:`1px solid ${C.dg}`,fontSize:11,padding:"3px 8px"}}>刪除</button></div>}
        </div>
        {(i.tags||[]).length>0&&<div style={{marginBottom:7,display:"flex",flexWrap:"wrap",gap:4}}>{i.tags.map(t=><Ctag key={t} t={t}/>)}</div>}
        <div style={{marginBottom:9}}><div style={{display:"flex",gap:3,marginBottom:4}}>{itv.map((_,x)=><div key={x} style={{flex:1,height:5,borderRadius:3,background:x<i.stage?C.ac:C.bd}}/>)}</div><div style={{fontSize:11,color:C.mt}}>階段 {Math.min(i.stage,6)}/6{!i.mastered&&i.nextDate&&` · 下次：${i.nextDate}（${dDiff(i.nextDate)===0?"今天":dDiff(i.nextDate)>0?`${dDiff(i.nextDate)}天後`:`逾期${-dDiff(i.nextDate)}天`}）`}</div></div>
        {(i.notes||"").trim()&&<div style={{marginBottom:8}}><span onClick={()=>sSn(!sn)} style={{fontSize:11,color:C.ac,cursor:"pointer"}}>{sn?"▼ 收起筆記":"▶ 查看筆記"}</span>{sn&&<div style={{marginTop:4,background:C.sf,borderRadius:5,padding:"8px 10px"}}>{renderNotes(i.notes,issues,null)}</div>}</div>}
        {rel.length>0&&<div style={{marginBottom:7}}><span style={{fontSize:11,color:C.mt}}>關聯：</span>{rel.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.am,color:C.ac,fontSize:11}}>{r.name}</span>)}</div>}
        {bl.length>0&&<div style={{marginBottom:7}}><span style={{fontSize:11,color:C.mt}}>被提及：</span>{bl.map(r=><span key={r.id} className="tag" style={{marginLeft:4,background:C.sf,color:C.mt,fontSize:11,border:`1px solid ${C.bd}`}}>{r.name}</span>)}</div>}
        {(i.errors||[]).length>0&&<div style={{marginBottom:8,background:C.sf,borderRadius:5,padding:"8px 10px"}}><div style={{fontSize:10,color:C.mt,marginBottom:3}}>錯誤紀錄</div>{i.errors.map((e,x)=><div key={x} style={{fontSize:11,color:C.dg}}>{e.date} · {e.reason}</div>)}</div>}
        {editing&&<EditPanel issue={i} issues={issues} allTags={allTags} editIssue={editIssue} onDone={()=>setEditing(null)}/>}
        {isDue&&!i.mastered&&!dm&&!editing&&<div style={{marginTop:6}}>{!sr?<button onClick={()=>sSr(true)} style={{width:"100%",background:C.am,color:C.ac,padding:8}}>評分</button>:<RateButtons onRate={async r=>{await rate(i,r);sSr(false);}} size="sm"/>}</div>}
        {cd&&<div style={{marginTop:8,background:C.dm,border:`1px solid ${C.dg}`,borderRadius:6,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:C.dg}}>確定刪除？</span><div style={{display:"flex",gap:6}}><button onClick={()=>delOne(i.id)} style={{background:C.dg,color:"#fff",fontSize:12,padding:"5px 10px"}}>確認</button><button onClick={()=>sCd(false)} style={{background:"transparent",color:C.mt,border:`1px solid ${C.bd}`,fontSize:12,padding:"5px 10px"}}>取消</button></div></div>}
      </div>
    </div>
  </div>;
}

// ── 統計 ──
function Stat({issues,studyLog}){
  const last30=Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-29+i);const k=d.toISOString().split("T")[0];return{date:k,mins:studyLog[k]||0};});
  const mm=Math.max(...last30.map(d=>d.mins),1);
  const ec={};["完全忘記","要件不完整","與其他爭點混淆","其他"].forEach(r=>ec[r]=0);issues.forEach(i=>(i.errors||[]).forEach(e=>{if(ec[e.reason]!==undefined)ec[e.reason]++;}));const me=Math.max(...Object.values(ec),1);
  const conf=issues.map(i=>({...i,cc:(i.errors||[]).filter(e=>e.reason==="與其他爭點混淆").length})).filter(i=>i.cc>0).sort((a,b)=>b.cc-a.cc).slice(0,5);
  return<div style={{display:"flex",flexDirection:"column",gap:24}}>
    <Sec title="各科複習進度">{SUBJECTS.map(sub=><StRow key={sub} sub={sub} issues={issues}/>)}</Sec>
    <Sec title="每日複習時間（近 30 天）"><div style={{display:"flex",alignItems:"flex-end",gap:2,height:80}}>{last30.map((d,i)=>{const h=Math.round(d.mins/mm*74);return<div key={i} title={`${d.date}: ${d.mins}分`} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}><div style={{width:"100%",height:h||2,background:d.date===today()?C.ac:C.am,borderRadius:2,minHeight:2}}/></div>;})}</div><div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.mt,marginTop:4}}><span>30天前</span><span>今天</span></div></Sec>
    <Sec title="失敗原因排行">{Object.entries(ec).sort((a,b)=>b[1]-a[1]).map(([r,c])=><div key={r} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{width:110,fontSize:12,color:C.mt,flexShrink:0}}>{r}</span><div className="prog" style={{flex:1}}><div className="progf" style={{width:`${Math.round(c/me*100)}%`,background:C.dg}}/></div><span style={{fontSize:12,color:C.mt,width:24,textAlign:"right"}}>{c}</span></div>)}</Sec>
    {conf.length>0&&<Sec title="高頻混淆爭點">{conf.map(i=><div key={i.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.bd}`,fontSize:13}}><span>{i.name}<span style={{marginLeft:6}}><Stag s={i.subject}/></span></span><span style={{color:C.dg,fontWeight:600}}>{i.cc} 次</span></div>)}</Sec>}
  </div>;
}
