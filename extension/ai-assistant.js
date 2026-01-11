// Класс ассистента. Здесь расположены отправка запросов к claude, вызов callback для выполнения кода (background.js)
// Все, что связано с ИИ моделью

importScripts('utils.js', 'prompts.js');

class AIAssistant {
    constructor(apiKey, executeCodeCallback = null) {
        this.apiKey = apiKey;
        this.systemPrompt = prompts.main_system_prompt;
        this.executeCodeCallback = executeCodeCallback;
    }

    async sendMessage(userMessage, conversationHistory = []) {
        try {
            await checkIfPageIsAccessible();
            let currentUrl = await getCurrentUrl();

            const messages = [];
            if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
                const historyWithoutSystem = conversationHistory.filter(msg => msg.role !== 'system');
                messages.push(...historyWithoutSystem);
            }
            
            let totalInputTokens = 0;
            let totalOutputTokens = 0;
            
            const startPrompt = prompts.start_task_prompt.replace(
                '{userMessage}', userMessage).replace(
                '{currentUrl}', currentUrl).replace(
                '{screenshotInfo}', ''
            );

            const startMessage = { role: 'user', content: startPrompt };
            messages.push(startMessage);

            let assistantResponse = await this.sendToClaude(this.systemPrompt, messages);
            if (!assistantResponse.success) {
                return { success: false, error: assistantResponse.error };
            }
            
            if (assistantResponse.usage) {
                totalInputTokens += assistantResponse.usage.input_tokens || 0;
                totalOutputTokens += assistantResponse.usage.output_tokens || 0;
            }

            let plan = assistantResponse.response;
            let executionResult = { result: "Первый шаг не был выполнен" };
            let lastAssistantMessage = null;
            let lastUserMessage = null;
            const fullMessages = [startMessage, { role: 'assistant', content: assistantResponse.response }];
            
            while (!assistantResponse.response.includes('Задача выполнена успешно')) {
                const shouldStop = await new Promise((resolve) => {
                    chrome.storage.local.get(['should_stop_execution'], (data) => {
                        resolve(data.should_stop_execution === true);
                    });
                });
                
                if (shouldStop) {
                    return { success: false, error: 'Выполнение задачи остановлено пользователем' };
                }
                
                if (!this.executeCodeCallback) {
                    return { success: false, error: 'Функция выполнения кода не предоставлена' };
                }
                
                currentUrl = await getCurrentUrl();

                // Исходя из тестов и полученных результатов, скриншоты лучше отправлять всегда при продолжении
                // Без скриншотов модель начинает ошибаться в элементах, тратить больше токенов и времени на решение
                let continuationScreenshot = await getScreenshot();
                let continuationScreenshotInfo = `Информация о скриншоте:\nРазмер скриншота: ${continuationScreenshot.width}x${continuationScreenshot.height} пикселей. Координаты отсчитываются от левого верхнего угла (0,0).`;

                const maxResultLength = 400;
                let previousStepResult = executionResult.result || '';
                let resultWarning = '';
                
                if (previousStepResult && previousStepResult.length > maxResultLength) {
                    resultWarning = `\nРезультат выполнения предыдущего шага слишком большой (${previousStepResult.length} символов) и будет обрезан .`;
                    previousStepResult = previousStepResult.substring(0, maxResultLength) + '... [обрезано]';
                }

                const continuationPrompt = prompts.continuation_task_prompt.replace(
                    '{userTask}', userMessage).replace('{currentUrl}', currentUrl).replace(
                    '{previousStepResult}', previousStepResult + resultWarning).replace(
                    '{screenshotInfo}', continuationScreenshotInfo
                );
                
                const continuationMessage = { role: 'user', content: [] };
                continuationMessage.content.push({ type: 'text', text: continuationPrompt });
                
                if (continuationScreenshot && continuationScreenshot.base64) {
                    continuationMessage.content.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: 'image/jpeg',
                            data: continuationScreenshot.base64
                        }
                    });
                }
                
                lastAssistantMessage = { role: 'assistant', content: assistantResponse.response };
                lastUserMessage = continuationMessage;
                
                fullMessages.push(lastAssistantMessage, lastUserMessage);
                
                // Модели отдаются только последние 6 сообщений в целях экономии токенов
                const limitedMessages = [];
                const lastMessages = fullMessages.slice(-6);
                limitedMessages.push(...lastMessages);
                
                const systemMessageWithPlan = this.systemPrompt + `\n\nПЛАН ВЫПОЛНЕНИЯ ЗАДАЧИ:\n${plan}`;
                
                assistantResponse = await this.sendToClaude(systemMessageWithPlan, limitedMessages);
                if (!assistantResponse.success) {
                    return { success: false, error: assistantResponse.error };
                }
                
                if (assistantResponse.usage) {
                    totalInputTokens += assistantResponse.usage.input_tokens || 0;
                    totalOutputTokens += assistantResponse.usage.output_tokens || 0;
                }

                const shouldStopBeforeExecution = await new Promise((resolve) => {
                    chrome.storage.local.get(['should_stop_execution'], (data) => {
                        resolve(data.should_stop_execution === true);
                    });
                });
                
                if (shouldStopBeforeExecution) {
                    return { success: false, error: 'Выполнение задачи остановлено пользователем' };
                }

                executionResult = await this.executeCodeCallback(assistantResponse.response);
                console.log('Результат выполнения callback:', executionResult);
                
                if (executionResult && typeof executionResult === 'object') {
                    if (!executionResult.result && executionResult.success !== false) {
                        executionResult.result = 'Код выполнен успешно';
                    } else if (!executionResult.result) {
                        executionResult.result = executionResult.error || 'Ошибка выполнения';
                    }
                } else {
                    executionResult = { result: executionResult || 'Код выполнен' };
                }
                
                await waitForPageReady();
                
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            const totalTokens = totalInputTokens + totalOutputTokens;
            const tokenInfo = `\n\n📊 Статистика использования токенов:\n- Входные токены: ${totalInputTokens}\n- Выходные токены: ${totalOutputTokens}\n- Всего токенов: ${totalTokens}`;
            
            fullMessages.push({ role: 'assistant', content: assistantResponse.response });
            
            return {
                success: true,
                response: assistantResponse.response + tokenInfo,
                messages: fullMessages,
                tokenUsage: {
                    input_tokens: totalInputTokens,
                    output_tokens: totalOutputTokens,
                    total_tokens: totalTokens
                }
            };
        } catch (error) {
            console.error('Ошибка sendMessage:', error);
            return { success: false, error: error.message };
        }
    }

    async sendToClaude(systemMessage, messages) {
        const formattedMessages = messages.map(msg => {
            if (typeof msg.content === 'string') {
                return { role: msg.role, content: msg.content };
            } else if (Array.isArray(msg.content)) {
                return { role: msg.role, content: msg.content };
            } else {
                return { role: msg.role, content: String(msg.content) };
            }
        });
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 8192,
                system: [{type: 'text', text: systemMessage, cache_control: {type: 'ephemeral'}}],
                messages: formattedMessages
            })
        }, { timeout: 10000 });
        const responseData = await response.json();
        if (!response.ok) {
            return { success: false, error: responseData.error?.message || 'Ошибка отправки сообщения' };
        }
        console.log('Токенов использовано на запрос:', responseData.usage);
        console.log('Переданные сообщения:', formattedMessages);
        return { 
            success: true, 
            response: responseData.content[0].text,
            usage: responseData.usage || null
        };
    }
}
