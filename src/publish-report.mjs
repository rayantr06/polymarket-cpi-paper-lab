// Publish only the two generated reports to this dedicated repository's results branch.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const git=(args,input)=>{const r=spawnSync('git',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});if(r.status!==0)throw Error('Git report operation failed: '+args[0]+' '+r.stderr);return r.stdout.trim();};
if(process.env.GITHUB_REPOSITORY!=='rayantr06/polymarket-cpi-paper-lab')throw Error('Wrong destination for public reports');
git(['config','user.name','github-actions[bot]']);git(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
const exists=git(['ls-remote','--heads','origin','results']);let parent=null;
if(exists){git(['fetch','--no-tags','origin','refs/heads/results']);parent=git(['rev-parse','FETCH_HEAD']);}
const files=['bilan.md','bilan.json','preuves.json'],entries=files.map(name=>{const blob=git(['hash-object','-w','--stdin'],readFileSync('checkpoint/reports/'+name));return`100644 blob ${blob}\t${name}`;});
const tree=git(['mktree'],entries.join('\n')+'\n'),commit=git(['commit-tree',tree,...(parent?['-p',parent]:[])],`Update paper test report for run ${process.env.GITHUB_RUN_ID}\n`);
git(['push','origin',commit+':refs/heads/results']);console.log('Public report saved to results branch',commit);
