// Prompt Templates — System prompts for LLM command generation.
//
// These prompts are carefully tuned to make small models (1-3B parameters)
// generate accurate, OS-aware, toolchain-verified shell commands.

/// Detect common developer and system tools available in PATH and standard platform directories.
pub fn detect_installed_tools() -> Vec<String> {
    let common_tools = [
        "brew", "git", "node", "npm", "pnpm", "yarn", "bun",
        "python3", "python", "pip3", "pip", "docker", "cargo",
        "rustc", "go", "kubectl", "curl", "rsync", "tmux", "ffmpeg",
        "htop", "wget", "tar", "ssh", "scp", "zsh", "bash"
    ];
    let path_var = std::env::var("PATH").unwrap_or_default();
    let mut search_dirs: Vec<std::path::PathBuf> = std::env::split_paths(&path_var).collect();

    // Ensure standard macOS Homebrew and user tool paths are checked even in GUI mode
    search_dirs.push(std::path::PathBuf::from("/opt/homebrew/bin"));
    search_dirs.push(std::path::PathBuf::from("/usr/local/bin"));
    search_dirs.push(std::path::PathBuf::from("/usr/bin"));
    search_dirs.push(std::path::PathBuf::from("/bin"));
    if let Ok(home) = std::env::var("HOME") {
        search_dirs.push(std::path::PathBuf::from(&home).join(".cargo/bin"));
        search_dirs.push(std::path::PathBuf::from(&home).join(".bun/bin"));
        search_dirs.push(std::path::PathBuf::from(&home).join(".nvm/current/bin"));
    }

    let mut detected = Vec::new();
    for tool in common_tools {
        let found = search_dirs.iter().any(|dir| {
            let p = dir.join(tool);
            p.is_file()
        });
        if found {
            detected.push(tool.to_string());
        }
    }
    detected
}

