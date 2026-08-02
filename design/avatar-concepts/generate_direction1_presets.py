from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "design" / "avatar-concepts" / "velora-avatar-board-direction-1.png"
OUTPUT_DIRS = [
    ROOT / "frontend" / "src" / "assets" / "avatar-presets",
    ROOT / "frontend" / "public" / "avatar-presets",
]

# These centers align to the portrait medallions in the source board.
COL_CENTERS = [154, 334, 514, 694, 860, 1040, 1220, 1398]
ROW_CENTERS = [230, 478, 724]
CROP_SIZE = 148
HALF = CROP_SIZE // 2

AVATAR_MAP = {
    "affectionate_woman": (0, 0),
    "affectionate_man": (0, 1),
    "mysterious_woman": (0, 2),
    "mysterious_man": (0, 3),
    "flirty_woman": (0, 4),
    "flirty_man": (0, 5),
    "protective_woman": (0, 6),
    "dominant_man": (0, 7),
    "soft_woman": (1, 0),
    "soft_man": (1, 1),
    "intellectual_woman": (1, 2),
    "intellectual_man": (1, 3),
    "chaotic_woman": (1, 4),
    "chaotic_man": (1, 5),
    "dominant_woman": (1, 6),
    "protective_man": (1, 7),
    "distant_woman": (2, 0),
    "distant_man": (2, 1),
    "fantasy_woman": (2, 4),
    "fantasy_man": (2, 5),
}

def export_avatar(source: Image.Image, row: int, col: int, target: Path) -> None:
    cx = COL_CENTERS[col]
    cy = ROW_CENTERS[row]
    crop = source.crop((cx - HALF, cy - HALF, cx + HALF, cy + HALF))
    crop = crop.resize((256, 256), Image.Resampling.LANCZOS)
    crop.save(target, format="PNG")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    for directory in OUTPUT_DIRS:
        directory.mkdir(parents=True, exist_ok=True)
        for name, (row, col) in AVATAR_MAP.items():
            export_avatar(source, row, col, directory / f"{name}.png")


if __name__ == "__main__":
    main()
