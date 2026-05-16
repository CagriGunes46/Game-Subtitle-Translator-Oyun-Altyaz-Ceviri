import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

// Ensure directories exist
const uploadsDir = join(__dirname, 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir);
const progressDir = join(__dirname, 'progress');
if (!existsSync(progressDir)) mkdirSync(progressDir);

// ─── Progress Save/Load ───
function saveProgress(sessionId, data) {
  const filePath = join(progressDir, `${sessionId}.json`);
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`💾 İlerleme kaydedildi: ${data.translated}/${data.total} (${sessionId})`);
}

function loadProgress(sessionId) {
  const filePath = join(progressDir, `${sessionId}.json`);
  if (existsSync(filePath)) {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }
  return null;
}

function generateSessionId(filename) {
  return filename.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now();
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(join(__dirname, 'public')));

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.srt', '.json', '.txt', '.po', '.csv'];
    const ext = extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Desteklenmeyen dosya formatı: ${ext}. Desteklenen: ${allowed.join(', ')}`));
    }
  }
});

// ─── Gemini AI Setup ───
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `Sen profesyonel bir oyun çevirmensin. İngilizce oyun altyazılarını Türkçeye çeviriyorsun.

KURALLAR:
- Sadece çeviriyi döndür, açıklama ekleme
- Oyun terimlerini doğal Türkçeye çevir
- Karakter isimlerini, özel isimleri ve yer isimlerini DEĞİŞTİRME
- Duygu tonunu koru (komik, ciddi, dramatik, sarkastik vb.)
- Kısa ve öz tut — altyazı ekrana sığmalı
- Doğal konuşma dili kullan, çeviri kokmasın
- Sayıları, tarihleri ve birim ölçülerini olduğu gibi bırak
- Eğer metin zaten Türkçe ise olduğu gibi bırak
- Oyun UI terimleri (HP, XP, Level vb.) İngilizce kalsın

FORMAT:
Sana numaralı satırlar halinde metin vereceğim. Her satırı ayrı ayrı çevir ve aynı numaralama ile döndür.
Örnek giriş:
1|Welcome to the dungeon, warrior.
2|You must defeat the dragon to save the kingdom.

