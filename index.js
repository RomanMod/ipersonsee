// Safe localStorage wrapper to prevent crashes in sandboxed iframe or Telegram WebView environments
const localStorage = (() => {
    let storage = {};
    let isSupported = false;
    try {
        if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null) {
            window.localStorage.setItem('__test_ls_support', '1');
            window.localStorage.removeItem('__test_ls_support');
            isSupported = true;
        }
    } catch (e) {
        // Native localStorage is blocked or not available
    }

    return {
        getItem(key) {
            if (isSupported) {
                try {
                    return window.localStorage.getItem(key);
                } catch (e) {}
            }
            return storage[key] !== undefined ? storage[key] : null;
        },
        setItem(key, value) {
            if (isSupported) {
                try {
                    window.localStorage.setItem(key, value);
                    return;
                } catch (e) {}
            }
            storage[key] = String(value);
        },
        removeItem(key) {
            if (isSupported) {
                try {
                    window.localStorage.removeItem(key);
                    return;
                } catch (e) {}
            }
            delete storage[key];
        },
        clear() {
            if (isSupported) {
                try {
                    window.localStorage.clear();
                    return;
                } catch (e) {}
            }
            storage = {};
        }
    };
})();

// === LOG CAPTURE & DIAGNOSTICS CODE ===
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

window.diagnosticsEnabled = true; // Temporarily force-enable diagnostics for troubleshooting

window.appLogs = [];
try {
    if (window.diagnosticsEnabled) {
        const savedLogsString = localStorage.getItem('appLogs_persistent');
        if (savedLogsString) {
            window.appLogs = JSON.parse(savedLogsString);
            window.appLogs.push(`[${new Date().toISOString().split('T')[1].slice(0, 11)}] [SYSTEM] --- APPLICATION RESTARTED (PREVIOUS LOGS PRESERVED) ---`);
            if (window.appLogs.length > 500) {
                window.appLogs.shift();
            }
        }
    }
} catch (e) {
    window.appLogs = [];
}

function captureLog(type, args) {
    if (!window.diagnosticsEnabled) {
        return;
    }
    const timeStr = new Date().toISOString().split('T')[1].slice(0, 11);
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try { return JSON.stringify(arg); } catch (e) { return String(arg); }
        }
        return String(arg);
    }).join(' ');
    
    window.appLogs.push(`[${timeStr}] [${type}] ${message}`);
    if (window.appLogs.length > 500) {
        window.appLogs.shift();
    }
    
    try {
        localStorage.setItem('appLogs_persistent', JSON.stringify(window.appLogs));
    } catch (e) {}
    
    const debugPre = document.getElementById('debug-log-output');
    if (debugPre) {
        debugPre.textContent = window.appLogs.join('\n');
        // Auto scroll to bottom
        debugPre.scrollTop = debugPre.scrollHeight;
    }
}

console.log = function(...args) {
    originalConsoleLog.apply(console, args);
    captureLog('LOG', args);
};
console.warn = function(...args) {
    originalConsoleWarn.apply(console, args);
    captureLog('WARN', args);
};
console.error = function(...args) {
    originalConsoleError.apply(console, args);
    captureLog('ERROR', args);
};

