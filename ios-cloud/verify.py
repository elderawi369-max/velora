"""Check the standalone iOS release before spending time compiling it."""
import hashlib
import json
from pathlib import Path
import plistlib
import re
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent
manifest = json.loads((root / "source-sha256.json").read_text())
for relative, digest in manifest.items():
    path = root / relative
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise SystemExit(f"Release snapshot mismatch: {relative}")

app = root / "ios/App/App"
config = json.loads((app / "capacitor.config.json").read_text())
assert config["appId"] == "com.velorachat.app"
assert config["server"]["iosScheme"] == "capacitor"
assert not config["server"].get("url"), "A release must embed its web bundle"
assert set(config["packageClassList"]) >= {
    "LocalNotificationsPlugin", "PushNotificationsPlugin", "VeloraRewardedAdsPlugin"
}
with (app / "GoogleService-Info.plist").open("rb") as file:
    firebase = plistlib.load(file)
assert firebase["BUNDLE_ID"] == config["appId"]
assert firebase["PROJECT_ID"] == "velora-e3a28"
with (app / "Info.plist").open("rb") as file:
    plistlib.load(file)
with (app / "App.entitlements").open("rb") as file:
    assert plistlib.load(file)["aps-environment"] == "$(APNS_ENVIRONMENT)"

for package in root.rglob("Package.swift"):
    source = package.read_text(encoding="utf-8-sig")
    assert "\\" not in source, f"Windows path in {package}"
    for relative in re.findall(r'\.package\([^\n]*path:\s*"([^"]+)"', source):
        assert (package.parent / relative / "Package.swift").is_file(), relative

scheme = ET.parse(root / "ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme")
assert scheme.find("ArchiveAction").attrib["buildConfiguration"] == "Release"
assert (app / "public/index.html").is_file()
javascript = "\n".join(p.read_text(encoding="utf-8") for p in (app / "public/assets").glob("*.js"))
for value in (
    "https://api.velorachat.com",
    "ca-app-pub-8082896452517848/5984730430",
    "ca-app-pub-8082896452517848/8419322089",
    "ca-app-pub-8082896452517848/6510595610",
):
    assert value in javascript, f"Missing production configuration: {value}"
assert "Google is still verifying" not in javascript
private_files = [p for p in root.rglob("*") if p.suffix.lower() in {
    ".p8", ".p12", ".pem", ".mobileprovision"
}]
assert not private_files, "Private signing material must stay in Codemagic"
print(f"Verified {len(manifest)} snapshot files, local packages, Firebase, ads and shared scheme.")
