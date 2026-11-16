import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {writeJson} from './store.mjs';
const date=n=>Number.isFinite(n)?new Date(n).toISOString():'—';
const amount=n=>Number.isFinite(n)?n.toFixed(4):'—';
export function report(store,policy,directory,now=Date.now()){
 const manifest=store.memory('manifest'),signal=store.get('signal'),decisions=store.all('decision'),resolutions=store.all('resolution'),finished=store.memory('finished');
 const rows=decisions.map(d=>{const resolution=resolutions.find(r=>r.condition===d.market.conditionId),net=d.action==='paper_buy'&&resolution?d.quantity*resolution.payouts[0]-d.totalCost:null;return{...d,netAtVerifiedResolution:net,resolution};});
 const families=policy.families;
 const scenarios=policy.delaysMs.map(delayMs=>{const entries=rows.filter(d=>d.delayMs===delayMs),buys=entries.filter(d=>d.action==='paper_buy'),complete=entries.length===families.length;return{delayMs,budget:families.length*policy.budgetPerFamily,recordedFamilies:entries.length,entries:buys.length,complete,cost:buys.reduce((s,d)=>s+d.totalCost,0),conditionalMargin:complete?buys.reduce((s,d)=>s+d.conditionalMargin,0):null,resolutionNet:complete&&buys.every(d=>Number.isFinite(d.netAtVerifiedResolution))?buys.reduce((s,d)=>s+d.netAtVerifiedResolution,0):null};});
 const diagnosticBooks=store.all('diagnostic-book').sort((a,b)=>a.offsetMs-b.offsetMs);
 const clocks=store.all('clock'),errors=store.all('error'),r={updatedAt:now,phase:finished?'finished':signal?'post-release':store.memory('preflight')?.ok?'waiting-for-release':'preflight',manifest,policy,preflight:store.memory('preflight'),armed:store.memory('armed'),finished,signal,scenarios,decisions:rows,sourceReads:store.all('source-read').map(({html,...x})=>x),corrections:store.all('correction'),earlyReleases:store.all('early-release'),clockAudits:clocks,errors,requests:store.memory('requests')??0,sessions:store.all('session'),databaseBytes:store.size(),limitations:['One monthly CPI release supplies one observation of execution after costs.','Snapshots do not reserve liquidity or prove a live order would fill. No real trades or gains.','Delays begin at full-body BLS receipt, not global publication; scheduled-time lag includes unknown publication lag.','A price from a fresh full WebSocket snapshot may have an older last-update exchange timestamp; both are retained.','Spread is already paid by entering at the asks; never subtract it a second time.','The three delay portfolios are alternatives; do not add their gains. ','Final resolution uses two public RPCs at the same Polygon block; unresolved positions have unknown net.','Public-runner availability, BLS availability, revisions and order races can invalidate execution.']};
 const sourceBodies=store.all('source').filter(source=>source.receivedAt>=policy.releaseAt).slice(0,4);
 r.diagnosticBooks=diagnosticBooks;
 mkdirSync(directory,{recursive:true});writeJson(join(directory,'bilan.json'),r);
 writeJson(join(directory,'preuves.json'),{manifest,source:signal?store.get('source:'+signal.bodyHash):null,sourceBodies,
  diagnosticBooks,decisions:rows,clockAudits:clocks,requests:store.all('request')});
 const releaseLabel=new Intl.DateTimeFormat('fr-CA',{timeZone:'America/Los_Angeles',
  dateStyle:'long',timeStyle:'short'}).format(policy.releaseAt);
 const lines=[
  '# Test virtuel du CPI mensuel',
  '',
  `Publication BLS prévue le ${releaseLabel}, heure du Pacifique. Référence ${policy.referenceMonth} ${policy.referenceYear}.`,
  `[Calendrier BLS](${policy.calendarUrl}) · [Exécution GitHub](https://github.com/${policy.repository}/actions/runs/${manifest.sourceRun}) · [Preuves](preuves.json)`,
  '',
  `État **${r.phase}** au ${date(now)}. Campagne \`${manifest.campaign}\` et révision \`${manifest.codeCommit}\`.`,
  '',
  '## Réception de la publication',
  '',
  signal
   ? `CPI mensuel vérifié dans le communiqué et le tableau A **${(signal.release.monthly/10).toFixed(1)} %**. Réception complète à ${date(signal.receivedAt)}, soit ${(signal.latencyFromScheduledMs/1000).toFixed(3)} s après l’heure prévue.`
   : 'Aucun chiffre mensuel cible validé à cette heure.',
  `Le journal contient ${r.sourceReads.length} lectures interprétées, ${errors.length} erreurs, ${r.corrections.length} corrections officielles et ${r.requests}/${policy.maxRequests} requêtes.`,
  '',
  '## Carnets observés à partir de l’heure prévue',
  '',
  '| Écart à l’annonce prévue (s) | Réception UTC | Carnets valides | État |',
  '| ---: | --- | ---: | --- |',
  ...diagnosticBooks.map(d=>`| ${d.offsetMs/1000} | ${date(d.receivedAt)} | ${d.snapshots?.filter(s=>!s.error).length??0} / ${d.snapshots?.length??'—'} | ${d.error?.replaceAll('|','/').replaceAll('\n',' ')??'reçu'} |`),
  '',
  'Les relevés de carnet partent à l’heure prévue même si la publication est absente ou rejetée. Les preuves donnent les heures d’envoi et de réception, les horodatages de l’exchange et les vingt meilleurs niveaux de chaque côté.',
  '',
  '## Décisions virtuelles après réception du chiffre',
  '',
  `Chaque délai dispose de ${policy.budgetPerFamily} pUSD virtuels par famille. Le prix vendeur intègre le spread. Les frais taker et la provision de ${policy.extraCostPerEntry} pUSD par entrée sont déduits.`,
  '',
  '| Délai (s) | Familles mesurées | Achats | Coût engagé | Marge conditionnelle | Net réglé |',
  '| ---: | ---: | ---: | ---: | ---: | ---: |',
  ...scenarios.map(s=>`| ${s.delayMs/1000} | ${s.recordedFamilies}/${families.length} | ${s.entries} | ${amount(s.cost)} | ${amount(s.conditionalMargin)} | ${amount(s.resolutionNet)} |`),
  '',
  '| Délai (s) | Décision | Délai réel du carnet (ms) | Meilleur vendeur | Spread | Frais | Motif ou marge |',
  '| ---: | --- | ---: | ---: | ---: | ---: | --- |',
  ...rows.map(d=>`| ${d.delayMs/1000} | ${d.action} | ${amount(d.actualDelayMs)} | ${amount(d.bestAsk)} | ${amount(d.spread)} | ${amount(d.fees)} | ${d.action==='paper_buy'?amount(d.conditionalMargin):d.reason?.replaceAll('|','/').replaceAll('\n',' ')??'—'} |`),
  '',
  'Les délais sont trois scénarios alternatifs. La marge conditionnelle suppose un paiement intégral du Oui choisi. Le net réglé repose sur deux RPC Polygon au même bloc. Les soldes et les positions sont simulés.',
  '',
  finished?`Fin de campagne — ${finished.reason}`:'Le bilan sera mis à jour avec les prochaines observations.',
  ''
 ];
 writeFileSync(join(directory,'bilan.md'),lines.join('\n'));
 return r;
}
