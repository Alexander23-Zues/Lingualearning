param([switch]$Rebuild, [switch]$AdminSetup, [switch]$Preview, [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonCommand = (Get-Command python -ErrorAction Stop).Source
$port = if ($Preview) { 8080 } else { 3000 }
$appName = if ($Preview) { 'linguakids-connected-entry' } else { 'linguakids-react' }
$outputDirectory = Join-Path $projectRoot $(if ($Preview) { '.preview/react-entry' } else { '.preview/react-live' })
$arguments = @((Join-Path $PSScriptRoot 'build_react.py'), '--output', $outputDirectory)
if ($Preview) {
    & (Join-Path $PSScriptRoot 'open_react.ps1') -Rebuild:$Rebuild -NoOpen
    & $pythonCommand (Join-Path $PSScriptRoot 'prepare_connected_entry.py')
} else {
    & $pythonCommand @arguments
    if ($LASTEXITCODE -ne 0) { throw 'The React app could not be built.' }
    & (Join-Path $PSScriptRoot 'start_api.ps1')
}
$healthUrl = "http://127.0.0.1:$port/__preview_health"
$running = $false
try { $running = (Invoke-RestMethod $healthUrl -TimeoutSec 2).app -eq $appName } catch { }
if ($Rebuild) { $running=$false }
if (-not $running) {
    $connections = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    foreach ($connection in $connections) {
        $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
        if (-not $candidate) { continue }
        if ($candidate.CommandLine -like '*serve_preview.py*' -and
            $candidate.CommandLine.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            Stop-Process -Id $candidate.ProcessId -ErrorAction Stop
        } else { throw "Port $port belongs to another application. Close it before opening LinguaKids." }
    }
    $serverScript = Join-Path $PSScriptRoot 'serve_preview.py'
    $serverArguments = '"{0}" --port {1} --app-name {2} --directory "{3}"' -f $serverScript,$port,$appName,$outputDirectory
    $logPrefix = if ($Preview) { 'react-preview' } else { 'react-live' }
    $process = Start-Process -FilePath $pythonCommand -ArgumentList $serverArguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $projectRoot ".preview/$logPrefix.log") `
        -RedirectStandardError (Join-Path $projectRoot ".preview/$logPrefix-error.log")
    $process.Id | Set-Content (Join-Path $projectRoot ".preview/$logPrefix.pid")
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        try { $running = (Invoke-RestMethod $healthUrl -TimeoutSec 1).app -eq $appName; if ($running) { break } } catch { }
        if ($process.HasExited) { break }
    }
    if (-not $running) { throw "The React browser server did not start. See .preview/$logPrefix-error.log." }
}
$url = "http://localhost:$port/"
if ($Preview) { $url='http://localhost:3000/' }
if ($AdminSetup) { $url += '#/admin-setup' }
Write-Host "LinguaKids React is ready at $url"
if (-not $NoOpen) { Start-Process $url }
