<#
.SYNOPSIS
    Script de gerenciamento do Busca+
.DESCRIPTION
    Gerencia containers Docker, build, restart e inicialização do projeto
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "build", "init", "logs", "status", "clean")]
    [string]$Action = "start"
)

$ProjectRoot = $PSScriptRoot
$ErrorActionPreference = "Stop"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Start-Containers {
    Write-ColorOutput "`n=== Iniciando containers ===" "Cyan"
    docker-compose up -d
    Write-ColorOutput "Aguardando serviços ficarem prontos..." "Yellow"
    Start-Sleep -Seconds 5
}

function Stop-Containers {
    Write-ColorOutput "`n=== Parando containers ===" "Cyan"
    docker-compose down
}

function Restart-Containers {
    Write-ColorOutput "`n=== Reiniciando containers ===" "Cyan"
    docker-compose restart
}

function Build-Crawler {
    Write-ColorOutput "`n=== Buildando crawler (sem cache) ===" "Cyan"
    docker-compose build --no-cache crawler
    Write-ColorOutput "Build concluído!" "Green"
}

function Initialize-Database {
    Write-ColorOutput "`n=== Inicializando banco de dados ===" "Cyan"
    
    # Verifica se os containers estão rodando
    $postgresStatus = docker inspect busca-plus-postgres --format "{{.State.Running}}" 2>$null
    if ($postgresStatus -ne "true") {
        Write-ColorOutput "Iniciando PostgreSQL primeiro..." "Yellow"
        docker-compose up -d postgres
        Start-Sleep -Seconds 10
    }
    
    Write-ColorOutput "Sincronizando banco de dados..." "Yellow"
    docker-compose exec -T crawler node src/scripts/init-db.js
    
    Write-ColorOutput "Inicializando Typesense..." "Yellow"
    docker-compose exec -T crawler node src/scripts/init-typesense.js
    
    Write-ColorOutput "Banco inicializado com sucesso!" "Green"
}

function Show-Logs {
    param([string]$Service = "")
    
    if ($Service) {
        Write-ColorOutput "`n=== Logs: $Service ===" "Cyan"
        docker-compose logs -f $Service
    } else {
        Write-ColorOutput "`n=== Logs (todos os serviços) ===" "Cyan"
        docker-compose logs -f
    }
}

function Show-Status {
    Write-ColorOutput "`n=== Status dos Containers ===" "Cyan"
    docker-compose ps
    
    Write-ColorOutput "`n=== Uso de recursos ===" "Cyan"
    docker stats --no-stream 2>$null
}

function Clean-Environment {
    Write-ColorOutput "`n=== ATENÇÃO: Limpando ambiente ===" "Red"
    Write-ColorOutput "Isso irá remover todos os dados (banco, imagens, etc.)" "Yellow"
    $confirm = Read-Host "Continuar? (s/N)"
    
    if ($confirm -ne "s") {
        Write-ColorOutput "Operação cancelada." "Yellow"
        return
    }
    
    Write-ColorOutput "Parando containers..." "Yellow"
    docker-compose down -v
    
    Write-ColorOutput "Removendo pastas de dados..." "Yellow"
    $folders = @("screenshots", "images")
    foreach ($folder in $folders) {
        $path = Join-Path $ProjectRoot $folder
        if (Test-Path $path) {
            Remove-Item -Path "$path\*" -Recurse -Force
            Write-ColorOutput "  Limpado: $folder" "DarkGray"
        }
    }
    
    Write-ColorOutput "`nAmbiente limpo com sucesso!" "Green"
    Write-ColorOutput "Execute './manage.ps1 start' para reiniciar." "Cyan"
}

# Executa a ação solicitada
switch ($Action) {
    "start" {
        Start-Containers
        Write-ColorOutput "`n=== Serviços iniciados! ===" "Green"
        Write-ColorOutput "  Admin: http://localhost:3001/admin" "White"
        Write-ColorOutput "  Busca: http://localhost:3000" "White"
    }
    
    "stop" {
        Stop-Containers
        Write-ColorOutput "`n=== Serviços parados! ===" "Green"
    }
    
    "restart" {
        Restart-Containers
        Write-ColorOutput "`n=== Serviços reiniciados! ===" "Green"
    }
    
    "build" {
        Build-Crawler
        Write-ColorOutput "`nIniciando containers..." "Cyan"
        Start-Containers
    }
    
    "init" {
        Initialize-Database
    }
    
    "logs" {
        Show-Logs
    }
    
    "status" {
        Show-Status
    }
    
    "clean" {
        Clean-Environment
    }
}

Write-Host ""
