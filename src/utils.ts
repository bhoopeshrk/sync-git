import { moment, normalizePath } from 'obsidian';

/**
 * Normalizes vault file paths: replaces backslashes/redundant slashes and applies Unicode NFC composition.
 */
export function normalizeFilePath(path: string): string {
	return normalizePath(path).normalize('NFC');
}

/**
 * Calculates a standard Git SHA-1 Hash: sha1("blob " + filesize + "\0" + filedata)
 */
export async function calculateGitSha(buffer: ArrayBuffer): Promise<string> {
  const header = new TextEncoder().encode(`blob ${buffer.byteLength}\0`);
  const combined = new Uint8Array(header.byteLength + buffer.byteLength);
  combined.set(header);
  combined.set(new Uint8Array(buffer), header.byteLength);
  
  const hashBuffer = await crypto.subtle.digest('SHA-1', combined);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return window.btoa(binary);
}

export function generateCommitMessage(hostname: string, format: string, files: string[]): string {
  const dateStr = moment().format(format);
  const host = hostname || 'Unknown-Device';
  const title = `Sync/Auto sync from ${host}: ${dateStr}`;
  const body = files.length > 0 ? `\n\nChanged files:\n${files.map(f => `- ${f}`).join('\n')}` : '';
  return title + body;
}

const BINARY_EXTENSIONS = new Set([
	'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'tiff', 'tif',
	'mp3', 'mp4', 'wav', 'ogg', 'flac', 'aac', 'wma',
	'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
	'zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'xz',
	'exe', 'dll', 'so', 'dylib', 'bin',
	'woff', 'woff2', 'ttf', 'otf', 'eot',
	'sqlite', 'db',
]);

export function isTextFile(path: string): boolean {
	const filename = path.split('/').pop() || path;
	const dotIndex = filename.lastIndexOf('.');
	if (dotIndex <= 0) return true;
	const ext = filename.slice(dotIndex + 1).toLowerCase();
	return !BINARY_EXTENSIONS.has(ext);
}

export function normalizeTextBuffer(buffer: ArrayBuffer): ArrayBuffer {
  const text = new TextDecoder('utf-8').decode(buffer);
  const normalized = text.replace(/\r\n/g, '\n');
  return new TextEncoder().encode(normalized).buffer;
}

export function globToRegex(glob: string): RegExp {
	const pattern = glob.trim();
	if (pattern.length === 0) return /^$/;

	let regStr = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex characters except * and ?
		.replace(/\*\*/g, '.*')
		.replace(/\*/g, '[^/]*')
		.replace(/\?/g, '[^/]');

	if (pattern.startsWith('/')) {
		regStr = '^' + regStr.slice(1);
	} else {
		regStr = '(?:^|/)' + regStr;
	}

	if (pattern.endsWith('/')) {
		regStr += '.*';
	} else {
		regStr += '(?:$|/)';
	}

	return new RegExp(regStr, 'i');
}