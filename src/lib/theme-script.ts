// Runs in <head> before the page paints, so there is no light flash.
// Reads the saved choice (localStorage "jephelen-theme": "light" | "dark",
// missing = follow the system) and sets the `dark` class on <html>.
export const THEME_KEY = "jephelen-theme";

export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_KEY}');var d=c==='dark'||(c!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
