# ABF Middle Day Logger + Rest Timer

Static no-framework workout logger for GitHub Pages.

## Deploy to GitHub Pages

1. Create a repository.
2. Add all files in repo root and push to `main`.
3. GitHub -> Settings -> Pages.
4. Source: `Deploy from a branch`, Branch: `main`, Folder: `/ (root)`.
5. Open `https://<user>.github.io/<repo>/`.

## Add to Home Screen

### Android
1. Open URL in Chrome.
2. Menu -> `Install app` or `Add to Home screen`.

### iOS
1. Open URL in Safari.
2. Share -> `Add to Home Screen`.

## Icons

Use valid PNG binaries:
- `icons/icon-192.png`
- `icons/icon-512.png`

## Cache Busting

After updates, bump `CACHE_VERSION` in `service-worker.js`.

## Security/AV Hardening

- No external libraries/CDNs.
- No eval or dynamic code execution.
- No malformed placeholder binaries.
- DOM rendering avoids `innerHTML` for logs/summary.
