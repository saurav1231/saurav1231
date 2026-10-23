"""Package photos: check, rotate, resize to WEBP (large + thumbnail), save on disk."""
import io
import secrets
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from ..config import get_settings
from ..errors import bad_request

ALLOWED = {"image/jpeg", "image/png", "image/webp", "image/avif"}
MAX_BYTES = 15 * 1024 * 1024
MAX_FILES = 12


async def read_uploads(files: list[UploadFile]) -> list[bytes]:
    if not files:
        raise bad_request("Choose at least one photo")
    if len(files) > MAX_FILES:
        raise bad_request(f"Upload at most {MAX_FILES} photos at a time")
    out = []
    for f in files:
        if f.content_type not in ALLOWED:
            raise bad_request(f"{f.filename}: use JPG, PNG, WEBP or AVIF photos")
        data = await f.read()
        if len(data) > MAX_BYTES:
            raise bad_request("Each photo must be under 15 MB")
        out.append(data)
    return out


def _resized(img: Image.Image, width: int) -> bytes:
    copy = img.copy()
    if copy.width > width:
        copy = copy.resize((width, round(copy.height * width / copy.width)), Image.LANCZOS)
    buf = io.BytesIO()
    copy.save(buf, "WEBP", quality=80, method=4)
    return buf.getvalue()


def save_package_image(package_id: str, data: bytes) -> dict:
    """Saves <name>.webp (1600 px) and <name>-thumb.webp (640 px). Returns their public URLs."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise bad_request("One of the files is not a readable photo")
    img = ImageOps.exif_transpose(img)  # phone photos: respect camera orientation
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")

    folder = get_settings().upload_path / "packages" / package_id
    folder.mkdir(parents=True, exist_ok=True)
    name = secrets.token_hex(8)
    (folder / f"{name}.webp").write_bytes(_resized(img, 1600))
    (folder / f"{name}-thumb.webp").write_bytes(_resized(img, 640))
    base = f"/uploads/packages/{package_id}/{name}"
    return {"url": f"{base}.webp", "thumb_url": f"{base}-thumb.webp"}


def delete_image_files(*urls: str) -> None:
    root = get_settings().upload_path
    for u in urls:
        if u and u.startswith("/uploads/"):
            path: Path = (root / u.removeprefix("/uploads/")).resolve()
            if root.resolve() in path.parents:  # never delete outside the uploads folder
                path.unlink(missing_ok=True)
