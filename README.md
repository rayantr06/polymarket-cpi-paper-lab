# CPI paper lab

Test prospectif unique, entièrement virtuel, sur la publication CPI d’octobre 2026 prévue le **10 novembre 2026 à 13:30 UTC / 05:30 Los Angeles**. Dépôt dédié ; aucun fichier, workflow, secret ou base des autres pilotes n’est utilisé. Aucun portefeuille, signature, authentification de trading ou envoi d’ordre.

[Bilan courant](../../tree/results) — [rapport lisible](../../blob/results/bilan.md) — [workflow](../../actions/workflows/cpi.yml).

## Protocole gelé avant publication

- Source officielle : [communiqué BLS](https://www.bls.gov/news.release/cpi.nr0.htm), calendrier BLS vérifié au lancement. Lecture du titre, mois, date d’embargo, mensuel CPI-U désaisonnalisé et annuel non désaisonnalisé, puis accord obligatoire avec les colonnes étiquetées de Table A. Une page ancienne, ambiguë ou contradictoire ne déclenche aucune entrée.
- Deux familles Polymarket identifiées dans `seed.json` : inflation mensuelle et annuelle d’octobre 2026. Les 21 issues forment des partitions exhaustives à un chiffre après la virgule. Règles, tokens, conditions et version sont gelés ; les frais et l’état ouvert/fermé sont relus au moment de chaque décision.
- Première réception complète valide du communiqué **à partir de 13:30 UTC**. Son horodatage est celui du corps intégral reçu par notre runner, pas l’en-tête HTTP, la date RSS ou une connaissance rétroactive. La différence avec l’heure prévue inclut un éventuel retard de publication BLS inconnu.
- Trois scénarios alternatifs après **1, 5 et 15 secondes** de cette réception. Déclenchements concurrents ; la lenteur du premier n’est pas ajoutée au suivant. Requêtes REST puis nouveau carnet complet WebSocket. Dépassement de plus de 3 s du délai demandé, carnet absent/fermé/incohérent, ou marge conditionnelle non positive : abstention conservée.
- **100 pUSD fictifs par scénario**, 50 mensuel + 50 annuel ; pas de réallocation. Entrée taker sur les vendeurs réellement visibles, avec profondeur et taille minimale en parts. `fee = parts × rate × prix × (1−prix)`, arrondi conservateur par niveau ; frais relus et réserve supplémentaire **0,02 pUSD/entrée**. Spread compris dans le prix vendeur, jamais déduit deux fois. Sensibilité à un tick moins bon seulement si tick vérifiable. Les gains des trois scénarios ne s’additionnent pas.
- Aucun prix prélevé avant le signal n’est recyclé en prix exécutable après le signal. Reprise trop tardive : abstention. Ancien timestamp d’édition du carnet et timestamp de réception fraîche restent distincts. Les deux familles sont corrélées : **un seul épisode économique**, pas six observations indépendantes.
- La marge `parts − coût total` est **conditionnelle** au paiement du Yes identifié. Le résultat final est simulé seulement après paiement CTF recoupé auprès de Tenderly et dRPC au même bloc Polygon. Les divergences avec le communiqué restent des pertes/mismatches, jamais réécrites. Résolution inconnue au bout de six heures : net inconnu. Pas de récompenses présumées.

## Exécution autonome gratuite

Déclenchement manuel unique de `cpi.yml` sur runner Linux standard d’un dépôt public. Le workflow attend sur GitHub et enchaîne au maximum six sessions de 270 minutes (<6 h/job). Aucun cron GitHub à la seconde de publication. Les frontières de session évitent la fenêtre critique. Même run, politique, commit, fenêtre et SQLite à chaque reprise ; cache dédié borné à 20 Mio, pas d’achat de calcul/stockage. Rapport et preuves publiés après chaque session sur `results`, journal final compressé facultatif (rétention 2 jours). Un budget de requêtes et une liste de destinations publiques limitent le programme.

Une première sauvegarde et un rapport de précontrôle sont publiés avant la longue attente. Pas de réinitialisation silencieuse, pas de nouveau lancement si les résultats d’une campagne existent et que sa mémoire manque. Le PC peut être éteint. Ce workflow publie le rapport sur GitHub ; il n’envoie pas de message automatique dans un chat.

En cas de panne, consulter les jobs et les logs du **même run**, restaurer le dernier cache et vérifier `manifest.sourceRun`, `codeCommit` et les hashes avant toute reprise. Ne pas lancer une seconde campagne pour remplacer des prix manqués. Un prix manqué demeure manqué.

## Vérifications

Node 24 sans dépendances tierces : `node --test test/*.test.mjs`. Tests du parseur, des périodes/ajustements, des identités, de la causalité des carnets, des coûts, de la reprise et des règlements. Les tests fabriqués servent à vérifier le programme ; ils ne constituent pas un backtest rentable.

Même une opportunité positive sur cet événement ne prouvera pas un avantage durable : concurrence, carnet non réservé, course d’ordres, disponibilité du runner et révisions restent à mesurer sur d’autres publications.
