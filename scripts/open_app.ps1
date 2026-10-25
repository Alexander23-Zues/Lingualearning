param([switch]$Rebuild, [switch]$AdminSetup, [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$appDirectory = Join-Path $projectRoot 'apps/linguakids_app'
$configFile = Join-Path $projectRoot '.preview/live-config.json'
$sdkFile = Join-Path $projectRoot '.preview/flutter-sdk.txt'
if (-not (Test-Path -LiteralPath $configFile)) { throw 'The live app configuration is missing.' }
$flutterCommand = Join-Path (Get-Content -LiteralPath $sdkFile -Raw).Trim() 'bin/flutter.bat'
$outputDirectory = Join-Path $appDirectory 'build/web_live'
$env:PUB_CACHE = Join-Path $projectRoot '.tools/pub-cache'
$env:CI = 'true'
& (Join-Path $PSScriptRoot 'start_api.ps1')
if ($Rebuild -or -not (Test-Path (Join-Path $outputDirectory 'index.html'))) {
    Push-Location $appDirectory
    try {
        & $flutterCommand --no-version-check build web --target lib/main.dart --output build/web_live `
            "--dart-define-from-file=$configFile" --no-web-resources-cdn --no-wasm-dry-run
        if ($LASTEXITCODE -ne 0) { throw 'The live app could not be built.' }
    } finally { Pop-Location }
}
$healthUrl = 'http://127.0.0.1:3000'
$appUrl = 'http://localhost:3000'
$running = $false
try { $running = (Invoke-RestMethod "$healthUrl/__preview_health" -TimeoutSec 2).app -eq 'linguakids-live' } catch { }
if (-not $running) {
    $pythonCommand = (Get-Command python -ErrorAction Stop).Source
    $serverScript = Join-Path $PSScriptRoot 'serve_preview.py'
    $arguments = '"{0}" --port 3000 --app-name linguakids-live --directory "{1}"' -f $serverScript,$outputDirectory
    $serverProcess = Start-Process -FilePath $pythonCommand -ArgumentList $arguments `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $projectRoot '.preview/live-server.log') `
        -RedirectStandardError (Join-Path $projectRoot '.preview/live-server-error.log')
    $serverProcess.Id | Set-Content (Join-Path $projectRoot '.preview/live-server.pid')
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        try {
            $running = (Invoke-RestMethod "$healthUrl/__preview_health" -TimeoutSec 1).app -eq 'linguakids-live'
            if ($running) { break }
        } catch { }
        if ($serverProcess.HasExited) { break }
    }
    if (-not $running) { throw 'The app server did not start. Check .preview/live-server-error.log.' }
}
if ($AdminSetup) { $appUrl += '/#/admin-setup' }
if (-not $NoOpen) {
    Write-Host "Opening LinguaKids at $appUrl"
    Start-Process $appUrl
}
