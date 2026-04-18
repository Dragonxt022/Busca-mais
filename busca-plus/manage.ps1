<#
.SYNOPSIS
    Script de gerenciamento do Busca+
.DESCRIPTION
    Controla a infraestrutura Docker e os processos locais de desenvolvimento
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "init", "logs", "status", "clean", "dev", "devall", "boot", "bootall", "worker")]
    [string]$Action = "start"
)

$ProjectRoot = $PSScriptRoot
$ErrorActionPreference = "Stop"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Invoke-InfraCommand {
    param([string[]]$Arguments)
    Push-Location $ProjectRoot
    try {
        & docker compose -f docker-compose.dev.yml @Arguments
    } finally {
        Pop-Location
    }
}

function Start-Containers {
    Write-ColorOutput "`n=== Iniciando infraestrutura Docker ===" "Cyan"
    Invoke-InfraCommand -Arguments @("up", "-d")
    Write-ColorOutput "Aguardando servicos de infraestrutura ficarem prontos..." "Yellow"
    Start-Sleep -Seconds 5
}

function Stop-Containers {
    Write-ColorOutput "`n=== Parando infraestrutura Docker ===" "Cyan"
    Invoke-InfraCommand -Arguments @("down")
}

function Restart-Containers {
    Write-ColorOutput "`n=== Reiniciando infraestrutura Docker ===" "Cyan"
    Invoke-InfraCommand -Arguments @("restart")
}

function Initialize-Services {
    Write-ColorOutput "`n=== Inicializando banco e Typesense ===" "Cyan"

    $postgresStatus = docker inspect busca-plus-postgres --format "{{.State.Running}}" 2>$null
    if ($postgresStatus -ne "true") {
        Write-ColorOutput "Iniciando infraestrutura primeiro..." "Yellow"
        Invoke-InfraCommand -Arguments @("up", "-d", "postgres", "redis", "typesense")
        Start-Sleep -Seconds 10
    }

    Push-Location "..\busca-plus-crawler"
    try {
        npm run init-db
        npm run init-typesense
    } finally {
        Pop-Location
    }

    Write-ColorOutput "Inicializacao concluida!" "Green"
}

function Show-Logs {
    param([string]$Service = "")

    if ($Service) {
        Write-ColorOutput "`n=== Logs: $Service ===" "Cyan"
        Invoke-InfraCommand -Arguments @("logs", "-f", $Service)
    } else {
        Write-ColorOutput "`n=== Logs da infraestrutura ===" "Cyan"
        Invoke-InfraCommand -Arguments @("logs", "-f")
    }
}

function Show-Status {
    Write-ColorOutput "`n=== Status da infraestrutura Docker ===" "Cyan"
    Invoke-InfraCommand -Arguments @("ps")

    Write-ColorOutput "`n=== Uso de recursos ===" "Cyan"
    docker stats --no-stream 2>$null
}

function Clean-Environment {
    Write-ColorOutput "`n=== ATENCAO: Limpando ambiente ===" "Red"
    Write-ColorOutput "Isso ira remover os dados de PostgreSQL, Redis e Typesense." "Yellow"
    $confirm = Read-Host "Continuar? (s/N)"

    if ($confirm -ne "s") {
        Write-ColorOutput "Operacao cancelada." "Yellow"
        return
    }

    Invoke-InfraCommand -Arguments @("down", "-v")
    Write-ColorOutput "`nAmbiente limpo com sucesso!" "Green"
}

function Start-LocalDev {
    param([switch]$WithWorker)

    Push-Location $ProjectRoot
    try {
        $scriptName = if ($WithWorker) { "dev:all" } else { "dev" }
        npm run $scriptName
    } finally {
        Pop-Location
    }
}

switch ($Action) {
    "start" {
        Start-Containers
        Write-ColorOutput "`n=== Infraestrutura iniciada! ===" "Green"
        Write-ColorOutput "  PostgreSQL: localhost:5432" "White"
        Write-ColorOutput "  Redis: localhost:6379" "White"
        Write-ColorOutput "  Typesense: http://localhost:8108" "White"
        Write-ColorOutput "  Apps locais: npm run dev" "White"
    }

    "stop" {
        Stop-Containers
        Write-ColorOutput "`n=== Infraestrutura parada! ===" "Green"
    }

    "restart" {
        Restart-Containers
        Write-ColorOutput "`n=== Infraestrutura reiniciada! ===" "Green"
    }

    "init" {
        Initialize-Services
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

    "dev" {
        Start-LocalDev
    }

    "devall" {
        Start-LocalDev -WithWorker
    }

    "boot" {
        Start-Containers
        Start-LocalDev
    }

    "bootall" {
        Start-Containers
        Start-LocalDev -WithWorker
    }

    "worker" {
        Push-Location "..\busca-plus-crawler"
        try {
            npm run worker
        } finally {
            Pop-Location
        }
    }
}

Write-Host ""
