"""Preserve static UMP privacy resources without embedding its iOS-100 stub."""
import argparse
import hashlib
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile

from ipa_tools import macho_images, version_tuple


def repair(app, prepare_only=False):
    app = app.resolve(strict=True)
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    assert info['CFBundleIdentifier'] == 'com.velorachat.app'
    framework = (app / 'Frameworks/UserMessagingPlatform.framework').resolve()
    assert framework.is_relative_to(app) and not framework.is_symlink()
    resource_bundle = app / 'GoogleUserMessagingPlatformPrivacy.bundle'
    if not framework.exists():
        assert (resource_bundle / 'PrivacyInfo.xcprivacy').is_file(), 'UMP resources missing'
        print('UMP static resources are already packaged without an executable.')
        return
    sdk_info = plistlib.loads((framework / 'Info.plist').read_bytes())
    if version_tuple(sdk_info.get('MinimumOSVersion', '0')) <= version_tuple(info['MinimumOSVersion']):
        print('UMP framework is already compatible; no repair needed.')
        return
    assert sdk_info['CFBundleIdentifier'] == 'com.google.UserMessagingPlatform'
    assert version_tuple(sdk_info['MinimumOSVersion']) >= (100, 0, 0)
    binary = framework / sdk_info['CFBundleExecutable']
    data = binary.read_bytes()
    images = macho_images(data)
    static_archive = data.startswith(b'!<arch>\n')
    generated_stub = bool(images) and all(
        row.get('symbolCount') == 0 and 'swbuild.tmp' in row.get('installName', '')
        and row.get('fileType') == 6 for row in images
    )
    assert static_archive or generated_stub, 'Refusing to alter an actual dynamic SDK'
    # Its code must already be statically linked: no packaged executable may load it.
    for candidate in app.rglob('*'):
        if not candidate.is_file() or candidate == binary or candidate.suffix not in ('', '.dylib'):
            continue
        for row in macho_images(candidate.read_bytes()):
            assert not any('UserMessagingPlatform.framework/' in dep for dep in row['dependencies']), f'SDK dynamically required by {candidate}'
    privacy = (framework / 'PrivacyInfo.xcprivacy').read_bytes()
    plistlib.loads(privacy)
    assert not resource_bundle.exists(), 'Refusing to overwrite a resource bundle'
    # Keep SDK resources and the privacy declaration byte-for-byte; only the unused
    # static archive/generated placeholder and its code-signing metadata are omitted.
    shutil.copytree(framework, resource_bundle, ignore=shutil.ignore_patterns(
        sdk_info['CFBundleExecutable'], '_CodeSignature', 'Info.plist', 'Headers', 'Modules'
    ))
    bundle_info = {
        'CFBundleIdentifier': sdk_info['CFBundleIdentifier'],
        'CFBundleName': 'GoogleUserMessagingPlatformPrivacy',
        'CFBundlePackageType': 'BNDL',
        'CFBundleVersion': sdk_info['CFBundleVersion'],
        'CFBundleShortVersionString': sdk_info['CFBundleShortVersionString']
    }
    (resource_bundle / 'Info.plist').write_bytes(plistlib.dumps(bundle_info))
    assert (resource_bundle / 'PrivacyInfo.xcprivacy').read_bytes() == privacy
    assert framework.parent == app / 'Frameworks'
    shutil.rmtree(framework)
    print('Converted unused iOS-100 UMP placeholder into a resource-only bundle; privacy SHA256:', hashlib.sha256(privacy).hexdigest())
    if prepare_only:
        print('Fixture preparation only: signature is stale and this copy must not be installed/uploaded.')
        return
    # Resource changes invalidate the parent seal. Re-sign using the exact public
    # leaf certificate from the existing app signature and the installed private key.
    with tempfile.TemporaryDirectory(prefix='velora-signing-') as directory:
        prefix = Path(directory) / 'certificate'
        subprocess.run(['codesign', '--display', '--extract-certificates', str(prefix), str(app)], check=True)
        identity = hashlib.sha1(Path(str(prefix) + '0').read_bytes()).hexdigest().upper()
        subprocess.run(['codesign', '--force', '--sign', identity,
                        '--preserve-metadata=identifier,entitlements,flags',
                        '--generate-entitlement-der', str(app)], check=True)
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
    print('Re-signed and verified the repaired archive.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('app', type=Path)
    parser.add_argument('--prepare-only', action='store_true', help='Local fixture validation only; never use for distribution')
    args = parser.parse_args()
    repair(args.app, args.prepare_only)
