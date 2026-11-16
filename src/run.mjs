import {readFileSync,existsSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {openStore} from './store.mjs';
import {publicReads} from './network.mjs';
import {CPITest,manifestFor} from './engine.mjs';
import {report} from './report.mjs';
const policy=JSON.parse(readFileSync('policy.json')),seed=JSON.parse(readFileSync('seed.json')),args=process.argv.slice(2),init=args.includes('--init'),boot=args.includes('--boot'),verify=args.includes('--verify'),minutes=Number(args.includes('--minutes')?args[args.indexOf('--minutes')+1]:270);
if(!Number.isFinite(minutes)||minutes<1||minutes>270)throw Error('Session must be between 1 and 270 minutes');
if(process.env.GITHUB_REPOSITORY!==policy.repository)throw Error('This CPI campaign only runs in its dedicated GitHub repository');
if(!verify&&!init&&!existsSync('checkpoint/cpi.sqlite'))throw Error('Missing checkpoint, refusing reset');
const clock=()=>performance.timeOrigin+performance.now(),store=openStore(verify?'checkpoint/verification.sqlite':'checkpoint/cpi.sqlite',clock);
const emit=()=>report(store,policy,'checkpoint/reports',clock());
try{
 const engine=new CPITest({store,policy,seed,clock,fetcher:publicReads(store,policy,{clock})});
 if(verify){
  await engine.preflight();
  const books=await engine.observe(seed.events.flatMap(event=>event.markets),{fetcher:engine.fetcher,clock});
  if(books.snapshots.some(book=>book.error))throw Error('Some public market books could not be verified');
  console.log(JSON.stringify({verification:true,marketCount:books.snapshots.length,preflight:store.memory('preflight'),
   priorRelease:store.all('source-read').at(-1)?.release??null,errors:store.all('error')}));
 }else{
  manifestFor(store,policy,seed,{init,now:clock(),runId:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA});
  emit();
  console.log('Fixed CPI campaign',JSON.stringify(store.memory('manifest')));
  await engine.run({minutes,boot,onReport:emit});
 }
}
catch(e){if(!verify&&store.memory('manifest')){store.add('fatal:'+clock(),'error',{stage:'fatal',message:String(e),at:clock()});emit();}throw e;}
finally{store.close();}
