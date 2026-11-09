import {RPCS} from './adapters.mjs';
export function publicReads(store,policy,{transport=fetch,clock=Date.now}={}){
 return async(input,options={})=>{
  const u=new URL(input),method=options.method??'GET';
  const read=method==='GET'&&((u.origin==='https://www.bls.gov'&&['/news.release/cpi.nr0.htm','/schedule/news_release/cpi.htm'].includes(u.pathname))||(u.origin==='https://clob.polymarket.com'&&['/book','/time'].includes(u.pathname))||(u.origin==='https://gamma-api.polymarket.com'&&u.pathname.startsWith('/markets/slug/')));
  const rpc=method==='POST'&&RPCS.includes(u.origin)&&['eth_blockNumber','eth_getBlockByNumber','eth_call'].includes(JSON.parse(options.body??'{}').method);
  if(!read&&!rpc)throw Error('Network destination or method not allowed');
  const n=(store.memory('requests')??0)+1;store.memory('requests',n);if(n>policy.maxRequests||store.size()>policy.maxDatabaseBytes)throw Error('Resource cap reached');
  const start=clock(),timeout=AbortSignal.timeout(policy.networkTimeoutMs),signal=options.signal?AbortSignal.any([timeout,options.signal]):timeout;
  const r=await transport(u,{...options,signal,redirect:'error',headers:{'user-agent':'Mozilla/5.0 CPI-Paper-Lab/1.0 (public read-only research)','accept':'application/json,text/html;q=0.9,*/*;q=0.8',...(u.origin==='https://www.bls.gov'?{'cache-control':'no-cache'}:{}),...options.headers}});
  // Read the body inside the timeout; do not timestamp headers as a received release.
  const reader=r.body?.getReader();const chunks=[];let length=0;if(reader){for(;;){const{done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>policy.maxResponseBytes){await reader.cancel();throw Error('Response too large');}chunks.push(value);}}
  const response=new Response(Buffer.concat(chunks),{status:r.status,statusText:r.statusText,headers:r.headers});
  const receipt=clock();store.add('request:'+n,'request',{url:u.href,method,start,receivedAt:receipt,status:r.status,bytes:length,date:r.headers.get('date'),age:r.headers.get('age'),etag:r.headers.get('etag')});
  Object.defineProperty(response,'receivedAt',{value:receipt});return response;
 };
}
