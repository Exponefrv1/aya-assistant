// Рантайм для модели и обработка входящих сообщений

importScripts('utils.js', 'ai-assistant.js');

let aiAssistant = null;
let shouldStopExecution = false;
let currentTaskId = null;

async function getApiKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['anthropic_api_key'], (data) => {
            resolve(data.anthropic_api_key || null);
        });
    });
}

async function initializeAIAssistant() {
    const apiKey = await getApiKey();
    if (apiKey && typeof AIAssistant !== 'undefined') {
        aiAssistant = new AIAssistant(apiKey, handleTaskExecution);
    } else {
        aiAssistant = null;
    }
}

// Для остановки выполнения задачи
async function setStopFlag(value) {
    shouldStopExecution = value;
    await chrome.storage.local.set({ should_stop_execution: value });
}

// Для проверки флага остановки выполнения задачи
async function getStopFlag() {
    const data = await chrome.storage.local.get(['should_stop_execution']);
    return data.should_stop_execution === true;
}

chrome.runtime.onInstalled.addListener(() => {
    initializeAIAssistant();
    chrome.sidePanel.setOptions({
        path: 'chat.html',
        enabled: true
    });
});

chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

initializeAIAssistant();

// Слушатель сообщений, запускает/останавливает процесс выполнения задачи
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'stop') {
        setStopFlag(true);
        if (currentTaskId) {
            chrome.storage.local.set({
                [`task_result_${currentTaskId}`]: {
                    success: false,
                    result: 'Выполнение задачи остановлено пользователем',
                    timestamp: Date.now()
                },
                'current_task_status': 'stopped'
            });
        }
        sendResponse({ success: true, message: 'Остановка запрошена' });
        return false;
    }
    
    if (request.action === 'checkStop') {
        getStopFlag().then(shouldStop => {
            sendResponse({ shouldStop });
        });
        return true;
    }

    if (request.action === 'updateApiKey') {
        initializeAIAssistant().then(() => {
            sendResponse({ success: true, message: 'API ключ обновлен' });
        });
        return true;
    }

    if (request.task && request.taskId) {
        (async () => {
            try {
                if (request.taskId) {
                    chrome.storage.local.remove([`task_result_${request.taskId}`]);
                }
                const apiKey = await getApiKey();
                if (!apiKey) {
                    const errorMsg = 'API ключ не установлен. Пожалуйста, укажите ваш Anthropic API ключ через кнопку настроек в чате.';
                    if (request.taskId) {
                        chrome.storage.local.set({
                            [`task_result_${request.taskId}`]: {
                                success: false,
                                result: errorMsg,
                                timestamp: Date.now()
                            },
                            'current_task_status': 'error'
                        });
                    }
                    sendResponse(errorMsg);
                    return;
                }

                await initializeAIAssistant();
                if (!aiAssistant) {
                    const errorMsg = 'Не удалось инициализировать AI Assistant. Проверьте правильность API ключа.';
                    if (request.taskId) {
                        chrome.storage.local.set({
                            [`task_result_${request.taskId}`]: {
                                success: false,
                                result: errorMsg,
                                timestamp: Date.now()
                            },
                            'current_task_status': 'error'
                        });
                    }
                    sendResponse(errorMsg);
                    return;
                }
                
                shouldStopExecution = false;
                chrome.storage.local.set({ should_stop_execution: false, 'current_task_status': 'running' });
                currentTaskId = request.taskId;
                
                const result = await aiAssistant.sendMessage(request.task, []);
                const resultMessage = result.success ? (result.response === 'Задача выполнена успешно' ? 'Задача выполнена успешно' : result.response) : (result.error || 'Произошла ошибка при выполнении задачи');
                
                if (request.taskId) {
                    chrome.storage.local.set({
                        [`task_result_${request.taskId}`]: {
                            success: result.success,
                            result: resultMessage,
                            timestamp: Date.now()
                        },
                        'current_task_status': result.success ? 'completed' : 'error'
                    });
                }
                
                currentTaskId = null;
                setStopFlag(false);
                sendResponse(resultMessage);
            } catch (error) {
                const errorMsg = error.message || 'Произошла ошибка при выполнении задачи';
                if (request.taskId) {
                    chrome.storage.local.set({
                        [`task_result_${request.taskId}`]: {
                            success: false,
                            result: errorMsg,
                            timestamp: Date.now()
                        },
                        'current_task_status': 'error'
                    });
                }
                currentTaskId = null;
                setStopFlag(false);
                sendResponse(errorMsg);
            }
        })();
        
        return true;
    }
    
    return false;
});

