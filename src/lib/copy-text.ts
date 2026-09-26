// Copy text to the clipboard, in the browser. Returns true only when the
// text really went to the clipboard.
//
// 1. navigator.clipboard.writeText: needs a secure page (https or
//    localhost) and a click; some browsers (Brave shields, in-app browsers,
//    older iOS) refuse it or leave it undefined.
// 2. Fallback: put the text in a hidden textarea, select it, and run
//    document.execCommand("copy") — old, but still works where (1) doesn't.
// If both fail, the caller shows the link in a box to copy by hand.

export async function copyText(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the old way
  }
  return copyWithSelection(text);
}

function copyWithSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  // Off screen but still selectable; 16px stops iOS zooming in.
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  area.style.fontSize = "16px";
  document.body.appendChild(area);
  const active = document.activeElement as HTMLElement | null;
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
    active?.focus?.();
  }
}
