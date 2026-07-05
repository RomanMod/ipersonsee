# Game Documentation: PersonSeeI (Photo Trivia Mini-App)

**PersonSeeI** is a high-performance, responsive, and crash-resilient photo-trivia web application built using modern frontend technologies (TypeScript, Vite, and Tailwind CSS). It is meticulously designed for seamless deployment as a **Telegram Mini App** or a standalone mobile web app, integrating real-time open-source data queries with robust local state retention.

---

## 1. Project Overview & Aesthetics

The application challenge is elegant: players are shown high-quality photographs of notable figures throughout history and modern times and must guess their gender and/or whether they are currently alive or deceased.

### Visual Design & Themes
- **Adaptive Themes:** Primarily optimized with a gorgeous **Night (Dark-Slate) Theme** featuring eye-safe dark canvases, subtle borders, and vibrant color-accented indicators (success/failure highlights).
- **Responsive Layout:** Form-factor independent with touch-optimized targets (minimum 44px) matching Telegram’s design guidelines.
- **Micro-Animations:** Fluid transitions guide the user through state updates, loading indicators, image rendering, and button feedback.

---

## 2. Core Game Rules & Mechanics

The game consists of successive rounds of photo evaluations within a defined session structure.

### Game Modes
1. **Open Mode (`open`):**
   - The gender of the person is immediately visible on screen.
   - The user's goal is strictly to guess their current life status: **Alive** or **Deceased**.
   - Status buttons are revealed with a precise **3-second delay** to encourage players to look closely at the photo before guessing.
2. **Closed Mode (`closed`):**
   - Both gender and status are hidden.
   - The player must make predictions for both dimensions before submitting.

### Gameplay Flow
- **The Guessing Phase:** User selects their choices using interactive buttons.
- **The Evaluation (Check):** Clicking "Check" locks in the choice, compares it against the Wikidata-backed facts, and reveals the detailed card with birth dates, gender designation, and correctness highlights.
- **Statistics & Telemetry:** Correct/incorrect answers are logged, and average reaction times are calculated automatically. Each game operates with a session of up to 10 attempts.

---

## 3. High-Performance Data & Assets Engine

The app does not rely on static, manually created databases. Instead, it query-grids the real world in real-time.

```
       [ Client Browser ]
         │          ▲
         │ (1)      │ (4)
         ▼          │
   ┌──────────┐   ┌───────────────────────────┐
   │ Wikidata │   │ Wikimedia Commons API     │
   │  SPARQL  │   │ (Raw Image File Resolver) │
   └──────────┘   └───────────────────────────┘
         │ (2)      ▲
         ▼          │ (3)
   [ SPARQL Queue / Local Cache ]
```

1. **Wikidata SPARQL Queries:**
   - Performs deep, filtered graph-queries to Wikidata's SPARQL endpoint (`https://query.wikidata.org/sparql`).
   - Filter criteria: Entities categorized as Human (`wd:Q5`), containing valid images (`wdt:P18`), defined genders, birth years (custom filter threshold), and selected country mappings.
2. **Wikimedia Commons Image API:**
   - Wikidata returns Commons filenames. The app performs targeted requests to the MediaWiki query API to parse direct, secure, and hotlink-friendly content URLs.

---

## 4. Streaming & Preloading Architecture

To guarantee instantaneous rendering with zero user-perceived network latency, the app employs a sophisticated background worker pipeline.

### High-Concurrency Stream Queue
- **The Problem:** Sequential image fetching results in slow loaders, while aggressive batching triggers Wikidata rate limits or browser main-thread locks.
- **The Solution:** A background thread-simulation (`launchNextFetch` recursive worker pool) pre-populates a local streaming queue (`STREAM_QUEUE`) of up to 10 candidates.
- **Defensive Multi-Threading Safety:** 
  - Resolves queries through a singular sequential Promise chain (`sparqlQueuePromise`) ensuring only one SPARQL execution triggers at a time.
  - Utilizes a safety delay of `50ms` between cache-hits and schedules subsequent fetches using `setTimeout(() => launchNextFetch(), 10)` in the next tick of the event loop. This prevents browser thread freezing and keeps user interactions fluid.
  - Implements rapid retries (up to 5 attempts) to handle network failures or server outages (like 502 Bad Gateway) gracefully.

