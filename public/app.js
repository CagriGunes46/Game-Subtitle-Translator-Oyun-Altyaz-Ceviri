// ─── DOM Elements ───
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const uploadSection = document.getElementById('upload-section');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const fileMeta = document.getElementById('file-meta');
const changeFileBtn = document.getElementById('change-file-btn');
const translateBtn = document.getElementById('translate-btn');
const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const progressStatus = document.getElementById('progress-status');
const previewSection = document.getElementById('preview-section');
const previewBody = document.getElementById('preview-body');
const downloadBtn = document.getElementById('download-btn');
const statsSection = document.getElementById('stats-section');
const statTotal = document.getElementById('stat-total');
const statTranslated = document.getElementById('stat-translated');
const statTime = document.getElementById('stat-time');
const engineSelect = document.getElementById('engine-select');

// ─── State ───
let currentFile = null;
let uploadedData = null;
let translatedContent = null;
let currentSessionId = null;
let pausedData = null; // saved when paused

// ─── Toast ───
function showToast(message, type = 'error') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
}

// ─── Drag & Drop ───
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', () => { if (fileInput.files.length > 0) handleFile(fileInput.files[0]); });

// ─── File Handling ───
async function handleFile(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const allowed = ['.srt', '.json', '.txt', '.po', '.csv'];
    if (!allowed.includes(ext)) { showToast(`Desteklenmeyen format: ${ext}`); return; }

    currentFile = file;
    const formData = new FormData();
    formData.append('file', file);

    try {
        translateBtn.disabled = true;
        translateBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Yükleniyor...`;

        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Dosya yüklenirken hata oluştu'); resetUpload(); return; }

        uploadedData = data;
        fileName.textContent = data.filename;
        fileMeta.textContent = `${data.format.toUpperCase()} • ${data.totalLines} satır`;

        uploadSection.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        previewSection.classList.add('hidden');
        statsSection.classList.add('hidden');
        pausedData = null;
        currentSessionId = null;

        setTranslateButton();
    } catch (err) {
        showToast('Sunucuya bağlanılamadı.');
        resetUpload();
    }
}

function setTranslateButton(resumeMode = false) {
    translateBtn.disabled = false;
    if (resumeMode) {
        translateBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Kaldığı Yerden Devam Et
    `;
        translateBtn.classList.add('btn-resume');
    } else {
        translateBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/>
        <path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
      </svg>
      Çeviriyi Başlat
    `;
        translateBtn.classList.remove('btn-resume');
    }
}

function resetUpload() {
    uploadSection.classList.remove('hidden');
    fileInfo.classList.add('hidden');
    progressSection.classList.add('hidden');
    previewSection.classList.add('hidden');
    statsSection.classList.add('hidden');
    currentFile = null; uploadedData = null; translatedContent = null;
    pausedData = null; currentSessionId = null;
    fileInput.value = '';
}

changeFileBtn.addEventListener('click', resetUpload);

// ─── Translation ───
translateBtn.addEventListener('click', startTranslation);

async function startTranslation() {
    if (!uploadedData) return;

    translateBtn.disabled = true;
    progressSection.classList.remove('hidden');
    previewSection.classList.add('hidden');
    statsSection.classList.add('hidden');

    const engine = engineSelect.value;
    const engineNames = { auto: 'Otomatik', gemini: 'Gemini AI', mymemory: 'MyMemory' };

    const isResume = pausedData !== null;
    const startFrom = isResume ? pausedData.translated : 0;
    const percent = isResume ? pausedData.percent : 0;

    progressBar.style.width = percent + '%';
    progressPercent.textContent = percent + '%';
    progressStatus.textContent = isResume
        ? `${engineNames[engine]} ile devam ediliyor (${startFrom} satırdan)...`
        : `${engineNames[engine]} ile çeviri yapılıyor...`;

    const startTime = Date.now();

    try {
        const body = {
            entries: uploadedData.entries,
            format: uploadedData.format,
            originalContent: uploadedData.originalContent,
            engine: engine,
            sessionId: currentSessionId || undefined,
            startFrom: startFrom,
            previousTranslations: isResume ? pausedData.entries : undefined
        };

        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop();

            for (const event of events) {
                const dataLine = event.replace(/^data: /, '').trim();
                if (!dataLine) continue;

                try {
                    const data = JSON.parse(dataLine);

                    if (data.type === 'progress') {
                        progressBar.style.width = data.percent + '%';
                        progressPercent.textContent = data.percent + '%';
                        progressStatus.textContent = `${data.translated} / ${data.total} satır çevrildi...`;
                        if (data.sessionId) currentSessionId = data.sessionId;
                    }

                    if (data.type === 'paused') {
                        currentSessionId = data.sessionId;
                        pausedData = {
                            sessionId: data.sessionId,
                            translated: data.translated,
                            total: data.total,
                            percent: data.percent,
                            entries: null // will be loaded from server on resume
                        };

                        progressBar.style.width = data.percent + '%';
                        progressPercent.textContent = data.percent + '%';
                        progressStatus.textContent = `⏸️ ${data.message}`;
                        progressStatus.style.color = '#ffd740';

                        showToast(`İlerleme kaydedildi! ${data.translated}/${data.total} satır çevrildi. Kota sıfırlanınca devam edebilirsiniz.`, 'success');
                        setTranslateButton(true);
                        return;
                    }

                    if (data.type === 'complete') {
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                        translatedContent = data.translatedContent;
                        pausedData = null;

                        progressBar.style.width = '100%';
                        progressPercent.textContent = '100%';
                        progressStatus.textContent = 'Çeviri tamamlandı! ✅';
                        progressStatus.style.color = '';

                        setTimeout(() => {
                            progressSection.classList.add('hidden');
                            showPreview(data.entries);
                            showStats(data.entries.length, data.entries.filter(e => !e.error).length, elapsed);
                            showToast('Çeviri başarıyla tamamlandı! 🎉', 'success');
                        }, 500);
                    }

                    if (data.type === 'error') {
                        showToast(`Çeviri hatası: ${data.message}`);
                        progressSection.classList.add('hidden');
                        translateBtn.disabled = false;
                    }
                } catch (e) { /* skip invalid JSON */ }
            }
        }
    } catch (err) {
        showToast(`Bağlantı hatası: ${err.message}`);
        progressSection.classList.add('hidden');
        translateBtn.disabled = false;
    }
}

// ─── Load saved progress on resume ───
translateBtn.addEventListener('click', async function preResume() {
    // This fires before startTranslation due to event ordering
    if (pausedData && currentSessionId && !pausedData.entries) {
        try {
            const res = await fetch(`/api/progress/${currentSessionId}`);
            if (res.ok) {
                const data = await res.json();
                pausedData.entries = data.entries;
            }
        } catch (e) { /* continue anyway */ }
    }
}, true); // capturing phase, fires first

// ─── Preview Table ───
function showPreview(entries) {
    previewBody.innerHTML = '';
    for (const entry of entries) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td class="col-num">${entry.index}</td>
      <td class="col-original"><span class="original-text">${escapeHTML(entry.text)}</span></td>
      <td class="col-translated"><span class="${entry.error ? 'error-text' : 'translated-text'}">${escapeHTML(entry.translatedText || entry.text)}</span></td>
    `;
        previewBody.appendChild(tr);
    }
    previewSection.classList.remove('hidden');
    previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showStats(total, translated, time) {
    statTotal.textContent = total;
    statTranslated.textContent = translated;
    statTime.textContent = time + 's';
    statsSection.classList.remove('hidden');
}

// ─── Download ───
downloadBtn.addEventListener('click', () => {
    if (!translatedContent || !uploadedData) return;
    const originalName = uploadedData.filename;
    const dotIdx = originalName.lastIndexOf('.');
    const baseName = dotIdx > 0 ? originalName.substring(0, dotIdx) : originalName;
    const ext = dotIdx > 0 ? originalName.substring(dotIdx) : '';
    const downloadName = `${baseName}_TR${ext}`;

    const blob = new Blob([translatedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = downloadName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast(`${downloadName} indirildi!`, 'success');
});

// ─── Helpers ───
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Spin animation ───
const style = document.createElement('style');
style.textContent = `
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
  .btn-resume {
    background: linear-gradient(135deg, #ff9800, #ff5722) !important;
    box-shadow: 0 4px 16px rgba(255, 152, 0, 0.4) !important;
  }
  .btn-resume:hover {
    box-shadow: 0 6px 24px rgba(255, 152, 0, 0.6) !important;
  }
`;
document.head.appendChild(style);
