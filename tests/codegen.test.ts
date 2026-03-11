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

  // === Tail Call Optimization tests ===

  it("applies self-recursive TCO via loop transformation", () => {
    const result = compile(`
      module test;
      fn factorial(n: Int, acc: Int) -> Int {
        if n <= 1 { acc } else { factorial(n - 1, n * acc) }
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("while (true)"), "should have while loop");
    assert.ok(result.js!.includes("continue;"), "should have continue");
    // The recursive call should NOT appear in output (but function declaration does)
    const fnBody = result.js!.split("function factorial(")[1];
    assert.ok(!fnBody.includes("factorial("), "should not have recursive call in body");
  });

  it("uses temp vars for multi-param tail call reassignment", () => {
    const result = compile(`
      module test;
      fn factorial(n: Int, acc: Int) -> Int {
        if n <= 1 { acc } else { factorial(n - 1, n * acc) }
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("__tco_n"), "should have temp var for n");
    assert.ok(result.js!.includes("__tco_acc"), "should have temp var for acc");
  });

  it("does NOT apply TCO to non-tail recursion", () => {
    const result = compile(`
      module test;
      fn sum(n: Int) -> Int {
        if n <= 0 { 0 } else { n + sum(n - 1) }
      }
    `);
    assert.ok(result.js);
    assert.ok(!result.js!.includes("while (true)"), "should not have while loop");
    assert.ok(result.js!.includes("sum("), "should have normal recursive call");
  });

  it("self-recursive TCO produces correct results", () => {
    const result = compile(`
      module test;
      fn factorial(n: Int, acc: Int) -> Int {
        if n <= 1 { acc } else { factorial(n - 1, n * acc) }
      }
    `);
    assert.ok(result.js);
    // Eval the generated code and test correctness
    const fn = new Function(result.js + "\n return factorial;");
    const factorial = fn();
    assert.strictEqual(factorial(10, 1), 3628800);
    assert.strictEqual(factorial(0, 1), 1);
    assert.strictEqual(factorial(1, 1), 1);
  });

  it("applies trampoline for mutual tail recursion", () => {
    const result = compile(`
      module test;
      fn is_even(n: Int) -> Bool {
        if n == 0 { true } else { is_odd(n - 1) }
      }
      fn is_odd(n: Int) -> Bool {
        if n == 0 { false } else { is_even(n - 1) }
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("__tco_call("), "should have trampoline calls");
    assert.ok(result.js!.includes("__trampoline("), "should wrap external calls with trampoline");
  });

  it("mutual recursion trampoline produces correct results", () => {
    const result = compile(`
      module test;
      fn is_even(n: Int) -> Bool {
        if n == 0 { true } else { is_odd(n - 1) }
      }
      fn is_odd(n: Int) -> Bool {
        if n == 0 { false } else { is_even(n - 1) }
      }
    `);
    assert.ok(result.js);
    // Eval the generated code — must call through __trampoline since these are trampolined fns
    const fn = new Function(result.js + "\n return { is_even: (n) => __trampoline(() => is_even(n)), is_odd: (n) => __trampoline(() => is_odd(n)) };");
    const { is_even, is_odd } = fn();
    assert.strictEqual(is_even(0), true);
    assert.strictEqual(is_even(1), false);
    assert.strictEqual(is_even(4), true);
    assert.strictEqual(is_odd(3), true);
    assert.strictEqual(is_odd(4), false);
  });

  it("deep self-recursion does not overflow", () => {
    const result = compile(`
      module test;
      fn countdown(n: Int) -> Int {
        if n <= 0 { 0 } else { countdown(n - 1) }
      }
    `);
    assert.ok(result.js);
    const fn = new Function(result.js + "\n return countdown;");
    const countdown = fn();
    // This would overflow without TCO
    assert.strictEqual(countdown(100000), 0);
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
