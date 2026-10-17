// Live table sharing for Kitti Score Tracker (Cloudflare Pages Function).
// The host PUTs the table state with a secret key; players GET it read-only.
// Needs a KV namespace bound as KITTI (Pages project → Settings → Bindings). Without it, both
// methods answer 501 and the app falls back to snapshot links.
const TTL = 60 * 60 * 24 * 3;            // tables expire 3 days after their last update
const MAX_BYTES = 60000;
const ID_RE = /^[a-z0-9]{8,24}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", "cache-control": "no-store"}});

async function sha256(text){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet({params, env}){
  if(!env.KITTI) return json({error: "not-configured"}, 501);
  if(!ID_RE.test(params.id)) return json({error: "bad-id"}, 400);
  const v = await env.KITTI.get("t:" + params.id);
  if(!v) return json({error: "not-found"}, 404);
  return new Response(v, {headers: {"content-type": "application/json", "cache-control": "no-store"}});
}

export async function onRequestPut({params, env, request}){
  if(!env.KITTI) return json({error: "not-configured"}, 501);
  const id = params.id;
  if(!ID_RE.test(id)) return json({error: "bad-id"}, 400);
  const raw = await request.text();
  if(raw.length > MAX_BYTES) return json({error: "too-large"}, 413);
  let body;
  try{ body = JSON.parse(raw); }catch(e){ return json({error: "bad-json"}, 400); }
  if(typeof body.key !== "string" || body.key.length < 16 || !body.state || !Array.isArray(body.state.players))
    return json({error: "bad-body"}, 400);

  // the first writer owns the table; later writes must bring the same key
  const hash = await sha256(body.key);
  const owner = await env.KITTI.get("k:" + id);
  if(owner && owner !== hash) return json({error: "forbidden"}, 403);
  // the owner record is only rewritten once, so it doesn't eat into KV's daily write quota;
  // its expiry is set well past the table's so the table never outlives its owner
  if(!owner) await env.KITTI.put("k:" + id, hash, {expirationTtl: TTL * 10});
  await env.KITTI.put("t:" + id, JSON.stringify({state: body.state, at: Date.now()}), {expirationTtl: TTL});
  return json({ok: true});
}
