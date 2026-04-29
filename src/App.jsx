import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";

const SUBJECTS = ["憲法","行政法","民法","民訴","刑法","刑訴","公司法","證交法","保險法","財稅法"];
const SUBJECT_COLORS = {"憲法":"#f59e0b","行政法":"#3b82f6","民法":"#10b981","民訴":"#06b6d4","刑法":"#ef4444","刑訴":"#f97316","公司法":"#8b5cf6","證交法":"#ec4899","保險法":"#14b8a6","財稅法":"#6366f1"};
const INTERVALS = [3,7,14,21,30,90];
const HARD_INTERVALS = [1,3,7,10,15,45];
const FAIL_REASONS = ["完全忘記","要件不完整","與其他爭點混淆","其他"];
const DIFFICULTY_COLORS = { 高:"#c0392b", 中:"#e67e22", 低:"#27ae60" };
const DEFAULT_DAILY_LIMIT = 30;

function getIntervals(d){return d==="高"?HARD_INTERVALS:INTERVALS;}
function calcNextDate(base,stage,diff){const days=getIntervals(diff)[stage]??getIntervals(diff).at(-1);const d=new Date(base);d.setDate(d.getDate()+days);return d.toISOString().split("T")[0];}
function todayStr(){return new Date().toISOString().split("T")[0];}
function dayDiff(dateStr){return Math.round((new Date(dateStr)-new Date(todayStr()))/86400000);}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

function dbToIssue(row){return{id:row.id,name:row.name,subject:row.subject,difficulty:row.difficulty,stage:row.stage,created:row.created,nextDate:row.next_date,lastReviewed:row.last_reviewed,mastered:row.mastered,errors:row.errors||[],related:row.related||[],notes:row.notes||"",tags:row.tags||[]};}
function issueToDb(i){return{id:i.id,name:i.name,subject:i.subject,difficulty:i.difficulty,stage:i.stage,created:i.created,next_date:i.nextDate,last_reviewed:i.lastReviewed,mastered:i.mastered,errors:i.errors||[],related:i.related||[],notes:i.notes||"",tags:i.tags||[],updated_at:new Date().toISOString()};}
function getRelated(issue,issues){return issues.filter(i=>(issue.related||[]).includes(i.id)||(i.related||[]).includes(issue.id)).filter(i=>i.id!==issue.id);}

function prioritySort(list){const diffOrder={高:0,中:1,低:2};return[...list].sort((a,b)=>{const ad=-dayDiff(a.nextDate||todayStr()),bd=-dayDiff(b.nextDate||todayStr());if(ad!==bd)return bd-ad;const aDiff=diffOrder[a.difficulty]??1,bDiff=diffOrder[b.difficulty]??1;if(aDiff!==bDiff)return aDiff-bDiff;return(b.errors||[]).length-(a.errors||[]).length;});}

const SORT_OPTIONS=[{id:"created_desc",label:"新增日期（新→舊）"},{id:"created_asc",label:"新增日期（舊→新）"},{id:"subject",label:"科目"},{id:"next_date",label:"下次複習日"},{id:"difficulty",label:"難度（高→低）"},{id:"name",label:"名稱"}];
function sortIssues(list,sortBy){const arr=[...list];switch(sortBy){case"created_desc":return arr.sort((a,b)=>(b.created||"").localeCompare(a.created||""));case"created_asc":return arr.sort((a,b)=>(a.created||"").localeCompare(b.created||""));case"subject":return arr.sort((a,b)=>SUBJECTS.indexOf(a.subject)-SUBJECTS.indexOf(b.subject));case"next_date":return arr.sort((a,b)=>(a.nextDate||"9999").localeCompare(b.nextDate||"9999"));case"difficulty":{const o={高:0,中:1,低:2};return arr.sort((a,b)=>(o[a.difficulty]??1)-(o[b.difficulty]??1));}case"name":return arr.sort((a,b)=>a.name.localeCompare(b.name,"zh-Hant"));default:return arr;}}

const s={bg:"#111318",surface:"#1a1d24",card:"#1f2330",border:"#2e3347",text:"#e8eaf0",muted:"#7b82a0",accent:"#5b6bff",accentMuted:"#1e2550",danger:"#e05252",dangerMuted:"#3d1a1a",success:"#3dba7a",successMuted:"#1a3d2d",tagBg:"#2a2040",tagColor:"#b8a0ff"};

const css=`
*{box-sizing:border-box;margin:0;padding:0}
html,body,#root{background:${s.bg};color:${s.text};min-height:100vh}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:${s.bg}}::-webkit-scrollbar-thumb{background:${s.border};border-radius:3px}
input,select,textarea{background:${s.surface};color:${s.text};border:1px solid ${s.border};border-radius:6px;padding:8px 10px;font-size:14px;outline:none;width:100%;font-family:inherit}
input:focus,select:focus,textarea:focus{border-color:${s.accent}}
button{cursor:pointer;border:none;border-radius:6px;font-size:13px;padding:7px 14px;transition:opacity .15s;font-family:inherit}
button:hover{opacity:.85}button:disabled{opacity:.4;cursor:default}
.tag{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600}
.prog{height:6px;border-radius:3px;background:${s.border};overflow:hidden}
.progf{height:100%;border-radius:3px;background:${s.accent};transition:width .3s}
.cb{width:18px;height:18px;border-radius:3px;border:1.5px solid ${s.border};background:transparent;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.cb.checked{background:${s.danger};border-color:${s.danger}}
@keyframes spin{to{transform:rotate(360deg)}}
.spinner{width:16px;height:16px;border:2px solid ${s.border};border-top-color:${s.accent};border-radius:50%;animation:spin .8s linear infinite}
.search-wrap{position:relative}
.search-wrap input{padding-right:32px}
.search-clear{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:${s.muted};font-size:16px;padding:4px;cursor:pointer;line-height:1}
.search-clear:hover{color:${s.text}}
textarea.notes-lg{min-height:120px;font-size:14px;line-height:1.7;resize:vertical}
`;

function SubjectTag({subject}){const color=SUBJECT_COLORS[subject]||s.accent;return<span className="tag" style={{background:color+"20",color:color,border:`1px solid ${color}40`}}>{subject}</span>;}

