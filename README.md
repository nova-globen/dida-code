# Dida

A fast, minimal code editor for Windows, built by [Nova Globen AB](https://nova-globen.se) on top of [Code - OSS](https://github.com/microsoft/vscode).

Dida keeps the essentials — Explorer, Search, Git, an integrated PowerShell terminal, syntax highlighting for ~50 languages, light/dark themes that follow your OS — and removes everything else: no marketplace, no telemetry pipelines, no chat/AI, no debugger, no notebooks.

**Website:** <https://code.didabit.com> · **Issues:** <https://code.didabit.com/issues>

## Download

Grab the latest release from <https://code.didabit.com/download> (Windows ARM64; x64 planned).

## Building from source

```powershell
npm ci
npm run gulp -- vscode-win32-arm64   # package into dist\win32-arm64
# or
.\scripts\release.ps1                 # package + smoke check + zip
```

Requirements: Node.js (see `.nvmrc`), Python, and the usual Code - OSS native build prerequisites for Windows.

## License

Dida is source-available under the [Dida Source-Available License](LICENSE.txt): free for personal use and small organizations, paid for larger companies — see [PRICING.md](PRICING.md).

Dida is based on Code - OSS, Copyright (c) Microsoft Corporation, licensed under the [MIT License](LICENSE.vscode.txt). Third-party attributions are preserved in [ThirdPartyNotices.txt](ThirdPartyNotices.txt). Dida is not affiliated with or endorsed by Microsoft; "Visual Studio Code" and its icons are trademarks of Microsoft and are not used by this product.
