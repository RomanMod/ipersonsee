// Safe localStorage wrapper to prevent crashes in sandboxed iframe or Telegram WebView environments
const safeLocalStorage = (() => {
    let storage = {};
    return {
        getItem: (key) => {
            try {
                return window.safeLocalStorage.getItem(key) || storage[key] || null;
            } catch (e) {
                return storage[key] || null;
            }
        },
        setItem: (key, value) => {
            try {
                window.safeLocalStorage.setItem(key, value);
            } catch (e) {
                storage[key] = value.toString();
            }
        },
        removeItem: (key) => {
            try {
                window.safeLocalStorage.removeItem(key);
            } catch (e) {
                delete storage[key];
            }
        },
        clear: () => {
            try {
                window.safeLocalStorage.clear();
            } catch (e) {
                storage = {};
            }
        }
    };
})();

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

// Кэш и состояние
const rgbHslCache = JSON.parse(safeLocalStorage.getItem('rgbHslCache')) || {};
const wikidataCache = JSON.parse(safeLocalStorage.getItem('wikidataCache')) || {};
let sessionList = [];
let loadedPhotos = 0;
let currentPerson = null;
let userGenderGuess = null;
let userStatusGuess = null;
let totalGuesses = parseInt(safeLocalStorage.getItem('totalGuesses')) || 0;
let successfulGuesses = parseInt(safeLocalStorage.getItem('successfulGuesses')) || 0;
let failedGuesses = parseInt(safeLocalStorage.getItem('failedGuesses')) || 0;
let hasChecked = false;
let currentAttempts = parseInt(safeLocalStorage.getItem('currentAttempts')) || 0;
const maxAttempts = 10;
let guessResultsHistory = JSON.parse(safeLocalStorage.getItem('guessResultsHistory')) || []; // Stores 1 for success, 0 for fail
let attemptDurations = JSON.parse(safeLocalStorage.getItem('attemptDurations')) || [];


// Состояние для GA4 события attempt_completed
let currentSessionId = safeLocalStorage.getItem('currentSessionId') || null;
let currentAttemptStartTime = safeLocalStorage.getItem('currentAttemptStartTime') ? parseInt(safeLocalStorage.getItem('currentAttemptStartTime')) : null;
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
        nextPhoto: '🔄 Знайти нове фото',
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
        playerNameLabel: 'Гравець'
    },
    ru: {
        themeNight: '🌙 Ночь',
        themeDay: '☀ День',
        modeOpen: 'Открытый',
        modeClosed: 'Закрытый',
        nextPhoto: '🔄 Найти новое фото',
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
        playerNameLabel: 'Игрок'
    },
    en: {
        themeNight: '🌙 Night',
        themeDay: '☀ Day',
        modeOpen: 'Open',
        modeClosed: 'Closed',
        nextPhoto: '🔄 Find New Photo',
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
        playerNameLabel: 'Player'
    },
    alien: {
        themeNight: '🌙 ⊸⍟⊸',
        themeDay: '☀ ⊸⍟⊸',
        modeOpen: '⊸⍟⊸',
        modeClosed: '⊸⍟⊸⊸',
        nextPhoto: '🔄 ⊸⍟⊸ ⊸⍟⊸',
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
        playerNameLabel: '⌿⌰⏃⊬⟒⍀'
    }
};

// Инициализация настроек
let isNight = safeLocalStorage.getItem('theme') !== 'day';
let selectedLanguage = safeLocalStorage.getItem('language') || 'uk'; // Default to Ukrainian
let gameMode = safeLocalStorage.getItem('mode') || 'open';

// Google Analytics 4 Event Sender
function sendGAEvent(eventName, eventParams = {}) {
    if (typeof gtag === 'function') {
        const paramsToSend = { ...eventParams }; // Create a copy
        if (telegramUserId) {
            paramsToSend.telegram_user_id = telegramUserId;
        }
        gtag('event', eventName, paramsToSend);
        console.log(`[GA_EVENT_SENT] Name: ${eventName}, Params:`, JSON.parse(JSON.stringify(paramsToSend)));
    } else {
        console.warn(`[GA_EVENT_FAIL] gtag is not defined. Event not sent: ${eventName}`, eventParams);
    }
}


