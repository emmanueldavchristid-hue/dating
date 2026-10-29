# Lance l'application en mode test sur un PC Windows, pour l'essayer sur Android et iPhone (Expo Go).
# Utilisation : double-cliquer sur demarrer-test.bat (ou : powershell -ExecutionPolicy Bypass -File demarrer-test.ps1)
# Options : -Dump <chemin du fichier .dump>  -Ip <adresse IP du PC>  -Web (console d'administration)  -SansMobile
param(
    [string]$Dump = (Join-Path $env:USERPROFILE "Documents\sortie-data\sortie-reel.dump"),
    [string]$Ip = "",
    [switch]$Web,
    [switch]$SansMobile
)

$ErrorActionPreference = "Continue"  # les programmes (docker, npm) écrivent sur stderr : on contrôle $LASTEXITCODE
$Racine = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Journal = Join-Path $PSScriptRoot "demarrage.log"
Start-Transcript -Path $Journal -Force | Out-Null
Set-Location $Racine

function Etape($texte) { Write-Host ""; Write-Host "==> $texte" -ForegroundColor Cyan }
function Echec($texte) {
    Write-Host ""; Write-Host "ERREUR : $texte" -ForegroundColor Red
    Write-Host "Le détail est dans : $Journal (envoie-le si besoin)." -ForegroundColor Yellow
    Stop-Transcript | Out-Null
    exit 1
}

# 1. Prérequis ---------------------------------------------------------------
Etape "Vérification de Docker Desktop et Node.js"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Echec "Docker Desktop est introuvable. Installe-le depuis https://www.docker.com/products/docker-desktop puis relance." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Echec "Docker Desktop n'est pas démarré. Ouvre Docker Desktop, attends qu'il soit prêt, puis relance." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Echec "Node.js est introuvable. Installe-le depuis https://nodejs.org (version LTS) puis relance." }
Write-Host "Docker et Node.js sont prêts."

# 2. Adresse IP du PC sur le Wi-Fi ---------------------------------------------
Etape "Recherche de l'adresse du PC sur le réseau Wi-Fi"
if (-not $Ip) {
    $candidats = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notmatch "vEthernet|WSL|Docker|VirtualBox|Loopback" } |
        Sort-Object { if ($_.InterfaceAlias -match "Wi-?Fi|Sans fil|Wireless") { 0 } else { 1 } }
    if (-not $candidats) { Echec "Aucune adresse réseau trouvée. Connecte le PC au Wi-Fi (le même que les téléphones) puis relance." }
    $Ip = $candidats[0].IPAddress
}
Write-Host "Adresse du PC : $Ip  (les téléphones doivent être sur le même Wi-Fi)"

# 3. Configuration ---------------------------------------------------------------
Etape "Configuration du serveur"
$envFile = Join-Path $Racine "backend\.env"
$secret = $null
if (Test-Path $envFile) {
    $ligne = Select-String -Path $envFile -Pattern "^JWT_SECRET=(.+)$" | Select-Object -First 1
    if ($ligne) { $secret = $ligne.Matches[0].Groups[1].Value }
}
if (-not $secret -or $secret -like "dev-only*") { $secret = -join (1..64 | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) }) }
@"
APP_NAME=Sortie
ENVIRONMENT=development
JWT_SECRET=$secret
CORS_ORIGINS=http://localhost:3000,http://${Ip}:3000,http://localhost:8081
PUBLIC_BASE_URL=http://${Ip}:8000
TIMEZONE=Africa/Abidjan
DEFAULT_CITY=abidjan
"@ | Set-Content -Path $envFile -Encoding ASCII
Write-Host "backend\.env écrit (adresse publique des photos : http://${Ip}:8000)."

