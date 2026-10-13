import { describe, expect, it } from "vitest";
import { dotLabel, renameDotNode } from "../../src/engines/graphviz-edit";
import { isFlowchart, mermaidLabel, renameMermaidNode } from "../../src/engines/mermaid-edit";
import { addLinkedDevice, labelOf, lineKind, removeDevice, removeLink, setLabel } from "../../src/engines/network/edit";
import { checkNetwork, parseNetwork } from "../../src/engines/network/model";
import { addReport, personText, removePerson, renamePerson } from "../../src/engines/orgchart/edit";
import { parseOrgChart } from "../../src/engines/orgchart/model";

const ORG = `orgchart
title "Acme"
Jane Smith: Chief Executive [Exec]
  + Lee Park: Assistant
  Ravi Patel: CTO [Engineering] # hired 2024
    Ana Lopez #ana: Manager
      Tom Reed: Developer
  Mia Chen: CFO
Ravi Patel .. Mia Chen "budget"
ana .. Mia Chen
`;

describe("org chart edits", () => {
  it("shows and renames a person, keeping id, department and comment", () => {
    expect(personText(ORG, 5)).toBe("Ravi Patel: CTO");
    const out = renamePerson(ORG, 5, "Ravi Kumar: Chief Technology Officer");
    expect(out.split("\n")[4]).toBe("  Ravi Kumar: Chief Technology Officer [Engineering] # hired 2024");
    expect(out.split("\n")[8]).toBe('Ravi Kumar .. Mia Chen "budget"');
    expect(parseOrgChart(out).dotted).toHaveLength(2);
    expect(renamePerson(ORG, 6, "Ana Diaz").split("\n")[5]).toBe("    Ana Diaz #ana: Manager");
  });

  it("keeps the title when only a name is typed, and ignores an empty name", () => {
    expect(renamePerson(ORG, 8, "Mia Wong").split("\n")[7]).toBe("  Mia Wong: CFO");
    expect(renamePerson(ORG, 8, "  ")).toBe(ORG);
  });

  it("adds a report at the end of a person's team, indented like the others", () => {
    const added = addReport(ORG, 5)!;
    expect(added.line).toBe(8);
    expect(added.code.split("\n")[7]).toBe("    New person: Job title");
    const chart = parseOrgChart(added.code);
    expect(chart.roots[0].children[0].children.map((p) => p.name)).toEqual(["Ana Lopez", "New person"]);
    // A person with no reports gets one, one step further in.
    const leaf = addReport(added.code, 7)!;
    expect(leaf.code.split("\n")[leaf.line - 1]).toBe("        New person 2: Job title");
    expect(addReport(ORG, 4)).toBeNull(); // assistants don't have reports
  });

  it("removes a person, moving their team up and dropping their dotted lines", () => {
    const out = removePerson(ORG, 5)!;
    const chart = parseOrgChart(out);
    expect(chart.roots[0].children.map((p) => p.name)).toEqual(["Ana Lopez", "Mia Chen"]);
    expect(chart.roots[0].children[0].children[0].name).toBe("Tom Reed");
    expect(chart.dotted).toHaveLength(1);
    // By id too.
    expect(parseOrgChart(removePerson(ORG, 6)!).dotted).toHaveLength(1);
  });

  it("turns the top person's assistants into people when the top person goes", () => {
    const out = removePerson(ORG, 3)!;
    expect(parseOrgChart(out).roots.map((p) => p.name)).toEqual(["Lee Park", "Ravi Patel", "Mia Chen"]);
    expect(removePerson("orgchart\nSolo: Founder\n", 2)).toBeNull();
  });
});

const NET = `network
internet
router edge "Edge" 203.0.113.2
zone lan "Office LAN" 10.0.0.0/24
  switch sw1 10.0.0.2 # core
  pc pc1 "PC" 10.0.0.10
internet -- edge
edge -- sw1 vlan 10
sw1 -- pc1, edge:ge2 "uplink"
`;

