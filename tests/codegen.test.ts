import { describe, it } from "node:test";
import * as assert from "node:assert";
import { compile } from "../src/index";

describe("Code Generator", () => {
  it("compiles hello world", () => {
    const result = compile(`
      module hello;
      fn main() -> Void {
        println("Hello, world!")!;
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('console.log'));
    assert.ok(result.js!.includes('function main'));
  });

  it("compiles arithmetic expressions", () => {
    const result = compile(`
      module test;
      fn add(a: Int, b: Int) -> Int {
        a + b
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('function add(a, b)'));
    assert.ok(result.js!.includes('(a + b)'));
  });

  it("compiles if expressions to ternaries", () => {
    const result = compile(`
      module test;
      fn abs(x: Int) -> Int {
        if x >= 0 { x } else { 0 - x }
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('?'));
  });

  it("compiles let declarations to const", () => {
    const result = compile(`
      module test;
      fn main() -> Void {
        let x = 42;
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('const x = 42'));
  });

  it("compiles var declarations to let", () => {
    const result = compile(`
      module test;
      fn main() -> Void {
        var x = 0;
        x = 1;
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('let x = 0'));
  });

  it("compiles list literals to arrays", () => {
    const result = compile(`
      module test;
      fn nums() -> List<Int> {
        [1, 2, 3]
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('[1, 2, 3]'));
  });

  it("compiles string concatenation to __concat", () => {
    const result = compile(`
      module test;
      fn greet(name: Str) -> Str {
        "Hello, " ++ name
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('__concat'));
  });

  it("compiles error propagation to __propagate", () => {
    const result = compile(`
      module test;
      fn process(path: Str) -> Str ! IoError {
        let content = read_file(path)!;
        content
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('__propagate'));
  });

  it("compiles sum type declarations to factory functions", () => {
    const result = compile(`
      module test;
      type Shape =
        | Circle { radius: Float }
        | Rect { width: Float, height: Float };
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('function Circle'));
    assert.ok(result.js!.includes('function Rect'));
    assert.ok(result.js!.includes('__tag: "Circle"'));
  });

  it("compiles pub functions with module.exports", () => {
    const result = compile(`
      module test;
      pub fn add(a: Int, b: Int) -> Int {
        a + b
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('module.exports.add'));
  });

  it("compiles tests to async test functions", () => {
    const result = compile(`
      module test;
      test "basic" {
        assert 1 == 1;
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('async function __test_basic'));
  });

  it("includes runtime helpers", () => {
    const result = compile("module test;");
    assert.ok(result.js);
    assert.ok(result.js!.includes('__ok'));
    assert.ok(result.js!.includes('__err'));
    assert.ok(result.js!.includes('__propagate'));
    assert.ok(result.js!.includes('__range'));
    assert.ok(result.js!.includes('__assert'));
  });

  it("generates entry point for main", () => {
    const result = compile(`
      module test;
      fn main() -> Void {
        println("hi")!;
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('require.main === module'));
  });

  it("handles the full hello example", () => {
    const source = `
      module hello;
      use std.io;

      fn greet(name: Str) -> Str {
        "Hello, " ++ name ++ "!"
      }

      fn main() -> Void ! IoError {
        println(greet("world"))!;
      }

      test "greet produces correct output" {
        assert greet("PLang") == "Hello, PLang!";
      }
    `;
    const result = compile(source);
    assert.ok(result.js);
    assert.ok(result.js!.includes('function greet'));
    assert.ok(result.js!.includes('function main'));
    assert.ok(result.js!.includes('__test_greet_produces_correct_output'));
  });
});