Örnek çıktı:
1|Zindana hoş geldin, savaşçı.
2|Krallığı kurtarmak için ejderhayı yenmelisin.`;

// ─── Subtitle Parsers ───

function parseSRT(content) {
  const blocks = content.trim().split(/\r?\n\r?\n/);
  const entries = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    if (lines.length < 3) continue;

    const index = lines[0].trim();
    const timecode = lines[1].trim();
    const text = lines.slice(2).join('\n');

    if (/^\d+$/.test(index) && timecode.includes('-->')) {
      entries.push({ index: parseInt(index), timecode, text });
    }
  }
  return entries;
}

function parseTXT(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  return lines.map((text, i) => ({ index: i + 1, text }));
}

function parseJSON(content) {
  const data = JSON.parse(content);

  // Array of strings
  if (Array.isArray(data) && typeof data[0] === 'string') {
    return data.map((text, i) => ({ index: i + 1, key: null, text }));
  }

  // Array of objects with text/value/content field
  if (Array.isArray(data) && typeof data[0] === 'object') {
    return data.map((item, i) => {
      const text = item.text || item.value || item.content || item.message || item.dialogue || JSON.stringify(item);
      return { index: i + 1, key: null, text, originalItem: item };
    });
  }

  // Key-value pairs { "key": "text" }
  if (typeof data === 'object') {
    const entries = Object.entries(data);
    return entries.map(([key, value], i) => ({
      index: i + 1,
      key,
      text: typeof value === 'string' ? value : JSON.stringify(value)
    }));
  }

  throw new Error('Desteklenmeyen JSON yapısı');
}

function parsePO(content) {
  const entries = [];
  const blocks = content.split(/\r?\n\r?\n/);
  let index = 1;

  for (const block of blocks) {
    const msgidMatch = block.match(/msgid\s+"(.+?)"/s);
    const msgstrMatch = block.match(/msgstr\s+"(.*)"/s);

    if (msgidMatch && msgidMatch[1]) {
      entries.push({
        index: index++,
        key: msgidMatch[1],
        text: msgidMatch[1],
        originalMsgstr: msgstrMatch ? msgstrMatch[1] : ''
      });
    }
  }
  return entries;
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const entries = [];

  // Detect separator
  const firstLine = lines[0];
  const separator = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  // Skip header if it looks like one
  const startIdx = /^(id|key|index|#)/i.test(firstLine) ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(separator);
    if (parts.length >= 2) {
      const key = parts[0].trim().replace(/^"|"$/g, '');
      const text = parts.slice(1).join(separator).trim().replace(/^"|"$/g, '');
      entries.push({ index: i - startIdx + 1, key, text });
    }
  }
  return entries;
}

// ─── Rebuild Functions ───

function rebuildSRT(entries) {
  return entries.map(e => `${e.index}\n${e.timecode}\n${e.translatedText || e.text}`).join('\n\n') + '\n';
}

function rebuildTXT(entries) {
  return entries.map(e => e.translatedText || e.text).join('\n') + '\n';
}

function rebuildJSON(entries, originalContent) {
  const original = JSON.parse(originalContent);

  // Array of strings
  if (Array.isArray(original) && typeof original[0] === 'string') {
    return JSON.stringify(entries.map(e => e.translatedText || e.text), null, 2);
  }

  // Array of objects
  if (Array.isArray(original) && typeof original[0] === 'object') {
    const result = original.map((item, i) => {
      const entry = entries[i];
      if (!entry) return item;
      const textKey = ['text', 'value', 'content', 'message', 'dialogue'].find(k => k in item);
      if (textKey) {
        return { ...item, [textKey]: entry.translatedText || item[textKey] };
      }
      return item;
    });
    return JSON.stringify(result, null, 2);
  }

  // Key-value
  if (typeof original === 'object') {
    const result = {};
    for (const entry of entries) {
      result[entry.key] = entry.translatedText || entry.text;
    }
    return JSON.stringify(result, null, 2);
  }

  return originalContent;
}

function rebuildPO(entries, originalContent) {
  let result = originalContent;
  for (const entry of entries) {
    if (entry.translatedText) {
      const regex = new RegExp(
        `(msgid\\s+"${escapeRegex(entry.key)}"\\s*\\n)msgstr\\s+".*?"`,
        's'
      );
      result = result.replace(regex, `$1msgstr "${entry.translatedText}"`);
    }
  }
  return result;
}

function rebuildCSV(entries, originalContent) {
  const lines = originalContent.split(/\r?\n/);
  const separator = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const hasHeader = /^(id|key|index|#)/i.test(lines[0]);
  const result = hasHeader ? [lines[0]] : [];
  for (const entry of entries) {
    result.push(`${entry.key}${separator}${entry.translatedText || entry.text}`);
  }
  return result.join('\n') + '\n';
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Translation with Gemini (with fallback) ───

const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];

async function translateWithGemini(texts, modelName) {
  const model = genAI.getGenerativeModel({ model: modelName });
  const input = texts.map((t, i) => `${i + 1}|${t}`).join('\n');
  const fullPrompt = SYSTEM_PROMPT + '\n\nŞimdi aşağıdaki metinleri çevir:\n\n' + input;

  const result = await model.generateContent(fullPrompt);
  const response = result.response.text().trim();
  return response;
}

// Free fallback: MyMemory Translation API (no API key needed)
async function translateWithMyMemory(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|tr`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.responseStatus === 200 && data.responseData?.translatedText) {
    return data.responseData.translatedText;
  }
  return text; // fallback to original
}

async function translateBatchFree(texts) {
  console.log(`🆓 Ücretsiz MyMemory API kullanılıyor (${texts.length} satır)...`);
  const results = [];
  for (const text of texts) {
    try {
      const translated = await translateWithMyMemory(text);
      results.push(translated);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`  MyMemory hatası: ${err.message}`);
      results.push(text);
    }
  }
  return results;
}

