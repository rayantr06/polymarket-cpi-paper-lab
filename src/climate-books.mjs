export async function exchangeClock(fetcher=fetch, rawClock=Date.now) {
  const samples=[];
  for(let i=0;i<5;i++) {
    const start=rawClock(),r=await fetcher('https://clob.polymarket.com/time',{signal:AbortSignal.timeout(5000)}),seconds=await r.json(),end=rawClock();
    if(!r.ok||!Number.isSafeInteger(seconds)) throw Error('Heure publique de la bourse invalide.');
    samples.push({start,end,seconds,low:seconds*1000-end,high:(seconds+1)*1000-start});
  }
  const low=Math.max(...samples.map(s=>s.low)),high=Math.min(...samples.map(s=>s.high));
  if(high<low||high-low>2000||Math.abs(low)>60000||Math.abs(high)>60000) throw Error('Horloges incompatibles.');
  const offsetMs=(low+high)/2;
  return {samples,offsetMs,uncertaintyMs:(high-low)/2,clock:()=>rawClock()+offsetMs};
}

export function applyBookEvent(states,event,receivedAt) {
  if(event.event_type==='book') {
    const s=states.get(event.asset_id);if(!s||s.condition!==event.market) return;
    if(!Array.isArray(event.asks)||!Array.isArray(event.bids)||!Number.isFinite(Number(event.timestamp))) return;
    s.asks=event.asks;s.bids=event.bids;s.exchangeStateTimestamp=Number(event.timestamp);s.receivedAt=receivedAt;s.hash=event.hash;
    // For this explicit adapter, freshness dates the newly served complete stream
    // state, not its last modification. Never relabel the exchange's timestamp.
    s.timestamp=receivedAt;s.transportRevalidationAt=receivedAt;
    s.timestampMeaning='Measured UTC receipt of a new public stream snapshot; original exchange time is exchangeStateTimestamp';
    s.streamInitialized=true;s.streamInvalid=false;return;
  }
  if(event.event_type!=='price_change'||!Array.isArray(event.price_changes)) return;
  const touched=new Map();
  for(const change of event.price_changes) {
    const s=states.get(change.asset_id);if(!s||!s.streamInitialized||s.streamInvalid||s.condition!==event.market) continue;
    if(!Number.isFinite(Number(event.timestamp))||Number(event.timestamp)<s.exchangeStateTimestamp) {s.streamInvalid=true;continue;}
    const price=Number(change.price),size=Number(change.size);
    if(!['BUY','SELL'].includes(change.side)||!Number.isFinite(price)||price<=0||price>=1||!Number.isFinite(size)||size<0) {s.streamInvalid=true;continue;}
    const side=change.side==='BUY'?'bids':'asks';
    s[side]=s[side].filter(level=>Number(level.price)!==price);
    if(size>0)s[side].push({price:String(change.price),size:String(change.size)});
    s.exchangeStateTimestamp=Number(event.timestamp);s.timestamp=receivedAt;s.transportRevalidationAt=receivedAt;s.receivedAt=receivedAt;s.hash=change.hash;s.streamUpdated=true;touched.set(change.asset_id,change);
  }
  for(const [id,change] of touched) {
    const s=states.get(id),bid=Math.max(...s.bids.map(l=>Number(l.price))),ask=Math.min(...s.asks.map(l=>Number(l.price)));
    if((change.best_bid!==undefined&&Math.abs(bid-Number(change.best_bid))>1e-8)||(change.best_ask!==undefined&&Math.abs(ask-Number(change.best_ask))>1e-8))s.streamInvalid=true;
  }
}

