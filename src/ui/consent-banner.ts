import { h } from "../lib/dom";
import { store } from "../store";

/**
 * Asks once whether Google Analytics may run. The answer is saved in the
 * settings, where it can be changed later.
 */
export function showConsentBanner() {
  const answer = (choice: "on" | "off") => store.setSettings({ analytics: choice });
  const banner = h(
    "section",
    { class: "consent", "aria-label": "Analytics" },
    h(
      "p",
      {},
      "Can Figvex count your visit with Google Analytics? It sets cookies and sends the page address and basic browser details to Google. Your diagrams are never sent. You can change this later in Settings.",
    ),
    h(
      "div",
      { class: "consent-actions" },
      h("button", { type: "button", class: "btn btn-outline", onclick: () => answer("off") }, "Don't allow"),
      h("button", { type: "button", class: "btn btn-outline", onclick: () => answer("on") }, "Allow"),
    ),
  );
  document.body.append(banner);
  // Answered here or in Settings.
  const stop = store.subscribe(() => {
    if (store.settings.analytics === "ask") return;
    stop();
    banner.remove();
  });
}
