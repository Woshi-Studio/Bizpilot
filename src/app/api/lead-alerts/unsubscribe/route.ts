import { checkUnsubscribe, unsubscribeUser } from "@/lib/lead-alerts-server";

// The link at the bottom of a lead-alert email. GET shows a button (mail
// scanners open links, so a GET never changes anything); POST switches the
// emails off. The link is signed per user (src/lib/lead-alerts.ts).

export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:48px 16px}main{max-width:420px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px}button{background:#0f172a;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-size:15px;cursor:pointer}p{line-height:1.5}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function params(request: Request) {
  const url = new URL(request.url);
  return { u: url.searchParams.get("u") ?? "", t: url.searchParams.get("t") ?? "" };
}

export async function GET(request: Request) {
  const { u, t } = params(request);
  if (!checkUnsubscribe(u, t)) return page("Link not valid", "<h1>That link isn't valid</h1><p>Change lead alerts in Jephelen under Settings.</p>", 400);
  return page(
    "Stop lead alert emails",
    `<h1>Stop lead alert emails?</h1><p>You'll stop getting the daily "new leads" email. You can switch it back on in Settings any time.</p><form method="post"><button type="submit">Stop the emails</button></form>`
  );
}

export async function POST(request: Request) {
  const { u, t } = params(request);
  if (!checkUnsubscribe(u, t)) return page("Link not valid", "<h1>That link isn't valid</h1>", 400);
  const next = await unsubscribeUser(u);
  if (!next) return page("Try again", "<h1>That didn't work</h1><p>Please try again in a minute, or change it in Settings.</p>", 500);
  return page("Done", "<h1>Done</h1><p>No more lead alert emails. You can switch them back on in Settings → Lead alerts.</p>");
}
