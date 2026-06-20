
const DEBUG = false; // Установите true для включения логирования, false для выключения.

function logger(message) {
  if (DEBUG) {
    Logger.log(message);
  }
}


const MAX_GAME_ATTEMPTS = 10;

function formatDuration(ms) {
  if (isNaN(ms) || ms < 0) return 'n/a';

  let seconds = Math.floor(ms / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  seconds %= 60;
  minutes %= 60;
  hours %= 24;

  let result = "";
  if (days > 0) {
    result += `${days}д `;
  }
  result += `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return result;
}

function initializeMinimalSession(sessionId, eventDate) {
    return {
        sessionId: sessionId,
        startTime: parseSessionIdToDate(sessionId),
        lastEventDate: eventDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd'),
        telegramId: '(not set)',
        language: '(not set)', // This will be updated to new_language if found
        currentTheme: '(not set)',
        gameMode: '(not set)',
        playerLocalStartTime: '(not set)',
        eventCount: 0,
        attemptsMade: 0,
        successfulGuesses: 0,
        failedGuesses: 0,
        attemptHistory: [], // Array of { number, result, time, lang, mode, teleId, theme }
        status: 'game_in_progress', // Default status
        maxAttempts: MAX_GAME_ATTEMPTS,
        gameOverData: null,
        totalActiveTimeSeconds: 0
    };
}


function getGA4Data() {
  const DATA_START_DATE = '2025-06-14'; // Установите вашу реальную дату начала сбора данных
  const spreadsheetId = '17vi2Ya6CfOhFpQcCKlebCa5-QAPYlCUQ2QdQIf3yzYo';
  const propertyId = '490577136';
  let sheet;

  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    sheet = spreadsheet.getSheetByName('Sheet1');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('Sheet1');
      logger('Лист "Sheet1" не найден, создан новый.');
    }
  } catch (error) {
    logger(`Ошибка доступа к Google Sheet: ${error.message}, Stack: ${error.stack}`);
    return;
  }
  const token = ScriptApp.getOAuthToken();

  // Helper function to run a report
  function runReport(payload, requestName) {
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const options = {
      method: 'POST',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${token}` },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    if (result.error) {
      logger(`Ошибка GA4 API для запроса "${requestName}" (параметры: ${JSON.stringify(payload.dimensions.map(d=>d.name))}): ${JSON.stringify(result.error)}`);
      const errorMessage = JSON.stringify(result.error);
      (payload.dimensions.map(d => d.name)).forEach(dimName => {
        if (dimName.startsWith('customEvent:') && errorMessage.includes(dimName.split(':')[1])) {
           logger(`Примечание: Ошибка может быть связана с ${dimName}. Убедитесь, что этот специальный параметр корректно настроен в GA4.`);
        }
      });
    }
    return result;
  }

  const sessions = {};
  const findNewPhotoClicksCount = {}; // { sessionId: count }

  // API Call 1: New Game Started
  const payloadNewGame = {
    dateRanges: [{ startDate: DATA_START_DATE, endDate: 'today' }],
    dimensions: [
      { name: 'customEvent:ga_session_id' },         // 0
      { name: 'date' },                                // 1
      { name: 'customEvent:telegram_user_id' },        // 2
      { name: 'customEvent:new_language' },            // 3 - Changed from new_lang
      { name: 'customEvent:current_theme' },           // 4
      { name: 'customEvent:game_mode' },               // 5
      { name: 'customEvent:player_local_start_time' }  // 6
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'new_game_started' } } }
  };
  const newGameResult = runReport(payloadNewGame, 'NewGameStarted');
  if (newGameResult.error) { logger('Прекращение работы из-за ошибки в NewGameStarted.'); return; }

  if (newGameResult.rows) {
    newGameResult.rows.forEach(row => {
      const dimVals = row.dimensionValues;
      const metricVals = row.metricValues;
      const getDim = (idx, def = '(not set)') => (dimVals[idx] && dimVals[idx].value !== '(not set)' && dimVals[idx].value) ? dimVals[idx].value : def;
      
      const sessionId = getDim(0);
      if (sessionId === '(not set)') return;

      const sessionDate = getDim(1);
      const startTime = parseSessionIdToDate(sessionId);
      const eventCountFromGA = (metricVals && metricVals[0] && metricVals[0].value) ? parseInt(metricVals[0].value, 10) : 0;
      const langFromNewGame = getDim(3); // Index for new_language
      logger(`[DEBUG NewGameStarted] Session: ${sessionId}, Date: ${sessionDate}, API new_language: '${langFromNewGame}'`);

      if (!sessions[sessionId] || (sessions[sessionId].startTime > startTime)) {
        sessions[sessionId] = {
          sessionId: sessionId,
          startTime: startTime,
          lastEventDate: sessionDate,
          telegramId: getDim(2),
          language: langFromNewGame,
          currentTheme: getDim(4),
          gameMode: getDim(5),
          playerLocalStartTime: getDim(6, '(not set)'),
          eventCount: eventCountFromGA,
          attemptsMade: 0,
          successfulGuesses: 0,
          failedGuesses: 0,
          attemptHistory: [],
          status: 'game_in_progress',
          maxAttempts: MAX_GAME_ATTEMPTS,
          gameOverData: null,
          totalActiveTimeSeconds: 0
        };
      } else {
          if (getDim(2) !== '(not set)') sessions[sessionId].telegramId = getDim(2);
          if (langFromNewGame !== '(not set)') sessions[sessionId].language = langFromNewGame;
          if (getDim(4) !== '(not set)') sessions[sessionId].currentTheme = getDim(4);
          if (getDim(5) !== '(not set)') sessions[sessionId].gameMode = getDim(5);
          if (getDim(6, '(not set)') !== '(not set)') sessions[sessionId].playerLocalStartTime = getDim(6, '(not set)');
          if (sessionDate > sessions[sessionId].lastEventDate) sessions[sessionId].lastEventDate = sessionDate;
          if (eventCountFromGA > 0 && (!sessions[sessionId].eventCount || sessions[sessionId].eventCount === 0) ) {
              sessions[sessionId].eventCount = eventCountFromGA;
          }
          if (sessions[sessionId].totalActiveTimeSeconds === undefined) {
              sessions[sessionId].totalActiveTimeSeconds = 0;
          }
      }
    });
  }

  // API Call 2a: Attempt Details (Core)
  const payloadAttemptDetails_Core = {
    dateRanges: [{ startDate: DATA_START_DATE, endDate: 'today' }],
    dimensions: [
      { name: 'customEvent:ga_session_id' },           // 0
      { name: 'date' },                                  // 1
      { name: 'customEvent:attempt_number_in_session' }, // 2
      { name: 'customEvent:attempt_result' },            // 3
      { name: 'customEvent:time_for_attempt_seconds' },  // 4
      { name: 'customEvent:new_language' },              // 5 - Changed from new_lang
      { name: 'customEvent:game_mode' }                  // 6
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'attempt_completed' } } }
  };
  const attemptDetailsCoreResult = runReport(payloadAttemptDetails_Core, 'AttemptDetails_Core');
  if (attemptDetailsCoreResult.error) { logger('Прекращение работы из-за ошибки в AttemptDetails_Core.'); return; }

  if (attemptDetailsCoreResult.rows) {
    attemptDetailsCoreResult.rows.forEach(row => {
      const dimVals = row.dimensionValues;
      const getDim = (idx, def = '(not set)') => (dimVals[idx] && dimVals[idx].value !== '(not set)' && dimVals[idx].value) ? dimVals[idx].value : def;

      const sessionId = getDim(0);
      if (sessionId === '(not set)') return;

      const eventDate = getDim(1);
      const attemptNumberStr = getDim(2);
      const attemptResultStr = getDim(3);
      const timeForAttemptStr = getDim(4);
      const languageVal = getDim(5); // Index for new_language
      const gameModeVal = getDim(6);
      logger(`[DEBUG AttemptCompleted] Session: ${sessionId}, Attempt: ${attemptNumberStr}, Date: ${eventDate}, API new_language: '${languageVal}'`);


      if (!sessions[sessionId]) {
        sessions[sessionId] = initializeMinimalSession(sessionId, eventDate);
      }
      const session = sessions[sessionId];
      if (session.totalActiveTimeSeconds === undefined) session.totalActiveTimeSeconds = 0;
      if (eventDate > session.lastEventDate) session.lastEventDate = eventDate;

      if (session.language === '(not set)' && languageVal !== '(not set)') {
        session.language = languageVal;
      }
      if (session.gameMode === '(not set)' && gameModeVal !== '(not set)') {
        session.gameMode = gameModeVal;
      }
      
      if (attemptNumberStr !== '(not set)' && attemptResultStr !== '(not set)') {
        const attemptNumber = parseInt(attemptNumberStr, 10);
        const attemptResultValue = parseInt(attemptResultStr, 10);

        let attemptEntry = session.attemptHistory.find(a => a.number === attemptNumber);
        if (!attemptEntry && !isNaN(attemptNumber)) {
            attemptEntry = {
                number: attemptNumber,
                result: null, time: null, lang: '(not set)', mode: '(not set)',
                teleId: '(not set)', theme: '(not set)'
            };
            session.attemptHistory.push(attemptEntry);
        }
        
        if (attemptEntry) {
            if (!isNaN(attemptResultValue)) attemptEntry.result = attemptResultValue;
            if (languageVal !== '(not set)') attemptEntry.lang = languageVal;
            if (gameModeVal !== '(not set)') attemptEntry.mode = gameModeVal;

            if (timeForAttemptStr !== '(not set)') {
                const timeForAttemptSec = parseInt(timeForAttemptStr, 10);
                if (!isNaN(timeForAttemptSec) && timeForAttemptSec >= 0) {
                    // Only add to totalActiveTimeSeconds if it's the first time this attempt's time is processed
                    // This prevents double counting if the script runs multiple times or data arrives in pieces.
                    if (attemptEntry.time === null || attemptEntry.time === undefined) {
                         session.totalActiveTimeSeconds += timeForAttemptSec;
                    }
                    attemptEntry.time = timeForAttemptSec;
                }
            }
        }
      }
    });
  }

  // API Call 2b: Attempt Details (Context)
  const payloadAttemptDetails_Context = {
    dateRanges: [{ startDate: DATA_START_DATE, endDate: 'today' }],
    dimensions: [
      { name: 'customEvent:ga_session_id' },           // 0
      { name: 'date' },                                  // 1
      { name: 'customEvent:attempt_number_in_session' }, // 2
      { name: 'customEvent:telegram_user_id' },          // 3
      { name: 'customEvent:current_theme' }              // 4
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'attempt_completed' } } }
  };
  const attemptDetailsContextResult = runReport(payloadAttemptDetails_Context, 'AttemptDetails_Context');
  if (attemptDetailsContextResult.error) { logger('Прекращение работы из-за ошибки в AttemptDetails_Context.'); return; }

  if (attemptDetailsContextResult.rows) {
    attemptDetailsContextResult.rows.forEach(row => {
        const dimVals = row.dimensionValues;
        const getDim = (idx, def = '(not set)') => (dimVals[idx] && dimVals[idx].value !== '(not set)' && dimVals[idx].value) ? dimVals[idx].value : def;

        const sessionId = getDim(0);
        if (sessionId === '(not set)') return;

        const eventDate = getDim(1);
        const attemptNumberStr = getDim(2);
        const telegramIdVal = getDim(3);
        const currentThemeVal = getDim(4);

        if (!sessions[sessionId]) {
            sessions[sessionId] = initializeMinimalSession(sessionId, eventDate);
        }
        const session = sessions[sessionId];
        if (eventDate > session.lastEventDate) session.lastEventDate = eventDate;

        if (session.telegramId === '(not set)' && telegramIdVal !== '(not set)') session.telegramId = telegramIdVal;
        if (session.currentTheme === '(not set)' && currentThemeVal !== '(not set)') session.currentTheme = currentThemeVal;

        if (attemptNumberStr !== '(not set)') {
            const attemptNumber = parseInt(attemptNumberStr, 10);
            let attemptEntry = session.attemptHistory.find(a => a.number === attemptNumber);
            if (!attemptEntry && !isNaN(attemptNumber)) {
                 attemptEntry = {
                    number: attemptNumber,
                    result: null, time: null, lang: '(not set)', mode: '(not set)',
                    teleId: '(not set)', theme: '(not set)'
                };
                session.attemptHistory.push(attemptEntry);
            }
            if (attemptEntry) {
                if (telegramIdVal !== '(not set)') attemptEntry.teleId = telegramIdVal;
                if (currentThemeVal !== '(not set)') attemptEntry.theme = currentThemeVal;
            }
        }
    });
  }
  
  for (const sid in sessions) {
    const session = sessions[sid];
    session.attemptHistory.sort((a, b) => a.number - b.number);
  }

  // API Call 3: Game Over
  const payloadGameOver = {
    dateRanges: [{ startDate: DATA_START_DATE, endDate: 'today' }],
    dimensions: [
      { name: 'customEvent:ga_session_id' },       // 0
      { name: 'date' },                              // 1
      { name: 'customEvent:new_language' },          // 2 - Changed from new_lang
      { name: 'customEvent:current_theme' },         // 3
      { name: 'customEvent:game_mode' },             // 4
      { name: 'customEvent:total_attempts' },        // 5
      { name: 'customEvent:successful_guesses' },    // 6
      { name: 'customEvent:failed_guesses' }         // 7
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'game_over' } } }
  };
  const gameOverResult = runReport(payloadGameOver, 'GameOver');
  if (gameOverResult.error) { logger('Прекращение работы из-за ошибки в GameOver.'); return; }
  
  if (gameOverResult.rows) {
    gameOverResult.rows.forEach(row => {
      const dimVals = row.dimensionValues;
      const getDim = (idx, def = '(not set)') => (dimVals[idx] && dimVals[idx].value !== '(not set)' && dimVals[idx].value) ? dimVals[idx].value : def;

      const sessionId = getDim(0);
      if (sessionId === '(not set)') return;
      
      const eventDate = getDim(1);
      const langFromGameOver = getDim(2); // Index for new_language
      logger(`[DEBUG GameOver] Session: ${sessionId}, Date: ${eventDate}, API new_language for GameOver: '${langFromGameOver}'`);


      if (!sessions[sessionId]) {
        sessions[sessionId] = initializeMinimalSession(sessionId, eventDate);
      }
      
      const session = sessions[sessionId];
      session.status = 'game_over';
      if (eventDate > session.lastEventDate) session.lastEventDate = eventDate;

      if (langFromGameOver !== '(not set)') {
        session.language = langFromGameOver;
      } else {
        if (session.language === '(not set)') {
          logger(`[DEBUG GameOver] Session: ${sessionId}, Language (new_language) remains '(not set)' as GameOver API and prior events provided no language.`);
        } else {
          logger(`[DEBUG GameOver] Session: ${sessionId}, Language (new_language) from GameOver API was '(not set)'. Session language will retain current value: '${session.language}' (from prior event).`);
        }
      }
      
      if (getDim(3) !== '(not set)') session.currentTheme = getDim(3);
      if (getDim(4) !== '(not set)') session.gameMode = getDim(4);
      
      const goTotalAttempts = parseInt(getDim(5));
      const goSuccessfulGuesses = parseInt(getDim(6));
      const goFailedGuesses = parseInt(getDim(7));

      session.gameOverData = {
          total_attempts_go: !isNaN(goTotalAttempts) ? goTotalAttempts : session.maxAttempts,
          successful_guesses_go: !isNaN(goSuccessfulGuesses) ? goSuccessfulGuesses : 0,
          failed_guesses_go: !isNaN(goFailedGuesses) ? goFailedGuesses : 0
      };
      
      session.attemptsMade = session.gameOverData.total_attempts_go;
      session.successfulGuesses = session.gameOverData.successful_guesses_go;
      session.failedGuesses = session.gameOverData.failed_guesses_go;
      
      if (session.attemptsMade !== (session.gameOverData.successful_guesses_go + session.gameOverData.failed_guesses_go)) {
        session.attemptsMade = session.gameOverData.successful_guesses_go + session.gameOverData.failed_guesses_go;
        logger(`[DEBUG GameOver] Session ${sessionId}: Corrected attemptsMade to sum of successful/failed from game_over data. New attemptsMade: ${session.attemptsMade}`);
      }

       if (session.totalActiveTimeSeconds === undefined) {
          session.totalActiveTimeSeconds = 0;
      }
    });
  }
  
    for (const sid in sessions) {
        const session = sessions[sid];
        if (session.status !== 'game_over' || !session.gameOverData) {
            session.attemptsMade = session.attemptHistory.length;
            session.successfulGuesses = session.attemptHistory.filter(a => a.result === 1).length;
            session.failedGuesses = session.attemptHistory.filter(a => a.result === 0).length;
        } else if (session.gameOverData) {
            let sumOfSuccessAndFail = session.gameOverData.successful_guesses_go + session.gameOverData.failed_guesses_go;
            if (session.attemptsMade !== sumOfSuccessAndFail) {
                 logger(`Session ${sid}: game_over total_attempts_go (${session.gameOverData.total_attempts_go}) vs sum of successful/failed (${sumOfSuccessAndFail}). Overriding attemptsMade with sum.`);
                 session.attemptsMade = sumOfSuccessAndFail;
            }
             session.successfulGuesses = session.gameOverData.successful_guesses_go;
             session.failedGuesses = session.gameOverData.failed_guesses_go;
        }
    }

  // API Call 4: "Find New Photo" Clicks (from next_photo_requested event)
  const payloadFindNewPhotoClicks = {
    dateRanges: [{ startDate: DATA_START_DATE, endDate: 'today' }],
    dimensions: [
      { name: 'customEvent:ga_session_id' }, // 0
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'eventName',
              stringFilter: { value: 'next_photo_requested' }
            }
          },
          {
            filter: {
              fieldName: 'customEvent:trigger_button',
              stringFilter: { value: 'find_new' }
            }
          }
        ]
      }
    }
  };
  const findNewPhotoClicksResult = runReport(payloadFindNewPhotoClicks, 'FindNewPhotoClicks');
  if (findNewPhotoClicksResult.error) {
    logger('Ошибка в запросе FindNewPhotoClicks, но продолжение работы скрипта.');
  }

  if (findNewPhotoClicksResult && findNewPhotoClicksResult.rows) {
    findNewPhotoClicksResult.rows.forEach(row => {
      const dimVals = row.dimensionValues;
      const metricVals = row.metricValues;
      const sessionId = (dimVals[0] && dimVals[0].value !== '(not set)' && dimVals[0].value) ? dimVals[0].value : null;
      const count = (metricVals && metricVals[0] && metricVals[0].value) ? parseInt(metricVals[0].value, 10) : 0;

      if (sessionId && count > 0 && sessions[sessionId]) {
        findNewPhotoClicksCount[sessionId] = (findNewPhotoClicksCount[sessionId] || 0) + count;
      }
    });
  }

  const values = [[
    'Статус Сессии', 'Дата события (GA4)', 'Telegram ID', 'GA Session ID (custom)', 'Режим игры',
    'Попыток (факт/макс)', 'Успешные угадывания', 'Неуспешные угадывания',
    'Процент успеха', 'Язык игрока', 'Тема (ночь/день)', 'История Попыток (из GA4)',
    'Время начала сессии (из custom ga_session_id)', 'Локальное время старта (игрок)', 'Кол-во событий (eventCount)',
    'Длительность сессии', 'Нажатий "Найти новое фото"', 'Активное время (попытки)'
  ]];

  const sortedSessionIds = Object.keys(sessions).sort((a,b) => {
    const timeA = sessions[a].startTime instanceof Date ? sessions[a].startTime.getTime() : 0;
    const timeB = sessions[b].startTime instanceof Date ? sessions[b].startTime.getTime() : 0;
    return timeB - timeA;
  });

  sortedSessionIds.forEach(sessionId => {
    const session = sessions[sessionId];
    
    let successRateValue = 0;
    if (session.attemptsMade > 0) {
      successRateValue = (session.successfulGuesses / session.attemptsMade);
    } else if (session.status === 'game_over' && session.gameOverData) {
        const goAttempts = session.gameOverData.successful_guesses_go + session.gameOverData.failed_guesses_go;
        if (goAttempts > 0) {
            successRateValue = (session.gameOverData.successful_guesses_go / goAttempts);
        }
    }

    const attemptSequenceDisplay = session.attemptHistory.length > 0 ?
      session.attemptHistory
        .map(attempt => {
          const icon = attempt.result === 1 ? '✅' : (attempt.result === 0 ? '❌' : '❔');
          const timeDisplay = (typeof attempt.time === 'number' && !isNaN(attempt.time)) ? `(${attempt.time}s)` : '(n/a)';
          return `${icon}${timeDisplay}`;
        })
        .join(' ') : 'n/a';
    
    let sessionStartTimeDisplay = 'unknown_time';
    if (session.startTime instanceof Date && !isNaN(session.startTime)) {
        // New format: HH:mm:ss dd-MM-yyyy
        sessionStartTimeDisplay = Utilities.formatDate(session.startTime, Session.getScriptTimeZone(), 'HH:mm:ss dd-MM-yyyy');
    } else if (typeof session.startTime === 'string') {
        sessionStartTimeDisplay = session.startTime; // Keep raw error string if parsing failed
    }

    let playerLocalStartTimeDisplay = session.playerLocalStartTime || '(not set)';
    if (playerLocalStartTimeDisplay !== '(not set)' && typeof playerLocalStartTimeDisplay === 'string') {
        const parts = playerLocalStartTimeDisplay.split(' ');
        // Expected format: YYYY-MM-DD HH:MM:SS UTCoffset
        if (parts.length >= 3 && parts[1].includes(':')) { // Check if second part looks like time
            const timePart = parts[1]; // "HH:MM:SS"
            const utcPart = parts.slice(2).join(' '); // "UTC+03:00" or similar
            playerLocalStartTimeDisplay = `${timePart} ${utcPart}`;
        } else {
            // If format is unexpected, keep original or a modified note for debugging
            // playerLocalStartTimeDisplay = `(raw: ${playerLocalStartTimeDisplay})`; // Or just keep original
        }
    }

    let sessionDurationDisplay = 'n/a';
    if (session.startTime instanceof Date && !isNaN(session.startTime) &&
        session.lastEventDate && typeof session.lastEventDate === 'string' && session.lastEventDate.length === 8) {
      try {
        const endYear = parseInt(session.lastEventDate.substring(0, 4), 10);
        const endMonth = parseInt(session.lastEventDate.substring(4, 6), 10) - 1;
        const endDay = parseInt(session.lastEventDate.substring(6, 8), 10);
        
        const endDateForCalc = new Date(endYear, endMonth, endDay, 23, 59, 59);

        if (!isNaN(endDateForCalc)) {
          let durationMs = endDateForCalc.getTime() - session.startTime.getTime();
          if (durationMs < 0) {
              durationMs = 0;
          }
          sessionDurationDisplay = formatDuration(durationMs);
        }
      } catch (e) {
        logger(`Error calculating duration for session ${sessionId}: ${e.message}`);
        sessionDurationDisplay = 'error_calc';
      }
    }
    
    const totalActiveTimeDisplay = formatDuration((session.totalActiveTimeSeconds || 0) * 1000);

    values.push([
      session.status,
      session.lastEventDate,
      session.telegramId,
      session.sessionId,
      session.gameMode,
      `${session.attemptsMade}/${session.maxAttempts}`,
      session.successfulGuesses,
      session.failedGuesses,
      successRateValue,
      session.language, // This now reflects new_language
      session.currentTheme,
      attemptSequenceDisplay,
      sessionStartTimeDisplay, // Updated format
      playerLocalStartTimeDisplay, // Updated format
      session.eventCount || 0,
      sessionDurationDisplay,
      findNewPhotoClicksCount[session.sessionId] || 0,
      totalActiveTimeDisplay
    ]);
  });

  try {
    logger('Начало записи данных в лист.');

    // Шаг 1: Полная очистка листа
    sheet.clear();
    logger('Шаг 1: Лист полностью очищен (clear).');
    
    // Шаг 2: Синхронизация после очистки
    SpreadsheetApp.flush();
    logger('Шаг 2: Синхронизация после очистки (flush).');

    // Шаг 3: Запись данных
    if (values.length > 0) {
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
      logger(`Шаг 3: Данные успешно записаны. Всего строк: ${values.length}.`);
      
      // Шаг 4: Уведомление о пропуске форматирования
      logger('Шаг 4: Форматирование ячеек было пропущено, чтобы избежать конфликтов с функцией "Форматировать как таблицу". Пожалуйста, настройте форматы столбцов (например, процентный, числовой) непосредственно в Google Sheets. Эти настройки сохранятся при последующих обновлениях.');

      logger(`Все операции с листом успешно завершены.`);
    } else {
      logger('Нет данных для записи в Google Sheet "Sheet1". Лист остался чистым.');
    }
  } catch (e) {
      logger(`КРИТИЧЕСКАЯ ОШИБКА во время записи/форматирования листа: ${e.message}\nСтек: ${e.stack}`);
  }
}

