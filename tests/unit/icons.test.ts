import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { iconLabel, insertIcon, searchIcons, type IconIndex } from "../../src/engines/icon-insert";

const index = JSON.parse(readFileSync("public/icon-index.json", "utf8")) as IconIndex;
const aws = index.libraries.find((l) => l.id === "awslib14")!;
const ec2 = index.icons.find((i) => i[2] === "EC2")!;

describe("cloud icon index", () => {
  it("lists icons from all four libraries", () => {
    expect(index.libraries.map((l) => l.label)).toEqual(["AWS", "Azure", "Google Cloud", "Kubernetes"]);
    for (const l of index.libraries) expect(index.icons.filter((i) => i[0] === l.id).length, l.id).toBeGreaterThan(30);
    expect(index.icons.some((i) => i[1].endsWith("/all"))).toBe(false);
  });

  it("finds icons by name, words and library", () => {
    expect(searchIcons(index, "ec2")[0][2]).toBe("EC2");
    expect(searchIcons(index, "pod")[0][2]).toBe("KubernetesPod");
    expect(searchIcons(index, "bigquery")[0][2]).toBe("BigQuery");
    expect(searchIcons(index, "azure cosmos").map((i) => i[2])).toContain("AzureCosmosDb");
    expect(searchIcons(index, "zzzz")).toEqual([]);
  });

  it("turns macro names into labels", () => {
    expect(iconLabel("Compute_Engine")).toBe("Compute Engine");
    expect(iconLabel("AzureVirtualMachine")).toBe("Azure Virtual Machine");
    expect(iconLabel("EC2AutoScaling")).toBe("EC2 Auto Scaling");
  });
});

describe("inserting an icon", () => {
  it("adds both includes after @startuml and the macro after the cursor", () => {
    const out = insertIcon("@startuml\nactor User\n@enduml", 2, aws, ec2);
    expect(out.code).toBe('@startuml\n!include <awslib14/AWSCommon>\n!include <awslib14/compute/ec2>\nactor User\nEC2(ec2, "EC2", "AWS")\n@enduml');
    expect(out.code.split("\n")[out.line - 1]).toBe('EC2(ec2, "EC2", "AWS")');
  });

  it("doesn't repeat includes, and picks a fresh alias", () => {
    const first = insertIcon("@startuml\n@enduml", 1, aws, ec2);
    const second = insertIcon(first.code, first.line, aws, ec2);
    expect(second.code.match(/!include <awslib14\/AWSCommon>/gi)).toHaveLength(1);
    expect(second.code).toContain('EC2(ec22, "EC2", "AWS")');
    expect(second.code.split("\n").at(-1)).toBe("@enduml");
  });

  it("keeps the macro inside the diagram when the cursor is outside it", () => {
    const out = insertIcon("' notes\n@startuml\nA -> B\n@enduml\n", 1, aws, ec2);
    const lines = out.code.split("\n");
    expect(lines.indexOf('EC2(ec2, "EC2", "AWS")')).toBeGreaterThan(lines.findIndex((l) => l.startsWith("!include <awslib14/compute")));
    expect(lines.indexOf('EC2(ec2, "EC2", "AWS")')).toBeLessThan(lines.indexOf("@enduml"));
  });
});
