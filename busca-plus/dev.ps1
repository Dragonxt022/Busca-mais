param(
    [switch]$WithWorker,
    [switch]$Init
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

function Invoke-NpmScript {
    param(
        [string[]]$Arguments
    )

    & npm @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao executar: npm $($Arguments -join ' ')"
    }
}

function Wait-ForTcpService {
    param(
        [string]$Name,
        [string]$TargetHost,
        [int]$Port,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $async = $client.BeginConnect($TargetHost, $Port, $null, $null)
            $connected = $async.AsyncWaitHandle.WaitOne(1500, $false)

            if ($connected -and $client.Connected) {
                $client.EndConnect($async)
                $client.Close()
                Write-Host "$Name pronto em ${TargetHost}:${Port}" -ForegroundColor Green
                return
            }

            $client.Close()
        } catch {
        }

        Start-Sleep -Seconds 2
    }

    throw "Timeout aguardando $Name em ${TargetHost}:${Port}"
}

Push-Location $ProjectRoot
try {
    Invoke-NpmScript -Arguments @("run", "infra:up")

    Write-Host "Aguardando infraestrutura ficar pronta..." -ForegroundColor Cyan
    Wait-ForTcpService -Name "PostgreSQL" -TargetHost "127.0.0.1" -Port 5432
    Wait-ForTcpService -Name "Redis" -TargetHost "127.0.0.1" -Port 6379
    Wait-ForTcpService -Name "Typesense" -TargetHost "127.0.0.1" -Port 8108

    if ($Init) {
        Write-Host "Inicializando banco e Typesense..." -ForegroundColor Cyan
        Invoke-NpmScript -Arguments @("run", "init")
    }

    if ($WithWorker) {
        Invoke-NpmScript -Arguments @("run", "dev:all")
    } else {
        Invoke-NpmScript -Arguments @("run", "dev")
    }
} finally {
    Pop-Location
}
