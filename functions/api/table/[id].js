// Live table sharing for Kitti Score Tracker (Cloudflare Pages Function).
// One controller at a time: whoever holds the table's secret key can write the state; everyone else reads.
// Control moves by request + handover, or is free to take when the controller leaves or goes quiet.
// Needs a KV namespace bound as KITTI (Pages project → Settings → Bindings). Without it every call answers
// 501 and the app falls back to snapshot links.
//
// KV keys per table id:
//   t:<id>  {state, at, ctl, open}   the table, when it last changed, controller's name, open = free to take
//   k:<id>  sha256 of the controller's key
//   q:<id>  {vid, name, at}          a pending "can I have control?" request
//   h:<id>  {vid, key}               an accepted handover waiting to be claimed by that viewer
const TTL = 60 * 60 * 24 * 3;            // tables expire 3 days after their last change
const SHORT = 60 * 10;                   // requests and handovers expire after 10 minutes
const STALE_MS = 10 * 60 * 1000;         // no change for 10 minutes: anyone with the link may take control
const MAX_BYTES = 80000;
const ID_RE = /^[a-z0-9]{8,24}$/, VID_RE = /^[a-z0-9]{8,32}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", "cache-control": "no-store"}});

async function sha256(text){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function newKey(){
  const a = new Uint8Array(21); crypto.getRandomValues(a);
  return [...a].map(b => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
}
const getJ = async (kv, k) => { const v = await kv.get(k); return v ? JSON.parse(v) : null; };
async function isOwner(env, id, key){
  if(typeof key !== "string" || key.length < 16) return false;
  return (await env.KITTI.get("k:" + id)) === await sha256(key);
}
async function readBody(request){
  const raw = await request.text();
  if(raw.length > MAX_BYTES) return {error: json({error: "too-large"}, 413)};
  try{ return {body: JSON.parse(raw || "{}")}; }catch(e){ return {error: json({error: "bad-json"}, 400)}; }
}

// players (and the controller) poll this: the table, who controls it, whether control is free,
// any pending request, and whether a handover is waiting for the asking viewer
export async function onRequestGet({params, env, request}){
  if(!env.KITTI) return json({error: "not-configured"}, 501);
  const id = params.id;
  if(!ID_RE.test(id)) return json({error: "bad-id"}, 400);
  const t = await getJ(env.KITTI, "t:" + id);
  if(!t) return json({error: "not-found"}, 404);
  const vid = new URL(request.url).searchParams.get("vid") || "";
  const [q, h] = await Promise.all([getJ(env.KITTI, "q:" + id), getJ(env.KITTI, "h:" + id)]);
  return json({
    state: t.state, at: t.at, ctl: t.ctl || "",
    free: !!t.open || Date.now() - t.at > STALE_MS,
    request: q ? {name: q.name, mine: q.vid === vid} : null,
    offer: !!(h && vid && h.vid === vid)
  });
}

// the controller saves the table; the first save creates it
export async function onRequestPut({params, env, request}){
  if(!env.KITTI) return json({error: "not-configured"}, 501);
  const id = params.id;
  if(!ID_RE.test(id)) return json({error: "bad-id"}, 400);
  const {body, error} = await readBody(request); if(error) return error;
  if(typeof body.key !== "string" || body.key.length < 16 || !body.state || !Array.isArray(body.state.players))
    return json({error: "bad-body"}, 400);
  const hash = await sha256(body.key), owner = await env.KITTI.get("k:" + id);
  if(owner && owner !== hash) return json({error: "not-controller"}, 403);
  if(!owner) await env.KITTI.put("k:" + id, hash, {expirationTtl: TTL * 10});
  // keep the controller's name unless this save brings one
  const prev = body.ctl ? null : await getJ(env.KITTI, "t:" + id);
  const ctl = String(body.ctl || (prev && prev.ctl) || "").slice(0, 24);
  await env.KITTI.put("t:" + id, JSON.stringify({state: body.state, at: Date.now(), ctl}), {expirationTtl: TTL});
  const q = await getJ(env.KITTI, "q:" + id);
  return json({ok: true, request: q ? {name: q.name} : null});
}

// actions: request, answer (controller), leave (controller), claim (viewer)
export async function onRequestPost({params, env, request}){
  if(!env.KITTI) return json({error: "not-configured"}, 501);
  const id = params.id;
  if(!ID_RE.test(id)) return json({error: "bad-id"}, 400);
  const {body, error} = await readBody(request); if(error) return error;
  const kv = env.KITTI, a = body.action;
  const t = await getJ(kv, "t:" + id);
  if(!t) return json({error: "not-found"}, 404);

  if(a === "request"){
    if(!VID_RE.test(body.vid || "")) return json({error: "bad-vid"}, 400);
    await kv.put("q:" + id, JSON.stringify({vid: body.vid, name: String(body.name || "").slice(0, 24), at: Date.now()}), {expirationTtl: SHORT});
    return json({ok: true});
  }
  if(a === "cancel"){
    const q = await getJ(kv, "q:" + id);
    if(q && q.vid === body.vid) await kv.delete("q:" + id);
    return json({ok: true});
  }
  if(a === "answer"){
    if(!await isOwner(env, id, body.key)) return json({error: "not-controller"}, 403);
    const q = await getJ(kv, "q:" + id);
    if(!q) return json({error: "no-request"}, 409);
    await kv.delete("q:" + id);
    if(body.accept) await kv.put("h:" + id, JSON.stringify({vid: q.vid, key: newKey()}), {expirationTtl: SHORT});
    return json({ok: true});
  }
  if(a === "leave"){
    if(!await isOwner(env, id, body.key)) return json({error: "not-controller"}, 403);
    await kv.put("t:" + id, JSON.stringify({...t, open: true}), {expirationTtl: TTL});
    return json({ok: true});
  }
  if(a === "claim"){
    if(!VID_RE.test(body.vid || "")) return json({error: "bad-vid"}, 400);
    const h = await getJ(kv, "h:" + id);
    let key = null;
    if(h && h.vid === body.vid){ key = h.key; await kv.delete("h:" + id); }
    else if(t.open || Date.now() - t.at > STALE_MS) key = newKey();
    else return json({error: "not-free"}, 403);
    await kv.put("k:" + id, await sha256(key), {expirationTtl: TTL * 10});
    // re-save the table so it's no longer open, and its clock restarts under the new controller
    await kv.put("t:" + id, JSON.stringify({state: t.state, at: Date.now(), ctl: String(body.name || "").slice(0, 24)}), {expirationTtl: TTL});
    const q = await getJ(kv, "q:" + id);
    if(q && q.vid === body.vid) await kv.delete("q:" + id);
    return json({ok: true, key, state: t.state});
  }
  return json({error: "bad-action"}, 400);
}
