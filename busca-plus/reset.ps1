Write-Host "=== Limpando dados do Busca+ ===" -ForegroundColor Yellow

# Parar containers
Write-Host "Parando containers..." -ForegroundColor Cyan
docker-compose down

# Remover volumes de dados
Write-Host "Removendo volumes de dados..." -ForegroundColor Cyan
docker volume rm busca-plus_postgres_data 2>$null
docker volume rm busca-plus_redis_data 2>$null
docker volume rm busca-plus_typesense_data 2>$null

# Limpar pastas
Write-Host "Limpando pastas..." -ForegroundColor Cyan
if (Test-Path "images") { Remove-Item -Path "images\*" -Recurse -Force }
if (Test-Path "screenshots") { Remove-Item -Path "screenshots\*" -Recurse -Force }

# Recriar pastas
New-Item -ItemType Directory -Force -Path "images" | Out-Null

Write-Host ""
Write-Host "=== Dados limpos com sucesso! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Para reiniciar:" -ForegroundColor White
Write-Host "  docker-compose up -d" -ForegroundColor Gray
Write-Host ""
Write-Host "Depois inicialize o Typesense:" -ForegroundColor White
Write-Host "  docker-compose exec crawler node src/scripts/init-typesense.js" -ForegroundColor Gray
