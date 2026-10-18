# 📦 MyTerminal Application Builds

This directory contains the packaged, distributable installers and binaries for **MyTerminal (Pookie)** across all supported platforms.

```text
builds/
├── macos/
│   ├── MyTerminal.dmg              # macOS disk image installer
│   ├── MyTerminal.app.tar.gz       # Standalone macOS app bundle
│   └── SHA256SUMS.txt              # Verification checksums
├── windows/
│   ├── MyTerminal_x64_setup.exe    # Windows NSIS installer
│   ├── MyTerminal_x64.msi          # Windows MSI enterprise installer
│   └── SHA256SUMS.txt              # Verification checksums
└── linux/
    ├── myterminal_amd64.deb        # Debian / Ubuntu package
    ├── MyTerminal.AppImage         # Universal Linux portable binary
    └── SHA256SUMS.txt              # Verification checksums
```

---

## 🚀 How to Build

### Option 1: Local Platform Build (Current OS)

From the `cross-platform/` directory:

```bash
# Automatically builds, copies to builds/<platform>/, and generates SHA256
npm run build:package
```

---

### Option 2: Automated Multi-Platform Build (macOS + Windows + Linux)

Because Tauri apps link against native OS C/C++ libraries, native webviews (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux), and hardware-accelerated LLM runtime (`llama-cpp-2`), native cross-compiling on a single OS is not recommended.

Instead, the included GitHub Actions workflow builds all 3 operating systems simultaneously on native runners:

1. Push code or create a tag:
   ```bash
   git push origin main
   ```
2. Or trigger manually from GitHub:
   - Navigate to **GitHub → Actions → "Build All Platforms (macOS, Windows, Linux)"**
   - Click **Run workflow**
3. Once completed, download all compiled installers from the GitHub Actions Artifacts section.
