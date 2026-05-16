# 🎮 Game Subtitle Translator

AI-powered game subtitle translation tool (English → Turkish) using Google Gemini and MyMemory APIs.

![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Features

- **Multi-format Support**: SRT, JSON, TXT, PO, CSV subtitle files
- **AI Translation**: Uses Google Gemini for high-quality, context-aware game translations
- **Free Fallback**: Automatic fallback to MyMemory API when Gemini quota is exhausted
- **Progress Saving**: Pause and resume translations — never lose progress
- **Batch Processing**: Translates subtitles in optimized batches
- **Real-time Progress**: Live translation progress via Server-Sent Events (SSE)
- **Game-Aware**: Preserves character names, game terms (HP, XP, Level), and emotional tone

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Google Gemini API Key](https://aistudio.google.com/app/apikey) (free tier available)

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/game-subtitle-translator.git
   cd game-subtitle-translator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your Gemini API key:
   ```
   GEMINI_API_KEY=your_actual_api_key_here
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

## 🎯 Usage

1. Upload a subtitle file (`.srt`, `.json`, `.txt`, `.po`, or `.csv`)
2. Select a translation engine:
   - **Auto**: Tries Gemini first, falls back to MyMemory
   - **Gemini Only**: Uses only Google Gemini
   - **MyMemory**: Uses the free MyMemory API
3. Click translate and watch real-time progress
4. Download the translated file

## 📁 Supported Formats

| Format | Description | Example Use |
|--------|-------------|-------------|
| `.srt`  | SubRip Subtitle | Video game cutscenes |
| `.json` | JSON (key-value, arrays) | Game localization files |
| `.txt`  | Plain text (line-by-line) | Simple dialogue files |
| `.po`   | Gettext PO | Open-source game translations |
| `.csv`  | CSV/TSV | Spreadsheet-based translations |

## 🔧 Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key | Required |
| `PORT` | Server port | `3000` |

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **AI**: Google Gemini API (`@google/generative-ai`)
- **File Upload**: Multer
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Translation Fallback**: MyMemory API

## 📝 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

# 🇹🇷 Türkçe

## 🎮 Oyun Altyazı Çevirici

Google Gemini ve MyMemory API'lerini kullanarak İngilizce oyun altyazılarını Türkçeye çeviren yapay zeka destekli araç.

## ✨ Özellikler

- **Çoklu Format Desteği**: SRT, JSON, TXT, PO, CSV altyazı dosyaları
- **Yapay Zeka Çevirisi**: Yüksek kaliteli, bağlama duyarlı çeviriler için Google Gemini kullanır
- **Ücretsiz Yedek Motor**: Gemini kotası dolduğunda otomatik olarak MyMemory API'ye geçer
- **İlerleme Kaydetme**: Çevirileri duraklatın ve kaldığınız yerden devam edin — ilerlemenizi asla kaybetmeyin
- **Toplu İşleme**: Altyazıları optimize edilmiş gruplar halinde çevirir
- **Gerçek Zamanlı İlerleme**: Server-Sent Events (SSE) ile canlı çeviri takibi
- **Oyun Farkındalığı**: Karakter isimlerini, oyun terimlerini (HP, XP, Level) ve duygu tonunu korur

## 📋 Gereksinimler

- [Node.js](https://nodejs.org/) (v18 veya üzeri)
- [Google Gemini API Anahtarı](https://aistudio.google.com/app/apikey) (ücretsiz katman mevcut)

## 🚀 Kurulum

1. **Projeyi indirin**
   ```bash
   git clone https://github.com/YOUR_USERNAME/game-subtitle-translator.git
   cd game-subtitle-translator
   ```

2. **Bağımlılıkları yükleyin**
   ```bash
   npm install
   ```

3. **Ortam değişkenlerini ayarlayın**
   ```bash
   cp .env.example .env
   ```
   Ardından `.env` dosyasını açıp Gemini API anahtarınızı ekleyin:
   ```
   GEMINI_API_KEY=buraya_api_anahtarinizi_yazin
   ```

4. **Sunucuyu başlatın**
   ```bash
   npm start
   ```

5. **Tarayıcıda açın**
   ```
   http://localhost:3000
   ```

## 🎯 Kullanım

1. Bir altyazı dosyası yükleyin (`.srt`, `.json`, `.txt`, `.po` veya `.csv`)
2. Çeviri motorunu seçin:
   - **Otomatik**: Önce Gemini dener, başarısız olursa MyMemory'ye geçer
   - **Sadece Gemini**: Yalnızca Google Gemini kullanır
   - **MyMemory**: Ücretsiz MyMemory API kullanır
3. Çevir butonuna tıklayın ve gerçek zamanlı ilerlemeyi izleyin
4. Çevrilen dosyayı indirin

## 📁 Desteklenen Formatlar

| Format | Açıklama | Örnek Kullanım |
|--------|----------|----------------|
| `.srt`  | SubRip Altyazı | Oyun ara sahneleri |
| `.json` | JSON (anahtar-değer, diziler) | Oyun yerelleştirme dosyaları |
| `.txt`  | Düz metin (satır satır) | Basit diyalog dosyaları |
| `.po`   | Gettext PO | Açık kaynak oyun çevirileri |
| `.csv`  | CSV/TSV | Tablo tabanlı çeviriler |

## 🔧 Yapılandırma

| Değişken | Açıklama | Varsayılan |
|----------|----------|------------|
| `GEMINI_API_KEY` | Google Gemini API anahtarı | Zorunlu |
| `PORT` | Sunucu portu | `3000` |

## 🛠️ Teknoloji Yığını

- **Backend**: Node.js, Express.js
- **Yapay Zeka**: Google Gemini API (`@google/generative-ai`)
- **Dosya Yükleme**: Multer
- **Frontend**: Saf HTML/CSS/JavaScript
- **Yedek Çeviri**: MyMemory API

## 📝 Lisans

Bu proje MIT Lisansı altında lisanslanmıştır — detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 🤝 Katkıda Bulunma

Katkılarınızı bekliyoruz! Issue açabilir veya Pull Request gönderebilirsiniz.

1. Projeyi forklayın
2. Özellik branch'i oluşturun (`git checkout -b feature/harika-ozellik`)
3. Değişikliklerinizi commitleyin (`git commit -m 'Harika özellik eklendi'`)
4. Branch'e pushlayın (`git push origin feature/harika-ozellik`)
5. Pull Request açın
