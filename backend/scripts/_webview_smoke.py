import threading
import time

import webview

webview.create_window(
    "ShortForgeTest",
    "http://127.0.0.1:8891/",
    width=1200,
    height=800,
)


def check() -> None:
    time.sleep(4)
    print("WINDOW_OK", flush=True)


threading.Thread(target=check, daemon=True).start()
webview.start(gui="edgechromium")
print("CLOSED", flush=True)
