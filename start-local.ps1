$ErrorActionPreference = "Stop"
$env:ComSpec = "C:\WINDOWS\system32\cmd.exe"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BlockchainDir = Join-Path $RootDir "trusttrace-blockchain"
$BackendDir = Join-Path $RootDir "backend"
$MlDir = Join-Path $RootDir "ml-service"
$FrontendDir = Join-Path $RootDir "frontend"

function Test-PortListening([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(800, $false)
        if ($wait -and $client.Connected) {
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Get-RpcChainId([string]$RpcUrl) {
    $body = '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
    $resp = Invoke-RestMethod -Uri $RpcUrl -Method Post -ContentType "application/json" -Body $body -TimeoutSec 5
    if (-not $resp.result) {
        throw "RPC at $RpcUrl did not return eth_chainId."
    }
    return [Convert]::ToInt64($resp.result, 16)
}

Write-Host "=== TrustTrace Local Startup & Recovery Workflow ===" -ForegroundColor Cyan

# 1. Start or reuse a single local Hardhat node on port 8545
if (Test-PortListening 8545) {
    Write-Host "[1/5] Port 8545 is already active. Reusing existing RPC node..." -ForegroundColor Green
} else {
    Write-Host "[1/5] Starting local Hardhat node on http://127.0.0.1:8545..." -ForegroundColor Yellow
    Start-Process -FilePath $env:ComSpec -ArgumentList "/c npx hardhat node" -WorkingDirectory $BlockchainDir -WindowStyle Hidden
}

# 2. Wait for RPC readiness and verify chainId == 31337
$rpcReady = $false
for ($i = 0; $i -lt 25; $i++) {
    if (Test-PortListening 8545) {
        try {
            $chainId = Get-RpcChainId "http://127.0.0.1:8545"
            if ($chainId -ne 31337) {
                throw "CHAIN_ID_MISMATCH: RPC on port 8545 returned chainId $chainId (expected 31337 for local Hardhat)."
            }
            $rpcReady = $true
            Write-Host "[2/5] Local Hardhat RPC ready (verified chainId = $chainId)." -ForegroundColor Green
            break
        } catch {
            if ($_.Exception.Message -match "CHAIN_ID_MISMATCH") { throw $_ }
        }
    }
    Start-Sleep -Seconds 1
}
if (-not $rpcReady) {
    throw "Local Hardhat RPC at http://127.0.0.1:8545 did not become ready within 25 seconds."
}

# 3. Deploy/verify ProductAuth, update local-deployment.json + backend/.env, and restore manufacturers & products
Write-Host "[3/5] Running idempotent local chain synchronization (syncLocalChainState.js)..." -ForegroundColor Cyan
Push-Location $BackendDir
try {
    node scripts/syncLocalChainState.js
    if ($LASTEXITCODE -ne 0) {
        throw "syncLocalChainState.js exited with code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

# 4. Ensure ML Service (8000) and Backend API (5000) are running
if (Test-PortListening 8000) {
    Write-Host "[4/5] FastAPI ML Service already running on http://127.0.0.1:8000" -ForegroundColor Green
} else {
    Write-Host "[4/5] Starting FastAPI ML Service on http://127.0.0.1:8000..." -ForegroundColor Yellow
    Start-Process -FilePath "python" -ArgumentList "-m uvicorn app:app --host 127.0.0.1 --port 8000" -WorkingDirectory $MlDir -WindowStyle Hidden
}

if (Test-PortListening 5000) {
    Write-Host "[5/5] Backend API already running on http://localhost:5000" -ForegroundColor Green
} else {
    Write-Host "[5/5] Starting Backend API on http://localhost:5000..." -ForegroundColor Yellow
    Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $BackendDir -WindowStyle Hidden
}

if (-not (Test-PortListening 5173)) {
    Write-Host "[Frontend] Starting Vite dev server on http://localhost:5173..." -ForegroundColor Yellow
    Start-Process -FilePath $env:ComSpec -ArgumentList "/c npm run dev -- --host 127.0.0.1 --port 5173" -WorkingDirectory $FrontendDir -WindowStyle Hidden
}

# Verify backend health
for ($i = 0; $i -lt 15; $i++) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/health" -Method Get -TimeoutSec 5
        if ($health.status -eq "ok" -and $health.blockchain -eq "reachable") {
            Write-Host "=== TrustTrace Local Stack Ready ===" -ForegroundColor Green
            Write-Host ($health | ConvertTo-Json -Compress)
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}

