# Túnel SSH para o Postgres da VPS. Deixe esta janela aberta enquanto desenvolve.
#
#   .\scripts\db-tunnel.ps1
#
# A porta 5432 NÃO é exposta na internet (docs/infra-vps.md). O túnel encaminha
# 127.0.0.1:5433 (aqui) -> 127.0.0.1:5432 (VPS), e o Postgres vê a conexão vindo
# do loopback, que é o que o pg_hba permite.
#
# Por que não abrir a 5432 só para o seu IP: IP residencial é dinâmico. No dia em
# que ele mudar, o banco fica inacessível e consertar exige entrar na VPS —
# justamente quando você quer trabalhar. O túnel não depende do seu IP.
#
# O laço de reconexão não é preciosismo: o plink cai em silêncio (queda de rede,
# suspensão da máquina) e o sintoma é `database: "down"` no /health, que parece
# banco fora do ar. Reconectar sozinho evita esse diagnóstico errado.

param(
    [string]$KeyPath    = "C:\Users\2cta\Documents\placeadmin_vps.ppk",
    [string]$RemoteHost = "23.29.114.96",
    [string]$RemoteUser = "root",
    [int]$LocalPort     = 5433,
    [int]$RemotePort    = 5432
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $KeyPath)) {
    Write-Error "Chave não encontrada: $KeyPath"
    exit 1
}
if (-not (Get-Command plink -ErrorAction SilentlyContinue)) {
    Write-Error "plink não está no PATH. Instale o PuTTY."
    exit 1
}

# 5433 e não 5432: se um dia houver um Postgres local, os dois convivem sem
# conflito de porta e sem dúvida sobre em qual banco você está mexendo.
$existing = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Já há algo escutando em 127.0.0.1:$LocalPort — túnel provavelmente de pé." -ForegroundColor Yellow
    Write-Host "Se for um túnel morto, feche o processo e rode de novo." -ForegroundColor DarkGray
    exit 0
}

Write-Host ""
Write-Host "  Túnel  127.0.0.1:$LocalPort  ->  ${RemoteHost}:$RemotePort" -ForegroundColor Cyan
Write-Host "  Deixe esta janela aberta. Ctrl+C encerra." -ForegroundColor DarkGray
Write-Host ""

$attempt = 0
while ($true) {
    $attempt++
    $ts = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$ts] conectando (tentativa $attempt)..." -ForegroundColor DarkGray

    # -N: sem shell remoto, só o encaminhamento.
    # plink bloqueia aqui até a conexão cair.
    & plink -batch -N -i $KeyPath -L "${LocalPort}:127.0.0.1:${RemotePort}" "$RemoteUser@$RemoteHost"

    $ts = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$ts] túnel caiu (exit $LASTEXITCODE). Reconectando em 3s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}
