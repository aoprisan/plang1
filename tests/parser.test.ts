import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe("Parser", () => {
  it("parses module declaration", () => {
    const ast = parse("module hello;");
    assert.strictEqual(ast.kind, "Program");
    assert.deepStrictEqual(ast.module.path, ["hello"]);
  });

  it("parses dotted module path", () => {
    const ast = parse("module my.app.utils;");
    assert.deepStrictEqual(ast.module.path, ["my", "app", "utils"]);
  });

  it("parses imports", () => {
    const ast = parse("module test; use std.io;");
    assert.strictEqual(ast.imports.length, 1);
    assert.deepStrictEqual(ast.imports[0].path, ["std", "io"]);
  });

  it("parses selective imports", () => {
    const ast = parse("module test; use std.io.{println, readln};");
    assert.strictEqual(ast.imports[0].items!.length, 2);
    assert.strictEqual(ast.imports[0].items![0], "println");
    assert.strictEqual(ast.imports[0].items![1], "readln");
  });

  it("parses aliased imports", () => {
    const ast = parse("module test; use std.math as m;");
    assert.strictEqual(ast.imports[0].alias, "m");
  });

  it("parses a simple function", () => {
    const ast = parse(`
      module test;
      fn add(a: Int, b: Int) -> Int {
        a + b
      }
    `);
    assert.strictEqual(ast.declarations.length, 1);
    const fn = ast.declarations[0];
    assert.strictEqual(fn.kind, "FnDecl");
    if (fn.kind === "FnDecl") {
      assert.strictEqual(fn.name, "add");
      assert.strictEqual(fn.params.length, 2);
      assert.strictEqual(fn.isPublic, false);
      assert.strictEqual(fn.isAsync, false);
    }
  });

  it("parses pub async functions", () => {
    const ast = parse(`
      module test;
      pub async fn fetch(url: Str) -> Str ! NetError {
        url
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl") {
      assert.strictEqual(fn.isPublic, true);
      assert.strictEqual(fn.isAsync, true);
      assert.strictEqual(fn.effects.length, 1);
    }
  });

  it("parses type declarations - record", () => {
    const ast = parse(`
      module test;
      type Point = { x: Float, y: Float };
    `);
    const decl = ast.declarations[0];
    assert.strictEqual(decl.kind, "TypeDecl");
    if (decl.kind === "TypeDecl") {
      assert.strictEqual(decl.name, "Point");
      assert.strictEqual(decl.body.kind, "RecordTypeBody");
    }
  });

  it("parses type declarations - sum type", () => {
    const ast = parse(`
      module test;
      type Shape =
        | Circle { radius: Float }
        | Rect { width: Float, height: Float };
    `);
    const decl = ast.declarations[0];
    if (decl.kind === "TypeDecl" && decl.body.kind === "SumTypeBody") {
      assert.strictEqual(decl.body.variants.length, 2);
      assert.strictEqual(decl.body.variants[0].name, "Circle");
      assert.strictEqual(decl.body.variants[1].name, "Rect");
    }
  });

  it("parses let declarations", () => {
    const ast = parse(`
      module test;
      fn main() -> Void {
        let x: Int = 42;
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl") {
      assert.strictEqual(fn.body.statements.length, 1);
      assert.strictEqual(fn.body.statements[0].kind, "LetDecl");
    }
  });

  it("parses if expressions", () => {
    const ast = parse(`
      module test;
      fn abs(x: Int) -> Int {
        if x >= 0 { x } else { 0 - x }
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl" && fn.body.finalExpr) {
      assert.strictEqual(fn.body.finalExpr.kind, "IfExpr");
    }
  });

  it("parses match expressions", () => {
    const ast = parse(`
      module test;
      fn describe(x: Int) -> Str {
        match x {
          0 => "zero",
          1 => "one",
          _ => "other",
        }
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl" && fn.body.finalExpr) {
      assert.strictEqual(fn.body.finalExpr.kind, "MatchExpr");
      if (fn.body.finalExpr.kind === "MatchExpr") {
        assert.strictEqual(fn.body.finalExpr.arms.length, 3);
      }
    }
  });

  it("parses test declarations", () => {
    const ast = parse(`
      module test;
      test "addition" {
        assert 1 + 1 == 2;
      }
    `);
    assert.strictEqual(ast.declarations.length, 1);
    assert.strictEqual(ast.declarations[0].kind, "TestDecl");
  });

  it("parses list expressions", () => {
    const ast = parse(`
      module test;
      fn nums() -> List<Int> {
        [1, 2, 3]
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl" && fn.body.finalExpr) {
      assert.strictEqual(fn.body.finalExpr.kind, "ListExpr");
    }
  });

  it("parses for expressions", () => {
    const ast = parse(`
      module test;
      fn doubles() -> List<Int> {
        for x in [1, 2, 3] {
          x * 2
        }
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl" && fn.body.finalExpr) {
      assert.strictEqual(fn.body.finalExpr.kind, "ForExpr");
    }
  });

  it("parses record expressions", () => {
    const ast = parse(`
      module test;
      type Point = { x: Float, y: Float };
      fn origin() -> Point {
        Point { x: 0.0, y: 0.0 }
      }
    `);
    const fn = ast.declarations[1];
    if (fn.kind === "FnDecl" && fn.body.finalExpr) {
      assert.strictEqual(fn.body.finalExpr.kind, "RecordExpr");
    }
  });

  it("parses function calls with propagation", () => {
    const ast = parse(`
      module test;
      fn process(path: Str) -> Str ! IoError {
        let content = read_file(path)!;
        content
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl") {
      assert.strictEqual(fn.body.statements.length, 1);
      const letDecl = fn.body.statements[0];
      if (letDecl.kind === "LetDecl") {
        assert.strictEqual(letDecl.value.kind, "PropagateExpr");
      }
    }
  });
});
