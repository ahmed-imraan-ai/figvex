import { byId, h, icon } from "../lib/dom";
import { ICONS } from "./icons";

// ---------------------------------------------------------------------------
// Popover: one at a time, anchored under a toolbar button.
// ---------------------------------------------------------------------------

let active: { el: HTMLElement; anchor: HTMLElement; cleanup: () => void } | null = null;

export function closePopover(restoreFocus = false) {
  if (!active) return;
  const { el, anchor, cleanup } = active;
  active = null;
  cleanup();
  el.remove();
  anchor.setAttribute("aria-expanded", "false");
  if (restoreFocus) anchor.focus();
}

export function togglePopover(anchor: HTMLElement, label: string, build: () => HTMLElement) {
  if (active?.anchor === anchor) {
    closePopover(true);
    return;
  }
  closePopover();

  const el = h("div", { class: "popover", role: "dialog", "aria-label": label }, build());
  document.body.append(el);
  anchor.setAttribute("aria-expanded", "true");

  const place = () => {
    const a = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const left = Math.min(Math.max(8, a.right - w), window.innerWidth - w - 8);
    el.style.left = `${left}px`;
    el.style.top = `${a.bottom + 6}px`;
  };
  place();

  const onPointer = (e: PointerEvent) => {
    const target = e.target as Node;
    if (!el.contains(target) && !anchor.contains(target)) closePopover();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePopover(true);
    }
  };
  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", place);

  active = {
    el,
    anchor,
    cleanup: () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
    },
  };

  const first = el.querySelector<HTMLElement>("[autofocus], button, input, select, a[href]");
  first?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export interface ToastOptions {
  error?: boolean;
  action?: { label: string; run: () => void };
  duration?: number;
}

export function toast(message: string, options: ToastOptions = {}) {
  const host = byId("toasts");
  const el = h("div", { class: `toast${options.error ? " is-error" : ""}`, role: options.error ? "alert" : "status" }, message);
  let timer = 0;
  const dismiss = () => {
    window.clearTimeout(timer);
    el.remove();
  };
  if (options.action) {
    const { label, run } = options.action;
    el.append(h("button", { type: "button", onclick: () => (dismiss(), run()) }, label));
  }
  // Keep at most three on screen.
  while (host.children.length >= 3) host.firstElementChild?.remove();
  host.append(el);
  timer = window.setTimeout(dismiss, options.duration ?? (options.action ? 6000 : 2600));
}

// ---------------------------------------------------------------------------
// Modal dialogs built on <dialog>, which gives us focus trapping and Escape.
// ---------------------------------------------------------------------------

export function modal(opts: {
  title: string;
  className?: string;
  headExtra?: HTMLElement;
  body: HTMLElement;
  onClose?: () => void;
}): { dialog: HTMLDialogElement; close: () => void } {
  closePopover();
  const closeBtn = h("button", { class: "icon-btn", type: "button", "aria-label": "Close" }, icon(ICONS.close));
  const dialog = h(
    "dialog",
    { class: `modal ${opts.className ?? ""}`, "aria-label": opts.title },
    h("div", { class: "modal-head" }, h("h2", {}, opts.title), opts.headExtra ?? null, closeBtn),
    h("div", { class: "modal-body" }, opts.body),
  );
  const close = () => dialog.close();
  closeBtn.addEventListener("click", close);
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close(); // backdrop
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    opts.onClose?.();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}
