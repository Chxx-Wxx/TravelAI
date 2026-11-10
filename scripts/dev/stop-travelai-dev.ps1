param(
  [switch]$Quiet,
  [switch]$Internal
)

$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot "..\..")
).TrimEnd("\")
$stateDirectory = Join-Path $projectRoot ".travelai-dev"
$statePath = Join-Path $stateDirectory "processes.json"
$stopRequestedPath = Join-Path $stateDirectory "stop-requested"
$hadSafetyFailure = $false

function Write-Status {
  param([string]$Message)

  if (-not $Quiet) {
    Write-Host $Message
  }
}

function Stop-OwnedProcessTree {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [object]$Record
  )

  $processId = [int]$Record.pid
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue

  if (-not $process) {
    Write-Status "- $Name 프로세스는 이미 종료되었습니다."
    return
  }

  $expectedTicks = [int64]$Record.startTimeUtcTicks
  $actualTicks = $process.StartTime.ToUniversalTime().Ticks

  if ($actualTicks -ne $expectedTicks) {
    Write-Warning "$Name PID가 다른 프로세스에 재사용되어 종료하지 않았습니다. (PID $processId)"
    $script:hadSafetyFailure = $true
    return
  }

  $rootProcess = Get-CimInstance Win32_Process `
    -Filter "ProcessId = $processId" `
    -ErrorAction SilentlyContinue
  $commandLine = [string]$rootProcess.CommandLine

  if (
    -not $rootProcess -or
    $commandLine -notmatch "run-travelai-service\.ps1" -or
    $commandLine -notmatch "-Service\s+$Name(?:\s|$)"
  ) {
    Write-Warning "$Name 프로세스의 실행 명령을 확인할 수 없어 종료하지 않았습니다. (PID $processId)"
    $script:hadSafetyFailure = $true
    return
  }

  $allProcesses = @(Get-CimInstance Win32_Process)
  $processIds = [System.Collections.Generic.List[int]]::new()
  $processIds.Add($processId)

  do {
    $added = $false

    foreach ($candidate in $allProcesses) {
      $candidateId = [int]$candidate.ProcessId
      $parentId = [int]$candidate.ParentProcessId

      if (
        $processIds.Contains($parentId) -and
        -not $processIds.Contains($candidateId)
      ) {
        $processIds.Add($candidateId)
        $added = $true
      }
    }
  } while ($added)

  for ($index = $processIds.Count - 1; $index -ge 0; $index -= 1) {
    Stop-Process -Id $processIds[$index] -Force -ErrorAction SilentlyContinue
  }

  Write-Status "- $Name 종료 완료"
}

if (-not (Test-Path -LiteralPath $statePath)) {
  Write-Status "TravelAI 자동 실행 상태가 없습니다. 종료할 프로세스가 없습니다."
  exit 0
}

try {
  $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 |
    ConvertFrom-Json
} catch {
  Write-Error "실행 상태 파일을 읽지 못했습니다. 안전을 위해 어떤 프로세스도 종료하지 않았습니다."
  exit 1
}

if (
  [IO.Path]::GetFullPath([string]$state.projectRoot).TrimEnd("\") -ne
  $projectRoot
) {
  Write-Error "상태 파일의 프로젝트 경로가 현재 작업공간과 달라 종료하지 않았습니다."
  exit 1
}

Write-Status "TravelAI 개발 프로세스를 안전하게 종료합니다."

if (-not $Internal) {
  [IO.File]::WriteAllText(
    $stopRequestedPath,
    (Get-Date).ToUniversalTime().ToString("o"),
    [Text.UTF8Encoding]::new($false)
  )
}

foreach ($name in @("expo", "ngrok", "backend")) {
  $record = $state.processes.$name

  if ($record) {
    Stop-OwnedProcessTree -Name $name -Record $record
  }
}

if ($hadSafetyFailure) {
  Write-Warning "일부 프로세스를 안전하게 식별하지 못해 상태 파일을 유지했습니다."
  exit 1
}

Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
Write-Status "TravelAI 개발 환경 종료가 완료되었습니다."
