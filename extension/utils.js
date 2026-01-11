// Вспомогательные функции

async function getCurrentUrl() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ? tab.url : null;
}

async function checkIfPageIsAccessible() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://'))) {
        console.log('⚠️ Текущая страница недоступна для выполнения кода. Открываю Google...\n');
        const newTab = await chrome.tabs.create({ url: 'https://www.google.com' });
        await waitForPageReady();
        tab = await chrome.tabs.get(newTab.id);
    }
    return tab;
}

async function waitForPageReady(timeout = 5000) {
    return new Promise(async (resolve) => {
        const startTime = Date.now();
        let resolved = false;
        let listener = null;
        
        const cleanup = () => {
            if (listener) {
                chrome.tabs.onUpdated.removeListener(listener);
            }
            resolved = true;
        };
        
        const checkPage = async () => {
            if (resolved) return;
            
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                
                if (!tab) {
                    console.warn('Вкладка не найдена, пропускаем ожидание');
                    cleanup();
                    resolve();
                    return;
                }
                
                if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://'))) {
                    console.warn('Страница недоступна для выполнения кода, пропускаем ожидание');
                    cleanup();
                    resolve();
                    return;
                }
                
                if (tab.status === 'complete') {
                    try {
                        const isDOMReady = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            world: 'MAIN',
                            func: () => {
                                return document.readyState === 'complete';
                            }
                        });
                        
                        if (isDOMReady && isDOMReady[0] && isDOMReady[0].result === true) {
                            cleanup();
                            resolve();
                            return;
                        }
                    } catch (scriptError) {
                        console.warn('Не удалось проверить DOM, считаем страницу готовой:', scriptError.message);
                        cleanup();
                        resolve();
                        return;
                    }
                }
                
                const elapsed = Date.now() - startTime;
                if (elapsed >= timeout) {
                    console.warn('Таймаут ожидания готовности страницы');
                    cleanup();
                    resolve();
                    return;
                }
                
                setTimeout(checkPage, 100);
            } catch (error) {
                console.error('Ошибка проверки готовности страницы:', error);
                cleanup();
                resolve();
            }
        };
        
        listener = (updatedTabId, changeInfo, updatedTab) => {
            if (changeInfo.status === 'complete' && !resolved) {
                setTimeout(() => {
                    if (!resolved) {
                        checkPage();
                    }
                }, 200);
            }
        };
        
        chrome.tabs.onUpdated.addListener(listener);
        
        setTimeout(() => {
            if (!resolved) {
                console.warn('Таймаут ожидания готовности страницы (финальный)');
                cleanup();
                resolve();
            }
        }, timeout);
        
        await checkPage();
    });
}

async function getScreenshot() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
            return null;
        }
        
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://'))) {
            return null;
        }
        
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        if (!dataUrl) {
            return null;
        }
        
        const maxWidth = 1366;
        const maxHeight = 768;
        const quality = 0.82;
        
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (imageDataUrl, maxW, maxH, q) => {
                return new Promise((resolve) => {
                    try {
                        const img = new Image();
                        img.onload = () => {
                            let width = img.width;
                            let height = img.height;
                            const originalWidth = width;
                            const originalHeight = height;
                            
                            if (width > maxW || height > maxH) {
                                const scale = Math.min(maxW / width, maxH / height);
                                width = Math.floor(width * scale);
                                height = Math.floor(height * scale);
                            }
                            
                            const canvas = document.createElement('canvas');
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            const optimizedDataUrl = canvas.toDataURL('image/jpeg', q);
                            const base64 = optimizedDataUrl.split(',')[1];
                            resolve({ base64, width, height, originalWidth, originalHeight });
                        };
                        img.onerror = () => {
                            resolve(null);
                        };
                        img.src = imageDataUrl;
                    } catch (error) {
                        resolve(null);
                    }
                });
            },
            args: [dataUrl, maxWidth, maxHeight, quality]
        });
        
        if (result && result[0] && result[0].result) {
            return result[0].result;
        }
        
        return null;
    } catch (error) {
        console.error('Ошибка получения скриншота:', error);
        return null;
    }
}

// Debug функция, использовал для отладки.
// async function saveScreenshotToDisk(screenshotData, filename = null) {
//     try {
//         if (!screenshotData || !screenshotData.base64) {
//             return;
//         }
        
//         const base64Data = screenshotData.base64;
//         const dataUrl = `data:image/jpeg;base64,${base64Data}`;
        
//         const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
//         const defaultFilename = `screenshot-${timestamp}.jpg`;
//         const finalFilename = filename || defaultFilename;
        
//         try {
//             await chrome.downloads.download({
//                 url: dataUrl,
//                 filename: finalFilename,
//                 saveAs: false
//             });
//             console.log(`Скриншот сохранен: ${finalFilename}`);
//         } catch (downloadError) {
//             console.error('Ошибка сохранения скриншота:', downloadError);
//         }
//     } catch (error) {
//         console.error('Ошибка при подготовке скриншота к сохранению:', error);
//     }
// }

