# Tester l'application sur Android et iPhone

Durée : environ 15 minutes la première fois (téléchargements), 1 minute ensuite.

## Ce qu'il faut

- Le PC Windows avec **Docker Desktop** (démarré) et **Node.js**.
- Le PC et les téléphones sur **le même Wi-Fi**.
- Sur chaque téléphone : l'application gratuite **Expo Go** (Play Store / App Store).
- Le fichier des vrais lieux `sortie-reel.dump` dans `Documents\sortie-data` (déjà déposé).

## 1. Récupérer le projet (une seule fois)

Dans PowerShell :

```powershell
cd $env:USERPROFILE\Documents
git clone -b mvp https://github.com/emmanueldavchristid-hue/dating.git
```

## 2. Lancer

Ouvrir `Documents\dating\scripts\windows` et **double-cliquer sur `demarrer-test.bat`**
(clic droit → « Exécuter en tant qu'administrateur » la première fois, pour ouvrir le pare-feu).

Le script démarre la base, y restaure les vrais lieux, lance le serveur, puis affiche un **QR code**.

- **Android** : Expo Go → « Scan QR code ».
- **iPhone** : appareil photo → viser le QR code → toucher le lien « Ouvrir dans Expo Go ».

Comptes de test (mot de passe `Demo-2026!`) : `user@sortie.demo` (gratuit), `insider@sortie.demo` (premium),
`curateur@sortie.demo` (peut ajouter des photos), `admin@sortie.demo`.

Console d'administration web (validation des pépites, curation) : relancer avec
`demarrer-test.bat -Web`, puis ouvrir http://localhost:3000 sur le PC.

## 3. Arrêter

`Ctrl+C` dans la fenêtre, puis double-clic sur `arreter-test.bat`. Les données sont conservées.

## En cas de problème

| Symptôme | Solution |
| --- | --- |
| « Docker Desktop n'est pas démarré » | Ouvrir Docker Desktop, attendre « Engine running », relancer. |
| Le téléphone tourne dans le vide / « Network request failed » | Même Wi-Fi ? Relancer le script en administrateur (pare-feu). Désactiver un VPN éventuel. |
| Expo Go indique que le projet n'est pas compatible | Mettre Expo Go à jour depuis le store. Sinon, signaler le message : on passera par une version de test installable (EAS). |
| Mauvaise adresse IP détectée | `demarrer-test.bat -Ip 192.168.1.20` (voir l'adresse avec `ipconfig`). |
| Autre erreur | Envoyer le fichier `scripts\windows\demarrage.log`. |

## Faire tester un ami à distance (autre Wi-Fi)

Double-cliquer sur **`partager-test.bat`** (en administrateur). Le script :
1. démarre tout comme d'habitude ;
2. donne des mots de passe aléatoires aux comptes admin et curateur (affichés une fois, à garder pour soi) ;
3. ouvre un tunnel Cloudflare temporaire vers le serveur (gratuit, sans compte) ;
4. lance l'app en mode tunnel et affiche un lien `exp://…`.

À envoyer à l'ami : le lien `exp://…` + « installe Expo Go, ouvre-le, *Enter URL manually*, colle le lien,
connecte-toi avec `user@sortie.demo` / `Demo-2026!` ».

Limites : le PC doit rester allumé et connecté pendant le test ; le lien change à chaque lancement ;
c'est un mode d'essai, pas une mise en ligne (le jour venu, on hébergera serveur et base sur un vrai service).