function parseGeminiResponse(response, textsLength) {
  let cleanResponse = response;
  cleanResponse = cleanResponse.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();

  const translatedLines = cleanResponse.split('\n').filter(l => l.trim());
  const translations = {};

  for (const line of translatedLines) {
    // Try format: "1|text"
    let pipeIdx = line.indexOf('|');
    if (pipeIdx > 0) {
      const num = parseInt(line.substring(0, pipeIdx).trim());
      const text = line.substring(pipeIdx + 1).trim();
      if (!isNaN(num) && num >= 1 && num <= textsLength && text) {
        translations[num] = text;
        continue;
      }
    }

    // Try format: "1. text" or "1) text"
    const match = line.match(/^(\d+)[.\)]\s+(.+)/);
    if (match) {
      const num = parseInt(match[1]);
      const text = match[2].trim();
      if (num >= 1 && num <= textsLength && text) {
        translations[num] = text;
        continue;
      }
    }

    // Try format: "1: text"
    const colonMatch = line.match(/^(\d+):\s*(.+)/);
    if (colonMatch) {
      const num = parseInt(colonMatch[1]);
      const text = colonMatch[2].trim();
      if (num >= 1 && num <= textsLength && text) {
        translations[num] = text;
      }
    }
  }

  return translations;
}

