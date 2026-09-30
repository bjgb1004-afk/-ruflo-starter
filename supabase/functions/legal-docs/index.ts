// Storage에 저장된 legal HTML 문서를 text/html Content-Type으로 강제 응답한다.
// (Storage의 public object endpoint는 순수 텍스트 파일을 mime-sniffing해서
//  text/plain으로 되돌려버리는 문제가 있어, 헤더를 완전히 제어할 수 있는
//  이 프록시를 통해 서빙한다.)
const DOCS: Record<string, string> = {
  "privacy-policy": "privacy-policy.html",
  "terms-of-service": "terms-of-service.html",
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const slug = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fileName = DOCS[slug];

  if (!fileName) {
    return new Response("Not found", { status: 404 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const res = await fetch(`${supabaseUrl}/storage/v1/object/public/legal/${fileName}`);

  if (!res.ok) {
    return new Response("Not found", { status: 404 });
  }

  const html = await res.text();
  const headers = new Headers();
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(new TextEncoder().encode(html), { headers });
});
