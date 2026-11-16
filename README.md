# Test virtuel du CPI mensuel américain

La prochaine publication du BLS, qui porte sur **novembre 2026**, est prévue le **10 décembre à 13 h 30 UTC, soit 5 h 30 à Vancouver**. GitHub Actions est programmé à **12 h 43 UTC, soit 4 h 43 à Vancouver**, pour démarrer avant l’annonce. [Calendrier BLS](https://www.bls.gov/schedule/news_release/cpi.htm) · [Workflow](../../actions/workflows/cpi.yml)

## Mesures

- Le signal part à la première réception complète du chiffre mensuel CPI-U désaisonnalisé, après l’heure prévue et avec l’accord du tableau A et du communiqué. Le chiffre annuel est facultatif. Les résultats sont associés aux [dix issues du marché Polymarket](https://polymarket.com/event/november-inflation-us-monthly).
- Les carnets des dix issues Oui sont relevés par lots à **−10, 0, +1, +5, +15, +30, +60 et +120 secondes** autour de l’heure prévue. Chaque relevé conserve les vingt meilleurs niveaux disponibles par côté, les horodatages et les erreurs. La capture suit cette horloge même lorsque le BLS est indisponible ou que son communiqué est rejeté.
- Après réception du chiffre confirmé, trois scénarios indépendants à **1, 5 et 15 secondes** essaient une entrée avec **50 pUSD virtuels chacun**. Ils utilisent un carnet WebSocket reçu après le signal, limitent la taille à la profondeur disponible, achètent au prix vendeur et déduisent les frais taker ainsi qu’une provision de 0,02 pUSD par entrée. Le prix vendeur intègre le spread. Un retard de plus de trois secondes sur le délai demandé ou un carnet inexploitable donne lieu à une abstention consignée.
- La marge calculée suppose le paiement de l’issue sélectionnée. Le net simulé est calculé après vérification du paiement auprès de deux RPC Polygon au même bloc. Il reste inconnu si le paiement est indisponible après six heures. Les scénarios de délai sont des alternatives.

## Exécution et rapports

La campagne est bornée à la fenêtre d’initialisation du 10 décembre, de 11 h 30 à 13 h 15 UTC. Le runner Linux public enchaîne des sessions de 270 minutes maximum dans le même run GitHub, avec une mémoire SQLite liée à sa révision, à sa politique et à ses marchés. Les pushes sur `main` exécutent les tests et un précontrôle en lecture seule.

Le run publiera `bilan.md`, `bilan.json` et `preuves.json` sur [la branche de résultats de décembre](../../tree/results-cpi-20261210-v2). L’artefact final est conservé 14 jours si son export réussit. [Rapport du 10 novembre](../../blob/results/bilan.md)

En cas de panne, examiner les jobs et leurs journaux puis reprendre la mémoire du même run. La mémoire absente ou d’une autre révision bloque la reprise. Les captures manquées restent visibles comme telles.

Pour vérifier le code, lancer `node --test test/*.test.mjs` avec Node 24. Les entrées et les règlements sont simulés à partir de données publiques.
