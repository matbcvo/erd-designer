import type { Model } from './model/types';
import { parseModel, serializeModel } from './model/io';

/**
 * Share links carry the whole model in the URL fragment, which browsers never send to the server:
 * #model=<base64url of the raw-DEFLATE-compressed model JSON>
 */
export const SHARE_PREFIX = '#model=';

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function encodeModel(model: Model): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(JSON.parse(serializeModel(model))));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeModel(data: string): Promise<Model> {
  const json = await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw'));
  return parseModel(new TextDecoder().decode(json));
}

/** Link to the app as it is currently served, with the model attached. */
export async function shareUrl(model: Model): Promise<string> {
  return `${location.origin}${location.pathname}${SHARE_PREFIX}${await encodeModel(model)}`;
}
