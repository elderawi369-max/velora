export type SafeUserImage = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
};

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const maxDimension = 6000;
const minDimension = 256;
const maxPixels = 20_000_000;

function validateDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < minDimension || height < minDimension) {
    throw new Error("Photo dimensions must be at least 256 by 256 pixels.");
  }
  if (width > maxDimension || height > maxDimension || width * height > maxPixels) {
    throw new Error("Photo dimensions are too large. Use an image up to 6000 pixels per side and 20 megapixels.");
  }
}

function readU32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

function readU32Le(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function concat(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function crc32(bytes: Uint8Array, start: number, length: number) {
  let crc = 0xffffffff;
  for (let index = start; index < start + length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sanitizeJpeg(bytes: Uint8Array): SafeUserImage {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error("The file is not a complete JPEG image.");
  const parts = [bytes.slice(0, 2)];
  let offset = 2;
  let width = 0; let height = 0; let foundScan = false;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("The JPEG structure is invalid.");
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda) {
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) throw new Error("The JPEG scan is invalid.");
      parts.push(bytes.slice(offset - 2));
      foundScan = true;
      break;
    }
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error("The JPEG structure is invalid.");
    const segmentStart = offset - 2;
    const segmentEnd = offset + length;
    const isSof = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
    if (isSof) {
      if (length < 7) throw new Error("The JPEG dimensions are invalid.");
      height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      width = (bytes[offset + 5] << 8) | bytes[offset + 6];
    }
    // APP1-APP13, APP15 and COM can carry EXIF, GPS, XMP, comments, or other
    // identifying metadata. APP0/APP14 are retained for decoder compatibility.
    const isPrivateMetadata = (marker >= 0xe1 && marker <= 0xed) || marker === 0xef || marker === 0xfe;
    if (!isPrivateMetadata) parts.push(bytes.slice(segmentStart, segmentEnd));
    offset = segmentEnd;
  }
  if (!foundScan || !width || !height) throw new Error("The JPEG image could not be decoded safely.");
  validateDimensions(width, height);
  return { bytes: concat(parts), contentType: "image/jpeg", extension: "jpg", width, height };
}

function sanitizePng(bytes: Uint8Array): SafeUserImage {
  if (bytes.length < 33 || !pngSignature.every((value, index) => bytes[index] === value)) throw new Error("The file is not a PNG image.");
  const parts = [bytes.slice(0, 8)];
  let offset = 8; let width = 0; let height = 0; let hasImageData = false; let hasEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    if (length > bytes.length - offset - 12) throw new Error("The PNG structure is invalid.");
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (crc32(bytes, offset + 4, length + 4) !== readU32(bytes, offset + 8 + length)) throw new Error("The PNG checksum is invalid.");
    if (type === "IHDR") {
      if (length !== 13 || width) throw new Error("The PNG header is invalid.");
      width = readU32(bytes, offset + 8); height = readU32(bytes, offset + 12);
    }
    if (type === "acTL") throw new Error("Animated images are not supported.");
    if (type === "IDAT") hasImageData = true;
    if (type === "IEND") hasEnd = true;
    // Preserve only decoding-critical chunks and transparency. This removes
    // EXIF, GPS, text, timestamps, profiles, and application-specific payloads.
    const isCritical = (bytes[offset + 4] & 0x20) === 0;
    if (isCritical || type === "tRNS") parts.push(bytes.slice(offset, end));
    offset = end;
    if (type === "IEND") break;
  }
  if (!width || !height || !hasImageData || !hasEnd || offset !== bytes.length) throw new Error("The PNG image could not be decoded safely.");
  validateDimensions(width, height);
  return { bytes: concat(parts), contentType: "image/png", extension: "png", width, height };
}

function sanitizeWebp(bytes: Uint8Array): SafeUserImage {
  const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length));
  if (bytes.length < 30 || ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WEBP" || readU32Le(bytes, 4) + 8 !== bytes.length) throw new Error("The file is not a complete WebP image.");
  const chunks: Uint8Array[] = []; let offset = 12; let width = 0; let height = 0; let hasPixels = false;
  while (offset + 8 <= bytes.length) {
    const type = ascii(offset, 4);
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
    const paddedEnd = offset + 8 + length + (length & 1);
    if (paddedEnd > bytes.length) throw new Error("The WebP structure is invalid.");
    const chunk = bytes.slice(offset, paddedEnd);
    if (type === "VP8X") {
      if (length < 10) throw new Error("The WebP header is invalid.");
      if (chunk[8] & 0x02) throw new Error("Animated images are not supported.");
      chunk[8] &= ~(0x20 | 0x08 | 0x04);
      width = 1 + chunk[12] + (chunk[13] << 8) + (chunk[14] << 16);
      height = 1 + chunk[15] + (chunk[16] << 8) + (chunk[17] << 16);
    } else if (type === "VP8 " && length >= 10) {
      width = (chunk[14] | (chunk[15] << 8)) & 0x3fff; height = (chunk[16] | (chunk[17] << 8)) & 0x3fff; hasPixels = true;
    } else if (type === "VP8L" && length >= 5) {
      if (chunk[8] !== 0x2f) throw new Error("The WebP lossless header is invalid.");
      const bits = chunk[9] | (chunk[10] << 8) | (chunk[11] << 16) | (chunk[12] << 24);
      width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; hasPixels = true;
    }
    if (type === "VP8 " || type === "VP8L") hasPixels = true;
    if (!["EXIF", "XMP ", "ICCP"].includes(type)) chunks.push(chunk);
    offset = paddedEnd;
  }
  if (!width || !height || !hasPixels || offset !== bytes.length) throw new Error("The WebP image could not be decoded safely.");
  validateDimensions(width, height);
  const body = concat([new TextEncoder().encode("WEBP"), ...chunks]);
  const output = new Uint8Array(body.length + 8); output.set(new TextEncoder().encode("RIFF")); new DataView(output.buffer).setUint32(4, body.length, true); output.set(body, 8);
  return { bytes: output, contentType: "image/webp", extension: "webp", width, height };
}

export function inspectAndSanitizeUserImage(bytes: Uint8Array, declaredType: string): SafeUserImage {
  let image: SafeUserImage;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) image = sanitizeJpeg(bytes);
  else if (pngSignature.every((value, index) => bytes[index] === value)) image = sanitizePng(bytes);
  else if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") image = sanitizeWebp(bytes);
  else throw new Error("Choose a real JPEG, PNG, or WebP image.");
  if (declaredType && declaredType.toLowerCase() !== image.contentType) throw new Error("The file content does not match its reported image type.");
  return image;
}