export default function App(){
  const[tab,setTab]=useState("dashboard");
  const[issues,setIssues]=useState(null);
  const[studyLog,setStudyLog]=useState({});
  const[sprintMode,setSprintMode]=useState(false);
  const[dailyLimit,setDailyLimit]=useState(DEFAULT_DAILY_LIMIT);
  const[modal,setModal]=useState(null);
  const[syncStatus,setSyncStatus]=useState("loading");
  const[jumpSearch,setJumpSearch]=useState("");
  const[viewIssueId,setViewIssueId]=useState(null);
  const sessionStart=useRef(Date.now());

  const load=useCallback(async()=>{
    try{
      setSyncStatus("loading");
      const[iRes,lRes,sRes,dlRes]=await Promise.all([supabase.from("issues").select("*"),supabase.from("study_log").select("*"),supabase.from("settings").select("*").eq("key","sprint_mode").maybeSingle(),supabase.from("settings").select("*").eq("key","daily_limit").maybeSingle()]);
      if(iRes.error)throw iRes.error;
      setIssues((iRes.data||[]).map(dbToIssue));
      const log={};(lRes.data||[]).forEach(r=>{log[r.date]=r.minutes;});setStudyLog(log);
      setSprintMode(sRes.data?.value===true);
      if(dlRes.data?.value)setDailyLimit(dlRes.data.value);
      setSyncStatus("synced");
    }catch(e){console.error(e);setSyncStatus("error");}
  },[]);

  useEffect(()=>{
    load();
    const ch=supabase.channel("sync").on("postgres_changes",{event:"*",schema:"public",table:"issues"},load).on("postgres_changes",{event:"*",schema:"public",table:"study_log"},load).on("postgres_changes",{event:"*",schema:"public",table:"settings"},load).subscribe();
    sessionStart.current=Date.now();
    return()=>{ch.unsubscribe();const elapsed=Math.floor((Date.now()-sessionStart.current)/60000);if(elapsed>0){const today=todayStr();supabase.from("study_log").upsert({date:today,minutes:(studyLog[today]||0)+elapsed});}};
  },[load]);

  function getDueDate(issue){if(sprintMode&&issue.stage<6){const d=new Date(issue.lastReviewed||issue.created);d.setDate(d.getDate()+2);return d.toISOString().split("T")[0];}return issue.nextDate;}
  function isDueToday(issue){return!issue.mastered&&issue.stage<6&&getDueDate(issue)<=todayStr();}

  async function saveIssue(i){setSyncStatus("saving");const{error}=await supabase.from("issues").upsert(issueToDb(i));setSyncStatus(error?"error":"synced");}

  async function markRemember(issue){
    const ns=issue.stage+1,mastered=ns>=6;
    const next={...issue,stage:ns,lastReviewed:todayStr(),nextDate:mastered?null:calcNextDate(todayStr(),ns,issue.difficulty),mastered};
    setIssues(arr=>arr.map(i=>i.id===issue.id?next:i));
    await saveIssue(next);
    const rel=getRelated(issue,issues||[]);
    if(rel.length)setModal({type:"related_remind",related:rel});
  }

  // 先關詳細頁再顯示原因選單
  function markForgot(issue){setViewIssueId(null);setTimeout(()=>setModal({type:"forgot",issue}),100);}

  async function confirmForgot(issue,reason){
    const newStage=Math.max(0,issue.stage-1);
    const next={...issue,stage:newStage,lastReviewed:todayStr(),nextDate:calcNextDate(todayStr(),newStage,issue.difficulty),mastered:false,errors:[...(issue.errors||[]),{date:todayStr(),reason}]};
    setIssues(arr=>arr.map(i=>i.id===issue.id?next:i));
    await saveIssue(next);
    const rel=getRelated(issue,issues||[]);
    setModal(rel.length?{type:"related_remind",related:rel}:null);
  }

  async function addIssue(issue){const n={...issue,id:uid(),created:todayStr(),stage:0,nextDate:calcNextDate(todayStr(),0,issue.difficulty),lastReviewed:null,mastered:false,errors:[],related:issue.related||[]};setIssues(arr=>[...arr,n]);await saveIssue(n);}
  async function editIssue(id,changes){const u=issues.find(i=>i.id===id);if(!u)return;const next={...u,...changes};setIssues(arr=>arr.map(i=>i.id===id?next:i));await saveIssue(next);}
  async function deleteIssues(ids){setIssues(arr=>arr.filter(i=>!ids.includes(i.id)));setSyncStatus("saving");const{error}=await supabase.from("issues").delete().in("id",ids);setSyncStatus(error?"error":"synced");}
  async function deleteOneIssue(id){setIssues(arr=>arr.filter(i=>i.id!==id));if(viewIssueId===id)setViewIssueId(null);setSyncStatus("saving");const{error}=await supabase.from("issues").delete().eq("id",id);setSyncStatus(error?"error":"synced");}
  async function toggleSprint(){const next=!sprintMode;setSprintMode(next);setSyncStatus("saving");const{error}=await supabase.from("settings").upsert({key:"sprint_mode",value:next});setSyncStatus(error?"error":"synced");}
  async function updateDailyLimit(val){const v=Math.max(1,Math.min(200,val));setDailyLimit(v);setSyncStatus("saving");const{error}=await supabase.from("settings").upsert({key:"daily_limit",value:v});setSyncStatus(error?"error":"synced");}

  function jumpToIssue(name){setJumpSearch(name);setTab("overview");setViewIssueId(null);}
  function openIssueDetail(id){setViewIssueId(id);}

  const allTags=[...new Set((issues||[]).flatMap(i=>i.tags||[]))].sort();
  const viewIssue=viewIssueId?(issues||[]).find(i=>i.id===viewIssueId):null;

  if(issues===null)return(
    <><style>{css}</style><div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,color:s.muted,fontSize:14,padding:20}}><div style={{fontSize:32}}>⚖️</div><div style={{color:s.text,fontWeight:600,fontSize:16}}>司法考試複習追蹤器</div><div className="spinner"/><div style={{fontSize:12}}>{syncStatus==="error"?"連線失敗，請檢查網路":"連接中…"}</div>{syncStatus==="error"&&<button onClick={load} style={{background:s.accent,color:"#fff",padding:"8px 20px",marginTop:6}}>重試</button>}</div></>
  );

  const syncColor=syncStatus==="synced"?s.success:syncStatus==="saving"||syncStatus==="loading"?"#f0a840":s.danger;
  const syncLabel=syncStatus==="synced"?"● 已同步":syncStatus==="saving"?"● 儲存中":syncStatus==="loading"?"● 讀取中":"● 失敗";
  const allDue=prioritySort(issues.filter(isDueToday));
  const todayDue=allDue.slice(0,dailyLimit);
  const overflowCount=Math.max(0,allDue.length-dailyLimit);
  const todayMinutes=studyLog[todayStr()]||0;
  const tabList=[{id:"dashboard",label:"首頁"},{id:"add",label:"新增"},{id:"overview",label:"總覽"},{id:"stats",label:"統計"}];

  return(
    <><style>{css}</style>
    <div style={{minHeight:"100vh",background:s.bg}}>
      {sprintMode&&<div style={{background:s.danger,color:"#fff",textAlign:"center",padding:"8px",fontWeight:600,fontSize:12}}>⚠ 考前衝刺模式已開啟｜所有未掌握爭點改為每 2 天複習一次</div>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:s.surface,borderBottom:`1px solid ${s.border}`,position:"sticky",top:0,zIndex:100,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontWeight:700,fontSize:14,color:s.text}}>⚖️ 司法考試複習</span><span style={{fontSize:10,color:syncColor}}>{syncLabel}</span></div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {tabList.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?s.accent:"transparent",color:tab===t.id?"#fff":s.muted,border:`1px solid ${tab===t.id?s.accent:s.border}`,padding:"6px 12px",borderRadius:6,fontSize:13}}>{t.label}</button>)}
          <button onClick={toggleSprint} style={{background:sprintMode?s.danger:"transparent",color:sprintMode?"#fff":s.muted,border:`1px solid ${sprintMode?s.danger:s.border}`,padding:"6px 12px",borderRadius:6,fontSize:13}}>{sprintMode?"衝刺中":"衝刺"}</button>
        </div>
      </div>
      <div style={{padding:"16px",maxWidth:900,margin:"0 auto"}}>
        {tab==="dashboard"&&<Dashboard issues={issues} todayDue={todayDue} allDueCount={allDue.length} overflowCount={overflowCount} dailyLimit={dailyLimit} updateDailyLimit={updateDailyLimit} studyLog={studyLog} todayMinutes={todayMinutes} markRemember={markRemember} markForgot={markForgot} getDueDate={getDueDate} jumpToIssue={jumpToIssue} openIssueDetail={openIssueDetail}/>}
        {tab==="add"&&<AddIssue issues={issues} onAdd={addIssue} setTab={setTab} allTags={allTags}/>}
        {tab==="overview"&&<Overview issues={issues} markRemember={markRemember} markForgot={markForgot} isDueToday={isDueToday} editIssue={editIssue} deleteIssues={deleteIssues} deleteOneIssue={deleteOneIssue} allTags={allTags} jumpSearch={jumpSearch} setJumpSearch={setJumpSearch} jumpToIssue={jumpToIssue}/>}
        {tab==="stats"&&<Stats issues={issues} studyLog={studyLog}/>}
      </div>
      {modal?.type==="forgot"&&(
        <Overlay onClose={()=>setModal(null)}>
          <div style={{padding:20}}>
            <div style={{fontWeight:600,marginBottom:12,fontSize:15}}>標記失敗原因</div>
            <div style={{color:s.muted,marginBottom:6,fontSize:13}}>「{modal.issue.name}」</div>
            <div style={{color:s.muted,marginBottom:14,fontSize:11}}>將從階段 {modal.issue.stage} 退回階段 {Math.max(0,modal.issue.stage-1)}</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {FAIL_REASONS.map(r=><button key={r} onClick={()=>confirmForgot(modal.issue,r)} style={{background:s.surface,color:s.text,border:`1px solid ${s.border}`,textAlign:"left",padding:"11px 14px",fontSize:14}}>{r}</button>)}
            </div>
            <button onClick={()=>setModal(null)} style={{marginTop:14,background:"transparent",color:s.muted,width:"100%",border:"none",padding:"8px"}}>取消</button>
          </div>
        </Overlay>
      )}
      {modal?.type==="related_remind"&&(
        <Overlay onClose={()=>setModal(null)}>
          <div style={{padding:20}}>
            <div style={{fontWeight:600,marginBottom:10,fontSize:15}}>相關爭點提醒</div>
            <div style={{color:s.muted,marginBottom:12,fontSize:13}}>你也記得以下關聯爭點嗎？</div>
            {modal.related.map(r=><div key={r.id} onClick={()=>{setModal(null);openIssueDetail(r.id);}} style={{background:s.surface,border:`1px solid ${s.border}`,borderRadius:6,padding:"9px 12px",marginBottom:8,fontSize:13,cursor:"pointer"}}><SubjectTag subject={r.subject}/> <span style={{marginLeft:4}}>{r.name}</span></div>)}
            <button onClick={()=>setModal(null)} style={{marginTop:12,background:s.accent,color:"#fff",width:"100%",padding:"10px"}}>了解</button>
          </div>
        </Overlay>
      )}
      {viewIssue&&!modal&&(
        <Overlay onClose={()=>setViewIssueId(null)}>
          <IssueDetailModal issue={viewIssue} issues={issues} allTags={allTags} editIssue={editIssue} deleteOneIssue={deleteOneIssue} markRemember={markRemember} markForgot={markForgot} isDueToday={isDueToday} openIssueDetail={openIssueDetail} onClose={()=>setViewIssueId(null)}/>
        </Overlay>
      )}
    </div></>
  );
}