### Preloading Images
- While a user evaluates the current person, the image for the *next* person is already fetched and decoded in an off-screen `Image` object. If assignment fails, it falls back to a fresh fetch automatically.

---

## 5. Crash Resiliency & Persistent Logging

To handle edge cases (like low-memory mobile browsers, webview terminations, or abrupt reloads), the application implements strict data retention.

### Persistent Log Stream
- Wraps `console.log` and `console.error` inside a custom hook that streams diagnostic output directly into a visual scroll-pane in the application footer.
- **Inter-Session Log Retention:** The log array is synchronized in real-time to `localStorage` under `appLogs_persistent`.
- **Survivor Logs:** If the app or the system webview crashes (e.g., throwing a "Webview crashed" error), **the entire log history leading up to the crash is preserved** in the next launch, marked by a clear dividing line:
  `--- APPLICATION RESTARTED (PREVIOUS LOGS PRESERVED) ---`
- **Developer Tools:** Accessible buttons allow developers to instantly **Clear** or **Copy** logs to the system clipboard for remote debugging.

### Session Recovery
- Game states, session identifiers, attempt numbers, current person records, and guess results are synced to `localStorage` continuously. Refreshing the browser or restarting Telegram resumes the exact round seamlessly.

---

## 6. Localized Translation Engine

The app is fully translated across 4 distinct locales, fully supported in the UI and diagnostics panel:

- **Ukrainian (`uk`)** — Primary gameplay locale
- **English (`en`)** — Global audience locale
- **Russian (`ru`)** — Secondary locale
- **Alien (`alien`)** — A fun, sci-fi styled easter egg language

Each text element, including system status displays and the dynamic **App Version Badge** (e.g. `v1.4.1`), translates on the fly.

---

## 7. Platform Integrations

### Telegram WebApp Mini-App SDK
- **Environment Detection:** Safely sniffs for `window.Telegram` to enable platform-specific features.
- **User Discovery:** Automatically extracts player identities (e.g., `telegramUserId` and name `R=OMΩ { 読愛者 }`) from `initDataUnsafe`.
- **Hardware Integration:** Communicates back with Telegram to configure the Main and Secondary action buttons, adjust viewports, sync dark/light color schemes natively, and control fullscreen parameters.

### Google Analytics 4 (GA4) & GTM
- Emits real-time gameplay telemetry tracking:
  - `telegram_user_identified` (recording unique players)
  - `new_game_started` (monitoring session initiations)
  - `photo_loaded` (tracking speed and success rates)
  - `attempt_completed` & `guess_made` (analyzing user engagement and difficulty levels)

---

## 8. Google Analytics 4 Tracking Reference & Statistics Schema

To support granular player tracking, user experience analytics, and direct synchronization with external databases (e.g., via Google Apps Script to Excel/Sheets), the application tracks custom variables under defined schemas.

### 8.1. Global Parameters Auto-Injected on Every Event
To prevent data loss and ensure robust correlations, the following parameters are automatically injected by the application's `sendGAEvent` function for **every single transaction**:

| GA4 Parameter | Data Type | Source Variable / Origin | Meaning & Purpose | Example Value(s) |
| :--- | :--- | :--- | :--- | :--- |
| `ga_session_id` | String | `currentSessionId` | Unique gameplay session ID stored in `localStorage` | `"1781985485_7413"` |
| `session_id` | String | `currentSessionId` | Mirror of `ga_session_id` for backward compatibility | `"1781985485_7413"` |
| `telegram_user_id` | String | `telegramUserId` | ID parsed from Telegram's WebApp `initData` | `"399251099"` |
| `language` | String | `selectedLanguage` | Active interface translation language | `"uk"`, `"en"`, `"ru"`, `"alien"` |
| `new_language` | String | `selectedLanguage` | Mirror of current language for query backward compatibility | `"uk"`, `"en"`, `"ru"`, `"alien"` |
| `current_theme` | String | `isNight` | Current visual style theme selected by the user | `"night"`, `"day"` |

---

### 8.2. Event-Specific Parameter Schema

