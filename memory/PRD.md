# ONLİNE KUR — PRD

## Original Problem Statement
Upgrade an existing project into "ONLİNE KUR" — a premium Turkish gold & currency price-tracking app (market watch + calculator only; NO trading/wallet/transactions). Single data source: Altınkaynak (Gold + Currency public JSON). Backend proxies/polls/caches, applies admin margin rules; mobile never hits Altınkaynak directly. Premium light/dark themes, 5-tab bottom nav, hidden JWT admin panel with margin engine, manual price, draft/publish, provider health.

Note: Workspace was actually a fresh Expo template (no legacy "ALTIN SARAYI" code), so ONLİNE KUR was built onto the template.

## Architecture
- **Backend**: FastAPI + Motor (MongoDB), in-memory market cache, async poller (10s, env-configurable) against Altınkaynak Gold/Currency. Turkish number parsing via Decimal. Anomaly rejection (>30% jump, env). History snapshots on GuncellenmeZamani change. JWT (HS256) admin auth, bcrypt. Margin engine (per-product + global, TL/%), manual mode, draft/published rules.
- **Frontend**: Expo Router, React Native. Contexts: Theme (system/light/dark, persisted), Prices (10s polling, shared), Favorites (local), Settings (local), Alarms (local). Ionicons, react-native-reanimated price-flash, react-native-svg chart, Modal-based bottom sheets.

## User Personas
- Retail investor / jeweler / everyday user tracking live gold & FX rates in TRY.
- Admin operator managing published prices, margins, and provider health.

## Core Requirements (static)
- Real Altınkaynak data only, no fake/placeholder prices; "Veri Yok" when missing.
- Backend proxy/cache; premium light & dark themes; instant theme switch.
- 5 tabs: Piyasa, Favoriler, Hesapla, Alarmlar, Ayarlar.
- Admin: provider health, live price table, margin engine, manual price, draft/publish.

## Implemented (2026-08-31)
- Backend server.py: /api/meta, /api/prices, /api/prices/{code}, /api/history/{code}, /api/auth/login, /api/admin/me|health|products|global-margin|publish|revert-draft. Poller + anomaly + history + margin/manual/draft-publish. (15/15 backend tests pass.)
- Frontend: all 5 tabs, product detail + chart, admin login + full dashboard. Light/dark premium themes. Favorites, calculator, alarms (local). (All critical flows verified.)
- Branding: app.json name "ONLİNE KUR"; all user-facing text in Turkish, no "ALTIN SARAYI".

## Backlog / Remaining
- P1: Push notifications for triggered alarms (deferred — needs deploy/native build).
- P2: Product ordering UI in admin (currently order field exists, no drag UI).
- P2: Intra-day high/low stat (history grows over time).

## Test Credentials
- Admin: admin@onlinekur.com / OnlineKur2026!Admin (see /app/memory/test_credentials.md).
