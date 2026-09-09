use serde::{Deserialize, Serialize};
use serde_json::json;
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

#[derive(Deserialize)]
pub struct GenerateReq {
    pub voice_id: String,
    pub text: String,
    pub model_id: String,
    pub stability: f32,
    pub similarity_boost: f32,
    pub style: f32,
    pub use_speaker_boost: bool,
    pub out_path: String,
}

/// Generates speech to `out_path` (mp3) and returns its duration in seconds.
#[tauri::command]
pub async fn eleven_generate(app: AppHandle, req: GenerateReq) -> Result<f64, String> {
    let key = crate::keys::get_api_key()?;
    let body = json!({
        "text": req.text,
        "model_id": req.model_id,
        "voice_settings": {
            "stability": req.stability,
            "similarity_boost": req.similarity_boost,
            "style": req.style,
            "use_speaker_boost": req.use_speaker_boost,
        }
    });
    let res = reqwest::Client::new()
        .post(format!(
            "{API}/text-to-speech/{}?output_format=mp3_44100_128",
            req.voice_id.trim()
        ))
        .header("xi-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let bytes = check(res).await?.bytes().await.map_err(|e| e.to_string())?;
    if let Some(parent) = std::path::Path::new(&req.out_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&req.out_path, &bytes).map_err(|e| e.to_string())?;
    Ok(crate::media::probe_inner(&app, &req.out_path).await?.duration)
}
