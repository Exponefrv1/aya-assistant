// Скрипты для UI чата, 80% сгенерированы AI
// Было бы хорошо провести рефакторинг и оптимизацию этого файла

const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const debugInfo = document.getElementById('debugInfo');
const STORAGE_KEY = 'chat_history';
const DEBUG_MODE = true;

const taskMessageMap = new Map();

function saveMessage(text, isUser, isError, timestamp) {
    const history = getChatHistory();
    history.push({ text, isUser, isError, timestamp });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function getChatHistory() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
}

function clearChatHistory() {
    localStorage.removeItem(STORAGE_KEY);
}

function clearAssistantMessages() {
    const assistantMessages = chatContainer.querySelectorAll('.message.assistant');
    assistantMessages.forEach(msg => {
        msg.remove();
    });

    taskMessageMap.clear();

    const loading = document.getElementById('loadingMessage');
    if (loading) {
        loading.remove();
    }

    const userMessages = chatContainer.querySelectorAll('.message.user');
    if (userMessages.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <div class="greeting">Приветствую!</div>
            <div>Я - Ая. Твой персональный ассистент. Чем займемся сегодня?</div>
            <div class="suggestions">
                <div class="suggestion-card" prompt="Закажи какую-нибудь позицию в яндекс лавке, но не оплачивай">
                    <span class="suggestion-icon">🍽</span>
                    <span>Заказать еду</span>
                </div>
                <div class="suggestion-card" prompt="Включи музыкальное видео на ютубе">
                    <span class="suggestion-icon">🎸</span>
                    <span>Включить музыку</span>
                </div>
            </div>
        `;
        chatContainer.appendChild(emptyState);
    }
    
    updateClearButtonVisibility();
}

function loadChatHistory() {
    const history = getChatHistory();
    if (history.length > 0) {
        const emptyState = chatContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }
        history.forEach(msg => {
            displayMessage(msg.text, msg.isUser, msg.isError, msg.timestamp);
        });
    }
    updateClearButtonVisibility();
}

        function updateClearButtonVisibility() {
            const clearButton = document.getElementById('clearButton');
            const messages = chatContainer.querySelectorAll('.message');
            const emptyState = chatContainer.querySelector('.empty-state');
            
            if (clearButton) {
                if (messages.length > 0 || !emptyState) {
                    clearButton.classList.add('show');
                } else {
                    clearButton.classList.remove('show');
                }
            }
        }

        function displayMessage(text, isUser = false, isError = false, timestamp = null, taskId = null) {
            try {
                const emptyState = chatContainer.querySelector('.empty-state');
                if (emptyState) {
                    emptyState.remove();
                }

                if (taskId && !isUser) {
                    const loading = document.getElementById('loadingMessage');
                    if (loading) {
                        loading.remove();
                    }
                    
                    if (taskMessageMap.has(taskId)) {
                        const existingMsgId = taskMessageMap.get(taskId);
                        let existingMsg = document.getElementById(existingMsgId);
                        
                        if (!existingMsg) {
                            existingMsg = chatContainer.querySelector(`[data-task-id="${taskId}"]`);
                        }
                        
                        if (existingMsg) {
                            const contentElement = existingMsg.querySelector('.message-content') || existingMsg.querySelector('.error-message');
                            if (contentElement) {
                                contentElement.textContent = text;
                                if (isError) {
                                    contentElement.className = 'error-message';
                                } else {
                                    contentElement.className = 'message-content';
                                }
                                requestAnimationFrame(() => {
                                    chatContainer.scrollTop = chatContainer.scrollHeight;
                                });
                                return existingMsg;
                            }
                        } else {
                            taskMessageMap.delete(taskId);
                        }
                    }
                    
                    const existingMsg = chatContainer.querySelector(`[data-task-id="${taskId}"]`);
                    if (existingMsg) {
                        const contentElement = existingMsg.querySelector('.message-content') || existingMsg.querySelector('.error-message');
                        if (contentElement) {
                            contentElement.textContent = text;
                            if (isError) {
                                contentElement.className = 'error-message';
                            } else {
                                contentElement.className = 'message-content';
                            }
                            if (existingMsg.id) {
                                taskMessageMap.set(taskId, existingMsg.id);
                            }
                            requestAnimationFrame(() => {
                                chatContainer.scrollTop = chatContainer.scrollHeight;
                            });
                            return existingMsg;
                        }
                    }
                }
                
                if (!isUser) {
                    const loading = document.getElementById('loadingMessage');
                    if (loading) {
                        loading.remove();
                    }
                }

                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
                if (taskId && !isUser) {
                    messageDiv.setAttribute('data-task-id', taskId);
                    const messageId = `task-message-${taskId}`;
                    messageDiv.id = messageId;
                    taskMessageMap.set(taskId, messageId);
                }
                
                const contentDiv = document.createElement('div');
                contentDiv.className = isError ? 'error-message' : 'message-content';
                contentDiv.textContent = text;
                
                const timeDiv = document.createElement('div');
                timeDiv.className = 'message-time';
                if (timestamp) {
                    const date = new Date(timestamp);
                    if (!isNaN(date.getTime())) {
                        timeDiv.textContent = date.toLocaleTimeString('ru-RU', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        });
                    } else {
                        timeDiv.textContent = new Date().toLocaleTimeString('ru-RU', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        });
                    }
                } else {
                    timeDiv.textContent = new Date().toLocaleTimeString('ru-RU', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                }
                
                messageDiv.appendChild(contentDiv);
                messageDiv.appendChild(timeDiv);
                chatContainer.appendChild(messageDiv);
                
                requestAnimationFrame(() => {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                });
                
                updateClearButtonVisibility();
                
                return messageDiv;
            } catch (error) {
                console.error('Ошибка при отображении сообщения:', error);
                return null;
            }
        }

        function addMessage(text, isUser = false, isError = false, taskId = null) {
            const timestamp = new Date().toISOString();
            const messageDiv = displayMessage(text, isUser, isError, timestamp, taskId);
            if (!taskId || isUser) {
                saveMessage(text, isUser, isError, timestamp);
            }
            return messageDiv;
        }

function showLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.id = 'loadingMessage';
    
    const loadingContent = document.createElement('div');
    loadingContent.className = 'loading';
    loadingContent.innerHTML = `
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
    `;
    
    loadingDiv.appendChild(loadingContent);
    chatContainer.appendChild(loadingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideLoading() {
    const loading = document.getElementById('loadingMessage');
    if (loading) {
        loading.remove();
    }
    updateClearButtonVisibility();
}

        let isTaskRunning = false;
        let currentRunningTaskId = null;

        async function sendMessage() {
            const taskStatus = localStorage.getItem('current_task_status');

            if ((taskStatus === 'running' || isTaskRunning) && currentRunningTaskId) {
                chrome.runtime.sendMessage({ action: 'stop' }, (response) => {
                    if (response && response.success) {
                        hideLoading();
                        addMessage('Выполнение задачи остановлено', false, false);
                        isTaskRunning = false;
                        currentRunningTaskId = null;
                        sendButton.classList.remove('stopping');
                        localStorage.setItem('current_task_status', 'stopped');
                        chrome.storage.local.set({ should_stop_execution: false });
                        messageInput.focus();
                    }
                });
                return;
            }
            
            const message = messageInput.value.trim();
            if (!message) {
                return;
            }

            addMessage(message, true);
            messageInput.value = '';
            
            clearAssistantMessages();
            
            showLoading();
            isTaskRunning = true;
            sendButton.classList.add('stopping');

            const taskId = 'task_' + Date.now();
            currentRunningTaskId = taskId;
            localStorage.setItem('current_task_id', taskId);
            localStorage.setItem('current_task_status', 'running');
            
            chrome.storage.local.remove([`task_result_${taskId}`]);

            try {
                chrome.runtime.sendMessage({
                    task: message,
                    taskId: taskId
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        hideLoading();
                        addMessage(`Ошибка: ${chrome.runtime.lastError.message}`, false, true);
                        localStorage.setItem('current_task_status', 'error');
                        isTaskRunning = false;
                        currentRunningTaskId = null;
                        sendButton.classList.remove('stopping');
                        sendButton.disabled = false;
                        messageInput.focus();
                    }
                });

                let messageAdded = false;
                const checkTaskStatus = setInterval(async () => {
                    chrome.storage.local.get([`task_result_${taskId}`, 'current_task_status'], (data) => {
                        const status = data.current_task_status;
                        const taskResult = data[`task_result_${taskId}`];
                        
                        if (taskResult && taskResult.result) {
                            if (!messageAdded) {
                                clearInterval(checkTaskStatus);
                                hideLoading();
                                addMessage(taskResult.result, false, !taskResult.success, taskId);
                                messageAdded = true;
                                localStorage.setItem('current_task_status', status || 'completed');
                                isTaskRunning = false;
                                currentRunningTaskId = null;
                                sendButton.classList.remove('stopping');
                                sendButton.disabled = false;
                                messageInput.focus();
                            } else {
                                const existingMsg = chatContainer.querySelector(`[data-task-id="${taskId}"]`);
                                if (existingMsg) {
                                    const contentElement = existingMsg.querySelector('.message-content') || existingMsg.querySelector('.error-message');
                                    if (contentElement) {
                                        contentElement.textContent = taskResult.result;
                                        if (!taskResult.success) {
                                            contentElement.className = 'error-message';
                                        } else {
                                            contentElement.className = 'message-content';
                                        }
                                        requestAnimationFrame(() => {
                                            chatContainer.scrollTop = chatContainer.scrollHeight;
                                        });
                                    }
                                } else {
                                    addMessage(taskResult.result, false, !taskResult.success, taskId);
                                }
                            }
                        } else if (status === 'completed' || status === 'error' || status === 'stopped') {
                            if (!messageAdded) {
                                clearInterval(checkTaskStatus);
                                hideLoading();
                                if (taskResult && taskResult.result) {
                                    addMessage(taskResult.result, false, status === 'error', taskId);
                                } else if (status === 'error') {
                                    addMessage('Произошла ошибка при выполнении задачи', false, true, taskId);
                                } else if (status === 'stopped') {
                                    addMessage('Выполнение задачи остановлено', false, false, taskId);
                                }
                                messageAdded = true;
                                isTaskRunning = false;
                                currentRunningTaskId = null;
                                sendButton.classList.remove('stopping');
                                sendButton.disabled = false;
                                messageInput.focus();
                            }
                        }
                    });
                }, 500);

                setTimeout(() => {
                    if (!messageAdded) {
                        clearInterval(checkTaskStatus);
                        hideLoading();
                        addMessage('Таймаут выполнения задачи (5 минут)', false, true);
                        messageAdded = true;
                        isTaskRunning = false;
                        currentRunningTaskId = null;
                        sendButton.classList.remove('stopping');
                        sendButton.disabled = false;
                        messageInput.focus();
                    }
                }, 300000);
            } catch (error) {
                console.error('Ошибка при отправке:', error);
                hideLoading();
                addMessage(`Ошибка: ${error.message}`, false, true);
                localStorage.setItem('current_task_status', 'error');
                isTaskRunning = false;
                currentRunningTaskId = null;
                sendButton.classList.remove('stopping');
                sendButton.disabled = false;
                messageInput.focus();
            }
        }

        async function initChat() {
            const settingsButton = document.getElementById('settingsButton');
            const apiKeyModal = document.getElementById('apiKeyModal');
            const modalClose = document.getElementById('modalClose');
            const modalCancel = document.getElementById('modalCancel');
            const modalSave = document.getElementById('modalSave');
            const apiKeyInput = document.getElementById('apiKeyInput');

            if (settingsButton && apiKeyModal && modalClose && modalCancel && modalSave && apiKeyInput) {
                chrome.storage.local.get(['anthropic_api_key'], (data) => {
                    if (data.anthropic_api_key) {
                        apiKeyInput.value = data.anthropic_api_key;
                    }
                });

                settingsButton.addEventListener('click', () => {
                    apiKeyModal.classList.add('active');
                    chrome.storage.local.get(['anthropic_api_key'], (data) => {
                        if (data.anthropic_api_key) {
                            apiKeyInput.value = data.anthropic_api_key;
                        } else {
                            apiKeyInput.value = '';
                        }
                    });
                });

                function closeModal() {
                    apiKeyModal.classList.remove('active');
                }

                modalClose.addEventListener('click', closeModal);
                modalCancel.addEventListener('click', closeModal);

                apiKeyModal.addEventListener('click', (e) => {
                    if (e.target === apiKeyModal) {
                        closeModal();
                    }
                });

                modalSave.addEventListener('click', () => {
                    const apiKey = apiKeyInput.value.trim();
                    if (apiKey) {
                        chrome.storage.local.set({ anthropic_api_key: apiKey }, () => {
                            chrome.runtime.sendMessage({ action: 'updateApiKey', apiKey: apiKey }, (response) => {
                                if (response && response.success) {
                                    closeModal();
                                    const successMsg = document.createElement('div');
                                    successMsg.className = 'message user-message';
                                    successMsg.innerHTML = '<div class="message-content">API ключ успешно сохранен</div>';
                                    chatContainer.appendChild(successMsg);
                                    setTimeout(() => successMsg.remove(), 3000);
                                }
                            });
                        });
                    } else {
                        alert('Пожалуйста, введите API ключ');
                    }
                });
            }
            if (!chatContainer) {
                alert('Ошибка: контейнер чата не найден. Проверьте консоль.');
                return;
            }
            
            const taskStatus = localStorage.getItem('current_task_status');
            const taskId = localStorage.getItem('current_task_id');
            if (taskStatus === 'running' && taskId) {
                checkPendingTaskResult(taskId);
            }
            
            loadChatHistory();
            messageInput.focus();
        }

        async function checkPendingTaskResult(taskId) {
            try {
                chrome.storage.local.get([`task_result_${taskId}`], (data) => {
                    const taskResult = data[`task_result_${taskId}`];
                    if (taskResult && taskResult.result) {
                        const emptyState = chatContainer.querySelector('.empty-state');
                        if (emptyState) {
                            emptyState.remove();
                        }
                        hideLoading();
                        addMessage(taskResult.result, false, !taskResult.success, taskId);
                        localStorage.removeItem('current_task_id');
                        localStorage.removeItem('current_task_status');
                    } else {
                        const localResult = localStorage.getItem(`task_result_${taskId}`);
                        if (localResult) {
                            try {
                                const result = JSON.parse(localResult);
                                if (result.result) {
                                    const emptyState = chatContainer.querySelector('.empty-state');
                                    if (emptyState) {
                                        emptyState.remove();
                                    }
                                    hideLoading();
                                    addMessage(result.result, false, !result.success, taskId);
                                    localStorage.removeItem(`task_result_${taskId}`);
                                    localStorage.removeItem('current_task_id');
                                    localStorage.removeItem('current_task_status');
                                }
                            } catch (error) {
                                console.error('Ошибка загрузки результата задачи:', error);
                            }
                        } else {
                            showLoading();
                            let messageAdded = false;
                            const checkInterval = setInterval(() => {
                                chrome.storage.local.get([`task_result_${taskId}`], (data) => {
                                    const taskResult = data[`task_result_${taskId}`];
                                    if (taskResult && taskResult.result) {
                                        if (!messageAdded) {
                                            clearInterval(checkInterval);
                                            hideLoading();
                                            addMessage(taskResult.result, false, !taskResult.success, taskId);
                                            messageAdded = true;
                                            localStorage.removeItem('current_task_id');
                                            localStorage.removeItem('current_task_status');
                                        }
                                    }
                                });
                            }, 1000);
                            
                            setTimeout(() => {
                                if (!messageAdded) {
                                    clearInterval(checkInterval);
                                    hideLoading();
                                    addMessage('Таймаут ожидания результата задачи', false, true);
                                    messageAdded = true;
                                    localStorage.removeItem('current_task_id');
                                    localStorage.removeItem('current_task_status');
                                }
                            }, 60000);
                        }
                    }
                });
            } catch (error) {
                console.error('Ошибка проверки задачи:', error);
            }
        }


sendButton.addEventListener('click', () => {
    const taskStatus = localStorage.getItem('current_task_status');
    if (taskStatus === 'running') {
        sendMessage();
    } else {
        sendMessage();
    }
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendButton.disabled) {
        sendMessage();
    }
});

function attachClearButtonHandler() {
    const clearButton = document.getElementById('clearButton');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            clearChatHistory();
            chatContainer.innerHTML = `
                <button class="clear-button" id="clearButton" title="Очистить историю">Очистить чат</button>
                <div class="empty-state">
                    <div class="greeting">Приветствую!</div>
                    <div>Я - Ая. Твой персональный ассистент. Чем займемся сегодня?</div>
                    <div class="suggestions">
                        <div class="suggestion-card" prompt="Закажи какую-нибудь позицию в яндекс лавке, но не оплачивай">
                            <span class="suggestion-icon">🍽</span>
                            <span>Заказать еду</span>
                        </div>
                        <div class="suggestion-card" prompt="Включи музыкальное видео на ютубе">
                            <span class="suggestion-icon">🎸</span>
                            <span>Включить музыку</span>
                        </div>
                    </div>
                    <br />
                    <span class="version">v1.0.0</span>
                </div>
            `;
            attachSuggestionHandlers();
            updateClearButtonVisibility();
            attachClearButtonHandler();
        });
    }
}

attachClearButtonHandler();

function attachSuggestionHandlers() {
    const suggestionCards = document.querySelectorAll('.suggestion-card');
    suggestionCards.forEach(card => {
        card.addEventListener('click', () => {
            const text = card.getAttribute('prompt');
            messageInput.value = text;
            sendMessage();
        });
    });
}

const aiIcon = document.getElementById('aiIcon');
if (aiIcon) {
    aiIcon.addEventListener('click', () => {
        messageInput.focus();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initChat();
        attachSuggestionHandlers();
    });
} else {
    initChat();
    attachSuggestionHandlers();
}


