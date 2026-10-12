import { describe, expect, it } from "vitest";
import { describeError } from "../../src/engines/mermaid";

describe("describeError", () => {
  it("summarises Jison parse errors and keeps the line number", () => {
    const err = Object.assign(
      new Error("Parse error on line 2:\n...A --> \n-----------^\nExpecting 'AMP', 'COLON', 'DOWN', got 'NEWLINE'"),
      { hash: { line: 1, loc: { first_line: 2 } } },
    );
    expect(describeError(err)).toEqual({
      message: "Unexpected newline. Expected AMP, COLON, DOWN.",
      line: 2,
    });
  });

  it("reads line numbers from the message when there is no hash", () => {
    expect(describeError(new Error("Lexer error on line 7, column 3: unexpected character")).line).toBe(7);
  });

  it("explains a missing diagram type", () => {
    const { message, line } = describeError(
      new Error('No diagram type detected matching given configuration for text: "hello"'),
    );
    expect(message).toMatch(/first line/);
    expect(line).toBeUndefined();
  });

  it("copes with non-Error values", () => {
    expect(describeError("plain string").message).toBe("plain string");
    expect(describeError(undefined).message).toMatch(/could not draw/);
  });
});
