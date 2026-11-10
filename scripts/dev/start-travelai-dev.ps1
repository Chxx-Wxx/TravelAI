$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot "..\..")
).TrimEnd("\")
$serverRoot = Join-Path $projectRoot "server"
$runnerPath = Join-Path $PSScriptRoot "run-travelai-service.ps1"
$stopPath = Join-Path $PSScriptRoot "stop-travelai-dev.ps1"
$stateDirectory = Join-Path $projectRoot ".travelai-dev"
$statePath = Join-Path $stateDirectory "processes.json"
$stopRequestedPath = Join-Path $stateDirectory "stop-requested"
$backendOutLog = Join-Path $stateDirectory "backend.stdout.log"
$backendErrorLog = Join-Path $stateDirectory "backend.stderr.log"
$ngrokOutLog = Join-Path $stateDirectory "ngrok.stdout.log"
$ngrokErrorLog = Join-Path $stateDirectory "ngrok.stderr.log"

$state = [ordered]@{
  version = 1
  projectRoot = $projectRoot
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
  processes = [ordered]@{}
}

function Write-Step {
  param([string]$Message)
  Write-Host "[TravelAI] $Message" -ForegroundColor Cyan
}

function Save-State {
  $json = $state | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText(
    $statePath,
    $json,
    [Text.UTF8Encoding]::new($false)
  )
}

function Record-Process {
  param(
    [string]$Name,
    [System.Diagnostics.Process]$Process
  )

  $state.processes[$Name] = [ordered]@{
    pid = $Process.Id
    startTimeUtcTicks = $Process.StartTime.ToUniversalTime().Ticks
  }
  Save-State
}

function Test-TcpPort {
  param([int]$Port)

  $client = [Net.Sockets.TcpClient]::new()

  try {
    $task = $client.ConnectAsync("127.0.0.1", $Port)
    return $task.Wait(400) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Start-TravelAIService {
  param(
    [string]$Name,
    [string]$StandardOutputPath,
    [string]$StandardErrorPath,
    [switch]$Visible
  )

  $arguments = @(
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ('"{0}"' -f $runnerPath),
    "-Service",
    $Name,
    "-ProjectRoot",
    ('"{0}"' -f $projectRoot)
  )

  $options = @{
    FilePath = "powershell.exe"
    ArgumentList = $arguments
    WorkingDirectory = $projectRoot
    PassThru = $true
    NoNewWindow = $true
  }

  if (-not $Visible) {
    $options.RedirectStandardOutput = $StandardOutputPath
    $options.RedirectStandardError = $StandardErrorPath
  }

  return Start-Process @options
}

function Wait-ForBackend {
  param([System.Diagnostics.Process]$Process)

  $deadline = (Get-Date).AddSeconds(25)

  while ((Get-Date) -lt $deadline) {
    $Process.Refresh()

    if ($Process.HasExited) {
      throw "Express 서버가 시작 중 종료되었습니다. 로그: $backendErrorLog"
    }

    try {
      $result = Invoke-RestMethod `
        -Uri "http://127.0.0.1:4000/" `
        -TimeoutSec 2

      if ($result.message) {
        return
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  throw "Express 서버가 25초 안에 응답하지 않았습니다. 로그: $backendErrorLog"
}

function Wait-ForNgrokUrl {
  param([System.Diagnostics.Process]$Process)

  $deadline = (Get-Date).AddSeconds(30)

  while ((Get-Date) -lt $deadline) {
    $Process.Refresh()

    if ($Process.HasExited) {
      throw "ngrok이 연결 중 종료되었습니다. 로그: $ngrokErrorLog"
    }

    try {
      $response = Invoke-RestMethod `
        -Uri "http://127.0.0.1:4040/api/tunnels" `
        -TimeoutSec 2

      $tunnel = @($response.tunnels) |
        Where-Object {
          $_.public_url -match '^https://' -and
          [string]$_.config.addr -match '(^|:)4000/?$'
        } |
        Select-Object -First 1

      if ($tunnel) {
        return ([string]$tunnel.public_url).TrimEnd("/")
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  throw "ngrok HTTPS 주소를 30초 안에 확인하지 못했습니다. 로그: $ngrokErrorLog"
}

function Update-FrontendApiUrl {
  param([string]$ApiUrl)

  if ($ApiUrl -notmatch '^https://[^/\s]+$') {
    throw "ngrok에서 안전한 HTTPS origin을 받지 못했습니다."
  }

  $envPath = Join-Path $projectRoot ".env"
  $content = if (Test-Path -LiteralPath $envPath) {
    [IO.File]::ReadAllText($envPath)
  } else {
    ""
  }
  $pattern = '(?m)^[ \t]*EXPO_PUBLIC_API_URL[ \t]*=.*$'
  $matches = [regex]::Matches($content, $pattern)

  if ($matches.Count -gt 1) {
    throw "루트 .env에 EXPO_PUBLIC_API_URL이 여러 번 선언되어 자동 수정하지 않았습니다."
  }

  $newLine = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
  $replacement = "EXPO_PUBLIC_API_URL=$ApiUrl"

  if ($matches.Count -eq 1) {
    $updated = [regex]::Replace($content, $pattern, $replacement)
  } elseif ([string]::IsNullOrEmpty($content)) {
    $updated = "$replacement$newLine"
  } else {
    $separator = if ($content.EndsWith("`n")) { "" } else { $newLine }
    $updated = "$content$separator$replacement$newLine"
  }

  [IO.File]::WriteAllText(
    $envPath,
    $updated,
    [Text.UTF8Encoding]::new($false)
  )
}

try {
  if (-not (Test-Path -LiteralPath $serverRoot)) {
    throw "server 폴더를 찾을 수 없습니다: $serverRoot"
  }

  foreach ($command in @("node.exe", "npm.cmd", "npx.cmd")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
      throw "$command 명령을 찾을 수 없습니다. Node.js/npm 설치와 PATH를 확인해주세요."
    }
  }

  if (-not (Get-Command "ngrok.cmd" -ErrorAction SilentlyContinue)) {
    throw "ngrok 명령을 찾을 수 없습니다. ngrok 설치와 PATH 설정을 확인해주세요."
  }

  New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null

  if (Test-Path -LiteralPath $stopRequestedPath) {
    Remove-Item -LiteralPath $stopRequestedPath -Force
  }

  if (Test-Path -LiteralPath $statePath) {
    try {
      $oldState = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 |
        ConvertFrom-Json
      $activeNames = @()

      foreach ($name in @("backend", "ngrok", "expo")) {
        $record = $oldState.processes.$name

        if ($record -and (Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue)) {
          $activeNames += $name
        }
      }

      if ($activeNames.Count -gt 0) {
        throw "이 자동화가 시작한 프로세스가 이미 실행 중입니다: $($activeNames -join ', '). 먼저 'TravelAI: 개발 종료'를 실행해주세요."
      }

      Remove-Item -LiteralPath $statePath -Force
    } catch {
      throw "기존 실행 상태를 안전하게 확인하지 못했습니다. 'TravelAI: 개발 종료'로 상태를 확인해주세요. 원인: $($_.Exception.Message)"
    }
  }

  if (Test-TcpPort -Port 4000) {
    throw "포트 4000이 이미 사용 중입니다. 기존 서버를 직접 확인한 뒤 종료하거나 포트를 비워주세요. 자동으로 종료하지 않았습니다."
  }

  if (Test-TcpPort -Port 4040) {
    throw "ngrok 로컬 API 포트 4040이 이미 사용 중입니다. 기존 ngrok을 확인해주세요. 자동으로 종료하지 않았습니다."
  }

  if (Test-TcpPort -Port 8081) {
    throw "Expo/Metro 기본 포트 8081이 이미 사용 중입니다. 기존 Expo 프로세스를 확인해주세요. 자동으로 종료하지 않았습니다."
  }

  Save-State

  Write-Step "Express 서버를 시작합니다."
  $backend = Start-TravelAIService `
    -Name "backend" `
    -StandardOutputPath $backendOutLog `
    -StandardErrorPath $backendErrorLog
  Record-Process -Name "backend" -Process $backend
  Wait-ForBackend -Process $backend
  Write-Step "Express 서버가 포트 4000에서 응답합니다."

  Write-Step "ngrok HTTPS 터널을 시작합니다."
  $ngrok = Start-TravelAIService `
    -Name "ngrok" `
    -StandardOutputPath $ngrokOutLog `
    -StandardErrorPath $ngrokErrorLog
  Record-Process -Name "ngrok" -Process $ngrok
  $apiUrl = Wait-ForNgrokUrl -Process $ngrok
  Write-Step "ngrok 로컬 API에서 HTTPS Forwarding 주소를 확인했습니다."

  Update-FrontendApiUrl -ApiUrl $apiUrl
  Write-Step "루트 .env의 EXPO_PUBLIC_API_URL만 현재 터널 주소로 갱신했습니다."

  Write-Step "Expo를 시작합니다. 아래 터미널에서 QR코드를 확인하세요."
  $expo = Start-TravelAIService -Name "expo" -Visible
  Record-Process -Name "expo" -Process $expo

  $expo.WaitForExit()

  if (Test-Path -LiteralPath $stopRequestedPath) {
    Remove-Item -LiteralPath $stopRequestedPath -Force
    Write-Step "개발 종료 요청을 확인했습니다."
    exit 0
  }

  if ($expo.ExitCode -ne 0) {
    throw "Expo가 오류 코드 $($expo.ExitCode)로 종료되었습니다."
  }
} catch {
  Write-Host "[TravelAI] 개발 환경을 시작하지 못했습니다." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  & powershell.exe `
    -NoLogo `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $stopPath `
    -Quiet `
    -Internal
  exit 1
} finally {
  if (Test-Path -LiteralPath $statePath) {
    & powershell.exe `
      -NoLogo `
      -NoProfile `
      -ExecutionPolicy Bypass `
      -File $stopPath `
      -Quiet `
      -Internal
  }
}
