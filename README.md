# ⚡ MyTerminal (Pookie) — Cross-Platform App

> This directory contains the primary cross-platform application codebase (Tauri v2 + React 19 + Rust).

For full architecture documentation, supported on-device models, keyboard shortcuts, and feature breakdowns, please refer to the root [README.md](../README.md).

---

## 🚀 Quick Run Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Development Server
```bash
npm run tauri dev
```

### 3. Build Production Bundle
```bash
npm run tauri build
```

---

## 🛠️ Tech Stack
- **Frontend Core**: React 19, TypeScript 6, Vite 8, Lucide React
- **Terminal Display**: `@xterm/xterm` with `@xterm/addon-fit`
- **Application Engine**: Tauri v2, `portable-pty`, `llama-cpp-2`
- **Networking**: Async Tokio SSH & custom SFTP protocol client
# pookie
# pookie
