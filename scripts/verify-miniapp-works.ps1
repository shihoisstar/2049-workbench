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
function Check([bool]$Condition, [string]$Label) {
  if (-not $Condition) { throw "Assertion failed: $Label" }
  $checks.Add($Label)
}
& (Join-Path (Split-Path $wechatide) 'cli.bat') auto --project $project | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Automation initialization failed' }
Invoke-IdeTool 'automation_evaluate' @('--fn-source', 'function(){wx.removeStorageSync(`wb_v2_last_job`);return true}') | Out-Null
Invoke-IdeTool 'automation_navigate' @('--action', 'reLaunch', '--url', '/pages/studio-home/index') | Out-Null
Tap '#studio-nav-works'
$text = Read-Text '#works-list'
Check ($text -match '已消耗 77 积分') 'Server list restores paid work without local last-job ID'
Check ($text -match '预留积分已退还') 'Failed task displays refunded state'
Tap '#work-5903130a-88f4-4724-bbc1-66a4a15c0d2f'
$text = Read-Text '.studio-result'
Check ($text -match '5903130a-88f4-4724-bbc1-66a4a15c0d2f' -and $text -match '你的成片已就绪') 'Work opens original real video'
Invoke-IdeTool 'automation_navigate' @('--action', 'navigateBack') | Out-Null
Check ((Read-Text '#works-list') -match '已完成') 'Native back restores works list'
Invoke-IdeTool 'automation_navigate' @('--action', 'reLaunch', '--url', '/pages/studio-home/index') | Out-Null
Check ((Read-Text '#last-generated-video') -match '我的视频任务') 'Home restores latest task from server after relaunch'
Tap '#studio-nav-works'
$folder = Join-Path $workspace 'docs/验收留档/WORKS-2026-10-07'
New-Item -ItemType Directory -Force $folder | Out-Null
Invoke-IdeTool 'simulator_screenshot' @('--path', (Join-Path $folder 'works-list.jpg')) | Out-Null
$report = @{ checks=$checks.ToArray(); passed=$checks.Count; paidCalls=0; limitations=@('Physical device not tested','Empty/error UI not exercised in simulator'); checkedAt=(Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Depth 5
$target = Join-Path $folder 'navigation-proof.json'
[IO.File]::WriteAllText($target, $report)
if ([IO.File]::ReadAllText($target) -ne $report) { throw 'Evidence readback failed' }
Write-Output $report
