import {readFileSync,existsSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {openStore} from './store.mjs';
import {publicReads} from './network.mjs';
import {CPITest,manifestFor} from './engine.mjs';
import {report} from './report.mjs';
const policy=JSON.parse(readFileSync('policy.json')),seed=JSON.parse(readFileSync('seed.json')),args=process.argv.slice(2),init=args.includes('--init'),boot=args.includes('--boot'),minutes=Number(args.includes('--minutes')?args[args.indexOf('--minutes')+1]:270);
if(!Number.isFinite(minutes)||minutes<1||minutes>270)throw Error('Session must be between 1 and 270 minutes');
if(process.env.GITHUB_REPOSITORY!==policy.repository)throw Error('This CPI campaign only runs in its dedicated GitHub repository');
if(!init&&!existsSync('checkpoint/cpi.sqlite'))throw Error('Missing checkpoint, refusing reset');
const clock=()=>performance.timeOrigin+performance.now(),store=openStore('checkpoint/cpi.sqlite',clock),emit=()=>report(store,policy,'checkpoint/reports',clock());
try{manifestFor(store,policy,seed,{init,now:clock(),runId:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA});const engine=new CPITest({store,policy,seed,clock,fetcher:publicReads(store,policy,{clock})});emit();console.log('Fixed CPI campaign',JSON.stringify(store.memory('manifest')));await engine.run({minutes,boot,onReport:emit});}
catch(e){store.add('fatal:'+clock(),'error',{stage:'fatal',message:String(e),at:clock()});emit();throw e;}
finally{store.close();}
