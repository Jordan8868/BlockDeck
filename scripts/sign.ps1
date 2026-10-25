param(
  [Parameter(Mandatory = $true)] [string] $PfxPath,
  [Parameter(Mandatory = $true)] [string] $PfxPassword,
  [string] $TimestampUrl = 'http://timestamp.digicert.com',
  [switch] $SkipRezip
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $root 'release\BlockDeck-win32-x64'
$setup = Join-Path $root 'release\BlockDeck-1.2.1-Setup.exe'
$portable = Join-Path $root 'release\BlockDeck-1.2.1-Portable-win64.zip'

if (-not (Test-Path $PfxPath)) { throw "找不到 PFX 证书：$PfxPath" }

$signtool = (Get-Command signtool.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $signtool) {
  $kits = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending
  foreach ($kit in $kits) {
    $candidate = Join-Path $kit.FullName 'x64\signtool.exe'
    if (Test-Path $candidate) { $signtool = $candidate; break }
  }
}
if (-not $signtool) {
  throw '找不到 signtool.exe，请安装 Windows SDK（Signing Tools）。'
}

$files = @(
  (Join-Path $appDir 'BlockDeck.exe'),
  (Join-Path $appDir 'BlockDeckApp.exe')
)
if (Test-Path $setup) { $files += $setup }

foreach ($file in $files) {
  if (-not (Test-Path $file)) { throw "待签名文件不存在：$file" }
  Write-Host "签名 $file"
  & $signtool sign /fd SHA256 /f $PfxPath /p $PfxPassword /tr $TimestampUrl /td SHA256 $file
  if ($LASTEXITCODE -ne 0) { throw "签名失败：$file" }
  & $signtool verify /pa /v $file
  if ($LASTEXITCODE -ne 0) { throw "签名校验失败：$file" }
}

if (-not $SkipRezip) {
  if (Test-Path $portable) { Remove-Item $portable -Force }
  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    & python (Join-Path $PSScriptRoot 'zip.py') $appDir $portable
    if ($LASTEXITCODE -ne 0) { throw '重新打包便携版 zip 失败' }
  } else {
    Compress-Archive -Path (Join-Path $appDir '*') -DestinationPath $portable -CompressionLevel Optimal
  }
  Write-Host "便携版已重新打包：$portable"
}

Write-Host '完成。SmartScreen 对“发布者”的显示取决于证书是否受信任以及 Microsoft 的声誉数据。'