function Overlay({children,onClose}){return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}><div style={{background:s.card,border:`1px solid ${s.border}`,borderRadius:12,minWidth:280,maxWidth:540,width:"100%",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>{children}</div></div>;}

function IssueDetailModal({issue,issues,allTags,editIssue,deleteOneIssue,markRemember,markForgot,isDueToday,openIssueDetail,onClose}){
  const[editing,setEditing]=useState(false);
  const[editSubject,setEditSubject]=useState(issue.subject);
  const[editDiff,setEditDiff]=useState(issue.difficulty);
  const[editNotes,setEditNotes]=useState(issue.notes||"");
  const[editTags,setEditTags]=useState(issue.tags||[]);
  const[editRelSearch,setEditRelSearch]=useState("");
  const[editRel,setEditRel]=useState(issue.related||[]);
  const[confirmDel,setConfirmDel]=useState(false);
  const intervals=getIntervals(issue.difficulty);
  const related=getRelated(issue,issues);
  const isDue=isDueToday(issue);
  const relSearch=editRelSearch.length>=1?issues.filter(i=>(i.name.includes(editRelSearch)||i.subject.includes(editRelSearch))&&i.id!==issue.id&&!editRel.includes(i.id)):[];

  function startEdit(){setEditSubject(issue.subject);setEditDiff(issue.difficulty);setEditNotes(issue.notes||"");setEditTags(issue.tags||[]);setEditRel(issue.related||[]);setEditing(true);}
  function saveEdit(){editIssue(issue.id,{subject:editSubject,difficulty:editDiff,related:editRel,notes:editNotes,tags:editTags});setEditing(false);}

  return(
    <div style={{padding:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div>
          <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>{issue.name}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            <SubjectTag subject={issue.subject}/>
            <span className="tag" style={{background:"transparent",color:DIFFICULTY_COLORS[issue.difficulty],border:`1px solid ${DIFFICULTY_COLORS[issue.difficulty]}`}}>{issue.difficulty}</span>
            {issue.mastered&&<span className="tag" style={{background:s.successMuted,color:s.success}}>已掌握</span>}
            {isDue&&!issue.mastered&&<span className="tag" style={{background:s.dangerMuted,color:s.danger}}>今日到期</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:4}}>
          {!editing&&<button onClick={startEdit} style={{background:s.accentMuted,color:s.accent,fontSize:12,padding:"4px 10px"}}>編輯</button>}
          <button onClick={onClose} style={{background:"transparent",color:s.muted,fontSize:18,padding:"2px 6px",border:"none"}}>✕</button>
        </div>
      </div>

      {!editing?(
        <>
          {(issue.tags||[]).length>0&&<div style={{marginBottom:12,display:"flex",flexWrap:"wrap",gap:4}}>{issue.tags.map(t=><span key={t} className="tag" style={{background:s.tagBg,color:s.tagColor}}>{t}</span>)}</div>}
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",gap:3,marginBottom:4}}>{intervals.map((_,idx)=><div key={idx} style={{flex:1,height:6,borderRadius:3,background:idx<issue.stage?s.accent:s.border}}/>)}</div>
            <div style={{fontSize:12,color:s.muted}}>階段 {Math.min(issue.stage,6)}/6{!issue.mastered&&issue.nextDate&&` · 下次：${issue.nextDate}（${dayDiff(issue.nextDate)===0?"今天":dayDiff(issue.nextDate)>0?`${dayDiff(issue.nextDate)}天後`:`逾期${-dayDiff(issue.nextDate)}天`}）`}</div>
          </div>
          {(issue.notes||"").trim()&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:s.muted,marginBottom:4,fontWeight:600}}>筆記</div>
              <div style={{background:s.surface,borderRadius:6,padding:"10px 12px",fontSize:13,color:s.text,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{issue.notes}</div>
            </div>
          )}
          {related.length>0&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:s.muted,marginBottom:4,fontWeight:600}}>關聯爭點（點擊查看）</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {related.map(r=>(
                  <div key={r.id} onClick={()=>openIssueDetail(r.id)} style={{background:s.surface,border:`1px solid ${s.border}`,borderRadius:6,padding:"9px 12px",cursor:"pointer",fontSize:13}}>
                    <SubjectTag subject={r.subject}/> <span style={{marginLeft:4,fontWeight:500}}>{r.name}</span>
                    {(r.notes||"").trim()&&<div style={{marginTop:4,fontSize:11,color:s.muted,lineHeight:1.5,whiteSpace:"pre-wrap",maxHeight:40,overflow:"hidden"}}>{r.notes.slice(0,80)}{r.notes.length>80?"…":""}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(issue.errors||[]).length>0&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:s.muted,marginBottom:4,fontWeight:600}}>錯誤紀錄</div>
              <div style={{background:s.surface,borderRadius:6,padding:"8px 10px"}}>{issue.errors.map((e,idx)=><div key={idx} style={{fontSize:12,color:s.danger,marginBottom:2}}>{e.date} · {e.reason}</div>)}</div>
            </div>
          )}
          {isDue&&!issue.mastered&&(
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <button onClick={()=>{onClose();setTimeout(()=>markRemember(issue),100);}} style={{flex:1,background:s.successMuted,color:s.success,padding:"10px",fontSize:14}}>✓ 記住了</button>
              <button onClick={()=>markForgot(issue)} style={{flex:1,background:s.dangerMuted,color:s.danger,padding:"10px",fontSize:14}}>✗ 還沒熟</button>
            </div>
          )}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:11,color:s.muted}}>建立日期：{issue.created}</div>
            {!confirmDel?<button onClick={()=>setConfirmDel(true)} style={{background:"transparent",color:s.danger,border:`1px solid ${s.danger}`,fontSize:11,padding:"4px 10px"}}>刪除爭點</button>
            :<div style={{display:"flex",gap:4}}><button onClick={()=>{deleteOneIssue(issue.id);onClose();}} style={{background:s.danger,color:"#fff",fontSize:11,padding:"4px 10px"}}>確認刪除</button><button onClick={()=>setConfirmDel(false)} style={{background:"transparent",color:s.muted,border:`1px solid ${s.border}`,fontSize:11,padding:"4px 10px"}}>取消</button></div>}
          </div>
        </>
      ):(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            <div><Lbl>科目</Lbl><select value={editSubject} onChange={e=>setEditSubject(e.target.value)} style={{width:"auto"}}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></div>
            <div><Lbl>難度</Lbl><select value={editDiff} onChange={e=>setEditDiff(e.target.value)} style={{width:"auto"}}>{["高","中","低"].map(d=><option key={d}>{d}</option>)}</select></div>
          </div>
          <div style={{marginBottom:10}}><Lbl>筆記</Lbl><textarea className="notes-lg" value={editNotes} onChange={e=>setEditNotes(e.target.value)}/></div>
          <div style={{marginBottom:10}}><Lbl>標籤</Lbl><TagInput tags={editTags} setTags={setEditTags} allTags={allTags}/></div>
          <Lbl>關聯爭點</Lbl>
          <SearchInput value={editRelSearch} onChange={setEditRelSearch} placeholder="搜尋爭點…"/>
          {relSearch.length>0&&<div style={{background:s.surface,border:`1px solid ${s.border}`,borderRadius:5,marginTop:4,marginBottom:6,maxHeight:120,overflowY:"auto"}}>{relSearch.slice(0,5).map(i=><div key={i.id} onClick={()=>{setEditRel(r=>[...r,i.id]);setEditRelSearch("");}} style={{padding:"7px 10px",cursor:"pointer",fontSize:12}}>{i.subject} · {i.name}</div>)}</div>}
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6,marginBottom:10}}>{editRel.map(id=>{const i=issues.find(x=>x.id===id);if(!i)return null;return<span key={id} className="tag" style={{background:s.accentMuted,color:s.accent,fontSize:11}}>{i.name}<span onClick={()=>setEditRel(r=>r.filter(x=>x!==id))} style={{marginLeft:3,cursor:"pointer",opacity:.7}}>✕</span></span>;})}</div>
          <div style={{display:"flex",gap:8}}><button onClick={saveEdit} style={{background:s.accent,color:"#fff",fontSize:13,padding:"9px 20px"}}>儲存變更</button><button onClick={()=>setEditing(false)} style={{background:"transparent",color:s.muted,border:`1px solid ${s.border}`,fontSize:13,padding:"9px 16px"}}>取消</button></div>
        </div>
      )}
    </div>
  );
}

