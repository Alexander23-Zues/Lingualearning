param([switch]$Restart)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if ($Restart) {
    $pidFile = Join-Path $projectRoot '.preview/api.pid'
    if (Test-Path -LiteralPath $pidFile) {
        $apiProcessId = 0
        if ([int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$apiProcessId)) {
            $apiCandidate = Get-CimInstance Win32_Process -Filter "ProcessId=$apiProcessId" -ErrorAction SilentlyContinue
            $apiSource = Join-Path $projectRoot 'services/api'
            if ($apiCandidate -and $apiCandidate.CommandLine -like '*uvicorn*app.main:app*' -and
                $apiCandidate.CommandLine.IndexOf($apiSource, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
                $apiCandidate.CommandLine -match '--port\s+8010(?:\s|$)') {
                Stop-Process -Id $apiProcessId -ErrorAction Stop
            }
        }
    }
}
$configPath=Join-Path $projectRoot '.preview/live-config.json'
if(-not (Test-Path -LiteralPath $configPath)){return}
$config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$envFile=Join-Path $projectRoot '.env'
if(-not (Test-Path -LiteralPath $envFile)) {
    @("SUPABASE_URL=$($config.SUPABASE_URL)","SUPABASE_PUBLISHABLE_KEY=$($config.SUPABASE_PUBLISHABLE_KEY)","ENVIRONMENT=development") | Set-Content -LiteralPath $envFile
}
& (Join-Path $PSScriptRoot 'start_inference.ps1') -Restart:$Restart
try {if((Invoke-RestMethod 'http://127.0.0.1:8010/health' -TimeoutSec 2).status -eq 'ok'){return}}catch{}
$runtimePython=Join-Path $projectRoot '.tools/ai-runtime-venv/Scripts/python.exe'
$pythonCommand=if(Test-Path -LiteralPath $runtimePython){$runtimePython}else{(Get-Command python -ErrorAction Stop).Source}
$arguments='-m uvicorn app.main:app --app-dir "{0}" --env-file "{1}" --host 127.0.0.1 --port 8010' -f (Join-Path $projectRoot 'services/api'),$envFile
$apiProcess=Start-Process -FilePath $pythonCommand -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $projectRoot '.preview/api.log') -RedirectStandardError (Join-Path $projectRoot '.preview/api-error.log')
$apiProcess.Id | Set-Content (Join-Path $projectRoot '.preview/api.pid')
for($attempt=0;$attempt -lt 20;$attempt++) {
    Start-Sleep -Milliseconds 250
    try{if((Invoke-RestMethod 'http://127.0.0.1:8010/health' -TimeoutSec 1).status -eq 'ok'){return}}catch{}
    if($apiProcess.HasExited){break}
}
Write-Warning 'The translation API did not start. See .preview/api-error.log.'
