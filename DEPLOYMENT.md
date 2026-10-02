# Deployment

## Build artifact

The app is a static Vite build. Generate the atlas and production files with:

```sh
npm ci
npm run atlas:build
npm run typecheck
npm run build
```

The uploadable archive is `artifacts/pirate-battle-cloud.zip`; it contains the contents of `dist/`, including `index.html`, the MSW worker, atlas files, and hashed runtime assets. Extract the archive into a web root without adding an extra `dist` directory level. All requests are same-origin, so no API credentials or environment file is needed.

## ServerSpace VM

Live demo: [https://nucleusdigital.online:5173/](https://nucleusdigital.online:5173/). It uses the existing valid TLS certificate for `nucleusdigital.online` so browsers can register MSW's service worker. On 2026-10-02, Apache was confirmed on 80/443 and XAMPP on 8080/8443; a dedicated `pirate-battle-5173.service` now serves the static build over HTTPS from `/opt/pirate-battle/site` as the unprivileged `pirate-battle` account. Apache and XAMPP configs and processes were left untouched. A certbot deploy hook restarts only this service after certificate renewal.

The install verified that `/opt/pirate-battle`, the `pirate-battle` account, and `pirate-battle-5173.service` were free before creating them. The service is active and enabled; local and external HTTPS checks return 200 for the app, `mockServiceWorker.js`, and the atlas. A real Chromium check confirmed MSW controlled the page and the ranking/scenario endpoints returned 200 with fixtures. Provider firewall access on port 5173 is working; no firewall rules were changed.

The Vite preview server is for local validation only. The deployed static HTTPS server runs unprivileged, receives its certificate through systemd credentials, and is isolated from existing web services.

## Rollback

Stop and disable only `pirate-battle-5173.service`. Remove only `/opt/pirate-battle/site` after resolving and verifying the path and confirming it contains this release. Preserve the dedicated account and parent directory unless their ownership is verified. Do not kill processes by port or touch Apache/XAMPP services.