function SearchInput({value,onChange,placeholder}){return<div className="search-wrap"><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||"🔍 搜尋…"}/>{value&&<button className="search-clear" onClick={()=>onChange("")}>✕</button>}</div>;}

function TagInput({tags,setTags,allTags}){
  const[input,setInput]=useState("");
  const suggestions=input.length>=1?allTags.filter(t=>t.includes(input)&&!tags.includes(t)):[];
  function addTag(t){const tr=t.trim();if(tr&&!tags.includes(tr))setTags([...tags,tr]);setInput("");}
  return(
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>{tags.map(t=><span key={t} className="tag" style={{background:s.tagBg,color:s.tagColor,padding:"3px 8px"}}>{t}<span onClick={()=>setTags(tags.filter(x=>x!==t))} style={{marginLeft:4,cursor:"pointer",opacity:.7}}>✕</span></span>)}</div>
      <div style={{display:"flex",gap:6}}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="輸入標籤（例：實務見解）" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addTag(input);}}} style={{flex:1}}/><button onClick={()=>addTag(input)} disabled={!input.trim()} style={{background:s.accent,color:"#fff",padding:"6px 12px",flexShrink:0,fontSize:12}}>加入</button></div>
      {suggestions.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>{suggestions.slice(0,8).map(t=><span key={t} onClick={()=>addTag(t)} className="tag" style={{background:s.surface,color:s.muted,cursor:"pointer",padding:"3px 8px",border:`1px solid ${s.border}`}}>+ {t}</span>)}</div>}
    </div>
  );
}

