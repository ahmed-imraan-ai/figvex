import { beforeAll, describe, expect, it } from "vitest";
import type { VizInstance } from "../../src/engines/graphviz";
import { renderNetwork } from "../../src/engines/network";
import { isDeviceList, kindOf, networkFromCsv } from "../../src/engines/network/import";
import { parseNetwork } from "../../src/engines/network/model";
import { drawPhysical, parsePhysical, splitPhysical } from "../../src/engines/network/physical";
import type { RenderOptions } from "../../src/engines/types";
import { networkTemplates } from "../../src/templates/network";

beforeAll(async () => {
  // @ts-expect-error: the script ships without type declarations.
  await import("@plantuml/core/viz-global.js");
  await (globalThis as unknown as { Viz: { instance(): Promise<VizInstance> } }).Viz.instance();
});

const NET = `network
switch sw1 "Core"
server web "Web"
pc pc1 "Desk"
sw1 -- web, pc1
rack r1 "Rack A" 12U
  10 sw1
  5-6 web
  1 patch
floor f "Office" 10x6
  room "Main" 0 0 10 6
  sw1 9 1
  pc1 2 4
view all
`;

const physicalOf = (code: string) => {
  const { logical, physical } = splitPhysical(code);
  const net = parseNetwork(logical);
  const warnings: { message: string; line: number }[] = [];
  return { net, phys: parsePhysical(physical, net, warnings), warnings, logical };
};

describe("physical network views", () => {
  it("cuts rack, floor and view lines out, keeping line numbers", () => {
    const { logical, physical } = splitPhysical(NET);
    expect(logical.split("\n")).toHaveLength(NET.split("\n").length);
    expect(logical).not.toMatch(/rack|floor|room|view/);
    expect(physical.map((p) => p.line)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("reads racks and floors that refer to the network's devices", () => {
    const { phys, warnings } = physicalOf(NET);
    expect(warnings).toEqual([]);
    expect(phys.view).toBe("all");
    expect(phys.racks[0]).toMatchObject({ id: "r1", label: "Rack A", units: 12 });
    expect(phys.racks[0].items.map((i) => [i.from, i.to, i.label])).toEqual([[10, 10, "Core"], [5, 6, "Web"], [1, 1, "Patch panel"]]);
    expect(phys.floors[0]).toMatchObject({ w: 10, h: 6 });
    expect(phys.floors[0].places.map((p) => [p.device.id, p.x, p.y])).toEqual([["sw1", 9, 1], ["pc1", 2, 4]]);
  });

  it("warns about overlapping units, units above the top and devices off the floor", () => {
    const { warnings } = physicalOf(`network
switch sw1
server web
sw1 -- web
rack r1 "R" 4U
  2-3 sw1
  3 web
  5 patch
floor f "F" 5x5
  web 7 1
`);
    expect(warnings.map((w) => [w.line, w.message])).toEqual([
      [7, "Units 3 overlap sw1 on line 6."],
      [8, "Unit 5 is above the top of R (4U)."],
      [10, "web is outside F."],
    ]);
  });

  it("explains unknown devices and malformed lines", () => {
    expect(() => physicalOf('network\nswitch sw1\nrack r1 "R" 4U\n  1 nope')).toThrow(/no device called nope/);
    expect(() => physicalOf('network\nswitch sw1\nfloor f "F"\n  sw1 1 1')).toThrow(/24x14/);
    expect(() => physicalOf('network\nswitch sw1\nrack r1 "R" 4U\n  sw1')).toThrow(/Start a rack line with its unit/);
  });

  it("draws racks and floors with cable lengths", () => {
    const { net, phys } = physicalOf(NET);
    const out = drawPhysical(phys, net, false);
    expect(out.svg).toContain("Rack A");
    // sw1 (9, 1) to pc1 (2, 4): 7 across and 3 down.
    expect(out.svg).toContain("≈10 m");
  });

  it("stacks the views, or shows only the physical ones", async () => {
    const opts = { dark: false, netStyle: "tiles" } as RenderOptions;
    const all = await renderNetwork(NET, opts);
    const phys = await renderNetwork(NET.replace("view all", "view physical"), opts);
    expect(all.ok && phys.ok).toBe(true);
    if (all.ok && phys.ok) {
      expect(all.svg).toContain("Rack A");
      expect(all.svg).toMatch(/data-source-line="1"/);
      expect(phys.svg).toContain("Rack A");
      expect(Number(phys.svg.match(/height="([\d.]+)"/)![1])).toBeLessThan(Number(all.svg.match(/height="([\d.]+)"/)![1]));
    }
  });

  it("draws the physical template without warnings", async () => {
    const t = networkTemplates.find((x) => x.id === "net-physical")!;
    const r = await renderNetwork(t.code, { dark: false, netStyle: "tiles" } as RenderOptions);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
  });
});

describe("device list import", () => {
  const CSV = `Hostname,Type,IP Address,Location,Subnet,Uplink
fw-01,Firewall,10.0.0.1,,,
core sw,Switch,10.0.0.2,Server room,10.0.0.0/24,fw-01
web 1,Web server,10.0.0.10,Server room,,core sw
laptop7,Laptop,,Office,,ap1
`;

  it("recognises device lists but not chart data", () => {
    expect(isDeviceList(CSV)).toBe(true);
    expect(isDeviceList("month,sales\nJan,3")).toBe(false);
    expect(isDeviceList("name,value\nA,1")).toBe(false);
  });

  it("guesses device kinds from common words", () => {
    expect(["Firewall", "Core Switch", "Web server", "Access point", "NAS", "Workstation", "thing"].map(kindOf)).toEqual(["firewall", "switch", "server", "ap", "storage", "pc", "server"]);
  });

  it("writes a network that parses, with zones, links and missing uplinks added", () => {
    const text = networkFromCsv(CSV, "Inventory");
    const net = parseNetwork(text);
    expect(net.title).toBe("Inventory");
    expect(net.devices.map((d) => [d.id, d.kind])).toEqual([
      ["fw-01", "firewall"],
      ["ap1", "ap"],
      ["core-sw", "switch"],
      ["web-1", "server"],
      ["laptop7", "laptop"],
    ]);
    expect(net.zones.map((z) => [z.label, z.subnets.map((s) => s.text)])).toEqual([["Server room", ["10.0.0.0/24"]], ["Office", []]]);
    expect(net.links.map((l) => `${l.from.id}-${l.to.id}`)).toEqual(["fw-01-core-sw", "core-sw-web-1", "ap1-laptop7"]);
  });
});
