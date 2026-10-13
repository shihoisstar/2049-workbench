# 验收：studio-mine「我的」页真实余额与积分明细。前置：验收栈已恢复、works-api 已用新端点重启、dist/studio 已带 TARO_APP_API_NEXT_BASE 重建。
# 断言基准来自验收库 wb_next.ledger/wallets（主账户 8ef9ec03：5 条流水、余额 3）。
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$project = Join-Path $workspace 'apps/miniapp/dist/studio'
$wechatide = (Get-Command wechatide -ErrorAction Stop).Source
$checks = [Collections.Generic.List[string]]::new()
function Invoke-IdeTool([string]$Name, [string[]]$Arguments) {
  $output = (& $wechatide -c Codex $Name --project $project @Arguments | Out-String)
  $begin = $output.IndexOf('{')
  if ($begin -lt 0) { throw 'No tool result' }
  $response = $output.Substring($begin) | ConvertFrom-Json
  if (-not $response.ok) { throw "$Name failed: $($response.message)" }
  if ($response.result.PSObject.Properties.Name -contains 'success' -and -not $response.result.success) { throw "$Name failed" }
  return $response.result
}
function Tap([string]$Selector) {
  Invoke-IdeTool 'automation_element_action' @('--selector', $Selector, '--action', 'tap', '--wait-for-selector', $Selector, '--wait', '1') | Out-Null
}
function Read-Text([string]$Selector) {
  return Invoke-IdeTool 'automation_element_action' @('--selector', $Selector, '--action', 'text', '--wait-for-selector', $Selector, '--wait', '1')
}
function Evaluate([string]$Source) {
  return Invoke-IdeTool 'automation_evaluate' @('--fn-source', $Source)
}
function Check([bool]$Condition, [string]$Label) {
  if (-not $Condition) { throw "Assertion failed: $Label" }
  $checks.Add($Label)
}
& (Join-Path (Split-Path $wechatide) 'cli.bat') auto --project $project | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Automation initialization failed' }
Invoke-IdeTool 'automation_navigate' @('--action', 'reLaunch', '--url', '/pages/studio-home/index') | Out-Null
Tap '.studio-credit'
$text = Read-Text '#mine-balance'
Check ($text -match '当前积分' -and $text -match '刷新') 'Home balance card opens mine page'
Invoke-IdeTool 'automation_navigate' @('--action', 'navigateBack') | Out-Null
Invoke-IdeTool 'automation_navigate' @('--action', 'reLaunch', '--url', '/pages/studio-home/index') | Out-Null
Tap '#studio-nav-mine'
$text = Read-Text '#mine-balance'
Check ($text -match '当前积分' -and $text -match '(^|\D)3(\D|$)') 'Mine page renders server balance 3'
$text = Read-Text '#mine-entries'
Check ($text -match '结算返还' -and $text -match '消费预留' -and $text -match '退款返还' -and $text -match '积分赠送') 'All four ledger kinds render with Chinese labels'
Check ($text -match '\+77' -and $text -match '\-77' -and $text -match '\+80' -and $text -match '\+0') 'Signed amounts render: refund +77, holds -77, grant +80, settle +0'
Check ($text -match '注册赠送') 'Signup grant remark renders'
Check ($text -match '已显示全部明细' -and $text -notmatch '加载更多') 'Five-row ledger ends with all-shown footer, no more pages'
$rows = Evaluate 'function(){var r=[];document.querySelectorAll("#mine-entries .studio-mine-entry").forEach(function(e){r.push(e.textContent)});return JSON.stringify(r)}'
$parsed = $rows.result.result | ConvertFrom-Json
Check ($parsed.Count -eq 5) 'Exactly 5 ledger rows render, no cross-account leak (acceptance DB has 6 rows across 2 users)'
Check ($parsed[0] -match '结算返还' -and $parsed[0] -match '\+0') 'Newest row is the succeeded job settle +0'
$amounts = 0
foreach ($row in $parsed) { if ($row -match '([+-]\d+)$') { $amounts += [int]$Matches[1] } }
Check ($amounts -eq 3) 'Rendered amounts sum to balance 3 (80-77+77-77+0)'
$deactivate = Read-Text '#mine-deactivate'
Check ($deactivate -match '注销账户') 'Deactivation entry renders (modal intentionally not confirmed to preserve acceptance account)'
$folder = Join-Path $workspace 'docs/验收留档/MINE-2026-10-08'
New-Item -ItemType Directory -Force $folder | Out-Null
Invoke-IdeTool 'simulator_screenshot' @('--path', (Join-Path $folder 'mine-page.jpg')) | Out-Null
$report = @{ checks=$checks.ToArray(); passed=$checks.Count; paidCalls=0; limitations=@('Physical device not tested','Pull-down refresh and load-more not exercised (5 rows fit one page)','Deactivation modal intentionally not confirmed'); checkedAt=(Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Depth 5
$target = Join-Path $folder 'navigation-proof.json'
[IO.File]::WriteAllText($target, $report)
if ([IO.File]::ReadAllText($target) -ne $report) { throw 'Evidence readback failed' }
Write-Output $report
