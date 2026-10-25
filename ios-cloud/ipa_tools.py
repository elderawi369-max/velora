"""Minimal Mach-O metadata reader for checking exported iOS artifacts."""
import plistlib
import struct


def os_version(value):
    return f'{value >> 16}.{(value >> 8) & 255}.{value & 255}'


def version_tuple(value):
    parts = tuple(map(int, str(value).split('.')))
    return (parts + (0, 0, 0))[:3]


def macho_images(data):
    magic = data[:4]
    if magic in (b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
        wide = magic == b'\xca\xfe\xba\xbf'
        rows = []
        for index in range(struct.unpack_from('>I', data, 4)[0]):
            offset, size = struct.unpack_from('>QQ' if wide else '>II', data, 16 + index * (32 if wide else 20))
            rows.extend(macho_images(data[offset:offset + size]))
        return rows
    if magic not in (b'\xcf\xfa\xed\xfe', b'\xce\xfa\xed\xfe'):
        return []
    cpu, subtype, filetype, count = struct.unpack_from('<IIII', data, 4)
    item = {'cpuType': cpu, 'cpuSubtype': subtype & 0xffffff,
            'fileType': filetype, 'dependencies': []}
    cursor = 32 if magic == b'\xcf\xfa\xed\xfe' else 28
    for _ in range(count):
        command, size = struct.unpack_from('<II', data, cursor)
        if command == 0x32:
            platform, minimum, sdk = struct.unpack_from('<III', data, cursor + 8)
            item.update(platform=platform, minimumOS=os_version(minimum), sdk=os_version(sdk))
        elif command == 0x25:
            minimum, sdk = struct.unpack_from('<II', data, cursor + 8)
            item.update(platform=2, minimumOS=os_version(minimum), sdk=os_version(sdk))
        elif command == 2:
            item['symbolCount'] = struct.unpack_from('<I', data, cursor + 12)[0]
        elif command in (0xc, 0xd, 0x80000018, 0x8000001f, 0x80000023, 0x20):
            start = cursor + struct.unpack_from('<I', data, cursor + 8)[0]
            name = data[start:cursor + size].split(b'\0')[0].decode()
            if command == 0xd:
                item['installName'] = name
            else:
                item['dependencies'].append(name)
        elif command == 0x1d:
            offset, length = struct.unpack_from('<II', data, cursor + 8)
            signature = data[offset:offset + length]
            item['hasCodeSignature'] = bool(signature)
            if len(signature) >= 12 and struct.unpack_from('>I', signature)[0] == 0xfade0cc0:
                for index in range(struct.unpack_from('>I', signature, 8)[0]):
                    kind, blob_offset = struct.unpack_from('>II', signature, 12 + index * 8)
                    if kind == 5:
                        blob_length = struct.unpack_from('>I', signature, blob_offset + 4)[0]
                        item['entitlements'] = plistlib.loads(signature[blob_offset + 8:blob_offset + blob_length])
        if size < 8:
            raise ValueError('Invalid Mach-O load command size')
        cursor += size
    return [item]
