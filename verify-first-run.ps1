param(
  [string]$BaseUrl = "http://127.0.0.1:5000"
)

$ErrorActionPreference = 'Stop'

function Check($Name, $ScriptBlock) {
  try {
    $result = & $ScriptBlock
    Write-Host "[PASS] $Name" -ForegroundColor Green
    return $result
  } catch {
    Write-Host "[FAIL] $Name`n$($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

Check "GET /api/liturgy/status" {
  Invoke-RestMethod "$BaseUrl/api/liturgy/status" | Out-Null
}

Check "POST /api/liturgy/start" {
  Invoke-RestMethod "$BaseUrl/api/liturgy/start" -Method Post -ContentType "application/json" -Body "{}" | Out-Null
}

Check "POST /api/liturgy/process" {
  $audioData = 0..4095 | ForEach-Object { [Math]::Sin($_ / 20) * 0.01 }
  $body = @{ audioData = $audioData; timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Depth 4
  Invoke-RestMethod "$BaseUrl/api/liturgy/process" -Method Post -ContentType "application/json" -Body $body | Out-Null
}

Check "POST /api/control/page/set" {
  $body = @{ page = 2; reason = "verify"; confidence = 1 } | ConvertTo-Json
  Invoke-RestMethod "$BaseUrl/api/control/page/set" -Method Post -ContentType "application/json" -Body $body | Out-Null
}

Write-Host "All first-run checks passed." -ForegroundColor Green
