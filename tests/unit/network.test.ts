import { beforeAll, describe, expect, it } from "vitest";
import { detectEngine } from "../../src/engines/detect";
import type { VizInstance } from "../../src/engines/graphviz";
import { contains, formatAddress, lastOf, looksLikeAddress, overlaps, parseAddress, subnetText, type Address } from "../../src/engines/network/address";
import { checkNetwork, NetworkError, parseNetwork } from "../../src/engines/network/model";
import { drawNetwork, layoutNetwork, type NetStyle } from "../../src/engines/network/render";
import { TEMPLATES } from "../../src/templates";

let viz: VizInstance;
beforeAll(async () => {
  // @ts-expect-error: the script ships without type declarations.
  await import("@plantuml/core/viz-global.js");
  viz = await (globalThis as unknown as { Viz: { instance(): Promise<VizInstance> } }).Viz.instance();
});

const addr = (text: string) => parseAddress(text) as Address;

const errorOf = (code: string): NetworkError => {
  try {
    parseNetwork(code);
  } catch (err) {
    if (err instanceof NetworkError) return err;
    throw err;
  }
  throw new Error("expected a NetworkError");
};

const warningsOf = (code: string) => checkNetwork(parseNetwork(code));

describe("addresses", () => {
  it("parses IPv4 and IPv6, with and without prefixes", () => {
    expect(addr("10.0.1.5/24")).toMatchObject({ family: 4, value: 0x0a000105n, prefix: 24 });
    expect(addr("2001:db8::1")).toMatchObject({ family: 6, prefix: undefined });
    expect(formatAddress(addr("2001:db8:0:0:0:0:0:1").value, 6)).toBe("2001:db8::1");
    expect(formatAddress(addr("::ffff:192.0.2.1").value, 6)).toBe("::ffff:c000:201");
    expect(formatAddress(addr("fe80::").value, 6)).toBe("fe80::");
  });

  it("explains malformed addresses", () => {
    expect(parseAddress("10.0.1.300")).toMatch(/300 is more than 255/);
    expect(parseAddress("10.0.1")).toMatch(/four numbers/);
    expect(parseAddress("10.0.0.0/33")).toMatch(/\/0 to \/32/);
    expect(parseAddress("2001:db8::1::2")).toMatch(/only once/);
    expect(parseAddress("2001:db8:zz::1")).toMatch(/hex digits/);
  });

  it("does subnet arithmetic", () => {
    expect(contains(addr("192.168.1.0/24"), addr("192.168.1.77"))).toBe(true);
    expect(contains(addr("192.168.1.0/24"), addr("192.168.2.1"))).toBe(false);
    expect(contains(addr("2001:db8::/32"), addr("2001:db8:5::1"))).toBe(true);
    expect(overlaps(addr("10.0.0.0/16"), addr("10.0.5.0/24"))).toBe(true);
    expect(overlaps(addr("10.0.0.0/25"), addr("10.0.0.128/25"))).toBe(false);
    expect(formatAddress(lastOf(addr("192.168.10.128/26")), 4)).toBe("192.168.10.191");
    expect(subnetText(addr("10.0.1.5/24"))).toBe("10.0.1.0/24");
  });

  it("tells addresses from other words", () => {
    expect(looksLikeAddress("10.0.0.1")).toBe(true);
    expect(looksLikeAddress("10.0.1")).toBe(true);
    expect(looksLikeAddress("fe80::1/64")).toBe(true);
    expect(looksLikeAddress("x12")).toBe(false);
    expect(looksLikeAddress("sw1")).toBe(false);
  });
});

const SAMPLE = `network
title "Office"
direction right
internet
router edge "Edge router" 203.0.113.2/30 10.0.0.1 # the gateway
zone lan "Office LAN" 10.0.0.0/24 vlan 10
  switch sw1 "Core switch" 10.0.0.2
  pc desks "Desk PCs" x12 "Floor 2"
  zone voice 10.0.0.128/25 vlan 20
    phone ph1 10.0.0.130 vlan 20
internet -- edge "100 Mbps"
edge:ge0 == sw1:ge0/1 "trunk" vlan 10, 20
sw1 -- desks, ph1
sw1 ~~ ph1
`;

