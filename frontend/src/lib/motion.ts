/**
 * Motion preference. The operating system's setting is the default; visitors can
 * override it with the Motion switch (or ?motion=on / ?motion=off in the address).
 */
const KEY = "neurasim.motion";

function stored(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("motion");
    if (fromUrl === "on" || fromUrl === "off") localStorage.setItem(KEY, fromUrl);
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const choice = stored();
const reduced = choice ? choice === "off" : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
document.documentElement.dataset.motion = reduced ? "off" : "on";

export const prefersReducedMotion = () => reduced;

/** Animations are set up on mount, so switching reloads the page. */
export function setMotion(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable: the system setting stays in force */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("motion");
  window.location.replace(url);
}
