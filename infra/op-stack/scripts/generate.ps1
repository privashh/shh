# Generate the shh L3 genesis + rollup config and deploy its L1 (Base) contracts using
# op-deployer, then emit the files docker-compose expects. PowerShell variant of generate.sh.
# Prereq: Docker, and a funded GS_ADMIN_PRIVATE_KEY on the L1 (Base) endpoint.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (Test-Path ./.env) {
  Get-Content ./.env | Where-Object { $_ -match "^\s*[^#].*=" } | ForEach-Object {
    $k, $v = $_ -split "=", 2
    Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
  }
}

$configs = "./configs"
$workdir = "./.deployer"
$image = "us-docker.pkg.dev/oplabs-tools-artifacts/images/op-deployer:latest"
New-Item -ItemType Directory -Force -Path $configs, $workdir | Out-Null

function Invoke-Deployer { docker run --rm -v "$($PWD.Path)/.deployer:/work" -w /work $image @args }

Write-Output "init intent (L1=$env:L1_CHAIN_ID, L2=$env:L2_CHAIN_ID)"
Invoke-Deployer init --l1-chain-id $env:L1_CHAIN_ID --l2-chain-ids $env:L2_CHAIN_ID --workdir /work

Write-Output "apply (deploy L1 contracts onto Base)"
$pk = $env:GS_ADMIN_PRIVATE_KEY -replace "^0x", ""
Invoke-Deployer apply --workdir /work --l1-rpc-url $env:L1_RPC --private-key $pk

Write-Output "inspect genesis + rollup"
Invoke-Deployer inspect genesis --workdir /work $env:L2_CHAIN_ID | Out-File -Encoding ascii "$configs/genesis.json"
Invoke-Deployer inspect rollup  --workdir /work $env:L2_CHAIN_ID | Out-File -Encoding ascii "$configs/rollup.json"

Write-Output "jwt secret"
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
($bytes | ForEach-Object { $_.ToString("x2") }) -join "" | Out-File -Encoding ascii "$configs/jwt.txt"

Write-Output "wrote $configs/{genesis.json,rollup.json,jwt.txt}"
Write-Output "Next: set DGF_ADDRESS in .env from .deployer/state.json, then: docker compose up -d"
