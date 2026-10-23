from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator


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


class CutMode(str, Enum):
    AUTO = "auto"
    CUSTOM = "custom"


class ClipRange(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)


class ProcessRequest(BaseModel):
    job_id: str
    # Seconds per auto-cut part (5s–15 min). Custom cut mode ignores this.
    segment_length: int = Field(default=60, ge=5, le=900)
    layout: LayoutMode = LayoutMode.SINGLE
    captions_enabled: bool = True
    caption_style: CaptionStyle = CaptionStyle.TIKTOK
    max_shorts: Optional[int] = Field(default=None, ge=1, le=100)
    cut_mode: CutMode = CutMode.AUTO
    clips: Optional[list[ClipRange]] = None
    trim_start: Optional[float] = Field(default=None, ge=0)
    trim_end: Optional[float] = Field(default=None, ge=0)
    music_enabled: bool = False
    mute_original: bool = False
    original_volume: float = Field(default=1.0, ge=0, le=2)
    music_volume: float = Field(default=0.35, ge=0, le=2)
    batch_name: Optional[str] = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def validate_edit_options(self) -> "ProcessRequest":
        if self.cut_mode == CutMode.CUSTOM:
            if not self.clips:
                raise ValueError("Custom cut mode requires at least one clip")
            for clip in self.clips:
                if clip.end <= clip.start:
                    raise ValueError("Each clip end must be after its start")
        if (
            self.trim_start is not None
            and self.trim_end is not None
            and self.trim_end <= self.trim_start
        ):
            raise ValueError("Trim end must be after trim start")
        return self


class ShortInfo(BaseModel):
    filename: str
    index: int
    start_time: float
    end_time: float
    duration: float
    title: Optional[str] = None


class CreateJobRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: float
    message: str
    total_shorts: int = 0
    completed_shorts: int = 0
    shorts: list[ShortInfo] = []
    error: Optional[str] = None
    batch_name: Optional[str] = None
    batch_slug: Optional[str] = None
