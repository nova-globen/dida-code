<#
.SYNOPSIS
	Builds a release of Dida (Code Light) into dist\ and zips it.

.DESCRIPTION
	Steps:
	  1. Optionally reinstall node modules (-CleanInstall).
	  2. Package the product with gulp into dist\win32-<arch>.
	  3. Smoke-check the produced executable (--version).
	  4. Zip the package to dist\Dida-win32-<arch>-<version>.zip (-NoZip to skip).

.EXAMPLE
	.\scripts\release.ps1
	.\scripts\release.ps1 -Arch arm64 -CleanInstall
#>
[CmdletBinding()]
param(
	[ValidateSet('arm64', 'x64')]
	[string]$Arch = 'arm64',
	[switch]$CleanInstall,
	[switch]$NoZip,
	# Release builds are minified by default; pass -NoMinify for a debuggable build
	[switch]$NoMinify,
	# Compile the Inno Setup user installer (requires ISCC.exe on PATH or in %LOCALAPPDATA%\Programs\Inno Setup 6)
	[switch]$Installer
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$version = (Get-Content (Join-Path $repoRoot 'package.json') | ConvertFrom-Json).version
$destination = Join-Path $repoRoot "dist\win32-$Arch"

Write-Host "== Dida release build v$version (win32-$Arch) ==" -ForegroundColor Cyan

$gitStatus = git status --porcelain
if ($gitStatus) {
	Write-Warning 'Working tree is not clean; the build will include uncommitted changes.'
}

if ($CleanInstall) {
	Write-Host '-- npm ci' -ForegroundColor Cyan
	npm ci
	if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

	# Newer npm versions ignore the electron runtime settings in .npmrc, which
	# leaves native modules built against desktop Node and crashes the file
	# watcher utility process (0xC0000409). Rebuild explicitly for Electron.
	Write-Host '-- rebuilding native modules for Electron' -ForegroundColor Cyan
	$electronVersion = (Get-Content (Join-Path $repoRoot 'package.json') | ConvertFrom-Json).devDependencies.electron
	$env:npm_config_runtime = 'electron'
	$env:npm_config_target = $electronVersion
	$env:npm_config_disturl = 'https://electronjs.org/headers'
	$env:npm_config_build_from_source = 'true'
	npm rebuild @parcel/watcher
	if ($LASTEXITCODE -ne 0) { throw 'native module rebuild failed' }
}

$buildTask = if ($NoMinify) { "vscode-win32-$Arch" } else { "vscode-win32-$Arch-min" }
Write-Host "-- gulp $buildTask" -ForegroundColor Cyan
npm run gulp -- $buildTask
if ($LASTEXITCODE -ne 0) { throw "gulp $buildTask failed (a running Dida.exe from dist\ locks the folder — close it and retry)" }

# strip sourcemaps from the shipped output
Get-ChildItem -Path (Join-Path $destination 'resources\app\out') -Filter '*.map' -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force
# the product UI is English-only; keep just the Electron en-US locale
Get-ChildItem -Path (Join-Path $destination 'locales') -Filter '*.pak' -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'en-US.pak' } | Remove-Item -Force
# The gulp task chain ends with a code-signing step that fails without
# signtool.exe; the package itself is complete once the executable exists.
$exe = Get-ChildItem -Path $destination -Filter '*.exe' -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'unins' } | Select-Object -First 1
if (-not $exe) { throw "Package not found in $destination" }

Write-Host '-- smoke check: bin\dida.cmd --version' -ForegroundColor Cyan
# the GUI exe writes nothing to a captured stdout on Windows; the CLI wrapper does
$reported = & (Join-Path $destination 'bin\dida.cmd') --version 2>$null | Select-Object -First 1
if (-not $reported) { throw 'smoke check failed: executable did not report a version' }
Write-Host "   reported version: $reported"

if (-not $NoZip) {
	$zipPath = Join-Path $repoRoot "dist\Dida-win32-$Arch-$version.zip"
	Write-Host "-- zipping to $zipPath" -ForegroundColor Cyan
	if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
	Compress-Archive -Path (Join-Path $destination '*') -DestinationPath $zipPath
	Write-Host "   $([math]::Round((Get-Item $zipPath).Length / 1MB, 1)) MB"
}

if ($Installer) {
	$iscc = (Get-Command ISCC.exe -ErrorAction SilentlyContinue)?.Source
	if (-not $iscc) {
		$candidate = Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'
		if (Test-Path $candidate) { $iscc = $candidate }
	}
	if (-not $iscc) { throw 'ISCC.exe not found; install Inno Setup 6 (https://jrsoftware.org/isinfo.php)' }
	Write-Host '-- compiling installer' -ForegroundColor Cyan
	& $iscc "/DArch=$Arch" "/DAppVersion=$version" "/DSourceDir=$destination" "/O$(Join-Path $repoRoot 'dist')" (Join-Path $repoRoot 'build\win32\dida-setup.iss')
	if ($LASTEXITCODE -ne 0) { throw 'installer compilation failed' }
}

Write-Host "== Done: $destination ==" -ForegroundColor Green
