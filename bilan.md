# Test virtuel CPI — 10 novembre 2026

État : **waiting-for-release**. Dernière mise à jour : 2026-11-10T03:46:12.484Z.

Publication prévue : **2026-11-10T13:30:00.000Z — 05 h 30 à Los Angeles**. Référence : octobre 2026.

[Source BLS](https://www.bls.gov/news.release/cpi.nr0.htm) · [Calendrier BLS](https://www.bls.gov/schedule/news_release/cpi.htm) · [Exécution GitHub](https://github.com/rayantr06/polymarket-cpi-paper-lab/actions/runs/42719004141) · [Preuves publiques](preuves.json)

Révision : 64c43eb17bbe371be8f0c76685ccdfbb34fcdd4d. Campagne fixe : cpi-20261110-v1. Aucun ordre réel. Autres pilotes indépendants.

## Réception et qualité

Précontrôle cloud : réussi à 2026-11-09T23:16:09.027Z. Réception complète du communiqué cible : —.
La page du mois précédent ne déclenche aucun signal. Aucun prix post-annonce observé pour le moment.
Lectures BLS interprétées : 1 ; erreurs consignées : 0 ; corrections après premier signal : 0. Requêtes publiques : 37/3000.

## Trois scénarios alternatifs

Chaque scénario dispose de 100 pUSD virtuels : 50 pour le mensuel, 50 pour l’annuel. Frais taker relus à chaque décision, coût supplémentaire de 0,02 pUSD par entrée. Achat au vendeur sur profondeur visible. Le spread est donc déjà inclus dans le prix.

| Délai demandé après réception BLS | Familles observées | Entrées virtuelles | Coût engagé | Marge conditionnelle | Net simulé à résolution vérifiée |
|---|---:|---:|---:|---:|---:|
| 1 s | 0/2 | 0 | 0.0000 | — | — |
| 5 s | 0/2 | 0 | 0.0000 | — | — |
| 15 s | 0/2 | 0 | 0.0000 | — | — |

Une marge conditionnelle suppose le paiement du Yes choisi selon la première publication. Elle reste distincte du résultat à résolution. Une abstention vaut zéro engagement, pas un remplissage inventé.

## Carnets et décisions

| Famille / délai demandé | Décision | Délai réel réception carnet | Meilleur vendeur | Spread | Frais | Motif ou marge conditionnelle |
|---|---|---:|---:|---:|---:|---|

## Limites

- Single CPI release: one risk episode, monthly and annual correlated; cannot establish repeatable edge.
- Snapshots do not reserve liquidity or prove a live order would fill. No real trades or gains.
- Delays begin at full-body BLS receipt, not global publication; scheduled-time lag includes unknown publication lag.
- A price from a fresh full WebSocket snapshot may have an older last-update exchange timestamp; both are retained.
- Spread is already paid by entering at the asks; never subtract it a second time.
- The three delay portfolios are alternatives; do not add their gains. No capital is moved from an abstaining family.
- Final resolution uses two public RPCs at the same Polygon block; unresolved positions have unknown net.
- Public-runner availability, BLS availability, revisions and order races can invalidate execution.

Le workflow attend et publiera les résultats dans cette branche sans le PC de l’utilisateur.
