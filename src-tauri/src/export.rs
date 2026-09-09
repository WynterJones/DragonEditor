use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
pub struct Jobs(Mutex<Option<CommandChild>>);

#[derive(Serialize, Clone)]
struct Progress {
    frame: u64,
    fps: f64,
    out_time_us: u64,
    speed: String,
}

/// Runs ffmpeg with the given args (built by the frontend). Emits `export-progress`
/// while running; resolves when ffmpeg exits. Args must include `-progress pipe:1`.
#[tauri::command]
pub async fn export_start(app: AppHandle, jobs: State<'_, Jobs>, args: Vec<String>) -> Result<(), String> {
    let (mut rx, child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(&args)
        .spawn()
        .map_err(|e| e.to_string())?;
    *jobs.0.lock().unwrap() = Some(child);

    let mut kv: HashMap<String, String> = HashMap::new();
    let mut tail: VecDeque<String> = VecDeque::new();
    let mut result = Err("ffmpeg exited unexpectedly".to_string());
    while let Some(ev) = rx.recv().await {
        match ev {
            CommandEvent::Stdout(line) => {
                let line = String::from_utf8_lossy(&line);
                if let Some((k, v)) = line.trim().split_once('=') {
                    if k == "progress" {
                        let _ = app.emit(
                            "export-progress",
                            Progress {
                                frame: kv.get("frame").and_then(|v| v.parse().ok()).unwrap_or(0),
                                fps: kv.get("fps").and_then(|v| v.parse().ok()).unwrap_or(0.0),
                                out_time_us: kv.get("out_time_us").and_then(|v| v.parse().ok()).unwrap_or(0),
                                speed: kv.get("speed").cloned().unwrap_or_default(),
                            },
                        );
                    } else {
                        kv.insert(k.to_string(), v.to_string());
                    }
                }
            }
            CommandEvent::Stderr(line) => {
                tail.push_back(String::from_utf8_lossy(&line).trim_end().to_string());
                if tail.len() > 30 {
                    tail.pop_front();
                }
            }
            CommandEvent::Terminated(p) => {
                result = match p.code {
                    Some(0) => Ok(()),
                    Some(c) => Err(format!("ffmpeg exited with code {c}:\n{}", Vec::from(tail.clone()).join("\n"))),
                    None => Err("Export cancelled".to_string()),
                };
            }
            _ => {}
        }
    }
    *jobs.0.lock().unwrap() = None;
    result
}

#[tauri::command]
pub fn export_cancel(jobs: State<'_, Jobs>) -> Result<(), String> {
    if let Some(child) = jobs.0.lock().unwrap().take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}
