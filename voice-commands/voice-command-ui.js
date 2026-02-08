/**
 * Voice Command UI
 * Sesli komut paneli, mikrofon butonu, adım listesi ve metin girişi.
 * Web Speech API entegrasyonu.
 */

import { voiceCommandManager } from './voice-command-manager.js';
import { commandToText } from './voice-command-parser.js';
import { draw2D } from '../draw/draw2d.js';

// ───── WEB SPEECH API ─────

let recognition = null;
let isListening = false;

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn('Web Speech API desteklenmiyor. Manuel metin girişi kullanın.');
        return false;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
                finalTranscript += result[0].transcript;
            } else {
                interimTranscript += result[0].transcript;
            }
        }

        // Ara sonucu göster
        if (interimTranscript) {
            updateInterimText(interimTranscript);
        }

        // Kesinleşmiş sonucu işle
        if (finalTranscript) {
            updateInterimText('');
            processVoiceInput(finalTranscript.trim());
        }
    };

    recognition.onerror = (event) => {
        console.warn('Ses tanıma hatası:', event.error);
        if (event.error === 'no-speech' || event.error === 'aborted') {
            // Sessizlik veya iptal - tekrar dinlemeye devam et
            return;
        }
        stopListening();
        updateMicButton(false);
        showStatus(`Ses tanıma hatası: ${event.error}`, 'error');
    };

    recognition.onend = () => {
        // Eğer hala dinliyorsak (kullanıcı kapatmadıysa), tekrar başlat
        if (isListening) {
            try {
                recognition.start();
            } catch (e) {
                // Zaten başlamış olabilir
            }
        }
    };

    return true;
}

function startListening() {
    if (!recognition) {
        if (!initSpeechRecognition()) {
            showStatus('Tarayıcınız ses tanımayı desteklemiyor', 'error');
            return;
        }
    }

    try {
        recognition.start();
        isListening = true;
        updateMicButton(true);
        showStatus('Dinleniyor... Komut verin.', 'listening');
    } catch (e) {
        console.warn('Ses tanıma başlatılamadı:', e);
        showStatus('Ses tanıma başlatılamadı', 'error');
    }
}

function stopListening() {
    if (recognition) {
        isListening = false;
        try {
            recognition.stop();
        } catch (e) {
            // Zaten durmuş olabilir
        }
    }
    updateMicButton(false);
    showStatus('Ses tanıma durduruldu', 'info');
}

function toggleListening() {
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
}

// ───── KOMUT İŞLEME ─────

function processVoiceInput(text) {
    if (!text) return;

    // Komutu yöneticiye gönder
    const result = voiceCommandManager.processCommand(text);

    if (result.success) {
        showStatus(result.message, 'success');
        // Sayfayı yeniden çiz
        requestRedraw();
    } else {
        showStatus(result.message, 'error');
    }

    // Girdi alanını temizle
    const input = document.getElementById('voice-cmd-input');
    if (input) input.value = '';
}

// ───── CANVAS YENİDEN ÇİZİM ─────

function requestRedraw() {
    if (window.requestAnimationFrame) {
        window.requestAnimationFrame(() => {
            draw2D();
        });
    }
}

// ───── UI DOM OLUŞTURMA ─────

