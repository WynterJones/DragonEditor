use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::AppHandle;

const API: &str = "https://api.elevenlabs.io/v1";

#[derive(Serialize, Deserialize)]
pub struct Voice {
    pub voice_id: String,
    pub name: String,
    pub category: Option<String>,
    pub preview_url: Option<String>,
    #[serde(default)]
    pub labels: HashMap<String, String>,
}

async fn check(res: reqwest::Response) -> Result<reqwest::Response, String> {
    if res.status().is_success() {
        return Ok(res);
    }
    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    Err(format!("ElevenLabs {status}: {body}"))
}

#[tauri::command]
pub async fn eleven_voices() -> Result<Vec<Voice>, String> {
    #[derive(Deserialize)]
    struct R {
        voices: Vec<Voice>,
    }
    let key = crate::keys::get_api_key()?;
    let res = reqwest::Client::new()
        .get(format!("{API}/voices"))
        .header("xi-api-key", key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(check(res).await?.json::<R>().await.map_err(|e| e.to_string())?.voices)
}

/// POSTs `body` to an ElevenLabs audio endpoint (`text-to-speech/<voice>`, `music`,
/// `sound-generation`), writes the mp3 to `out_path` and returns its duration in seconds.
#[tauri::command]
pub async fn eleven_audio(app: AppHandle, path: String, body: Value, out_path: String) -> Result<f64, String> {
    let key = crate::keys::get_api_key()?;
    let res = reqwest::Client::new()
        .post(format!("{API}/{path}?output_format=mp3_44100_128"))
        .header("xi-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let bytes = check(res).await?.bytes().await.map_err(|e| e.to_string())?;
    if let Some(parent) = std::path::Path::new(&out_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&out_path, &bytes).map_err(|e| e.to_string())?;
    Ok(crate::media::probe_inner(&app, &out_path).await?.duration)
}
