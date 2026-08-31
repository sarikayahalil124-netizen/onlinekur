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

## İterasyon 2 (Haziran 2026) — Tamamlandı ✅
Kullanıcı istekleri:
1. **Kaynak gizleme**: "Altınkaynak" ibaresi kullanıcıya görünen hiçbir ekranda yok (yalnızca admin panelinde provider health olarak görünür).
2. **Piyasa ekranı**: Varsayılan sekme Döviz; belirgin sütun başlıkları (ÜRÜN/ALIŞ/SATIŞ, sticky); liste ↔ kart görünümü geçişi (ayarlarda kalıcı, `marketView`).
3. **Ürün detay**: GÜN İÇİ canlı En Yüksek/En Düşük (backend `dayHigh`/`dayLow`, Europe/Istanbul günü, marj uygulanmış); grafik aralıkları Gün/Hafta/Ay/3 Ay/6 Ay/Yıl; grafik altında aralık min/max; "Kaynak" yerine "Makas (Fark)".
4. **Kur Çevirici**: Hesapla ekranında "TL Karşılığı | Çevirici" modu; ürünler arası çevirme + swap butonu (örn. 5 Çeyrek → USD).
5. **Admin ürün sıralama**: `/admin/reorder` ekranı — basılı tut & sürükle (reanimated custom sortable, autoscroll); `PUT /api/admin/reorder` anında yayına yansır.
6. **Alarm push bildirimleri**: Alarmlar artık backend'de (`/api/alarms` CRUD, deviceId bazlı, soft delete). Poll döngüsü her 10 sn'de alarmları değerlendirir; tetiklenince Emergent yönetimli push relay ile bildirim gönderir (`/api/register-push`, `send_push`, `EMERGENT_PUSH_KEY=placeholder` — deploy'da otomatik gerçek değerle değişir). Frontend: cihaz kimliği, bağlamsal bildirim izni (ilk alarm sonrası), bildirim tıklama → ürün detayına yönlendirme, izin reddi için haftalık nudge.

Push notları:
- Push YALNIZCA Publish + native build sonrası gerçek cihazda çalışır (Expo Go/web'de çalışmaz).
- Android push için kullanıcının Firebase `google-services.json` dosyası gerekli (henüz sağlanmadı; sağlanınca `frontend/google-services.json` + app.json `android.googleServicesFile` eklenecek).

Test: iteration_2 — backend 9/9, frontend tüm akışlar geçti.