export function createVoiceCommandUI() {
    // Ana panel oluştur
    const panel = document.createElement('div');
    panel.id = 'voice-cmd-panel';
    panel.className = 'voice-cmd-panel';
    panel.innerHTML = `
        <div class="voice-cmd-header">
            <span class="voice-cmd-title">Sesli Komut</span>
            <div class="voice-cmd-header-buttons">
                <button id="voice-cmd-clear" class="voice-cmd-btn-small" title="Listeyi Temizle">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
                <button id="voice-cmd-close" class="voice-cmd-btn-small" title="Paneli Kapat">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>

        <div class="voice-cmd-step-list" id="voice-cmd-step-list">
            <div class="voice-cmd-empty">
                Henüz komut verilmedi.<br>
                <small>"Servis kutusu koy" ile başlayın</small><br>
                <small style="opacity:0.6;margin-top:4px;display:block">Toplu: 100 sağ, 150 yukarı, 200 ileri</small>
            </div>
        </div>

        <div class="voice-cmd-status" id="voice-cmd-status"></div>
        <div class="voice-cmd-interim" id="voice-cmd-interim"></div>

        <div class="voice-cmd-input-row">
            <button id="voice-cmd-mic" class="voice-cmd-mic-btn" title="Mikrofonu Aç/Kapat">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
            </button>
            <input type="text" id="voice-cmd-input" class="voice-cmd-text-input"
                   placeholder="Komut yazın... (ör: 100 cm sağa)"
                   autocomplete="off" />
            <button id="voice-cmd-send" class="voice-cmd-send-btn" title="Komutu Gönder">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
            </button>
        </div>
    `;

    document.body.appendChild(panel);

    // Ana mikrofon butonu (araç çubuğundaki)
    const toolbarMicBtn = document.createElement('button');
    toolbarMicBtn.id = 'voice-cmd-toolbar-btn';
    toolbarMicBtn.className = 'voice-cmd-toolbar-btn';
    toolbarMicBtn.title = 'Sesli Komut Paneli';
    toolbarMicBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>
        
    `;

    // Araç çubuğuna ekle - TESİSAT grubu içine
    const tesisatGroup = document.getElementById('group-plumbing');
    if (tesisatGroup) {
        tesisatGroup.appendChild(toolbarMicBtn);
    }

    // Olay dinleyicilerini bağla
    setupEventListeners(panel);

    // Yönetici olaylarını dinle
    setupManagerListeners();

    return panel;
}

// ───── OLAY DİNLEYİCİLER ─────

function setupEventListeners(panel) {
    // Mikrofon butonu (panel içi)
    const micBtn = document.getElementById('voice-cmd-mic');
    if (micBtn) {
        micBtn.addEventListener('click', toggleListening);
    }

    // Metin girişi
    const input = document.getElementById('voice-cmd-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                processVoiceInput(input.value.trim());
            }
        });
    }

    // Gönder butonu
    const sendBtn = document.getElementById('voice-cmd-send');
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            const input = document.getElementById('voice-cmd-input');
            if (input && input.value.trim()) {
                processVoiceInput(input.value.trim());
            }
        });
    }

    // Temizle butonu
    const clearBtn = document.getElementById('voice-cmd-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            voiceCommandManager.clearAll();
            showStatus('Liste temizlendi', 'info');
        });
    }

    // Kapat butonu
    const closeBtn = document.getElementById('voice-cmd-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panel.classList.remove('visible');
        });
    }

    // Araç çubuğu butonu
    const toolbarBtn = document.getElementById('voice-cmd-toolbar-btn');
    if (toolbarBtn) {
        toolbarBtn.addEventListener('click', () => {
            panel.classList.toggle('visible');
            if (panel.classList.contains('visible')) {
                voiceCommandManager.activate();
                const input = document.getElementById('voice-cmd-input');
                if (input) input.focus();
            } else {
                voiceCommandManager.deactivate();
                stopListening();
            }
        });
    }
}

function setupManagerListeners() {
    voiceCommandManager.on('stepsChanged', renderStepList);
    voiceCommandManager.on('stepAdded', (step) => {
        renderStepList(voiceCommandManager.steps);
        scrollStepListToBottom();
    });
}

// ───── UI GÜNCELLEME ─────

/**
 * Komut tipine göre ikon döndür
 */
function getStepIcon(cmd) {
    switch (cmd.type) {
        case 'place':  return '&#9646;'; // ▆ (kutu)
        case 'move':   return '&#9654;'; // ► (ok)
        case 'branch': return '&#9580;'; // ╬ (T-bağlantı)
        case 'add': {
            if (cmd.object === 'vana') return '&#9670;';  // ◆
            if (cmd.object === 'sayac') return '&#9633;';  // □
            if (cmd.object === 'kombi' || cmd.object === 'ocak') return '&#9673;'; // ◉
            return '&#43;'; // +
        }
        case 'view':   return '&#9673;'; // ◉
        case 'select': return '&#9745;'; // ☑ (seçim)
        default:        return '&#9654;'; // ►
    }
}

function renderStepList(steps) {
    const listEl = document.getElementById('voice-cmd-step-list');
    if (!listEl) return;

    if (!steps || steps.length === 0) {
        listEl.innerHTML = '<div class="voice-cmd-empty">Henüz komut verilmedi.<br><small>"Servis kutusu koy" ile başlayın</small></div>';
        return;
    }

    const activeIdx = voiceCommandManager.activeStepIndex;

    // Treeview oluştur: kök seviyedeki adımları ve alt adımları hiyerarşik göster
    listEl.innerHTML = buildTreeHTML(steps, activeIdx);

    // Adım tıklama olayları
    listEl.querySelectorAll('.voice-cmd-step').forEach(el => {
        el.addEventListener('click', () => {
            const stepNum = parseInt(el.dataset.step, 10);
            const result = voiceCommandManager.processCommand(`${stepNum}. adıma dön`);
            if (result.success) {
                showStatus(result.message, 'success');
                renderStepList(voiceCommandManager.steps);
            }
        });
    });
}

/**
 * Adımları treeview HTML olarak oluşturur.
 * Kök adımlar (parentStepIndex === -1) ana seviyede gösterilir.
 * Dallanma adımları (parentStepIndex >= 0) parent'larının altında girintili gösterilir.
 */
function buildTreeHTML(steps, activeIdx) {
    // Kök seviyedeki adımları bul
    const rootSteps = [];
    const childMap = new Map(); // parentIndex → [childStepIndices]

    steps.forEach((step, idx) => {
        if (step.parentStepIndex < 0) {
            rootSteps.push(idx);
        } else {
            if (!childMap.has(step.parentStepIndex)) {
                childMap.set(step.parentStepIndex, []);
            }
            childMap.get(step.parentStepIndex).push(idx);
        }
    });

    // Recursive HTML oluşturma
    function renderNode(stepIdx, depth) {
        const step = steps[stepIdx];
        const isActive = stepIdx === activeIdx;
        const icon = getStepIcon(step.command);
        const dirClass = step.command.direction ? `dir-${step.command.direction}` : '';
        const typeClass = `type-${step.command.type}`;
        const children = childMap.get(stepIdx) || [];
        const hasChildren = children.length > 0;
        const indent = depth * 16; // px indent per level

        let html = `
            <div class="voice-cmd-step ${isActive ? 'active' : ''} ${dirClass} ${typeClass} ${hasChildren ? 'has-children' : ''}"
                 data-step="${step.stepNumber}"
                 style="padding-left: ${6 + indent}px;"
                 title="Bu adıma dönmek için tıklayın">
                ${depth > 0 ? '<span class="voice-cmd-tree-line">└</span>' : ''}
                <span class="voice-cmd-step-num">${step.stepNumber}.</span>
                <span class="voice-cmd-step-icon">${icon}</span>
                <span class="voice-cmd-step-text">${step.text}</span>
                ${isActive ? '<span class="voice-cmd-step-marker">●</span>' : ''}
            </div>
        `;

        // Alt adımları render et
        for (const childIdx of children) {
            html += renderNode(childIdx, depth + 1);
        }

        return html;
    }

    let html = '';
    for (const rootIdx of rootSteps) {
        html += renderNode(rootIdx, 0);
    }
    return html;
}

function scrollStepListToBottom() {
    const listEl = document.getElementById('voice-cmd-step-list');
    if (listEl) {
        listEl.scrollTop = listEl.scrollHeight;
    }
}

function updateMicButton(active) {
    const micBtn = document.getElementById('voice-cmd-mic');
    if (micBtn) {
        micBtn.classList.toggle('listening', active);
    }
    const toolbarBtn = document.getElementById('voice-cmd-toolbar-btn');
    if (toolbarBtn) {
        toolbarBtn.classList.toggle('listening', active);
    }
}

function updateInterimText(text) {
    const el = document.getElementById('voice-cmd-interim');
    if (el) {
        el.textContent = text;
        el.style.display = text ? 'block' : 'none';
    }
}

let statusTimeout = null;

function showStatus(message, type = 'info') {
    const el = document.getElementById('voice-cmd-status');
    if (!el) return;

    el.textContent = message;
    el.className = `voice-cmd-status ${type}`;
    el.style.display = 'block';

    if (statusTimeout) clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
        el.style.display = 'none';
    }, 4000);
}
