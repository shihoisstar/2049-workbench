$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$project = Join-Path $workspace 'apps/miniapp/dist/studio'
$wechatide = (Get-Command wechatide -ErrorAction Stop).Source
$legacyCli = Join-Path (Split-Path $wechatide) 'cli.bat'
$checks = [Collections.Generic.List[string]]::new()
function Invoke-IdeTool([string]$ToolName, [string[]]$ToolArguments) {
  $output = (& $wechatide -c Codex $ToolName --project $project @ToolArguments | Out-String)
  $begin = $output.IndexOf('{')
  if ($begin -lt 0) { throw "$ToolName returned no JSON" }
  $response = $output.Substring($begin) | ConvertFrom-Json
  if (-not $response.ok) { throw "$ToolName failed: $($response.message)" }
  if ($response.result.PSObject.Properties.Name -contains 'success' -and -not $response.result.success) { throw "$ToolName did not succeed" }
  return $response.result
}
function Check([bool]$Condition, [string]$Label) {
  if (-not $Condition) { throw "Assertion failed: $Label" }
  $checks.Add($Label)
}
function Tap([string]$Selector) {
  Invoke-IdeTool 'automation_element_action' @('--selector', $Selector, '--action', 'tap', '--wait-for-selector', $Selector, '--wait', '1') | Out-Null
}
function BackHome {
  Invoke-IdeTool 'automation_navigate' @('--action', 'navigateBack') | Out-Null
  $stack = Invoke-IdeTool 'automation_runtime_info' @('--action', 'pageStack')
  Check ($stack.pageStack.Count -eq 1 -and $stack.pageStack[0].path -eq 'pages/studio-home/index') 'Native back returns to the single home page'
}

# Initialize the official automation runtime before atomically driving elements.
# Service-port and Codex authorization must already be granted in the IDE.
& $legacyCli auto --project $project
if ($LASTEXITCODE -ne 0) { throw 'IDE automation initialization failed' }
Invoke-IdeTool 'automation_navigate' @('--action', 'reLaunch', '--url', '/pages/studio-home/index') | Out-Null
Invoke-IdeTool 'automation_runtime_info' @('--action', 'currentPage') | Out-Null
Tap '#studio-create-drama'
Tap '#studio-mode-script'
$limit = Invoke-IdeTool 'automation_element_action' @('--selector', '.drama-content-input', '--action', 'attribute', '--name', 'maxlength', '--wait-for-selector', '.drama-content-input')
Check ($limit -eq 20000) 'Script mode enforces 20000-character input'
$page = Invoke-IdeTool 'automation_runtime_info' @('--action', 'currentPage')
Check ($page.currentPage.path -eq 'pages/studio-drama-create/index' -and $page.currentPage.query.mode -eq 'script') 'Script choice navigates with mode=script'
BackHome
$sheets = Invoke-IdeTool 'automation_page_action' @('--action', 'querySelectorAll', '--selector', '.studio-mode-sheet')
Check ($sheets.elements.Count -eq 0) 'Returning does not retain the modal'
Tap '#studio-create-drama'
Tap '.studio-mode-close'
$sheets = Invoke-IdeTool 'automation_page_action' @('--action', 'querySelectorAll', '--selector', '.studio-mode-sheet')
Check ($sheets.elements.Count -eq 0) 'Close dismisses the modal'
Tap '#studio-create-drama'
Tap '#studio-mode-idea'
$limit = Invoke-IdeTool 'automation_element_action' @('--selector', '.drama-content-input', '--action', 'attribute', '--name', 'maxlength', '--wait-for-selector', '.drama-content-input')
Check ($limit -eq 1000) 'Idea mode enforces 1000-character input'
$page = Invoke-IdeTool 'automation_runtime_info' @('--action', 'currentPage')
Check ($page.currentPage.path -eq 'pages/studio-drama-create/index' -and $page.currentPage.query.mode -eq 'idea') 'Idea choice navigates with mode=idea'
BackHome
$report = @{ checkedAtUtc = [DateTime]::UtcNow.ToString('o'); project = $project; assertions = $checks.Count; checks = @($checks); result = 'passed'; paidCalls = 0 }
$path = Join-Path $workspace 'docs/验收留档/UI-2026-10-06/navigation-runtime.json'
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $path -Encoding utf8
$readback = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
Check ($readback.assertions -eq 8 -and $readback.result -eq 'passed') 'Evidence readback'
Write-Output "Navigation: 8 interaction assertions passed; evidence read back. $path"
