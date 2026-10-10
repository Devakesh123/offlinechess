from pathlib import Path
import base64
import hashlib
import io
import json
import struct
import tarfile
import urllib.request
import zlib

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / "vendor"
VENDOR.mkdir(exist_ok=True)

def download(url):
    print("Downloading:", url)
    request = urllib.request.Request(
        url, headers={"User-Agent": "Knightlab-Setup/1.0"}
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()

metadata = json.loads(download("https://registry.npmjs.org/chess.js/1.4.0"))
archive = download(metadata["dist"]["tarball"])
integrity = metadata["dist"]["integrity"]
algorithm, expected = integrity.split("-", 1)

if algorithm != "sha512":
    raise RuntimeError("Unexpected package integrity algorithm")

actual = base64.b64encode(hashlib.sha512(archive).digest()).decode()
if actual != expected:
    raise RuntimeError("chess.js integrity check failed")

with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as package:
    for source, destination in [
        ("package/dist/esm/chess.js", "chess.js"),
        ("package/LICENSE", "chess-LICENSE.txt"),
    ]:
        member = package.extractfile(source)
        if member is None:
            raise RuntimeError(f"Missing package file: {source}")
        (VENDOR / destination).write_bytes(member.read())

release = "https://github.com/nmrugg/stockfish.js/releases/download/v19.0.1/"
for filename in [
    "stockfish-19-lite-single.js",
    "stockfish-19-lite-single.wasm",
]:
    (VENDOR / filename).write_bytes(download(release + filename))

(VENDOR / "stockfish-COPYING.txt").write_bytes(download(
    "https://raw.githubusercontent.com/nmrugg/stockfish.js/v19.0.1/Copying.txt"
))

(VENDOR / "SOURCES.txt").write_text(
    "chess.js 1.4.0\nhttps://github.com/jhlywa/chess.js\n\nStockfish.js 19.0.1, lite single-threaded build\nhttps://github.com/nmrugg/stockfish.js/tree/v19.0.1\n",
    encoding="utf-8",
)

def png_chunk(kind, data):
    return (
        struct.pack(">I", len(data))
        + kind + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    )

def create_icon(size):
    pixels = bytearray()
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            u, v = x / size, y / size
            color = (31, 34, 30)
            if .16 < u < .84 and .16 < v < .84:
                color = (128, 167, 85)
            tower = .36 < u < .64 and .38 < v < .66
            base = .30 < u < .70 and .65 < v < .73
            crown = (
                .30 < u < .70 and .28 < v < .42
                and (v > .35 or int((u - .30) / .08) % 2 == 0)
            )
            if tower or base or crown:
                color = (248, 244, 230)
            pixels.extend(color)

    data = b"\x89PNG\r\n\x1a\n"
    data += png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    data += png_chunk(b"IDAT", zlib.compress(bytes(pixels)))
    data += png_chunk(b"IEND", b"")
    (ROOT / f"icon-{size}.png").write_bytes(data)

for size in (192, 512):
    create_icon(size)

manifest = {
    "id": "./",
    "name": "Knightlab — Offline Chess Coach",
    "short_name": "Knightlab",
    "description": "Play, analyze, and learn chess offline.",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "background_color": "#191b18",
    "theme_color": "#191b18",
    "icons": [
        {
            "src": f"icon-{size}.png",
            "sizes": f"{size}x{size}",
            "type": "image/png",
            "purpose": "any maskable",
        }
        for size in (192, 512)
    ],
}
(ROOT / "manifest.webmanifest").write_text(
    json.dumps(manifest, indent=2), encoding="utf-8"
)

print("\nReady. Run: python -m http.server 8080")
