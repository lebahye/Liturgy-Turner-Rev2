param(
  [string]$BaseUrl = "http://127.0.0.1:5000"
)

$ErrorActionPreference = 'Stop'

function Pass($msg) { Write-Host "[PASS] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; exit 1 }

function Check($name, $block) {
  try { & $block; Pass $name }
  catch { Fail "$name`n$($_.Exception.Message)" }
}

Check "GET /api/liturgy/status" {
  $r = Invoke-RestMethod "$BaseUrl/api/liturgy/status"
  if (-not $r.initialized) { throw "Tracker not initialized" }
}

Check "POST /api/liturgy/start" {
  $r = Invoke-RestMethod "$BaseUrl/api/liturgy/start" -Method Post -ContentType "application/json" -Body "{}"
  if ($r.status -ne "started") { throw "Unexpected start response" }
}

Check "POST /api/liturgy/process synthetic" {
  $audioData = 0..4095 | ForEach-Object { [Math]::Sin($_ / 20) * 0.01 }
  $body = @{ audioData = $audioData; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Depth 4
  $r = Invoke-RestMethod "$BaseUrl/api/liturgy/process" -Method Post -ContentType "application/json" -Body $body
  if ($null -eq $r.page) { throw "No page in response" }
}

Check "Initialize control state" {
  $body = @{ pdfPath = "/uploads/pdfs/liturgy.pdf"; totalPages = 183 } | ConvertTo-Json
  $r = Invoke-RestMethod "$BaseUrl/api/control/pdf/set" -Method Post -ContentType "application/json" -Body $body
  if (-not $r.success) { throw "control/pdf/set failed" }
}

Check "POST /api/control/page/set" {
  $body = @{ page = 2; reason = "release_gate"; confidence = 1 } | ConvertTo-Json
  $r = Invoke-RestMethod "$BaseUrl/api/control/page/set" -Method Post -ContentType "application/json" -Body $body
  if (-not $r.success) { throw "control/page/set failed" }
}

Check "GET /api/control/state" {
  $r = Invoke-RestMethod "$BaseUrl/api/control/state"
  if ($r.state.page -lt 1) { throw "Invalid page in state" }
}

Check "UI root returns HTML" {
  $resp = Invoke-WebRequest "$BaseUrl/" -UseBasicParsing
  if ($resp.StatusCode -ne 200) { throw "Unexpected status code $($resp.StatusCode)" }
  if (-not ($resp.Content -match '<!doctype html>|<html')) { throw "Root did not return HTML" }
}

Write-Host "All release-gate checks passed." -ForegroundColor Green
