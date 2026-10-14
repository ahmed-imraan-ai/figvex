import { beforeAll, describe, expect, it } from "vitest";
import { detectEngine, diagramKind } from "../../src/engines/detect";
import type { VizInstance } from "../../src/engines/graphviz";
import { parseSql, SqlError, tokenize, visibleTables } from "../../src/engines/sql/model";
import { drawSql, groupOf, layoutSql, spreadEnds } from "../../src/engines/sql/render";
import { sqlTemplates } from "../../src/templates/sql";

let viz: VizInstance;

beforeAll(async () => {
  // @ts-expect-error: the script ships without type declarations.
  await import("@plantuml/core/viz-global.js");
  viz = await (globalThis as unknown as { Viz: { instance(): Promise<VizInstance> } }).Viz.instance();
});

const SHOP = `-- title: Shop
CREATE TABLE customers (
  id serial PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  note text
);
CREATE TABLE orders (
  id int NOT NULL,
  customer_id int NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  gift_for int REFERENCES customers,
  total numeric(10, 2) DEFAULT 0 NOT NULL,
  CONSTRAINT pk_orders PRIMARY KEY (id)
);
CREATE TABLE invoices (
  order_id int PRIMARY KEY REFERENCES orders (id),
  issued date
);
`;

describe("SQL tokens", () => {
  it("handles quotes, comments, dollar quoting and GO", () => {
    const toks = tokenize("CREATE TABLE \"a b\" (x text DEFAULT 'it''s'); /* c\n */ $$ ; $$\n-- group: Sales\nGO\n");
    expect(toks.filter((t) => t.t === "qid").map((t) => t.v)).toEqual(["a b"]);
    expect(toks.filter((t) => t.t === "str").map((t) => t.v)).toEqual(["it's", " ; "]);
    expect(toks.find((t) => t.t === "dir")).toMatchObject({ v: "group:Sales", line: 3 });
    expect(toks.at(-1)).toMatchObject({ t: "p", v: ";", line: 4 });
  });
});

