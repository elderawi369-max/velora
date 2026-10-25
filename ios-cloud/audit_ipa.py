"""Reject an IPA with incompatible embedded executables before publication."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import zipfile

from ipa_tools import macho_images, version_tuple

parser = argparse.ArgumentParser()
parser.add_argument('ipa', type=Path)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--expected-build')
parser.add_argument('--verify-signatures', action='store_true')
parser.add_argument('--distribution', choices=('app-store', 'ad-hoc'), default='app-store')
parser.add_argument('--expected-device-sha256', help='Require this device in an Ad Hoc profile without logging its UDID')
args = parser.parse_args()
if args.expected_device_sha256 and args.distribution != 'ad-hoc':
    parser.error('--expected-device-sha256 requires --distribution ad-hoc')
failures = []
report = {'ipa': str(args.ipa), 'sha256': hashlib.sha256(args.ipa.read_bytes()).hexdigest()}
with zipfile.ZipFile(args.ipa) as archive:
    app_info_path = next(n for n in archive.namelist() if n.startswith('Payload/') and n.count('/') == 2 and n.endswith('.app/Info.plist'))
    root = app_info_path[:-len('Info.plist')]
    info = plistlib.loads(archive.read(app_info_path))
    report['app'] = {k: info.get(k) for k in ('CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion', 'MinimumOSVersion', 'UIDeviceFamily')}
    assert info['CFBundleIdentifier'] == 'com.velorachat.app'
    if args.expected_build:
        assert info['CFBundleVersion'] == args.expected_build
    assert 1 in info['UIDeviceFamily']
    assert version_tuple(info['MinimumOSVersion']) <= (16, 7, 16)
    raw = archive.read(root + 'embedded.mobileprovision')
    profile = plistlib.loads(raw[raw.index(b'<?xml'):raw.index(b'</plist>') + 8])
    ent = profile['Entitlements']
    assert ent['application-identifier'] == 'N94Z4PR968.com.velorachat.app'
    assert ent['get-task-allow'] is False
    assert not profile.get('ProvisionsAllDevices'), 'Enterprise profiles are not supported'
    devices = profile.get('ProvisionedDevices', [])
    if args.distribution == 'app-store':
        assert ent['beta-reports-active'] is True
        assert not devices, 'Expected an App Store profile'
    else:
        assert devices, 'Ad Hoc profile must authorize registered devices'
        assert not ent.get('beta-reports-active'), 'Expected an Ad Hoc profile, not TestFlight'
        assert ent.get('aps-environment') == 'production'
        if args.expected_device_sha256:
            assert args.expected_device_sha256.lower() in {
                hashlib.sha256(device.encode()).hexdigest() for device in devices
            }, 'This iPhone is not authorized by the Ad Hoc profile'
    report['distribution'] = args.distribution
    report['authorizedDeviceCount'] = len(devices)
    report['binaries'] = {}
    for entry in archive.infolist():
        if entry.is_dir() or not entry.filename.startswith(root) or Path(entry.filename).suffix not in ('', '.dylib'):
            continue
        rows = macho_images(archive.read(entry.filename))
        if not rows:
            continue
        name = entry.filename[len(root):]
        report['binaries'][name] = rows
        if not any(row['cpuType'] == 0x100000c and row['cpuSubtype'] == 0 for row in rows):
            failures.append(f'No standard arm64 slice in {name}')
        for row in rows:
            if row.get('platform') != 2:
                failures.append(f'Not an iOS device binary: {name}')
            if version_tuple(row.get('minimumOS', '999')) > version_tuple(info['MinimumOSVersion']):
                failures.append(f'{name} requires iOS {row.get("minimumOS")}, above app minimum {info["MinimumOSVersion"]}')
            if not row.get('hasCodeSignature'):
                failures.append(f'No embedded code signature: {name}')
    assert info['CFBundleExecutable'] in report['binaries']
    app_ent = report['binaries'][info['CFBundleExecutable']][0].get('entitlements', {})
    for key in ('application-identifier', 'com.apple.developer.team-identifier', 'aps-environment', 'beta-reports-active', 'get-task-allow'):
        assert app_ent.get(key) == ent.get(key), f'Entitlement mismatch: {key}'
    privacy_paths = [n for n in archive.namelist() if n.startswith(root) and n.endswith('/PrivacyInfo.xcprivacy')]
    report['privacyManifests'] = privacy_paths
    assert any('UserMessagingPlatform' in n for n in privacy_paths), 'UMP privacy declaration missing'
    for path in privacy_paths:
        plistlib.loads(archive.read(path))
    if args.verify_signatures and not failures:
        with tempfile.TemporaryDirectory(prefix='velora-ipa-verification-') as directory:
            destination = Path(directory).resolve()
            for name in archive.namelist():
                assert (destination / name).resolve().is_relative_to(destination)
            archive.extractall(destination)
            signed_app = destination / root
            verification = subprocess.run(['codesign', '--verify', '--deep', '--strict', str(signed_app)])
            if verification.returncode:
                failures.append('Final exported IPA code signature verification failed')
            report['cryptographicSignatureVerificationPassed'] = verification.returncode == 0
report['failures'] = failures
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2, default=str) + '\n', encoding='utf-8')
print(json.dumps({'build': info['CFBundleVersion'], 'binaries': len(report['binaries']), 'failures': failures}))
sys.exit(1 if failures else 0)
