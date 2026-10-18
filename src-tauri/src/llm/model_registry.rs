// Model Registry — Available models with download URLs, sizes, and metadata.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub size_bytes: u64,
    pub download_url: String,
    pub sha256: String,
    pub ram_required_mb: u32,
    pub is_default: bool,
    pub tags: Vec<String>,
}

/// Returns the built-in model registry shipped with the app.
pub fn get_default_registry() -> Vec<ModelEntry> {
    vec![
        ModelEntry {
            id: "granite-3.3-2b".to_string(),
            name: "Granite 3.3 2B".to_string(),
            description: "High-efficiency enterprise model with deep code understanding, multi-step logic, and high fidelity shell script generation.".to_string(),
            filename: "granite-3.2-2b-instruct-Q4_K_M.gguf".to_string(),
            size_bytes: 1_545_296_256, // ~1.5 GB
            download_url: "https://huggingface.co/ibm-research/granite-3.2-2b-instruct-GGUF/resolve/main/granite-3.2-2b-instruct-Q4_K_M.gguf".to_string(),
            sha256: "".to_string(),
            ram_required_mb: 2048,
            is_default: false,
            tags: vec!["ibm".to_string(), "granite".to_string(), "2b".to_string(), "code".to_string(), "logic".to_string()],
        },
        ModelEntry {
            id: "qwen2.5-coder-1.5b".to_string(),
            name: "Qwen2.5-Coder 1.5B Instruct".to_string(),
            description: "Specialized coding and CLI reasoning model. Excellent code logic, Bash scripting, and terminal workflow generation.".to_string(),
            filename: "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf".to_string(),
            size_bytes: 1_073_741_824, // ~1 GB
            download_url: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf".to_string(),
            sha256: "".to_string(),
            ram_required_mb: 1536,
            is_default: false,
            tags: vec!["coder".to_string(), "1.5b".to_string(), "qwen".to_string(), "bash".to_string(), "developer".to_string()],
        },
        ModelEntry {
            id: "smollm2-360m".to_string(),
            name: "SmolLM2 360M".to_string(),
            description: "Ultra-compact 360M parameter model for real-time keystroke suggestions with minimal RAM footprint and near-zero latency.".to_string(),
            filename: "smollm2-360m-instruct-q4_k_m.gguf".to_string(),
            size_bytes: 256_901_120, // ~256 MB
            download_url: "https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf".to_string(),
            sha256: "".to_string(),
            ram_required_mb: 512,
            is_default: false,
            tags: vec!["360m".to_string(), "ultra-fast".to_string(), "huggingface".to_string(), "lightweight".to_string()],
        },
        ModelEntry {
            id: "smollm2-3b".to_string(),
            name: "SmolLM2 3B".to_string(),
            description: "Balanced high-capability terminal autocompletion model with extensive knowledge of Unix tools, Docker, and developer scripting.".to_string(),
            filename: "smollm2-3b-instruct-q4_k_m.gguf".to_string(),
            size_bytes: 1_887_436_800, // ~1.8 GB
            download_url: "https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf".to_string(),
            sha256: "".to_string(),
            ram_required_mb: 2560,
            is_default: false,
            tags: vec!["3b".to_string(), "huggingface".to_string(), "smart".to_string(), "terminal-tools".to_string()],
        },
        ModelEntry {
            id: "qwen3-1.7b".to_string(),
            name: "Qwen3 1.7B".to_string(),
            description: "Very lightweight (~1.4 GB) with excellent reasoning and coding speed.".to_string(),
            filename: "Qwen3-1.7B-Q4_K_M.gguf".to_string(),
            size_bytes: 1_282_439_264,
            download_url: "https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf".to_string(),
            sha256: "".to_string(),
            ram_required_mb: 2048,
            is_default: false,
            tags: vec!["qwen3".to_string(), "1.7b".to_string(), "very-lightweight".to_string(), "fast".to_string()],
        },
        ModelEntry {
            id: "qwen3-4b".to_string(),
            name: "Qwen3 4B".to_string(),
            description: "Best small model (~2.5 GB). Outstanding coding, reasoning, and shell command accuracy.".to_string(),
            filename: "Qwen3.5-4B-Q4_K_M.gguf".to_string(),
            size_bytes: 2_740_937_888,
            download_url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf".to_string(),
            sha256: "".to_string(),
            ram_required_mb: 3584,
            is_default: false,
            tags: vec!["qwen3".to_string(), "4b".to_string(), "best-small".to_string(), "reasoning".to_string()],
        },
        ModelEntry {
            id: "qwen3-8b".to_string(),
            name: "Qwen3 8B".to_string(),
            description: "Best overall balance (~5.2 GB). State-of-the-art multi-step reasoning, complex DevOps scripting, and full terminal assistance.".to_string(),
            filename: "Qwen3-8B-Q4_K_M.gguf".to_string(),
            size_bytes: 5_027_783_488,
            download_url: "https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf".to_string(),
            sha256: "".to_string(),
            ram_required_mb: 6144,
            is_default: false,
            tags: vec!["qwen3".to_string(), "8b".to_string(), "best-overall".to_string(), "high-performance".to_string()],
        },
        ModelEntry {
            id: "ternary-bonsai-1.7b".to_string(),
            name: "Ternary Bonsai 1.7B (Prism ML)".to_string(),
            description: "Ultra-fast ternary 1.58-bit model (~560 MB). Dual-mode reasoning and shell command generation with native <think> and <tool_call> tags. Recommended for Auto-Suggestion.".to_string(),
            filename: "Ternary-Bonsai-1.7B-Q2_0_g64.gguf".to_string(),
            size_bytes: 587_202_560,
            download_url: "https://huggingface.co/prism-ml/Ternary-Bonsai-1.7B-gguf/resolve/main/Ternary-Bonsai-1.7B-Q2_0_g64.gguf".to_string(),
            sha256: "".to_string(),
            ram_required_mb: 1536,
            is_default: true,
            tags: vec!["recommended".to_string(), "auto-suggestion".to_string(), "ternary".to_string(), "bonsai".to_string(), "1.7b".to_string(), "prism-ml".to_string()],
        },
        ModelEntry {
            id: "ternary-bonsai-27b".to_string(),
            name: "Ternary Bonsai 2-27B (Prism ML)".to_string(),
            description: "Large 27B parameter ternary model for deep multi-step system reasoning, architecture planning, and complex DevOps scripts. Recommended for Reasoning.".to_string(),
            filename: "Ternary-Bonsai-2-27B-Q2_0-prism-fork-required.gguf".to_string(),
            size_bytes: 7_626_008_928,
            download_url: "https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf-dev/resolve/main/Ternary-Bonsai-2-27B-Q2_0-prism-fork-required.gguf".to_string(),
            sha256: "".to_string(),
            ram_required_mb: 8192,
            is_default: false,
            tags: vec!["recommended".to_string(), "reasoning".to_string(), "ternary".to_string(), "bonsai".to_string(), "27b".to_string(), "prism-ml".to_string()],
        },
    ]
}
