// Google Analytics, loaded only after the visitor allows it. Builds without
// an ID (staging, local, Docker) never load it or ask.
//
// Share links carry the whole diagram after the "#", so the page address is
// sent without it.

export type AnalyticsChoice = "ask" | "on" | "off";

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } & Record<string, unknown>;

let loaded = "";

/** Starts or stops Analytics to match the visitor's choice. */
export function applyAnalytics(id: string, choice: AnalyticsChoice) {
  if (!id) return;
  const w = window as unknown as GtagWindow;
  // Google's own switch: with it set, gtag.js sends nothing.
  w[`ga-disable-${id}`] = choice !== "on";
  if (choice === "on") load(id, w);
  else if (choice === "off") clearCookies();
}

function load(id: string, w: GtagWindow) {
  if (loaded === id) return;
  loaded = id;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() {
    // gtag.js expects the arguments object itself, not an array.
    w.dataLayer!.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", id, { page_location: location.origin + location.pathname + location.search });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);
}

/** Removes the _ga cookies, set on this host or a parent domain. */
function clearCookies() {
  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
  if (!names.length) return;
  const parts = location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join(".")}`);
  for (const name of names)
    for (const domain of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
}
