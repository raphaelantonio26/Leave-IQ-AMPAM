/* LeaveIQ shared UI kit — design tokens, utilities, and atom components.
   v2.1: AMPAM brand system per the official Brand Guidelines —
   Pantone 301 C navy (#004B87), Pantone Red 032 C (#EF3340), Arial,
   light surfaces, "Building on a Foundation of Trust." */
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  FileText, Check, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft,
  ChevronRight, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";


export const BRAND = { navy:"#004B87", red:"#EF3340", navyDark:"#003a6b", navyLight:"#1467a8", font:"Arial, Helvetica, sans-serif", tagline:"Building on a Foundation of Trust" };
export const S = {
  bg:"#f2f5f9", bgElev:"#e9eef5", card:"#ffffff", card2:"#f7f9fc",
  border:"rgba(0,75,135,.20)", border2:"rgba(0,75,135,.12)",
  text:"#16283c", text2:"#3d5570", text3:"#69819c",
  indigo:"#004B87", indigoL:"#1467a8", indigoD:"#003a6b",
  teal:"#0e7c86", amber:"#b97509", red:"#EF3340",
  green:"#1e7d3f", orange:"#c2590b", purple:"#1565a8",
};
export const ELEV = { sm:"0 1px 2px rgba(13,38,63,.08)", md:"0 4px 16px rgba(13,38,63,.10)", lg:"0 10px 32px rgba(13,38,63,.14)", xl:"0 20px 56px rgba(13,38,63,.18)" };
export const RADIUS = { sm:8, md:12, lg:16, xl:20, pill:999 };
export const PIE_COLORS = ["#004B87","#EF3340","#1467a8","#0e7c86","#b97509","#69819c"];
const ORG = { name:"AMPAM", product:"LeaveIQ", env:"Demo" };

export const NOW = () => new Date();

