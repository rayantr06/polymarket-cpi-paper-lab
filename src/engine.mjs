import {parseRelease,isTarget,buckets,identity,selectWinner,quoteAfterRelease,clean} from './cpi-rules.mjs';
import {hash} from './store.mjs';
import {freshBasket,payout} from './adapters.mjs';
import {exchangeClock} from './climate-books.mjs';
export const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
export function manifestFor(store,policy,seed,{init=false,now=Date.now(),runId,commit}={}){
 const old=store.memory('manifest');
 if(old){if(old.policyHash!==hash(policy)||old.seedHash!==hash(seed)||old.sourceRun!==runId||old.codeCommit!==commit)throw Error('Checkpoint provenance mismatch; no new campaign created');return old;}
 if(!init||now>=policy.initializeBefore||!runId||!commit)throw Error('Missing checkpoint or initialization deadline passed');
 seed.events.forEach(e=>buckets(e,policy));const manifest={campaign:policy.id,sourceRun:runId,codeCommit:commit,policyHash:hash(policy),seedHash:hash(seed),createdAt:now,releaseAt:policy.releaseAt,endAt:policy.releaseAt+policy.settlementWaitMs};store.memory('manifest',manifest);return manifest;
}
export function sessionEnd(now,minutes,releaseAt){let end=now+minutes*60000;if(end>=releaseAt-600000&&end<=releaseAt+1800000)end=releaseAt-900000;return Math.max(now+1000,end);}
export class CPITest{
 constructor({store,policy,seed,fetcher,clock=Date.now,wait=sleep,books=freshBasket,resolve=payout}){Object.assign(this,{store,policy,seed,fetcher,clock,wait,books,resolve});}
 error(stage,e){this.store.add('error:'+stage+':'+hash([this.clock(),String(e)]),'error',{stage,message:String(e),at:this.clock()});}
 async auditClock(){const c=await exchangeClock(this.fetcher,this.clock);const audit={...c,clock:undefined,at:this.clock()};this.store.add('clock:'+hash(audit),'clock',audit);if(Math.abs(c.offsetMs)+c.uncertaintyMs>2000)throw Error('Clock error exceeds two seconds');return audit;}
 async preflight(){
  await this.auditClock();const r=await this.fetcher(this.policy.calendarUrl),html=await r.text();if(!r.ok)throw Error('BLS calendar HTTP '+r.status);
  const rows=html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)??[];if(!rows.some(row=>{const t=clean(row);return t.includes('October 2026')&&t.includes('Nov. 10, 2026')&&t.includes('08:30 AM');}))throw Error('Official release calendar changed or unreadable');
  this.store.add('calendar:'+hash(html),'calendar',{receivedAt:r.receivedAt,html});
  await Promise.all(this.seed.events.map(async e=>{await Promise.all(e.markets.map(async m=>{const res=await this.fetcher('https://gamma-api.polymarket.com/markets/slug/'+m.slug),current=await res.json();if(!res.ok||identity(m)!==identity(current))throw Error('Frozen CPI market rules changed: '+m.slug);}));const market=e.markets[Math.floor(e.markets.length/2)];const b=await this.books([{market,outcome:'Yes'}],{fetcher:this.fetcher,clock:this.clock});if(!b.snapshots[0]?.streamInitialized||b.snapshots[0]?.streamInvalid)throw Error('No fresh public book for '+e.family);this.store.add('preflight-book:'+e.family+':'+this.clock(),'preflight-book',{family:e.family,...b});}));
  await this.source({requireParsable:true});this.store.memory('preflight',{at:this.clock(),ok:true});
 }
 async source({requireParsable=false}={}){
  const startedAt=this.clock(),r=await this.fetcher(this.policy.sourceUrl),html=await r.text(),receivedAt=r.receivedAt??this.clock(),bodyHash=hash(html);
  if(!r.ok)throw Error('BLS summary HTTP '+r.status);
  this.store.add('source:'+bodyHash,'source',{startedAt,receivedAt,bodyHash,html});
  let release;try{release=parseRelease(html);}catch(e){this.error('source-parser',e);if(requireParsable)throw e;return null;}
  this.store.add('source-read:'+startedAt,'source-read',{startedAt,receivedAt,bodyHash,release});
  if(!isTarget(release,this.policy))return null;
  if(receivedAt<this.policy.releaseAt){this.store.add('early:'+bodyHash,'early-release',{release,receivedAt,bodyHash});return null;}
  const first=this.store.get('signal');if(first){if(first.release.monthly!==release.monthly||first.release.annual!==release.annual)this.store.add('correction:'+bodyHash,'correction',{release,bodyHash,receivedAt});return first;}
  const targets=this.seed.events.map(event=>({family:event.family,market:selectWinner(event,release,this.policy)}));
  const signal={release,receivedAt,startedAt,bodyHash,targets,latencyFromScheduledMs:receivedAt-this.policy.releaseAt};this.store.add('signal','signal',signal);return this.store.get('signal');
 }
 async decisions(signal){
  await Promise.all(this.policy.delaysMs.flatMap(delayMs=>signal.targets.map(target=>this.decision(signal,target,delayMs))));
 }
 async decision(signal,target,delayMs){
  const id='decision:'+delayMs+':'+target.family;if(this.store.get(id))return;
  const due=signal.receivedAt+delayMs;await this.wait(Math.max(0,due-this.clock()));
  if(this.clock()>due+this.policy.entryToleranceMs){this.store.add(id,'decision',{family:target.family,market:target.market,delayMs,due,at:this.clock(),action:'abstain',reason:'Delay missed on restart or scheduling; no replay'});return;}
  try{const book=await this.books([{market:target.market,outcome:'Yes'}],{fetcher:this.fetcher,clock:this.clock}),snapshot=book.snapshots[0],at=this.clock(),result=quoteAfterRelease({market:target.market,snapshot,signalAt:signal.receivedAt,due,now:at,policy:this.policy});this.store.add(id,'decision',{family:target.family,market:target.market,delayMs,due,at,book,...result});}
  catch(e){this.store.add(id,'decision',{family:target.family,market:target.market,delayMs,due,at:this.clock(),action:'abstain',reason:String(e)});}
 }
 async settlements(){for(const d of this.store.all('decision').filter(x=>x.action==='paper_buy')){const key='resolution:'+d.market.conditionId;if(this.store.get(key))continue;try{const result=await this.resolve(this.fetcher,d.market.conditionId,this.clock);if(result)this.store.add(key,'resolution',{condition:d.market.conditionId,at:this.clock(),...result});}catch(e){this.error('resolution',e);}}}
 async run({minutes=270,boot=false,onReport=()=>{}}={}){
  const p=this.policy,start=this.clock(),stop=sessionEnd(start,minutes,p.releaseAt),finalAt=p.releaseAt+p.settlementWaitMs;
  this.store.add('session:'+start,'session',{start,stop,boot});
  if(boot){await this.preflight();onReport();return;}
  if(!this.store.memory('preflight')?.ok)throw Error('No successful preflight checkpoint');
  await this.auditClock();
  let armed=this.store.memory('armed'),nextPayout=this.store.memory('nextPayout')??0,nextCheck=this.store.memory('nextSourceCheck')??0;
  while(this.clock()<stop&&this.clock()<finalAt){
   const now=this.clock();
   if(now<p.releaseAt-p.armLeadMs){onReport();await this.wait(Math.min(60000,stop-now,p.releaseAt-p.armLeadMs-now));continue;}
   if(!armed){await this.auditClock();armed={at:this.clock()};this.store.memory('armed',armed);console.log('Armed for official CPI receipt',new Date(p.releaseAt).toISOString());}
   let signal=this.store.get('signal');
   if(!signal&&now>=p.releaseAt-10000&&now<=p.releaseAt+p.maxSourceWaitMs&&now>=nextCheck){
    const before=this.clock();try{signal=await this.source();}catch(e){this.error('source-fetch',e);}
    // Start-to-start interval, without overlapping source requests.
    const interval=now<p.releaseAt+120000?1000:now<p.releaseAt+600000?5000:30000;nextCheck=before+interval;this.store.memory('nextSourceCheck',nextCheck);
   }
   if(signal){await this.decisions(signal);if(this.clock()>=nextPayout){await this.settlements();nextPayout=this.clock()+300000;this.store.memory('nextPayout',nextPayout);}
    // Preserve later official corrections; do not change first-receipt decisions.
    if(this.clock()>=nextCheck){try{await this.source();}catch(e){this.error('source-recheck',e);}nextCheck=this.clock()+300000;this.store.memory('nextSourceCheck',nextCheck);}
   }
   onReport();const completed=signal&&this.store.all('decision').length===6&&this.store.all('decision').filter(d=>d.action==='paper_buy').every(d=>this.store.get('resolution:'+d.market.conditionId));
   if(completed){this.store.memory('finished',{at:this.clock(),reason:'All delay scenarios recorded; any simulated holdings resolved'});break;}
   if(!signal&&this.clock()>p.releaseAt+p.maxSourceWaitMs){this.store.memory('finished',{at:this.clock(),reason:'Official target unavailable within 30 minutes; no entries'});break;}
   let pause=signal?30000:Math.max(20,Math.min(1000,nextCheck-this.clock()));if(this.clock()<p.releaseAt-10000&&!signal)pause=Math.min(10000,p.releaseAt-10000-this.clock());
   await this.wait(Math.max(20,Math.min(pause,stop-this.clock(),finalAt-this.clock())));
  }
  if(this.clock()>=finalAt&&!this.store.memory('finished'))this.store.memory('finished',{at:this.clock(),reason:'Six-hour settlement deadline reached; unresolved positions remain unknown'});
  onReport();this.store.checkpoint();
 }
}
