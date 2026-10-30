"""Build ShortForge and pin a desktop / Start Menu shortcut."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND = PROJECT_ROOT / "backend"
FRONTEND = PROJECT_ROOT / "frontend"
VENV_PYTHON = BACKEND / "venv" / "Scripts" / "python.exe"
VENV_PYTHONW = BACKEND / "venv" / "Scripts" / "pythonw.exe"
ICON = PROJECT_ROOT / "desktop" / "shortforge.ico"
LOGO = FRONTEND / "public" / "logo.png"


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=cwd or PROJECT_ROOT, check=True)


def ensure_icon() -> None:
    from PIL import Image

    ICON.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(LOGO).convert("RGBA")
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(ICON, sizes=sizes)
    print(f"Wrote {ICON}")


def create_shortcut(path: Path) -> None:
    pythonw = str(VENV_PYTHONW if VENV_PYTHONW.exists() else VENV_PYTHON)
    target = str(pythonw)
    arguments = "-m app.desktop"
    workdir = str(BACKEND)
    icon = str(ICON)
    lnk = str(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    ps = f"""
$s = (New-Object -ComObject WScript.Shell).CreateShortcut({json.dumps(lnk)})
$s.TargetPath = {json.dumps(target)}
$s.Arguments = {json.dumps(arguments)}
$s.WorkingDirectory = {json.dumps(workdir)}
$s.IconLocation = {json.dumps(icon)}
$s.WindowStyle = 1
$s.Description = "Turn long videos into Shorts"
$s.Save()
"""
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        check=True,
    )
    print(f"Created {path}")


def main() -> None:
    if not VENV_PYTHON.exists():
        raise SystemExit(f"Missing venv: {VENV_PYTHON}")

    run([str(VENV_PYTHON), "-m", "pip", "install", "pywebview", "pillow"])
    ensure_icon()

    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    run([npm, "run", "build"], cwd=FRONTEND)

    desktop = Path.home() / "Desktop"
    if not desktop.exists():
        desktop = Path.home() / "OneDrive" / "Desktop"
    create_shortcut(desktop / "ShortForge.lnk")

    start_menu = (
        Path.home()
        / "AppData"
        / "Roaming"
        / "Microsoft"
        / "Windows"
        / "Start Menu"
        / "Programs"
    )
    create_shortcut(start_menu / "ShortForge.lnk")
    print("\nShortForge is on your Desktop. Double-click the satellite icon to open it.")


if __name__ == "__main__":
    main()
