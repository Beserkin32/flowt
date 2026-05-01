import { useState, useMemo, useCallback } from "react";

function useStorage(key, init) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? init; } catch { return init; }
  });
  const set = useCallback((v) => {
    const next = typeof v === "function" ? v(val) : v;
    setVal(next);
    localStorage.setItem(key, JSON.stringify(next));
  }, [val]);
  return [val, set];
}

const uid = () => "id_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
const fmt = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v ?? 0);
const todayStr = () => new Date().toISOString().slice(0, 10);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PALETTE = ["#4fc3f7","#81c784","#ffb74d","#f06292","#ce93d8","#80cbc4","#fff176","#ff8a65","#a5d6a7","#90caf9","#ef9a9a","#b0bec5"];
const ACCOUNT_TYPES = ["Checking","Savings","Cash","Credit","Investment","Other"];
const CAT_ICONS = ["🛒","💡","🚗","🍔","💊","🎮","✈️","👗","🏠","📱","🐾","💰","🎓","🔧","💼","🎁","🏋️","📚"];
const DEMO_ACCTS = [{ id: "a1", name: "Checking", type: "Checking", balance: 0 }];
const DEMO_CATS = [
  { id: "c1", name: "Groceries", icon: "🛒", color: "#81c784", overflowTo: null },
  { id: "c2", name: "Bills", icon: "💡", color: "#ffb74d", overflowTo: null },
  { id: "c3", name: "Gas", icon: "🚗", color: "#4fc3f7", overflowTo: null },
  { id: "c4", name: "Spending Money", icon: "💰", color: "#ce93d8", overflowTo: null },
];

// Simple SVG sparkline chart
function MiniChart({ data, lines, h = 180 }) {
  if (!data || data.length < 2) return <div style={{color:"#444",fontSize:12,padding:"40px 0",textAlign:"center"}}>Not enough data yet</div>;
  const W = 320, H = h, pl = 48, pb = 24, pr = 8, pt = 8;
  const cw = W - pl - pr, ch = H - pt - pb;
  const allV = lines.flatMap(l => data.map(d => d[l.key] ?? 0));
  const minV = Math.min(0, ...allV), maxV = Math.max(0, ...allV, 1);
  const rng = maxV - minV || 1;
  const xs = i => pl + (i / (data.length - 1)) * cw;
  const ys = v => pt + ch - ((v - minV) / rng) * ch;
  const ticks = [minV, minV + rng * 0.5, maxV];
  const fmtT = v => Math.abs(v) >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${Math.round(v)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",display:"block"}}>
      {ticks.map((v,i) => (
        <g key={i}>
          <line x1={pl} x2={W-pr} y1={ys(v)} y2={ys(v)} stroke="#222" strokeWidth="1"/>
          <text x={pl-4} y={ys(v)+4} textAnchor="end" fill="#555" fontSize="9">{fmtT(v)}</text>
        </g>
      ))}
      {data.map((d,i) => (
        <text key={i} x={xs(i)} y={H-4} textAnchor="middle" fill="#555" fontSize="9">{d.label}</text>
      ))}
      {minV < 0 && <line x1={pl} x2={W-pr} y1={ys(0)} y2={ys(0)} stroke="#333" strokeWidth="1" strokeDasharray="4,3"/>}
      {lines.map(l => {
        const pts = data.map((d,i) => `${xs(i).toFixed(1)},${ys(d[l.key]??0).toFixed(1)}`).join(" ");
        return (
          <g key={l.key}>
            <polyline points={pts} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round"/>
            {data.map((d,i) => <circle key={i} cx={xs(i)} cy={ys(d[l.key]??0)} r="3" fill={l.color}/>)}
          </g>
        );
      })}
    </svg>
  );
}

