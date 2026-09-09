//! Script writing via locally installed `claude` (Claude Code) or `codex` CLIs.
//! GUI apps don't inherit the shell PATH, so binaries are located explicitly.

use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

fn bin_dirs() -> Vec<PathBuf> {
    let home = std::env::var("HOME").map(PathBuf::from).unwrap_or_default();
    let mut dirs = vec![
        home.join(".local/bin"),
        home.join(".claude/local"),
        home.join(".npm-global/bin"),
        home.join(".volta/bin"),
        home.join(".bun/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ];
    if let Ok(rd) = std::fs::read_dir(home.join(".nvm/versions/node")) {
        for e in rd.flatten() {
            dirs.push(e.path().join("bin"));
        }
    }
    if let Ok(path) = std::env::var("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    dirs
}

fn find(bin: &str) -> Option<PathBuf> {
    bin_dirs().into_iter().map(|d| d.join(bin)).find(|p| p.is_file())
}

fn path_env() -> String {
    std::env::join_paths(bin_dirs()).map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()
}

#[tauri::command]
pub fn ai_providers() -> Vec<String> {
    ["claude", "codex"].into_iter().filter(|b| find(b).is_some()).map(String::from).collect()
}

/// One-shot prompt → reply text. The whole conversation is sent as the prompt (stateless).
#[tauri::command]
pub async fn ai_chat(app: AppHandle, provider: String, prompt: String, cwd: String) -> Result<String, String> {
    let bin = find(&provider).ok_or_else(|| format!("{provider} is not installed"))?;
    let last = std::env::temp_dir().join(format!("dragon-ai-{}.md", std::process::id()));
    let args: Vec<String> = match provider.as_str() {
        "claude" => vec!["-p".into(), prompt, "--output-format".into(), "json".into()],
        "codex" => vec![
            "exec".into(),
            "--skip-git-repo-check".into(),
            "-o".into(),
            last.to_string_lossy().into_owned(),
            prompt,
        ],
        _ => return Err("unknown provider".into()),
    };
    let out = app
        .shell()
        .command(bin)
        .args(args)
        .env("PATH", path_env())
        .current_dir(cwd)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("{provider} failed: {}", if err.trim().is_empty() { stdout } else { err.to_string() }));
    }
    if provider == "codex" {
        if let Ok(s) = std::fs::read_to_string(&last) {
            let _ = std::fs::remove_file(&last);
            return Ok(s.trim().to_string());
        }
        return Ok(stdout.trim().to_string());
    }
    let v: serde_json::Value = serde_json::from_str(&stdout).unwrap_or_default();
    Ok(v["result"].as_str().map(|s| s.trim().to_string()).unwrap_or(stdout))
}

/// Generates an image with Codex's image tool and copies it to `out_path`.
/// Codex writes generated images under ~/.codex/generated_images; we pick the newest one
/// created after the call started rather than fighting its read-only sandbox.
#[tauri::command]
pub async fn ai_image(app: AppHandle, prompt: String, out_path: String) -> Result<(), String> {
    let bin = find("codex").ok_or("Codex CLI is not installed")?;
    let started = std::time::SystemTime::now();
    let full = format!(
        "Use your image generation tool to generate exactly one image: {prompt}\n\
         Do not run shell commands, do not save, copy or resize files. When the image is generated, reply with the single word: done"
    );
    let out = app
        .shell()
        .command(bin)
        .args(["exec", "--skip-git-repo-check", &full])
        .env("PATH", path_env())
        .current_dir(std::env::temp_dir())
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let home = std::env::var("HOME").map(PathBuf::from).unwrap_or_default();
    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    if let Ok(sessions) = std::fs::read_dir(home.join(".codex/generated_images")) {
        for s in sessions.flatten() {
            let Ok(files) = std::fs::read_dir(s.path()) else { continue };
            for f in files.flatten() {
                let p = f.path();
                if p.extension().and_then(|e| e.to_str()) != Some("png") {
                    continue;
                }
                let Ok(m) = f.metadata().and_then(|m| m.modified()) else { continue };
                if m >= started && newest.as_ref().is_none_or(|(t, _)| m > *t) {
                    newest = Some((m, p));
                }
            }
        }
    }
    match newest {
        Some((_, p)) => {
            std::fs::copy(&p, &out_path).map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err(format!(
            "Codex didn't produce an image. {}",
            String::from_utf8_lossy(if out.stdout.is_empty() { &out.stderr } else { &out.stdout }).trim()
        )),
    }
}
