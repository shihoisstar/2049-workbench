$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runId = 'wb-temporal-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$service = "$runId-service"
$runner = "$runId-runner"
$network = "$runId-network"
$volume = "$runId-deps"
$evidence = Join-Path $root "evidence/$runId"
$serverImage = 'temporalio/temporal:1.9.1@sha256:ad4c82c97bd12b417d1ea942610dbcd511afb250c4d5ed26c694009533df447e'
$nodeImage = 'node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$ownsNetwork = $false
$ownsService = $false
$ownsRunner = $false
$ownsVolume = $false
try {
  docker network create --label "wb.temporal-run=$runId" $network | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Network creation failed' }
  $ownsNetwork = $true
  docker volume create --label "wb.temporal-run=$runId" $volume | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Dependency volume creation failed' }
  $ownsVolume = $true
  docker run --detach --name $service --label "wb.temporal-run=$runId" --network $network --publish '127.0.0.1::7233' --cpus 2 --memory 1g $serverImage server start-dev --ip 0.0.0.0 --db-filename /tmp/wb-temporal.sqlite --headless --log-level warn | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Temporal service creation failed' }
  $ownsService = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    docker exec $service temporal operator cluster health --address 127.0.0.1:7233 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Temporal service did not become healthy' }
  docker exec $service temporal --version | Set-Content (Join-Path $evidence 'temporal-version.txt')
  docker image inspect $serverImage $nodeImage --format '{{json .RepoDigests}}' | Set-Content (Join-Path $evidence 'image-digests.txt')
  docker inspect $service --format '{{json .NetworkSettings.Ports}}' | Set-Content (Join-Path $evidence 'loopback-ports.json')
  docker create --name $runner --label "wb.temporal-run=$runId" --network $network --cpus 2 --memory 2g --mount "type=bind,source=$root,target=/experiment" --mount "type=volume,source=$volume,target=/experiment/node_modules,volume-nocopy" --workdir /experiment --env "TEMPORAL_ADDRESS=${service}:7233" --env "EVIDENCE_DIR=/experiment/evidence/$runId" $nodeImage sh -c 'npm ci --no-audit --no-fund --workspaces=false && npm test' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Experiment runner creation failed' }
  $ownsRunner = $true
  docker start --attach $runner
  if ($LASTEXITCODE -ne 0) { throw 'Runner dependency installation or Temporal proof failed; see evidence logs' }
  Write-Host "Evidence: $evidence"
} finally {
  if ($ownsRunner) {
    docker logs $runner 2>&1 | Set-Content (Join-Path $evidence 'runner.log')
    docker rm --force $runner | Out-Null
  }
  if ($ownsService) {
    docker logs $service 2>&1 | Set-Content (Join-Path $evidence 'service.log')
    docker rm --force $service | Out-Null
  }
  if ($ownsNetwork) { docker network rm $network | Out-Null }
  if ($ownsVolume) { docker volume rm $volume | Out-Null }
  $remaining = docker ps -a --filter "label=wb.temporal-run=$runId" --format '{{.Names}}'
  $remainingNetwork = docker network ls --filter "label=wb.temporal-run=$runId" --format '{{.Name}}'
  $remainingVolume = docker volume ls --filter "label=wb.temporal-run=$runId" --format '{{.Name}}'
  @{ runId = $runId; remainingContainers = @($remaining); remainingNetworks = @($remainingNetwork); remainingVolumes = @($remainingVolume) } | ConvertTo-Json | Set-Content (Join-Path $evidence 'cleanup.json')
}
