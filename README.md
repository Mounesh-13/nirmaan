# Nirmaan ⚡ (Lab Sync Engine)

> **Zero-persistence, ephemeral real-time code and communication hub for computer labs, workshops, and competitive programming.**

Nirmaan allows up to 50+ concurrent workstations to join isolated rooms via a room code to exchange syntax-highlighted code blocks and text messages instantaneously with strictly **zero persistence** (no database rows, no disk writes, data lives in volatile browser memory only).

---

## 🚀 Key Features

* **Strictly Zero Data Persistence:** Messages and code never touch a database table or disk. Communications use ephemeral WebSocket Broadcasts and evaporate completely when browser tabs close.
* **100% Client-Side:** Self-contained single-file architecture (`index.html`). No build toolchain, zero backend servers, ready to host on GitHub Pages for free.
* **Workstation Presence Tracking:** Dynamic peer list showing active workstations (`PC-01`, `PC-12`, `Instructor`) via WebSocket presence.
* **Code Drops & Line-Numbered Syntax Highlighting:**
  - Auto-detection or explicit selection for Python, C++, C, Java, JavaScript, TypeScript, Rust, Go, SQL, HTML/CSS, and Bash.
  - Pixel-perfect line numbering styled in Tokyo Night Dark.
  - 1-Click "Copy Snippet" with visual feedback.
  - Direct "Save / Download" as native file extensions (`.py`, `.cpp`, `.rs`, `.sql`, etc.).
* **Tab Key & Indentation Support:** Built-in code editor supports `Tab` (2 spaces) and `Shift+Tab` (dedent) without losing focus.
* **Rapid Dispatch:** Send payloads with <kbd>Ctrl</kbd> + <kbd>Enter</kbd> or <kbd>Cmd</kbd> + <kbd>Enter</kbd>.
* **URL Hash Routing:** Direct deep-linking via hashes (e.g. `https://your-site.github.io/nirmaan/#lab-bench-1`). Workstations opening the URL join that room instantly.
* **Dual-Mode Network Resilience:** Runs on Supabase Realtime WebSockets for cross-device lab networks, and automatically supports in-browser Local Mesh Mode for instant testing across tabs.

---

## 🛠️ Quick Deployment Guide (GitHub Pages in 3 Minutes)

### Step 1: Get Free Supabase Realtime Credentials
1. Go to [database.new](https://database.new) and create a free project named `Nirmaan`.
2. In your Supabase dashboard, click the **Settings (gear icon) → API**.
3. Copy:
   - **Project URL** (e.g. `https://xyzcompany.supabase.co`)
   - **`anon` `public` Key** (e.g. `eyJhbGci...`)

### Step 2: Configure & Deploy to GitHub Pages
1. Open `index.html` and paste your credentials into the constants at the top of the `<script>` tag:
   ```javascript
   const SUPABASE_URL = "https://your-project-ref.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```
   *(Alternatively, you can leave them as placeholders and configure them interactively through the in-app Settings modal!)*

2. Push the files to your GitHub repository:
   ```bash
   git init
   git add index.html README.md
   git commit -m "Deploy Nirmaan Lab Sync Engine"
   git branch -M main
   git remote add origin https://github.com/<YOUR-USERNAME>/nirmaan.git
   git push -u origin main
   ```

3. In GitHub, go to **Settings → Pages**:
   - Under **Build and deployment → Branch**, choose `main` and `/ (root)`.
   - Click **Save**.
4. Your application will be live at `https://<YOUR-USERNAME>.github.io/nirmaan/` in seconds!

---

## 💻 Computer Lab Usage

1. **Instructor / Host:** Open `https://<YOUR-USERNAME>.github.io/nirmaan/#lab-01` on your screen or projector.
2. **Students / Workstations:** Open that exact link or click the **"Copy Room Link"** button in the header.
3. Every workstation syncs to the room instantly. Change your workstation ID (e.g., `PC-07` or `Student-A`) in the top bar.
4. Broadcast solutions, debug snippets, or hints with <kbd>Ctrl</kbd> + <kbd>Enter</kbd>.
5. Once the lab ends and tabs are closed, all messages and code vanish without a trace.
