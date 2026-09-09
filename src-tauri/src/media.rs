use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

#[derive(Serialize, Clone, Debug)]
pub struct MediaInfo {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub has_video: bool,
    pub has_audio: bool,
}

async fn run(app: &AppHandle, bin: &str, args: &[&str]) -> Result<Vec<u8>, String> {
    let out = app
        .shell()
        .sidecar(bin)
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(out.stdout)
}

fn ratio(s: &str) -> f64 {
    let mut it = s.split('/');
    let n: f64 = it.next().and_then(|v| v.parse().ok()).unwrap_or(0.0);
    let d: f64 = it.next().and_then(|v| v.parse().ok()).unwrap_or(1.0);
    if d == 0.0 { 0.0 } else { n / d }
}

pub async fn probe_inner(app: &AppHandle, path: &str) -> Result<MediaInfo, String> {
    let out = run(
        app,
        "ffprobe",
        &["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
    )
    .await?;
    let v: serde_json::Value = serde_json::from_slice(&out).map_err(|e| e.to_string())?;
    let mut info = MediaInfo { duration: 0.0, width: 0, height: 0, fps: 0.0, has_video: false, has_audio: false };
    info.duration = v["format"]["duration"].as_str().and_then(|d| d.parse().ok()).unwrap_or(0.0);
    for s in v["streams"].as_array().cloned().unwrap_or_default() {
        match s["codec_type"].as_str() {
            Some("video") if !info.has_video => {
                info.has_video = true;
                info.width = s["width"].as_u64().unwrap_or(0) as u32;
                info.height = s["height"].as_u64().unwrap_or(0) as u32;
                info.fps = s["avg_frame_rate"].as_str().map(ratio).filter(|f| *f > 0.0)
                    .or_else(|| s["r_frame_rate"].as_str().map(ratio)).unwrap_or(0.0);
                // Still images report a bogus 25fps/1-frame "video" stream.
                if s["nb_frames"].as_str() == Some("1") || s["duration"].is_null() && v["format"]["duration"].is_null() {
                    info.fps = 0.0;
                    info.duration = 0.0;
                }
            }
            Some("audio") => info.has_audio = true,
            _ => {}
        }
    }
    Ok(info)
}

#[tauri::command]
pub async fn probe(app: AppHandle, path: String) -> Result<MediaInfo, String> {
    probe_inner(&app, &path).await
}

#[tauri::command]
pub async fn thumbnail(app: AppHandle, path: String, out: String, time: f64) -> Result<(), String> {
    let t = format!("{time:.3}");
    run(app_ref(&app), "ffmpeg", &["-v", "error", "-y", "-ss", &t, "-i", &path, "-frames:v", "1", "-vf", "scale=320:-2", &out]).await?;
    Ok(())
}

fn app_ref(app: &AppHandle) -> &AppHandle { app }

/// Downmixed 8kHz peaks, `count` buckets of max-abs amplitude in 0..1.
#[tauri::command]
pub async fn peaks(app: AppHandle, path: String, count: usize) -> Result<Vec<f32>, String> {
    let pcm = run(&app, "ffmpeg", &["-v", "error", "-i", &path, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"]).await?;
    let samples: Vec<i16> = pcm.chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect();
    if samples.is_empty() || count == 0 {
        return Ok(vec![]);
    }
    let per = (samples.len() as f64 / count as f64).max(1.0);
    Ok((0..count)
        .map(|i| {
            let a = (i as f64 * per) as usize;
            let b = (((i + 1) as f64 * per) as usize).min(samples.len());
            samples[a..b].iter().map(|s| (*s as i32).abs()).max().unwrap_or(0) as f32 / 32768.0
        })
        .collect())
}