function RelatedTags({related,openIssueDetail}){
  if(!related.length)return null;
  return<div><span style={{fontSize:11,color:s.muted}}>關聯：</span>{related.map(r=><span key={r.id} onClick={()=>openIssueDetail&&openIssueDetail(r.id)} className="tag" style={{marginLeft:4,background:s.accentMuted,color:s.accent,fontSize:11,cursor:"pointer"}}>{r.name}</span>)}</div>;
}

function Dashboard({issues,todayDue,allDueCount,overflowCount,dailyLimit,updateDailyLimit,studyLog,todayMinutes,markRemember,markForgot,getDueDate,jumpToIssue,openIssueDetail}){
  const[showLimitEdit,setShowLimitEdit]=useState(false);
  const[tempLimit,setTempLimit]=useState(dailyLimit);
  const grouped=SUBJECTS.reduce((acc,sub)=>{const due=todayDue.filter(i=>i.subject===sub);if(due.length)acc[sub]=due;return acc;},{});
  const upcoming=issues.filter(i=>!i.mastered&&dayDiff(getDueDate(i))>0&&dayDiff(getDueDate(i))<=7).sort((a,b)=>getDueDate(a).localeCompare(getDueDate(b)));
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:12}}>
        <StatBox label="今日到期" value={`${todayDue.length}/${allDueCount}`} color={s.danger}/>
        <StatBox label="今日複習時間" value={`${todayMinutes} 分`} color={s.accent}/>
        <StatBox label="總爭點數" value={issues.length}/>
        <StatBox label="已掌握" value={issues.filter(i=>i.mastered).length} color={s.success}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,padding:"8px 12px",background:s.surface,borderRadius:6,border:`1px solid ${s.border}`,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:s.muted}}>每日複習上限：</span>
        {!showLimitEdit?(<><span style={{fontSize:14,fontWeight:600,color:s.text}}>{dailyLimit} 題</span>{overflowCount>0&&<span style={{fontSize:11,color:s.danger}}>（{overflowCount} 題延至明天）</span>}<button onClick={()=>{setTempLimit(dailyLimit);setShowLimitEdit(true);}} style={{background:"transparent",color:s.accent,border:`1px solid ${s.accent}`,fontSize:11,padding:"3px 10px",marginLeft:"auto"}}>調整</button></>)
        :(<><input type="number" value={tempLimit} onChange={e=>setTempLimit(Number(e.target.value))} min={1} max={200} style={{width:60,textAlign:"center",padding:"4px 6px",fontSize:14}}/><span style={{fontSize:12,color:s.muted}}>題</span><button onClick={()=>{updateDailyLimit(tempLimit);setShowLimitEdit(false);}} style={{background:s.accent,color:"#fff",fontSize:11,padding:"4px 10px"}}>確認</button><button onClick={()=>setShowLimitEdit(false)} style={{background:"transparent",color:s.muted,border:`1px solid ${s.border}`,fontSize:11,padding:"4px 10px"}}>取消</button></>)}
      </div>
      <Sec title="各科掌握率">
        {SUBJECTS.map(sub=>{const total=issues.filter(i=>i.subject===sub).length;const done=issues.filter(i=>i.subject===sub&&i.mastered).length;const pct=total?Math.round(done/total*100):0;const color=SUBJECT_COLORS[sub]||s.accent;return<div key={sub} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{width:50,fontSize:12,color:color,fontWeight:600,flexShrink:0}}>{sub}</span><div className="prog" style={{flex:1}}><div className="progf" style={{width:`${pct}%`,background:color}}/></div><span style={{fontSize:11,color:s.muted,width:72,textAlign:"right"}}>{done}/{total} ({pct}%)</span></div>;})}
      </Sec>
      {Object.keys(grouped).length>0&&(
        <Sec title={`今日複習（${todayDue.length}）`}>
          {Object.entries(grouped).map(([sub,list])=>(
            <div key={sub} style={{marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:600,color:SUBJECT_COLORS[sub]||s.accent,marginBottom:6}}>{sub}</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>{list.map(i=><IssueRow key={i.id} issue={i} onRemember={markRemember} onForgot={markForgot} openDetail={openIssueDetail}/>)}</div>
            </div>
          ))}
        </Sec>
      )}
      {upcoming.length>0&&(
        <Sec title="未來 7 天即將到期">
          <div style={{display:"flex",flexDirection:"column",gap:6}}>{upcoming.map(i=>{const d=dayDiff(getDueDate(i));return<div key={i.id} onClick={()=>openIssueDetail(i.id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:s.surface,border:`1px solid ${s.border}`,borderRadius:6,cursor:"pointer"}}><span style={{fontSize:13}}>{i.name}</span><div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}><SubjectTag subject={i.subject}/><span style={{fontSize:11,color:s.muted}}>{d}天後</span></div></div>;})}</div>
        </Sec>
      )}
    </div>
  );
}