export function pct(u,t){ return !t||t<=0?0:Math.round(u/t*100); }
export function weeksBetween(a,b){ const x=new Date(a),y=new Date(b); return isNaN(x)||isNaN(y)?0:Math.round(Math.abs(y-x)/(86400000*7)); }
export function daysUntil(d){ const x=new Date(d); return isNaN(x)?0:Math.round((x-NOW())/86400000); }
export function formatDate(d){ const x=new Date(d); return isNaN(x)?"—":x.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}); }
export function relativeTime(d){
  const n=daysUntil(d);
  if(n===0)return"today"; if(n===-1)return"yesterday"; if(n===1)return"tomorrow";
  if(n<0){ const a=-n; return a<7?`${a}d ago`:a<30?`${Math.round(a/7)}w ago`:a<365?`${Math.round(a/30)}mo ago`:`${Math.round(a/365)}y ago`; }
  return n<7?`in ${n}d`:n<30?`in ${Math.round(n/7)}w`:`in ${Math.round(n/30)}mo`;
}
export function initials(n){ if(!n)return"?"; const p=n.trim().split(/\s+/); return((p[0]?.[0]||"")+(p[1]?.[0]||"")).toUpperCase()||"?"; }
export const AV_PAL=[["#004B87","#1467a8"],["#0e7c86","#15a3ae"],["#b97509","#d99423"],["#b3242f","#EF3340"],["#3d5570","#69819c"],["#0a5fa3","#2d83c8"],["#1e7d3f","#2fa65a"],["#8a4a0a","#c2590b"]];
export function avatarColors(seed){ let h=0; const s=String(seed||""); for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0; return AV_PAL[h%AV_PAL.length]; }
export function exportCSV(filename,columns,rows){
  const esc=v=>{const s=v==null?"":String(v); return/[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:`${s}`;};
  const csv=columns.map(c=>esc(c.label)).join(",")+"\n"+rows.map(r=>columns.map(c=>esc(typeof c.value==="function"?c.value(r):r[c.value])).join(",")).join("\n");
  try{ const b=new Blob([csv],{type:"text/csv"}),u=URL.createObjectURL(b),a=document.createElement("a"); a.href=u; a.download=filename; a.click(); URL.revokeObjectURL(u); return true; }catch{ return false; }
}

/* ─────────────────── STORAGE ─────────────────── */
export const SV=4; // bumped for v1.2 schema additions — stale v1 localStorage resets to seed
export function loadState(k,fb){ try{ const r=localStorage.getItem(k); if(!r)return fb; const p=JSON.parse(r); return p?.__v===SV?p.data:fb; }catch{ return fb; } }
export function saveState(k,d){ try{ localStorage.setItem(k,JSON.stringify({__v:SV,data:d})); }catch{} }

/* ─────────────────── ATOM COMPONENTS ─────────────────── */
export function Toast({toast}){
  if(!toast)return null;
  const m={success:{bg:"#eef9f1",bdr:"#1e7d3f",clr:"#1e7d3f",ico:"✓"},error:{bg:"#fdeeef",bdr:"#EF3340",clr:"#c01622",ico:"✗"},info:{bg:"#eef4fa",bdr:"#004B87",clr:"#004B87",ico:"ℹ"}};
  const c=m[toast.type]||m.info;
  return <motion.div initial={{opacity:0,y:50,x:"-50%"}} animate={{opacity:1,y:0,x:"-50%"}} exit={{opacity:0,y:50,x:"-50%"}} style={{position:"fixed",bottom:24,left:"50%",zIndex:9999,background:c.bg,border:`1px solid ${c.bdr}`,borderRadius:12,padding:"12px 24px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 8px 32px rgba(13,38,63,.18)",minWidth:280}}><span style={{color:c.clr,fontWeight:700,fontSize:18}}>{c.ico}</span><span style={{color:c.clr,fontSize:14,fontWeight:500}}>{toast.message}</span></motion.div>;
}
export const BADGE_MAP={Active:{bg:"rgba(0,75,135,.09)",clr:"#004B87",bdr:"rgba(0,75,135,.30)"},Pending:{bg:"rgba(185,117,9,.10)",clr:"#9a6207",bdr:"rgba(185,117,9,.35)"},Closed:{bg:"rgba(105,129,156,.12)",clr:"#5a7390",bdr:"rgba(105,129,156,.35)"},Approved:{bg:"rgba(30,125,63,.10)",clr:"#1e7d3f",bdr:"rgba(30,125,63,.35)"},Denied:{bg:"rgba(239,51,64,.09)",clr:"#c01622",bdr:"rgba(239,51,64,.35)"},High:{bg:"rgba(239,51,64,.09)",clr:"#c01622",bdr:"rgba(239,51,64,.35)"},Moderate:{bg:"rgba(185,117,9,.10)",clr:"#9a6207",bdr:"rgba(185,117,9,.35)"},Low:{bg:"rgba(30,125,63,.10)",clr:"#1e7d3f",bdr:"rgba(30,125,63,.35)"},FMLA:{bg:"rgba(0,75,135,.09)",clr:"#004B87",bdr:"rgba(0,75,135,.30)"},CFRA:{bg:"rgba(14,124,134,.10)",clr:"#0e7c86",bdr:"rgba(14,124,134,.35)"},PFL:{bg:"rgba(185,117,9,.10)",clr:"#9a6207",bdr:"rgba(185,117,9,.35)"}};
export function Badge({label}){const s=BADGE_MAP[label]||BADGE_MAP.Closed; return <span style={{background:s.bg,color:s.clr,border:`1px solid ${s.bdr}`,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{label}</span>;}
export function RiskDot({risk}){const c={High:S.red,Moderate:S.amber,Low:S.green}[risk]||"#94a3b8"; return <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:c,marginRight:6,boxShadow:`0 0 6px ${c}`}}/>;}
export function Card({children,style={}}){return <div style={{background:S.card,border:`1px solid ${S.border2}`,borderRadius:RADIUS.lg,padding:20,boxShadow:ELEV.sm,...style}}>{children}</div>;}
export function Skeleton(){return <div style={{background:S.card,border:`1px solid ${S.border2}`,borderRadius:RADIUS.lg,padding:22}}>{[80,55,35].map((w,i)=><div key={i} style={{background:"rgba(0,75,135,.07)",height:13,borderRadius:7,width:`${w}%`,marginBottom:i<2?14:0,animation:"pulse 1.5s ease-in-out infinite"}}/>)}</div>;}
export function EmptyState({msg,icon:Icon=FileText}){return <div style={{textAlign:"center",padding:"50px 20px",color:S.text3}}><Icon size={36} style={{margin:"0 auto 12px",display:"block",opacity:.3}}/><p style={{fontSize:13,margin:0}}>{msg}</p></div>;}
export function Input({value,onChange,placeholder,style={},...rest}){return <input value={value} onChange={onChange} placeholder={placeholder} style={{background:"#fff",border:`1px solid ${S.border}`,borderRadius:9,padding:"9px 14px",color:S.text,fontSize:13,outline:"none",width:"100%",fontFamily:BRAND.font,...style}} {...rest}/>;}
export function Select({value,onChange,children,style={},...rest}){return <select value={value} onChange={onChange} style={{background:S.card2,border:`1px solid ${S.border}`,borderRadius:9,padding:"9px 14px",color:S.text,fontSize:13,outline:"none",...style}} {...rest}>{children}</select>;}
export function Btn({children,onClick,variant="primary",disabled=false,small=false,style={}}){
  const base={border:"none",borderRadius:9,cursor:disabled?"not-allowed":"pointer",fontWeight:600,transition:"all .15s",display:"inline-flex",alignItems:"center",gap:6,opacity:disabled?.5:1,padding:small?"7px 14px":"10px 18px",fontSize:small?12:13,...style};
  const vs={primary:{background:BRAND.navy,color:"#fff",boxShadow:"0 1px 2px rgba(0,59,107,.3)"},secondary:{background:"#fff",color:S.indigo,border:`1px solid ${S.border}`},danger:{background:"rgba(239,51,64,.08)",color:"#c01622",border:"1px solid rgba(239,51,64,.3)"},success:{background:"rgba(30,125,63,.08)",color:S.green,border:"1px solid rgba(30,125,63,.3)"},teal:{background:S.teal,color:"#fff"}};
  return <motion.button whileHover={{scale:disabled?1:1.02}} whileTap={{scale:disabled?1:.97}} onClick={disabled?undefined:onClick} style={{...base,...vs[variant]}}>{children}</motion.button>;
}
export const TAB_STYLE=active=>({padding:"8px 16px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:active?"1px solid rgba(0,75,135,.30)":"1px solid transparent",background:active?"rgba(0,75,135,.08)":"transparent",color:active?S.indigo:S.text3,transition:"all .15s",fontFamily:BRAND.font});
export function CTooltip({active,payload,label}){
  if(!active||!payload?.length)return null;
  return <div style={{background:S.card2,border:`1px solid ${S.border}`,borderRadius:10,padding:"10px 16px",fontSize:12}}>{label&&<div style={{color:S.text2,marginBottom:4,fontWeight:600}}>{label}</div>}{payload.map((p,i)=><div key={i} style={{color:p.color||S.indigo,fontWeight:600}}>{p.name}: {p.value}</div>)}</div>;
}

/* ─────────────── AVATAR ─────────────── */
export function Avatar({name,size=28,title}){
  const [a,b]=avatarColors(name);
  return <span title={title||name} style={{width:size,height:size,minWidth:size,borderRadius:"50%",background:`linear-gradient(135deg,${a},${b})`,color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:Math.round(size*.4),fontWeight:700,boxShadow:"inset 0 0 0 1px rgba(255,255,255,.35)",flexShrink:0}}>{initials(name)}</span>;
}
export function AvatarLabel({name,sub,size=28}){
  return <span style={{display:"inline-flex",alignItems:"center",gap:9,minWidth:0}}><Avatar name={name} size={size}/><span style={{minWidth:0}}><span style={{display:"block",color:S.text,fontWeight:600,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{name}</span>{sub&&<span style={{display:"block",color:S.text3,fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{sub}</span>}</span></span>;
}

/* ─────────────── PAGE HEADER ─────────────── */
export function PageHeader({title,subtitle,breadcrumb=[],actions}){
  return <div style={{marginBottom:24}}>
    {breadcrumb.length>0&&<div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8,fontSize:12,color:S.text3}}>{breadcrumb.map((b,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:7}}><span style={{color:i===breadcrumb.length-1?S.text2:S.text3,fontWeight:i===breadcrumb.length-1?600:500}}>{b}</span>{i<breadcrumb.length-1&&<span style={{color:S.text3,opacity:.6}}>›</span>}</span>)}</div>}
    <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
      <div><h1 style={{fontSize:25,fontWeight:800,color:S.indigo,margin:0,letterSpacing:"-0.01em",fontFamily:BRAND.font}}>{title}</h1><div style={{width:34,height:3,background:BRAND.red,borderRadius:2,margin:"7px 0 0"}}/>{subtitle&&<p style={{color:S.text3,fontSize:13,margin:"7px 0 0"}}>{subtitle}</p>}</div>
      {actions&&<div style={{display:"flex",alignItems:"center",gap:9}}>{actions}</div>}
    </div>
  </div>;
}

/* ─────────────── KPI CARD ─────────────── */
export function KpiCard({icon:Icon,label,value,delta,series=[],color=S.indigo,onClick,invertDelta=false,hint}){
  const hasDelta=typeof delta==="number"&&isFinite(delta);
  const up=hasDelta&&delta>0, flat=hasDelta&&delta===0;
  const good=invertDelta?!up:up;
  const dc=flat?S.text3:good?S.green:S.red;
  const data=series.map((v,i)=>({i,v}));
  const gid=`spark-${label.replace(/[^a-z0-9]/gi,"")}`;
  return <motion.div whileHover={{y:-3,boxShadow:ELEV.lg}} onClick={onClick} style={{background:S.card,border:`1px solid ${S.border2}`,borderRadius:RADIUS.lg,padding:18,cursor:onClick?"pointer":"default",overflow:"hidden"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:9}}><span style={{background:`${color}1a`,borderRadius:9,padding:8,display:"inline-flex"}}><Icon size={16} color={color}/></span><span style={{color:S.text3,fontSize:12,fontWeight:600}}>{label}</span></div>
      {hasDelta&&<span style={{display:"inline-flex",alignItems:"center",gap:2,background:`${dc}14`,color:dc,borderRadius:RADIUS.pill,padding:"2px 7px",fontSize:11,fontWeight:700}}>{!flat&&(up?<ArrowUpRight size={11}/>:<ArrowDownRight size={11}/>)}{Math.abs(delta)}%</span>}
    </div>
    <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:8}}>
      <div><div style={{fontSize:30,fontWeight:800,color:S.text,lineHeight:1,fontFamily:BRAND.font}}>{value}</div>{hint&&<div style={{color:S.text3,fontSize:11,marginTop:6}}>{hint}</div>}</div>
      {data.length>1&&<div style={{width:96,height:38}}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:4,right:0,bottom:0,left:0}}><defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.35}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs><Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={false} dot={false}/></AreaChart></ResponsiveContainer></div>}
    </div>
  </motion.div>;
}