export default function App() {
  const [accounts, setAccounts] = useStorage("bgt_accts", DEMO_ACCTS);
  const [cats, setCats]         = useStorage("bgt_cats",  DEMO_CATS);
  const [txns, setTxns]         = useStorage("bgt_txns",  []);
  const [templates, setTemplates] = useStorage("bgt_tmpl", []);
  const [unalloc, setUnalloc]   = useStorage("bgt_unalloc", 0);
  const [tab, setTab]           = useState("dash");
  const [modal, setModal]       = useState(null);

  const catBal = useMemo(() => {
    const m = {}; cats.forEach(c => m[c.id] = 0);
    txns.forEach(t => { if (t.catId && m[t.catId] !== undefined) m[t.catId] += t.signed; });
    return m;
  }, [cats, txns]);

  const totalAcct = accounts.reduce((s,a) => s + a.balance, 0);
  const totalBudgeted = Object.values(catBal).reduce((s,v) => s+v, 0) + unalloc;

  const addTxn = useCallback((txn) => {
    const signed = txn.type === "expense" ? -Math.abs(txn.amount) : Math.abs(txn.amount);
    const rec = { ...txn, id: uid(), signed, date: txn.date || todayStr() };
    setTxns(t => [rec, ...t]);
    if (txn.accountId) setAccounts(a => a.map(acc => acc.id === txn.accountId ? { ...acc, balance: acc.balance + signed } : acc));
    if (txn.type === "expense" && txn.catId) {
      const cat = cats.find(c => c.id === txn.catId);
      const newBal = (catBal[txn.catId] || 0) + signed;
      if (newBal < 0 && cat?.overflowTo) {
        const amt = Math.abs(newBal);
        setTxns(t => [
          { id: uid(), type: "overflow_out", signed: -amt, amount: amt, catId: cat.overflowTo, accountId: null, label: `↙ Overflow from ${cat.name}`, date: rec.date },
          { id: uid(), type: "overflow_in",  signed:  amt, amount: amt, catId: txn.catId,      accountId: null, label: `↗ Covered by overflow`,    date: rec.date },
          ...t
        ]);
      }
    }
  }, [cats, catBal, setTxns, setAccounts]);

  const deleteTxn = useCallback((txn) => {
    setTxns(t => t.filter(x => x.id !== txn.id));
    if (txn.accountId) setAccounts(a => a.map(acc => acc.id === txn.accountId ? { ...acc, balance: acc.balance - txn.signed } : acc));
  }, [setTxns, setAccounts]);

  const applyTemplate = useCallback((tmpl, amount) => {
    let rem = amount;
    if (tmpl.accountId) setAccounts(a => a.map(acc => acc.id === tmpl.accountId ? { ...acc, balance: acc.balance + amount } : acc));
    tmpl.allocations.forEach(al => {
      const amt = Math.min(al.amount, rem);
      if (amt > 0 && al.catId) {
        rem -= amt;
        setTxns(t => [{ id: uid(), type: "income", signed: amt, amount: amt, catId: al.catId, accountId: null, label: `💵 ${tmpl.name}`, date: todayStr() }, ...t]);
      }
    });
    if (rem > 0) { setUnalloc(u => u + rem); setTxns(t => [{ id: uid(), type: "income", signed: rem, amount: rem, catId: "__unalloc__", accountId: null, label: `💵 ${tmpl.name} (unallocated)`, date: todayStr() }, ...t]); }
  }, [setAccounts, setTxns, setUnalloc]);

  const allocFromPool = useCallback((catId, amount) => {
    const amt = Math.min(amount, unalloc);
    if (amt <= 0) return;
    setUnalloc(u => u - amt);
    setTxns(t => [{ id: uid(), type: "income", signed: amt, amount: amt, catId, accountId: null, label: "📦 From unallocated", date: todayStr() }, ...t]);
  }, [unalloc, setUnalloc, setTxns]);

  const now = new Date();
  const chartData = useMemo(() => Array.from({length:6},(_,i)=>{
    const d = new Date(now.getFullYear(), now.getMonth()-(5-i), 1);
    const label = MONTHS[d.getMonth()]+"'"+d.getFullYear().toString().slice(2);
    const mt = txns.filter(t=>{ const td=new Date(t.date); return td.getMonth()===d.getMonth()&&td.getFullYear()===d.getFullYear(); });
    const pt = {label};
    cats.forEach(c=>{ pt[c.id]=mt.filter(t=>t.catId===c.id).reduce((s,t)=>s+t.signed,0); });
    pt.__net = mt.reduce((s,t)=>s+t.signed,0);
    return pt;
  }), [txns, cats]);

  const thisMo = useMemo(() => txns.filter(t=>{ const d=new Date(t.date); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); }), [txns]);
  const thisMoByCat = useMemo(()=>{ const m={}; cats.forEach(c=>m[c.id]=0); thisMo.forEach(t=>{ if(t.catId&&m[t.catId]!==undefined) m[t.catId]+=t.signed; }); return m; }, [thisMo,cats]);

  const C = css;
  const TABS = [["dash","⌂","Home"],["accts","🏦","Accts"],["cats","🗂","Cats"],["pay","💵","Pay"],["charts","📈","Charts"]];

  return (
    <div style={C.app}>
      <div style={C.topbar}>
        <span style={C.logo}>flowt</span>
        <nav style={C.nav}>
          {TABS.map(([t,ic,lb])=>(
            <button key={t} style={{...C.navBtn,...(tab===t?C.navOn:{})}} onClick={()=>setTab(t)}>
              <span style={{fontSize:17}}>{ic}</span>
              <span style={C.navLbl}>{lb}</span>
            </button>
          ))}
        </nav>
      </div>
      <div style={C.body}>
        {tab==="dash"   && <Dash accounts={accounts} cats={cats} catBal={catBal} unalloc={unalloc} txns={txns} thisMoByCat={thisMoByCat} totalAcct={totalAcct} totalBudgeted={totalBudgeted} setModal={setModal} allocFromPool={allocFromPool}/>}
        {tab==="accts"  && <AcctsTab accounts={accounts} txns={txns} setModal={setModal}/>}
        {tab==="cats"   && <CatsTab cats={cats} catBal={catBal} setModal={setModal}/>}
        {tab==="pay"    && <PayTab templates={templates} setTemplates={setTemplates} cats={cats} accounts={accounts} setModal={setModal}/>}
        {tab==="charts" && <ChartsTab cats={cats} chartData={chartData} thisMoByCat={thisMoByCat} thisMo={thisMo}/>}
      </div>
      {modal && <ModalRouter modal={modal} setModal={setModal} accounts={accounts} setAccounts={setAccounts} cats={cats} setCats={setCats} catBal={catBal} unalloc={unalloc} addTxn={addTxn} deleteTxn={deleteTxn} txns={txns} templates={templates} setTemplates={setTemplates} applyTemplate={applyTemplate} allocFromPool={allocFromPool}/>}
    </div>
  );
}

