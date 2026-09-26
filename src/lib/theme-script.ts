// Runs in <head> before the page paints, so there is no flash.
// Reads the saved choice (localStorage "jephelen-theme": "clean" | "dark"
// | "neon" | "retro"; old value "light" = clean; missing = follow the
// system: clean or dark) and sets, on <html>:
//   - data-theme="<theme>"
//   - class "dark" for every dark-based theme (dark, neon, retro)
// The signed-in user's saved theme (profiles.theme) is applied again by
// <ThemeSync> once the page loads, so it follows them across devices.
export const THEME_KEY = "jephelen-theme";

export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_KEY}');if(c==='light')c='clean';var t=(c==='clean'||c==='dark'||c==='neon'||c==='retro')?c:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'clean');var h=document.documentElement;h.classList.toggle('dark',t!=='clean');h.setAttribute('data-theme',t);}catch(e){}})();`;