window.addEventListener('error', (event) => {
    console.error(`[UNCAUGHT_ERROR] Got uncaught exception in window: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error(`[UNHANDLED_PROMISE] Got unhandled rejection: ${event.reason}`);
});

function runSystemDiagnostics() {
    console.log('--- RUNNING DIAGNOSTICS ---');
    console.log(`[DIAG] Current Local Time: ${new Date().toString()}`);
    try {
        if (typeof __APP_VERSION__ !== 'undefined') {
            console.log(`[DIAG] Build App Version: v${__APP_VERSION__}`);
        }
        if (typeof __BUILD_TIME__ !== 'undefined') {
            console.log(`[DIAG] Build Completion Time: ${__BUILD_TIME__}`);
        }
    } catch (e) {}
    console.log(`[DIAG] User Agent: ${navigator.userAgent}`);
    console.log(`[DIAG] Platform (Navigator): ${navigator.platform}`);
    
    // Telegram State
    if (window.Telegram) {
        console.log('[DIAG] window.Telegram: Present');
        if (window.Telegram.WebApp) {
            console.log('[DIAG] Telegram.WebApp: Present');
            console.log(`[DIAG] WebApp Platform: ${window.Telegram.WebApp.platform}`);
            console.log(`[DIAG] WebApp Version: ${window.Telegram.WebApp.version}`);
            console.log(`[DIAG] WebApp ColorScheme: ${window.Telegram.WebApp.colorScheme}`);
            console.log(`[DIAG] WebApp IsExpanded: ${window.Telegram.WebApp.isExpanded}`);
            
            const tgUser = window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user;
            if (tgUser) {
                console.log(`[DIAG] WebApp User ID: ${tgUser.id}`);
                console.log(`[DIAG] WebApp Username: ${tgUser.username || "none"}`);
                console.log(`[DIAG] WebApp LangCode: ${tgUser.language_code || "none"}`);
            } else {
                console.log('[DIAG] WebApp User: No data in initDataUnsafe');
            }
        } else {
            console.log('[DIAG] Telegram.WebApp: Undefined');
        }
    } else {
        console.log('[DIAG] window.Telegram: Undefined (not running in Telegram)');
    }
    
    // Privacy and cookies
    try {
        localStorage.setItem('__test_ls', '1');
        localStorage.removeItem('__test_ls');
        console.log('[DIAG] LocalStorage write check: SUCCESS');
    } catch(e) {
        console.error('[DIAG] LocalStorage write check: FAILING', e);
    }
    
    try {
        document.cookie = "ga_test=1; SameSite=Lax";
        const cookiesAllowed = document.cookie.indexOf("ga_test") !== -1;
        console.log(`[DIAG] Cookies write check: ${cookiesAllowed ? 'ALLOWED' : 'BLOCKED/DENIED'}`);
    } catch (e) {
        console.error('[DIAG] Cookies write check: FAILING', e);
    }
    
    // GTM and gtag Status
    const gaScripts = Array.from(document.querySelectorAll('script')).filter(s => s.src && s.src.includes('googletagmanager.com'));
    console.log(`[DIAG] GTM elements found in DOM: ${gaScripts.length}`);
    gaScripts.forEach((s, i) => {
        console.log(`  [GTM-Script #${i}] SRC: ${s.src}, ASYNC: ${s.async}`);
    });
    
    console.log(`[DIAG] typeof gtag: ${typeof gtag}`);
    console.log(`[DIAG] typeof window.gtag: ${typeof window.gtag}`);
    console.log(`[DIAG] window.google_tag_manager present: ${typeof window.google_tag_manager !== 'undefined'}`);
    console.log(`[DIAG] window.dataLayer present: ${typeof window.dataLayer !== 'undefined'}`);
    if (typeof window.dataLayer !== 'undefined') {
        console.log(`[DIAG] window.dataLayer length: ${window.dataLayer.length}`);
        try {
            console.log(`[DIAG] window.dataLayer events list: ${JSON.stringify(window.dataLayer)}`);
        } catch(err) {
            console.log(`[DIAG] window.dataLayer stringify error: ${err.message}`);
        }
    }
    console.log('--- END DIAGNOSTICS ---');
}
// ======================================


// Настройки приложения
const settings = {
    superRandomPeople: true,
    dynamicOffset: true,
    maxOffset: 2000,
    maxPeople: 300,
    sessionPeople: 10,
    genderRatio: { male: 50, female: 50 },
    statusRatio: { alive: 50, deceased: 50 },
    birthYearFilter: 1950,
    excludeBlackAndWhite: false,
    selectedCountries: ['ua', 'us'],
    countryMap: {
        'ua': 'Q212',
        'us': 'Q30',
        'ru': 'Q159',
        'de': 'Q183',
        'gb': 'Q145'
    },
    strictCountryFilter: false
};

// Helper function for safe localStorage parsing to prevent crashes
function safeParse(key, defaultValue) {
    try {
        const val = localStorage.getItem(key);
        if (val === null || val === undefined) return defaultValue;
        return JSON.parse(val);
    } catch (e) {
        console.error(`[STORAGE_ERROR] Error parsing key "${key}" from localStorage:`, e);
        return defaultValue;
    }
}

// Кэш и состояние
const rgbHslCache = safeParse('rgbHslCache', {});
const wikidataCache = safeParse('wikidataCache', {});
let sessionList = [];
let isStreamingActive = false;
let currentStreamId = 0;
let loadedPhotos = 0;
let currentPerson = null;
let userGenderGuess = null;
let userStatusGuess = null;
let totalGuesses = parseInt(localStorage.getItem('totalGuesses')) || 0;
let successfulGuesses = parseInt(localStorage.getItem('successfulGuesses')) || 0;
let failedGuesses = parseInt(localStorage.getItem('failedGuesses')) || 0;
let hasChecked = false;
let currentAttempts = parseInt(localStorage.getItem('currentAttempts')) || 0;
const maxAttempts = 10;
let guessResultsHistory = safeParse('guessResultsHistory', []); // Stores 1 for success, 0 for fail
let attemptDurations = safeParse('attemptDurations', []);


// Состояние для GA4 события attempt_completed
let currentSessionId = localStorage.getItem('currentSessionId') || null;
let currentAttemptStartTime = localStorage.getItem('currentAttemptStartTime') ? parseInt(localStorage.getItem('currentAttemptStartTime')) : null;
let telegramUserId = null; // Telegram User ID
let telegramUserName = null; // Telegram User Name


// DOM element references for New Game button positioning
let newGameBtn = null;
let initialNewGameContainer = null;
let gameOverNewGameContainer = null;
let newGameButtonTimeoutId = null; // Timeout ID for delayed "New Game" button appearance

// Состояние для предварительной загрузки
let preloadedPersonContainer = null; // { data: { person: personBinding, category: categoryObj }, imageElement: HTMLImageElement, commonsUrl: string, proxyUrl: string }
let isCurrentlyPreloading = false; // Флаг для предотвращения одновременных предварительных загрузок
let buttonVisibilityTimeoutId = null;


// Переводы
const translations = {
    uk: {
        themeNight: '🌙 Ніч',
        themeDay: '☀ День',
        modeOpen: 'Відкритий',
        modeClosed: 'Закритий',
        nextPhoto: 'Знайти нове фото',
        nextPerson: 'Наступне фото',
        unknown: 'Невідомо',
        testPerson: 'Тестовий персонаж',
        statsSuccess: 'Успішні',
        statsFailure: 'Невдалі',
        statsSuccessRate: 'Відсоток успішних',
        checkBtn: 'Перевірити',
        male: 'Чоловік',
        female: 'Жінка',
        alive: 'Живий',
        deceased: 'Померлий',
        birth: 'Народження',
        death: 'Смерть',
        newGame: 'Нова гра',
        attempts: 'Спроби',
        error: 'Помилка',
        guessHistory: 'Історія успіх/час:',
        imageDisplayAlt: 'Зображення людини',
        errorLoadingImage: 'Помилка завантаження зображення',
        playerNameLabel: 'Гравець',
        diagnosticsTitle: '📊 Діагностика & Логи',
        clearLogs: 'Очистити логи',
        runDiagnostics: 'Запустити діагностику',
        copyLogs: 'Копіювати логи',
        appVersion: 'Версія v2.0.4',
        correctGuess: 'ВІРНО',
        incorrectGuess: 'НЕВІРНО'
    },
    ru: {
        themeNight: '🌙 Ночь',
        themeDay: '☀ День',
        modeOpen: 'Открытый',
        modeClosed: 'Закрытый',
        nextPhoto: 'Найти новое фото',
        nextPerson: 'Следующее фото',
        unknown: 'Неизвестно',
        testPerson: 'Тестовый персонаж',
        statsSuccess: 'Успешные',
        statsFailure: 'Неуспешные',
        statsSuccessRate: 'Процент успешных',
        checkBtn: 'Проверить',
        male: 'Мужчина',
        female: 'Женщина',
        alive: 'Жив',
        deceased: 'Мертв',
        birth: 'Рождение',
        death: 'Смерть',
        newGame: 'Новая игра',
        attempts: 'Попытки',
        error: 'Ошибка',
        guessHistory: 'История успех/время:',
        imageDisplayAlt: 'Изображение человека',
        errorLoadingImage: 'Ошибка загрузки изображения',
        playerNameLabel: 'Игрок',
        diagnosticsTitle: '📊 Диагностика & Логи',
        clearLogs: 'Очистить логи',
        runDiagnostics: 'Запустить диагностику',
        copyLogs: 'Копировать логи',
        appVersion: 'Версия v2.0.4',
        correctGuess: 'ВЕРНО',
        incorrectGuess: 'НЕВЕРНО'
    },
    en: {
        themeNight: '🌙 Night',
        themeDay: '☀ Day',
        modeOpen: 'Open',
        modeClosed: 'Closed',
        nextPhoto: 'Find New Photo',
        nextPerson: 'Next Photo',
        unknown: 'Unknown',
        testPerson: 'Test Person',
        statsSuccess: 'Successful',
        statsFailure: 'Unsuccessful',
        statsSuccessRate: 'Success Rate',
        checkBtn: 'Check',
        male: 'Male',
        female: 'Female',
        alive: 'Alive',
        deceased: 'Deceased',
        birth: 'Birth',
        death: 'Death',
        newGame: 'New Game',
        attempts: 'Attempts',
        error: 'Error',
        guessHistory: 'History success/time:',
        imageDisplayAlt: 'Image of person',
        errorLoadingImage: 'Error loading image',
        playerNameLabel: 'Player',
        diagnosticsTitle: '📊 Diagnostics & Logs',
        clearLogs: 'Clear Logs',
        runDiagnostics: 'Run Diagnostics',
        copyLogs: 'Copy Logs',
        appVersion: 'Version v2.0.4',
        correctGuess: 'CORRECT',
        incorrectGuess: 'INCORRECT'
    },
    alien: {
        themeNight: '🌙 ⊸⍟⊸',
        themeDay: '☀ ⊸⍟⊸',
        modeOpen: '⊸⍟⊸',
        modeClosed: '⊸⍟⊸⊸',
        nextPhoto: '⊸⍟⊸ ⊸⍟⊸',
        nextPerson: '⊸⍟⊸ ⊸⍟⊸',
        unknown: '⊸⍟⊸⊸⊸',
        testPerson: '⊸⍟⊸ ⊸⍟⊸',
        statsSuccess: '⊸⍟⊸⊸',
        statsFailure: '⊸⍟⊸⊸⊸',
        statsSuccessRate: '⊸⍟⊸⊸⊸⊸',
        checkBtn: '⊸⍟⊸',
        male: '⊸⍟⊸',
        female: '⊸⍟⊸⊸',
        alive: '⊸⍟⊸',
        deceased: '⊸⍟⊸⊸',
        birth: '⊸⍟⊸',
        death: '⊸⍟⊸⊸',
        newGame: '⊸⍟⊸ ⊸⍟⊸',
        attempts: '⊸⍟⊸⊸',
        error: '⊸⍟⊸⊸!',
        guessHistory: '⊸⍀⍟ ✓/⍊:',
        imageDisplayAlt: '⊸⍉⋉⏁ ⍜⎎ ⌿⟒⍀⌇⍜⋏', // Alien for "Image of person"
        errorLoadingImage: '⊸⍟⊸ ⌰⍜⏃⎅ ⟒⍀⍜⍀', // Alien for "Error loading image"
        playerNameLabel: '⌿⌰⏃⊬⟒⍀',
        diagnosticsTitle: '📊 ⊸⍟⊸ & ⊸⍟⊸',
        clearLogs: '⊸⍟⊸ ⊸⍟⊸',
        runDiagnostics: '⊸⍟⊸',
        copyLogs: '⊸⍟⊸',
        appVersion: '⊸⍟⊸ v2.0.4',
        correctGuess: '✓ ⊸⍟⊸',
        incorrectGuess: '✗ ⊸⍟⊸'
    }
};

// Инициализация настроек
let isNight = localStorage.getItem('theme') !== 'day';
let selectedLanguage = localStorage.getItem('language') || 'uk'; // Default to Ukrainian
let gameMode = localStorage.getItem('mode') || 'open';

// Google Analytics 4 Event Sender
function sendGAEvent(eventName, eventParams = {}) {
    if (typeof gtag === 'function') {
        const paramsToSend = { ...eventParams }; // Create a copy
        if (telegramUserId) {
            paramsToSend.telegram_user_id = telegramUserId;
        }
        if (currentSessionId) {
            if (!paramsToSend.ga_session_id) {
                paramsToSend.ga_session_id = currentSessionId;
            }
            if (!paramsToSend.session_id) {
                paramsToSend.session_id = currentSessionId;
            }
        }
        if (selectedLanguage) {
            if (!paramsToSend.language) {
                paramsToSend.language = selectedLanguage;
            }
            if (!paramsToSend.new_language) {
                paramsToSend.new_language = selectedLanguage;
            }
        }
        if (!paramsToSend.current_theme) {
            paramsToSend.current_theme = isNight ? 'night' : 'day';
        }
        gtag('event', eventName, paramsToSend);
        console.log(`[GA_EVENT_SENT] Name: ${eventName}, Params:`, JSON.parse(JSON.stringify(paramsToSend)));
    } else {
        console.warn(`[GA_EVENT_FAIL] gtag is not defined. Event not sent: ${eventName}`, eventParams);
    }
}


if (document.body) {
    document.body.classList.toggle('day', !isNight);
}
const languageSelectBtn = document.querySelector('#language-select .selected-option');
if (languageSelectBtn) {
    languageSelectBtn.textContent = selectedLanguage === 'uk' ? 'Українська' : selectedLanguage === 'ru' ? 'Русский' : selectedLanguage === 'en' ? 'English' : '👽 ⊸⍟⊸';
}
const modeToggleBtnInit = document.getElementById('mode-toggle');
if (modeToggleBtnInit) {
    modeToggleBtnInit.textContent = translations[selectedLanguage][`mode${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)}`];
}

// Логирование инициализации
console.log('[APP_INIT] Initializing application...');
console.log('[APP_INIT] Current theme:', isNight ? 'night' : 'day');
console.log('[APP_INIT] Selected language:', selectedLanguage);
console.log('[APP_INIT] Selected game mode:', gameMode);
console.log('[APP_INIT] RGB HSL Cache from localStorage:', rgbHslCache);
console.log('[APP_INIT] Wikidata Cache from localStorage:', wikidataCache);
console.log('[APP_INIT] Attempts from localStorage:', currentAttempts);
console.log('[APP_INIT] Total Guesses from localStorage:', totalGuesses);
console.log('[APP_INIT] Current Session ID from localStorage:', currentSessionId);
console.log('[APP_INIT] Current Attempt Start Time from localStorage:', currentAttemptStartTime);
console.log('[APP_INIT] Guess Results History from localStorage:', guessResultsHistory);
console.log('[APP_INIT] Attempt Durations from localStorage:', attemptDurations);


// Function to update the New Game button's position
function updateNewGameButtonPosition() {
    console.log('[UI_UPDATE] updateNewGameButtonPosition called. Attempts:', currentAttempts, 'Max:', maxAttempts);
    if (!newGameBtn || !initialNewGameContainer || !gameOverNewGameContainer) {
        console.error("[UI_ERROR] Critical: New Game button or its containers not found for positioning.");
        return;
    }

    // Clear any existing timeout for the "New Game" button visibility
    if (newGameButtonTimeoutId) {
        clearTimeout(newGameButtonTimeoutId);
        newGameButtonTimeoutId = null;
        console.log('[UI_TIMEOUT_CANCELLED] Existing New Game button visibility timeout cancelled.');
    }

    if (currentAttempts >= maxAttempts) {
        console.log('[UI_UPDATE] Game is over, scheduling New Game button move to game over location in 5s.');
        // Ensure the game over container is hidden initially while the timer runs
        gameOverNewGameContainer.style.display = 'none';
        // If the button is currently in the initial container, hide that container too,
        // so the button doesn't remain visible at the bottom during the delay.
        if (newGameBtn.parentElement === initialNewGameContainer) {
            initialNewGameContainer.style.display = 'none';
        }

        newGameButtonTimeoutId = setTimeout(() => {
            // Re-check the condition in case a new game started very quickly
            if (currentAttempts >= maxAttempts) {
                console.log('[UI_UPDATE_DELAYED] 5s timeout elapsed. Moving New Game button to game over location.');
                if (newGameBtn.parentElement !== gameOverNewGameContainer) {
                    gameOverNewGameContainer.appendChild(newGameBtn);
                }
                gameOverNewGameContainer.style.display = 'flex';
                initialNewGameContainer.style.display = 'none'; // Ensure initial container remains hidden
            } else {
                console.log('[UI_UPDATE_DELAYED] 5s timeout elapsed, but game is no longer over. Button position likely handled by standard logic.');
            }
            newGameButtonTimeoutId = null;
        }, 5000); // 5-second delay
    } else {
        console.log('[UI_UPDATE] Game is active, moving New Game button to initial location.');
        if (newGameBtn.parentElement !== initialNewGameContainer) {
            initialNewGameContainer.appendChild(newGameBtn);
        }
        initialNewGameContainer.style.display = 'flex';
        gameOverNewGameContainer.style.display = 'none';
    }
}

function updateGuessHistoryDisplay() {
    const historyContainer = document.getElementById('stats-guess-history');
    if (!historyContainer) {
        console.warn('[UI_WARN] Guess history container not found.');
        return;
    }

    historyContainer.innerHTML = '';

    if (guessResultsHistory.length === 0) {
        let emptyLabel = 'Немає історії спроб';
        if (selectedLanguage === 'en') {
            emptyLabel = 'No attempts history';
        } else if (selectedLanguage === 'ru') {
            emptyLabel = 'Нет истории попыток';
        } else if (selectedLanguage === 'alien') {
            emptyLabel = '⊸⍟⊸ ⊸⍟⊸ ⊸⍟⊸';
        }
        historyContainer.innerHTML = `<span class="font-mono text-xs text-on-surface-variant/40 tracking-wider">${emptyLabel}</span>`;
        return;
    }

    let durationSuffix = 'с'; 
    if (selectedLanguage === 'en') {
        durationSuffix = 's';
    } else if (selectedLanguage === 'alien') {
        durationSuffix = '⍊';
    }

    guessResultsHistory.forEach((result, index) => {
        const duration = attemptDurations[index] !== undefined ? attemptDurations[index] : 0;
        const column = document.createElement('div');
        column.className = 'flex flex-col items-center justify-center space-y-1';

        let circleClass = '';
        let svgIcon = '';

        if (result === 1) {
            circleClass = 'w-7 h-7 rounded-full flex items-center justify-center bg-neon-cyan text-void-black shadow-[0_0_10px_rgba(0,240,255,0.4)] transition-all';
            svgIcon = `
                <svg class="w-4 h-4 stroke-current stroke-2" fill="none" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
            `;
        } else {
            circleClass = 'w-7 h-7 rounded-full flex items-center justify-center bg-spirit-violet text-white shadow-[0_0_10px_rgba(188,19,254,0.4)] transition-all';
            svgIcon = `
                <svg class="w-3.5 h-3.5 stroke-current stroke-[2.5]" fill="none" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            `;
        }

        column.innerHTML = `
            <div class="${circleClass}">
                ${svgIcon}
            </div>
            <span class="font-mono text-[9px] text-on-surface-variant/80 tracking-tight">${duration}${durationSuffix}</span>
        `;
        historyContainer.appendChild(column);
    });
}


function updateTelegramUserInfoDisplay() {
    const playerInfoElement = document.getElementById('stats-player-info');
    if (!playerInfoElement) {
        console.warn('[UI_WARN] Stats player info display element (stats-player-info) not found.');
        return;
    }
    const texts = translations[selectedLanguage];
    const label = texts.playerNameLabel || 'Player';

    if (telegramUserName) {
        playerInfoElement.textContent = `${label}: ${telegramUserName}`;
        console.log(`[UI_UPDATE] Telegram user info in stats displayed: ${telegramUserName}`);
    } else {
        playerInfoElement.textContent = label;
        console.log('[UI_UPDATE] Telegram user info in stats displayed as generic "Player" as no name is available.');
    }
}


// Обновление интерфейса по языку
function updateLanguage() {
    console.log(`[LANGUAGE_UPDATE] Updating language to: ${selectedLanguage}`);
    const texts = translations[selectedLanguage];
    document.getElementById('theme-toggle').textContent = isNight ? texts.themeNight : texts.themeDay;
    document.getElementById('next-photo-text').textContent = texts.nextPhoto;
    document.getElementById('next-person').textContent = texts.nextPerson;
    document.getElementById('check-btn').textContent = texts.checkBtn;
    if (newGameBtn) newGameBtn.textContent = texts.newGame;
    document.getElementById('stats-attempts-label').textContent = texts.attempts;
    document.getElementById('stats-success-label').textContent = texts.statsSuccess;
    document.getElementById('stats-failure-label').textContent = texts.statsFailure;
    document.getElementById('stats-success-rate-label').textContent = texts.statsSuccessRate;
    document.getElementById('stats-guess-history-label').textContent = texts.guessHistory; 
    document.getElementById('male-btn').textContent = texts.male;
    document.getElementById('female-btn').textContent = texts.female;
    document.getElementById('alive-btn').textContent = texts.alive;
    document.getElementById('dead-btn').textContent = texts.deceased;
    document.title = selectedLanguage === 'uk' ? 'Гра: Випадкова людина з Wikidata' : selectedLanguage === 'ru' ? 'Игра: Случайный человек из Wikidata' : 'Game: Random Person from Wikidata';

    // Translate diagnostics elements safely
    const diagSummary = document.getElementById('diag-summary-label');
    if (diagSummary) diagSummary.textContent = texts.diagnosticsTitle || '📊 Diagnostics & Logs';
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    if (clearLogsBtn) clearLogsBtn.textContent = texts.clearLogs || 'Очистити логи';
    const runDiagnosticsBtn = document.getElementById('run-diag-btn');
    if (runDiagnosticsBtn) runDiagnosticsBtn.textContent = texts.runDiagnostics || 'Запустити діагностику';
    const copyLogsBtn = document.getElementById('copy-logs-btn');
    if (copyLogsBtn) copyLogsBtn.textContent = texts.copyLogs || 'Копіювати логи';
    const forceReloadBtn = document.getElementById('force-reload-btn');
    if (forceReloadBtn) forceReloadBtn.textContent = selectedLanguage === 'uk' ? 'Оновити кеш 🔄' : selectedLanguage === 'ru' ? 'Обновить кэш 🔄' : 'Force Reload 🔄';

    // Translate version badge dynamically using __APP_VERSION__ injected by Vite
    const versionBadge = document.getElementById('app-version-badge');
    if (versionBadge) {
        let currentVersion = '2.0.4';
        try {
            if (typeof __APP_VERSION__ !== 'undefined') {
                currentVersion = __APP_VERSION__;
            }
        } catch (e) {}
        
        let prefix = 'v';
        if (selectedLanguage === 'uk') prefix = 'Версія v';
        else if (selectedLanguage === 'ru') prefix = 'Версия v';
        else if (selectedLanguage === 'en') prefix = 'Version v';
        else if (selectedLanguage === 'alien') prefix = '⊸⍟⊸ v';
        
        versionBadge.textContent = `${prefix}${currentVersion}`;
    }

    updateUI(currentPerson); 
    updateTelegramUserInfoDisplay(); 

    updateModeSelect();
    updateLanguageSelect();
    updateGuessHistoryDisplay(); 
    console.log('[LANGUAGE_UPDATE] Language update complete.');
}

// Обновление текста режима
function updateModeSelect() {
    const modeToggle = document.getElementById('mode-toggle');
    if (modeToggle) {
        modeToggle.textContent = translations[selectedLanguage][`mode${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)}`];
    }
}

// Обновление текста языка
function updateLanguageSelect() {
    const languageSelectOptions = document.querySelector('#language-select .options');
    languageSelectOptions.innerHTML = `
        <li data-value="uk" class="px-4 py-2 hover:bg-neon-cyan/20 cursor-pointer text-xs font-headline text-on-surface text-center">Українська</li>
        <li data-value="ru" class="px-4 py-2 hover:bg-neon-cyan/20 cursor-pointer text-xs font-headline text-on-surface text-center">Русский</li>
        <li data-value="en" class="px-4 py-2 hover:bg-neon-cyan/20 cursor-pointer text-xs font-headline text-on-surface text-center">English</li>
        <li data-value="alien" class="px-4 py-2 hover:bg-neon-cyan/20 cursor-pointer text-xs font-headline text-on-surface text-center">👽 ⊸⍟⊸</li>
    `;
    document.querySelector('#language-select .selected-option').textContent = selectedLanguage === 'uk' ? 'Українська' : selectedLanguage === 'ru' ? 'Русский' : selectedLanguage === 'en' ? 'English' : '👽 ⊸⍟⊸';
}

// Кастомные выпадающие списки (только для языков)
document.querySelectorAll('.custom-select').forEach(select => {
    const selectedOption = select.querySelector('.selected-option');
    const options = select.querySelector('.options');

    if (selectedOption && options) {
        selectedOption.addEventListener('click', () => {
            const wasOpen = options.style.display !== 'none';
            options.style.display = wasOpen ? 'none' : 'block';
            console.log(`[UI_EVENT] Custom select '${select.id}' ${wasOpen ? 'closed' : 'opened'}.`);
        });

        options.addEventListener('click', (e) => {
            if (e.target.tagName === 'LI') {
                const value = e.target.getAttribute('data-value');
                console.log(`[UI_EVENT] Option selected in '${select.id}': Value = ${value}, Text = ${e.target.textContent}`);
                if (select.id === 'language-select') {
                    const oldLanguage = selectedLanguage;
                    selectedLanguage = value;
                    localStorage.setItem('language', selectedLanguage);
                    console.log(`[STATE_CHANGE] Language changed from ${oldLanguage} to ${selectedLanguage}. Saved to localStorage.`);
                    if (oldLanguage !== selectedLanguage) {
                        sendGAEvent('language_changed', { new_language: selectedLanguage }); // Changed from new_lang
                    }
                    updateLanguage();
                }
                selectedOption.textContent = e.target.textContent;
                options.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (!select.contains(e.target) && options.style.display !== 'none') {
                options.style.display = 'none';
            }
        });
    }
});

// Кнопка прямого переключения режима игры
const modeToggleBtn = document.getElementById('mode-toggle');
if (modeToggleBtn) {
    modeToggleBtn.addEventListener('click', () => {
        const oldMode = gameMode;
        gameMode = gameMode === 'open' ? 'closed' : 'open';
        localStorage.setItem('mode', gameMode);
        console.log(`[STATE_CHANGE] Game mode toggled from ${oldMode} to ${gameMode}. Saved to localStorage.`);
        sendGAEvent('game_mode_changed', { new_game_mode: gameMode });
        updateModeVisibility();
        updateCheckButtonState();
        updateModeSelect();
    });
}

// Переключение темы
const themeToggleBtn = document.getElementById('theme-toggle');
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        isNight = !isNight;
        const newTheme = isNight ? 'night' : 'day';
        if (document.body) {
            document.body.classList.toggle('day', !isNight);
        }
        localStorage.setItem('theme', newTheme);
        console.log(`[THEME_CHANGE] Theme changed to: ${newTheme}. Saved to localStorage.`);
        sendGAEvent('theme_changed', { new_theme: newTheme });
        updateLanguage(); // To update button text
    });
}

