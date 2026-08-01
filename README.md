# 🎓 Feynman Router — Web Version (Static, No Backend)

Aplikasi belajar teknik Feynman dengan **Smart Router ke 30 AI gratis** + **Sistem Penilaian 7 Dimensi** + **Sistem Koreksi Spesifik** + **Mode Gabungan (Coach + Murid)**.

**Versi ini adalah pure HTML/CSS/JS** — bisa langsung di-hosting di **GitHub Pages**, **Netlify**, **Cloudflare Pages**, atau server static manapun. Tanpa backend, tanpa API key, tanpa build step.

## 🚀 Cara Hosting di GitHub Pages (3 menit)

### Langkah 1: Buat Repository GitHub
1. Login ke https://github.com
2. Klik tombol **"+"** di kanan atas → **"New repository"**
3. Nama repository: `feynman-router` (atau apa saja)
4. Pilih **Public** (gratis untuk GitHub Pages)
5. Centang **"Add a README file"**
6. Klik **"Create repository"**

### Langkah 2: Upload File
Ada 2 cara:

**Cara A: Upload via Web (paling mudah)**
1. Di repository kamu, klik tombol **"Add file"** → **"Upload files"**
2. Drag semua file dari folder `feynman-router-web/` ke area upload:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `personas.js`
   - `closing-detector.js`
   - `manifest.json`
   - `sw.js`
   - `icon-192.png`
   - `icon-512.png`
   - `README.md`
3. Tulis commit message: `Initial commit - Feynman Router`
4. Klik **"Commit changes"**

**Cara B: Upload via Git CLI**
```bash
# Clone repository kosong kamu
git clone https://github.com/USERNAME/feynman-router.git
cd feynman-router

# Copy semua file dari feynman-router-web/ ke sini
cp /path/to/feynman-router-web/* .

# Add, commit, push
git add .
git commit -m "Initial commit - Feynman Router"
git push origin main
```

### Langkah 3: Aktifkan GitHub Pages
1. Di repository kamu, klik tab **"Settings"**
2. Di sidebar kiri, klik **"Pages"**
3. Di section **"Source"**, pilih:
   - Branch: **`main`** (atau `master`)
   - Folder: **`/ (root)`**
4. Klik **"Save"**

### Langkah 4: Tunggu 1-2 Menit
- GitHub akan build Pages kamu
- Refresh halaman Settings → Pages setiap 30 detik
- Setelah selesai, muncul pesan: **"Your site is published at https://USERNAME.github.io/feynman-router/"**

### Langkah 5: Buka URL-mu! 🎉
```
https://USERNAME.github.io/feynman-router/
```

Buka URL itu di **Chrome Android** untuk install sebagai PWA:
1. Ketuk menu **⋮** → **"Add to Home screen"** → **"Install"**
2. Ikon Feynman Router muncul di home screen
3. Ketuk untuk buka — app jalan fullscreen!

## 📂 Struktur File

```
feynman-router-web/
├── index.html          # Halaman utama (UI lengkap)
├── styles.css          # Semua styling
├── app.js              # Logic utama (router, evaluator, UI)
├── personas.js         # 30 AI personas
├── closing-detector.js # Deteksi kata penutup + dedupe mic
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline cache)
├── icon-192.png        # PWA icon kecil
├── icon-512.png        # PWA icon besar
└── README.md           # File ini
```

## ✨ Fitur Lengkap

### 3 Mode Belajar
- 🟢 **Coach** — AI jadi mentor: mengoreksi & menguji pemahaman
- 🔴 **Murid** — AI jadi murid penasaran: bertanya polos tapi tajam
- 🟣 **Gabungan** — AI bergantian jadi guru & murid

### 30 AI Gratis (tanpa API key)
- **12 Coach**: Socrates, Feynman Jr., Mentor Llama, Mistral Coach, Sage DeepSeek, Critique Reasoner, Qwen Coder, SearchGPT Coach, Unity Mentor, Reasoning Coach, Gemini Mentor, Bidi Coach
- **12 Murid**: Curio, Pupil Qwen, Wonder, Newbie Llama, Skeptic, Kid OpenAI, Teen Sage, Tester Search, Dreamer, Checker, Interpreter, Storyteller
- **6 Hybrid**: Balance, Tutor Pro, Clarifier, Diagnostic Doc, Echo, Sage Critic

Semua AI diakses langsung dari browser via **Pollinations.ai** (gratis, anonymous, CORS-enabled).

### Sistem Penilaian 7 Dimensi
1. 🌱 Kesederhanaan
2. 💧 Kejelasan
3. 🎯 Akurasi
4. 🌊 Kedalaman
5. 🏗️ Struktur
6. 🔗 Analogi & Contoh
7. 🛠️ Koreksi & Perbaikan

Output: Grade A+/A/B/C/D/F + persentase + kekuatan + perbaikan + **daftar koreksi spesifik** (kutipan, jenis kesalahan, severity, koreksi yang benar).

### Fitur Lain
- 🎙️ Mic input (Web Speech API) dengan dedupe kata berulang
- 🎤 Rekam audio → ASR via Gemini (transkripsi sempurna, support sampai 30 menit)
- 📹 Rekam video → VLM via Gemini (ekstrak frame adaptif + audio chunking, support 30 menit)
- 🔔 Notifikasi browser (skor turun, target tercapai)
- 🎯 Target skor per topik
- 🏆 Leaderboard kelas/grup (multi-player)
- 📈 Trend chart per minggu (SVG)
- 📋 Riwayat sesi (localStorage)
- ✨ Pendeteksi kata penutup ("apakah ada pertanyaan lain?", dll)
- 📱 PWA installable (offline cache via service worker)

