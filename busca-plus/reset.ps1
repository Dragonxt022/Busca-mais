Write-Host "=== Limpando ambiente do Busca+ ===" -ForegroundColor Yellow

$ErrorActionPreference = "SilentlyContinue"
$projectRoot = $PSScriptRoot
$legacyContainers = @(
  "busca-plus-search-dev",
  "busca-plus-search",
  "busca-plus-worker",
  "busca-plus-crawler",
  "busca-plus-minio",
  "busca-plus-postgres",
  "busca-plus-redis",
  "busca-plus-typesense"
)
$legacyVolumes = @(
  "busca-plus_postgres_data",
  "busca-plus_redis_data",
  "busca-plus_typesense_data",
  "busca-plus_minio_data"
)

Push-Location $projectRoot
try {
  Write-Host "Parando compose e removendo orfaos..." -ForegroundColor Cyan
  docker compose -f docker-compose.dev.yml down -v --remove-orphans | Out-Host

  Write-Host "Removendo containers legados..." -ForegroundColor Cyan
  foreach ($container in $legacyContainers) {
    docker rm -f $container 2>$null | Out-Null
  }

  Write-Host "Removendo volumes legados..." -ForegroundColor Cyan
  foreach ($volume in $legacyVolumes) {
    docker volume rm $volume 2>$null | Out-Null
  }

  Write-Host "Limpando pastas locais..." -ForegroundColor Cyan
  if (Test-Path "images") { Remove-Item -Path "images\*" -Recurse -Force }
  if (Test-Path "screenshots") { Remove-Item -Path "screenshots\*" -Recurse -Force }

  New-Item -ItemType Directory -Force -Path "images" | Out-Null
  New-Item -ItemType Directory -Force -Path "screenshots" | Out-Null
}
finally {
  Pop-Location
}

$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "=== Ambiente limpo com sucesso! ===" -ForegroundColor Green
Write-Host "Para subir infraestrutura: npm run infra:up" -ForegroundColor White
Write-Host "Para iniciar apps locais: npm run dev" -ForegroundColor White
