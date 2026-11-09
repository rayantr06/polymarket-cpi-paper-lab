import {fetchPaperSnapshot} from './paper.mjs';
import {applyBookEvent} from './climate-books.mjs';
import {hash} from './store.mjs';
export const RPCS=['https://polygon.gateway.tenderly.co','https://polygon.drpc.org'];
export async function rpc(fetcher,url,method,params){const r=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const b=await r.json();if(!r.ok||b.error||!Object.hasOwn(b,'result'))throw Error('Public RPC failed: '+method);return b.result;}
export async function freshBasket(legs,{fetcher=fetch,clock=Date.now}={}){
 const snapshots=await Promise.all(legs.map(l=>fetchPaperSnapshot({slug:l.market.slug,condition_id:l.market.conditionId,tokens:l.market.clobTokenIds,outcomes:l.market.outcomes},l.outcome,{fetcher:async(url,o)=>{const r=await fetcher(url,o);if(String(url).includes('gamma-api.polymarket.com/markets/slug/')&&r.ok){const m=await r.clone().json();if(hash(m.description)!==hash(l.market.description))throw Error('Rules changed during the quote');}return r;},clock,allowNegativeRisk:true}))),states=new Map(snapshots.map(s=>[s.token,s])),frames=[];
 await new Promise(resolve=>{let done=false;const ws=new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');const end=()=>{if(done)return;done=true;clearTimeout(timer);ws.close();resolve();};const timer=setTimeout(end,5000);ws.onopen=()=>ws.send(JSON.stringify({assets_ids:[...states.keys()],type:'market'}));ws.onerror=end;ws.onclose=end;ws.onmessage=msg=>{if(msg.data==='PONG')return;try{const body=JSON.parse(msg.data),receivedAt=clock();if(JSON.stringify(body).length>1000000)return end();frames.push({body,receivedAt});for(const e of Array.isArray(body)?body:[body])applyBookEvent(states,e,receivedAt);if([...states.values()].every(s=>s.streamInitialized))end();}catch{end();}};});
 for(const s of snapshots){if(!s.streamInitialized||s.streamInvalid)s.acceptingOrders=false;s.freshnessMeaning='Newly served full WebSocket state, measured UTC receipt, with clock error audited separately; original exchange timestamp retained';}
 return{snapshots,frames};
}
export async function payout(fetcher,condition,clock=Date.now){
 const heights=await Promise.all(RPCS.map(u=>rpc(fetcher,u,'eth_blockNumber',[]))),height=Math.min(...heights.map(h=>parseInt(h,16)))-2,tag='0x'+height.toString(16);
 if(height<1)throw Error('Invalid finality height');
 const proofs=await Promise.all(RPCS.map(async url=>{const block=await rpc(fetcher,url,'eth_getBlockByNumber',[tag,false]);const call=data=>rpc(fetcher,url,'eth_call',[{to:'0x4d97dcd97ec945f40cf65f87097ace5ea0476045',data},tag]);const [d,a,b]=await Promise.all([call('0xdd34de67'+condition.slice(2)),call('0x0504c814'+condition.slice(2)+'0'.repeat(64)),call('0x0504c814'+condition.slice(2)+'0'.repeat(63)+'1')]);return{url,blockHash:block?.hash,blockTimestamp:parseInt(block?.timestamp,16)*1000,denominator:BigInt(d).toString(),numerators:[BigInt(a).toString(),BigInt(b).toString()],receivedAt:clock()};}));
 const [a,b]=proofs;if(!a.blockHash||a.blockHash!==b.blockHash||a.denominator!==b.denominator||JSON.stringify(a.numerators)!==JSON.stringify(b.numerators))throw Error('Payout providers disagree at same height');
 const d=BigInt(a.denominator);if(d===0n)return null;if(a.numerators.reduce((n,v)=>n+BigInt(v),0n)!==d)throw Error('Invalid binary payout vector');
 return{height,payouts:a.numerators.map(n=>Number(n)/Number(d)),proofs};
}
export function bidExit(leg,s,now,extraCost){
 if(!s?.acceptingOrders||now-s.timestamp>5000||s.timestamp>now+1000||s.feeExponent!==1||leg.quantity<s.minShares)return{status:'unavailable'};
 let left=leg.quantity,gross=0,fees=0;for(const l of s.bids.map(x=>({price:Number(x.price),size:Number(x.size)})).sort((a,b)=>b.price-a.price)){if(!(l.price>0&&l.price<1&&l.size>0))return{status:'unavailable'};const n=Math.min(left,l.size);gross+=n*l.price;fees+=Math.ceil(n*s.feeRate*l.price*(1-l.price)*1e5-1e-9)/1e5;left-=n;if(left<1e-6)break;}return left>1e-6?{status:'unavailable'}:{status:'quoted',gross,fees,extraCost,proceeds:gross-fees-extraCost};
}
