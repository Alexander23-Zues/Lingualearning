param([switch]$NoOpen)
$ErrorActionPreference='Stop'
$collectionRoot=$PSScriptRoot
$pythonExe=(Get-Command python -ErrorAction Stop).Source
if(Test-Path -LiteralPath (Join-Path $collectionRoot 'Open Local AI.ps1')){& (Join-Path $collectionRoot 'Open Local AI.ps1')}
$ready=$false
$expectedDatabase=[IO.Path]::GetFullPath((Join-Path $collectionRoot 'data\collection.sqlite3'))
try {$health=Invoke-RestMethod 'http://127.0.0.1:8787/health' -TimeoutSec 3;$ready=$health.app -eq 'linguakids-offline-collection' -and [IO.Path]::GetFullPath($health.database) -eq $expectedDatabase} catch {}
if(-not $ready){
    if(Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue){throw 'Port 8787 is used by another application. It was left unchanged.'}
    $arguments='-u "{0}" --data "{1}" --web "{2}"' -f (Join-Path $collectionRoot 'offline_collection_server.py'),(Join-Path $collectionRoot 'data'),(Join-Path $collectionRoot 'web')
    $aiConfig=Join-Path $collectionRoot 'private-ai.json'
    if(Test-Path -LiteralPath $aiConfig){$arguments+=' --ai-config "'+$aiConfig+'"'}
    $serverProcess=Start-Process -FilePath $pythonExe -ArgumentList $arguments -WorkingDirectory $collectionRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $collectionRoot 'server.log') -RedirectStandardError (Join-Path $collectionRoot 'server-error.log')
    $serverProcess.Id | Set-Content -LiteralPath (Join-Path $collectionRoot 'server.pid')
    $deadline=(Get-Date).AddSeconds(90)
    while((Get-Date) -lt $deadline){
        Start-Sleep -Milliseconds 400
        try {if((Invoke-RestMethod 'http://127.0.0.1:8787/health' -TimeoutSec 2).storage -eq 'sqlite'){$ready=$true;break}} catch {}
        if($serverProcess.HasExited){break}
    }
}
if(-not $ready){throw 'The local collection did not start. Check server-error.log. Your data folder was not removed.'}
Write-Host 'Offline collection ready: http://localhost:8787/#/login'
Write-Host ('Database and audio: '+(Join-Path $collectionRoot 'data'))
if(-not $NoOpen){Start-Process 'http://localhost:8787/#/login'}