function IssueRow({issue,onRemember,onForgot,openDetail}){
  return(
    <div style={{background:s.surface,border:`1px solid ${s.border}`,borderRadius:6}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",gap:8,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>openDetail(issue.id)}>
          <span style={{fontSize:13,fontWeight:500}}>{issue.name}</span>
          <span style={{marginLeft:6}}><SubjectTag subject={issue.subject}/></span>
          <span className="tag" style={{marginLeft:3,background:"transparent",color:DIFFICULTY_COLORS[issue.difficulty],border:`1px solid ${DIFFICULTY_COLORS[issue.difficulty]}`,fontSize:10}}>{issue.difficulty}</span>
          {(issue.tags||[]).length>0&&<span style={{marginLeft:4,fontSize:10,color:s.tagColor}}>🏷{issue.tags.length}</span>}
          {(issue.notes||"").trim()&&<span style={{marginLeft:4,fontSize:10,color:s.muted}}>📝</span>}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button onClick={e=>{e.stopPropagation();onRemember(issue);}} style={{background:s.successMuted,color:s.success,fontSize:12,padding:"6px 10px"}}>記住了</button>
          <button onClick={e=>{e.stopPropagation();onForgot(issue);}} style={{background:s.dangerMuted,color:s.danger,fontSize:12,padding:"6px 10px"}}>還沒熟</button>
        </div>
      </div>
    </div>
  );
}

function AddIssue({issues,onAdd,setTab,allTags}){
  const[name,setName]=useState("");
  const[subject,setSubject]=useState(SUBJECTS[0]);
  const[difficulty,setDifficulty]=useState("中");
  const[notes,setNotes]=useState("");
  const[tags,setTags]=useState([]);
  const[search,setSearch]=useState("");
  const[related,setRelated]=useState([]);
  const results=search.length>=1?issues.filter(i=>(i.name.includes(search)||i.subject.includes(search))&&!related.includes(i.id)):[];
  function submit(){if(!name.trim())return;onAdd({name:name.trim(),subject,difficulty,related,notes,tags});setName("");setRelated([]);setSearch("");setNotes("");setTags([]);setTab("overview");}
  return(
    <div style={{maxWidth:600}}>
      <Sec title="新增爭點">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div><Lbl>爭點名稱</Lbl><input value={name} onChange={e=>setName(e.target.value)} placeholder="例：法人格否認理論的要件" onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><Lbl>科目</Lbl><select value={subject} onChange={e=>setSubject(e.target.value)}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></div>
            <div><Lbl>難度</Lbl><select value={difficulty} onChange={e=>setDifficulty(e.target.value)}>{["高","中","低"].map(d=><option key={d}>{d}</option>)}</select></div>
          </div>
          <div><Lbl>筆記（要件、口訣、重點）</Lbl><textarea className="notes-lg" value={notes} onChange={e=>setNotes(e.target.value)} placeholder={"記下關鍵要件或容易忘的點…\n\n例：\n1. 第一要件：…\n2. 第二要件：…\n3. 實務見解：…"}/></div>
          <div><Lbl>標籤</Lbl><TagInput tags={tags} setTags={setTags} allTags={allTags}/></div>
          <div>
            <Lbl>關聯爭點</Lbl>
            <SearchInput value={search} onChange={setSearch} placeholder="搜尋現有爭點…"/>
            {results.length>0&&<div style={{background:s.surface,border:`1px solid ${s.border}`,borderRadius:6,marginTop:4,maxHeight:160,overflowY:"auto"}}>{results.slice(0,8).map(i=><div key={i.id} onClick={()=>{setRelated(r=>[...r,i.id]);setSearch("");}} style={{padding:"8px 12px",cursor:"pointer",borderBottom:`1px solid ${s.border}`,fontSize:13}}><SubjectTag subject={i.subject}/> <span style={{marginLeft:4}}>{i.name}</span></div>)}</div>}
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:6}}>{related.map(id=>{const i=issues.find(x=>x.id===id);if(!i)return null;return<span key={id} className="tag" style={{background:s.accentMuted,color:s.accent,padding:"3px 8px"}}>{i.name}<span onClick={()=>setRelated(r=>r.filter(x=>x!==id))} style={{marginLeft:4,cursor:"pointer",opacity:.7}}>✕</span></span>;})}</div>
          </div>
          <div style={{background:s.surface,border:`1px solid ${s.border}`,borderRadius:6,padding:"10px 12px",fontSize:12,color:s.muted}}>第一次複習日：<strong style={{color:s.text}}>{calcNextDate(todayStr(),0,difficulty)}（{difficulty==="高"?"1":"3"} 天後）</strong><br/>間隔：{(difficulty==="高"?HARD_INTERVALS:INTERVALS).join(" → ")} 天</div>
          <button onClick={submit} disabled={!name.trim()} style={{background:s.accent,color:"#fff",padding:"11px",fontWeight:600,fontSize:14}}>新增爭點</button>
        </div>
      </Sec>
    </div>
  );
}

function Overview({issues,markRemember,markForgot,isDueToday,editIssue,deleteIssues,deleteOneIssue,allTags,jumpSearch,setJumpSearch,jumpToIssue}){
  const[subFilter,setSubFilter]=useState("全部");
  const[statusFilter,setStatusFilter]=useState("全部");
  const[tagFilter,setTagFilter]=useState("全部");
  const[searchQuery,setSearchQuery]=useState(jumpSearch||"");
  const[sortBy,setSortBy]=useState("created_desc");
  const[editingId,setEditingId]=useState(null);
  const[selected,setSelected]=useState(new Set());
  const[deleteMode,setDeleteMode]=useState(false);

  useEffect(()=>{if(jumpSearch){setSearchQuery(jumpSearch);setJumpSearch("");}},[jumpSearch]);

  let filtered=issues;
  if(subFilter!=="全部")filtered=filtered.filter(i=>i.subject===subFilter);
  if(statusFilter==="今日待複習")filtered=filtered.filter(isDueToday);
  else if(statusFilter==="進行中")filtered=filtered.filter(i=>!i.mastered&&!isDueToday(i));
  else if(statusFilter==="已掌握")filtered=filtered.filter(i=>i.mastered);
  if(tagFilter!=="全部")filtered=filtered.filter(i=>(i.tags||[]).includes(tagFilter));
  if(searchQuery.trim()){const q=searchQuery.trim().toLowerCase();filtered=filtered.filter(i=>i.name.toLowerCase().includes(q)||i.subject.includes(q)||(i.notes||"").toLowerCase().includes(q)||(i.tags||[]).some(t=>t.includes(q)));}
  filtered=sortIssues(filtered,sortBy);

  function toggleSelect(id){setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});}
  function selectAll(){if(selected.size===filtered.length)setSelected(new Set());else setSelected(new Set(filtered.map(i=>i.id)));}
  function confirmDelete(){deleteIssues([...selected]);setSelected(new Set());setDeleteMode(false);}

  return(
    <div>
      <div style={{marginBottom:12}}>
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="🔍 搜尋爭點名稱、筆記、標籤…"/>
        <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center",marginTop:10}}>
          <select value={subFilter} onChange={e=>setSubFilter(e.target.value)} style={{width:"auto"}}><option>全部</option>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{width:"auto"}}>{["全部","今日待複習","進行中","已掌握"].map(x=><option key={x}>{x}</option>)}</select>
          {allTags.length>0&&<select value={tagFilter} onChange={e=>setTagFilter(e.target.value)} style={{width:"auto"}}><option>全部</option>{allTags.map(t=><option key={t}>{t}</option>)}</select>}
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{width:"auto"}}>{SORT_OPTIONS.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select>
          <span style={{fontSize:12,color:s.muted}}>共 {filtered.length} 筆</span>
          <div style={{marginLeft:"auto"}}>
            {!deleteMode?<button onClick={()=>setDeleteMode(true)} style={{background:"transparent",color:s.danger,border:`1px solid ${s.danger}`,fontSize:12,padding:"6px 10px"}}>批量刪除</button>
            :<div style={{display:"flex",gap:6,alignItems:"center"}}><button onClick={selectAll} style={{background:"transparent",color:s.muted,border:`1px solid ${s.border}`,fontSize:12,padding:"6px 9px"}}>{selected.size===filtered.length?"取消全選":"全選"}</button><button onClick={confirmDelete} disabled={selected.size===0} style={{background:s.danger,color:"#fff",fontSize:12,padding:"6px 10px"}}>刪除{selected.size>0?` (${selected.size})`:""}</button><button onClick={()=>{setSelected(new Set());setDeleteMode(false);}} style={{background:"transparent",color:s.muted,border:`1px solid ${s.border}`,fontSize:12,padding:"6px 9px"}}>取消</button></div>}
          </div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(issue=>(
          <IssueCard key={issue.id} issue={issue} issues={issues} isDue={isDueToday(issue)} onRemember={markRemember} onForgot={markForgot} editing={editingId===issue.id} setEditing={setEditingId} editIssue={editIssue} deleteMode={deleteMode} selected={selected.has(issue.id)} onToggleSelect={()=>toggleSelect(issue.id)} onDelete={deleteOneIssue} allTags={allTags} jumpToIssue={jumpToIssue}/>
        ))}
        {filtered.length===0&&<div style={{color:s.muted,textAlign:"center",padding:40}}>沒有符合條件的爭點</div>}
      </div>
    </div>
  );
}

