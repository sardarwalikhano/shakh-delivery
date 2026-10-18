import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BadgeCheck, Banknote, CircleAlert, FileImage, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { supabase } from '@/lib/supabase/client';

type Account = { user_id: string; balance_iqd: number; held_iqd: number; lifetime_credited_iqd: number; lifetime_spent_iqd: number };
type Topup = { id: string; user_id: string; amount_iqd: number; payment_method: string; receipt_path: string; sender_reference: string | null; note: string | null; status: 'pending'|'approved'|'rejected'; admin_note: string | null; requested_at: string };
type Tx = { id: string; transaction_type: string; amount_iqd: number; description_ku: string; created_at: string };
type CaptainEarning = { id: string; captain_id: string; order_type: string; order_id: string; delivery_fee_iqd: number; commission_iqd: number; net_earning_iqd: number; earning_day: string; created_at: string };
type CashRow = { id: string; captain_id: string; order_id: string; product_subtotal_iqd: number; delivery_fee_iqd: number; platform_fee_iqd: number; cash_collected_iqd: number; cash_remitted_iqd: number; status: string; collected_at: string; note: string | null };
type CaptainProfile = { id: string; full_name: string | null; phone: string | null };
type CashBalance = { captain_id: string; outstanding_iqd: number; collected_iqd: number; remitted_iqd: number; last_collected_at: string | null };
const fmt = (v: number | string | null | undefined) => Math.round(Number(v ?? 0)).toLocaleString('en-US') + ' د.ع';
const date = (v: string) => new Date(v).toLocaleString('ku-IQ',{dateStyle:'medium',timeStyle:'short'});
const methods: Record<string,string> = {mobile_cash:'Mobile Cash',zain_cash:'ZainCash',fastpay:'FastPay',qi_card:'Qi Card',bank_transfer:'گواستنەوەی بانکی',other:'ڕێگای تر'};

