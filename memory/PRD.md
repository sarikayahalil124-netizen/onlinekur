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

## Iteration 3 (2026-06) — COMPLETED & tested
- Daily % change badge (`changePct` in /api/prices, PercentBadge in list & card) — real data, null when no history.
- Favorites summary widget (FavoritesSummary) at top of market screen — horizontal glance strip.
- Alarm history (alarm_history collection + GET /api/alarms/history + Aktif/Geçmiş tab on alarms screen).
- Firebase google-services.json added (android.googleServicesFile). ⚠ package mismatch: file=online.kur vs app.json=com.emergent.premiumkur.gt9vr0 — awaiting user decision.
All backend + frontend tests passed (iteration_3.json).

## Iteration 4 (2026-06) — COMPLETED & tested (11/11 backend + full frontend)
Kullanıcı istekleri (mevcut uygulamaya eksik özellik ekleme):
1. **Portföy ekranı** (yeni 6. sekme `app/(tabs)/portfolio.tsx`): kullanıcı elindeki altın/döviz miktarını + opsiyonel alış fiyatını girer; toplam güncel TL değeri ve kâr/zarar (tutar + %) anlık gösterilir. Cihazda lokal saklanır (`PortfolioContext` + storage util, key `onlinekur.portfolio`). Ekle/düzenle/sil, özet kartı.
2. **AI Danışman** (Gemini 3.5 Flash, Emergent LLM key): `app/assistant.tsx` sohbet ekranı (Piyasa header'ındaki sparkles butonu ile açılır). Backend endpoints:
   - `POST /api/ai/chat` (multi-turn, geçmiş `ai_messages` koleksiyonunda; her istekte güncel piyasa snapshot'ı + son 10 mesaj sistem mesajına eklenir)
   - `POST /api/ai/commentary` (günün piyasa yorumu, 5 dk session cache)
   - `POST /api/ai/portfolio-advice` (portföye göre değerlendirme; value/PL backend'de hesaplanır)
   - `GET/DELETE /api/ai/messages` (geçmiş/temizle)
   - `emergentintegrations.LlmChat`, model `gemini-3.5-flash`, non-streaming `send_message` (mobil güvenilirlik). `EMERGENT_LLM_KEY` .env'de.
3. **Alarm sesi**: Android bildirim kanalı `vibrationPattern:[0,300,200,300]` + `enableVibrate` + `sound:"default"`; iOS push handler `shouldPlaySound:true`. ⚠ Yalnızca native build'de test edilebilir (Expo Go/web değil).

Navigasyon: 6 sekme (Piyasa, Favoriler, Portföy, Hesapla, Alarmlar, Ayarlar).
Test: iteration_4 — backend 11/11 pass, tüm frontend akışları geçti. Portföy USD 1000 adet @45 → değer 48.241,00 ₺ / K/Z +3.241,00 ₺ (%7,20) doğrulandı.

Backlog:
- P2: server.py ~1100 satır (opsiyonel modülerleştirme).
- P1: Push + alarm sesi native build sonrası gerçek cihazda doğrulanmalı.
- Kullanıcı isterse AI için kendi API anahtarını girebilir (şu an Emergent evrensel anahtar).

## Iteration 5 (2026-06) — COMPLETED & tested (backend 10/10 + tüm frontend)
Kullanıcı istekleri (4 yeni özellik):
1. **Portföy Değer Grafiği** (`Değer Değişimi`): portföyün toplam değeri zaman içinde çizgi grafikte (`LineChart`). `PortfolioContext.history` + `recordSnapshot` — her ~3 dk'da bir intraday nokta (max 120), lokal saklama (`onlinekur.portfolioHistory`). <2 nokta varken bilgilendirici placeholder gösterilir.
2. **Varlık Dağılımı** (`DonutChart` — yeni bileşen, react-native-svg): altın vs döviz yüzdesel dağılımı halka grafik + lejant (güncel değere göre).
3. **AI Fiyat Alarmı**: `/api/ai/chat` artık kullanıcı "X fiyat olunca haber ver" derse gizli `[[ALARM:{...}]]` direktifi üretir; backend parse edip `db.alarms`'a alarm kurar (deviceId bazlı), direktifi yanıttan temizler, `{reply, alarmCreated, alarm}` döner. Frontend alarmCreated'da alarm listesini yeniler.
4. **Sesli Soru**: AI Danışman'da mikrofon butonu (`ai-mic`). `expo-audio` ile kayıt → `/api/ai/transcribe` (OpenAI Whisper `whisper-1`, `language=tr`, emergentintegrations `OpenAISpeechToText`) → metin input'a yazılır ve otomatik gönderilir. Mikrofon izni bağlamsal istenir; reddde ayarlara yönlendirme. app.json: iOS NSMicrophoneUsageDescription, Android RECORD_AUDIO, expo-audio plugin. Web'de blob (webm), native'de m4a.

K/Z düzeltmesi: toplam kâr/zarar artık YALNIZCA alış fiyatı girilmiş varlıklar üzerinden hesaplanıyor (önceki iterasyonda tüm değeri kısmi maliyete bölüp şişiren hata giderildi).
Test: iteration_5 — backend 10/10, tüm frontend akışları geçti. USD 5@45 + GA 2 → K/Z +%7,20 doğru; donut %98,3 altın / %1,7 döviz; sohbetten "USD 70 olunca haber ver" → Alarmlar sekmesinde alarm oluştu.

⚠ Sesli soru (mikrofon) ve alarm sesi/push yalnızca native build'de gerçek cihazda tam çalışır (Expo Go/web'de sınırlı).

## Iteration 6 (2026-06) — COMPLETED & tested (backend 12/12 + frontend)
Kullanıcı isteği: **Sesli Yanıt** — AI Danışman cevaplarını sesli okusun.
- Backend: Emergent-managed OpenAI TTS (`emergentintegrations.OpenAITextToSpeech`, model `tts-1`, voice `nova`, mp3). `POST /api/ai/tts {text}` → metni temizler (emoji/markdown/url), sha256 ile diske cache'ler, `{url}` döner. `GET /api/ai/tts-audio/{key}.mp3` → audio/mpeg (regex korumalı, cache header). `hashlib` import eklendi.
- Frontend: AI Danışman'daki her asistan baloncuğunda "Sesli oku" butonu (`ai-speak-{index}`). `expo-audio` `createAudioPlayer` (modül düzeyi tek örnek), oynatmadan önce `setAudioModeAsync({allowsRecording:false, playsInSilentMode:true})`, bitince otomatik durur, ekrandan çıkınca temizlenir. Toggle: Sesli oku ↔ Durdur.
- ⚠ OpenAI sesleri İngilizce optimize; Türkçe okuma hafif aksanlı olabilir (sağlayıcı sınırı). Sesli oynatma en iyi gerçek cihazda çalışır.
Test: iteration_6 — backend 12/12, frontend buton render + toggle + play doğrulandı.

## Iteration 7 (2026-06) — BUG FIXES & tested (backend 10/10 + frontend)
Kullanıcı 3 sorun bildirdi:
1. **Grafik tarih aralığı çalışmıyordu** — Kök neden: `get_history(range: str)` parametresi Python `range()` fonksiyonunu gölgeliyordu → HTTP 500. Düzeltme: `range_: str = Query(alias="range")`. Ayrıca aralıklar saat bazlı yapıldı (1s=1sa, 6s, 12s, 1G=24sa, 1H=168sa, 1A=720sa) ve maks 80 noktaya seyrekleştirildi. Frontend RANGES güncellendi. (Not: DB migrasyondan beri ~2sa veri içeriyor; 6s+ aralıklar veri biriktikçe ayrışacak.)
2. **Ses→metin başarısızdı** — Kök neden: whisper `transcribe`'a string yol veriliyordu ("Expected bytes/io/PathLike"). Düzeltme: açık dosya nesnesi (`open(path,'rb')`) geçildi. TTS→transcribe round-trip ile doğrulandı.
3. **Sesli cevap** — `assistant.tsx` `send(text, autoSpeak)` eklendi; sesli soru sonrası `send(text, true)` çağrılıp asistan yanıtı otomatik TTS ile seslendiriliyor.
Test: iteration_7 — backend 10/10, frontend akışları geçti, regresyon temiz.