function IssueCard({issue,issues,isDue,onRemember,onForgot,editing,setEditing,editIssue,deleteMode,selected,onToggleSelect,onDelete,allTags,jumpToIssue}){
  const[editSubject,setEditSubject]=useState(issue.subject);
  const[editDiff,setEditDiff]=useState(issue.difficulty);
  const[editNotes,setEditNotes]=useState(issue.notes||"");
  const[editTags,setEditTags]=useState(issue.tags||[]);
  const[editRelSearch,setEditRelSearch]=useState("");
  const[editRel,setEditRel]=useState(issue.related||[]);
  const[showNotes,setShowNotes]=useState(false);
  const[confirmDel,setConfirmDel]=useState(false);
  const intervals=getIntervals(issue.difficulty);
  const related=getRelated(issue,issues);
  const relSearch=editRelSearch.length>=1?issues.filter(i=>(i.name.includes(editRelSearch)||i.subject.includes(editRelSearch))&&i.id!==issue.id&&!editRel.includes(i.id)):[];

  function saveEdit(){editIssue(issue.id,{subject:editSubject,difficulty:editDiff,related:editRel,notes:editNotes,tags:editTags});setEditing(null);}
  function startEdit(){setEditSubject(issue.subject);setEditDiff(issue.difficulty);setEditNotes(issue.notes||"");setEditTags(issue.tags||[]);setEditRel(issue.related||[]);setEditing(issue.id);}

  return(
    <div style={{background:selected?s.dangerMuted:s.card,border:`1px solid ${selected?s.danger:isDue?s.danger:s.border}`,borderRadius:8,padding:"13px 15px",transition:"background .15s"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        {deleteMode&&<div onClick={onToggleSelect} className={`cb${selected?" checked":""}`} style={{marginTop:2}}>{selected&&<span style={{color:"#fff",fontSize:11,fontWeight:700}}>✓</span>}</div>}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6,marginBottom:9}}>
            <div>
              <span style={{fontWeight:600,fontSize:14}}>{issue.name}</span>
              <span style={{marginLeft:6}}><SubjectTag subject={issue.subject}/></span>
              <span className="tag" style={{marginLeft:3,background:"transparent",color:DIFFICULTY_COLORS[issue.difficulty],border:`1px solid ${DIFFICULTY_COLORS[issue.difficulty]}`,fontSize:10}}>{issue.difficulty}</span>
              {issue.mastered&&<span className="tag" style={{marginLeft:3,background:s.successMuted,color:s.success}}>已掌握</span>}
              {isDue&&!issue.mastered&&<span className="tag" style={{marginLeft:3,background:s.dangerMuted,color:s.danger}}>今日到期</span>}
            </div>
            {!deleteMode&&(<div style={{display:"flex",gap:4}}><button onClick={()=>editing?setEditing(null):startEdit()} style={{background:"transparent",color:s.muted,border:`1px solid ${s.border}`,fontSize:11,padding:"3px 8px",flexShrink:0}}>編輯</button><button onClick={()=>setConfirmDel(true)} style={{background:"transparent",color:s.danger,border:`1px solid ${s.danger}`,fontSize:11,padding:"3px 8px",flexShrink:0}}>刪除</button></div>)}
          </div>
          {(issue.tags||[]).length>0&&<div style={{marginBottom:7,display:"flex",flexWrap:"wrap",gap:4}}>{issue.tags.map(t=><span key={t} className="tag" style={{background:s.tagBg,color:s.tagColor}}>{t}</span>)}</div>}
          <div style={{marginBottom:9}}>
            <div style={{display:"flex",gap:3,marginBottom:4}}>{intervals.map((_,idx)=><div key={idx} style={{flex:1,height:5,borderRadius:3,background:idx<issue.stage?s.accent:s.border}}/>)}</div>
            <div style={{fontSize:11,color:s.muted}}>階段 {Math.min(issue.stage,6)}/6{!issue.mastered&&issue.nextDate&&` · 下次：${issue.nextDate}（${dayDiff(issue.nextDate)===0?"今天":dayDiff(issue.nextDate)>0?`${dayDiff(issue.nextDate)}天後`:`逾期${-dayDiff(issue.nextDate)}天`}）`}</div>
          </div>
          {(issue.notes||"").trim()&&(<div style={{marginBottom:8}}><span onClick={()=>setShowNotes(!showNotes)} style={{fontSize:11,color:s.accent,cursor:"pointer"}}>{showNotes?"▼ 收起筆記":"▶ 查看筆記"}</span>{showNotes&&<div style={{marginTop:4,background:s.surface,borderRadius:5,padding:"8px 10px",fontSize:12,color:s.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{issue.notes}</div>}</div>)}
          {related.length>0&&<div style={{marginBottom:7}}><RelatedTags related={related} openIssueDetail={null}/></div>}
          {(issue.errors||[]).length>0&&(<div style={{marginBottom:8,background:s.surface,borderRadius:5,padding:"8px 10px"}}><div style={{fontSize:10,color:s.muted,marginBottom:3}}>錯誤紀錄</div>{issue.errors.map((e,idx)=><div key={idx} style={{fontSize:11,color:s.danger}}>{e.date} · {e.reason}</div>)}</div>)}
          {editing&&(
            <div style={{borderTop:`1px solid ${s.border}`,paddingTop:12,marginBottom:8}}>
              <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}><div><Lbl>科目</Lbl><select value={editSubject} onChange={e=>setEditSubject(e.target.value)} style={{width:"auto"}}>{SUBJECTS.map(x=><option key={x}>{x}</option>)}</select></div><div><Lbl>難度</Lbl><select value={editDiff} onChange={e=>setEditDiff(e.target.value)} style={{width:"auto"}}>{["高","中","低"].map(d=><option key={d}>{d}</option>)}</select></div></div>
              <div style={{marginBottom:10}}><Lbl>筆記</Lbl><textarea className="notes-lg" value={editNotes} onChange={e=>setEditNotes(e.target.value)}/></div>
              <div style={{marginBottom:10}}><Lbl>標籤</Lbl><TagInput tags={editTags} setTags={setEditTags} allTags={allTags}/></div>
              <Lbl>關聯爭點</Lbl>
              <SearchInput value={editRelSearch} onChange={setEditRelSearch} placeholder="搜尋爭點…"/>
              {relSearch.length>0&&<div style={{background:s.surface,border:`1px solid ${s.border}`,borderRadius:5,marginTop:4,marginBottom:6,maxHeight:120,overflowY:"auto"}}>{relSearch.slice(0,5).map(i=><div key={i.id} onClick={()=>{setEditRel(r=>[...r,i.id]);setEditRelSearch("");}} style={{padding:"7px 10px",cursor:"pointer",fontSize:12}}>{i.subject} · {i.name}</div>)}</div>}
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6,marginBottom:8}}>{editRel.map(id=>{const i=issues.find(x=>x.id===id);if(!i)return null;return<span key={id} className="tag" style={{background:s.accentMuted,color:s.accent,fontSize:11}}>{i.name}<span onClick={()=>setEditRel(r=>r.filter(x=>x!==id))} style={{marginLeft:3,cursor:"pointer",opacity:.7}}>✕</span></span>;})}</div>
              <button onClick={saveEdit} style={{background:s.accent,color:"#fff",fontSize:13,padding:"8px 16px"}}>儲存變更</button>
            </div>
          )}
          {isDue&&!issue.mastered&&!deleteMode&&(<div style={{display:"flex",gap:7,marginTop:6}}><button onClick={()=>onRemember(issue)} style={{flex:1,background:s.successMuted,color:s.success,padding:"8px"}}>✓ 記住了</button><button onClick={()=>onForgot(issue)} style={{flex:1,background:s.dangerMuted,color:s.danger,padding:"8px"}}>✗ 還沒熟</button></div>)}
          {confirmDel&&(<div style={{marginTop:8,background:s.dangerMuted,border:`1px solid ${s.danger}`,borderRadius:6,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,color:s.danger}}>確定刪除此爭點？</span><div style={{display:"flex",gap:6}}><button onClick={()=>onDelete(issue.id)} style={{background:s.danger,color:"#fff",fontSize:12,padding:"5px 10px"}}>確認</button><button onClick={()=>setConfirmDel(false)} style={{background:"transparent",color:s.muted,border:`1px solid ${s.border}`,fontSize:12,padding:"5px 10px"}}>取消</button></div></div>)}
        </div>
      </div>
    </div>
  );
}

