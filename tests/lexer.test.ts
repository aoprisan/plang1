import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Lexer, TokenType } from "../src/lexer";

describe("Lexer", () => {
  it("tokenizes integer literals", () => {
    const lexer = new Lexer("42");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.IntLiteral);
    assert.strictEqual(tokens[0].value, "42");
  });

  it("tokenizes float literals", () => {
    const lexer = new Lexer("3.14");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.FloatLiteral);
    assert.strictEqual(tokens[0].value, "3.14");
  });

  it("tokenizes string literals", () => {
    const lexer = new Lexer('"hello world"');
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.StrLiteral);
    assert.strictEqual(tokens[0].value, "hello world");
  });

  it("tokenizes string with escape sequences", () => {
    const lexer = new Lexer('"hello\\nworld"');
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].value, "hello\nworld");
  });

  it("tokenizes char literals", () => {
    const lexer = new Lexer("'a'");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.CharLiteral);
    assert.strictEqual(tokens[0].value, "a");
  });

  it("tokenizes keywords", () => {
    const lexer = new Lexer("fn let var if else match for in");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.Fn);
    assert.strictEqual(tokens[1].type, TokenType.Let);
    assert.strictEqual(tokens[2].type, TokenType.Var);
    assert.strictEqual(tokens[3].type, TokenType.If);
    assert.strictEqual(tokens[4].type, TokenType.Else);
    assert.strictEqual(tokens[5].type, TokenType.Match);
    assert.strictEqual(tokens[6].type, TokenType.For);
    assert.strictEqual(tokens[7].type, TokenType.In);
  });

  it("tokenizes identifiers", () => {
    const lexer = new Lexer("hello_world MyType x42");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.Identifier);
    assert.strictEqual(tokens[0].value, "hello_world");
    assert.strictEqual(tokens[1].value, "MyType");
    assert.strictEqual(tokens[2].value, "x42");
  });

  it("tokenizes operators", () => {
    const lexer = new Lexer("== != <= >= && || |> ++ -> =>");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.EqEq);
    assert.strictEqual(tokens[1].type, TokenType.NotEq);
    assert.strictEqual(tokens[2].type, TokenType.LtEq);
    assert.strictEqual(tokens[3].type, TokenType.GtEq);
    assert.strictEqual(tokens[4].type, TokenType.And);
    assert.strictEqual(tokens[5].type, TokenType.Or);
    assert.strictEqual(tokens[6].type, TokenType.PipeGt);
    assert.strictEqual(tokens[7].type, TokenType.PlusPlus);
    assert.strictEqual(tokens[8].type, TokenType.Arrow);
    assert.strictEqual(tokens[9].type, TokenType.FatArrow);
  });

  it("tokenizes delimiters", () => {
    const lexer = new Lexer("(){}[];:,.");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.LParen);
    assert.strictEqual(tokens[1].type, TokenType.RParen);
    assert.strictEqual(tokens[2].type, TokenType.LBrace);
    assert.strictEqual(tokens[3].type, TokenType.RBrace);
    assert.strictEqual(tokens[4].type, TokenType.LBracket);
    assert.strictEqual(tokens[5].type, TokenType.RBracket);
    assert.strictEqual(tokens[6].type, TokenType.Semicolon);
    assert.strictEqual(tokens[7].type, TokenType.Colon);
    assert.strictEqual(tokens[8].type, TokenType.Comma);
    assert.strictEqual(tokens[9].type, TokenType.Dot);
  });

  it("skips single-line comments", () => {
    const lexer = new Lexer("42 // this is a comment\n43");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.IntLiteral);
    assert.strictEqual(tokens[0].value, "42");
    assert.strictEqual(tokens[1].type, TokenType.IntLiteral);
    assert.strictEqual(tokens[1].value, "43");
  });

  it("skips multi-line comments", () => {
    const lexer = new Lexer("42 /* comment */ 43");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].value, "42");
    assert.strictEqual(tokens[1].value, "43");
  });

  it("tracks line and column", () => {
    const lexer = new Lexer("let x = 42;\nlet y = 10;");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].line, 1);
    assert.strictEqual(tokens[0].column, 1);
    // "y" is on line 2
    const yToken = tokens.find(t => t.value === "y");
    assert.ok(yToken);
    assert.strictEqual(yToken!.line, 2);
  });

  it("tokenizes a complete function", () => {
    const source = `fn add(a: Int, b: Int) -> Int {
  a + b
}`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const types = tokens.map(t => t.type);
    assert.deepStrictEqual(types, [
      TokenType.Fn, TokenType.Identifier,
      TokenType.LParen,
      TokenType.Identifier, TokenType.Colon, TokenType.Identifier, TokenType.Comma,
      TokenType.Identifier, TokenType.Colon, TokenType.Identifier,
      TokenType.RParen,
      TokenType.Arrow, TokenType.Identifier,
      TokenType.LBrace,
      TokenType.Identifier, TokenType.Plus, TokenType.Identifier,
      TokenType.RBrace,
      TokenType.EOF,
    ]);
  });

  it("ends with EOF", () => {
    const lexer = new Lexer("");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].type, TokenType.EOF);
  });
});