The following table documents each special metric tracked in Google Analytics:

| Parameter Name (UI) | GA4 Event Parameter Name | Data Type | Associated Events | Meaning & Description | Values & Range |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **actual gender** | `actual_gender` | String | `guess_made` | The factual gender of the person displayed on the photo. | `"male"`, `"female"` |
| **actual status** | `actual_status` | String | `guess_made` | The factual status of the person (alive or dead). | `"alive"`, `"deceased"` |
| **attempt number** | `attempt_number` | Number | `guess_made` | Chronological order of the attempt in the current game. | `1` to `10` |
| **attempt number in session** | `attempt_number_in_session` | Number | `attempt_completed` | The attempt index in the current active session list. | `1` to `10` |
| **attempt result** | `attempt_result` | Number (Binary) | `attempt_completed` | Binary indicator of guess correctness (overall correct). | `1` (Correct), `0` (Incorrect) |
| **failed guesses** | `failed_guesses` | Number | `game_over`, `game_unfinished_report` | Total incorrect guesses in the current completed session. | `0` to `10` |
| **game mode** | `game_mode` | String | *All core events* | Selected difficulty mode. | `"open"`, `"closed"` |
| **guessed status** | `guessed_status` | String | `guess_made` | Life status predicted by the player. | `"alive"`, `"deceased"` |
| **is overall correct** | `is_overall_correct` | Boolean / Number | `guess_made` | Flag indicating if all predictions for this figure were correct. | `true` (`1`) or `false` (`0`) |
| **is status correct** | `is_status_correct` | Boolean / Number | `guess_made` | Flag indicating if status guess alone was correct. | `true` (`1`) or `false` (`0`) |
| **new lang** | `new_language` | String | *All core events* | Mirror of player's language at the time of the event. | `"uk"`, `"en"`, `"ru"`, `"alien"` |
| **new theme** | `new_theme` | String | `theme_changed` | Theme selected when player switches visuals in header. | `"night"`, `"day"` |
| **person id** | `person_id` | String | `guess_made`, `photo_loaded` | Wikidata Q-identifier parsed from raw entity URI. | `"Q123456"` |
| **person name** | `person_name` | String | `guess_made`, `photo_loaded` | Human-readable English name of the target figure. | `"Justin Bean"` |
| **Player local start time** | `player_local_start_time` | String | `new_game_started` | Timestamp of game start in player's local timezone. | `"YYYY-MM-DD HH:MM:SS UTC+XX:XX"` |
| **success rate** | `success_rate` | String | `game_over`, `game_unfinished_report` | Percentage ratio of correct guesses to overall attempts. | `"0%"` to `"100%"` |
| **successful guesses** | `successful_guesses` | Number | `game_over`, `game_unfinished_report` | Total correct predictions in the completed game. | `0` to `10` |
| **time for attempt seconds** | `time_for_attempt_seconds` | Number | `attempt_completed` | Duration (seconds) player spent looking and deciding. | Integer `>= 0` |
| **total attempts** | `total_attempts` | Number | `game_over` | Maximum attempts allowed in the current session. | `10` (Default) |
| **trigger button** | `trigger_button` | String | `next_photo_requested` | Identifier of UI element used to request a new picture. | `"find_new"`, `"next_after_check"` |

---

### 8.3. Analytics Validation & Debug Workflow

#### 1. Real-Time Testing with GA4 DebugView
To verify that events and custom dimensions are sent instantly without delays or data loss, enable DebugView:
- Open your browser Developer Console (`F12`).
- Check that `gtag` events are outputting logs in the format:
  `[GA_EVENT_SENT] Name: <event_name>, Params: {...}`
- In Google Analytics Admin, go to **DebugView** under the Data Display menu. All events dispatched by your device will appear in real-time. You can click on individual events (e.g., `guess_made` or `attempt_completed`) and inspect custom parameters (e.g., `person_name`, `actual_status`) to verify their types.

#### 2. Local Logging Persistence
Since our custom app logs are saved to `localStorage`, you can view past analytics dispatches even after an unexpected reload or crash. Look for logs containing `[GA_EVENT_SENT]` in the Diagnostic Panel or standard console.