// Обновление видимости элементов в зависимости от режима
function updateModeVisibility() {
    if (buttonVisibilityTimeoutId) {
        clearTimeout(buttonVisibilityTimeoutId);
        buttonVisibilityTimeoutId = null;
        console.log('[UI_TIMEOUT_CANCELLED] Existing button visibility timeout cancelled.');
    }

    const statusButtons = document.querySelector('.status-buttons');
    const genderButtons = document.querySelector('.gender-buttons');
    const checkBtnElement = document.getElementById('check-btn');
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');

    if (statusButtons) statusButtons.style.display = 'none';
    if (genderButtons) genderButtons.style.display = 'none';
    if (checkBtnElement) checkBtnElement.style.display = 'none';
    console.log('[UI_UPDATE_MODE] Status, Gender, and Check buttons initially hidden.');

    const imageIsReady = personImage ? personImage.classList.contains('loaded') : false;
    const gameIsActive = currentAttempts < maxAttempts;
    const canMakeGuess = !hasChecked;

    console.log(`[UI_UPDATE_MODE] updateModeVisibility: imageIsReady=${imageIsReady}, gameIsActive=${gameIsActive}, canMakeGuess=${canMakeGuess}, mode=${gameMode}`);

    if (imageIsReady && gameIsActive && canMakeGuess) {
        console.log('[UI_UPDATE_MODE] Conditions met for showing buttons, starting 3s timeout.');
        buttonVisibilityTimeoutId = setTimeout(() => {
            console.log('[UI_TIMEOUT_ELAPSED] 3s timeout elapsed. Showing buttons.');
            if (statusButtons) statusButtons.style.display = 'flex';
            if (checkBtnElement) {
                checkBtnElement.style.display = 'inline-block';
                updateCheckButtonState(); 
                console.log('[UI_UPDATE_MODE_TIMEOUT] Check button shown and state updated.');
            }

            if (gameMode === 'closed') {
                if (genderButtons) genderButtons.style.display = 'flex';
                console.log('[UI_UPDATE_MODE_TIMEOUT] Closed mode: Gender and Status buttons shown.');
            } else {
                if (genderButtons) genderButtons.style.display = 'none'; 
                console.log('[UI_UPDATE_MODE_TIMEOUT] Open mode: Status buttons shown, Gender buttons hidden.');
            }
            buttonVisibilityTimeoutId = null;
        }, 3000);
    } else {
         console.log('[UI_UPDATE_MODE] Conditions NOT met for showing buttons with delay, or timeout was cleared.');
    }

    if (gameMode === 'closed') {
        if (hasChecked) { 
            if (overlay) overlay.classList.add('hidden');
            if (personImage) {
                personImage.style.opacity = '';
                personImage.style.visibility = '';
            }
            console.log('[UI_UPDATE_MODE_OVERLAY] Closed mode, checked: Overlay hidden, Image shown.');
        } else { 
            if (overlay) overlay.classList.remove('hidden');
            if (personImage) {
                personImage.style.opacity = '0';
                personImage.style.visibility = 'hidden';
            }
            console.log('[UI_UPDATE_MODE_OVERLAY] Closed mode, not checked: Overlay shown, Image completely hidden.');
        }
    } else {
        if (overlay) overlay.classList.add('hidden');
        if (personImage) {
            personImage.style.opacity = '';
            personImage.style.visibility = '';
        }
        console.log('[UI_UPDATE_MODE_OVERLAY] Open mode: Overlay hidden, Image shown.');
    }
}


// Управление состоянием кнопки "Проверить"
function updateCheckButtonState() {
    const checkBtn = document.getElementById('check-btn');
    if (!checkBtn) return; 
    let disabled;
    if (gameMode === 'closed') {
        disabled = !userGenderGuess || !userStatusGuess;
    } else {
        disabled = !userStatusGuess;
    }
    checkBtn.disabled = disabled;
}

// Логирование состояния загрузки
function logPhotoStatus() {
    const preloadedPersonName = preloadedPersonContainer &&
                                preloadedPersonContainer.data &&
                                preloadedPersonContainer.data.person && 
                                preloadedPersonContainer.data.person.personLabel &&
                                preloadedPersonContainer.data.person.personLabel.value
                                ? preloadedPersonContainer.data.person.personLabel.value
                                : 'None or no label';
    console.log(`[PHOTO_STATUS] Loaded photos in session: ${loadedPhotos}, Remaining in sessionList: ${sessionList.length}, Preloaded: ${preloadedPersonName}`);
}


// Обновление прогресс-бара (горизонтального и кругового)
function updateProgressBar(percentage, isImageLoading = false) {
    const horizontalProgressBar = document.getElementById('progress-bar');
    const circularProgressContainer = document.getElementById('circular-progress-container');
    const circularProgressBar = document.getElementById('circular-progress-bar');

    requestAnimationFrame(() => {
        if (isImageLoading) {
            if (percentage < 100) {
                circularProgressContainer.classList.remove('hidden');
                circularProgressContainer.setAttribute('aria-valuenow', Math.round(percentage));
            }
            const offset = 100 - percentage; 
            circularProgressBar.style.strokeDashoffset = offset;
            
            if (percentage >= 100) {
                setTimeout(() => {
                    circularProgressContainer.classList.add('hidden');
                }, 500); 
            }
        } else {
            horizontalProgressBar.classList.remove('hidden');
            horizontalProgressBar.style.width = `${percentage}%`;
            if (percentage >= 100) {
                setTimeout(() => {
                    horizontalProgressBar.classList.add('hidden');
                }, 500);
            }
        }
    });
}


// Имитация прогресса для загрузки изображения
function simulateImageProgress(duration = 1500) {
    console.log('[IMAGE_LOAD] Starting image loading simulation.');
    return new Promise((resolve) => {
        if (duration <= 0) { 
            updateProgressBar(99, true);
            console.log('[IMAGE_LOAD] Image loading simulation reached 99% (instant due to zero/negative duration).');
            resolve();
            return;
        }
        const startTime = performance.now();
        const interval = Math.min(100, duration / 10); 
        let progress = 0;

        const update = () => {
            const elapsed = performance.now() - startTime;
            progress = Math.min((elapsed / duration) * 99, 99); 
            updateProgressBar(progress, true); 
            if (progress < 99) {
                setTimeout(update, interval);
            } else {
                console.log('[IMAGE_LOAD] Image loading simulation reached 99%.');
                resolve();
            }
        };
        update();
    });
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}

async function isBlackAndWhite(imageUrl) { 
    if (!settings.excludeBlackAndWhite) {
        return false;
    }

    const cacheKey = imageUrl;
    if (rgbHslCache[cacheKey] !== undefined) {
        console.log(`[IMAGE_CHECK_BW] Using cached B&W result for ${cacheKey}: ${rgbHslCache[cacheKey] ? 'black-and-white' : 'color'}`);
        return rgbHslCache[cacheKey];
    }
    console.log(`[IMAGE_CHECK_BW] Analyzing image for B&W: ${cacheKey}`);

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous'; 

        const analyzeImage = (imageToAnalyze, sourceUrl) => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 100; 
                canvas.height = 100;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imageToAnalyze, 0, 0, 100, 100);

                const imageData = ctx.getImageData(0, 0, 100, 100).data;
                let rSum = 0, gSum = 0, bSum = 0;
                let rSquareSum = 0, gSquareSum = 0, bSquareSum = 0;
                let saturationSum = 0;
                let count = 0;

                for (let i = 0; i < imageData.length; i += 4) {
                    const r = imageData[i];
                    const g = imageData[i + 1];
                    const b = imageData[i + 2];
                    rSum += r;
                    gSum += g;
                    bSum += b;
                    rSquareSum += r * r;
                    gSquareSum += g * g;
                    bSquareSum += b * b;

                    const [, sVal] = rgbToHsl(r, g, b);
                    saturationSum += sVal;
                    count++;
                }

                const rMean = rSum / count;
                const gMean = gSum / count;
                const bMean = bSum / count;
                const rStdDev = Math.sqrt((rSquareSum / count) - (rMean * rMean));
                const gStdDev = Math.sqrt((gSquareSum / count) - (gMean * gMean));
                const bStdDev = Math.sqrt((bSquareSum / count) - (bMean * bMean));
                const meanSaturation = saturationSum / count;

                const isBW = rStdDev < 20 && gStdDev < 20 && bStdDev < 20 && meanSaturation < 0.2;
                console.log(`[IMAGE_CHECK_BW] Result for ${cacheKey} (via ${sourceUrl}): ${isBW ? 'black-and-white' : 'color'} ` +
                            `(R_stdDev:${rStdDev.toFixed(2)}, G_stdDev:${gStdDev.toFixed(2)}, B_stdDev:${bStdDev.toFixed(2)}, Mean Saturation:${(meanSaturation * 100).toFixed(2)}%)`);
                
                rgbHslCache[cacheKey] = isBW; 
                localStorage.setItem('rgbHslCache', JSON.stringify(rgbHslCache));
                console.log('[CACHE_UPDATE] rgbHslCache updated in localStorage.');
                
                resolve(isBW);
            } catch (e) {
                console.error(`[IMAGE_CHECK_BW_CANVAS_ERROR] Canvas analysis failed for ${sourceUrl}:`, e);
                resolve(false);
            }
        };

        img.onload = () => {
            analyzeImage(img, imageUrl);
        };
        img.onerror = () => {
            console.warn(`[IMAGE_CHECK_BW_DIRECT_ERROR] Direct load failed for B&W check: ${imageUrl}. Trying proxy fallback...`);
            
            const proxyForBWCheck = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&w=100&h=100&fit=cover&output=jpg`; 
            const proxyImg = new Image();
            proxyImg.crossOrigin = 'Anonymous';
            proxyImg.onload = () => {
                analyzeImage(proxyImg, proxyForBWCheck);
            };
            proxyImg.onerror = () => {
                console.error(`[IMAGE_CHECK_BW_ALL_ERROR] Direct and Proxy loaded failed for B&W check: ${imageUrl}`);
                resolve(false);
            };
            proxyImg.src = proxyForBWCheck;
        };
        img.src = imageUrl;
    });
}

async function getCommonsImageUrl(fileName) {
    const start = performance.now();
    console.log(`[COMMONS_API] Fetching image URL for file: ${fileName}`);
    try {
        const response = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url&format=json&origin=*`);
        if (!response.ok) throw new Error(`Commons API error: ${response.status} ${response.statusText}`);
        const data = await response.json();
        const pages = data.query.pages;
        const page = pages[Object.keys(pages)[0]];
        const duration = (performance.now() - start).toFixed(0);
        if (!page.imageinfo) {
            console.warn(`[COMMONS_API_WARN] No imageinfo found for file: ${fileName}. API Time: ${duration}ms`);
            return null;
        }
        const imageUrl = page.imageinfo[0].url;
        console.log(`[COMMONS_API_SUCCESS] Got image URL: ${imageUrl}. API Time: ${duration}ms`);
        return imageUrl;
    } catch (error) {
        console.error(`[COMMONS_API_ERROR] Failed to fetch Commons image for ${fileName}:`, error.message);
        return null;
    }
}

