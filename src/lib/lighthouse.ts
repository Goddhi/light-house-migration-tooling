import lighthouse from "@lighthouse-web3/sdk";

export async function ensureKeyValid(key: string) {
  await lighthouse.getBalance(key); 
}

export async function uploadBuffer(buf: Buffer, key: string) {
  const resp = await lighthouse.uploadBuffer(buf, key);
  const d: any = resp?.data || {};
  return { cid: d.cid || d.Hash, size: Number(d.Size) || buf.length };
}