document.body.classList.toggle('day', !isNight);
document.querySelector('#language-select .selected-option').textContent = selectedLanguage === 'uk' ? 'Українська' : selectedLanguage === 'ru' ? 'Русский' : selectedLanguage === 'en' ? 'English' : '👽 ⊸⍟⊸';
document.querySelector('#mode-select .selected-option').textContent = translations[selectedLanguage][`mode${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)}`];

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
    const iconsDisplayElement = document.getElementById('stats-guess-history-icons');
    const durationsDisplayElement = document.getElementById('stats-guess-history-durations');

    if (!iconsDisplayElement || !durationsDisplayElement) {
        console.warn('[UI_WARN] Guess history display elements (icons or durations) not found.');
        return;
    }

    let iconsText = '--';
    if (guessResultsHistory.length > 0) {
        iconsText = guessResultsHistory.map(result => (result === 1 ? '✅' : '❌')).join(' ');
    }
    iconsDisplayElement.textContent = iconsText;

    let durationsText = '--';
    if (attemptDurations.length > 0) {
        durationsText = attemptDurations.map(duration => `${duration}`).join(' | ');
    }
    durationsDisplayElement.textContent = durationsText;
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
    document.getElementById('next-photo').textContent = texts.nextPhoto;
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

    updateUI(currentPerson); 
    updateTelegramUserInfoDisplay(); 

    updateModeSelect();
    updateLanguageSelect();
    updateGuessHistoryDisplay(); 
    console.log('[LANGUAGE_UPDATE] Language update complete.');
}

// Обновление текста режима
function updateModeSelect() {
    const modeSelectOptions = document.querySelector('#mode-select .options');
    modeSelectOptions.innerHTML = `
        <li data-value="open">${translations[selectedLanguage].modeOpen}</li>
        <li data-value="closed">${translations[selectedLanguage].modeClosed}</li>
    `;
    document.querySelector('#mode-select .selected-option').textContent = translations[selectedLanguage][`mode${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)}`];
}

// Обновление текста языка
function updateLanguageSelect() {
    const languageSelectOptions = document.querySelector('#language-select .options');
    languageSelectOptions.innerHTML = `
        <li data-value="uk">Українська</li>
        <li data-value="ru">Русский</li>
        <li data-value="en">English</li>
        <li data-value="alien">👽 ⊸⍟⊸</li>
    `;
    document.querySelector('#language-select .selected-option').textContent = selectedLanguage === 'uk' ? 'Українська' : selectedLanguage === 'ru' ? 'Русский' : selectedLanguage === 'en' ? 'English' : '👽 ⊸⍟⊸';
}

// Кастомные выпадающие списки
document.querySelectorAll('.custom-select').forEach(select => {
    const selectedOption = select.querySelector('.selected-option');
    const options = select.querySelector('.options');

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
                safeLocalStorage.setItem('language', selectedLanguage);
                console.log(`[STATE_CHANGE] Language changed from ${oldLanguage} to ${selectedLanguage}. Saved to safeLocalStorage.`);
                if (oldLanguage !== selectedLanguage) {
                    sendGAEvent('language_changed', { new_language: selectedLanguage }); // Changed from new_lang
                }
                updateLanguage();
            } else if (select.id === 'mode-select') {
                const oldMode = gameMode;
                gameMode = value;
                safeLocalStorage.setItem('mode', gameMode);
                console.log(`[STATE_CHANGE] Game mode changed from ${oldMode} to ${gameMode}. Saved to safeLocalStorage.`);
                if (oldMode !== gameMode) {
                    sendGAEvent('game_mode_changed', { new_game_mode: gameMode });
                }
                updateModeVisibility();
                updateCheckButtonState();
                updateModeSelect();
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
});