function parseSessionIdToDate(sessionId) {
  try {
    if (!sessionId || typeof sessionId !== 'string') {
        return 'invalid_session_id_input';
    }
    const parts = sessionId.split('_');
    const timestampStr = parts[0];

    if (!timestampStr) {
        return 'invalid_format_no_timestamp_part';
    }

    const timestampSeconds = parseInt(timestampStr, 10);
    if (isNaN(timestampSeconds)) {
        return 'timestamp_nan';
    }
    if (timestampSeconds < 946684800 || timestampSeconds > 4102444800) { 
        return 'timestamp_out_of_sensible_range';
    }

    const dateObject = new Date(timestampSeconds * 1000);
    if (isNaN(dateObject.getTime())) {
        return 'invalid_date_object';
    }
    return dateObject;
  } catch (e) {
    logger(`Ошибка парсинга session_id '${sessionId}': ${e.message}`);
    return 'parsing_error';
  }
}

function setupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let triggerDeleted = false;
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'getGA4Data') {
      ScriptApp.deleteTrigger(trigger);
      logger('Удален существующий триггер для getGA4Data');
      triggerDeleted = true;
    }
  });
  if(!triggerDeleted) {
    logger('Не найдено существующих триггеров для удаления.');
  }

  ScriptApp.newTrigger('getGA4Data')
    .timeBased()
    .everyDays(1)
    .atHour(1) 
    .inTimezone(Session.getScriptTimeZone())
    .create();
  logger(`Триггер установлен на ежедневный запуск в 1 час ночи (таймзона скрипта: ${Session.getScriptTimeZone()})`);
}