async function loadImageWithFallback(url, element) {
    console.log(`[IMAGE_LOAD] Attempting to load image directly: ${url}`);
    element.classList.remove('loaded');
        
    return new Promise((resolve, reject) => {
        let isCompleted = false;
        const cleanup = () => {
            element.onload = null;
            element.onerror = null;
        };

        element.onload = () => {
            if (isCompleted) return;
            isCompleted = true;
            element.style.opacity = ''; 
            element.classList.add('loaded'); 
            console.log(`[IMAGE_LOAD_SUCCESS] Image loaded successfully: ${url}`);
            cleanup();
            resolve();
        };

        element.onerror = () => {
            if (isCompleted) return;
            console.warn(`[IMAGE_LOAD_DIRECT_ERROR] Direct image load failed for ${url}. Trying proxy fallback...`);
            
            const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
            
            element.onload = () => {
                isCompleted = true;
                element.style.opacity = ''; 
                element.classList.add('loaded'); 
                console.log(`[IMAGE_LOAD_PROXY_SUCCESS] Image loaded successfully via proxy: ${proxyUrl}`);
                cleanup();
                resolve();
            };
            
            element.onerror = () => {
                isCompleted = true;
                console.error(`[IMAGE_LOAD_PROXY_ERROR] Proxy image load also failed: ${proxyUrl}. Falling back to placeholder.`);
                element.style.opacity = ''; 
                element.src = 'https://via.placeholder.com/300'; 
                element.classList.add('loaded'); 
                cleanup();
                reject(new Error(`Direct and proxy image load failed for ${url}`));
            };
            
            element.src = proxyUrl;
        };
        
        element.src = url;
    });
}

const WIKIDATA_QUERY_TIMEOUT_MS = 15000; 
let sparqlQueuePromise = Promise.resolve();