/* ─────────────── DATA TABLE ─────────────── */
export const RISK_RANK={High:3,Moderate:2,Low:1};
export function DataTable({columns,rows,getRowId=r=>r.id,initialSort,pageSize:initPS=10,selectable=false,onRowClick,renderBulkActions,emptyMessage="No records"}){
  const [sortKey,setSortKey]=useState(initialSort?.key||null);
  const [sortDir,setSortDir]=useState(initialSort?.dir||"asc");
  const [page,setPage]=useState(0);
  const [pageSize,setPageSize]=useState(initPS);
  const [dense,setDense]=useState(false);
  const [selected,setSelected]=useState(()=>new Set());
  const sorted=useMemo(()=>{
    if(!sortKey)return rows;
    const col=columns.find(c=>c.key===sortKey);
    const val=r=>col?.sortValue?col.sortValue(r):r[sortKey];
    return[...rows].sort((a,b)=>{const av=val(a),bv=val(b); if(av==null)return 1; if(bv==null)return-1; const cmp=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv)); return sortDir==="asc"?cmp:-cmp;});
  },[rows,columns,sortKey,sortDir]);
  const pageCount=Math.max(1,Math.ceil(sorted.length/pageSize));
  const sp=Math.min(page,pageCount-1);
  const pageRows=sorted.slice(sp*pageSize,sp*pageSize+pageSize);
  const allSel=pageRows.length>0&&pageRows.every(r=>selected.has(getRowId(r)));
  const someSelected=selected.size>0;
  const toggleSort=k=>{const col=columns.find(c=>c.key===k); if(!col?.sortable)return; if(sortKey===k)setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortKey(k);setSortDir("asc");}};
  const toggleRow=id=>setSelected(prev=>{const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n;});
  const toggleAll=()=>setSelected(prev=>{const n=new Set(prev); if(allSel)pageRows.forEach(r=>n.delete(getRowId(r))); else pageRows.forEach(r=>n.add(getRowId(r))); return n;});
  const clearSel=()=>setSelected(new Set());
  const cp=dense?"7px 12px":"12px 14px";
  const selRows=sorted.filter(r=>selected.has(getRowId(r)));
  const Box=({checked,onChange})=><span onClick={e=>{e.stopPropagation();onChange();}} style={{width:16,height:16,borderRadius:5,cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",border:`1.5px solid ${checked?S.indigo:S.border}`,background:checked?S.indigo:"transparent",transition:"all .12s"}}>{checked&&<Check size={11} color="#fff" strokeWidth={3}/>}</span>;
  if(rows.length===0)return <div style={{background:S.card,border:`1px solid ${S.border2}`,borderRadius:RADIUS.lg}}><EmptyState msg={emptyMessage}/></div>;
  return <div style={{background:S.card,border:`1px solid ${S.border2}`,borderRadius:RADIUS.lg,overflow:"hidden"}}>
    {someSelected&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"rgba(0,75,135,.06)",borderBottom:`1px solid ${S.border2}`}}><span style={{color:S.indigoL,fontSize:13,fontWeight:600}}>{selected.size} selected<button onClick={clearSel} style={{marginLeft:10,background:"transparent",border:"none",color:S.text3,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>clear</button></span><div style={{display:"flex",gap:8}}>{renderBulkActions?.(selRows,clearSel)}</div></div>}
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:720}}>
        <thead><tr style={{position:"sticky",top:0,zIndex:1}}>
          {selectable&&<th style={{padding:cp,background:S.bgElev,borderBottom:`1px solid ${S.border}`,width:40,textAlign:"left"}}><Box checked={allSel} onChange={toggleAll}/></th>}
          {columns.map(c=>{const active=sortKey===c.key; return <th key={c.key} onClick={()=>toggleSort(c.key)} style={{padding:cp,background:S.bgElev,borderBottom:`1px solid ${S.border}`,textAlign:c.align||"left",width:c.width,whiteSpace:"nowrap",color:active?S.indigoL:S.text3,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",cursor:c.sortable?"pointer":"default",userSelect:"none"}}><span style={{display:"inline-flex",alignItems:"center",gap:4,justifyContent:c.align==="right"?"flex-end":"flex-start"}}>{c.header}{c.sortable&&(active?(sortDir==="asc"?<ChevronUp size={12}/>:<ChevronDown size={12}/>):<ChevronsUpDown size={12} style={{opacity:.4}}/>)}</span></th>;})}
        </tr></thead>
        <tbody>{pageRows.map(row=>{const id=getRowId(row); const isSel=selected.has(id); return <tr key={id} onClick={()=>onRowClick?.(row)} style={{borderBottom:"1px solid rgba(0,75,135,.06)",background:isSel?"rgba(0,75,135,.05)":"transparent",cursor:onRowClick?"pointer":"default",transition:"background .1s"}} onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="rgba(0,75,135,.03)";}} onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background="transparent";}}>
          {selectable&&<td style={{padding:cp}}><Box checked={isSel} onChange={()=>toggleRow(id)}/></td>}
          {columns.map(c=><td key={c.key} style={{padding:cp,textAlign:c.align||"left",color:S.text2,verticalAlign:"middle"}}>{c.render?c.render(row):row[c.key]}</td>)}
        </tr>; })}</tbody>
      </table>
    </div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderTop:`1px solid ${S.border2}`,flexWrap:"wrap",gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:14}}><span style={{color:S.text3,fontSize:12}}>{sorted.length===0?"0":`${sp*pageSize+1}–${Math.min((sp+1)*pageSize,sorted.length)}`} of {sorted.length}</span><button onClick={()=>setDense(d=>!d)} style={{background:"transparent",border:`1px solid ${S.border2}`,color:S.text3,borderRadius:7,padding:"4px 9px",fontSize:11,cursor:"pointer"}}>{dense?"Comfortable":"Compact"}</button><select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(0);}} style={{background:S.card2,border:`1px solid ${S.border2}`,color:S.text2,borderRadius:7,padding:"4px 8px",fontSize:12,outline:"none"}}>{[10,25].map(n=><option key={n} value={n}>{n} / page</option>)}</select></div>
      <div style={{display:"flex",alignItems:"center",gap:6}}><button disabled={sp===0} onClick={()=>setPage(sp-1)} style={{background:"transparent",border:`1px solid ${S.border2}`,color:sp===0?S.text3:S.text2,borderRadius:7,padding:"5px 8px",cursor:sp===0?"not-allowed":"pointer",opacity:sp===0?.5:1,display:"inline-flex"}}><ChevronLeft size={14}/></button><span style={{color:S.text3,fontSize:12,minWidth:70,textAlign:"center"}}>Page {sp+1} / {pageCount}</span><button disabled={sp>=pageCount-1} onClick={()=>setPage(sp+1)} style={{background:"transparent",border:`1px solid ${S.border2}`,color:sp>=pageCount-1?S.text3:S.text2,borderRadius:7,padding:"5px 8px",cursor:sp>=pageCount-1?"not-allowed":"pointer",opacity:sp>=pageCount-1?.5:1,display:"inline-flex"}}><ChevronRight size={14}/></button></div>
    </div>
  </div>;
}