/// Returns a rich, OS-specific and toolchain-aware context string.
pub fn get_system_context(target_env: Option<&str>, tools: Option<&[String]>) -> String {
    let env_target = target_env.unwrap_or("local").to_lowercase();

    // When the user is connected to a remote SSH server (typically Linux)
    if env_target.starts_with("ssh") || env_target == "remote" || env_target == "linux" {
        return r#"TARGET ENVIRONMENT: Remote SSH Linux/POSIX Server.
CRITICAL RULES FOR SSH REMOTE LINUX:
- The target machine is a remote Linux server.
- DO NOT use macOS-specific commands (NO `brew`, NO `open`, NO `pbcopy`, NO `defaults`, NO `caffeinate`).
- Use standard Linux/POSIX utilities: `systemctl`, `journalctl`, `apt`/`dnf`/`pacman` (if package management requested), `ip a`, `ss -tulpn`, `cat`, `grep`, `tar`.
- Output ONLY the single-line executable shell command without markdown or explanations."#.to_string();
    }

    // Local environment (macOS / Windows / Linux desktop)
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "zsh".to_string());
    let shell_name = std::path::Path::new(&shell)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("zsh");

    let detected_tools = match tools {
        Some(t) => t.to_vec(),
        None => detect_installed_tools(),
    };
    let tools_list = if detected_tools.is_empty() {
        "standard POSIX coreutils (curl, tar, find, grep, ps, lsof, awk)".to_string()
    } else {
        detected_tools.join(", ")
    };

    match os {
        "macos" => format!(
r#"TARGET ENVIRONMENT: Native macOS ({arch}) | Active Shell: {shell_name}
VERIFIED TOOLS INSTALLED IN $PATH: {tools_list}

CRITICAL RULES FOR MACOS:
1. PACKAGE MANAGEMENT: Use `brew install` for software installation (Homebrew). NEVER use `apt`, `apt-get`, `yum`, `dnf`, or `pacman`.
2. CLIPBOARD: Use `pbcopy` to copy and `pbpaste` to paste. NEVER use `xclip` or `xsel`.
3. OPENING FILES & URLS: Use `open <path_or_url>` (e.g. `open .`, `open https://...`). NEVER use `xdg-open` or `start`.
4. LISTENING PORTS & NETWORKING: Use `lsof -iTCP -sTCP:LISTEN -P -n` or `lsof -i :<port>` to check ports. NEVER use `ss` or `netstat -tlpn` (they fail or have incompatible flags on macOS).
5. IN-PLACE STREAM EDITING: Use BSD sed syntax: `sed -i '' 's/old/new/g' file` (macOS sed requires empty string '' after -i). NEVER use GNU `sed -i 's/.../'`.
6. PROCESSES & POWER: Use `pkill`, `killall`, `caffeinate` (to prevent sleep). NEVER use `systemctl` or Linux `service`.
7. ONLY suggest commands using tools verified above or standard macOS built-in utilities (curl, tar, find, grep, awk, ps, lsof)."#),

        "windows" => format!(
r#"TARGET ENVIRONMENT: Windows ({arch}) | Shell: {shell_name}
VERIFIED TOOLS: {tools_list}
Use Windows/PowerShell syntax: clip, start, winget, Get-Process, tasklist."#),

        _ => format!(
r#"TARGET ENVIRONMENT: Linux ({arch}) | Shell: {shell_name}
VERIFIED TOOLS: {tools_list}
Use POSIX/Linux commands: xclip, xdg-open, systemctl, journalctl."#),
    }
}

/// Backward compatible get_os_context
pub fn get_os_context() -> String {
    get_system_context(None, None)
}

/// System prompt for command generation. Injected into every LLM inference call.
pub const COMMAND_GENERATION_SYSTEM_PROMPT: &str = r#"You are an expert terminal/shell command generator embedded in a terminal application called MyTerminal.

RULES — follow these exactly:
1. Output ONLY the command. No explanations, no markdown, no code blocks, no backticks.
2. Use POSIX-compliant syntax when possible.
3. For destructive operations, prefer safer alternatives (e.g., `rm -i` over `rm -rf`).
4. If the task requires multiple commands, chain them with `&&`.
5. If the task is ambiguous, generate the most common interpretation.
6. Never output anything other than the command itself.

OS & ENVIRONMENT CONTEXT:
{os_context}

EXAMPLES:
User: "show disk usage sorted by size"
Output: du -sh * 2>/dev/null | sort -hr | head -n 20

User: "find all python files modified in the last 24 hours"
Output: find . -name "*.py" -mtime -1

User: "compress the logs folder"
Output: tar -czvf logs.tar.gz logs/

User: "show my git branches sorted by last commit"
Output: git branch --sort=-committerdate --format='%(committerdate:short) %(refname:short)'
"#;

/// Build the complete system prompt with OS and environment context injected.
pub fn build_system_prompt() -> String {
    COMMAND_GENERATION_SYSTEM_PROMPT.replace("{os_context}", &get_system_context(None, None))
}

/// System prompt specifically tuned for real-time shell autocompletion.
pub const COMMAND_SUGGESTION_SYSTEM_PROMPT: &str = r#"You are an ultra-fast shell command autocompletion engine in MyTerminal.
Given the partial command line typed by the user, complete or suggest the full command.

CRITICAL RULES:
1. Output ONLY the completed command string on a single line.
2. Absolutely NO conversational prose, NO thinking, NO explanations, NO markdown backticks, NO English sentences.
3. Output MUST begin with what the user typed: "{user_input}".
4. If the user input is already a command (e.g. "mkdir", "git", "ls"), output a common, safe completion (e.g. "mkdir -p [dir]", "git status", "ls -la").
5. NEVER start with "Okay", "Here", "Sure", "To", "I need", or English chatter.
6. OS & ENVIRONMENT CONTEXT:
{os_context}

EXAMPLES:
User: git
Output: git status

User: docker
Output: docker ps -a

User: mkdir
Output: mkdir -p 

User: find
Output: find . -name 

User: curl
Output: curl -sSL 
"#;

/// Build the suggestion prompt for real-time keystroke completion.
pub fn build_suggestion_prompt(user_input: &str, target_env: Option<&str>, tools: Option<&[String]>) -> String {
    COMMAND_SUGGESTION_SYSTEM_PROMPT
        .replace("{user_input}", user_input)
        .replace("{os_context}", &get_system_context(target_env, tools))
}

pub fn build_suggestion_prompt_default(user_input: &str) -> String {
    build_suggestion_prompt(user_input, None, None)
}

/// System prompt for Reasoning command generation: strictly returns the executable shell command only.
/// Absolutely NO explanations, comments, or conversational text.
pub const REASONING_GENERATION_SYSTEM_PROMPT: &str = r#"You are an expert shell command generator embedded in MyTerminal.
{os_context}

The user provides a task, question, or goal. Your job is to output ONLY the exact, executable shell command needed to achieve the task on the target system.

RULES:
1. Output ONLY the raw executable shell command line.
2. Absolutely NO explanations, NO descriptions, NO reasoning steps, NO comments (no '#').
3. Do NOT use markdown code fences (no ``` or ```bash).
4. Do NOT include conversational filler (no "Here is", "Sure", "You can use", "To do this").
5. If multiple commands are required, chain them on a single line using && or ; (e.g. "mkdir -p build && cd build").
6. Never output tool call XML tags (<call:exec>, <tool_call>) or JSON blocks. Output clean shell syntax only.

Task: find all pdf files modified in last 7 days
find . -type f -name "*.pdf" -mtime -7

Task: kill process using port 3000
lsof -ti:3000 | xargs kill -9

Task: extract a tar.gz archive to /opt
tar -xzf archive.tar.gz -C /opt
"#;

/// Build the reasoning system prompt with OS and environment context injected.
pub fn build_reasoning_prompt(target_env: Option<&str>, tools: Option<&[String]>) -> String {
    REASONING_GENERATION_SYSTEM_PROMPT.replace("{os_context}", &get_system_context(target_env, tools))
}

pub fn build_reasoning_prompt_default() -> String {
    build_reasoning_prompt(None, None)
}
