//! ElevenLabs API key lives in the macOS keychain, never in a project file.

const SERVICE: &str = "com.monetizedesign.dragoneditor";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, "elevenlabs").map_err(|e| e.to_string())
}

pub fn get_api_key() -> Result<String, String> {
    entry()?
        .get_password()
        .ok()
        .filter(|k| !k.is_empty())
        .ok_or_else(|| "No ElevenLabs API key set. Add one in Settings.".to_string())
}

#[tauri::command]
pub fn set_api_key(key: String) -> Result<(), String> {
    entry()?.set_password(key.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn has_api_key() -> bool {
    get_api_key().is_ok()
}

#[tauri::command]
pub fn clear_api_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
