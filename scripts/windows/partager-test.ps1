# Partage temporaire de l'application avec un testeur à distance (autre Wi-Fi, autre ville).
# Le PC sert de serveur : il doit rester allumé et connecté pendant le test. Le lien change à chaque lancement.
#   1. démarre la base et le serveur (demarrer-test.ps1 -SansMobile)
#   2. donne des mots de passe aléatoires aux comptes admin/curateur de démo (ils sont publics sur GitHub)
#   3. ouvre un tunnel Cloudflare temporaire vers le serveur (gratuit, sans compte)
#   4. lance l'app en mode tunnel Expo et affiche le lien à envoyer
$ErrorActionPreference = "Continue"
$Racine = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Outils = Join-Path $PSScriptRoot "outils"
function Etape($texte) { Write-Host ""; Write-Host "==> $texte" -ForegroundColor Cyan }
function Echec($texte) { Write-Host ""; Write-Host "ERREUR : $texte" -ForegroundColor Red; exit 1 }

# 1. Base + serveur
& (Join-Path $PSScriptRoot "demarrer-test.ps1") -SansMobile
if ($LASTEXITCODE -ne 0) { Echec "Le démarrage local a échoué (voir demarrage.log)." }
Set-Location $Racine

# 2. Comptes sensibles
Etape "Sécurisation des comptes admin et curateur de démonstration"
docker compose exec -T api python -m app.tasks secure-demo-staff
Write-Host "Garde ces mots de passe pour toi. Ton ami utilise user@sortie.demo ou insider@sortie.demo (Demo-2026!)." -ForegroundColor Yellow

# 3. Tunnel Cloudflare vers le serveur
Etape "Ouverture d'un tunnel public temporaire vers le serveur"
New-Item -ItemType Directory -Force -Path $Outils | Out-Null
$cf = Join-Path $Outils "cloudflared.exe"
if (-not (Test-Path $cf)) {
    Write-Host "Téléchargement de cloudflared (une seule fois)..."
    Invoke-WebRequest -UseBasicParsing -OutFile $cf "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
}
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
$cfLog = Join-Path $Outils "cloudflared.log"
Remove-Item $cfLog -ErrorAction SilentlyContinue
Start-Process -FilePath $cf -ArgumentList "tunnel --no-autoupdate --url http://localhost:8000" -RedirectStandardError $cfLog -WindowStyle Hidden | Out-Null
$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $cfLog) {
        $m = Select-String -Path $cfLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value }
    }
}
if (-not $url) { Echec "Le tunnel Cloudflare n'a pas donné d'adresse (voir $cfLog)." }
Write-Host "Serveur accessible publiquement : $url"

# Le serveur doit connaître son adresse publique (liens des photos)
$envFile = Join-Path $Racine "backend\.env"
(Get-Content $envFile) -replace "^PUBLIC_BASE_URL=.*$", "PUBLIC_BASE_URL=$url" | Set-Content $envFile -Encoding ASCII
docker compose up -d --force-recreate api *> $null
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "$url/api/v1/health").StatusCode -eq 200) { $ok = $true; break } } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ok) { Echec "Le serveur ne répond pas à travers le tunnel." }
Write-Host "Tunnel vérifié."

# 4. App mobile en mode tunnel Expo
Etape "Lancement de l'application en mode partage"
Set-Location (Join-Path $Racine "mobile")
"EXPO_PUBLIC_API_URL=$url/api/v1" | Set-Content -Path ".env" -Encoding ASCII
if (-not (Test-Path "node_modules")) { npm install }
if (-not (Test-Path "node_modules\@expo\ngrok")) { npm install --no-save "@expo/ngrok@^4.1.0" }
# Le lien de partage Expo exige un compte Expo (gratuit : https://expo.dev/signup).
# La connexion par navigateur plante sous Windows : on utilise un jeton d'accès, mémorisé pour l'utilisateur Windows.
if (-not $env:EXPO_TOKEN) { $env:EXPO_TOKEN = [Environment]::GetEnvironmentVariable("EXPO_TOKEN", "User") }
npx expo whoami *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Il faut un jeton d'accès Expo (une seule fois) :" -ForegroundColor Yellow
    Write-Host " 1. Ouvre https://expo.dev/settings/access-tokens (connecte-toi si besoin)" -ForegroundColor Yellow
    Write-Host " 2. « Create token », nomme-le « PC », puis copie le jeton" -ForegroundColor Yellow
    $jeton = Read-Host " 3. Colle le jeton ici puis Entrée"
    $jeton = $jeton.Trim()
    if (-not $jeton) { Echec "Aucun jeton saisi." }
    $env:EXPO_TOKEN = $jeton
    npx expo whoami
    if ($LASTEXITCODE -ne 0) { Echec "Jeton refusé par Expo. Vérifie qu'il a été copié en entier." }
    [Environment]::SetEnvironmentVariable("EXPO_TOKEN", $jeton, "User")
    Write-Host "Jeton enregistré pour les prochaines fois." -ForegroundColor Green
}
Write-Host ""
Write-Host "Quand le QR code s'affiche :" -ForegroundColor Green
Write-Host " 1. Copie le lien qui commence par exp:// (ligne « Metro: exp://... »)." -ForegroundColor Green
Write-Host " 2. Envoie-le à ton ami avec ces consignes :" -ForegroundColor Green
Write-Host "    - installer Expo Go (Play Store / App Store) ;" -ForegroundColor Green
Write-Host "    - ouvrir Expo Go > « Enter URL manually » > coller le lien ;" -ForegroundColor Green
Write-Host "    - se connecter avec user@sortie.demo / Demo-2026!" -ForegroundColor Green
Write-Host " Ton PC doit rester allumé pendant tout le test. Pour arrêter : Ctrl+C puis arreter-test.bat." -ForegroundColor Yellow
npx expo start --tunnel