// Переключение темы
document.getElementById('theme-toggle').addEventListener('click', () => {
    isNight = !isNight;
    const newTheme = isNight ? 'night' : 'day';
    document.body.classList.toggle('day', !isNight);
    safeLocalStorage.setItem('theme', newTheme);
    console.log(`[THEME_CHANGE] Theme changed to: ${newTheme}. Saved to safeLocalStorage.`);
    sendGAEvent('theme_changed', { new_theme: newTheme });
    updateLanguage(); // To update button text
});

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

    statusButtons.style.display = 'none';
    genderButtons.style.display = 'none';
    if (checkBtnElement) checkBtnElement.style.display = 'none';
    console.log('[UI_UPDATE_MODE] Status, Gender, and Check buttons initially hidden.');

    const imageIsReady = personImage.classList.contains('loaded');
    const gameIsActive = currentAttempts < maxAttempts;
    const canMakeGuess = !hasChecked;

    console.log(`[UI_UPDATE_MODE] updateModeVisibility: imageIsReady=${imageIsReady}, gameIsActive=${gameIsActive}, canMakeGuess=${canMakeGuess}, mode=${gameMode}`);

    if (imageIsReady && gameIsActive && canMakeGuess) {
        console.log('[UI_UPDATE_MODE] Conditions met for showing buttons, starting 3s timeout.');
        buttonVisibilityTimeoutId = setTimeout(() => {
            console.log('[UI_TIMEOUT_ELAPSED] 3s timeout elapsed. Showing buttons.');
            statusButtons.style.display = 'flex';
            if (checkBtnElement) {
                checkBtnElement.style.display = 'inline-block';
                updateCheckButtonState(); 
                 console.log('[UI_UPDATE_MODE_TIMEOUT] Check button shown and state updated.');
            }

            if (gameMode === 'closed') {
                genderButtons.style.display = 'flex';
                 console.log('[UI_UPDATE_MODE_TIMEOUT] Closed mode: Gender and Status buttons shown.');
            } else {
                genderButtons.style.display = 'none'; 
                console.log('[UI_UPDATE_MODE_TIMEOUT] Open mode: Status buttons shown, Gender buttons hidden.');
            }
            buttonVisibilityTimeoutId = null;
        }, 3000);
    } else {
         console.log('[UI_UPDATE_MODE] Conditions NOT met for showing buttons with delay, or timeout was cleared.');
    }

    if (gameMode === 'closed') {
        if (hasChecked) { 
            overlay.classList.add('hidden');
            console.log('[UI_UPDATE_MODE_OVERLAY] Closed mode, checked: Overlay hidden.');
        } else { 
            overlay.classList.remove('hidden');
            console.log('[UI_UPDATE_MODE_OVERLAY] Closed mode, not checked: Overlay shown.');
        }
    } else { 
        overlay.classList.add('hidden');
        console.log('[UI_UPDATE_MODE_OVERLAY] Open mode: Overlay hidden.');
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

        const proxyForBWCheck = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&w=100&h=100&fit=cover&output=jpg`; 
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 100; 
            canvas.height = 100;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 100, 100);

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
            console.log(`[IMAGE_CHECK_BW] Result for ${cacheKey} (via proxy ${proxyForBWCheck}): ${isBW ? 'black-and-white' : 'color'} ` +
                        `(R_stdDev:${rStdDev.toFixed(2)}, G_stdDev:${gStdDev.toFixed(2)}, B_stdDev:${bStdDev.toFixed(2)}, Mean Saturation:${(meanSaturation * 100).toFixed(2)}%)`);
            
            rgbHslCache[cacheKey] = isBW; 
            safeLocalStorage.setItem('rgbHslCache', JSON.stringify(rgbHslCache));
            console.log('[CACHE_UPDATE] rgbHslCache updated in safeLocalStorage.');
            
            resolve(isBW);
        };
        img.onerror = () => {
            console.error(`[IMAGE_CHECK_BW_ERROR] Failed to load image via proxy ${proxyForBWCheck} for B&W analysis of ${cacheKey}`);
            resolve(false); 
        };
        img.src = proxyForBWCheck;
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
    console.log(`[IMAGE_LOAD_PROXY] Attempting to load image via proxy: ${url}`);
    element.classList.remove('loaded');
    const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}`;
        
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            element.onload = null;
            element.onerror = null;
        };

        element.onload = () => {
            element.style.opacity = ''; 
            element.classList.add('loaded'); 
            console.log(`[IMAGE_LOAD_PROXY_SUCCESS] Image loaded successfully via proxy: ${proxyUrl}`);
            cleanup();
            resolve();
        };
        element.onerror = () => {
            console.error(`[IMAGE_LOAD_PROXY_ERROR] Proxy image load failed: ${proxyUrl}. Falling back to placeholder.`);
            element.style.opacity = ''; 
            element.src = 'https://via.placeholder.com/300'; 
            element.classList.add('loaded'); 
            cleanup();
            reject(new Error(`Proxy image load failed for ${url}`));
        };
        
        element.src = proxyUrl;
    });
}

