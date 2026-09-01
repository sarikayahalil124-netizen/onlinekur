#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Iteration 2 — 2026-06 (Feature batch: UI overhaul + alarms push + admin reorder)

Main agent implemented:
1. Source hiding: "Altınkaynak" removed from ALL user-facing screens (market header, product detail stats, settings). Admin screens still show provider name (intentional, admin-only).
2. Market screen: default filter now "Döviz" (currency), sticky column header (ÜRÜN/ALIŞ/SATIŞ), list/card view toggle button (persisted in settings as marketView), search unchanged.
3. Product detail (/product/[code]): new "GÜN İÇİ" section with live day high/low (backend computes from today's price_history in Europe/Istanbul terms, fields dayHigh/dayLow on GET /api/prices/{code}); chart range chips relabeled (Gün/Hafta/Ay/3 Ay/6 Ay/Yıl); chart caption shows range min/max; "Kaynak" stat replaced with "Makas (Fark)".
4. Calculator: new mode toggle "TL Karşılığı" | "Çevirici" — converter converts between any two products (amount × fromRate / toRate) with swap button and TL intermediate display.
5. Alarms: now server-side. Backend: POST/GET/PUT/DELETE /api/alarms (deviceId-scoped, soft delete), alarm engine runs after each poll (10s) — sets triggeredAt, re-arms when condition releases, sends push via Emergent relay (POST /api/register-push + send_push helper, EMERGENT_PUSH_KEY=placeholder). Frontend: AlarmsContext synced with backend, deviceId generated locally, contextual push permission request after alarm creation (works only on native builds, not web/Expo Go).
6. Admin reorder: new screen /admin/reorder — custom drag&drop (long-press 180ms, reanimated), PUT /api/admin/reorder {codes} sets order immediately (not draft-gated). "Sırala" button on admin dashboard.

Test focus:
- backend: /api/alarms CRUD, alarm trigger behavior (create alarm with target below current price → triggeredAt set within ~15s), /api/prices/{code} has dayHigh/dayLow >= /<= sell, /api/admin/reorder (auth required) changes order in /api/prices, /api/register-push returns 500/502 gracefully with placeholder key (should NOT crash).
- frontend: market default tab Döviz, column headers visible, view toggle switches to 2-col cards, no "Altınkaynak" text anywhere user-facing, product detail day high/low + chart, calculator converter mode, alarms create/toggle/delete via backend, admin login + Sırala screen loads.
- Admin creds in /app/memory/test_credentials.md

## Iteration 3 — 2026-06 (Feature batch: daily % change + favorites summary widget + alarm history)

Main agent implemented:
1. Daily % change: backend GET /api/prices now returns `changePct` per item = (current raw sell - today's opening raw sell)/open * 100, rounded 2dp. Null when no history for the day (no fake values). New helper day_opens() aggregates first ts of current IST day per code. Frontend: PercentBadge component (green/red/neutral, caret icon) shown in PriceRow metaRow (next to code) and PriceCard sell row; hidden when changePct null.
2. Favorites summary widget: new FavoritesSummary component rendered at top of market screen (below header, above list). Horizontal scroll chips of favorited products (code, sell, % badge). Hidden when no favorites. Tapping a chip navigates to /product/{code}.
3. Alarm history: backend records each trigger into `alarm_history` collection (deviceId, code, name, basis, condition, target, price, decimals, triggeredAt) inside check_alarms; new GET /api/alarms/history?deviceId= returns items sorted desc. Frontend: AlarmsContext now fetches history alongside alarms (parallel, every 15s); alarms screen has "Aktif / Geçmiş" SegmentedControl tab — history tab lists triggered events with date (formatDateTime) and price, active tab unchanged with FAB.
4. Firebase: user-provided google-services.json placed at /app/frontend/google-services.json and referenced in app.json android.googleServicesFile. NOTE package mismatch: file package_name=online.kur vs app.json android.package=com.emergent.premiumkur.gt9vr0 (pending user decision, does not affect preview).

Test focus (iteration 3):
- backend: GET /api/prices items include changePct (number or null); GET /api/alarms/history?deviceId= returns {items:[]} and records after a trigger (create alarm with target below current sell → within ~15s appears in history with price & triggeredAt). Existing alarm CRUD still works.
- frontend: market screen shows colored % badges next to codes; favorites summary strip appears after starring a product and shows the starred item; alarms screen Aktif/Geçmiş tab toggle works, Geçmiş lists triggered alarms with date+price.
- Admin creds unchanged in /app/memory/test_credentials.md.
