# Photos Google Places — option désactivée par défaut

**État : code prêt, DÉSACTIVÉ.** Rien n'est appelé chez Google tant que `GOOGLE_PHOTOS_ENABLED=true` **et**
`GOOGLE_PLACES_API_KEY` ne sont pas renseignés dans le fichier `.env` du serveur (jamais dans le dépôt, jamais
dans une conversation). Une clé seule n'active rien (test `test_google_option_is_off_by_default`).

Décision de Jason (10/11/2026) : continuer **sans Google et sans carte bancaire**. Cette page sert à décider plus
tard, en connaissance de cause.

## Ce qu'il faut savoir avant d'activer

### 1. Une carte bancaire est obligatoire

Google Maps Platform exige un **compte de facturation** (carte bancaire) même pour rester dans la tranche
gratuite. Sans carte, l'option ne peut pas fonctionner. Le crédit gratuit ne se consomme pas « avant » de payer :
chaque type d'appel (SKU) a son propre quota gratuit mensuel, puis tout appel au-delà est facturé.

### 2. Coût des appels utilisés par l'app

Tarifs vérifiés sur la page officielle des prix Google Maps Platform (novembre 2026, en dollars US, par
tranche de 1 000 appels, quota gratuit par mois et par SKU) :

| Appel fait par l'app | SKU Google | Gratuit / mois | Au-delà (pour 1 000) |
| --- | --- | --- | --- |
| Relier un lieu à sa fiche Google (`link-google`, une fois par lieu ; nom du lieu demandé pour vérifier que c'est le bon) | Text Search **Pro** | 5 000 | 32 $ |
| Liste des photos d'un lieu (champ `photos`) | Place Details Essentials (IDs Only) | illimité | 0 $ |
| **Chaque image affichée** | Place Details **Photos** | 1 000 | 7 $ jusqu'à 100 000 ; 5,60 $ jusqu'à 500 000 ; 4,20 $ jusqu'à 1 M ; 2,10 $ jusqu'à 5 M ; 0,53 $ au-delà |

Ordre de grandeur, pour l'image (le seul coût récurrent) :

- 900 images par mois : **0 $** (plafond par défaut de l'app : 30 par jour) ;
- 10 000 images par mois : (10 000 − 1 000) × 7 $ / 1 000 ≈ **63 $ / mois** ;
- 100 000 images par mois : ≈ **693 $ / mois**.

Les règles Google interdisent de garder les images en cache : **chaque affichage d'une photo Google est un appel
facturable**. Une app avec du trafic dépasse vite la tranche gratuite.

Le premier rattachement des ~2 900 lieux publiés reste sous les 5 000 recherches gratuites, à condition de ne
le lancer qu'une fois par mois au plus (le script pose un marqueur `.google-relie` et ne le relance pas).

### 3. Limites de consommation (garde-fous)

- **Dans l'app** : `GOOGLE_PHOTOS_DAILY_CAP` (30 par défaut) — au-delà, plus aucune image Google ce jour-là ;
  la fiche retombe sur l'illustration. Ce compteur est en mémoire : il repart de zéro si le serveur redémarre, et
  il est propre à chaque serveur. Ce n'est donc pas une garantie absolue.
- **Chez Google (à faire avant d'activer)** : dans Google Cloud Console → *API et services* → *Places API (New)*
  → *Quotas*, fixer un quota journalier (par ex. 30 requêtes/jour pour les photos). C'est la seule vraie limite :
  Google refuse les appels au-delà.
- **Alertes de budget** (Facturation → Budgets et alertes) : elles **préviennent** par e-mail mais **n'arrêtent
  pas** les dépenses.
- **Restreindre la clé** : uniquement à l'API Places (New), et uniquement à l'adresse IP du serveur.

### 4. Règles d'utilisation des photos Google (conditions Google Maps Platform)

- **Créditer l'auteur** de chaque photo (nom fourni par Google), avec un lien vers la photo sur Google Maps —
  l'app le fait (`Photo : <auteur> · Google Maps`, lien « Page source »).
- Afficher la **mention Google Maps** (logo de 16 à 19 dp, ou le texte « Google Maps » si la place manque) à côté
  du contenu Google — l'app affiche le texte « Google Maps ».
- **Aucun stockage ni cache** des photos, des noms de photos ou de leurs adresses : seul l'identifiant Google du
  lieu (place_id) peut être conservé indéfiniment ; les coordonnées Google au plus 30 jours — l'app ne garde que
  le place_id.
- Les contenus Places affichés **sur une carte** doivent l'être sur une carte Google. L'app n'affiche les photos
  Google que sur la fiche du lieu, jamais sur la carte.
- Ne pas modifier les photos (recadrage abusif, filtres, retrait d'un filigrane) ni les présenter comme les
  nôtres.

### 5. Place dans l'ordre des photos

1. photo réelle autorisée (lieu, équipe, licence) ;
2. photo Wikimedia Commons validée ;
3. **Google** (si activé) ;
4. illustration signalée comme telle.

Une photo Google n'est jamais copiée sur le serveur ; elle ne remplace pas une vraie photo.

## Pour activer (le jour où Jason le décide)

1. Créer le projet Google Cloud, activer *Places API (New)*, ajouter le compte de facturation.
2. Créer la clé, la restreindre (API Places, IP du serveur), fixer le quota journalier.
3. Sur le serveur uniquement, dans `.env` : `GOOGLE_PHOTOS_ENABLED=true`, `GOOGLE_PLACES_API_KEY=…`
   (sur le PC de test : `Documents\sortie-data\cles-ia.env`, recopié par le script).
4. Lancer une fois `python -m app.tasks link-google` (le script Windows le fait seul si l'option est active).
5. Vérifier une fiche sans photo : crédit « Photo : … · Google Maps » et lien vers Google Maps.

## Ce qui a été testé

- Avec des réponses Google **simulées** : correspondance des noms, crédit et lien de l'auteur, plafond quotidien,
  aucune mise en cache, option inactive par défaut, repli sur l'illustration.
- **Jamais testé avec le vrai service Google** (pas de clé, et domaine non joignable depuis l'environnement de
  développement).