// Рантайм для модели, парсит переданный ассистентом код и выполняет команды по очереди
// Поддерживает передачу массива с командами для batch execution
async function handleTaskExecution(executionCode, taskId = null) {
    if (!taskId) {
        taskId = 'task_' + Date.now();
    }

    if (!aiAssistant) {
        const apiKey = await getApiKey();
        if (!apiKey) {
            return { success: false, result: 'API ключ не установлен. Пожалуйста, укажите ваш Anthropic API ключ через кнопку настроек в чате.' };
        }
        await initializeAIAssistant();
        if (!aiAssistant) {
            return { success: false, result: 'Не удалось инициализировать AI Assistant. Проверьте правильность API ключа.' };
        }
    }

    try {
        let tab = await checkIfPageIsAccessible();
        console.log('Начало выполнения задачи:\n', executionCode);
        
        let commands = null;
        try {
            let trimmedCode = executionCode.trim();
            
            trimmedCode = trimmedCode.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
            
            if (trimmedCode.startsWith('[') && trimmedCode.endsWith(']')) {
                commands = JSON.parse(trimmedCode);
                if (!Array.isArray(commands)) {
                    commands = null;
                }
            } else if (trimmedCode.startsWith('{') && trimmedCode.endsWith('}')) {
                const singleCommand = JSON.parse(trimmedCode);
                if (singleCommand.action) {
                    commands = [singleCommand];
                } else {
                    commands = null;
                }
            } else {
                const arrayMatch = trimmedCode.match(/\[[\s\S]*?\{[\s\S]*?"action"[\s\S]*?\}[\s\S]*?\]/);
                if (arrayMatch) {
                    try {
                        const parsed = JSON.parse(arrayMatch[0]);
                        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].action) {
                            commands = parsed;
                        }
                    } catch (e) {
                        console.log('Ошибка парсинга массива:', e.message);
                    }
                }
                
                if (!commands) {
                    const singleMatch = trimmedCode.match(/\{[\s\S]*?"action"[\s\S]*?\}/);
                    if (singleMatch) {
                        try {
                            const parsed = JSON.parse(singleMatch[0]);
                            if (parsed.action) {
                                commands = [parsed];
                            }
                        } catch (e) {
                            console.log('Ошибка парсинга одиночной команды:', e.message);
                        }
                    }
                }
            }
        } catch (e) {
            console.log('Не удалось распарсить команду как JSON:', e.message);
            console.log('Ответ AI:', executionCode);
        }
        
        if (!commands || !Array.isArray(commands) || commands.length === 0) {
            return { success: false, result: `Команда не найдена в ответе. Ожидается JSON с полем "action" или массив команд. Получено: ${executionCode.substring(0, 200)}` };
        }
        
        const results = [];
        let lastError = null;
        
        for (let i = 0; i < commands.length; i++) {
            if (await getStopFlag()) {
                return { success: false, result: 'Выполнение задачи остановлено пользователем' };
            }
            
            const command = commands[i];
            if (!command || !command.action) {
                lastError = `Команда ${i + 1} не содержит поле "action"`;
                break;
            }
            
            console.log(`Выполнение команды ${i + 1}/${commands.length}:`, command.action);
            const executionResult = await executeCommand(tab.id, command);

            if (await getStopFlag()) {
                return { success: false, result: 'Выполнение задачи остановлено пользователем' };
            }
            
            if (!executionResult.success) {
                lastError = `Ошибка выполнения команды ${i + 1} (${command.action}): ${executionResult.error}`;
                break;
            }
            
            results.push({
                command: command.action,
                result: executionResult.result
            });
            
            if (command.action === 'navigate') {
                await waitForPageReady();
            }
        }
        
        if (lastError) {
            return { success: false, result: lastError };
        }
        
        if (results.length === 1) {
            const resultValue = results[0].result;
            if (resultValue !== undefined && resultValue !== null) {
                return { 
                    success: true, 
                    result: typeof resultValue === 'object' ? JSON.stringify(resultValue, null, 2) : String(resultValue)
                };
            } else {
                return { success: true, result: 'Команда выполнена успешно' };
            }
        } else {
            return { 
                success: true, 
                result: `Выполнено команд: ${results.length}\n${results.map((r, i) => `${i + 1}. ${r.command}: ${typeof r.result === 'object' ? JSON.stringify(r.result) : r.result}`).join('\n')}`
            };
        }
    } catch (error) {
        return { success: false, result: `Ошибка выполнения команды: ${error.message}` };
    }
}

