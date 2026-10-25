$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$appDirectory = Join-Path $projectRoot 'apps/linguakids_app'
$flutterCommand = Join-Path $projectRoot '.tools/flutter/bin/flutter.bat'
$savedSdk = Join-Path $projectRoot '.preview/flutter-sdk.txt'
if (Test-Path -LiteralPath $savedSdk) {
    $savedFlutterCommand = Join-Path (Get-Content -LiteralPath $savedSdk -Raw).Trim() 'bin/flutter.bat'
    if (Test-Path -LiteralPath $savedFlutterCommand) { $flutterCommand = $savedFlutterCommand }
}
$outputFile = Join-Path $appDirectory 'build/web_preview/index.html'
$previewUrl = 'http://127.0.0.1:8080'
$env:PUB_CACHE = Join-Path $projectRoot '.tools/pub-cache'
& (Join-Path $PSScriptRoot 'start_api.ps1')
# Keep the connected account page available behind the preview's account links.
if (Test-Path -LiteralPath (Join-Path $projectRoot '.preview/live-config.json')) {
    & (Join-Path $PSScriptRoot 'open_app.ps1') -NoOpen
}

if (-not (Test-Path -LiteralPath $outputFile)) {
    if (-not (Test-Path -LiteralPath $flutterCommand)) {
        throw 'The configured Flutter SDK is missing.'
    }
    Push-Location $appDirectory
    try {
        & $flutterCommand --no-version-check pub get
        if ($LASTEXITCODE -ne 0) { throw 'Could not install Flutter dependencies.' }
        & $flutterCommand --no-version-check build web --target lib/main_preview.dart --output build/web_preview --no-web-resources-cdn --no-wasm-dry-run
        if ($LASTEXITCODE -ne 0) { throw 'Could not build the preview.' }
    } finally { Pop-Location }
}

$running = $false
try {
    $health = Invoke-RestMethod "$previewUrl/__preview_health" -TimeoutSec 2
    $running = $health.app -eq 'linguakids-preview'
} catch { }

if (-not $running) {
    $logDirectory = Join-Path $projectRoot '.preview'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $pythonCommand = (Get-Command python -ErrorAction Stop).Source
    $serverScript = Join-Path $PSScriptRoot 'serve_preview.py'
    $serverProcess = Start-Process -FilePath $pythonCommand `
        -ArgumentList @('"' + $serverScript + '"') `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDirectory 'server.log') `
        -RedirectStandardError (Join-Path $logDirectory 'server-error.log')
    $serverProcess.Id | Set-Content (Join-Path $logDirectory 'server.pid')
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        try {
            $health = Invoke-RestMethod "$previewUrl/__preview_health" -TimeoutSec 1
            if ($health.app -eq 'linguakids-preview') { $running = $true; break }
        } catch { }
        if ($serverProcess.HasExited) { break }
    }
    if (-not $running) { throw 'Preview could not start. Check .preview/server-error.log and whether port 8080 is in use.' }
}

Write-Host "Opening LinguaKids at $previewUrl"
Start-Process $previewUrl