function Stats({issues,studyLog}){
  const last30=Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-29+i);const key=d.toISOString().split("T")[0];return{date:key,mins:studyLog[key]||0};});
  const maxMins=Math.max(...last30.map(d=>d.mins),1);
  const ec={};FAIL_REASONS.forEach(r=>ec[r]=0);issues.forEach(i=>(i.errors||[]).forEach(e=>{if(ec[e.reason]!==undefined)ec[e.reason]++;}));
  const maxErr=Math.max(...Object.values(ec),1);
  const confused=issues.map(i=>({...i,cc:(i.errors||[]).filter(e=>e.reason==="與其他爭點混淆").length})).filter(i=>i.cc>0).sort((a,b)=>b.cc-a.cc).slice(0,5);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:24}}>
      <Sec title="各科掌握率">{SUBJECTS.map(sub=>{const total=issues.filter(i=>i.subject===sub).length;const done=issues.filter(i=>i.subject===sub&&i.mastered).length;const pct=total?Math.round(done/total*100):0;const color=SUBJECT_COLORS[sub]||s.accent;return<div key={sub} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{width:50,fontSize:12,color:color,fontWeight:600,flexShrink:0}}>{sub}</span><div className="prog" style={{flex:1}}><div className="progf" style={{width:`${pct}%`,background:color}}/></div><span style={{fontSize:11,color:s.muted,width:80,textAlign:"right"}}>{done}/{total}（{pct}%）</span></div>;})}</Sec>
      <Sec title="每日複習時間（近 30 天）"><div style={{display:"flex",alignItems:"flex-end",gap:2,height:80}}>{last30.map((d,idx)=>{const h=Math.round(d.mins/maxMins*74);return<div key={idx} title={`${d.date}: ${d.mins}分`} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"100%"}}><div style={{width:"100%",height:h||2,background:d.date===todayStr()?s.accent:s.accentMuted,borderRadius:2,minHeight:2}}/></div>;})}</div><div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:s.muted,marginTop:4}}><span>30天前</span><span>今天</span></div></Sec>
      <Sec title="失敗原因排行">{Object.entries(ec).sort((a,b)=>b[1]-a[1]).map(([reason,count])=><div key={reason} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{width:110,fontSize:12,color:s.muted,flexShrink:0}}>{reason}</span><div className="prog" style={{flex:1}}><div className="progf" style={{width:`${Math.round(count/maxErr*100)}%`,background:s.danger}}/></div><span style={{fontSize:12,color:s.muted,width:24,textAlign:"right"}}>{count}</span></div>)}</Sec>
      {confused.length>0&&(<Sec title="高頻混淆爭點">{confused.map(i=><div key={i.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${s.border}`,fontSize:13}}><span>{i.name}<span style={{marginLeft:6}}><SubjectTag subject={i.subject}/></span></span><span style={{color:s.danger,fontWeight:600,flexShrink:0}}>{i.cc} 次</span></div>)}</Sec>)}
    </div>
  );
}

function Sec({title,children}){return<div style={{marginBottom:22}}><div style={{fontSize:11,fontWeight:600,color:s.muted,letterSpacing:1,marginBottom:12,textTransform:"uppercase"}}>{title}</div>{children}</div>;}
function StatBox({label,value,color}){return<div style={{background:s.surface,border:`1px solid ${s.border}`,borderRadius:8,padding:"12px 15px"}}><div style={{fontSize:11,color:s.muted,marginBottom:4}}>{label}</div><div style={{fontSize:22,fontWeight:700,color:color||s.text}}>{value}</div></div>;}
function Lbl({children}){return<div style={{fontSize:12,color:s.muted,marginBottom:5,fontWeight:600}}>{children}</div>;}
