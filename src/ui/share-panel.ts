import { plantumlServerUrl } from "../engines/plantuml";
import { ENGINE_FENCE, type Engine } from "../engines/types";
import { copyText, h, icon } from "../lib/dom";
import { markdownBlock, shareUrl } from "../share";
import { ICONS } from "./icons";
import { closePopover, toast } from "./overlay";

export interface ShareContext {
  title: string;
  engine: Engine;
  code: string;
}

export function buildSharePanel(ctx: ShareContext): HTMLElement {
  const linkInput = h("input", { class: "field", type: "text", readonly: true, "aria-label": "Share link", value: "Preparing link…" });
  const copyLink = h("button", { class: "btn btn-ink", type: "button", disabled: true }, "Copy");
  const lengthNote = h("p", { class: "panel-hint" });

  shareUrl(ctx).then((url) => {
    linkInput.value = url;
    copyLink.disabled = false;
    lengthNote.textContent =
      url.length > 8000
        ? `This link is ${url.length.toLocaleString()} characters long. Some chat apps cut long links, so you may want to send the file instead.`
        : "Anyone with the link sees a copy of this diagram. The diagram is stored inside the link, so nothing is uploaded.";
  });

  copyLink.addEventListener("click", async () => {
    await copyText(linkInput.value);
    toast("Link copied");
    closePopover();
  });
  linkInput.addEventListener("focus", () => linkInput.select());

  const items: HTMLElement[] = [
    h(
      "li",
      {},
      h(
        "button",
        {
          type: "button",
          onclick: async () => {
            await copyText(markdownBlock(ctx.engine, ctx.code));
            toast("Markdown copied");
            closePopover();
          },
        },
        icon(ICONS.markdown),
        h(
          "span",
          {},
          "Copy as Markdown code block",
          h(
            "span",
            { class: "menu-sub" },
            ctx.engine === "mermaid"
              ? "Renders on GitHub and GitLab as a `mermaid` block"
              : `A \`${ENGINE_FENCE[ctx.engine]}\` block for README files and notes`,
          ),
        ),
      ),
    ),
  ];

  if (ctx.engine === "plantuml") {
    items.push(
      h(
        "li",
        {},
        h(
          "button",
          {
            type: "button",
            onclick: async () => {
              const url = await plantumlServerUrl(ctx.code, "svg");
              await copyText(`![${ctx.title.replace(/[[\]]/g, "")}](${url})`);
              toast("Image link copied");
              closePopover();
            },
          },
          icon(ICONS.image),
          h(
            "span",
            {},
            "Copy plantuml.com image link",
            h("span", { class: "menu-sub" }, "A Markdown image served by the public PlantUML server"),
          ),
        ),
      ),
    );
  }

  return h(
    "div",
    {},
    h(
      "div",
      { class: "panel-section" },
      h("h3", { class: "panel-title" }, "Link"),
      h("div", { class: "link-field" }, linkInput, copyLink),
      lengthNote,
    ),
    h("div", { class: "panel-section", style: "padding:8px" }, h("ul", { class: "menu-list" }, items)),
  );
}