/* Extended badge styles for AMPAM leave types and entities */
Object.assign(BADGE_MAP, {
  PDL:      {bg:"rgba(21,101,168,.10)", clr:"#1565a8", bdr:"rgba(21,101,168,.32)"},
  PFML:     {bg:"rgba(20,103,168,.10)", clr:"#1467a8", bdr:"rgba(20,103,168,.32)"},
  OFLA:     {bg:"rgba(194,89,11,.10)",  clr:"#c2590b", bdr:"rgba(194,89,11,.32)"},
  FAMLI:    {bg:"rgba(30,125,63,.10)",  clr:"#1e7d3f", bdr:"rgba(30,125,63,.32)"},
  Personal: {bg:"rgba(105,129,156,.12)",clr:"#5a7390", bdr:"rgba(105,129,156,.35)"},
  Unassigned:{bg:"rgba(185,117,9,.10)", clr:"#9a6207", bdr:"rgba(185,117,9,.35)"},
  AMPAM:    {bg:"rgba(0,75,135,.09)",   clr:"#004B87", bdr:"rgba(0,75,135,.28)"},
  MULTIMECH:{bg:"rgba(14,124,134,.10)", clr:"#0e7c86", bdr:"rgba(14,124,134,.30)"},
  SEAL:     {bg:"rgba(239,51,64,.08)",  clr:"#c01622", bdr:"rgba(239,51,64,.30)"},
  "Leave of Absence":{bg:"rgba(185,117,9,.10)", clr:"#9a6207", bdr:"rgba(185,117,9,.35)"},
  Seasonal: {bg:"rgba(14,124,134,.10)", clr:"#0e7c86", bdr:"rgba(14,124,134,.30)"},
  Terminated:{bg:"rgba(239,51,64,.08)", clr:"#c01622", bdr:"rgba(239,51,64,.30)"},
  Retired:  {bg:"rgba(105,129,156,.12)",clr:"#5a7390", bdr:"rgba(105,129,156,.35)"},
  Inactive: {bg:"rgba(105,129,156,.12)",clr:"#5a7390", bdr:"rgba(105,129,156,.35)"},
  WC:       {bg:"rgba(194,89,11,.10)",  clr:"#c2590b", bdr:"rgba(194,89,11,.32)"},
  ADA:      {bg:"rgba(21,101,168,.10)", clr:"#1565a8", bdr:"rgba(21,101,168,.32)"},
});
