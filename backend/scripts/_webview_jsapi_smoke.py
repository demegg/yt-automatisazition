import threading
import time

import webview


class Api:
    def ping(self):
        return {"ok": True}


api = Api()
window = webview.create_window(
    "ShortForgeJsApi",
    "http://127.0.0.1:8891/",
    js_api=api,
    width=1200,
    height=800,
)
api.window = window


def check() -> None:
    time.sleep(4)
    print("WINDOW_OK", flush=True)


threading.Thread(target=check, daemon=True).start()
webview.start(gui="edgechromium")
print("CLOSED", flush=True)