// Здесь происходит само выполнение команд, переданных ассистентом
async function executeCommand(tabId, command) {
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            func: (cmd) => {
                return new Promise(async (resolve) => {
                    try {
                        let executionResult;
                        const action = cmd.action;
                        const selector = cmd.selector || 'body';
                        if (action === 'get') {
                            const all = cmd.all || false;
                            if (all) {
                                const elements = document.querySelectorAll(selector);
                                executionResult = Array.from(elements).map((el, index) => ({
                                    index: index,
                                    tagName: el.tagName,
                                    id: el.id || null,
                                    className: el.className || null,
                                    textContent: el.textContent?.substring(0, 200) || null,
                                    innerHTML: el.innerHTML?.substring(0, 500) || null
                                }));
                            } else {
                                const element = document.querySelector(selector);
                                if (element) {
                                    executionResult = {
                                        tagName: element.tagName,
                                        id: element.id || null,
                                        className: element.className || null,
                                        textContent: element.textContent?.substring(0, 200) || null,
                                        innerHTML: element.innerHTML?.substring(0, 500) || null
                                    };
                                } else {
                                    throw new Error(`Элемент с селектором "${selector}" не найден`);
                                }
                            }
                        } else if (action === 'click') {
                            const element = document.querySelector(selector);
                            if (element) {
                                element.click();
                                executionResult = { success: true, message: `Клик по элементу "${selector}" выполнен` };
                            } else {
                                throw new Error(`Элемент с селектором "${selector}" не найден`);
                            }
                        } else if (action === 'type') {
                            const text = cmd.text || '';
                            const element = document.querySelector(selector);
                            if (element) {
                                element.value = text;
                                element.dispatchEvent(new Event('input', { bubbles: true }));
                                element.dispatchEvent(new Event('change', { bubbles: true }));
                                executionResult = { success: true, message: `Текст введен в элемент "${selector}"` };
                            } else {
                                throw new Error(`Элемент с селектором "${selector}" не найден`);
                            }
                        } else if (action === 'wait') {
                            const timeout = cmd.timeout || 5000;
                            const startTime = Date.now();

                            let elementFound = false;
                            while (Date.now() - startTime < timeout) {
                                const element = document.querySelector(selector);
                                if (element && element.offsetParent !== null) {
                                    executionResult = { success: true, message: `Элемент "${selector}" появился` };
                                    elementFound = true;
                                    break;
                                }
                                await new Promise(r => setTimeout(r, 100));
                            }
                            
                            if (!elementFound) {
                                throw new Error(`Элемент "${selector}" не появился за ${timeout}ms`);
                            }
                        } else if (action === 'navigate') {
                            const url = cmd.url;
                            window.location.href = url;
                            executionResult = { success: true, message: `Переход на ${url}` };
                        } else if (action === 'getText') {
                            const element = document.querySelector(selector);
                            if (element) {
                                executionResult = element.textContent || element.innerText || '';
                            } else {
                                throw new Error(`Элемент с селектором "${selector}" не найден`);
                            }
                        } else if (action === 'getAttribute') {
                            const attribute = cmd.attribute;
                            const element = document.querySelector(selector);
                            if (element) {
                                executionResult = element.getAttribute(attribute) || null;
                            } else {
                                throw new Error(`Элемент с селектором "${selector}" не найден`);
                            }
                        } else if (action === 'getHTML') {
                            const element = selector === 'body' ? document.body : document.querySelector(selector);
                            if (element) {
                                executionResult = element.innerHTML?.substring(0, 10000) || '';
                            } else {
                                throw new Error(`Элемент с селектором "${selector}" не найден`);
                            }
                        } else if (action === 'scroll') {
                            const behavior = cmd.behavior || 'smooth';
                            if (selector) {
                                const element = document.querySelector(selector);
                                if (element) {
                                    element.scrollIntoView({ behavior: behavior });
                                    executionResult = { success: true, message: `Прокрутка к элементу "${selector}"` };
                                } else {
                                    throw new Error(`Элемент с селектором "${selector}" не найден`);
                                }
                            } else {
                                window.scrollTo({ top: cmd.top || 0, left: cmd.left || 0, behavior: behavior });
                                executionResult = { success: true, message: 'Прокрутка выполнена' };
                            }
                        } else if (action === 'clickCoordinates') {
                            const screenshotX = cmd.x;
                            const screenshotY = cmd.y;
                            const screenshotWidth = cmd.screenshotWidth || null;
                            const screenshotHeight = cmd.screenshotHeight || null;
                            
                            if (typeof screenshotX !== 'number' || typeof screenshotY !== 'number') {
                                throw new Error('Координаты x и y должны быть числами');
                            }
                            
                            const viewportWidth = window.innerWidth;
                            const viewportHeight = window.innerHeight;
                            
                            let x = screenshotX;
                            let y = screenshotY;
                            
                            if (screenshotWidth && screenshotHeight) {
                                const scaleX = viewportWidth / screenshotWidth;
                                const scaleY = viewportHeight / screenshotHeight;
                                x = Math.floor(screenshotX * scaleX);
                                y = Math.floor(screenshotY * scaleY);
                            }
                            
                            let element = document.elementFromPoint(x, y);
                            if (!element) {
                                throw new Error(`Не удалось найти элемент в координатах (${x}, ${y})`);
                            }
                            
                            const rect = element.getBoundingClientRect();
                            if (rect.width === 0 || rect.height === 0) {
                                element = document.elementFromPoint(x, y);
                            }
                            
                            if (element) {
                                element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
                                
                                await new Promise(resolve => setTimeout(resolve, 100));
                                
                                const updatedRect = element.getBoundingClientRect();
                                const centerX = updatedRect.left + updatedRect.width / 2;
                                const centerY = updatedRect.top + updatedRect.height / 2;
                                
                                const finalX = centerX;
                                const finalY = centerY;
                                
                                const mouseDownEvent = new MouseEvent('mousedown', {
                                    view: window,
                                    bubbles: true,
                                    cancelable: true,
                                    clientX: finalX,
                                    clientY: finalY,
                                    button: 0
                                });
                                
                                const mouseUpEvent = new MouseEvent('mouseup', {
                                    view: window,
                                    bubbles: true,
                                    cancelable: true,
                                    clientX: finalX,
                                    clientY: finalY,
                                    button: 0
                                });
                                
                                const clickEvent = new MouseEvent('click', {
                                    view: window,
                                    bubbles: true,
                                    cancelable: true,
                                    clientX: finalX,
                                    clientY: finalY,
                                    button: 0
                                });
                                
                                element.dispatchEvent(mouseDownEvent);
                                await new Promise(resolve => setTimeout(resolve, 50));
                                element.dispatchEvent(mouseUpEvent);
                                await new Promise(resolve => setTimeout(resolve, 50));
                                element.dispatchEvent(clickEvent);
                                
                                if (typeof element.click === 'function') {
                                    element.click();
                                }
                                
                                if (element.tagName === 'A' && element.href) {
                                    const href = element.href;
                                    if (href && !href.startsWith('javascript:')) {
                                        window.location.href = href;
                                    }
                                }
                                
                                executionResult = { success: true, message: `Клик по координатам (${x}, ${y}) выполнен, элемент: ${element.tagName}${element.id ? '#' + element.id : ''}${element.className ? '.' + element.className.split(' ')[0] : ''}` };
                            } else {
                                throw new Error(`Не удалось найти элемент в координатах (${x}, ${y})`);
                            }
                        } else {
                            throw new Error(`Неизвестная команда: ${action}`);
                        }
                        resolve({ success: true, result: executionResult });
                    } catch (error) {
                        resolve({ 
                            success: false, 
                            error: error.message || 'Неизвестная ошибка',
                            errorDetails: {
                                message: error.message || 'Неизвестная ошибка',
                                name: error.name || 'Error',
                                stack: error.stack || ''
                            }
                        });
                    }
                });
            },
            args: [command]
        });
        
        if (result && result[0] && result[0].result) {
            const funcResult = result[0].result;
            if (funcResult instanceof Promise) {
                const resolvedResult = await funcResult;
                return resolvedResult;
            }
            return funcResult;
        }
        
        return { success: true, result: null };
    } catch (error) {
        return { 
            success: false, 
            error: error.message || 'Неизвестная ошибка',
            errorDetails: {
                message: error.message || 'Неизвестная ошибка',
                name: error.name || 'Error',
                stack: error.stack || ''
            }
        };
    }
}