async function translateBatch(texts, retries = 2) {
  // Try each Gemini model
  for (const modelName of MODELS) {
    console.log(`\n📤 Model deneniyor: ${modelName} (${texts.length} satır)...`);

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await translateWithGemini(texts, modelName);
        console.log(`📥 Gemini yanıtı (${modelName}):\n${response}\n`);

        const translations = parseGeminiResponse(response, texts.length);
        console.log(`✅ Çözümlenen: ${Object.keys(translations).length}/${texts.length}`);

        if (Object.keys(translations).length === 0 && texts.length === 1) {
          const lines = response.split('\n').filter(l => l.trim());
          if (lines.length > 0) translations[1] = lines[0];
        }

        if (Object.keys(translations).length > 0) {
          return texts.map((original, i) => translations[i + 1] || original);
        }

        console.warn('⚠️ Çeviri çözümlenemedi, sonraki model deneniyor...');
        break; // Try next model

      } catch (error) {
        const is429 = error.message && error.message.includes('429');

        if (is429) {
          // Extract retry delay from error
          const delayMatch = error.message.match(/retry in ([\d.]+)s/i);
          const waitSec = delayMatch ? Math.ceil(parseFloat(delayMatch[1])) + 5 : 40;

          if (attempt < retries - 1) {
            console.log(`⏳ Rate limit! ${waitSec}s bekleniyor (${modelName})...`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
          } else {
            console.log(`⚠️ ${modelName} kotası dolu, sonraki model deneniyor...`);
            break; // Try next model
          }
        } else {
          console.error(`❌ ${modelName} hatası:`, error.message);
          break; // Try next model
        }
      }
    }
  }

  // All Gemini models failed, use free fallback
  console.log('\n🔄 Tüm Gemini modelleri başarısız, ücretsiz çeviri API kullanılıyor...');
  return await translateBatchFree(texts);
}
// Gemini-only mode (no fallback)
async function translateWithGeminiOnly(texts, retries = 2) {
  for (const modelName of MODELS) {
    console.log(`\n📤 [Gemini Only] Model: ${modelName} (${texts.length} satır)...`);
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await translateWithGemini(texts, modelName);
        console.log(`📥 Yanıt (${modelName}):\n${response}\n`);
        const translations = parseGeminiResponse(response, texts.length);
        if (Object.keys(translations).length > 0) {
          return texts.map((original, i) => translations[i + 1] || original);
        }
        break;
      } catch (error) {
        if (error.message?.includes('429') && attempt < retries - 1) {
          const delayMatch = error.message.match(/retry in ([\d.]+)s/i);
          const waitSec = delayMatch ? Math.ceil(parseFloat(delayMatch[1])) + 5 : 40;
          console.log(`⏳ Rate limit, ${waitSec}s bekleniyor...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
        } else {
          console.error(`❌ ${modelName}:`, error.message);
          break;
        }
      }
    }
  }
  throw new Error('Tüm Gemini modelleri başarısız oldu');
}





// ─── API Routes ───

// Get saved progress for a session
app.get('/api/progress/:id', (req, res) => {
  const progress = loadProgress(req.params.id);
  if (progress) {
    res.json(progress);
  } else {
    res.status(404).json({ error: 'Kayıtlı ilerleme bulunamadı' });
  }
});

// List saved sessions
app.get('/api/sessions', (req, res) => {
  try {
    const files = existsSync(progressDir)
      ? readdirSync(progressDir).filter(f => f.endsWith('.json'))
      : [];
    const sessions = files.map(f => {
      const data = JSON.parse(readFileSync(join(progressDir, f), 'utf-8'));
      return {
        sessionId: data.sessionId,
        translated: data.translated,
        total: data.total,
        percent: Math.round((data.translated / data.total) * 100),
        engine: data.engine,
        format: data.format
      };
    }).filter(s => s.translated < s.total);
    res.json(sessions);
  } catch (err) {
    res.json([]);
  }
});

// Upload and parse subtitle file
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya yüklenmedi' });
    }

    const filePath = req.file.path;
    const ext = extname(req.file.originalname).toLowerCase();
    const content = readFileSync(filePath, 'utf-8');

    let entries;
    switch (ext) {
      case '.srt': entries = parseSRT(content); break;
      case '.json': entries = parseJSON(content); break;
      case '.txt': entries = parseTXT(content); break;
      case '.po': entries = parsePO(content); break;
      case '.csv': entries = parseCSV(content); break;
      default: return res.status(400).json({ error: `Desteklenmeyen format: ${ext}` });
    }

    if (!entries || entries.length === 0) {
      return res.status(400).json({ error: 'Dosya boş veya geçersiz format' });
    }

    res.json({
      filename: req.file.originalname,
      format: ext.replace('.', ''),
      totalLines: entries.length,
      entries: entries.map(e => ({ index: e.index, text: e.text, key: e.key })),
      originalContent: content,
      uploadPath: filePath
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Translate entries
app.post('/api/translate', async (req, res) => {
  try {
    const { entries, format, originalContent, engine = 'auto' } = req.body;

    if (!entries || entries.length === 0) {
      return res.status(400).json({ error: 'Çevrilecek metin yok' });
    }

    // Only check API key if using gemini or auto
    if (engine !== 'mymemory') {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
        if (engine === 'gemini') {
          return res.status(400).json({ error: 'Gemini API anahtarı ayarlanmamış. .env dosyasını kontrol edin.' });
        }
      }
    }

    // Set up SSE for progress updates
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sessionId = req.body.sessionId || generateSessionId(entries[0]?.text || 'session');
    const startFrom = req.body.startFrom || 0;

    console.log(`\n🚀 Çeviri başlatıldı — Motor: ${engine}, Satır: ${entries.length}, Başlangıç: ${startFrom}, Session: ${sessionId}`);

    const translatedEntries = [...entries];
    let translated = startFrom;
    let paused = false;

    // Restore previous translations if resuming
    if (startFrom > 0 && req.body.previousTranslations) {
      for (let i = 0; i < startFrom && i < req.body.previousTranslations.length; i++) {
        translatedEntries[i] = {
          ...translatedEntries[i],
          translatedText: req.body.previousTranslations[i].translatedText
        };
      }
    }

    if (engine === 'mymemory') {
      // ─── MyMemory: Parallel translation (5 concurrent) ───
      const CONCURRENCY = 5;

      for (let i = startFrom; i < entries.length; i += CONCURRENCY) {
        const batch = entries.slice(i, i + CONCURRENCY);
        const promises = batch.map(e => translateWithMyMemory(e.text));

        try {
          const translations = await Promise.all(promises);
          for (let j = 0; j < batch.length; j++) {
            translatedEntries[i + j] = {
              ...translatedEntries[i + j],
              translatedText: translations[j]
            };
          }
        } catch (error) {
          for (let j = 0; j < batch.length; j++) {
            translatedEntries[i + j] = {
              ...translatedEntries[i + j],
              translatedText: batch[j].text,
              error: true
            };
          }
        }

        translated += batch.length;
        if (translated > entries.length) translated = entries.length;

        // Save progress every 20 lines
        if (translated % 20 === 0 || translated === entries.length) {
          saveProgress(sessionId, {
            sessionId, engine, format, originalContent,
            total: entries.length,
            translated,
            entries: translatedEntries.map(e => ({ index: e.index, text: e.text, translatedText: e.translatedText, key: e.key }))
          });
        }

        res.write(`data: ${JSON.stringify({
          type: 'progress', translated, total: entries.length, sessionId,
          percent: Math.round((translated / entries.length) * 100)
        })}\n\n`);

        if (i + CONCURRENCY < entries.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

    } else {
      // ─── Gemini or Auto ───
      const BATCH_SIZE = 25;

      for (let i = startFrom; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const texts = batch.map(e => e.text);

        try {
          let translations;
          if (engine === 'gemini') {
            translations = await translateWithGeminiOnly(texts);
          } else {
            translations = await translateBatch(texts);
          }

          for (let j = 0; j < batch.length; j++) {
            translatedEntries[i + j] = {
              ...translatedEntries[i + j],
              translatedText: translations[j]
            };
          }

          translated += batch.length;
          if (translated > entries.length) translated = entries.length;

        } catch (error) {
          const is429 = error.message?.includes('429');
          console.error(`Batch ${i} hatası:`, error.message);

          if (is429) {
            // Save progress and pause
            saveProgress(sessionId, {
              sessionId, engine, format, originalContent,
              total: entries.length,
              translated: i,
              entries: translatedEntries.map(e => ({ index: e.index, text: e.text, translatedText: e.translatedText, key: e.key }))
            });

            res.write(`data: ${JSON.stringify({
              type: 'paused',
              sessionId,
              translated: i,
              total: entries.length,
              percent: Math.round((i / entries.length) * 100),
              message: 'API kotası doldu! İlerleme kaydedildi. Kota sıfırlandıktan sonra kaldığınız yerden devam edebilirsiniz.'
            })}\n\n`);
            paused = true;
            break;
          }

          for (let j = 0; j < batch.length; j++) {
            translatedEntries[i + j] = {
              ...translatedEntries[i + j],
              translatedText: batch[j].text, error: true
            };
          }
          translated += batch.length;
        }

        // Save progress every batch
        saveProgress(sessionId, {
          sessionId, engine, format, originalContent,
          total: entries.length, translated,
          entries: translatedEntries.map(e => ({ index: e.index, text: e.text, translatedText: e.translatedText, key: e.key }))
        });

        res.write(`data: ${JSON.stringify({
          type: 'progress', translated, total: entries.length, sessionId,
          percent: Math.round((translated / entries.length) * 100)
        })}\n\n`);

        if (i + BATCH_SIZE < entries.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    if (paused) {
      res.end();
      return;
    }

    // Rebuild file
    let rebuiltContent = '';
    switch (format) {
      case 'srt': rebuiltContent = rebuildSRT(translatedEntries); break;
      case 'txt': rebuiltContent = rebuildTXT(translatedEntries); break;
      case 'json': rebuiltContent = rebuildJSON(translatedEntries, originalContent); break;
      case 'po': rebuiltContent = rebuildPO(translatedEntries, originalContent); break;
      case 'csv': rebuiltContent = rebuildCSV(translatedEntries, originalContent); break;
    }

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      entries: translatedEntries.map(e => ({
        index: e.index,
        text: e.text,
        translatedText: e.translatedText,
        key: e.key
      })),
      translatedContent: rebuiltContent
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('Translation error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// Error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Dosya yükleme hatası: ${err.message}` });
  }
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🎮 Game Subtitle Translator çalışıyor!`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`🔑 Gemini API: ${process.env.GEMINI_API_KEY ? '✅ Ayarlanmış' : '❌ AYARLANMAMIŞ'}\n`);
});
