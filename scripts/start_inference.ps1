param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) { return }
$settings = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
        $settings[$matches[1]] = $matches[2].Trim().Trim([char]34).Trim([char]39)
    }
}
# A remote inference deployment manages its own lifecycle.
$baseUrl = if ($settings['INFERENCE_BASE_URL']) { $settings['INFERENCE_BASE_URL'] } else { 'http://127.0.0.1:8001' }
$serviceUri = [Uri]$baseUrl
if ($serviceUri.Host -notin @('localhost', '127.0.0.1') -or $serviceUri.Port -ne 8001) { return }
if (-not $settings['INFERENCE_SHARED_SECRET']) {
    Write-Warning 'Local translation needs INFERENCE_SHARED_SECRET in the private .env file.'
    return
}
$healthUrl = 'http://127.0.0.1:8001/health'
$connections = @(Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue)
if ($Restart) {
    $processIds = @($connections | ForEach-Object { $_.OwningProcess })
    $pidFile = Join-Path $projectRoot '.preview/inference.pid'
    if (Test-Path -LiteralPath $pidFile) {
        $recordedProcessId = 0
        if ([int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$recordedProcessId)) { $processIds += $recordedProcessId }
    }
    foreach ($inferenceProcessId in @($processIds | Select-Object -Unique)) {
        $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$inferenceProcessId" -ErrorAction SilentlyContinue
        if (-not $candidate) { continue }
        $inferenceSource = Join-Path $projectRoot 'services/inference'
        if ($candidate -and $candidate.CommandLine -like '*uvicorn*app.main:app*' -and
            $candidate.CommandLine.IndexOf($inferenceSource, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            $candidate.CommandLine -match '--port\s+8001(?:\s|$)') {
            Stop-Process -Id $candidate.ProcessId -ErrorAction Stop
        } else { throw 'Port 8001 belongs to another application; it was left running.' }
    }
} else {
    try {
        if ((Invoke-RestMethod $healthUrl -TimeoutSec 2).ready) { return }
    } catch { }
    if ($connections.Count -gt 0) { throw 'Translation service is not ready. Run scripts/start_inference.ps1 -Restart and inspect .preview/inference-error.log.' }
}
$pythonCommand = (Get-Command python -ErrorAction Stop).Source
$arguments = '-m uvicorn app.main:app --app-dir "{0}" --env-file "{1}" --host 127.0.0.1 --port 8001' -f (Join-Path $projectRoot 'services/inference'),$envFile
$logDirectory = Join-Path $projectRoot '.preview'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$process = Start-Process -FilePath $pythonCommand -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logDirectory 'inference.log') -RedirectStandardError (Join-Path $logDirectory 'inference-error.log')
$process.Id | Set-Content (Join-Path $logDirectory 'inference.pid')
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) { throw 'Translation service stopped. See .preview/inference-error.log.' }
    try {
        $health = Invoke-RestMethod $healthUrl -TimeoutSec 1
        if ($health.ready) { Write-Host "Local translation is ready ($($health.model_version))."; return }
    } catch { }
    Start-Sleep -Milliseconds 500
}
throw 'Translation model is still loading. See .preview/inference-error.log and retry once it is ready.'
