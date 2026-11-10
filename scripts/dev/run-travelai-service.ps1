param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("backend", "ngrok", "expo")]
  [string]$Service,

  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot
)

$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $ProjectRoot

switch ($Service) {
  "backend" {
    Set-Location -LiteralPath (Join-Path $ProjectRoot "server")
    & npm.cmd start
    exit $LASTEXITCODE
  }

  "ngrok" {
    $ngrokCommand = Get-Command "ngrok.cmd" -ErrorAction Stop
    $ngrokExe = Join-Path `
      (Split-Path -Parent $ngrokCommand.Path) `
      "node_modules\ngrok\bin\ngrok.exe"

    if (-not (Test-Path -LiteralPath $ngrokExe)) {
      throw "ngrok.exe를 찾을 수 없습니다. ngrok 전역 설치를 확인해주세요."
    }

    & $ngrokExe http 4000 --log=stdout --log-format=json
    exit $LASTEXITCODE
  }

  "expo" {
    & npx.cmd expo start --tunnel --clear
    exit $LASTEXITCODE
  }
}