function Dash({accounts,cats,catBal,unalloc,txns,thisMoByCat,totalAcct,totalBudgeted,setModal,allocFromPool}) {
  return (
    <div>
      <div style={css.strip}>
        <Tile lbl="Accounts" val={totalAcct} color={totalAcct<0?"#f87171":"#f0f0f5"}/>
        <div style={css.div}/>
        <Tile lbl="Budgeted" val={totalBudgeted} color="#86efac"/>
        <div style={css.div}/>
        <Tile lbl="Unallocated" val={unalloc} color={unalloc>0?"#fcd34d":"#555"}/>
      </div>
      {unalloc>0&&<div style={css.banner}><div><b style={{fontSize:13}}>📦 {fmt(unalloc)} unallocated</b><div style={{fontSize:11,color:"#aaa",marginTop:2}}>Assign to a category</div></div><Btn onClick={()=>setModal({type:"alloc"})}>Allocate →</Btn></div>}
      <Row title="Categories"><Btn onClick={()=>setModal({type:"addTxn"})}>+ Transaction</Btn></Row>
      <div style={css.grid}>
        {cats.map(cat=>{
          const bal=catBal[cat.id]??0, mo=thisMoByCat[cat.id]??0;
          const maxB=Math.max(...Object.values(catBal).filter(v=>v>0),1);
          return (
            <div key={cat.id} style={{...css.catCard,borderColor:cat.color+"44"}} onClick={()=>setModal({type:"catDetail",data:cat})}>
              <div style={{fontSize:22,marginBottom:4}}>{cat.icon}</div>
              <div style={{fontSize:11,fontWeight:600,color:"#aaa",marginBottom:4}}>{cat.name}</div>
              <div style={{fontSize:19,fontWeight:700,color:bal<0?"#f87171":cat.color,fontFamily:"monospace"}}>{fmt(bal)}</div>
              <div style={{fontSize:9,color:"#555",marginTop:2}}>mo: {mo>=0?"+":""}{fmt(mo)}</div>
              <div style={{marginTop:8,height:3,background:"#ffffff08",borderRadius:3}}>
                <div style={{height:"100%",borderRadius:3,background:bal<=0?"#f8717133":cat.color,width:bal<=0?"100%":Math.min(100,(bal/maxB)*100)+"%"}}/>
              </div>
            </div>
          );
        })}
      </div>
      <Row title="Recent"/>
      {txns.length===0&&<Empty>No transactions yet — tap + Transaction</Empty>}
      {txns.slice(0,10).map(t=><TxnRow key={t.id} txn={t} cats={cats} accounts={accounts}/>)}
    </div>
  );
}

function AcctsTab({accounts,txns,setModal}) {
  const now=new Date();
  return (
    <div>
      <Row title={`Accounts — ${fmt(accounts.reduce((s,a)=>s+a.balance,0))}`}><Btn onClick={()=>setModal({type:"editAcct",data:null})}>+ Add</Btn></Row>
      {accounts.length===0&&<Empty>No accounts yet</Empty>}
      {accounts.map(acc=>{
        const at=txns.filter(t=>t.accountId===acc.id&&new Date(t.date).getMonth()===now.getMonth());
        const mIn=at.filter(t=>t.signed>0).reduce((s,t)=>s+t.signed,0);
        const mOut=at.filter(t=>t.signed<0).reduce((s,t)=>s+t.signed,0);
        return (
          <div key={acc.id} style={css.card} onClick={()=>setModal({type:"editAcct",data:acc})}>
            <div><div style={{fontSize:15,fontWeight:600}}>{acc.name}</div><div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:1,marginTop:2}}>{acc.type}</div><div style={{fontSize:10,color:"#555",marginTop:4}}>+{fmt(mIn)} / {fmt(mOut)} this mo</div></div>
            <div style={{fontSize:24,fontWeight:700,fontFamily:"monospace",color:acc.balance<0?"#f87171":"#f0f0f5"}}>{fmt(acc.balance)}</div>
          </div>
        );
      })}
    </div>
  );
}

function CatsTab({cats,catBal,setModal}) {
  return (
    <div>
      <Row title="Categories"><Btn onClick={()=>setModal({type:"editCat",data:null})}>+ Add</Btn></Row>
      {cats.length===0&&<Empty>No categories yet</Empty>}
      {cats.map(cat=>{
        const bal=catBal[cat.id]??0;
        return (
          <div key={cat.id} style={{...css.card,borderLeft:`3px solid ${cat.color}`}} onClick={()=>setModal({type:"editCat",data:cat})}>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:24}}>{cat.icon}</span>
              <div><div style={{fontSize:15,fontWeight:600}}>{cat.name}</div><div style={{fontSize:10,color:cat.color,marginTop:2}}>{cat.overflowTo?"↙ overflow on":`no overflow`}</div></div>
            </div>
            <div style={{textAlign:"right"}}><div style={{fontSize:22,fontWeight:700,fontFamily:"monospace",color:bal<0?"#f87171":cat.color}}>{fmt(bal)}</div><div style={{fontSize:10,color:"#555"}}>available</div></div>
          </div>
        );
      })}
    </div>
  );
}