describe("network edits", () => {
  it("knows device, zone and link lines", () => {
    expect([2, 3, 4, 5, 7, 8].map((l) => lineKind(NET.split("\n")[l - 1]))).toEqual(["device", "device", "zone", "device", "link", "link"]);
  });

  it("shows and sets labels, adding one where there's none", () => {
    expect(labelOf(NET, 3)).toBe("Edge");
    expect(labelOf(NET, 5)).toBe("sw1");
    expect(setLabel(NET, 3, 'Edge "A"').split("\n")[2]).toBe('router edge "Edge \\"A\\"" 203.0.113.2');
    expect(setLabel(NET, 5, "Core switch").split("\n")[4]).toBe('  switch sw1 "Core switch" 10.0.0.2 # core');
    expect(setLabel(NET, 2, "The internet").split("\n")[1]).toBe('internet "The internet"');
    expect(setLabel(NET, 4, "LAN").split("\n")[3]).toBe('zone lan "LAN" 10.0.0.0/24');
    expect(setLabel(NET, 8, "trunk").split("\n")[7]).toBe('edge -- sw1 "trunk" vlan 10');
    expect(setLabel(NET, 9, "fibre").split("\n")[8]).toBe('sw1 -- pc1, edge:ge2 "fibre"');
    expect(parseNetwork(setLabel(NET, 2, "The internet")).devices[0].label).toBe("The internet");
  });

  it("adds a linked device in the same zone", () => {
    const added = addLinkedDevice(NET, 5)!;
    const lines = added.code.split("\n");
    expect(lines[added.line - 1]).toBe('  pc pc2 "PC"');
    expect(lines).toContain("sw1 -- pc2");
    const net = parseNetwork(added.code);
    expect(net.devices.find((d) => d.id === "pc2")!.zone!.id).toBe("lan");
    expect(checkNetwork(net).filter((w) => /isn't linked/.test(w.message))).toEqual([]);
  });

  it("removes a device with its links, and a link on its own", () => {
    const out = removeDevice(NET, 3)!;
    expect(out).not.toMatch(/edge/);
    expect(out).toContain('sw1 -- pc1 "uplink"\n');
    expect(parseNetwork(out).links).toHaveLength(1);
    expect(removeLink(NET, 8)!.split("\n")).not.toContain("edge -- sw1 vlan 10");
    expect(removeLink(NET, 3)).toBeNull();
  });
});

const DOT = `digraph G {
  node [shape=box]
  a [label="Start" color=red]
  b [color=blue]
  "my node"
  a -> b -> "my node" -> c
}
`;

describe("Graphviz rename", () => {
  it("changes an existing label", () => {
    expect(dotLabel(DOT, "a")).toBe("Start");
    expect(renameDotNode(DOT, "a", 'Go "now"')).toContain('a [label="Go \\"now\\"" color=red]');
  });

  it("adds a label to a node statement without one", () => {
    expect(dotLabel(DOT, "b")).toBe("b");
    expect(renameDotNode(DOT, "b", "Next")).toContain('b [label="Next" color=blue]');
  });

  it("adds a statement at the end for a node that only appears in edges", () => {
    const out = renameDotNode(DOT, "c", "End");
    expect(out.endsWith('  c [label="End"]\n}\n')).toBe(true);
    expect(renameDotNode(DOT, "my node", "Mine")).toContain('"my node" [label="Mine"]');
  });

  it("doesn't touch edge attribute lists", () => {
    const code = "digraph { a -> b [label=x] }";
    expect(renameDotNode(code, "b", "B")).toBe('digraph { a -> b [label=x]\n  b [label="B"]\n}');
  });
});

const MMD = `flowchart TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C(("Done [ok]"))
    B --> D
    style D fill:#f9f
`;

describe("Mermaid rename", () => {
  it("only renames flowcharts", () => {
    expect(isFlowchart(MMD)).toBe(true);
    expect(isFlowchart("sequenceDiagram\nA->>B: hi")).toBe(false);
  });

  it("rewrites the text inside the brackets, quoting when needed", () => {
    expect(mermaidLabel(MMD, "B")).toBe("Is it working?");
    expect(renameMermaidNode(MMD, "A", "Begin")).toContain("A[Begin] -->");
    expect(renameMermaidNode(MMD, "B", "Works (now)?")).toContain('B{"Works (now)?"}');
    expect(mermaidLabel(MMD, "C")).toBe("Done [ok]");
    expect(renameMermaidNode(MMD, "C", "Finished")).toContain('C(("Finished"))');
  });

  it("gives a bare node square brackets where it first appears", () => {
    const out = renameMermaidNode(MMD, "D", "Debug");
    expect(out).toContain("B --> D[Debug]");
    expect(out).toContain("style D fill");
  });
});