describe("SQL schema", () => {
  it("reads tables, columns, keys and types", () => {
    const s = parseSql(SHOP);
    expect(s.title).toBe("Shop");
    expect(s.tables.map((t) => t.name)).toEqual(["customers", "orders", "invoices"]);
    const orders = s.tables[1];
    expect(orders.line).toBe(7);
    expect(orders.columns.map((c) => [c.name, c.type, c.pk, c.notNull])).toEqual([
      ["id", "int", true, true],
      ["customer_id", "int", false, true],
      ["gift_for", "int", false, false],
      ["total", "numeric(10, 2)", false, true],
    ]);
    expect(s.tables[0].columns[1].unique).toBe(true);
    expect(s.warnings).toEqual([]);
  });

  it("turns foreign keys into relations with cardinality", () => {
    const s = parseSql(SHOP);
    expect(s.relations.map((r) => [r.from.name, r.fromCols[0].name, r.to.name, r.toCols[0].name, r.optional, r.single])).toEqual([
      ["orders", "customer_id", "customers", "id", false, false],
      ["orders", "gift_for", "customers", "id", true, false],
      ["invoices", "order_id", "orders", "id", false, true],
    ]);
    expect(s.relations[0].line).toBe(9);
    expect(s.tables[1].columns[1].fk).toBe(true);
  });

  it("reads MySQL keys, SQL Server brackets and ALTER TABLE", () => {
    const s = parseSql(`
CREATE TABLE \`users\` (\`id\` int unsigned NOT NULL AUTO_INCREMENT, \`key\` varchar(20), PRIMARY KEY (\`id\`), KEY \`ix\` (\`key\`), UNIQUE KEY \`uq\` (\`key\`)) ENGINE=InnoDB;
CREATE TABLE [dbo].[Posts] ([Id] int IDENTITY(1,1) NOT NULL, [UserId] int NULL, CONSTRAINT [PK_Posts] PRIMARY KEY CLUSTERED ([Id]));
GO
ALTER TABLE [dbo].[Posts] ADD CONSTRAINT [FK] FOREIGN KEY ([UserId]) REFERENCES [users] ([id]), ADD [Title] nvarchar(200) NOT NULL;
`);
    const [users, posts] = s.tables;
    expect(users.columns.map((c) => [c.name, c.type])).toEqual([["id", "int unsigned"], ["key", "varchar(20)"]]);
    expect(users.columns[1].unique).toBe(true);
    expect(posts.schema).toBe("dbo");
    expect(posts.pk).toEqual(["id"]);
    expect(posts.columns.map((c) => c.name)).toEqual(["Id", "UserId", "Title"]);
    expect(s.relations).toHaveLength(1);
    expect(s.relations[0]).toMatchObject({ optional: true, single: false });
  });

  it("reads several constraints after one ADD, and WITH CHECK", () => {
    const s = parseSql(`CREATE TABLE a (id int PRIMARY KEY);
CREATE TABLE b (id int PRIMARY KEY, a1 int, a2 int, a3 int);
ALTER TABLE b ADD
  CONSTRAINT f1 FOREIGN KEY (a1) REFERENCES a (id),
  CONSTRAINT f2 FOREIGN KEY (a2) REFERENCES a (id),
  DROP COLUMN gone;
ALTER TABLE [b] WITH CHECK ADD CONSTRAINT [f3] FOREIGN KEY ([a3]) REFERENCES [a] ([id]);`);
    expect(s.relations.map((r) => r.fromCols[0].name)).toEqual(["a1", "a2", "a3"]);
    expect(s.warnings).toEqual([]);
  });

  it("reads pg_dump style keys, unique indexes and comments", () => {
    const s = parseSql(`
SET statement_timeout = 0;
CREATE FUNCTION f() RETURNS trigger AS $$ BEGIN CREATE TABLE nope (x int); END; $$ LANGUAGE plpgsql;
CREATE TABLE public.people (id integer NOT NULL, name text);
CREATE TABLE public.passports (id integer NOT NULL, person_id integer NOT NULL);
ALTER TABLE ONLY public.people ADD CONSTRAINT people_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.passports ADD CONSTRAINT passports_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX passports_person ON public.passports USING btree (person_id);
ALTER TABLE ONLY public.passports ADD CONSTRAINT fk FOREIGN KEY (person_id) REFERENCES public.people(id);
COMMENT ON TABLE public.people IS 'Everyone';
COMMENT ON COLUMN public.people.name IS 'Full name';
INSERT INTO public.people VALUES (1, 'x');
`);
    expect(s.tables.map((t) => t.name)).toEqual(["people", "passports"]);
    expect(s.tables[0].comment).toBe("Everyone");
    expect(s.tables[0].columns[1].comment).toBe("Full name");
    expect(s.relations[0]).toMatchObject({ single: true, optional: false });
    expect(s.warnings).toEqual([]);
  });

  it("warns about missing tables, columns and keys, by line", () => {
    const s = parseSql(`CREATE TABLE a (
  id int,
  b_id int REFERENCES b (id),
  c_id int REFERENCES a (nope)
);
CREATE TABLE a (id int);
ALTER TABLE z ADD x int;
-- focus: a, q
`);
    expect(s.warnings.map((w) => [w.line, w.message])).toEqual([
      [1, "a has no primary key."],
      [3, "b isn't defined here, so this link isn't drawn."],
      [4, "There's no column a.nope, so this link isn't drawn."],
      [6, "a is already defined on line 1. Only the first one is drawn."],
      [7, "ALTER TABLE z: there's no CREATE TABLE z before it, so this is skipped."],
      [8, "There's no table called q to focus on."],
    ]);
  });

  it("explains an empty script and an unclosed table", () => {
    expect(() => parseSql("SELECT 1;")).toThrow(/No tables found/);
    try {
      parseSql("\nCREATE TABLE t (\n  id int,\n  name text\n");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SqlError);
      expect((err as SqlError).line).toBe(2);
      expect((err as SqlError).message).toMatch(/column list of t isn't closed/);
    }
  });

  it("focuses on a table and its neighbours", () => {
    const s = parseSql(`${SHOP}\n-- focus: invoices`);
    expect([...visibleTables(s)].map((t) => t.name).sort()).toEqual(["invoices", "orders"]);
  });

  it("groups by -- group:, or by schema when there are several", () => {
    const grouped = parseSql("-- group: Sales\nCREATE TABLE a (id int PRIMARY KEY);\n-- group:\nCREATE TABLE b (id int PRIMARY KEY);");
    expect([...groupOf(grouped).entries()].map(([t, g]) => [t.name, g])).toEqual([["a", "Sales"]]);
    const schemas = parseSql("CREATE TABLE hr.a (id int PRIMARY KEY); CREATE TABLE ops.b (id int PRIMARY KEY);");
    expect([...groupOf(schemas).values()]).toEqual(["hr", "ops"]);
  });
});