function PayTab({templates,setTemplates,cats,accounts,setModal}) {
  return (
    <div>
      <Row title="Paycheck Templates"><Btn onClick={()=>setModal({type:"editTmpl",data:null})}>+ New</Btn></Row>
      {templates.length===0&&<Empty>No templates yet. Create one to split paychecks into categories automatically.</Empty>}
      {templates.map(tmpl=>{
        const total=tmpl.allocations.reduce((s,a)=>s+a.amount,0);
        const acct=accounts.find(a=>a.id===tmpl.accountId);
        return (
          <div key={tmpl.id} style={{...css.card,flexDirection:"column",alignItems:"flex-start",gap:10}}>
            <div style={{display:"flex",justifyContent:"space-between",width:"100%"}}>
              <div><div style={{fontSize:15,fontWeight:600}}>{tmpl.name}</div><div style={{fontSize:11,color:"#555",marginTop:2}}>→ {acct?.name??"No account"}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:10,color:"#555"}}>allocates</div><div style={{fontFamily:"monospace",fontSize:18,fontWeight:700,color:"#86efac"}}>{fmt(total)}</div></div>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {tmpl.allocations.map(a=>{const cat=cats.find(c=>c.id===a.catId); return cat?<span key={a.catId} style={{background:cat.color+"22",color:cat.color,fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:600}}>{cat.icon} {cat.name}: {fmt(a.amount)}</span>:null;})}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...css.applyBtn}} onClick={()=>setModal({type:"applyTmpl",data:tmpl})}>💵 Apply</button>
              <Btn onClick={()=>setModal({type:"editTmpl",data:tmpl})}>Edit</Btn>
              <Btn onClick={()=>setTemplates(t=>t.filter(x=>x.id!==tmpl.id))}>✕</Btn>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChartsTab({cats,chartData,thisMoByCat,thisMo}) {
  const [mode,setMode]=useState("cats");
  const [sel,setSel]=useState(()=>cats.slice(0,4).map(c=>c.id));
  const mIn=thisMo.filter(t=>t.signed>0).reduce((s,t)=>s+t.signed,0);
  const mOut=thisMo.filter(t=>t.signed<0).reduce((s,t)=>s+t.signed,0);
  const maxAbs=Math.max(...cats.map(c=>Math.abs(thisMoByCat[c.id]??0)),1);
  const lines=mode==="net"?[{key:"__net",color:"#4fc3f7"}]:cats.filter(c=>sel.includes(c.id)).map(c=>({key:c.id,color:c.color}));
  return (
    <div>
      <div style={css.strip}>
        <Tile lbl="Mo In" val={mIn} color="#86efac"/>
        <div style={css.div}/>
        <Tile lbl="Mo Out" val={mOut} color="#f87171"/>
        <div style={css.div}/>
        <Tile lbl="Net" val={mIn+mOut} color={(mIn+mOut)>=0?"#4fc3f7":"#f87171"}/>
      </div>
      <div style={{display:"flex",gap:8,padding:"14px 16px 0"}}>
        {[["cats","By Category"],["net","Net Flow"]].map(([m,l])=>(
          <button key={m} style={{...css.modeBtn,...(mode===m?css.modeOn:{})}} onClick={()=>setMode(m)}>{l}</button>
        ))}
      </div>
      {mode==="cats"&&<div style={{padding:"10px 16px",display:"flex",flexWrap:"wrap",gap:6}}>
        {cats.map(c=><button key={c.id} style={{padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:sel.includes(c.id)?c.color+"33":"#1a1a24",color:sel.includes(c.id)?c.color:"#555"}} onClick={()=>setSel(s=>s.includes(c.id)?s.filter(x=>x!==c.id):[...s,c.id])}>{c.icon} {c.name}</button>)}
      </div>}
      <div style={{padding:"8px 16px"}}>
        <div style={css.chartBox}>
          <div style={{fontSize:9,letterSpacing:2,color:"#555",textTransform:"uppercase",marginBottom:8}}>6-month {mode==="net"?"net flow":"category balances"}</div>
          <MiniChart data={chartData} lines={lines}/>
        </div>
      </div>
      <Row title="This month by category"/>
      {cats.map(cat=>{
        const v=thisMoByCat[cat.id]??0; if(v===0) return null;
        return (
          <div key={cat.id} style={{display:"flex",alignItems:"center",padding:"10px 16px",borderBottom:"1px solid #17171f",gap:12}}>
            <span style={{fontSize:18}}>{cat.icon}</span>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{cat.name}</div><div style={{height:4,background:"#1a1a24",borderRadius:4,marginTop:5}}><div style={{height:"100%",borderRadius:4,background:v<0?"#f87171":cat.color,width:(Math.abs(v)/maxAbs*100)+"%"}}/></div></div>
            <div style={{fontFamily:"monospace",fontSize:14,fontWeight:600,color:v<0?"#f87171":cat.color,minWidth:72,textAlign:"right"}}>{v>0?"+":""}{fmt(v)}</div>
          </div>
        );
      })}
    </div>
  );
}

function TxnRow({txn,cats,accounts}) {
  const cat=cats.find(c=>c.id===txn.catId), acct=accounts.find(a=>a.id===txn.accountId);
  return (
    <div style={css.txnRow}>
      <span style={{fontSize:17,flexShrink:0}}>{cat?.icon??(txn.catId==="__unalloc__"?"📦":"💸")}</span>
      <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{txn.label}</div><div style={{fontSize:10,color:"#555",marginTop:1}}>{cat?.name??"—"}{acct?` · ${acct.name}`:""} · {txn.date}</div></div>
      <div style={{fontFamily:"monospace",fontSize:14,fontWeight:600,flexShrink:0,color:txn.signed>0?"#86efac":"#f87171"}}>{txn.signed>0?"+":""}{fmt(txn.signed)}</div>
    </div>
  );
}

function Tile({lbl,val,color}) { return <div style={css.tile}><div style={css.tileLbl}>{lbl}</div><div style={{...css.tileVal,color}}>{fmt(val)}</div></div>; }
function Row({title,children}) { return <div style={css.row}><span style={css.rowTitle}>{title}</span><div style={{display:"flex",gap:8}}>{children}</div></div>; }
function Btn({onClick,children,style={}}) { return <button style={{...css.btn,...style}} onClick={onClick}>{children}</button>; }
function Empty({children}) { return <div style={css.empty}>{children}</div>; }

function ModalRouter(props) {
  const close=()=>props.setModal(null);
  const p={...props,close};
  switch(props.modal.type) {
    case "addTxn":    return <AddTxnModal {...p}/>;
    case "catDetail": return <CatDetailModal {...p}/>;
    case "editCat":   return <EditCatModal {...p}/>;
    case "editAcct":  return <EditAcctModal {...p}/>;
    case "editTmpl":  return <EditTmplModal {...p}/>;
    case "applyTmpl": return <ApplyTmplModal {...p}/>;
    case "alloc":     return <AllocModal {...p}/>;
    default: return null;
  }
}

function Sheet({title,close,children}) {
  return (
    <div style={css.overlay} onClick={close}>
      <div style={css.sheet} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:17,fontWeight:700}}>{title}</div>
          <button style={{background:"none",border:"none",color:"#555",fontSize:20,cursor:"pointer"}} onClick={close}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Fld({label,children}) { return <div style={{marginBottom:13}}><label style={css.fldLbl}>{label}</label>{children}</div>; }
function PBtn({color="#4fc3f7",onClick,children,disabled}) {
  return <button disabled={disabled} onClick={onClick} style={{width:"100%",padding:"13px",borderRadius:13,border:"none",cursor:disabled?"not-allowed":"pointer",background:disabled?"#2a2a3a":`linear-gradient(135deg,${color}cc,${color}66)`,color:"#fff",fontSize:15,fontWeight:700,marginTop:6,fontFamily:"inherit"}}>{children}</button>;
}

function AddTxnModal({close,addTxn,cats,accounts,modal}) {
  const init=modal.data||{};
  const [type,setType]=useState(init.type||"expense");
  const [amt,setAmt]=useState("");
  const [lbl,setLbl]=useState("");
  const [catId,setCatId]=useState(init.catId||cats[0]?.id||"");
  const [acctId,setAcctId]=useState(accounts[0]?.id||"");
  const [date,setDate]=useState(todayStr());
  const submit=()=>{ const a=parseFloat(amt); if(!a||a<=0) return; addTxn({type,amount:a,label:lbl||(type==="expense"?"Expense":"Income"),catId,accountId:acctId||null,date}); close(); };
  return (
    <Sheet title="Add Transaction" close={close}>
      <div style={css.typeRow}>
        <button style={{...css.typeBtn,...(type==="expense"?{background:"#f8717122",color:"#f87171"}:{})}} onClick={()=>setType("expense")}>Expense</button>
        <button style={{...css.typeBtn,...(type==="income"?{background:"#86efac22",color:"#86efac"}:{})}} onClick={()=>setType("income")}>Income</button>
      </div>
      <Fld label="Amount"><input style={css.inp} type="number" inputMode="decimal" placeholder="0.00" value={amt} onChange={e=>setAmt(e.target.value)} autoFocus/></Fld>
      <Fld label="Description"><input style={css.inp} type="text" placeholder="What was this?" value={lbl} onChange={e=>setLbl(e.target.value)}/></Fld>
      <Fld label="Category"><select style={css.inp} value={catId} onChange={e=>setCatId(e.target.value)}>{cats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></Fld>
      <Fld label="Account (optional)"><select style={css.inp} value={acctId} onChange={e=>setAcctId(e.target.value)}><option value="">— none —</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Fld>
      <Fld label="Date"><input style={css.inp} type="date" value={date} onChange={e=>setDate(e.target.value)}/></Fld>
      <PBtn color={type==="expense"?"#f87171":"#86efac"} onClick={submit}>{type==="expense"?"− Record Expense":"+ Add Income"}</PBtn>
    </Sheet>
  );
}

function CatDetailModal({close,modal,cats,accounts,catBal,txns,addTxn,deleteTxn,unalloc,allocFromPool,setModal}) {
  const cat=modal.data, bal=catBal[cat.id]??0;
  const catTxns=txns.filter(t=>t.catId===cat.id);
  const [aAmt,setAAmt]=useState("");
  return (
    <Sheet title={`${cat.icon} ${cat.name}`} close={close}>
      <div style={{textAlign:"center",padding:"6px 0 16px"}}>
        <div style={{fontFamily:"monospace",fontSize:36,fontWeight:700,color:bal<0?"#f87171":cat.color}}>{fmt(bal)}</div>
        <div style={{fontSize:11,color:"#555"}}>available</div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <PBtn color="#86efac" onClick={()=>{close();setModal({type:"addTxn",data:{catId:cat.id,type:"income"}});}}>+ Add</PBtn>
        <PBtn color="#f87171" onClick={()=>{close();setModal({type:"addTxn",data:{catId:cat.id,type:"expense"}});}}>− Spend</PBtn>
        <PBtn color="#4fc3f7" onClick={()=>{close();setModal({type:"editCat",data:cat});}}>Edit</PBtn>
      </div>
      {unalloc>0&&<div style={{background:"#fcd34d0e",border:"1px solid #fcd34d22",borderRadius:12,padding:12,marginBottom:14}}>
        <div style={{fontSize:11,color:"#fcd34d",marginBottom:8}}>Allocate from pool ({fmt(unalloc)} available)</div>
        <div style={{display:"flex",gap:8}}><input style={{...css.inp,flex:1}} type="number" placeholder="Amount" value={aAmt} onChange={e=>setAAmt(e.target.value)}/><Btn onClick={()=>{allocFromPool(cat.id,parseFloat(aAmt)||0);setAAmt("");}}>Allocate</Btn></div>
      </div>}
      <div style={css.fldLbl}>Transactions</div>
      <div style={{maxHeight:220,overflowY:"auto"}}>
        {catTxns.length===0&&<Empty>None yet.</Empty>}
        {catTxns.map(t=>(
          <div key={t.id} style={{display:"flex",alignItems:"center",padding:"9px 0",borderBottom:"1px solid #17171f",gap:8}}>
            <div style={{flex:1}}><div style={{fontSize:13}}>{t.label}</div><div style={{fontSize:10,color:"#555"}}>{t.date}</div></div>
            <div style={{fontFamily:"monospace",fontSize:13,color:t.signed>0?"#86efac":"#f87171"}}>{t.signed>0?"+":""}{fmt(t.signed)}</div>
            {t.type!=="overflow_in"&&t.type!=="overflow_out"&&<button style={{background:"none",border:"none",color:"#444",cursor:"pointer"}} onClick={()=>deleteTxn(t)}>🗑</button>}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function EditCatModal({close,modal,cats,setCats}) {
  const ex=modal.data;
  const [name,setName]=useState(ex?.name??"");
  const [icon,setIcon]=useState(ex?.icon??"💰");
  const [color,setColor]=useState(ex?.color??PALETTE[0]);
  const [ovfl,setOvfl]=useState(ex?.overflowTo??"");
  const save=()=>{ if(!name.trim()) return; if(ex) setCats(c=>c.map(x=>x.id===ex.id?{...x,name:name.trim(),icon,color,overflowTo:ovfl||null}:x)); else setCats(c=>[...c,{id:uid(),name:name.trim(),icon,color,overflowTo:ovfl||null}]); close(); };
  return (
    <Sheet title={ex?"Edit Category":"New Category"} close={close}>
      <Fld label="Name"><input style={css.inp} type="text" placeholder="e.g. Groceries" value={name} onChange={e=>setName(e.target.value)} autoFocus/></Fld>
      <Fld label="Icon"><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{CAT_ICONS.map(ic=><button key={ic} style={{fontSize:19,background:ic===icon?"#ffffff15":"none",border:ic===icon?"1px solid #444":"1px solid transparent",borderRadius:8,padding:"3px 5px",cursor:"pointer"}} onClick={()=>setIcon(ic)}>{ic}</button>)}</div></Fld>
      <Fld label="Color"><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{PALETTE.map(p=><button key={p} style={{width:26,height:26,borderRadius:"50%",background:p,border:p===color?"3px solid #fff":"2px solid transparent",cursor:"pointer"}} onClick={()=>setColor(p)}/>)}</div></Fld>
      <Fld label="Overflow into when negative"><select style={css.inp} value={ovfl} onChange={e=>setOvfl(e.target.value)}><option value="">— none —</option>{cats.filter(c=>c.id!==ex?.id).map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></Fld>
      <PBtn onClick={save}>{ex?"Save Changes":"Create Category"}</PBtn>
      {ex&&<PBtn color="#f8717133" onClick={()=>{setCats(c=>c.filter(x=>x.id!==ex.id));close();}}>Delete Category</PBtn>}
    </Sheet>
  );
}

function EditAcctModal({close,modal,accounts,setAccounts}) {
  const ex=modal.data;
  const [name,setName]=useState(ex?.name??"");
  const [type,setType]=useState(ex?.type??"Checking");
  const [bal,setBal]=useState(ex?.balance?.toFixed(2)??"0");
  const save=()=>{ if(!name.trim()) return; if(ex) setAccounts(a=>a.map(x=>x.id===ex.id?{...x,name:name.trim(),type,balance:parseFloat(bal)||0}:x)); else setAccounts(a=>[...a,{id:uid(),name:name.trim(),type,balance:parseFloat(bal)||0}]); close(); };
  return (
    <Sheet title={ex?"Edit Account":"New Account"} close={close}>
      <Fld label="Name"><input style={css.inp} type="text" placeholder="Chase Checking" value={name} onChange={e=>setName(e.target.value)} autoFocus/></Fld>
      <Fld label="Type"><select style={css.inp} value={type} onChange={e=>setType(e.target.value)}>{ACCOUNT_TYPES.map(t=><option key={t}>{t}</option>)}</select></Fld>
      <Fld label="Current Balance"><input style={css.inp} type="number" value={bal} onChange={e=>setBal(e.target.value)}/></Fld>
      <PBtn onClick={save}>{ex?"Save Changes":"Add Account"}</PBtn>
      {ex&&<PBtn color="#f8717133" onClick={()=>{setAccounts(a=>a.filter(x=>x.id!==ex.id));close();}}>Delete Account</PBtn>}
    </Sheet>
  );
}

function EditTmplModal({close,modal,cats,accounts,setTemplates}) {
  const ex=modal.data;
  const [name,setName]=useState(ex?.name??"");
  const [acctId,setAcctId]=useState(ex?.accountId??accounts[0]?.id??"");
  const [allocs,setAllocs]=useState(ex?.allocations??[]);
  const total=allocs.reduce((s,a)=>s+(parseFloat(a.amount)||0),0);
  const save=()=>{ if(!name.trim()) return; const rec={id:ex?.id??uid(),name:name.trim(),accountId:acctId,allocations:allocs.map(a=>({...a,amount:parseFloat(a.amount)||0})).filter(a=>a.amount>0)}; if(ex) setTemplates(t=>t.map(x=>x.id===ex.id?rec:x)); else setTemplates(t=>[...t,rec]); close(); };
  return (
    <Sheet title={ex?"Edit Template":"New Paycheck Template"} close={close}>
      <Fld label="Template Name"><input style={css.inp} type="text" placeholder="e.g. Biweekly Paycheck" value={name} onChange={e=>setName(e.target.value)} autoFocus/></Fld>
      <Fld label="Deposit Into"><select style={css.inp} value={acctId} onChange={e=>setAcctId(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Fld>
      <div style={css.fldLbl}>Category Allocations</div>
      {allocs.map((a,i)=>(
        <div key={i} style={{display:"flex",gap:6,marginBottom:7,alignItems:"center"}}>
          <select style={{...css.inp,flex:2}} value={a.catId} onChange={e=>setAllocs(al=>al.map((x,j)=>j===i?{...x,catId:e.target.value}:x))}>{cats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select>
          <input style={{...css.inp,flex:1}} type="number" placeholder="$0" value={a.amount} onChange={e=>setAllocs(al=>al.map((x,j)=>j===i?{...x,amount:e.target.value}:x))}/>
          <button style={{background:"none",border:"none",color:"#f8717155",cursor:"pointer",fontSize:17}} onClick={()=>setAllocs(al=>al.filter((_,j)=>j!==i))}>✕</button>
        </div>
      ))}
      <Btn style={{display:"block",marginBottom:12}} onClick={()=>setAllocs(a=>[...a,{catId:cats[0]?.id??"",amount:""}])}>+ Add Category</Btn>
      <div style={{fontSize:11,color:"#555",marginBottom:10}}>Total: <span style={{color:"#86efac",fontWeight:600}}>{fmt(total)}</span> · Remainder → unallocated pool</div>
      <PBtn onClick={save}>{ex?"Save Template":"Create Template"}</PBtn>
    </Sheet>
  );
}

function ApplyTmplModal({close,modal,applyTemplate,accounts,cats}) {
  const tmpl=modal.data;
  const [amt,setAmt]=useState("");
  const acct=accounts.find(a=>a.id===tmpl.accountId);
  const allocated=tmpl.allocations.reduce((s,a)=>s+a.amount,0);
  const leftover=Math.max(0,(parseFloat(amt)||0)-allocated);
  return (
    <Sheet title={`💵 Apply: ${tmpl.name}`} close={close}>
      <div style={{fontSize:12,color:"#555",marginBottom:14}}>Depositing into: <span style={{color:"#ccc"}}>{acct?.name??"—"}</span></div>
      <Fld label="Paycheck Amount"><input style={css.inp} type="number" inputMode="decimal" placeholder="0.00" value={amt} onChange={e=>setAmt(e.target.value)} autoFocus/></Fld>
      <div style={{background:"#1a1a24",borderRadius:12,padding:12,marginBottom:12,fontSize:12}}>
        {tmpl.allocations.map((a,i)=>{const cat=cats.find(c=>c.id===a.catId); return <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",color:"#777"}}><span>{cat?`${cat.icon} ${cat.name}`:a.catId}</span><span style={{fontFamily:"monospace"}}>{fmt(a.amount)}</span></div>;})}
        <div style={{borderTop:"1px solid #2a2a3a",marginTop:7,paddingTop:7,display:"flex",justifyContent:"space-between"}}><span style={{color:"#555"}}>Unallocated remainder</span><span style={{fontFamily:"monospace",color:leftover>0?"#fcd34d":"#555"}}>{fmt(leftover)}</span></div>
      </div>
      <PBtn color="#86efac" onClick={()=>{const a=parseFloat(amt);if(a>0){applyTemplate(tmpl,a);close();}}}>Apply Paycheck</PBtn>
    </Sheet>
  );
}

function AllocModal({close,cats,unalloc,allocFromPool}) {
  const [amts,setAmts]=useState({});
  const total=Object.values(amts).reduce((s,v)=>s+(parseFloat(v)||0),0);
  const over=total>unalloc;
  return (
    <Sheet title="Allocate Funds" close={close}>
      <div style={{fontSize:12,color:"#555",marginBottom:12}}>Available: <span style={{color:"#fcd34d",fontWeight:600}}>{fmt(unalloc)}</span></div>
      {cats.map(cat=>(
        <div key={cat.id} style={{display:"flex",gap:8,alignItems:"center",marginBottom:7}}>
          <span style={{fontSize:17,width:22}}>{cat.icon}</span>
          <span style={{flex:1,fontSize:13,color:"#ccc"}}>{cat.name}</span>
          <input style={{...css.inp,width:95}} type="number" placeholder="$0" value={amts[cat.id]||""} onChange={e=>setAmts(a=>({...a,[cat.id]:e.target.value}))}/>
        </div>
      ))}
      <div style={{fontSize:11,color:over?"#f87171":"#555",margin:"6px 0 2px"}}>Allocating: <span style={{fontWeight:600,color:over?"#f87171":"#86efac"}}>{fmt(total)}</span>{over?" — exceeds available!":""}</div>
      <PBtn color={over?"#555":"#fcd34d"} disabled={over} onClick={()=>{Object.entries(amts).forEach(([id,v])=>{const a=parseFloat(v);if(a>0)allocFromPool(id,a);});close();}}>Allocate</PBtn>
    </Sheet>
  );
}

const css = {
  app:      {fontFamily:"system-ui,-apple-system,sans-serif",background:"#080810",minHeight:"100vh",color:"#f0f0f5",maxWidth:430,margin:"0 auto"},
  topbar:   {background:"#0d0d18",borderBottom:"1px solid #1a1a28",padding:"10px 16px 0",position:"sticky",top:0,zIndex:10},
  logo:     {fontSize:20,fontWeight:700,color:"#4fc3f7",fontFamily:"monospace",display:"block",marginBottom:8},
  nav:      {display:"flex",gap:2},
  navBtn:   {flex:1,padding:"7px 2px",background:"none",border:"none",color:"#555",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,borderRadius:"7px 7px 0 0"},
  navOn:    {color:"#4fc3f7",background:"#4fc3f710",borderBottom:"2px solid #4fc3f7"},
  navLbl:   {fontSize:9,letterSpacing:.8,textTransform:"uppercase"},
  body:     {paddingBottom:24},
  strip:    {display:"flex",background:"#0d0d18",borderBottom:"1px solid #1a1a28"},
  div:      {width:1,background:"#1a1a28",margin:"10px 0"},
  tile:     {flex:1,padding:"13px 8px",textAlign:"center"},
  tileLbl:  {fontSize:9,letterSpacing:1.5,color:"#555",textTransform:"uppercase",marginBottom:3},
  tileVal:  {fontSize:15,fontWeight:700,fontFamily:"monospace"},
  banner:   {background:"#fcd34d0e",border:"1px solid #fcd34d22",borderRadius:12,margin:"8px 16px",padding:"11px 13px",display:"flex",justifyContent:"space-between",alignItems:"center"},
  row:      {display:"flex",justifyContent:"space-between",alignItems:"center",padding:"15px 16px 9px"},
  rowTitle: {fontSize:11,letterSpacing:2,color:"#555",textTransform:"uppercase"},
  btn:      {background:"none",border:"1px solid #2a2a3a",color:"#4fc3f7",fontSize:11,fontWeight:600,padding:"5px 9px",borderRadius:8,cursor:"pointer",fontFamily:"inherit"},
  applyBtn: {background:"#86efac20",color:"#86efac",border:"none",borderRadius:9,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer"},
  grid:     {display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"0 16px"},
  catCard:  {background:"#0f0f1c",border:"1px solid #1e1e2e",borderRadius:15,padding:"13px",cursor:"pointer"},
  card:     {background:"#0f0f1c",border:"1px solid #1e1e2e",borderRadius:13,padding:"15px",margin:"0 16px 10px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"},
  txnRow:   {display:"flex",alignItems:"center",gap:10,padding:"11px 16px",borderBottom:"1px solid #111118"},
  chartBox: {background:"#0d0d18",border:"1px solid #1a1a28",borderRadius:15,padding:"13px 8px 8px"},
  modeBtn:  {flex:1,padding:"8px",background:"#1a1a24",border:"none",color:"#555",borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  modeOn:   {background:"#4fc3f720",color:"#4fc3f7"},
  overlay:  {position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"flex-end",zIndex:100},
  sheet:    {background:"#12121e",borderRadius:"18px 18px 0 0",padding:"18px 18px 44px",width:"100%",maxWidth:430,margin:"0 auto",maxHeight:"88vh",overflowY:"auto"},
  fldLbl:   {fontSize:10,letterSpacing:1.5,color:"#555",textTransform:"uppercase",marginBottom:5,display:"block"},
  inp:      {width:"100%",background:"#1a1a2a",border:"1px solid #252535",borderRadius:11,padding:"11px 13px",color:"#f0f0f5",fontSize:15,outline:"none",boxSizing:"border-box",fontFamily:"inherit"},
  typeRow:  {display:"flex",background:"#1a1a2a",borderRadius:11,padding:3,marginBottom:16,gap:3},
  typeBtn:  {flex:1,padding:"8px",borderRadius:9,border:"none",background:"transparent",color:"#555",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  empty:    {textAlign:"center",padding:"28px 24px",color:"#333",fontSize:13},
};