const offlinePeople = [
    // Male, Alive
    {
        person: { value: "https://en.wikipedia.org/wiki/Elon_Musk" },
        personLabel: { value: "Elon Musk" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/c/cb/Elon_Musk_Royal_Society_cropped.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1971-06-28T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Volodymyr_Zelenskyy" },
        personLabel: { value: "Volodymyr Zelenskyy" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/9/9c/Volodymyr_Zelenskyy_Kyiv_2022_%28cropped%29.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1978-01-25T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Vitali_Klitschko" },
        personLabel: { value: "Vitali Klitschko" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/c/cb/Vitali_Klitschko_June_2015.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1971-07-19T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Keanu_Reeves" },
        personLabel: { value: "Keanu Reeves" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/3/33/Keanu_Reeves_2014_cropped.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1964-09-02T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "alive"
    },
    // Male, Deceased
    {
        person: { value: "https://en.wikipedia.org/wiki/Albert_Einstein" },
        personLabel: { value: "Albert Einstein" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/d/d3/Albert_Einstein_Head.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1879-03-14T00:00:00Z" },
        deathDate: { value: "1955-04-18T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Taras_Shevchenko" },
        personLabel: { value: "Taras Shevchenko" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/a/af/Tarass_Chevtchenko_1859.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1814-03-09T00:00:00Z" },
        deathDate: { value: "1861-03-10T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Steve_Jobs" },
        personLabel: { value: "Steve Jobs" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/d/dc/Steve_Jobs_Headshot_2010-CROP.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1955-02-24T00:00:00Z" },
        deathDate: { value: "2011-10-05T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Stephen_Hawking" },
        personLabel: { value: "Stephen Hawking" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/e/eb/Stephen_Hawking.StarChild.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1942-01-08T00:00:00Z" },
        deathDate: { value: "2018-03-14T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    // Female, Alive
    {
        person: { value: "https://en.wikipedia.org/wiki/Lina_Kostenko" },
        personLabel: { value: "Lina Kostenko" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/f/fb/Lina_Kostenko_cropped.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1930-03-19T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Taylor_Swift" },
        personLabel: { value: "Taylor Swift" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/b/b5/191125_Taylor_Swift_at_the_2019_American_Music_Awards_%28cropped%29.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1989-12-13T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Ruslana" },
        personLabel: { value: "Ruslana" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/3/30/Ruslana_Lyzhychko_2013-12-04_01.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1973-05-24T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Angela_Merkel" },
        personLabel: { value: "Angela Merkel" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/2/2d/Angela_Merkel_2019_cropped.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1954-07-17T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "alive"
    },
    // Female, Deceased
    {
        person: { value: "https://en.wikipedia.org/wiki/Marie_Curie" },
        personLabel: { value: "Marie Curie" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/c/c8/Marie_Curie_c1920.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1867-11-07T00:00:00Z" },
        deathDate: { value: "1934-07-04T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Lesya_Ukrainka" },
        personLabel: { value: "Lesya Ukrainka" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/d/dd/Lesya_Ukrainka.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1871-02-25T00:00:00Z" },
        deathDate: { value: "1913-08-01T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Elizabeth_II" },
        personLabel: { value: "Elizabeth II" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/b/b6/Queen_Elizabeth_II_in_March_2015.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1926-04-21T00:00:00Z" },
        deathDate: { value: "2022-09-08T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Marilyn_Monroe" },
        personLabel: { value: "Marilyn Monroe" },
        image: { value: "https://upload.wikimedia.org/wikipedia/commons/0/0a/Marilyn_Monroe_photo_portait_Cabinet_Card_cropped.jpg" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1926-06-01T00:00:00Z" },
        deathDate: { value: "1962-08-05T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    }
];

function getOfflineFallbackPerson(category) {
    const gender = category?.gender || 'male';
    const status = category?.status || 'alive';
    const matches = offlinePeople.filter(p => p.gender_string === gender && p.status_string === status);
    if (matches.length > 0) {
        const selected = matches[Math.floor(Math.random() * matches.length)];
        console.log(`[OFFLINE_FALLBACK] Selected offline backup candidate: ${selected.personLabel.value} (${gender}-${status})`);
        return selected;
    }
    const selected = offlinePeople[Math.floor(Math.random() * offlinePeople.length)];
    console.log(`[OFFLINE_FALLBACK] Selected random backup candidate: ${selected.personLabel.value}`);
    return selected;
}

async function fetchPersonData(useRandom = false, category = null) {
    const categoryKey = `${category?.gender || 'any'}-${category?.status || 'any'}`;
    try {
        return await fetchPersonDataInner(useRandom, category);
    } catch (err) {
        console.warn(`[WIKIDATA_FETCH_ERROR_FALLBACK] Wikidata fetch failed for ${categoryKey}: ${err.message}. Invoking offline fallback...`);
        return getOfflineFallbackPerson(category);
    }
}

async function fetchPersonDataInner(useRandom = false, category = null) {
    const start = performance.now();
    let query;
    let attempts = 0;
    const maxQueryAttempts = 2;
    const categoryKey = `${category?.gender || 'any'}-${category?.status || 'any'}`;
    const cacheKey = `${useRandom}-${categoryKey}`;
    
    console.log(`[WIKIDATA_FETCH] Attempting to fetch person data. Random: ${useRandom}, Category: ${categoryKey}, CacheKey: ${cacheKey}`);

    if (wikidataCache[cacheKey] && wikidataCache[cacheKey].length > 0) {
        const cachedPerson = wikidataCache[cacheKey][Math.floor(Math.random() * wikidataCache[cacheKey].length)];
        if (cachedPerson && cachedPerson.personLabel && cachedPerson.personLabel.value && cachedPerson.image && cachedPerson.image.value && cachedPerson.gender && cachedPerson.birthDate && cachedPerson.person && cachedPerson.person.value) {
            console.log(`[WIKIDATA_FETCH_CACHE] Using valid cached data for ${cacheKey}. Person: ${cachedPerson.personLabel.value}`);
            return cachedPerson;
        } else {
            console.warn(`[WIKIDATA_FETCH_CACHE_INVALID] Cached data for ${cacheKey} is invalid, fetching fresh. Invalid person:`, cachedPerson);
            delete wikidataCache[cacheKey]; 
        }
    }

    console.log(`[WIKIDATA_FETCH] No valid cache hit for ${cacheKey}, querying Wikidata.`);

    const currentPromise = sparqlQueuePromise;
    let resolveQueue;
    sparqlQueuePromise = new Promise(resolve => { resolveQueue = resolve; });
    
    try {
        await currentPromise;
    } catch (err) {}

    try {
        const genderFilter = category?.gender === 'male' ? 'FILTER(?gender = wd:Q6581097)' :
                            category?.gender === 'female' ? 'FILTER(?gender = wd:Q6581072)' :
                            'FILTER(?gender IN (wd:Q6581097, wd:Q6581072))';
        const statusFilter = category?.status === 'alive' ? 'FILTER NOT EXISTS { ?person wdt:P570 ?deathDate }' :
                            category?.status === 'deceased' ? '?person wdt:P570 ?deathDate' :
                            'OPTIONAL { ?person wdt:P570 ?deathDate }';
        const birthDateFilter = `FILTER(?birthDate >= "${settings.birthYearFilter}-01-01T00:00:00Z"^^xsd:dateTime).`;
        const countryFilter = settings.selectedCountries === 'all' ? '' :
                             `FILTER(?country IN (${settings.selectedCountries
                                 .map(code => `wd:${settings.countryMap[code]}`)
                                 .filter(id => id)
                                 .join(', ')})).`;

        while (attempts < maxQueryAttempts) {
            attempts++;
            const offset = settings.dynamicOffset ? Math.floor(Math.random() * settings.maxOffset) : 0;
            query = `
                SELECT ?person ?personLabel ?image ?country ?gender ?deathDate ?birthDate
                WHERE {
                    ?person wdt:P31 wd:Q5;
                            wdt:P18 ?image;
                            wdt:P21 ?gender;
                            wdt:P569 ?birthDate.
                    ${settings.strictCountryFilter ? '' : 'OPTIONAL'} { ?person wdt:P27 ?country }.
                    ${genderFilter}
                    ${statusFilter}
                    ${birthDateFilter}
                    ${settings.selectedCountries !== 'all' && settings.strictCountryFilter ? countryFilter : ''}
                    ?person rdfs:label ?personLabel.
                    FILTER (LANG(?personLabel) = "en").
                }
                OFFSET ${offset}
                LIMIT ${settings.maxPeople}
            `;

            const endpoint = 'https://query.wikidata.org/sparql';
            const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json&nocache=${Date.now()}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.warn(`[WIKIDATA_QUERY_TIMEOUT_EVENT] Wikidata query attempt ${attempts}/${maxQueryAttempts} for category ${categoryKey} is taking too long and will be aborted.`);
                controller.abort();
            }, WIKIDATA_QUERY_TIMEOUT_MS);

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/sparql-results+json'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                if (!response.ok) throw new Error(`Wikidata API error: ${response.status} ${response.statusText}`);
                const data = await response.json();
                const list = data.results && data.results.bindings; 
                const duration = (performance.now() - start).toFixed(0);
                
                if (!list || !list.length) { 
                    console.warn(`[WIKIDATA_QUERY_WARN] No results or invalid list for category ${categoryKey}, attempt ${attempts}/${maxQueryAttempts}. Response:`, data);
                    if (attempts === maxQueryAttempts) throw new Error(`No person found for category ${categoryKey} after ${maxQueryAttempts} query attempts with different offsets.`);
                    continue; 
                }
                console.log(`[WIKIDATA_QUERY_SUCCESS] Attempt ${attempts}/${maxQueryAttempts} successful for category ${categoryKey}. Found ${list.length} results. Time: ${duration}ms`);


                wikidataCache[cacheKey] = (wikidataCache[cacheKey] || []).concat(list).slice(-100); 
                localStorage.setItem('wikidataCache', JSON.stringify(wikidataCache));
                console.log('[CACHE_UPDATE] wikidataCache updated in localStorage.');

                const randomPerson = list[Math.floor(Math.random() * list.length)];
                if (randomPerson && randomPerson.personLabel && randomPerson.personLabel.value && randomPerson.image && randomPerson.image.value && randomPerson.gender && randomPerson.birthDate && randomPerson.person && randomPerson.person.value) {
                    return randomPerson;
                } else {
                     console.warn(`[WIKIDATA_QUERY_WARN] Randomly selected person is invalid, attempt ${attempts}/${maxQueryAttempts}. Person:`, randomPerson);
                     if (attempts === maxQueryAttempts) throw new Error(`Selected invalid person on final attempt for category ${categoryKey}.`);
                     continue; 
                }

            } catch (error) {
                clearTimeout(timeoutId);
                const isTimeoutAbort = error.name === 'AbortError';

                if (isTimeoutAbort) {
                } else {
                    if (error.message && error.message.includes('Failed to fetch')) {
                        console.warn(`[WIKIDATA_QUERY_WARN] Query attempt ${attempts}/${maxQueryAttempts} for category ${categoryKey} failed with fetch issue. Retrying. Error: ${error.message}`);
                    } else {
                        console.error(`[WIKIDATA_QUERY_ERROR] Query attempt ${attempts}/${maxQueryAttempts} for category ${categoryKey} failed. Retrying. Error: ${error.message}`);
                    }
                }

                if (isTimeoutAbort || attempts >= maxQueryAttempts) {
                    let rethrowMessage;
                    if (isTimeoutAbort) {
                        rethrowMessage = `Wikidata query for person data (category: ${categoryKey}) timed out on attempt ${attempts}/${maxQueryAttempts}.`;
                    } else { 
                        rethrowMessage = `Failed to fetch person data (category: ${categoryKey}) after ${maxQueryAttempts} attempts. Last error on attempt ${attempts}: ${error.message}`;
                    }
                    console.error(`[WIKIDATA_FETCH_FINAL_ERROR] ${rethrowMessage}`);
                    throw new Error(rethrowMessage);
                }
                console.log(`[WIKIDATA_FETCH_RETRY] Retrying query for ${categoryKey}, attempt ${attempts + 1}/${maxQueryAttempts}...`);
            }
        }
        throw new Error(`Failed to fetch person data for category ${categoryKey} after ${maxQueryAttempts} attempts (unexpected exit).`);
    } finally {
        resolveQueue();
    }
}

async function startPreloadNextAvailablePerson() {
    if (isCurrentlyPreloading || sessionList.length === 0) {
        if (isCurrentlyPreloading) console.log('[PRELOAD] Preload already in progress or next item is already the target of current load.');
        if (sessionList.length === 0) console.log('[PRELOAD] Session list empty, nothing to preload.');
        return;
    }

    isCurrentlyPreloading = true;
    const nextPersonToPreloadEntry = sessionList[0]; 

    if (!nextPersonToPreloadEntry || !nextPersonToPreloadEntry.person || !nextPersonToPreloadEntry.person.image || !nextPersonToPreloadEntry.person.image.value || !nextPersonToPreloadEntry.person.personLabel || !nextPersonToPreloadEntry.person.personLabel.value) {
        console.warn('[PRELOAD_WARN] Next person data for preloading is invalid or missing image/label info.', nextPersonToPreloadEntry);
        isCurrentlyPreloading = false;
        return;
    }
    const personBindingForPreload = nextPersonToPreloadEntry.person;
    console.log(`[PRELOAD] Starting preload for: ${personBindingForPreload.personLabel.value}`);

    try {
        let commonsUrl;
        if (personBindingForPreload.isOfflineFallback) {
            commonsUrl = personBindingForPreload.image.value;
        } else {
            const fileName = decodeURIComponent(personBindingForPreload.image.value.split('/').pop());
            commonsUrl = await getCommonsImageUrl(fileName);
            if (!commonsUrl) {
                console.warn(`[PRELOAD_WARN] No Commons URL for ${fileName} (person: ${personBindingForPreload.personLabel.value}) during preload. Preload for this item skipped.`);
                isCurrentlyPreloading = false;
                return;
            }
        }

        if (settings.excludeBlackAndWhite) {
            const isBW = await isBlackAndWhite(commonsUrl);
            if (isBW) {
                console.warn(`[PRELOAD_BW_SKIP] Skipping B&W image during preload for ${personBindingForPreload.personLabel.value}.`);
                isCurrentlyPreloading = false;
                return;
            }
        }

        const preloadedImage = new Image();
        preloadedImage.crossOrigin = "Anonymous";

        await new Promise((resolve, reject) => {
            let isCompleted = false;
            preloadedImage.onload = () => {
                if (isCompleted) return;
                isCompleted = true;
                console.log(`[PRELOAD_SUCCESS] Image preloaded successfully directly: ${commonsUrl} for ${personBindingForPreload.personLabel.value}`);
                preloadedPersonContainer = {
                    data: nextPersonToPreloadEntry, 
                    imageElement: preloadedImage,
                    commonsUrl: commonsUrl,
                    proxyUrl: commonsUrl
                };
                resolve();
            };
            preloadedImage.onerror = () => {
                if (isCompleted) return;
                console.warn(`[PRELOAD_DIRECT_FAILED] Direct image preload failed for ${commonsUrl}. Trying proxy fallback...`);
                
                const proxyImageUrl = `https://images.weserv.nl/?url=${encodeURIComponent(commonsUrl)}`;
                const proxyImage = new Image();
                proxyImage.crossOrigin = "Anonymous";
                
                proxyImage.onload = () => {
                    isCompleted = true;
                    console.log(`[PRELOAD_PROXY_SUCCESS] Image preloaded successfully via proxy: ${proxyImageUrl} for ${personBindingForPreload.personLabel.value}`);
                    preloadedPersonContainer = {
                        data: nextPersonToPreloadEntry, 
                        imageElement: proxyImage,
                        commonsUrl: commonsUrl,
                        proxyUrl: proxyImageUrl
                    };
                    resolve();
                };
                
                proxyImage.onerror = () => {
                    isCompleted = true;
                    console.error(`[PRELOAD_ERROR] Both direct and proxy preloads failed for: ${commonsUrl} (person: ${personBindingForPreload.personLabel.value})`);
                    reject(new Error(`Preload failed for ${commonsUrl}`));
                };
                
                proxyImage.src = proxyImageUrl;
            };
            preloadedImage.src = commonsUrl;
        });

    } catch (error) {
        console.error(`[PRELOAD_ERROR] Error during preload process for ${personBindingForPreload.personLabel.value}: ${error.message}`);
        preloadedPersonContainer = null; 
    } finally {
        isCurrentlyPreloading = false;
        console.log('[PRELOAD] Preloading process attempt finished.');
    }
}

async function loadPersonFromData(personDataToDisplay, category = null) {
    const personLabelForLogs = personDataToDisplay?.personLabel?.value || 'No data or no label';
    console.log(`[LOAD_PERSON] loadPersonFromData called for person: ${personLabelForLogs}`);
    
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');
    const circularProgressContainer = document.getElementById('circular-progress-container');

    personImage.classList.add('no-transition');
    overlay.classList.add('no-transition');

    personImage.classList.remove('loaded'); 
    if (gameMode === 'closed') {
        overlay.classList.remove('hidden'); 
        personImage.style.opacity = '0';    
        console.log('[LOAD_PERSON_SETUP] Closed Mode: Overlay ON, Image Opacity 0 (transitions disabled)');
    } else { 
        overlay.classList.add('hidden');    
        personImage.style.opacity = '';     
        console.log('[LOAD_PERSON_SETUP] Open Mode: Overlay OFF, Image Opacity by class (transitions disabled)');
    }
    
    requestAnimationFrame(() => {
        personImage.src = ''; 
        if (gameMode === 'closed') {
            personImage.style.opacity = '0'; 
        }
        circularProgressContainer.classList.remove('hidden');
        circularProgressContainer.setAttribute('aria-valuenow', '0');
        const cpBar = document.getElementById('circular-progress-bar');
        if (cpBar) cpBar.style.strokeDashoffset = 100;
        console.log('[LOAD_PERSON_UI_PREP] Image src cleared, progress UI active.');

        requestAnimationFrame(() => {
            personImage.classList.remove('no-transition');
            overlay.classList.remove('no-transition');
            console.log('[LOAD_PERSON_SETUP] Transitions re-enabled.');
        });
    });


    let currentPersonCandidate = personDataToDisplay; 
    let successfullyLoadedImage = false;
    let imageLoadPathDetail = "unknown"; 
    let gaLoadSource = "unknown"; 

    const progressPromise = simulateImageProgress(
        preloadedPersonContainer && 
        preloadedPersonContainer.data && 
        preloadedPersonContainer.data.person &&
        currentPersonCandidate && currentPersonCandidate.person &&
        preloadedPersonContainer.data.person.person.value === currentPersonCandidate.person.value && 
        preloadedPersonContainer.imageElement && 
        preloadedPersonContainer.imageElement.complete 
        ? 500 : 1500 
    );

    if (preloadedPersonContainer && 
        preloadedPersonContainer.data &&
        preloadedPersonContainer.data.person &&
        currentPersonCandidate && currentPersonCandidate.person && 
        preloadedPersonContainer.data.person.person.value === currentPersonCandidate.person.value) { 
        
        if (preloadedPersonContainer.imageElement && preloadedPersonContainer.imageElement.complete && preloadedPersonContainer.proxyUrl) {
            console.log(`[LOAD_PERSON] Attempting to use PRELOADED and COMPLETE image for: ${currentPersonCandidate.personLabel.value}`);
            const preloadedProxyUrl = preloadedPersonContainer.proxyUrl;
            
            await new Promise((resolvePreloadAssign) => {
                personImage.onload = () => {
                    personImage.style.opacity = ''; 
                    personImage.classList.add('loaded'); 
                    
                    console.log(`[LOAD_PERSON_PRELOAD_ASSIGN_SUCCESS] Assigned preloaded image to display: ${preloadedProxyUrl}`);
                    successfullyLoadedImage = true;
                    imageLoadPathDetail = "preload_assigned_successfully";
                    gaLoadSource = "preload_success";
                    resolvePreloadAssign();
                };
                personImage.onerror = () => { 
                    personImage.style.opacity = ''; 
                    console.warn(`[LOAD_PERSON_PRELOAD_ASSIGN_FAIL] Error assigning preloaded image src: ${preloadedProxyUrl} for ${currentPersonCandidate.personLabel.value}. Fallback to fresh fetch.`);
                    preloadedPersonContainer = null; 
                    imageLoadPathDetail = "preload_assign_failed_fallback_to_fetch";
                    resolvePreloadAssign(); 
                };
                personImage.src = preloadedProxyUrl;
            });
        } else {
            console.warn(`[LOAD_PERSON_PRELOAD_WARN] Preloaded data for ${currentPersonCandidate.personLabel.value}, but imageElement not complete or proxyUrl missing. Falling back to fetch.`);
            preloadedPersonContainer = null; 
            imageLoadPathDetail = "fetch_due_to_incomplete_preload";
        }
    } else {
        imageLoadPathDetail = "fetch_no_preload_match"; 
    }
    
    if (!successfullyLoadedImage) {
        console.log(`[LOAD_PERSON] Proceeding with standard fetch for ${currentPersonCandidate?.personLabel?.value || 'unknown person'}. Reason: ${imageLoadPathDetail}`);
        imageLoadPathDetail = imageLoadPathDetail.includes("fallback") || imageLoadPathDetail.includes("incomplete_preload") ? imageLoadPathDetail + "_active_fetch" : "direct_fetch_active";
        gaLoadSource = "fetch_direct"; 

        let attempts = 0;
        const maxImageLoadAttempts = 3;

        while (attempts < maxImageLoadAttempts && !successfullyLoadedImage) {
            attempts++;
            console.log(`[LOAD_PERSON_ATTEMPT] Image fetch attempt ${attempts}/${maxImageLoadAttempts} for person: ${currentPersonCandidate?.personLabel?.value || 'Unknown Candidate'}`);
            try {
                if (!currentPersonCandidate || !currentPersonCandidate.image || !currentPersonCandidate.image.value || !currentPersonCandidate.personLabel || !currentPersonCandidate.personLabel.value) {
                     console.warn(`[LOAD_PERSON_WARN] Invalid person data or missing image/label for fetch attempt ${attempts}. Fetching new person. Candidate:`, currentPersonCandidate);
                     currentPersonCandidate = await fetchPersonData(true, category); 
                     if (!currentPersonCandidate || !currentPersonCandidate.image || !currentPersonCandidate.image.value || !currentPersonCandidate.personLabel || !currentPersonCandidate.personLabel.value) {
                        console.warn(`[LOAD_PERSON_WARN] Newly fetched currentPersonCandidate is also invalid for attempt ${attempts}. Continuing to next attempt or failure.`);
                     }
                     continue; 
                }

                let commonsUrl;
                if (currentPersonCandidate.isOfflineFallback) {
                    commonsUrl = currentPersonCandidate.image.value;
                } else {
                    const fileName = decodeURIComponent(currentPersonCandidate.image.value.split('/').pop());
                    commonsUrl = await getCommonsImageUrl(fileName);
                    if (!commonsUrl) {
                        console.warn(`[LOAD_PERSON_WARN] No Commons URL for ${fileName}. Fetching new person.`);
                        currentPersonCandidate = await fetchPersonData(true, category);
                        continue;
                    }
                }
                
                if (settings.excludeBlackAndWhite) {
                    const isBW = await isBlackAndWhite(commonsUrl);
                    if (isBW) {
                        console.warn(`[LOAD_PERSON_BW_SKIP] Skipping B&W image for ${currentPersonCandidate.personLabel.value}. Fetching new person.`);
                        currentPersonCandidate = await fetchPersonData(true, category);
                        continue;
                    }
                }
                
                await loadImageWithFallback(commonsUrl, personImage); 
                successfullyLoadedImage = true; 
                imageLoadPathDetail = imageLoadPathDetail.includes("fallback") || imageLoadPathDetail.includes("incomplete_preload") ? "fetch_after_preload_issue_success" : "direct_fetch_success";
                if (imageLoadPathDetail === "fetch_after_preload_issue_success") gaLoadSource = "fetch_after_preload_fail";
                else gaLoadSource = "fetch_direct";
                
                console.log(`[LOAD_PERSON_FETCH_SUCCESS] Image successfully fetched for ${currentPersonCandidate.personLabel.value}. Path: ${imageLoadPathDetail}`);
                break; 

            } catch (error) { 
                console.error(`[LOAD_PERSON_ERROR] Error processing person/image (fetch attempt ${attempts}/${maxImageLoadAttempts}): ${error.message}`);
                if (attempts < maxImageLoadAttempts) {
                     console.log("[LOAD_PERSON_RETRY_FETCH] Fetching a new person due to error in current slot.");
                     currentPersonCandidate = await fetchPersonData(true, category); 
                     requestAnimationFrame(() => { 
                        personImage.src = '';
                        if (gameMode === 'closed') {
                            personImage.classList.remove('loaded');
                            personImage.style.opacity = '0';
                        } else {
                            personImage.classList.remove('loaded');
                            personImage.style.opacity = '';
                        }
                        circularProgressContainer.classList.remove('hidden');
                        const cpBarSub = document.getElementById('circular-progress-bar');
                        if (cpBarSub) cpBarSub.style.strokeDashoffset = 100;
                     });
                } else {
                    console.error(`[LOAD_PERSON_FAILURE] Max image fetch attempts (${maxImageLoadAttempts}) reached for this slot. No image loaded.`);
                }
            }
        }
    }

    await progressPromise; 
    updateProgressBar(100, true); 

    if (!successfullyLoadedImage) {
        console.error(`[LOAD_PERSON_CRITICAL_IMAGE_FAIL] Could not load image for slot (intended for ${personLabelForLogs}) after all attempts. Path: ${imageLoadPathDetail}. Handling error.`);
        handleError(); 
        startPreloadNextAvailablePerson(); 
        return;
    }

    if (!currentPersonCandidate || 
        !currentPersonCandidate.personLabel || !currentPersonCandidate.personLabel.value ||
        !currentPersonCandidate.gender || !currentPersonCandidate.gender.value ||
        !currentPersonCandidate.birthDate || !currentPersonCandidate.birthDate.value ||
        !currentPersonCandidate.person || !currentPersonCandidate.person.value) {
        console.error("[LOAD_PERSON_CRITICAL] Final currentPersonCandidate is invalid before assigning to currentPerson. Handling error. Candidate:", currentPersonCandidate);
        handleError(); 
        startPreloadNextAvailablePerson();
        return;
    }

    currentPerson = { 
        personLabel: currentPersonCandidate.personLabel,
        gender: currentPersonCandidate.gender,
        deathDate: currentPersonCandidate.deathDate,
        birthDate: currentPersonCandidate.birthDate,
        person: currentPersonCandidate.person 
    };
    console.log(`[LOAD_PERSON_SUCCESS] Successfully loaded person: ${currentPerson.personLabel.value} (Path: ${imageLoadPathDetail})`);
    updateUI(currentPerson); 
    
    currentAttemptStartTime = Date.now(); 
    localStorage.setItem('currentAttemptStartTime', currentAttemptStartTime.toString());
    console.log(`[STATE_CHANGE] Attempt start time set to ${currentAttemptStartTime} for person: ${currentPerson.personLabel.value}. Saved to localStorage.`);

    sendGAEvent('photo_loaded', {
        person_id: currentPerson.person.value.split('/').pop(),
        person_name: currentPerson.personLabel.value,
        new_language: selectedLanguage, // Changed from new_lang
        game_mode: gameMode,
        load_source: gaLoadSource, 
        load_path_detail: imageLoadPathDetail 
    });
    
    if (preloadedPersonContainer && 
        preloadedPersonContainer.data && 
        preloadedPersonContainer.data.person &&
        currentPersonCandidate && currentPersonCandidate.person && 
        preloadedPersonContainer.data.person.person.value === currentPersonCandidate.person.value) {
        console.log(`[PRELOAD_CONSUMED_OR_INVALIDATED] Preload data for ${currentPersonCandidate.personLabel.value} is now cleared as it's either used or failed assign.`);
        preloadedPersonContainer = null;
    }
    startPreloadNextAvailablePerson(); 
}


function updateUI(personToDisplay) { 
    console.log('[UI_UPDATE] updateUI called for person:', personToDisplay && personToDisplay.personLabel && personToDisplay.personLabel.value ? personToDisplay.personLabel.value : 'No person');
    const personDetails = document.getElementById('person-details');
    const texts = translations[selectedLanguage];
    const personImage = document.getElementById('person-image');
    
    requestAnimationFrame(() => {
        if (personToDisplay && personToDisplay.personLabel && personToDisplay.personLabel.value && personToDisplay.gender && personToDisplay.gender.value) {
             const genderText = personToDisplay.gender.value.split('/').pop() === 'Q6581097' ? texts.male : texts.female;
             const statusText = personToDisplay.deathDate ? texts.deceased : texts.alive; 
             const birthText = personToDisplay.birthDate && personToDisplay.birthDate.value ? new Date(personToDisplay.birthDate.value).toLocaleDateString(selectedLanguage === 'alien' ? 'en-GB' : selectedLanguage === 'uk' ? 'uk-UA' : selectedLanguage + '-RU') : texts.unknown;
             const deathDateVal = personToDisplay.deathDate ? personToDisplay.deathDate.value : null;
             const deathText = deathDateVal ? `, ${texts.death}: ${new Date(deathDateVal).toLocaleDateString(selectedLanguage === 'alien' ? 'en-GB' : selectedLanguage === 'uk' ? 'uk-UA' : selectedLanguage + '-RU')}` : '';
             personDetails.textContent = `${personToDisplay.personLabel.value}, ${genderText}, ${statusText}, ${texts.birth}: ${birthText}${deathText}`;
             personImage.alt = personToDisplay.personLabel.value;
        } else {
            personDetails.textContent = texts.unknown;
            personImage.alt = texts.imageDisplayAlt || 'Image of person'; 
        }

        const nextPersonBtn = document.getElementById('next-person');
        if (nextPersonBtn) {
            if (hasChecked && currentAttempts < maxAttempts) {
                nextPersonBtn.style.display = 'block';
                nextPersonBtn.textContent = texts.nextPerson; 
            } else {
                nextPersonBtn.style.display = 'none';
            }
        }
        
        updateModeVisibility(); 
        if (personToDisplay) { 
             loadedPhotos++;
        }
        logPhotoStatus();
    });
}

function handleError() {
    console.error('[HANDLE_ERROR] An error occurred. Displaying placeholder and error message.');
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');
    const circularProgressContainer = document.getElementById('circular-progress-container');
    const texts = translations[selectedLanguage];
    const personInfo = document.getElementById('person-info');


    preloadedPersonContainer = null;
    isCurrentlyPreloading = false; 
    console.log('[PRELOAD_RESET] Preload state reset due to error.');


    requestAnimationFrame(() => {
        personImage.src = 'https://via.placeholder.com/300'; 
        personImage.alt = texts.errorLoadingImage || 'Error loading image'; 
        personImage.classList.add('loaded'); 
        personImage.style.opacity = ''; 
        
        personInfo.style.display = 'none'; 
        personInfo.classList.remove('correct', 'incorrect');
        const statusBadge = document.getElementById('person-status-badge');
        if (statusBadge) statusBadge.classList.add('hidden');
        updateUI(null); 

        if (gameMode === 'closed') {
            overlay.classList.remove('hidden'); 
        } else {
            overlay.classList.add('hidden'); 
        }
        
        circularProgressContainer.classList.remove('hidden'); 
        
        currentAttemptStartTime = null; 
        localStorage.removeItem('currentAttemptStartTime');
        console.log('[STATE_CHANGE] currentAttemptStartTime cleared due to error. Removed from localStorage.');

        setTimeout(() => {
            circularProgressContainer.classList.add('hidden');
        }, 2000); 

        if (currentAttempts < maxAttempts) {
            console.log('[HANDLE_ERROR_RETRY] Scheduling automatic attempt to load new photo in 3 seconds.');
            setTimeout(() => {
                console.log('[HANDLE_ERROR_RETRY] Retrying to load next person due to previous error.');
                loadNextPerson('error_fallback'); 
            }, 3000);
        } else {
            console.log('[HANDLE_ERROR] Game is over, no automatic retry for new photo.');
        }

        logPhotoStatus();
    });
}

async function loadSession() {
    const startTime = performance.now();
    console.log('[LOAD_SESSION] Starting dynamic background streaming session...');
    sessionList = [];
    
    preloadedPersonContainer = null;
    isCurrentlyPreloading = false;
    console.log('[PRELOAD_RESET] Preload state reset for new session.');

    updateProgressBar(0, false); 

    currentStreamId++;
    const streamId = currentStreamId;
    isStreamingActive = true;

    // Define categories to interleave
    const categories = [
        { gender: 'male', status: 'alive' },
        { gender: 'female', status: 'alive' },
        { gender: 'male', status: 'deceased' },
        { gender: 'female', status: 'deceased' }
    ];

    const targets = [];
    const peoplePerCategory = Math.ceil(settings.sessionPeople / categories.length);
    for (let j = 0; j < peoplePerCategory; j++) {
        for (const cat of categories) {
            if (targets.length < settings.sessionPeople) {
                targets.push(cat);
            }
        }
    }

    console.log(`[STREAM_QUEUE] Scheduled highly interleaved queue of ${targets.length} candidates. Starting parallel stream worker pool.`);

    let targetIndex = 0;
    let activePromisesCount = 0;
    let loadedCount = 0;
    let firstPersonRendered = false;

    async function launchNextFetch() {
        if (streamId !== currentStreamId) {
            console.log(`[STREAM_QUEUE] Stream ID mismatch (${currentStreamId} vs task ${streamId}). Halting active worker.`);
            return;
        }

        if (targetIndex >= targets.length || loadedCount >= settings.sessionPeople) {
            if (activePromisesCount === 0) {
                isStreamingActive = false;
                console.log(`[STREAM_QUEUE_COMPLETE] Background stream queue finished. Cached or loaded ${loadedCount} total items.`);
                updateProgressBar(100, false);
                console.log(`[LOAD_SESSION_TIMING] Total stream load elapsed (since launch): ${(performance.now() - startTime).toFixed(0)}ms`);
            }
            return;
        }

        const category = targets[targetIndex++];
        activePromisesCount++;

        try {
            // Defensive delay to prevent browser thread freeze on rapid consecutive cache hits
            await new Promise(resolve => setTimeout(resolve, 50));
            const personBinding = await fetchPersonData(false, category);
            
            if (streamId !== currentStreamId) {
                console.log('[STREAM_QUEUE] Stream ID changed mid-fetch. Discarded entry.');
                return;
            }

            if (personBinding && 
                personBinding.personLabel && personBinding.personLabel.value &&
                personBinding.image && personBinding.image.value &&
                personBinding.gender && personBinding.gender.value &&
                personBinding.birthDate && personBinding.birthDate.value &&
                personBinding.person && personBinding.person.value) {
                
                sessionList.push({ person: personBinding, category: category });
                loadedCount++;
                console.log(`[STREAM_QUEUE] Appended streamed candidate #${loadedCount}: ${personBinding.personLabel.value} (${category.gender}-${category.status})`);
                
                // Update visual thin horizontal progress bar correctly based on loadedCount
                const progressPercentage = (loadedCount / settings.sessionPeople) * 100;
                updateProgressBar(progressPercentage, false);

                // If this is the FIRST person loaded under this session, render them to the screen IMMEDIATELY
                if (!currentPerson && !firstPersonRendered) {
                    firstPersonRendered = true;
                    const firstEntry = sessionList.shift();
                    console.log(`[STREAM_QUEUE_FIRST_ENTRY] Rendering first candidate instantly on screen: ${firstEntry.person.personLabel.value}`);
                    
                    hasChecked = false;
                    await loadPersonFromData(firstEntry.person, firstEntry.category);
                    
                    requestAnimationFrame(() => {
                        document.getElementById('male-btn').disabled = false;
                        document.getElementById('female-btn').disabled = false;
                        document.getElementById('alive-btn').disabled = false;
                        document.getElementById('dead-btn').disabled = false;
                        document.getElementById('next-person').style.display = 'none';
                        document.getElementById('next-photo').disabled = false; 
                        updateCheckButtonState();
                        console.log('[STREAM_QUEUE_UI] Screen initialized with first streaming candidate.');
                    });
                } else {
                    // Preload next image if idle and list has targets
                    if (!isCurrentlyPreloading && !preloadedPersonContainer && sessionList.length > 0) {
                        startPreloadNextAvailablePerson();
                    }
                }
            } else {
                console.warn('[STREAM_QUEUE_WARN] fetchPersonData returned invalid details or null bind.');
            }
        } catch (error) {
            console.error(`[STREAM_QUEUE_ERROR] Fetch error details: ${error.message}`);
        } finally {
            activePromisesCount--;
            // Recursively execute the next queue item in the next tick of the event loop to yield to the browser
            setTimeout(() => {
                launchNextFetch();
            }, 10);
        }
    }

    // Launch 2 background workers in parallel
    launchNextFetch();
    launchNextFetch();
}

async function loadNextPerson(triggerButton = 'unknown') {
    console.log(`[LOAD_NEXT_PERSON] Called. Trigger: ${triggerButton}. Current attempts: ${currentAttempts}/${maxAttempts}`);
    sendGAEvent('next_photo_requested', {
        session_id: currentSessionId, 
        trigger_button: triggerButton,
        new_language: selectedLanguage, // Changed from new_lang
        game_mode: gameMode,
        remaining_in_session: sessionList.length,
        is_preloading: isCurrentlyPreloading,
        preloaded_person_name: preloadedPersonContainer && preloadedPersonContainer.data && preloadedPersonContainer.data.person && preloadedPersonContainer.data.person.personLabel ? preloadedPersonContainer.data.person.personLabel.value : null
    });

    if (currentAttempts >= maxAttempts) {
        console.log('[LOAD_NEXT_PERSON] Max attempts reached. Cannot load next person.');
        updateNewGameButtonPosition(); 
        return;
    }

    if (sessionList.length === 0) {
        if (isStreamingActive) {
            console.log('[LOAD_NEXT_PERSON] Session list is empty but background streaming is still active. Showing spinner and waiting for stream item...');
            const circularProgressContainer = document.getElementById('circular-progress-container');
            if (circularProgressContainer) {
                circularProgressContainer.classList.remove('hidden');
                updateProgressBar(50, true);
            }

            let checkCount = 0;
            while (sessionList.length === 0 && isStreamingActive && checkCount < 30) {
                await new Promise(resolve => setTimeout(resolve, 500));
                checkCount++;
                console.log(`[LOAD_NEXT_PERSON_POLL] Polling for next person from stream queue (attempt ${checkCount}/30)...`);
            }

            if (circularProgressContainer) {
                circularProgressContainer.classList.add('hidden');
            }

            if (sessionList.length === 0) {
                console.warn('[LOAD_NEXT_PERSON_TIMEOUT] Timed out waiting for streaming item. Initiating a fresh session load.');
                currentPerson = null;
                await loadSession();
                return;
            } else {
                console.log('[LOAD_NEXT_PERSON] Successfully received next person from background streaming queue!');
            }
        } else {
            console.log('[LOAD_NEXT_PERSON] Session list is empty and streaming is inactive. Loading new session.');
            currentPerson = null;
            await loadSession(); 
            return; 
        }
    }

    userGenderGuess = null;
    userStatusGuess = null;
    hasChecked = false;
    console.log('[LOAD_NEXT_PERSON] User guesses and checked flag reset.');
    document.getElementById('male-btn').classList.remove('active');
    document.getElementById('female-btn').classList.remove('active');
    document.getElementById('alive-btn').classList.remove('active');
    document.getElementById('dead-btn').classList.remove('active');
    
    const personInfo = document.getElementById('person-info');
    personInfo.style.display = 'none';
    personInfo.classList.remove('correct', 'incorrect');
    const statusBadge = document.getElementById('person-status-badge');
    if (statusBadge) statusBadge.classList.add('hidden');

    const nextEntry = sessionList.shift(); 
    if (nextEntry && nextEntry.person) { 
        console.log(`[LOAD_NEXT_PERSON] Loading next person from session: ${nextEntry.person.personLabel.value}`);
        await loadPersonFromData(nextEntry.person, nextEntry.category);
    } else {
        console.warn("[LOAD_NEXT_PERSON_WARN] Encountered null or invalid person entry in session list, trying next or reloading session.");
        await loadNextPerson(triggerButton); 
        return;
    }
    requestAnimationFrame(() => {
        updateCheckButtonState(); 
        document.getElementById('male-btn').disabled = false;
        document.getElementById('female-btn').disabled = false;
        document.getElementById('alive-btn').disabled = false;
        document.getElementById('dead-btn').disabled = false;
        document.getElementById('next-person').style.display = 'none'; 
        document.getElementById('next-photo').disabled = currentAttempts >= maxAttempts; 
         console.log('[LOAD_NEXT_PERSON_UI] UI reset for the next person.');
    });
}

function startNewGame() {
    console.log('[GAME_FLOW] Starting new game...');
    currentAttempts = 0;
    totalGuesses = 0; 
    successfulGuesses = 0;
    failedGuesses = 0;
    guessResultsHistory = []; 
    attemptDurations = [];
    currentPerson = null; 
    loadedPhotos = 0; 
    console.log('[GAME_FLOW] Game statistics and current person reset.');

    preloadedPersonContainer = null;
    isCurrentlyPreloading = false;
    console.log('[PRELOAD_RESET] Preload state reset for new game.');

    const timestampSeconds = Math.floor(Date.now() / 1000);
    const randomNumber = Math.floor(Math.random() * 10000);
    currentSessionId = `${timestampSeconds}_${randomNumber}`;
    localStorage.setItem('currentSessionId', currentSessionId);
    console.log(`[GAME_FLOW] New game session ID: ${currentSessionId}. Saved to localStorage.`);
    
    currentAttemptStartTime = null; 
    localStorage.removeItem('currentAttemptStartTime');
    console.log('[GAME_FLOW] currentAttemptStartTime reset and removed from localStorage.');


    localStorage.setItem('currentAttempts', currentAttempts.toString());
    localStorage.setItem('totalGuesses', totalGuesses.toString());
    localStorage.setItem('successfulGuesses', successfulGuesses.toString());
    localStorage.setItem('failedGuesses', failedGuesses.toString());
    localStorage.setItem('guessResultsHistory', JSON.stringify(guessResultsHistory));
    localStorage.setItem('attemptDurations', JSON.stringify(attemptDurations));
    console.log('[GAME_FLOW] Reset game state saved to localStorage.');

    // Get player's local time string
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    
    const timezoneOffsetMinutes = now.getTimezoneOffset(); // e.g., for UTC+3, this is -180. For UTC-4, this is 240.
    const offsetSign = timezoneOffsetMinutes <= 0 ? '+' : '-'; // Invert sign for display
    const offsetHoursAbs = Math.floor(Math.abs(timezoneOffsetMinutes) / 60);
    const offsetMinutesAbs = Math.abs(timezoneOffsetMinutes) % 60;
    
    const playerLocalStartTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC${offsetSign}${offsetHoursAbs.toString().padStart(2, '0')}:${offsetMinutesAbs.toString().padStart(2, '0')}`;
    console.log(`[GAME_FLOW] Player local start time for GA: ${playerLocalStartTimeString}`);

    sendGAEvent('new_game_started', {
        new_language: selectedLanguage, 
        game_mode: gameMode,
        session_id: currentSessionId,
        player_local_start_time: playerLocalStartTimeString,
        current_theme: isNight ? 'night' : 'day' // Added current_theme
    });

    document.getElementById('stats-attempts').textContent = `0/${maxAttempts}`;
    document.getElementById('stats-success').textContent = '0';
    document.getElementById('stats-failure').textContent = '0';
    document.getElementById('stats-success-rate').textContent = '0%';
    updateGuessHistoryDisplay(); 
    
    const personInfo = document.getElementById('person-info');
    personInfo.style.display = 'none'; 
    personInfo.classList.remove('correct', 'incorrect');
    const statusBadge = document.getElementById('person-status-badge');
    if (statusBadge) statusBadge.classList.add('hidden');
    updateUI(null); 
    console.log('[GAME_FLOW_UI] Statistics display and general UI reset.');

    updateNewGameButtonPosition(); 

    userGenderGuess = null;
    userStatusGuess = null;
    hasChecked = false;
    document.getElementById('male-btn').classList.remove('active');
    document.getElementById('female-btn').classList.remove('active');
    document.getElementById('alive-btn').classList.remove('active');
    document.getElementById('dead-btn').classList.remove('active');
    document.getElementById('male-btn').disabled = false;
    document.getElementById('female-btn').disabled = false;
    document.getElementById('alive-btn').disabled = false;
    document.getElementById('dead-btn').disabled = false;
    updateCheckButtonState(); 
    document.getElementById('next-person').style.display = 'none';
    document.getElementById('next-photo').disabled = false; 
    
    console.log('[GAME_FLOW_UI] Buttons and UI elements reset for new game.');

    loadSession(); 
    console.log('[GAME_FLOW] New game started successfully.');
}

document.getElementById('next-photo').addEventListener('click', () => {
    console.log('[USER_ACTION] "Find New Photo" button clicked.');
    if (isCurrentlyPreloading) {
        console.log("[PRELOAD_CANCEL] User clicked 'Find New Photo', cancelling current preload if any.");
        isCurrentlyPreloading = false; 
    }
    preloadedPersonContainer = null; 
    loadNextPerson('find_new');
});

document.getElementById('male-btn').addEventListener('click', () => {
    userGenderGuess = 'male';
    document.getElementById('male-btn').classList.add('active');
    document.getElementById('female-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('[USER_ACTION] Gender selected: Male');
});

document.getElementById('female-btn').addEventListener('click', () => {
    userGenderGuess = 'female';
    document.getElementById('female-btn').classList.add('active');
    document.getElementById('male-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('[USER_ACTION] Gender selected: Female');
});

document.getElementById('alive-btn').addEventListener('click', () => {
    userStatusGuess = 'alive';
    document.getElementById('alive-btn').classList.add('active');
    document.getElementById('dead-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('[USER_ACTION] Status selected: Alive');
});

document.getElementById('dead-btn').addEventListener('click', () => {
    userStatusGuess = 'dead';
    document.getElementById('dead-btn').classList.add('active');
    document.getElementById('alive-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('[USER_ACTION] Status selected: Dead');
});

document.getElementById('check-btn').addEventListener('click', () => {
    console.log('[USER_ACTION] "Check" button clicked.');
    if (!currentPerson || !currentPerson.personLabel || !currentPerson.personLabel.value) { 
        console.warn('[CHECK_ACTION_WARN] No current person or person label to check against.');
        return;
    }
    if (hasChecked) {
        console.warn('[CHECK_ACTION_WARN] Already checked for this person.');
        return;
    }
    
    const endTime = Date.now();

    hasChecked = true;
    currentAttempts++;
    totalGuesses++; 
    console.log(`[GAME_STATE] Attempt ${currentAttempts}/${maxAttempts}. Total guesses this game: ${totalGuesses}.`);
    
    const actualGender = currentPerson.gender.value.split('/').pop() === 'Q6581097' ? 'male' : 'female';
    const actualStatus = currentPerson.deathDate ? 'dead' : 'alive'; 
    console.log(`[CHECK_ACTION] Actual person - Gender: ${actualGender}, Status: ${actualStatus}`);

    const isGenderCorrect = gameMode === 'closed' ? userGenderGuess === actualGender : true;
    const isStatusCorrect = userStatusGuess === actualStatus;
    const isOverallCorrect = isGenderCorrect && isStatusCorrect;
    console.log(`[CHECK_ACTION] Guess result - Gender Correct: ${isGenderCorrect} (Mode: ${gameMode}), Status Correct: ${isStatusCorrect}, Overall Correct: ${isOverallCorrect}`);
    
    guessResultsHistory.push(isOverallCorrect ? 1 : 0);
    localStorage.setItem('guessResultsHistory', JSON.stringify(guessResultsHistory));
    console.log(`[STATE_CHANGE] Guess result (${isOverallCorrect ? 1 : 0}) added to success/fail history. Saved to localStorage. History:`, guessResultsHistory);
    
    let time_for_attempt_seconds = 0;
    if (currentAttemptStartTime) {
        const time_for_attempt_ms = endTime - currentAttemptStartTime;
        time_for_attempt_seconds = Math.round(time_for_attempt_ms / 1000);
        console.log(`[CHECK_ACTION_TIME] Time for this attempt: ${time_for_attempt_seconds} seconds (${time_for_attempt_ms}ms). Start: ${currentAttemptStartTime}, End: ${endTime}`);
    } else {
        console.warn("[CHECK_ACTION_TIME_WARN] currentAttemptStartTime was not set for this attempt. Time for attempt will be 0.");
    }
    
    attemptDurations.push(time_for_attempt_seconds);
    localStorage.setItem('attemptDurations', JSON.stringify(attemptDurations));
    console.log(`[STATE_CHANGE] Attempt duration ${time_for_attempt_seconds}s added. Saved to localStorage. Durations:`, attemptDurations);


    if (currentSessionId) {
        const attemptCompletedParams = {
            session_id: currentSessionId,
            attempt_number_in_session: currentAttempts, 
            time_for_attempt_seconds: time_for_attempt_seconds,
            attempt_result: isOverallCorrect ? 1 : 0,
            game_mode: gameMode,
            new_language: selectedLanguage  // Changed from new_lang
        };
        sendGAEvent('attempt_completed', attemptCompletedParams);
    } else {
        console.warn("[GA_EVENT_WARN] currentSessionId is not set. Skipping 'attempt_completed' GA event.");
    }

    const personInfo = document.getElementById('person-info');
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');

    sendGAEvent('guess_made', {
        person_id: currentPerson.person.value.split('/').pop(),
        person_name: currentPerson.personLabel.value,
        game_mode: gameMode,
        guessed_gender: gameMode === 'closed' ? userGenderGuess : undefined,
        actual_gender: actualGender,
        guessed_status: userStatusGuess,
        actual_status: actualStatus,
        is_gender_correct: gameMode === 'closed' ? (isGenderCorrect ? 1 : 0) : undefined,
        is_status_correct: isStatusCorrect ? 1 : 0,
        is_overall_correct: isOverallCorrect ? 1 : 0,
        attempt_number: currentAttempts,
        new_language: selectedLanguage // Changed from new_lang
    });
    
    requestAnimationFrame(() => {
        personInfo.style.display = 'block'; 
        personInfo.classList.remove('correct', 'incorrect'); 

        const statusBadge = document.getElementById('person-status-badge');
        const statusTextEl = document.getElementById('person-status-text');
        const statusIconEl = statusBadge ? statusBadge.querySelector('.material-symbols-outlined') : null;

        if (gameMode === 'closed') {
            overlay.classList.add('hidden'); 
            personImage.classList.add('loaded'); 
            personImage.style.opacity = ''; 
            console.log('[CHECK_UI] Mode CLOSED: Revealing image.');
        }
        if (isOverallCorrect) {
            personInfo.classList.add('correct');
            successfulGuesses++;
            console.log('[CHECK_UI] Guess was CORRECT.');
            if (statusBadge && statusTextEl) {
                statusBadge.classList.remove('hidden', 'bg-spirit-violet/10', 'text-spirit-violet', 'border-spirit-violet/20');
                statusBadge.classList.add('bg-neon-cyan/15', 'text-neon-cyan', 'border-neon-cyan/30');
                statusTextEl.textContent = translations[selectedLanguage].correctGuess || 'CORRECT';
                if (statusIconEl) statusIconEl.textContent = 'check_circle';
            }
        } else {
            personInfo.classList.add('incorrect');
            failedGuesses++;
            console.log('[CHECK_UI] Guess was INCORRECT.');
            if (statusBadge && statusTextEl) {
                statusBadge.classList.remove('hidden', 'bg-neon-cyan/15', 'text-neon-cyan', 'border-neon-cyan/30');
                statusBadge.classList.add('bg-spirit-violet/15', 'text-spirit-violet', 'border-spirit-violet/30');
                statusTextEl.textContent = translations[selectedLanguage].incorrectGuess || 'INCORRECT';
                if (statusIconEl) statusIconEl.textContent = 'cancel';
            }
        }
        document.getElementById('next-person').style.display = 'block'; 
        
        document.getElementById('male-btn').disabled = true; 
        document.getElementById('female-btn').disabled = true;
        document.getElementById('alive-btn').disabled = true; 
        document.getElementById('dead-btn').disabled = true;


        document.getElementById('stats-attempts').textContent = `${currentAttempts}/${maxAttempts}`;
        document.getElementById('stats-success').textContent = successfulGuesses;
        document.getElementById('stats-failure').textContent = failedGuesses;
        const successRate = totalGuesses > 0 ? Math.round((successfulGuesses / totalGuesses) * 100) : 0;
        document.getElementById('stats-success-rate').textContent = `${successRate}%`;
        updateGuessHistoryDisplay(); 
        console.log('[CHECK_UI] Stats display updated.');
        
        localStorage.setItem('currentAttempts', currentAttempts.toString());
        localStorage.setItem('totalGuesses', totalGuesses.toString()); 
        localStorage.setItem('successfulGuesses', successfulGuesses.toString());
        localStorage.setItem('failedGuesses', failedGuesses.toString());
        console.log('[STATE_CHANGE] Game stats after check saved to localStorage.');

        updateUI(currentPerson); 
        updateNewGameButtonPosition(); 

        if (currentAttempts >= maxAttempts) {
            console.log('[GAME_OVER] All attempts used. Game over.');
            document.getElementById('next-photo').disabled = true; 
            document.getElementById('next-person').style.display = 'none'; 
            sendGAEvent('game_over', {
                total_attempts: maxAttempts,
                successful_guesses: successfulGuesses,
                failed_guesses: failedGuesses,
                success_rate: `${successRate}%`,
                new_language: selectedLanguage, // Changed from new_lang
                game_mode: gameMode,
                session_id: currentSessionId,
                current_theme: isNight ? 'night' : 'day' 
            });
            localStorage.removeItem('currentSessionId');
            localStorage.removeItem('currentAttemptStartTime');
            currentSessionId = null;
            currentAttemptStartTime = null;
            console.log('[STATE_CHANGE] Game over: currentSessionId and currentAttemptStartTime cleared from localStorage.');
        }
    });
});

document.getElementById('next-person').addEventListener('click', () => {
    console.log('[USER_ACTION] "Next Photo" (after guess) button clicked.');
     requestAnimationFrame(() => { 
        document.getElementById('male-btn').disabled = false; 
        document.getElementById('female-btn').disabled = false;
        document.getElementById('alive-btn').disabled = false; 
        document.getElementById('dead-btn').disabled = false;
    });
    loadNextPerson('next_after_check');
});

document.getElementById('new-game').addEventListener('click', () => {
    console.log('[USER_ACTION] "New Game" button clicked.');
    reportProgressOnLeave('new_game_reset');
    startNewGame();
});

function reportProgressOnLeave(trigger) {
    if (currentSessionId && currentAttempts > 0 && currentAttempts < maxAttempts) {
        console.log(`[LIFE_CYCLE_REPORT] Unfinished game detected inside ${trigger}. Attempts/max: ${currentAttempts}/${maxAttempts}. Reporting to GA...`);
        sendGAEvent('game_unfinished_report', {
            session_id: currentSessionId,
            current_attempts: currentAttempts,
            total_attempts_max: maxAttempts,
            successful_guesses: successfulGuesses,
            failed_guesses: failedGuesses,
            success_rate: `${totalGuesses > 0 ? Math.round((successfulGuesses / totalGuesses) * 100) : 0}%`,
            new_language: selectedLanguage,
            game_mode: gameMode,
            current_theme: isNight ? 'night' : 'day',
            trigger_event: trigger,
            platform: window.Telegram?.WebApp?.platform || 'web',
            transport_type: 'beacon'
        });
    } else {
        console.log(`[LIFE_CYCLE_REPORT] No unfinished game report needed inside ${trigger} callback (attempts active: ${currentAttempts > 0 && currentAttempts < maxAttempts}).`);
    }
}

// Setup diagnostics event listeners
function setupDiagnosticsPanel() {
    console.log('[DIAG_SETUP] Initializing diagnostics panel listeners...');
    
    const diagPanel = document.getElementById('diagnostics-panel');
    if (diagPanel) {
        diagPanel.style.display = window.diagnosticsEnabled ? 'block' : 'none';
    }

    const runDiagBtn = document.getElementById('run-diag-btn');
    if (runDiagBtn) {
        runDiagBtn.addEventListener('click', () => {
            runSystemDiagnostics();
        });
    }

    const forceReloadBtn = document.getElementById('force-reload-btn');
    if (forceReloadBtn) {
        forceReloadBtn.addEventListener('click', () => {
            console.log('[DIAG] Force Reload triggered by user. Clearing cache and reloading...');
            const url = new URL(window.location.href);
            url.searchParams.set('cache_bust', Date.now().toString());
            window.location.replace(url.toString());
        });
    }

    const clearBtn = document.getElementById('clear-logs-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            window.appLogs = [];
            try {
                localStorage.removeItem('appLogs_persistent');
            } catch (e) {}
            const debugPre = document.getElementById('debug-log-output');
            if (debugPre) {
                debugPre.textContent = 'Logs cleared.';
            }
            console.log('[DIAG] Logs cleared by user.');
        });
    }

    const copyBtn = document.getElementById('copy-logs-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const logsText = window.appLogs.join('\n');
            navigator.clipboard.writeText(logsText).then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = (selectedLanguage === 'uk' ? 'Скопійовано! ✅' : selectedLanguage === 'ru' ? 'Скопировано! ✅' : 'Copied! ✅');
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 1500);
                console.log('[DIAG] Logs copied to clipboard.');
            }).catch(err => {
                console.error('[DIAG_ERROR] Failed to copy logs:', err);
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Failed! ❌';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 1500);
            });
        });
    }

    // Version badge 10 clicks toggling
    const versionBadge = document.getElementById('app-version-badge');
    if (versionBadge) {
        let clicksCount = 0;
        let lastClickTime = 0;
        versionBadge.addEventListener('click', () => {
            const now = Date.now();
            if (now - lastClickTime > 3000) {
                clicksCount = 0;
            }
            clicksCount++;
            lastClickTime = now;

            if (clicksCount >= 10) {
                clicksCount = 0;
                window.diagnosticsEnabled = !window.diagnosticsEnabled;
                localStorage.setItem('diagnostics_enabled', window.diagnosticsEnabled ? 'true' : 'false');
                
                if (diagPanel) {
                    diagPanel.style.display = window.diagnosticsEnabled ? 'block' : 'none';
                }

                let currentVersion = '2.0.4';
                try {
                    if (typeof __APP_VERSION__ !== 'undefined') {
                        currentVersion = __APP_VERSION__;
                    }
                } catch (e) {}

                if (window.diagnosticsEnabled) {
                    runSystemDiagnostics();
                    console.log('[SYSTEM] Diagnostics and logs ENABLED via secret code.');
                    
                    versionBadge.textContent = (selectedLanguage === 'uk' 
                        ? `Діагностика увімкнена! 📊 (v${currentVersion})` 
                        : selectedLanguage === 'ru' 
                        ? `Диагностика включена! 📊 (v${currentVersion})` 
                        : `Diagnostics enabled! 📊 (v${currentVersion})`);
                    setTimeout(() => {
                        translateUI();
                    }, 2000);
                } else {
                    window.appLogs = [];
                    try {
                        localStorage.removeItem('appLogs_persistent');
                    } catch (e) {}
                    console.log('[SYSTEM] Diagnostics and logs DISABLED.');
                    
                    // Immediately show the version without any "diagnostics disabled" text
                    translateUI();
                }
            }
        });
    }
}

const initApp = () => {
    console.log('[WINDOW_ONLOAD] Page loaded. Initializing application state.');

    if (window.Telegram && window.Telegram.WebApp) {
        try {
            window.Telegram.WebApp.ready(); 
            const tgUser = window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user;
            let hasUserName = false;
            if (tgUser) {
                if (tgUser.id) {
                    telegramUserId = tgUser.id.toString();
                    console.log(`[TELEGRAM_INIT] Telegram User ID: ${telegramUserId}`);
                } else {
                    console.log('[TELEGRAM_INIT] Telegram User ID missing.');
                }

                if (tgUser.first_name && tgUser.last_name) {
                    telegramUserName = `${tgUser.first_name} ${tgUser.last_name}`;
                } else if (tgUser.first_name) {
                    telegramUserName = tgUser.first_name;
                } else if (tgUser.username) {
                    telegramUserName = tgUser.username;
                }
                
                if (telegramUserName) {
                    hasUserName = true;
                    console.log(`[TELEGRAM_INIT] Telegram User Name: ${telegramUserName}`);
                } else {
                     console.log('[TELEGRAM_INIT] Telegram User Name (first/last/username) not available.');
                }
                sendGAEvent('telegram_user_identified', { 
                    t_user_id_available: !!telegramUserId,
                    t_user_name_available: hasUserName 
                });
            } else {
                console.log('[TELEGRAM_INIT] Telegram user data not available.');
            }
        } catch (e) {
            console.error('[TELEGRAM_INIT_ERROR] Error initializing Telegram WebApp or accessing user data:', e);
        }
    } else {
        console.log('[TELEGRAM_INIT] Telegram WebApp script not loaded or not in Telegram environment.');
    }
    
    newGameBtn = document.getElementById('new-game');
    initialNewGameContainer = document.getElementById('new-game-initial-location');
    gameOverNewGameContainer = document.getElementById('new-game-over-location');
    console.log('[WINDOW_ONLOAD] New Game button containers initialized.');

    currentSessionId = localStorage.getItem('currentSessionId');
    const storedAttemptStartTime = localStorage.getItem('currentAttemptStartTime');
    if (storedAttemptStartTime) {
        currentAttemptStartTime = parseInt(storedAttemptStartTime, 10);
    }
    guessResultsHistory = safeParse('guessResultsHistory', []);
    attemptDurations = safeParse('attemptDurations', []);
    console.log(`[WINDOW_ONLOAD_RESTORE] Restored from localStorage - Session ID: ${currentSessionId}, Attempt Start Time: ${currentAttemptStartTime}, Guess Results History: ${guessResultsHistory}, Attempt Durations: ${attemptDurations}`);


    const isFirstLaunchOrReset = localStorage.getItem('currentAttempts') === null;
    console.log(`[WINDOW_ONLOAD] Is first launch or reset: ${isFirstLaunchOrReset}`);
    
    const personInfoOnLoad = document.getElementById('person-info');
    if (personInfoOnLoad) {
        personInfoOnLoad.style.display = 'none'; 
        personInfoOnLoad.classList.remove('correct', 'incorrect'); 
    }
    const statusBadge = document.getElementById('person-status-badge');
    if (statusBadge) statusBadge.classList.add('hidden');

    if (isFirstLaunchOrReset) {
        console.log("[WINDOW_ONLOAD] First launch or reset detected. Initializing a new game.");
        updateLanguage(); 
        startNewGame(); 
        updateNewGameButtonPosition(); 
    } else {
        console.log("[WINDOW_ONLOAD] Resuming existing game state.");
        updateLanguage(); 
        
        if (currentAttempts >= maxAttempts) {
            console.log("[WINDOW_ONLOAD_GAMEOVER] Game was previously over. UI reflects game over state.");
            document.getElementById('stats-attempts').textContent = `${currentAttempts}/${maxAttempts}`;
            document.getElementById('stats-success').textContent = successfulGuesses;
            document.getElementById('stats-failure').textContent = failedGuesses;
            const successRate = totalGuesses > 0 ? Math.round((successfulGuesses / totalGuesses) * 100) : 0;
            document.getElementById('stats-success-rate').textContent = `${successRate}%`;
            
            document.getElementById('next-photo').disabled = true;
            document.getElementById('next-person').style.display = 'none';
            
            if (currentSessionId || currentAttemptStartTime) {
                console.warn("[WINDOW_ONLOAD_GAMEOVER_CLEANUP] Game was over, but session ID or start time found in localStorage. Clearing them now.");
                localStorage.removeItem('currentSessionId');
                localStorage.removeItem('currentAttemptStartTime');
                currentSessionId = null;
                currentAttemptStartTime = null;
            }
            preloadedPersonContainer = null;
            isCurrentlyPreloading = false;
            console.log("[WINDOW_ONLOAD_GAMEOVER] Press 'New Game' to start.");
        } else {
            console.log("[WINDOW_ONLOAD_RESUME] Resuming active game. Attempts:", currentAttempts);
            document.getElementById('stats-attempts').textContent = `${currentAttempts}/${maxAttempts}`;
            document.getElementById('stats-success').textContent = successfulGuesses;
            document.getElementById('stats-failure').textContent = failedGuesses;
            const successRate = totalGuesses > 0 ? Math.round((successfulGuesses / totalGuesses) * 100) : 0;
            document.getElementById('stats-success-rate').textContent = `${successRate}%`;
            
            if (!currentSessionId && currentAttempts > 0 && currentAttempts < maxAttempts) {
                console.warn("[WINDOW_ONLOAD_RESUME_WARN] Resuming game, but currentSessionId is missing from localStorage. It will be generated on the next new game. GA events for ongoing attempts might miss session_id.");
            }

            if (!currentPerson) { 
                console.log("[WINDOW_ONLOAD_RESUME] currentPerson is null. Loading session data to continue/start.");
                preloadedPersonContainer = null;
                isCurrentlyPreloading = false;
                loadSession(); 
            } else {
                 console.log("[WINDOW_ONLOAD_RESUME] currentPerson somehow exists. UI should be updated. Preloading next.");
                 updateUI(currentPerson); 
                 startPreloadNextAvailablePerson(); 
            }
        }
        updateCheckButtonState();
        updateGuessHistoryDisplay(); 
        updateNewGameButtonPosition();
    }
    updateTelegramUserInfoDisplay(); 

    // Setup diagnostics panel and run initial diagnostics if enabled
    setupDiagnosticsPanel();
    if (window.diagnosticsEnabled) {
        runSystemDiagnostics();
    }

    // Setup lifecycle event listeners
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            console.log('[LIFE_CYCLE] Page became hidden (app backgrounded or closed).');
            reportProgressOnLeave('visibility_hidden');
        }
    });

    window.addEventListener('pagehide', () => {
        console.log('[LIFE_CYCLE] pagehide event fired.');
        reportProgressOnLeave('pagehide');
    });

    window.addEventListener('freeze', () => {
        console.log('[LIFE_CYCLE] freeze event fired (app suspended).');
        reportProgressOnLeave('freeze');
    });

    console.log('[WINDOW_ONLOAD] Page load sequence finished.');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initApp();
} else {
    window.addEventListener('DOMContentLoaded', initApp);
}
