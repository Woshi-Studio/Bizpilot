// A mailto: link that opens the user's OWN email app (Gmail, Outlook…)
// with To / Subject / Body filled in; they just press send. Free, needs
// no email setup, works for everyone. Safe to use in client components.
export function mailtoHref(to: string | null | undefined, subject = "", body = "") {
  const params = [
    subject && `subject=${encodeURIComponent(subject)}`,
    body && `body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`,
  ].filter(Boolean);
  const addr = to ? encodeURIComponent(to.trim()).replace(/%40/g, "@") : "";
  return `mailto:${addr}${params.length ? `?${params.join("&")}` : ""}`;
}