describe("SQL detection", () => {
  it("recognises SQL scripts and dumps", () => {
    expect(detectEngine("CREATE TABLE a (id int);")).toBe("sql");
    expect(detectEngine("-- MySQL dump 10.13\n/*!40101 SET NAMES utf8 */;\nDROP TABLE IF EXISTS `a`;")).toBe("sql");
    expect(detectEngine("--\n-- PostgreSQL database dump\n--\nSET statement_timeout = 0;")).toBe("sql");
    expect(detectEngine("create unique index x on t (a);")).toBe("sql");
    expect(detectEngine("flowchart TD\nA --> B")).toBe("mermaid");
    expect(diagramKind(SHOP, "sql")).toBe("3 tables");
  });
});

describe("SQL drawing", () => {
  it("lays out tables with links that meet their rows", () => {
    const s = parseSql(SHOP);
    const lay = layoutSql(s, viz, "colour");
    const orders = lay.tables.get(s.tables[1])!;
    const customers = lay.tables.get(s.tables[0])!;
    // Referenced tables sit to the left.
    expect(customers.x + customers.w).toBeLessThan(orders.x);
    const route = lay.routes.get(s.relations[0])!;
    const end = route[route.length - 1];
    expect(end.x).toBeCloseTo(orders.x, 0);
    // The link ends on the customer_id row, the second row.
    expect(end.y).toBeGreaterThan(orders.y + 32 + 22);
    expect(end.y).toBeLessThan(orders.y + 32 + 44);
  });

  it("spreads out link ends that start at the same key", () => {
    const s = parseSql(SHOP);
    const lay = layoutSql(s, viz, "colour");
    // orders.customer_id and orders.gift_for both point at customers.id.
    const [a, b] = [lay.routes.get(s.relations[0])!, lay.routes.get(s.relations[1])!];
    expect(a[0]).toEqual(b[0]);
    const spread = spreadEnds(lay.routes);
    const [sa, sb] = [spread.get(s.relations[0])!, spread.get(s.relations[1])!];
    expect(Math.abs(sa[0].y - sb[0].y)).toBeCloseTo(7, 5);
    expect(sa[0].x).toBe(a[0].x);
    // The originals are left alone, and ends that don't share a point don't move.
    expect(lay.routes.get(s.relations[0])![0]).toEqual(a[0]);
    expect(spread.get(s.relations[2])!).toEqual(lay.routes.get(s.relations[2]));
  });

  it("draws every style, with source lines and warnings", () => {
    const s = parseSql(`${SHOP}\nCREATE TABLE loose (x int);`);
    for (const style of ["colour", "plain", "keys"] as const) {
      const svg = drawSql(s, layoutSql(s, viz, style), { dark: style === "plain", style, warnings: s.warnings });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('data-source-line="6"');
      expect(svg).toContain('data-source-line="8"');
      expect(svg).toContain(">!</text>");
      if (style === "keys") expect(svg).toContain("more column");
    }
  });

  it("draws every template without warnings", () => {
    for (const t of sqlTemplates) {
      const s = parseSql(t.code);
      expect(s.warnings, t.id).toEqual([]);
      expect(drawSql(s, layoutSql(s, viz, "colour"), { dark: false, style: "colour" })).toContain("<svg");
    }
  });
});
