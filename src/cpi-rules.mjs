import {hash} from './store.mjs';
import {simulatePaper} from './paper.mjs';
export const clean=html=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&minus;|&#8722;|−/g,'-').replace(/\s+/g,' ').trim();
const tenth=value=>{if(!/^-?\d+\.\d$/.test(value))throw Error('CPI must be reported to exactly one decimal');return Math.round(Number(value)*10);};
function change(fragment){if(/^(?:was |remained )?unchanged\b/i.test(fragment))return 0;const m=fragment.match(/^(increased|rose|decreased|declined|fell) (\d+\.\d) percent\b/i);if(!m)throw Error('Unsupported BLS change wording');return tenth(m[2])*(/decreased|declined|fell/i.test(m[1])?-1:1);}
export function parseRelease(html){
 const title=clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]??''),period=title.match(/Consumer Price Index Summary\s*-\s*(\d{4}) M(\d{2}) Results/i);if(!period)throw Error('BLS CPI title or period absent');
 const text=clean(html),header=text.match(/CONSUMER PRICE INDEX\s*-\s*([A-Z]+)\s+(\d{4})\b/);if(!header||Number(header[2])!==Number(period[1]))throw Error('BLS reference heading absent');
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'],month=months[Number(period[2])-1];if(header[1].toLowerCase()!==month?.toLowerCase())throw Error('BLS heading/title period mismatch');
 const intro=text.match(/The Consumer Price Index for All Urban Consumers \(CPI-U\) ([\s\S]{1,300}?)the U\.S\. Bureau of Labor Statistics reported today\./i)?.[1];
 if(!intro||!intro.toLowerCase().includes('seasonally adjusted')||!intro.toLowerCase().includes('in '+month.toLowerCase()))throw Error('Monthly headline unavailable');
 const annualText=text.match(/Over the last 12 months, the all items index ([\s\S]{1,150}?) before seasonal adjustment\./i)?.[1];if(!annualText)throw Error('Unadjusted annual headline unavailable');
 const monthly=change(intro),annual=change(annualText);if(monthly< -100||monthly>100||annual< -500||annual>1000)throw Error('CPI parser range check failed');
 // Independently labelled columns of Table A must agree with the prose.
 const row=[...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(m=>m[0]).find(s=>/id=["']cpi_pressa\.r\.1["']/.test(s));
 const cells=[...(row??'').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>clean(m[1]));if(cells.length!==8)throw Error('Table A all-items row changed');
 const monthHeader=clean(html.match(/<th\b[^>]*id=["']cpi_pressa\.h\.2\.8["'][^>]*>([\s\S]*?)<\/th>/i)?.[1]??''),yearHeader=clean(html.match(/<th\b[^>]*id=["']cpi_pressa\.h\.1\.9["'][^>]*>([\s\S]*?)<\/th>/i)?.[1]??'');
 const short=month.slice(0,3);if(!monthHeader.startsWith(short)||!monthHeader.includes(period[1])||!yearHeader.startsWith('Un-')||!yearHeader.includes('12-mos.')||!yearHeader.includes(short)||!yearHeader.includes(period[1]))throw Error('Table A date or adjustment mismatch');
 if(tenth(cells[6])!==monthly||tenth(cells[7])!==annual)throw Error('BLS headline/Table A disagreement');
 const date=text.match(/embargoed until 8:30 a\.m\. \(ET\) [A-Za-z]+, ([A-Za-z]+) (\d{1,2}), (\d{4})/i);if(!date)throw Error('Release embargo date/time absent');
 const releaseDate=[date[3],String(months.indexOf(date[1])+1).padStart(2,'0'),date[2].padStart(2,'0')].join('-');
 return{year:Number(period[1]),month:Number(period[2]),monthName:month,monthly,annual,unit:'tenths of a percentage point',releaseDate,headlineTableAgreement:true};
}
export function isTarget(release,policy){return release.year===policy.referenceYear&&release.month===policy.referenceMonthNumber&&release.releaseDate===new Date(policy.releaseAt).toISOString().slice(0,10);}
export const identity=m=>hash([m.slug,m.conditionId,m.question,m.description,m.groupItemTitle,m.outcomes,m.clobTokenIds,m.version,m.negRisk]);
export function buckets(event,policy){
 const rows=event.markets.map(m=>{const label=m.groupItemTitle.match(/^(≤|≥)?(-?\d+\.\d)%$/);if(!label)throw Error('Unsupported CPI bucket label');const v=tenth(label[2]);let outcomes,tokens;try{outcomes=JSON.parse(m.outcomes);tokens=JSON.parse(m.clobTokenIds);}catch{throw Error('Invalid token metadata');}
 if(outcomes.join('|')!=='Yes|No'||tokens.length!==2||tokens.some(t=>!/^\d+$/.test(t))||m.version!=='v1'||!/^0x[\da-f]{64}$/i.test(m.conditionId)||!m.description.includes('October 2026')||!m.description.includes('November 10, 2026, at 8:30 AM ET')||!m.description.includes('bls.gov'))throw Error('Unreviewed CPI identity, source, date or version');
 return{market:m,min:label[1]==='≤'?-Infinity:v,max:label[1]==='≥'?Infinity:v};}).sort((a,b)=>a.min-b.min);
 if(rows[0]?.min!==-Infinity||rows.at(-1)?.max!==Infinity||rows.some((r,i)=>r.min>r.max||(i>0&&rows[i-1].max+1!==r.min)))throw Error('CPI buckets are not a complete disjoint partition');return rows;
}
export function selectWinner(event,release,policy){if(!isTarget(release,policy))throw Error('Not the target CPI publication');const value=release[event.family],hit=buckets(event,policy).filter(b=>value>=b.min&&value<=b.max);if(hit.length!==1)throw Error('CPI bucket unknown');return hit[0].market;}
export function quoteAfterRelease({market,snapshot,signalAt,due,now,policy}){
 const abstain=reason=>({action:'abstain',reason});
 if(!Number.isFinite(signalAt)||!Number.isFinite(due)||!Number.isFinite(now)||!Number.isFinite(snapshot?.requestedAt)||due<signalAt||snapshot.requestedAt<due||now>due+policy.entryToleranceMs)return abstain('Requested delay missed; no retrospective quote');
 if(!snapshot||snapshot.condition!==market.conditionId||snapshot.token!==JSON.parse(market.clobTokenIds)[0]||snapshot.outcome!=='Yes'||!snapshot.streamInitialized||snapshot.streamInvalid||!Number.isFinite(snapshot.receivedAt)||snapshot.receivedAt<due||snapshot.receivedAt>now||now-snapshot.receivedAt>policy.maximumBookReceiptAgeMs)return abstain('Fresh post-signal book identity or receipt unavailable');
 const bids=snapshot.bids?.map(l=>({p:Number(l.price),n:Number(l.size)}));if(!bids?.length||bids.some(l=>!(l.p>0&&l.p<1&&l.n>0&&Number.isFinite(l.n))))return abstain('Invalid bid depth');
 const bid=Math.max(...bids.map(l=>l.p)),ask=Math.min(...(snapshot.asks??[]).map(l=>Number(l.price)));if(!Number.isFinite(ask)||bid>ask)return abstain('Crossed or one-sided book');
 const execute=s=>simulatePaper({market:market.slug,outcome:'Yes',recordedAt:due,deadline:now+1000,probability:null}, {...s,minNotional:Number.EPSILON},{now,budget:policy.budgetPerFamily,maxPrice:.999999,extraCost:policy.extraCostPerEntry,unscoredShadow:true});
 let entry=execute(snapshot);if(entry.action==='paper_buy'&&entry.quantity-entry.totalCost<=0)entry=abstain('No positive conditional resolution margin after costs');
 const tick=Number(snapshot.tickSize),stressed=entry.action==='paper_buy'&&Number.isFinite(tick)&&tick>0?execute({...snapshot,asks:snapshot.asks.filter(l=>Number(l.price)+tick<1).map(l=>({...l,price:String(Number(l.price)+tick)}))}):null;
 return{...entry,spread:ask-bid,bestBid:bid,bestAsk:ask,actualDelayMs:snapshot.receivedAt-signalAt,decisionDelayMs:now-signalAt,conditionalMargin:entry.action==='paper_buy'?entry.quantity-entry.totalCost:null,oneTickWorseConditionalMargin:stressed?.action==='paper_buy'?stressed.quantity-stressed.totalCost:null,payoutAssumption:'Selected Yes matches the first observed official CPI; gain remains conditional until final on-chain resolution',liquidityReserved:false};
}