# 4. Base de données -----------------------------------------------------------
Etape "Démarrage de la base de données (le premier lancement télécharge et construit les images : quelques minutes)"
docker compose up -d --build db
if ($LASTEXITCODE -ne 0) { Echec "Impossible de démarrer la base (docker compose up db)." }
$pret = $false
for ($i = 0; $i -lt 60; $i++) {
    docker compose exec -T db pg_isready -U sortie -d sortie *> $null
    if ($LASTEXITCODE -eq 0) { $pret = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $pret) { Echec "La base ne répond pas après 2 minutes." }
Write-Host "Base prête."

$demo = $false
$existe = (docker compose exec -T db psql -U sortie -d sortie -tAc "select to_regclass('public.places') is not null") | Out-String
if ($existe.Trim() -ne "t") {
    if (Test-Path $Dump) {
        Etape "Restauration des vrais lieux depuis $Dump"
        docker compose cp "$Dump" db:/tmp/sortie.dump
        docker compose exec -T db pg_restore --no-owner --no-privileges -U sortie -d sortie /tmp/sortie.dump
        if ($LASTEXITCODE -ne 0) { Echec "La restauration de la base a échoué." }
        Write-Host "Lieux restaurés."
    } else {
        Write-Host "Aucun fichier de base trouvé ($Dump) : démarrage avec les lieux de démonstration." -ForegroundColor Yellow
        $demo = $true
    }
} else {
    Write-Host "La base contient déjà des données : on les garde."
}

# 5. Serveur API -------------------------------------------------------------------
Etape "Démarrage du serveur"
docker compose up -d --build api
if ($LASTEXITCODE -ne 0) { Echec "Impossible de démarrer le serveur (docker compose up api)." }
$ok = $false
for ($i = 0; $i -lt 90; $i++) {
    try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://localhost:8000/api/v1/health"; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ok) { docker compose logs --tail 40 api; Echec "Le serveur ne répond pas (voir les lignes ci-dessus)." }
if ($demo) { docker compose exec -T api python -m app.seed --demo }
Write-Host "Serveur prêt : http://${Ip}:8000/api/docs"

# 6. Pare-feu Windows (les téléphones doivent joindre le PC) -----------------------
Etape "Ouverture du pare-feu Windows pour les ports 8000 (serveur) et 8081 (app mobile)"
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($admin) {
    foreach ($port in 8000, 8081) {
        if (-not (Get-NetFirewallRule -DisplayName "Sortie test $port" -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName "Sortie test $port" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Private | Out-Null
        }
    }
    Write-Host "Ports ouverts sur le réseau privé."
} else {
    Write-Host "Pas lancé en administrateur : si le téléphone n'arrive pas à se connecter, relance demarrer-test.bat avec clic droit > Exécuter en tant qu'administrateur, ou accepte la fenêtre du pare-feu Windows (« Réseaux privés »)." -ForegroundColor Yellow
}

# 7. Console web (optionnelle) ----------------------------------------------------
if ($Web) {
    Etape "Démarrage de la console web (administration)"
    $env:PUBLIC_API_URL = "http://${Ip}:8000/api/v1"
    docker compose up -d --build web
    Write-Host "Console web : http://localhost:3000 (ou http://${Ip}:3000)"
}

# 8. Application mobile -------------------------------------------------------------
if ($SansMobile) { Stop-Transcript | Out-Null; exit 0 }
Etape "Lancement de l'application mobile"
Set-Location (Join-Path $Racine "mobile")
"EXPO_PUBLIC_API_URL=http://${Ip}:8000/api/v1" | Set-Content -Path ".env" -Encoding ASCII
if (-not (Test-Path "node_modules")) {
    Write-Host "Installation des dépendances (première fois seulement)..."
    npm install
    if ($LASTEXITCODE -ne 0) { Echec "npm install a échoué." }
}
Write-Host ""
Write-Host "Un QR code va s'afficher." -ForegroundColor Green
Write-Host " - Android : ouvre Expo Go et scanne le QR code." -ForegroundColor Green
Write-Host " - iPhone  : ouvre l'appareil photo et vise le QR code, puis touche le lien Expo Go." -ForegroundColor Green
Write-Host "Comptes de test : user@sortie.demo / insider@sortie.demo / curateur@sortie.demo / admin@sortie.demo — mot de passe Demo-2026!"
Write-Host "Pour tout arrêter : Ctrl+C ici, puis arreter-test.bat."
Stop-Transcript | Out-Null
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $Ip
npx expo start --lan