const WIKIDATA_QUERY_TIMEOUT_MS = 120000; 

async function fetchPersonData(useRandom = false, category = null) {
    const start = performance.now();
    let query;
    let attempts = 0;
    const maxQueryAttempts = 5;
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
                    'Accept': 'application/sparql-results+json',
                    'User-Agent': 'SimplePhotoApp/1.0 (https://romanmod.github.io/personseei/; krv.mod@gmail.com)',
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
            safeLocalStorage.setItem('wikidataCache', JSON.stringify(wikidataCache));
            console.log('[CACHE_UPDATE] wikidataCache updated in safeLocalStorage.');

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
        const fileName = decodeURIComponent(personBindingForPreload.image.value.split('/').pop());
        const commonsUrl = await getCommonsImageUrl(fileName);

        if (!commonsUrl) {
            console.warn(`[PRELOAD_WARN] No Commons URL for ${fileName} (person: ${personBindingForPreload.personLabel.value}) during preload. Preload for this item skipped.`);
            isCurrentlyPreloading = false;
            return;
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
        const proxyImageUrl = `https://images.weserv.nl/?url=${encodeURIComponent(commonsUrl)}`;

        await new Promise((resolve, reject) => {
            preloadedImage.onload = () => {
                console.log(`[PRELOAD_SUCCESS] Image preloaded successfully via proxy: ${proxyImageUrl} for ${personBindingForPreload.personLabel.value}`);
                preloadedPersonContainer = {
                    data: nextPersonToPreloadEntry, 
                    imageElement: preloadedImage,
                    commonsUrl: commonsUrl,
                    proxyUrl: proxyImageUrl
                };
                resolve();
            };
            preloadedImage.onerror = () => {
                console.error(`[PRELOAD_ERROR] Image preload failed for: ${proxyImageUrl} (person: ${personBindingForPreload.personLabel.value})`);
                reject(new Error(`Preload failed for ${proxyImageUrl}`));
            };
            preloadedImage.src = proxyImageUrl;
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
        document.getElementById('circular-progress-bar').style.strokeDashoffset = 100;
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

                const fileName = decodeURIComponent(currentPersonCandidate.image.value.split('/').pop());
                const commonsUrl = await getCommonsImageUrl(fileName);
                if (!commonsUrl) {
                     console.warn(`[LOAD_PERSON_WARN] No Commons URL for ${fileName}. Fetching new person.`);
                     currentPersonCandidate = await fetchPersonData(true, category);
                     continue;
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
                        document.getElementById('circular-progress-bar').style.strokeDashoffset = 100;
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
    safeLocalStorage.setItem('currentAttemptStartTime', currentAttemptStartTime.toString());
    console.log(`[STATE_CHANGE] Attempt start time set to ${currentAttemptStartTime} for person: ${currentPerson.personLabel.value}. Saved to safeLocalStorage.`);

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
        if (hasChecked && currentAttempts < maxAttempts) {
            nextPersonBtn.style.display = 'block';
            nextPersonBtn.textContent = texts.nextPerson; 
        } else {
            nextPersonBtn.style.display = 'none';
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
        updateUI(null); 

        if (gameMode === 'closed') {
            overlay.classList.remove('hidden'); 
        } else {
            overlay.classList.add('hidden'); 
        }
        
        circularProgressContainer.classList.remove('hidden'); 
        
        currentAttemptStartTime = null; 
        safeLocalStorage.removeItem('currentAttemptStartTime');
        console.log('[STATE_CHANGE] currentAttemptStartTime cleared due to error. Removed from safeLocalStorage.');

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
    console.time('[LOAD_SESSION_TIMING]');
    console.log('[LOAD_SESSION] Starting to load new session data...');
    sessionList = [];
    
    preloadedPersonContainer = null;
    isCurrentlyPreloading = false;
    console.log('[PRELOAD_RESET] Preload state reset for new session.');

    const categories = [
        { gender: 'male', status: 'alive' },
        { gender: 'male', status: 'deceased' },
        { gender: 'female', status: 'alive' },
        { gender: 'female', status: 'deceased' }
    ];

    updateProgressBar(0, false); 

    try {
        const peoplePerCategory = Math.ceil(settings.sessionPeople / categories.length);
        let fetchedCount = 0;
        const totalToFetch = peoplePerCategory * categories.length; 
        console.log(`[LOAD_SESSION] Aiming for ${peoplePerCategory} people per category, total ~${totalToFetch}. Max session size: ${settings.sessionPeople}`);

        const promises = [];
        for (const category of categories) {
            for (let j = 0; j < peoplePerCategory && sessionList.length < settings.sessionPeople; j++) {
                promises.push(
                    fetchPersonData(false, category).then(personBinding => { 
                        if (personBinding) { 
                            sessionList.push({ person: personBinding, category: category });
                        } else {
                            console.warn('[LOAD_SESSION_WARN] fetchPersonData returned null/undefined, skipping from session add.');
                        }
                        fetchedCount++;
                        updateProgressBar((fetchedCount / totalToFetch) * 100, false); 
                        return personBinding; 
                    }).catch(error => {
                        console.error(`[LOAD_SESSION_ERROR] Error fetching for category ${category.gender}/${category.status}: ${error.message}`);
                        fetchedCount++; 
                        updateProgressBar((fetchedCount / totalToFetch) * 100, false); 
                        return null; 
                    })
                );
            }
        }
        
        await Promise.all(promises);
        sessionList = sessionList.filter(entry => 
            entry && entry.person && 
            entry.person.personLabel && entry.person.personLabel.value &&
            entry.person.image && entry.person.image.value &&
            entry.person.gender && entry.person.gender.value &&
            entry.person.birthDate && entry.person.birthDate.value &&
            entry.person.person && entry.person.person.value 
        ).slice(0, settings.sessionPeople); 

        console.log(`[LOAD_SESSION_COMPLETE] New session list loaded with ${sessionList.length} people.`);
        logPhotoStatus();
        updateProgressBar(100, false); 

        if (sessionList.length > 0) {
            hasChecked = false; 
            const firstEntry = sessionList.shift(); 
            console.log(`[LOAD_SESSION] Loading first person from new session: ${firstEntry.person.personLabel.value}`);
            
            await loadPersonFromData(firstEntry.person, firstEntry.category); 
            
            requestAnimationFrame(() => {
                document.getElementById('male-btn').disabled = false;
                document.getElementById('female-btn').disabled = false;
                document.getElementById('alive-btn').disabled = false;
                document.getElementById('dead-btn').disabled = false;
                document.getElementById('next-person').style.display = 'none';
                document.getElementById('next-photo').disabled = false; 
                updateCheckButtonState();
                console.log('[LOAD_SESSION_UI] UI reset for new person from session.');
            });
        } else {
            console.error('[LOAD_SESSION_FAILURE] Session list is empty after fetching and filtering. Handling error.');
            handleError();
        }
    } catch (error) {
        console.error('[LOAD_SESSION_CRITICAL_ERROR] Overall session data loading failed:', error);
        handleError();
        updateProgressBar(0, false); 
    }
    console.timeEnd('[LOAD_SESSION_TIMING]');
    console.log(`[LOAD_SESSION_TIMING] Total session loading time: ${(performance.now() - startTime).toFixed(0)}ms`);
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
        console.log('[LOAD_NEXT_PERSON] Session list is empty, loading new session.');
        await loadSession(); 
        return; 
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
    safeLocalStorage.setItem('currentSessionId', currentSessionId);
    console.log(`[GAME_FLOW] New game session ID: ${currentSessionId}. Saved to safeLocalStorage.`);
    
    currentAttemptStartTime = null; 
    safeLocalStorage.removeItem('currentAttemptStartTime');
    console.log('[GAME_FLOW] currentAttemptStartTime reset and removed from safeLocalStorage.');


    safeLocalStorage.setItem('currentAttempts', currentAttempts.toString());
    safeLocalStorage.setItem('totalGuesses', totalGuesses.toString());
    safeLocalStorage.setItem('successfulGuesses', successfulGuesses.toString());
    safeLocalStorage.setItem('failedGuesses', failedGuesses.toString());
    safeLocalStorage.setItem('guessResultsHistory', JSON.stringify(guessResultsHistory));
    safeLocalStorage.setItem('attemptDurations', JSON.stringify(attemptDurations));
    console.log('[GAME_FLOW] Reset game state saved to safeLocalStorage.');

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
    safeLocalStorage.setItem('guessResultsHistory', JSON.stringify(guessResultsHistory));
    console.log(`[STATE_CHANGE] Guess result (${isOverallCorrect ? 1 : 0}) added to success/fail history. Saved to safeLocalStorage. History:`, guessResultsHistory);
    
    let time_for_attempt_seconds = 0;
    if (currentAttemptStartTime) {
        const time_for_attempt_ms = endTime - currentAttemptStartTime;
        time_for_attempt_seconds = Math.round(time_for_attempt_ms / 1000);
        console.log(`[CHECK_ACTION_TIME] Time for this attempt: ${time_for_attempt_seconds} seconds (${time_for_attempt_ms}ms). Start: ${currentAttemptStartTime}, End: ${endTime}`);
    } else {
        console.warn("[CHECK_ACTION_TIME_WARN] currentAttemptStartTime was not set for this attempt. Time for attempt will be 0.");
    }
    
    attemptDurations.push(time_for_attempt_seconds);
    safeLocalStorage.setItem('attemptDurations', JSON.stringify(attemptDurations));
    console.log(`[STATE_CHANGE] Attempt duration ${time_for_attempt_seconds}s added. Saved to safeLocalStorage. Durations:`, attemptDurations);


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
        game_mode: gameMode,
        guessed_gender: gameMode === 'closed' ? userGenderGuess : undefined,
        actual_gender: actualGender,
        guessed_status: userStatusGuess,
        actual_status: actualStatus,
        is_gender_correct: gameMode === 'closed' ? isGenderCorrect : undefined,
        is_status_correct: isStatusCorrect,
        is_overall_correct: isOverallCorrect,
        attempt_number: currentAttempts,
        new_language: selectedLanguage // Changed from new_lang
    });
    
    requestAnimationFrame(() => {
        personInfo.style.display = 'block'; 
        personInfo.classList.remove('correct', 'incorrect'); 

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
        } else {
            personInfo.classList.add('incorrect');
            failedGuesses++;
            console.log('[CHECK_UI] Guess was INCORRECT.');
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
        
        safeLocalStorage.setItem('currentAttempts', currentAttempts.toString());
        safeLocalStorage.setItem('totalGuesses', totalGuesses.toString()); 
        safeLocalStorage.setItem('successfulGuesses', successfulGuesses.toString());
        safeLocalStorage.setItem('failedGuesses', failedGuesses.toString());
        console.log('[STATE_CHANGE] Game stats after check saved to safeLocalStorage.');

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
            safeLocalStorage.removeItem('currentSessionId');
            safeLocalStorage.removeItem('currentAttemptStartTime');
            currentSessionId = null;
            currentAttemptStartTime = null;
            console.log('[STATE_CHANGE] Game over: currentSessionId and currentAttemptStartTime cleared from safeLocalStorage.');
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
    startNewGame();
});

function initializeApp() {
    console.log('[WINDOW_ONLOAD] Page loaded/loaded-state detected. Initializing application state.');

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

    currentSessionId = safeLocalStorage.getItem('currentSessionId');
    const storedAttemptStartTime = safeLocalStorage.getItem('currentAttemptStartTime');
    if (storedAttemptStartTime) {
        currentAttemptStartTime = parseInt(storedAttemptStartTime, 10);
    }
    guessResultsHistory = JSON.parse(safeLocalStorage.getItem('guessResultsHistory')) || [];
    attemptDurations = JSON.parse(safeLocalStorage.getItem('attemptDurations')) || [];
    console.log(`[WINDOW_ONLOAD_RESTORE] Restored from localStorage - Session ID: ${currentSessionId}, Attempt Start Time: ${currentAttemptStartTime}, Guess Results History: ${guessResultsHistory}, Attempt Durations: ${attemptDurations}`);


    const isFirstLaunchOrReset = safeLocalStorage.getItem('currentAttempts') === null;
    console.log(`[WINDOW_ONLOAD] Is first launch or reset: ${isFirstLaunchOrReset}`);
    
    const personInfoOnLoad = document.getElementById('person-info');
    personInfoOnLoad.style.display = 'none'; 
    personInfoOnLoad.classList.remove('correct', 'incorrect'); 

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
                console.warn("[WINDOW_ONLOAD_GAMEOVER_CLEANUP] Game was over, but session ID or start time found in safeLocalStorage. Clearing them now.");
                safeLocalStorage.removeItem('currentSessionId');
                safeLocalStorage.removeItem('currentAttemptStartTime');
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
                console.warn("[WINDOW_ONLOAD_RESUME_WARN] Resuming game, but currentSessionId is missing from safeLocalStorage. It will be generated on the next new game. GA events for ongoing attempts might miss session_id.");
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
    console.log('[WINDOW_ONLOAD] Page load sequence finished.');
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initializeApp();
} else {
    window.addEventListener('DOMContentLoaded', initializeApp);
}


// --- ФИКС: Отслеживание закрытия страницы или сворачивания приложения (в т.ч. Telegram Web App) ---
document.addEventListener('visibilitychange', () => {
    // Если страница скрывается (пользователь закрывает вкладку, сворачивает браузер)
    if (document.visibilityState === 'hidden') {
        
        // Проверяем, была ли игра начата, но не доведена до конца (10 попыток)
        if (currentAttempts > 0 && currentAttempts < maxAttempts && currentSessionId) {
            console.log('[SESSION_ABANDONED] Пользователь покинул игру до ее завершения.');

            const successRate = totalGuesses > 0 ? Math.round((successfulGuesses / totalGuesses) * 100) : 0;
            
            // Отправка в Google Analytics 4 события брошенной игры.
            sendGAEvent('game_abandoned', {
                attempt_number: currentAttempts, // ИСПОЛЬЗУЕМ ВАШ ГОТОВЫЙ ПАРАМЕТР
                successful_guesses: successfulGuesses,
                failed_guesses: failedGuesses,
                success_rate: `${successRate}%`,
                new_language: selectedLanguage,
                game_mode: gameMode,
                session_id: currentSessionId,
                current_theme: isNight ? 'night' : 'day'
            });
        }
    }
});
