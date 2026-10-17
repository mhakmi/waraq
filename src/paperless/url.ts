import { failure, type Result, success } from './errors';

export type ServerUrl = string & { readonly __brand: 'ServerUrl' };

export type ServerUrlError =
  | { kind: 'empty' }
  | { kind: 'malformed' }
  | { kind: 'unsupported_scheme'; scheme: string }
  | { kind: 'http_to_public_host'; host: string };

// React Native's URL class does not parse hosts, so the address is parsed here, the same way in tests and on the phone.
const addressPattern = /^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/?#]*)([^?#]*)(.*)$/i;
const authorityPattern = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/;
const pathPattern = /^[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/;
const dottedQuadPattern = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
const numericLabelPattern = /^(\d+|0x[0-9a-f]*)$/;
const defaultPorts: Record<string, string> = { http: '80', https: '443' };

const privateIpv4Ranges: [number[], number][] = [
  [[10, 0, 0, 0], 8],
  [[172, 16, 0, 0], 12],
  [[192, 168, 0, 0], 16],
  [[127, 0, 0, 0], 8],
  [[100, 64, 0, 0], 10],
];

const privateNameSuffixes = ['.local', '.lan', '.home.arpa', '.ts.net'];

function ipv4Number(octets: number[]): number {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function isPrivateIpv4(octets: number[]): boolean {
  const address = ipv4Number(octets);
  return privateIpv4Ranges.some(([network, prefixLength]) => {
    const mask = (0xffffffff << (32 - prefixLength)) >>> 0;
    return (address & mask) >>> 0 === ipv4Number(network);
  });
}

const privateIpv6Ranges: [number, number][] = [
  [0xfc00, 7],
  [0xfe80, 10],
];

function isPrivateIpv6(address: string): boolean {
  if (address === '::1') {
    return true;
  }
  const firstGroup = Number.parseInt(address.split(':')[0] || '0', 16);
  return privateIpv6Ranges.some(([network, prefixLength]) => {
    const mask = (0xffff << (16 - prefixLength)) & 0xffff;
    return (firstGroup & mask) === network;
  });
}

type Host =
  | { kind: 'ipv4'; octets: number[] }
  | { kind: 'ipv6'; address: string }
  | { kind: 'name'; name: string };

// A host whose last label is a number is an IPv4 address to the phone's resolver, in forms like
// "134744072" or "010.0.0.1". Only the plain dotted form is accepted, so the rule below sees the
// address the phone will connect to.
function parseHost(text: string): Host | null {
  if (text.startsWith('[')) {
    return { kind: 'ipv6', address: text.slice(1, -1) };
  }
  const quad = dottedQuadPattern.exec(text);
  if (quad) {
    const octets = quad.slice(1).map(Number);
    return octets.every((octet) => octet <= 255) ? { kind: 'ipv4', octets } : null;
  }
  const name = text.replace(/\.$/, '');
  const labels = name.split('.');
  const wellFormed = labels.every((label) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label));
  if (!wellFormed || numericLabelPattern.test(labels[labels.length - 1])) {
    return null;
  }
  return { kind: 'name', name };
}

function isPrivateHost(host: Host): boolean {
  if (host.kind === 'ipv4') {
    return isPrivateIpv4(host.octets);
  }
  if (host.kind === 'ipv6') {
    return isPrivateIpv6(host.address);
  }
  if (host.name === 'localhost' || !host.name.includes('.')) {
    return true;
  }
  return privateNameSuffixes.some((suffix) => host.name.endsWith(suffix));
}

export function normalizeServerUrl(input: string): Result<ServerUrl, ServerUrlError> {
  const trimmed = input.trim();
  if (trimmed === '') {
    return failure({ kind: 'empty' });
  }

  const parts = addressPattern.exec(trimmed);
  if (!parts) {
    return failure({ kind: 'malformed' });
  }
  const [, schemeText, authorityText, pathText, rest] = parts;
  const scheme = (schemeText ?? 'https').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    return failure({ kind: 'unsupported_scheme', scheme });
  }

  const authority = authorityPattern.exec(authorityText.toLowerCase());
  if (!authority || rest !== '' || !pathPattern.test(pathText)) {
    return failure({ kind: 'malformed' });
  }
  const [, hostText, port] = authority;
  const host = parseHost(hostText);
  if (host === null || (port !== undefined && Number(port) > 65535)) {
    return failure({ kind: 'malformed' });
  }
  if (scheme === 'http' && !isPrivateHost(host)) {
    return failure({ kind: 'http_to_public_host', host: hostText });
  }

  const portSuffix = port === undefined || port === defaultPorts[scheme] ? '' : `:${port}`;
  let path = pathText.replace(/\/+$/, '');
  if (path.toLowerCase().endsWith('/api')) {
    path = path.slice(0, -'/api'.length).replace(/\/+$/, '');
  }
  return success(`${scheme}://${hostText}${portSuffix}${path}` as ServerUrl);
}
