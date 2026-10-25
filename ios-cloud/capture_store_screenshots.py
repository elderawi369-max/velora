"""Capture actual app layouts on ephemeral Codemagic iPhone/iPad simulators."""
import argparse
import json
from pathlib import Path
import plistlib
import re
import subprocess
import time

ROUTES = [
    ('01-mind-hunters', '/mind-hunters', 'Lighthouse'),
    ('02-trivia', '/trivia', 'Ten questions'),
    ('03-drowned-bell', '/mind-hunters/drowned-bell', 'Drowned Bell'),
    ('04-browse', '/browse', 'Browse profiles'),
]
PHONE_NAMES = ['iPhone 16 Pro', 'iPhone 15 Pro', 'iPhone 17 Pro', 'iPhone 14 Pro', 'iPhone 15', 'iPhone 16', 'iPhone 17']
SIZES = {'iphone': {(1179, 2556), (1206, 2622)}, 'ipad': {(2064, 2752), (2048, 2732)}}


def run(*args, **kwargs):
    return subprocess.run(list(map(str, args)), check=True, **kwargs)


def select_devices(inventory):
    runtimes = sorted((key for key in inventory['devices'] if '.iOS-' in key), key=lambda key: tuple(map(int, re.findall(r'\d+', key))), reverse=True)
    for runtime in runtimes:
        devices = [d for d in inventory['devices'][runtime] if d.get('isAvailable')]
        phone = next((d for name in PHONE_NAMES for d in devices if d['name'] == name), None)
        tablet = next((d for d in devices if d['name'].startswith('iPad') and '13' in d['name']), None)
        tablet = tablet or next((d for d in devices if d['name'].startswith('iPad') and '12.9' in d['name']), None)
        if phone and tablet:
            return [('iphone', phone), ('ipad', tablet)]
    raise RuntimeError('No supported iPhone + 13-inch iPad pair is available. Check simulator-inventory.json.')


def capture(app, output, checker):
    app = app.resolve(strict=True)
    info = plistlib.loads((app/'Info.plist').read_bytes())
    assert info['CFBundleIdentifier'] == 'com.velorachat.app'
    assert info['CFBundleSupportedPlatforms'] == ['iPhoneSimulator'], 'Never modify or install a distribution build here'
    index = app/'public/index.html'
    original = index.read_text()
    assert '<head>' in original and 'history.replaceState' not in original
    inventory = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '--json']))
    output.mkdir(parents=True, exist_ok=True)
    (output/'simulator-inventory.json').write_text(json.dumps(inventory, indent=2))
    manifest = []
    for family, device in select_devices(inventory):
        udid = device['udid']
        folder = output/family
        folder.mkdir(exist_ok=True)
        started = device['state'] != 'Booted'
        try:
            if started:
                run('xcrun', 'simctl', 'boot', udid)
            run('xcrun', 'simctl', 'bootstatus', udid, '-b', timeout=240)
            run('xcrun', 'simctl', 'ui', udid, 'appearance', 'light')
            run('xcrun', 'simctl', 'status_bar', udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100')
            for name, route, expected in ROUTES:
                # This only chooses an existing app route before React starts. App
                # content, styles, production web assets and native UI are unchanged.
                navigation = '<script>history.replaceState(null,"",' + json.dumps(route) + ');</script>'
                index.write_text(original.replace('<head>', '<head>'+navigation, 1))
                run('codesign', '--force', '--deep', '--sign', '-', app)
                subprocess.run(['xcrun', 'simctl', 'uninstall', udid, 'com.velorachat.app'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                run('xcrun', 'simctl', 'install', udid, app)
                run('xcrun', 'simctl', 'launch', udid, 'com.velorachat.app')
                path = folder/(name+'.jpg')
                # Allow the actual WebView, fonts and local artwork to finish loading.
                for attempt in range(3):
                    time.sleep(8)
                    run('xcrun', 'simctl', 'io', udid, 'screenshot', '--type=jpeg', path)
                    valid = subprocess.run([str(checker), str(path), expected]).returncode == 0
                    if valid:
                        break
                assert valid, f'Expected app content not visible in {path}'
                size = subprocess.check_output(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', str(path)], text=True)
                width = int(re.search(r'pixelWidth:\s*(\d+)', size).group(1))
                height = int(re.search(r'pixelHeight:\s*(\d+)', size).group(1))
                assert (width, height) in SIZES[family], f'Unsupported upload dimensions: {width} x {height}'
                manifest.append({'file':str(path.relative_to(output)), 'device':device['name'], 'route':route, 'width':width, 'height':height, 'source':'Actual native simulator capture', 'visibleContentVerified':True})
                print(json.dumps(manifest[-1]), flush=True)
                run('xcrun', 'simctl', 'terminate', udid, 'com.velorachat.app')
        finally:
            index.write_text(original)
            if started:
                subprocess.run(['xcrun', 'simctl', 'shutdown', udid], check=False)
    (output/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    (output/'READ-ME.txt').write_text('Native simulator screenshots. Review each image before uploading. Use iphone files in iPhone with Dynamic Island (medium display), and ipad files in iPad 13-inch display. No previews, Apple Watch screenshots, or iPhone Duo screenshots are included. These files do not submit or publish your app.\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('app', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--checker', type=Path, required=True)
    args = parser.parse_args()
    capture(args.app, args.output.resolve(), args.checker.resolve(strict=True))
