use std::process::Command;
use std::thread;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Auto-start happy daemon in background thread.
            // Fire-and-forget: if it fails, app still works as web viewer.
            thread::spawn(|| {
                start_happy_daemon();
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Start happy daemon via login shell to get user's full PATH.
/// Idempotent: if daemon already running, exits cleanly.
fn start_happy_daemon() {
    let result = Command::new("/bin/zsh")
        .args(["-l", "-c", "happy daemon start"])
        .output();

    match result {
        Ok(output) => {
            if output.status.success() {
                log::info!(
                    "happy daemon started: {}",
                    String::from_utf8_lossy(&output.stdout).trim()
                );
            } else {
                log::warn!(
                    "happy daemon start failed ({}): {}{}",
                    output.status,
                    String::from_utf8_lossy(&output.stdout).trim(),
                    String::from_utf8_lossy(&output.stderr).trim()
                );
            }
        }
        Err(e) => {
            log::warn!("Failed to run happy daemon start: {}", e);
        }
    }
}
