"""Launch ShortForge as a desktop window.

The API server always runs in a separate process so heavy native libs
(Whisper / PyAV / MKL) never share an address space with WebView2.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import traceback
import urllib.request
from pathlib import Path

PORT = int(os.getenv("SHORTFORGE_PORT", "8891"))
FALLBACK_PORT = int(os.getenv("SHORTFORGE_FALLBACK_PORT", "8765"))
HOST = "127.0.0.1"

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _BACKEND_DIR.parent
_DIST = _PROJECT_ROOT / "frontend" / "dist"
_LOG = _PROJECT_ROOT / "data" / "shortforge-desktop.log"
_WEBVIEW_DATA = _PROJECT_ROOT / "data" / "webview"
_SERVER_PID_FILE = _PROJECT_ROOT / "data" / "shortforge-server.pid"
_owned_server: subprocess.Popen | None = None


def _ensure_stdio() -> None:
    """pythonw has no console; patch before anything touches stdout."""
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")


def _log(message: str) -> None:
    _LOG.parent.mkdir(parents=True, exist_ok=True)
    line = time.strftime("%Y-%m-%d %H:%M:%S") + " " + message + "\n"
    with _LOG.open("a", encoding="utf-8") as f:
        f.write(line)


def _alert(message: str) -> None:
    _log(message)
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, message, "ShortForge", 0x10)
    except Exception:
        pass


def _python_exe() -> str:
    """Use console python.exe even when launched via pythonw."""
    current = Path(sys.executable)
    if current.name.lower() == "pythonw.exe":
        sibling = current.with_name("python.exe")
        if sibling.exists():
            return str(sibling)
    return sys.executable


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex((HOST, port)) == 0


def _is_shortforge(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://{HOST}:{port}/api/health", timeout=1.5) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            return resp.status == 200 and "ShortForge" in body
    except Exception:
        return False


def _ui_ready(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://{HOST}:{port}/", timeout=1.5) as resp:
            body = resp.read()
            return resp.status == 200 and (b'id="root"' in body or b"ShortForge" in body)
    except Exception:
        return False


def _wait_ready(port: int, timeout: float = 60.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _is_shortforge(port):
            return True
        if _owned_server is not None and _owned_server.poll() is not None:
            _log(f"Server process exited early with code {_owned_server.returncode}")
            return False
        time.sleep(0.25)
    return False


def _start_server_subprocess(port: int) -> bool:
    """Start uvicorn in a clean child process (never import app.main here)."""
    global _owned_server
    env = os.environ.copy()
    env.setdefault("FRONTEND_URL", f"http://{HOST}:{port}")
    env.setdefault("BACKEND_URL", f"http://{HOST}:{port}")
    env.setdefault("OMP_NUM_THREADS", "1")
    env.setdefault("MKL_NUM_THREADS", "1")
    env.setdefault("OPENBLAS_NUM_THREADS", "1")
    env.setdefault("NUMEXPR_NUM_THREADS", "1")

    creationflags = 0
    if sys.platform == "win32":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

    cmd = [
        _python_exe(),
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        HOST,
        "--port",
        str(port),
        "--log-level",
        "warning",
    ]
    _log(f"Starting server subprocess: {' '.join(cmd)}")
    try:
        _owned_server = subprocess.Popen(
            cmd,
            cwd=str(_BACKEND_DIR),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
        _SERVER_PID_FILE.parent.mkdir(parents=True, exist_ok=True)
        _SERVER_PID_FILE.write_text(str(_owned_server.pid), encoding="utf-8")
    except Exception:
        _log("Failed to spawn server:\n" + traceback.format_exc())
        return False

    if _wait_ready(port):
        _log(f"Server started on {port} (pid={_owned_server.pid})")
        return True

    _log(f"Server failed to become ready on {port}")
    return False


def _pick_port() -> int | None:
    for port in (PORT, FALLBACK_PORT):
        if _is_shortforge(port) and _ui_ready(port):
            _log(f"Reusing running server on {port}")
            return port

    for port in (PORT, FALLBACK_PORT):
        if _port_open(port) and not _is_shortforge(port):
            _log(f"Port {port} busy by another process — skipping")
            continue
        if _is_shortforge(port) and not _ui_ready(port):
            _log(f"Port {port} has API but no UI — skipping")
            continue
        if not _port_open(port):
            if _start_server_subprocess(port):
                return port
    return None


def _open_in_browser(url: str, keep_alive: bool = True) -> None:
    import webbrowser

    webbrowser.open(url)
    _log(f"Opened system browser at {url}")
    if not keep_alive:
        return
    try:
        port = int(url.rsplit(":", 1)[-1].rstrip("/"))
        while _is_shortforge(port):
            time.sleep(2)
    except Exception:
        time.sleep(60)


def _instance_lock_path() -> Path:
    return _PROJECT_ROOT / "data" / "shortforge-desktop.lock"


def _pid_running(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        import ctypes

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION, 0, pid
        )
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)
            return True
        return False
    except Exception:
        return False


def _acquire_instance_lock() -> bool:
    """Only one desktop GUI at a time — second launch opens a browser tab."""
    path = _instance_lock_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        if path.exists():
            try:
                old_pid = int(path.read_text(encoding="utf-8").strip() or "0")
            except ValueError:
                old_pid = 0
            if old_pid and _pid_running(old_pid):
                return False
        path.write_text(str(os.getpid()), encoding="utf-8")
        return True
    except Exception:
        _log("lock failed:\n" + traceback.format_exc())
        return True


def _release_instance_lock() -> None:
    path = _instance_lock_path()
    try:
        if path.exists() and path.read_text(encoding="utf-8").strip() == str(os.getpid()):
            path.unlink(missing_ok=True)
    except Exception:
        pass


def _start_webview(url: str) -> None:
    """Open Edge WebView2 without js_api — js_api deadlocks this pywebview/WebView2 build."""
    import webview

    try:
        webview.settings["ALLOW_DOWNLOADS"] = True
    except Exception:
        pass

    _WEBVIEW_DATA.mkdir(parents=True, exist_ok=True)
    _log(f"Creating webview window for {url}")
    webview.create_window(
        "ShortForge",
        url,
        width=1400,
        height=900,
        min_size=(900, 680),
        text_select=True,
    )
    _log("Starting webview GUI loop")
    # Custom UA lets the UI call /api/local/save instead of the broken js_api bridge.
    webview.start(
        gui="edgechromium",
        storage_path=str(_WEBVIEW_DATA),
        private_mode=False,
        user_agent="ShortForgeDesktop/1.0",
    )
    _log("Webview closed normally")


def _open_window(url: str) -> None:
    _ensure_stdio()
    if os.getenv("SHORTFORGE_BROWSER", "").strip().lower() in ("1", "true", "yes"):
        _log("SHORTFORGE_BROWSER set — using system browser")
        _open_in_browser(url)
        return

    if not _acquire_instance_lock():
        _log("Another ShortForge desktop instance is running — opening browser tab")
        _open_in_browser(url, keep_alive=False)
        return

    try:
        try:
            _start_webview(url)
            return
        except Exception:
            _log("pywebview failed:\n" + traceback.format_exc())
        _open_in_browser(url)
    finally:
        _release_instance_lock()


def main() -> None:
    try:
        _ensure_stdio()
        _log("=== ShortForge desktop launch ===")
        if not (_DIST / "index.html").exists():
            _alert(
                "ShortForge UI is not built yet.\n\n"
                "Open a terminal in the project folder and run:\n"
                "  cd frontend\n  npm install\n  npm run build"
            )
            return

        port = _pick_port()
        if port is None:
            _alert(
                "ShortForge could not start.\n\n"
                f"Tried ports {PORT} and {FALLBACK_PORT}.\n"
                "Close other ShortForge windows, then try again.\n\n"
                "Details: data/shortforge-desktop.log"
            )
            return

        if not _ui_ready(port):
            deadline = time.time() + 10
            while time.time() < deadline and not _ui_ready(port):
                time.sleep(0.25)
            if not _ui_ready(port):
                _alert(
                    "ShortForge API started but the UI is missing.\n\n"
                    "Run:\n  cd frontend\n  npm run build"
                )
                return

        _open_window(f"http://{HOST}:{port}/")
    except Exception:
        _alert("ShortForge failed to start. Check data/shortforge-desktop.log")
        _log(traceback.format_exc())


if __name__ == "__main__":
    main()
