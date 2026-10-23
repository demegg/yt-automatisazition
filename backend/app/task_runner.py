"""Run heavy work off the asyncio loop so multiple jobs can proceed together."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

logger = logging.getLogger(__name__)

# Cap parallel FFmpeg/Whisper work so the machine stays usable.
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="shortforge")


def run_in_background(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
    def _wrap() -> None:
        try:
            fn(*args, **kwargs)
        except Exception:
            logger.exception("Background task crashed: %s", getattr(fn, "__name__", fn))

    _executor.submit(_wrap)
