from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class SegmentLength(int, Enum):
    THIRTY = 30
    SIXTY = 60
    TWO_MIN = 120


class LayoutMode(str, Enum):
    SINGLE = "single"
    STACK_VERTICAL = "stack_vertical"
    STACK_HORIZONTAL = "stack_horizontal"
    PICTURE_IN_PICTURE = "picture_in_picture"
    MAIN_WITH_REACTION = "main_with_reaction"


class CaptionStyle(str, Enum):
    BOLD_CENTER = "bold_center"
    KARAOKE = "karaoke"
    MINIMAL = "minimal"
    TIKTOK = "tiktok"


class ProcessRequest(BaseModel):
    job_id: str
    segment_length: SegmentLength = SegmentLength.SIXTY
    layout: LayoutMode = LayoutMode.SINGLE
    captions_enabled: bool = True
    caption_style: CaptionStyle = CaptionStyle.TIKTOK
    max_shorts: Optional[int] = Field(default=None, ge=1, le=100)


class ShortInfo(BaseModel):
    filename: str
    index: int
    start_time: float
    end_time: float
    duration: float


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: float
    message: str
    total_shorts: int = 0
    completed_shorts: int = 0
    shorts: list[ShortInfo] = []
    error: Optional[str] = None
