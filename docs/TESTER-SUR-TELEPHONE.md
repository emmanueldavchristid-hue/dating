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