## ⚠️ Catatan Versi Web

Versi web adalah **static site** (HTML/CSS/JS murni, no backend). Untuk fitur AI:

| Fitur | Butuh | Status |
|-------|-------|--------|
| Chat AI (30 personas) | API key OpenRouter/Google | ✅ |
| Mic live transcription | Browser Web Speech API | ✅ (no API key) |
| Sistem penilaian | API key OpenRouter/Google | ✅ |
| Sistem koreksi | API key OpenRouter/Google | ✅ |
| Rekam audio → ASR (sampai 30 menit) | **API key Google AI Studio** (Gemini) | ✅ |
| Rekam video → VLM (sampai 30 menit) | **API key Google AI Studio** (Gemini) | ✅ |
| Notifikasi browser | User permission | ✅ |

### 🎤 Transkripsi Audio Sempurna (sampai 30 menit)

**Cara kerja:**
1. User rekam audio via MediaRecorder (192kbps, echo cancellation + noise suppression)
2. Audio di-decode ke AudioBuffer (Web Audio API)
3. Audio dipecah jadi segmen **4 menit** dengan **overlap 2 detik** (avoid word cutoff)
4. Setiap segmen di-encode ke WAV 16kHz mono, dikirim ke Gemini
5. Pakai model **gemini-2.0-flash** (paling akurat) dengan fallback ke 1.5-flash
6. Prompt: "transkripsi SEMPURNA dengan tanda baca"
7. Hasil semua segmen digabungkan → masuk ke input text
8. Auto-stop di 30 menit (warning di menit 25)

**Untuk audio 30 menit**: ~8 segmen × 30 detik/segmen = ~4 menit proses total

### 📹 Transkripsi Video Sempurna (sampai 30 menit)

**Cara kerja:**
1. User rekam video via MediaRecorder (720p, 2.5Mbps video + 128kbps audio)
2. Browser ekstrak frame visual **adaptif**:
   - Video < 2 menit: 4 frames
   - Video 2-5 menit: 1 frame per 30 detik
   - Video 5-15 menit: 1 frame per 60 detik
   - Video 15-30 menit: 1 frame per 90 detik
   - Max 30 frames (limit Gemini)
3. Setiap frame di-resize ke 640px + tambah timestamp overlay
4. Kirim semua frame ke Gemini VLM → deskripsi visual detail (400 kata)
5. Audio dari video di-extract, di-chunk 4 menit, ASR per segmen
6. Gabungkan: `[Yang dikatakan user]: ... + [Yang diperlihatkan di video]: ...`

**Untuk video 30 menit**: ~20 frame + ~8 segmen audio = ~5 menit proses total

### 🔧 Pilihan Model Gemini

Di Settings, user bisa pilih model:
- **gemini-2.0-flash** (default, paling akurat untuk free tier)
- **gemini-2.5-flash** (terbaru)
- **gemini-1.5-flash** (cepat, basic)
- **gemini-1.5-pro** (paling akurat, lebih lambat)

**Rekomendasi untuk transkripsi 30 menit**: gunakan `gemini-2.0-flash` atau `gemini-1.5-pro`

**Untuk rekam audio/video**: wajib pakai provider Google AI Studio (Gemini Flash support multimodal — audio + image). Dapatkan API key gratis di https://aistudio.google.com/apikey.

**Notifikasi browser**: Aktifkan di ⚙️ Settings → "🔔 Aktifkan Notifikasi". Muncul saat:
- Skor turun ≥5% dari evaluasi sebelumnya
- Target skor tercapai

## 🔧 Custom Domain (Opsional)

Kalau mau pakai domain sendiri (mis. `feynman.yourdomain.com`):
1. Di repository → Settings → Pages → Custom domain
2. Masukkan domain-mu → Save
3. Tambah CNAME record di DNS domain-mu:
   ```
   feynman  CNAME  USERNAME.github.io.
   ```
4. Tunggu DNS propagate (5-30 menit)
5. Centang "Enforce HTTPS"

## 🐛 Troubleshooting

### "Site not found" di GitHub Pages
- Pastikan repository Public (bukan Private)
- Pastikan Pages aktif di Settings → Pages → Source: main / root
- Tunggu 1-2 menit setelah enable

### "404 on index.html"
- Pastikan file `index.html` ada di root repository (bukan di subfolder)
- Cek case-sensitive: `index.html` bukan `Index.html`

### Hydration error di console
- Aman diabaikan — disebabkan browser extension (BIS/translate) yang inject attributes
- Tidak mempengaruhi functionality

### Mic tidak berfungsi
- Pakai Chrome/Edge Android (bukan Firefox)
- Settings → Apps → Chrome → Permissions → Microphone → Allow
- Pastikan HTTPS (GitHub Pages sudah HTTPS otomatis)

### AI tidak merespons
- Pollinations.ai kadang overload → tunggu 30 detik lalu coba lagi
- Cek koneksi internet
- Smart router otomatis fallback ke persona lain

### Penilaian gagal (JSON error)
- AI kadang lambat → tunggu 30-60 detik
- Coba lagi dengan penjelasan lebih singkat (di bawah 500 kata)
- Refresh halaman lalu coba lagi

## 📦 Update Aplikasi

Untuk update app ke versi baru:
1. Edit file di repository GitHub (atau push via Git)
2. GitHub Pages auto-rebuild dalam 1-2 menit
3. User perlu refresh browser (atau uninstall + reinstall PWA untuk clear cache)

## 📜 License

MIT — bebas pakai, modifikasi, distribusi.

---

Dibuat untuk para pembelajar • Teknik Feynman + Smart Router AI Gratis
