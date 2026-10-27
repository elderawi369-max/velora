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
    "LocalNotificationsPlugin", "PushNotificationsPlugin", "VeloraRewardedAdsPlugin",
    "VeloraStoreKitPlugin", "VeloraAchievementSharePlugin"
}
with (app / "GoogleService-Info.plist").open("rb") as file:
    firebase = plistlib.load(file)
assert firebase["BUNDLE_ID"] == config["appId"]
assert firebase["PROJECT_ID"] == "velora-e3a28"
with (app / "Info.plist").open("rb") as file:
    app_info = plistlib.load(file)
    assert not app_info.get("VeloraAdTesting"), "Test ads must be enabled only by the device-testing workflow"
    assert app_info.get("NSPhotoLibraryAddUsageDescription"), "Save Image must have a photo-library purpose description"
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
    "https://play.google.com/store/apps/details?id=com.velorachat.app",
    "https://apps.apple.com/app/id6826858824",
    "VeloraAchievementShare",
    "Share Results",
    "Share your achievement photo. Scan a code on the card to get Velora.",
):
    assert value in javascript, f"Missing production configuration: {value}"
assert "Google is still verifying" not in javascript
assert (app / "public/achievement-assets/app-store.svg").is_file()
assert (app / "public/achievement-assets/google-play.png").is_file()
assert (app / "public/achievement-assets/app-store-qr.png").is_file()
assert (app / "public/achievement-assets/google-play-qr.png").is_file()
assert (root / "packages/VeloraRewardedAdsNative/ios/Sources/VeloraRewardedAdsNative/VeloraAchievementSharePlugin.swift").is_file()
share_plugin = (root / "packages/VeloraRewardedAdsNative/ios/Sources/VeloraRewardedAdsNative/VeloraAchievementSharePlugin.swift").read_text()
assert 'CAPPluginMethod(name: "exportCard"' in share_plugin, "Native photo sharing must be registered"
assert "activityItems: [file]" in share_plugin, "Share Results must preserve the working photo-only handoff"
assert "UIPasteboard.general.string = text" not in share_plugin, "QR photo sharing must not rely on copying a caption"
assert "activityItems: [file, text]" not in share_plugin, "Sharing image and link text can replace the image with a link preview"
source_records = json.loads((root / "achievement-source/source-files.json").read_text())
recorded_swift = next(row for row in source_records if row["file"].endswith("VeloraAchievementSharePlugin.swift"))
assert hashlib.sha256((root / "packages/VeloraRewardedAdsNative/ios/Sources/VeloraRewardedAdsNative/VeloraAchievementSharePlugin.swift").read_bytes()).hexdigest() == recorded_swift["sha256"], "Packaged native sharing must match maintained-source records"
for product in ("credits.3", "credits.10", "gift.rose_aura", "gift.starlight_ring", "gift.velora_crown", "boost.spark", "boost.spotlight"):
    assert "com.velorachat.app." + product in javascript, f"Missing purchase product: {product}"
private_files = [p for p in root.rglob("*") if p.suffix.lower() in {
    ".p8", ".p12", ".pem", ".mobileprovision"
}]
assert not private_files, "Private signing material must stay in Codemagic"
print(f"Verified {len(manifest)} snapshot files, local packages, Firebase, ads and shared scheme.")

# Native signup must not depend on the web verification widget.
native_sources = root / "native-signup-source"
for row in json.loads((native_sources / "source-files.json").read_text()):
    assert hashlib.sha256((native_sources / row["file"]).read_bytes()).hexdigest() == row["sha256"]
widget_source = (native_sources / "frontend/src/ui/components/turnstile-widget.tsx").read_text()
assert 'if (nativeToken) return null;' in widget_source
assert 'onTokenChange(nativeToken)' in widget_source
assert '-native-bypass' in javascript
print("Verified native signup removal and matching frontend/backend source records.")
