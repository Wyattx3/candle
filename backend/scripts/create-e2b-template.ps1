param(
  [string]$Name = "candle-autonomous-agent",
  [int]$CpuCount = 4,
  [int]$MemoryMb = 4096
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

Push-Location $root
try {
  npx e2b template create $Name `
    --dockerfile e2b.Dockerfile `
    --cmd "sleep infinity" `
    --ready-cmd "python3 --version && node --version && ffmpeg -version >/dev/null" `
    --cpu-count $CpuCount `
    --memory-mb $MemoryMb
} finally {
  Pop-Location
}