export function PrepaidWalletPage() {
  const { user } = useAuth();
  const { permissions } = useAuthorization();
  const canManage = permissions.has('wallets.manage');
  const [account,setAccount] = useState<Account|null>(null);
  const [requests,setRequests] = useState<Topup[]>([]);
  const [transactions,setTransactions] = useState<Tx[]>([]);
  const [dailyEarnings,setDailyEarnings] = useState<CaptainEarning[]>([]);
  const [cashLedger,setCashLedger] = useState<CashRow[]>([]);
  const [cashBalances,setCashBalances] = useState<CashBalance[]>([]);
  const [captainProfiles,setCaptainProfiles] = useState<Record<string,CaptainProfile>>({});
  const [settlementAmounts,setSettlementAmounts] = useState<Record<string,string>>({});
  const [settlementNotes,setSettlementNotes] = useState<Record<string,string>>({});
  const [amount,setAmount] = useState('25000');
  const [method,setMethod] = useState('mobile_cash');
  const [receipt,setReceipt] = useState<File|null>(null);
  const [reference,setReference] = useState('');
  const [note,setNote] = useState('');
  const [adminNotes,setAdminNotes] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState(false);
  const [busyId,setBusyId] = useState<string|null>(null);
  const [error,setError] = useState<string|null>(null);
  const [message,setMessage] = useState<string|null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError(null);
    const [accountRes,txRes,requestRes,earningRes,cashRes,balanceRes] = await Promise.all([
      supabase.from('prepaid_wallet_accounts').select('user_id,balance_iqd,held_iqd,lifetime_credited_iqd,lifetime_spent_iqd').eq('user_id',user.id).maybeSingle(),
      supabase.from('prepaid_wallet_transactions').select('id,transaction_type,amount_iqd,description_ku,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50),
      supabase.from('prepaid_topup_requests').select('id,user_id,amount_iqd,payment_method,receipt_path,sender_reference,note,status,admin_note,requested_at').order('requested_at',{ascending:false}).limit(100),
      supabase.from('captain_delivery_earnings').select('id,captain_id,order_type,order_id,delivery_fee_iqd,commission_iqd,net_earning_iqd,earning_day,created_at').order('earning_day',{ascending:false}).limit(100),
      supabase.from('captain_cash_ledger').select('id,captain_id,order_id,product_subtotal_iqd,delivery_fee_iqd,platform_fee_iqd,cash_collected_iqd,cash_remitted_iqd,status,collected_at,note').order('collected_at',{ascending:false}).limit(150),
      supabase.rpc('get_captain_cash_balances'),
    ]);
    const err = accountRes.error ?? txRes.error ?? requestRes.error ?? earningRes.error ?? cashRes.error ?? balanceRes.error;
    if (err) { setError(err.message); return; }
    setAccount(accountRes.data as Account|null);
    setTransactions((txRes.data ?? []) as Tx[]);
    const earnings = (earningRes.data ?? []) as CaptainEarning[];
    const cashRows = (cashRes.data ?? []) as CashRow[];
    setDailyEarnings(earnings);
    setCashLedger(cashRows);
    setCashBalances((balanceRes.data ?? []) as CashBalance[]);
    const profileIds = [...new Set(cashRows.map(row=>row.captain_id))];
    if (canManage && profileIds.length) {
      const {data:profiles} = await supabase.from('profiles').select('id,full_name,phone').in('id',profileIds);
      setCaptainProfiles(Object.fromEntries(((profiles ?? []) as CaptainProfile[]).map(profile=>[profile.id,profile])));
    } else setCaptainProfiles({});
    const rows = (requestRes.data ?? []) as Topup[];
    setRequests(canManage ? rows : rows.filter(x=>x.user_id===user.id));
  },[canManage,user]);

  useEffect(()=>{ void refresh(); },[refresh]);

  const submit = async (e:FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      if (!user) throw new Error('تکایە سەرەتا بچۆ ژوورەوە.');
      if (!Number.isInteger(Number(amount)) || Number(amount)<1000 || Number(amount)>100000000) throw new Error('بڕی پارە دەبێت لە ١٬٠٠٠ تا ١٠٠٬٠٠٠٬٠٠٠ د.ع بێت.');
      if (!receipt) throw new Error('وێنەی وەسڵی پارەدان پێویستە.');
      if (receipt.size>5*1024*1024) throw new Error('قەبارەی وێنەکە دەبێت لە ٥MB کەمتر بێت.');
      if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(receipt.type)) throw new Error('تەنها JPG، PNG، WebP یان PDF ڕێگەپێدراوە.');
      const ext = receipt.type==='application/pdf'?'pdf':receipt.type==='image/png'?'png':receipt.type==='image/webp'?'webp':'jpg';
      const path = user.id+'/'+crypto.randomUUID()+'.'+ext;
      const upload = await supabase.storage.from('wallet-payment-receipts').upload(path,receipt,{contentType:receipt.type,upsert:false});
      if (upload.error) throw upload.error;
      const {error:rpcError} = await supabase.rpc('request_prepaid_topup',{p_amount_iqd:Number(amount),p_payment_method:method,p_receipt_path:path,p_sender_reference:reference.trim()||null,p_note:note.trim()||null});
      if (rpcError) { await supabase.storage.from('wallet-payment-receipts').remove([path]); throw rpcError; }
      setMessage('داواکاری زیادکردنی باڵانس نێردرا؛ تا پەسەندکردنی ئەدمین باڵانس زیاد نابێت.');
      setReceipt(null); setReference(''); setNote('');
      const input = document.getElementById('wallet-receipt') as HTMLInputElement|null; if(input) input.value='';
      await refresh();
    } catch(e) { setError(e instanceof Error?e.message:'ناردنی داواکاری سەرنەکەوت.'); }
    finally { setBusy(false); }
  };


  const settleCash = async (captainId:string,outstanding:number) => {
    const amountToSettle = Number(settlementAmounts[captainId] ?? String(outstanding));
    if (!Number.isSafeInteger(amountToSettle) || amountToSettle<1 || amountToSettle>outstanding) {
      setError('بڕی گەڕاندنەوە دەبێت لە ١ تا بڕی کاشی ماوە بێت.'); return;
    }
    setBusyId(captainId); setError(null); setMessage(null);
    try {
      const {data,error:rpcError} = await supabase.rpc('settle_captain_cash',{
        p_captain_id:captainId,p_amount_iqd:amountToSettle,p_note:settlementNotes[captainId]?.trim()||null
      });
      if(rpcError) throw rpcError;
      const result=data as {settled_iqd?:number;outstanding_iqd?:number}|null;
      setMessage('گەڕاندنەوەی کاش تۆمارکرا: '+fmt(result?.settled_iqd??amountToSettle)+'. بڕی ماوە: '+fmt(result?.outstanding_iqd??Math.max(0,outstanding-amountToSettle))+'.');
      setSettlementAmounts(current=>({...current,[captainId]:''}));
      setSettlementNotes(current=>({...current,[captainId]:''}));
      await refresh();
    } catch(e) { setError(e instanceof Error?e.message:'تۆمارکردنی گەڕاندنەوەی کاش سەرکەوتوو نەبوو.'); }
    finally { setBusyId(null); }
  };

  const review = async (row:Topup,action:'approve'|'reject') => {
    setBusyId(row.id); setError(null); setMessage(null);
    try {
      const {error:rpcError} = await supabase.rpc('review_prepaid_topup',{p_request_id:row.id,p_action:action,p_admin_note:adminNotes[row.id]?.trim()||null});
      if(rpcError) throw rpcError;
      setMessage(action==='approve'?'داواکاری پەسەندکرا و باڵانس زیادکرا.':'داواکاری ڕەتکرایەوە؛ باڵانس زیاد نەکرا.');
      await refresh();
    } catch(e) { setError(e instanceof Error?e.message:'پشکنین سەرکەوتوو نەبوو.'); }
    finally { setBusyId(null); }
  };

  const todayBaghdad = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baghdad'}).format(new Date());
  const todayEarnings = dailyEarnings.filter(item=>item.earning_day===todayBaghdad && (item.captain_id===user?.id || canManage)).reduce((sum,item)=>sum+Number(item.net_earning_iqd),0);
  const ownOutstanding = cashBalances.find(row=>row.captain_id===user?.id)?.outstanding_iqd ?? 0;
  const outstandingByCaptain = cashBalances.filter(row=>row.outstanding_iqd>0).sort((a,b)=>Number(b.outstanding_iqd)-Number(a.outstanding_iqd));

  return <section className="shakh-page space-y-5 py-6" dir="rtl">
    <header className="rounded-[28px] bg-[var(--shakh-navy)] p-5 text-white sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="text-xs font-black text-[var(--shakh-orange)]">SHAKH · WALLET</div><h1 className="mt-1 text-2xl font-black sm:text-3xl">جزدانی پریپەید</h1><p className="mt-2 text-sm leading-6 text-white/65">١ خاڵ = ١ دیناری عێراقی. بڕی پارە تەنها دوای پشکنین و پەسەندکردنی وەسڵ زیاد دەکرێت.</p></div><button onClick={()=>void refresh()} disabled={busy||!!busyId} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-black"><RefreshCw size={15}/> نوێکردنەوە</button></div>
    </header>
    {error&&<div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm font-bold text-red-700"><CircleAlert className="me-2 inline" size={16}/>{error}</div>}
    {message&&<div role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-800">{message}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Stat label="باڵانسی بەردەست" value={fmt(account?.balance_iqd??0)} icon={<Wallet size={18}/>}/>
      <Stat label="باڵانسی گیراو" value={fmt(account?.held_iqd??0)} icon={<Banknote size={18}/>}/>
      <Stat label="کۆی پارەی زیادکراو" value={fmt(account?.lifetime_credited_iqd??0)} icon={<BadgeCheck size={18}/>}/>
      <Stat label="کۆی خەرجکراو" value={fmt(account?.lifetime_spent_iqd??0)} icon={<Banknote size={18}/>}/>
      <Stat label="قازانجی ئەمڕۆی کاپتن" value={fmt(todayEarnings)} icon={<BadgeCheck size={18}/>}/>
      <Stat label="کاشی ماوەی کاپتن" value={fmt(ownOutstanding)} icon={<Banknote size={18}/>}/>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 sm:p-6">
        <h2 className="text-lg font-black">قازانجی ڕۆژانەی کاپتن</h2>
        <p className="mt-1 text-xs leading-5 text-black/45">قازانج بە کرێی گەیاندن منهای کۆمسیۆنی ٢٠٪ حساب دەکرێت. کۆمسیۆن لە جزدانی پریپەید کەم دەکرێتەوە.</p>
        <div className="mt-4 space-y-2">
          {dailyEarnings.filter(item=>item.captain_id===user?.id || canManage).map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--shakh-bg)] p-3"><div><div className="text-xs font-mono text-black/45" dir="ltr">{item.order_id}</div><div className="mt-1 text-xs text-black/45">{item.earning_day} · کرێ: {fmt(item.delivery_fee_iqd)} · کۆمسیۆن: {fmt(item.commission_iqd)}</div></div><strong className="text-emerald-700">{fmt(item.net_earning_iqd)}</strong></div>)}
          {!dailyEarnings.some(item=>item.captain_id===user?.id || canManage) && <Empty text="هێشتا قازانجی گەیاندن تۆمار نەکراوە."/>}
        </div>
      </section>
      <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 sm:p-6">
        <h2 className="text-lg font-black">حسابی کاشی گەیاندن</h2>
        <p className="mt-1 text-xs leading-5 text-black/45">پارەی وەرگیراو، بڕی گەڕێندراوە و بڕی ماوە بە تۆماری جێگیر دەپارێزرێن. گەڕاندنەوەی بەشێک، تەنها هەمان بڕ کەم دەکاتەوە.</p>
        <div className="mt-4 space-y-2">
          {cashLedger.filter(row=>row.captain_id===user?.id || canManage).map(row=>{
            const outstanding=Math.max(0,Number(row.cash_collected_iqd)-Number(row.cash_remitted_iqd));
            const captain=captainProfiles[row.captain_id];
            return <article key={row.id} className="rounded-xl bg-[var(--shakh-bg)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><div className="text-xs font-mono text-black/40" dir="ltr">{row.order_id}</div><div className="mt-1 text-sm font-bold">{captain?.full_name??(canManage?row.captain_id:'ئۆردەری گەیاندن')}</div><div className="mt-1 text-xs text-black/45">{date(row.collected_at)}</div></div>
                <div className="text-end"><div className="text-sm font-black">وەرگیراو: {fmt(row.cash_collected_iqd)}</div><div className="mt-1 text-xs text-black/45">گەڕێندراوە: {fmt(row.cash_remitted_iqd)}</div><div className={'mt-1 text-sm font-black '+(outstanding?'text-amber-700':'text-emerald-700')}>ماوە: {fmt(outstanding)}</div></div>
              </div>
            </article>;
          })}
          {!cashLedger.some(row=>row.captain_id===user?.id || canManage) && <Empty text="هێشتا مامەڵەی کاش تۆمار نەکراوە."/>}
        </div>
      </section>
    </div>
    {canManage && <section className="rounded-[26px] border border-[var(--shakh-orange)]/20 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-black">پێدانەوەی کاشی کاپتن · سوپەر ئەدمین</h2>
      <p className="mt-1 text-xs leading-5 text-black/45">تەنها کاتێک کاش لە کاپتن وەرگیرا، بڕەکە تۆمار بکە. سیستەم بڕەکە بە ڕیز لە کۆنترین کاشە ماوەکان کەم دەکاتەوە و مێژووی مامەڵەکە دەپارێزێت.</p>
      <div className="mt-4 space-y-3">
        {outstandingByCaptain.map(row=><article key={row.captain_id} className="rounded-2xl border border-black/[0.07] p-4">
          <div className="font-black">{captainProfiles[row.captain_id]?.full_name??'کاپتن'} <span className="ms-2 text-xs font-normal text-black/45" dir="ltr">{captainProfiles[row.captain_id]?.phone??row.captain_id}</span></div>
          <div className="mt-1 text-sm">کاشی ماوە: <strong>{fmt(row.outstanding_iqd)}</strong></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="block text-xs font-black">بڕی گەڕاندنەوە (د.ع)
              <input type="number" min="1" max={row.outstanding_iqd} step="1" value={settlementAmounts[row.captain_id]??String(row.outstanding_iqd)} onChange={e=>setSettlementAmounts(values=>({...values,[row.captain_id]:e.target.value}))} className="mt-1 w-full rounded-xl border border-black/10 p-3 text-sm font-normal"/>
            </label>
            <label className="block text-xs font-black">تێبینی (ئارەزوومەندانە)
              <input maxLength={1000} value={settlementNotes[row.captain_id]??''} onChange={e=>setSettlementNotes(values=>({...values,[row.captain_id]:e.target.value}))} className="mt-1 w-full rounded-xl border border-black/10 p-3 text-sm font-normal" placeholder="ژمارەی وەسڵ یان تێبینی"/>
            </label>
          </div>
          <button type="button" disabled={busyId===row.captain_id} onClick={()=>void settleCash(row.captain_id,Number(row.outstanding_iqd))} className="mt-3 min-h-10 rounded-xl bg-[var(--shakh-navy)] px-4 text-xs font-black text-white disabled:opacity-40">{busyId===row.captain_id?'تۆمارکردن...':'تۆمارکردنی وەرگرتنی کاش'}</button>
        </article>)}
        {!outstandingByCaptain.length && <Empty text="هیچ کاشێکی ماوە لای کاپتن نییە."/>}
      </div>
    </section>}
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 sm:p-6"><h2 className="text-lg font-black">داوای زیادکردنی باڵانس</h2><p className="mt-1 text-xs leading-5 text-black/45">وەسڵ باربکە و بڕەکە بنووسە. بەڵگەکە لە هەژماری تایبەتی خۆتدا هەڵدەگیرێت؛ داواکاریی نوێ تا دیاریکردنی دۆخی داواکاریی پێشوو ناتوانرێت بنێردرێت.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm font-black">بڕی پارە (د.ع)<input required type="number" min="1000" max="100000000" step="1" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 p-3 text-sm font-normal"/></label>
          <label className="block text-sm font-black">ڕێگای پارەدان<select value={method} onChange={e=>setMethod(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-normal">{Object.entries(methods).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label className="block text-sm font-black">وەسڵی پارەدان (JPG، PNG، WebP، PDF · تا ٥MB)<input id="wallet-receipt" required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setReceipt(e.target.files?.[0]??null)} className="mt-1 block w-full rounded-xl border border-black/10 p-3 text-sm font-normal"/></label>
          <label className="block text-sm font-black">ژمارەی مامەڵە (ئارەزوومەندانە)<input maxLength={200} value={reference} onChange={e=>setReference(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 p-3 text-sm font-normal"/></label>
          <label className="block text-sm font-black">تێبینی<textarea maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 p-3 text-sm font-normal"/></label>
          <button disabled={busy} className="min-h-12 w-full rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy?'ناردن...':'ناردنی داواکاری'}</button>
        </form>
      </section>
      <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 sm:p-6"><h2 className="text-lg font-black">مێژووی مامەڵەکان</h2><div className="mt-4 space-y-2">{transactions.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--shakh-bg)] p-3"><div><div className="text-sm font-bold">{t.description_ku||t.transaction_type}</div><div className="mt-1 text-[11px] text-black/40">{date(t.created_at)}</div></div><strong className="tabular-nums">{fmt(t.amount_iqd)}</strong></div>)}{!transactions.length&&<Empty text="هێشتا مامەڵەیەک نییە." />}</div></section>
    </div>
    <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 sm:p-6"><h2 className="text-lg font-black">داواکارییەکانی زیادکردن</h2><div className="mt-4 space-y-3">{requests.map(r=><article key={r.id} className="rounded-2xl border border-black/[0.07] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-lg font-black">{fmt(r.amount_iqd)}</div><div className="mt-1 text-xs text-black/45">{methods[r.payment_method]??r.payment_method} · {date(r.requested_at)}</div>{canManage&&<div className="mt-1 break-all text-[11px] text-black/45">{r.user_id}</div>}</div><span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-black">{r.status==='pending'?'چاوەڕوان':r.status==='approved'?'پەسەندکرا':'ڕەتکراوە'}</span></div>{r.sender_reference&&<p className="mt-2 text-xs">ژمارەی مامەڵە: {r.sender_reference}</p>}{r.note&&<p className="mt-1 text-xs text-black/50">{r.note}</p>}
      <button type="button" onClick={async()=>{const {data,error:e}=await supabase.storage.from('wallet-payment-receipts').createSignedUrl(r.receipt_path,60);if(e) setError(e.message);else if(data?.signedUrl) window.open(data.signedUrl,'_blank','noopener,noreferrer')}} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs font-black"><FileImage size={15}/> بینینی وەسڵ (٦٠ چرکە)</button>
      {canManage&&r.status==='pending'&&<><textarea value={adminNotes[r.id]??''} onChange={e=>setAdminNotes(s=>({...s,[r.id]:e.target.value}))} maxLength={2000} placeholder="تێبینی ئەدمین" className="mt-3 w-full rounded-xl border border-black/10 p-3 text-sm"/><div className="mt-3 flex gap-2"><button type="button" disabled={busyId===r.id} onClick={()=>void review(r,'approve')} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black text-white">پەسەندکردن و زیادکردنی باڵانس</button><button type="button" disabled={busyId===r.id} onClick={()=>void review(r,'reject')} className="rounded-xl border border-red-500/20 px-4 py-2 text-xs font-black text-red-700">ڕەتکردنەوە</button></div></>}</article>)}{!requests.length&&<Empty text="داواکارییەک نییە." />}</div></section>
  </section>;
}
function Stat({label,value,icon}:{label:string;value:string;icon:React.ReactNode}){return <div className="rounded-2xl border border-black/[0.06] bg-white p-4"><div className="flex items-center gap-2 text-xs font-black text-black/45">{icon}{label}</div><div className="mt-2 text-xl font-black text-[var(--shakh-navy)]">{value}</div></div>}
function Empty({text}:{text:string}){return <div className="rounded-xl border border-dashed border-black/10 p-5 text-center text-sm font-bold text-black/40">{text}</div>}
