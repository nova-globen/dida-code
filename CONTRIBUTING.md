# Contributing to Dida

Thanks for your interest in Dida!

## Reporting issues

Report bugs and feature requests at <https://code.didabit.com/issues>.
Please include the Dida version (Help > About), your Windows version, and
steps to reproduce.

## Contributing code

Dida is a focused, minimal distribution — we deliberately keep the feature
surface small, so please open an issue to discuss a change before investing
time in a pull request. Contributions are accepted under the terms of the
[Dida Source-Available License](LICENSE.txt).

### Building

```powershell
npm ci
.\scripts\release.ps1        # package + smoke check + zip into dist\
```

Validate changes with `npm run typecheck-client` before submitting.

## Upstream

Dida is based on [Code - OSS](https://github.com/microsoft/vscode).
Improvements that are not Dida-specific are usually best contributed
upstream.