describe("parseNetwork", () => {
  it("reads settings, devices, zones and links", () => {
    const net = parseNetwork(SAMPLE);
    expect(net).toMatchObject({ title: "Office", direction: "right", lines: "straight", checks: true });
    expect(net.devices.map((d) => d.id)).toEqual(["internet", "edge", "sw1", "desks", "ph1"]);
    expect(net.devices[0]).toMatchObject({ kind: "internet", label: "Internet" });
    expect(net.devices[1].addresses.map((a) => a.text)).toEqual(["203.0.113.2/30", "10.0.0.1"]);
    expect(net.devices[3]).toMatchObject({ count: 12, note: "Floor 2", label: "Desk PCs" });
    const [lan] = net.zones;
    expect(lan).toMatchObject({ id: "lan", label: "Office LAN", vlan: 10 });
    expect(lan.devices.map((d) => d.id)).toEqual(["sw1", "desks"]);
    expect(lan.zones[0]).toMatchObject({ id: "voice", label: "voice", vlan: 20 });
    expect(net.devices[4].zone).toBe(lan.zones[0]);
    expect(net.links).toHaveLength(5);
    expect(net.links[1]).toMatchObject({ style: "trunk", fromPort: "ge0", toPort: "ge0/1", label: "trunk", vlans: [10, 20], line: 12 });
    expect(net.links[4].style).toBe("wireless");
  });

  it("explains mistakes with the line", () => {
    expect(errorOf("router r1").message).toMatch(/starts with the word "network"/);
    expect(errorOf("network\nrouterr r1")).toMatchObject({ line: 2, message: expect.stringMatching(/did you mean router/) });
    expect(errorOf("network\nrouter")).toMatchObject({ line: 2, message: expect.stringMatching(/short name/) });
    expect(errorOf("network\nrouter r1\nswitch r1")).toMatchObject({ line: 3, message: expect.stringMatching(/two devices called "r1"/) });
    expect(errorOf("network\nrouter r1 10.0.0.256")).toMatchObject({ line: 2, message: expect.stringMatching(/256 is more than 255/) });
    expect(errorOf("network\nzone lan 10.0.0.0")).toMatchObject({ line: 2, message: expect.stringMatching(/with a prefix/) });
    expect(errorOf("network\nzone lan vlan 5000")).toMatchObject({ message: expect.stringMatching(/1 to 4094/) });
    expect(errorOf("network\nrouter r1\nr1 -- r2")).toMatchObject({ line: 3, message: expect.stringMatching(/no device called "r2"/) });
    expect(errorOf("network\nzone lan\n  pc p\np -- lan")).toMatchObject({ message: expect.stringMatching(/is a zone/) });
    expect(errorOf("network\nrouter r1\nr1 -- r1")).toMatchObject({ message: expect.stringMatching(/linked to itself/) });
    expect(errorOf("network\nrouter r1 fast")).toMatchObject({ message: expect.stringMatching(/"fast" isn't part of a device line/) });
    expect(errorOf("network\nlines wavy\nrouter r1")).toMatchObject({ line: 2 });
    expect(errorOf("network\n")).toMatchObject({ message: expect.stringMatching(/Add a device/) });
  });

  it("keeps # inside labels and strips comments", () => {
    const net = parseNetwork('network\nserver s1 "Rack #3" # spare\n# a comment\n');
    expect(net.devices[0].label).toBe("Rack #3");
  });
});

describe("checkNetwork", () => {
  it("passes a clean network", () => {
    expect(warningsOf(SAMPLE)).toEqual([]);
  });

  it("flags addresses outside their zone, duplicates and reserved addresses", () => {
    const w = warningsOf(`network
zone lan "LAN" 192.168.1.0/24
  pc a 192.168.2.10
  pc b 192.168.1.0
  pc c 192.168.1.255
  pc d 192.168.1.20/16
  pc e 192.168.1.30
  pc f 192.168.1.30
`);
    expect(w.map((x) => x.line)).toEqual([3, 4, 5, 6, 8]);
    expect(w[0].message).toMatch(/192.168.2.10 isn't in LAN/);
    expect(w[1].message).toMatch(/network address/);
    expect(w[2].message).toMatch(/broadcast address/);
    expect(w[3].message).toMatch(/\/16 prefix/);
    expect(w[4].message).toMatch(/used by both e and f/);
  });

  it("flags zone mistakes: host bits, overlaps, nesting and VLANs", () => {
    const w = warningsOf(`network
zone a "A" 10.0.0.5/24 vlan 10
  pc p1
zone b "B" 10.0.0.128/25 vlan 10
  zone c "C" 10.9.0.0/24
    pc p2
`);
    expect(w.map((x) => x.message)).toEqual([
      expect.stringMatching(/host bits set. The subnet is 10.0.0.0\/24/),
      expect.stringMatching(/B \(10.0.0.128\/25\) overlaps A/),
      expect.stringMatching(/VLAN 10 is used by both A and B/),
      expect.stringMatching(/C's subnet 10.9.0.0\/24 isn't inside B/),
    ]);
  });

  it("allows the same VLAN at different sites", () => {
    const code = `network
zone hq "HQ"
  zone l1 "LAN" 10.1.0.0/24 vlan 10
    pc a
zone br "Branch"
  zone l2 "LAN" 10.2.0.0/24 vlan 10
    pc b
`;
    expect(warningsOf(code)).toEqual([]);
  });

  it("flags unlinked devices and VLAN mismatches", () => {
    const w = warningsOf("network\nzone v vlan 20\n  phone p vlan 30\nrouter r\nswitch s\nr -- s\n");
    expect(w.map((x) => x.message)).toEqual([expect.stringMatching(/p is on VLAN 30, but v is VLAN 20/), expect.stringMatching(/p isn't linked/)]);
  });

  it("finds the deliberate mistake in the subnetting template", () => {
    const t = TEMPLATES.find((x) => x.id === "net-subnetting")!;
    const w = checkNetwork(parseNetwork(t.code));
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/hr1: 192.168.10.191 is the broadcast address of 192.168.10.128\/26/);
  });
});

describe("layout and drawing", () => {
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("keeps devices apart and inside their zones", () => {
    for (const extra of ["", "direction right\n"]) {
      const net = parseNetwork(SAMPLE.replace("direction right\n", extra));
      const lay = layoutNetwork(net, viz);
      const boxes = [...lay.devices.values()];
      expect(boxes).toHaveLength(net.devices.length);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j])).toBe(false);
      for (const d of net.devices) {
        if (!d.zone) continue;
        const z = lay.zones.get(d.zone)!;
        const b = lay.devices.get(d)!;
        expect(b.x).toBeGreaterThanOrEqual(z.x);
        expect(b.y).toBeGreaterThanOrEqual(z.y);
        expect(b.x + b.w).toBeLessThanOrEqual(z.x + z.w + 0.5);
        expect(b.y + b.h).toBeLessThanOrEqual(z.y + z.h + 0.5);
      }
    }
  });

  it("draws valid SVG in every style and line mode, with click-to-source lines", () => {
    const net = parseNetwork(SAMPLE);
    for (const lines of ["straight", "curved", "square"] as const) {
      net.lines = lines;
      const lay = layoutNetwork(net, viz);
      for (const style of ["tiles", "outline", "mono"] as NetStyle[]) {
        for (const dark of [false, true]) {
          const svg = drawNetwork(net, lay, { dark, style, warnings: [{ line: 7, message: "x" }] });
          expect(new DOMParser().parseFromString(svg, "image/svg+xml").getElementsByTagName("parsererror")).toHaveLength(0);
          expect(svg).toContain('data-source-line="6" data-qualified-name="sw1"');
          expect(svg).toContain("ge0/1");
          expect(svg).toContain("VLAN 10, 20");
          expect(svg).toContain("×12");
        }
      }
    }
  });

  it("marks devices that have warnings", () => {
    const net = parseNetwork(SAMPLE);
    const lay = layoutNetwork(net, viz);
    const plain = drawNetwork(net, lay, { dark: false, style: "tiles" });
    const marked = drawNetwork(net, lay, { dark: false, style: "tiles", warnings: [{ line: 7, message: "x" }] });
    expect(marked.length).toBeGreaterThan(plain.length);
    expect(marked).toContain(">!</text>");
  });
});

describe("templates and detection", () => {
  it("detects network diagrams", () => {
    expect(detectEngine("network\nrouter r1")).toBe("network");
    expect(detectEngine("# office\nnetwork\n")).toBeNull();
  });

  it.each(TEMPLATES.filter((t) => t.engine === "network").map((t) => [t.id, t] as const))("%s parses and draws", (id, t) => {
    const net = parseNetwork(t.code);
    if (id !== "net-subnetting") expect(checkNetwork(net)).toEqual([]);
    expect(drawNetwork(net, layoutNetwork(net, viz), { dark: false, style: "tiles" }).startsWith("<svg")).toBe(true);
  });
});
