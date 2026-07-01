/* Cloudflare Worker — 静的アセット配信 ＋ Google Maps 中継。
   Google Maps APIキーは「シークレット MAPS_KEY」としてサーバー側だけに保持し、
   ブラウザにもリポジトリにも出さない（利用者はキー設定不要）。
     GET /api/geocode?address=...     住所 → 座標 {lat,lng}
     GET /api/staticmap?...           静的地図画像（キーをサーバー側で付与して中継）
     それ以外                          静的ファイル（env.ASSETS） */
const GBASE = "https://maps.googleapis.com/maps/api";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 住所 → 座標
    if (path === "/api/geocode") {
      const address = (url.searchParams.get("address") || "").trim();
      if (!address) return json({ status: "NO_ADDRESS" }, 400);
      if (!env.MAPS_KEY) return json({ status: "NO_KEY" }, 500);
      const g = new URL(GBASE + "/geocode/json");
      g.searchParams.set("address", address);
      g.searchParams.set("region", "jp");
      g.searchParams.set("language", "ja");
      g.searchParams.set("key", env.MAPS_KEY);
      try {
        const res = await fetch(g.toString());
        const d = await res.json();
        if (d.status === "OK" && d.results && d.results[0]) {
          const loc = d.results[0].geometry.location;
          return json({ status: "OK", lat: loc.lat, lng: loc.lng });
        }
        return json({ status: d.status || "ERROR" });
      } catch (e) {
        return json({ status: "FETCH_ERROR" }, 502);
      }
    }

    // 静的地図画像（マーカー・パス・航空写真など。クエリをそのまま転送し、キーだけ付与）
    if (path === "/api/staticmap") {
      if (!env.MAPS_KEY) return new Response("NO_KEY", { status: 500 });
      const g = new URL(GBASE + "/staticmap");
      for (const [k, v] of url.searchParams) g.searchParams.append(k, v);
      g.searchParams.set("key", env.MAPS_KEY);
      try {
        const res = await fetch(g.toString());
        const headers = new Headers();
        headers.set("Content-Type", res.headers.get("Content-Type") || "image/png");
        headers.set("Cache-Control", "public, max-age=86400");
        return new Response(res.body, { status: res.status, headers });
      } catch (e) {
        return new Response("FETCH_ERROR", { status: 502 });
      }
    }

    // 上記以外は静的ファイル（index.html / sw.js / アイコン等）
    // CloudflareのOrigin Cache Controlが無効だと must-revalidate が無視され、
    // エッジに古いHTMLが残り続ける事故が起きたため、no-storeを強制して常に最新を配信する。
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(res.body, { status: res.status, headers });
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
