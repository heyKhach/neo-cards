// DATA SOURCE (loads 2nd): reads the Spotify export (.zip or .json files) into one list of plays.
// Needs: nothing. Provides: readHistory(files)
// A future live-Spotify source would sit next to this file and return the same kind of list.

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

async function readZip(file) {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const dec = new TextDecoder();

  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a zip file");

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const rows = [];

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const csize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (!/streaming_history_audio.*\.json$/i.test(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + csize);
    const text = method === 0 ? dec.decode(data) : await inflate(data);
    for (const r of JSON.parse(text)) rows.push(r);
  }
  return rows;
}

async function readHistory(files) {
  const rows = [];
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".zip")) {
      for (const r of await readZip(file)) rows.push(r);
    } else if (name.endsWith(".json")) {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data)) for (const r of data) rows.push(r);
    }
  }
  return rows.filter((r) => r.master_metadata_track_name && r.master_metadata_album_artist_name && r.ts);
}
