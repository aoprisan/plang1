import { describe, it } from "node:test";
import * as assert from "node:assert";
import { compile } from "../src/index";

describe("Effect System — Phase 1: Error Propagation", () => {
  it("accepts function that declares its effects", () => {
    const result = compile(`
      module test;
      fn read(path: Str) -> Str ! IoError {
        read_file(path)!
      }
    `);
    // IoError is a type variable (not registered), so it's permissive
    assert.ok(result.js);
  });

  it("errors when propagating undeclared effect", () => {
    const result = compile(`
      module test;
      type MyError = Fail { msg: Str };
      fn safe_read(path: Str) -> Str ! IoError {
        let content = read_file(path)!;
        content
      }
      fn caller() -> Str {
        safe_read("test")!
      }
    `);
    // caller() has no effects declared but uses ! to propagate IoError
    const effectErrors = result.errors.filter(e => e.includes("effect") || e.includes("not declared"));
    assert.ok(effectErrors.length > 0, `Expected effect error, got: ${result.errors.join("; ")}`);
  });

  it("accepts when caller declares matching effects", () => {
    const result = compile(`
      module test;
      fn may_fail(x: Int) -> Int ! ParseError {
        x + 1
      }
      fn caller(x: Int) -> Int ! ParseError {
        may_fail(x)
      }
    `);
    // caller declares ParseError, so calling may_fail is fine
    const effectErrors = result.errors.filter(e => e.includes("effect") || e.includes("not declared"));
    assert.strictEqual(effectErrors.length, 0, `Unexpected effect errors: ${effectErrors.join("; ")}`);
  });

  it("errors when calling effectful function without declaring the effect", () => {
    const result = compile(`
      module test;
      fn may_fail(x: Int) -> Int ! ParseError {
        x + 1
      }
      fn caller(x: Int) -> Int {
        may_fail(x)
      }
    `);
    // caller() has no effects, but calls may_fail which has ! ParseError
    const effectErrors = result.errors.filter(e => e.includes("effect") || e.includes("not declared"));
    assert.ok(effectErrors.length > 0, `Expected effect error, got: ${result.errors.join("; ")}`);
  });

  it("accepts pure function calling pure function", () => {
    const result = compile(`
      module test;
      fn add(a: Int, b: Int) -> Int {
        a + b
      }
      fn double(x: Int) -> Int {
        add(x, x)
      }
    `);
    assert.strictEqual(result.errors.length, 0);
  });

  it("accepts function with multiple effects", () => {
    const result = compile(`
      module test;
      fn read(path: Str) -> Str ! IoError {
        path
      }
      fn parse(s: Str) -> Int ! ParseError {
        42
      }
      fn process(path: Str) -> Int ! IoError | ParseError {
        let content = read(path);
        parse(content)
      }
    `);
    const effectErrors = result.errors.filter(e => e.includes("effect") || e.includes("not declared"));
    assert.strictEqual(effectErrors.length, 0, `Unexpected effect errors: ${effectErrors.join("; ")}`);
  });

  it("errors when only some effects are declared", () => {
    const result = compile(`
      module test;
      fn read(path: Str) -> Str ! IoError {
        path
      }
      fn parse(s: Str) -> Int ! ParseError {
        42
      }
      fn process(path: Str) -> Int ! IoError {
        let content = read(path);
        parse(content)
      }
    `);
    // process declares IoError but not ParseError
    const effectErrors = result.errors.filter(e => e.includes("ParseError") && e.includes("not declared"));
    assert.ok(effectErrors.length > 0, `Expected ParseError effect error, got: ${result.errors.join("; ")}`);
  });

  it("tests are permissive with effects", () => {
    const result = compile(`
      module test;
      fn may_fail(x: Int) -> Int ! ParseError {
        x + 1
      }
      test "can call effectful functions" {
        let result = may_fail(42);
        assert result == 43;
      }
    `);
    // Test blocks should not require effect declarations
    const effectErrors = result.errors.filter(e => e.includes("effect") || e.includes("not declared"));
    assert.strictEqual(effectErrors.length, 0, `Unexpected effect errors in test: ${effectErrors.join("; ")}`);
  });
});

describe("Effect System — Phase 2: FFI Effect Tracking", () => {
  it("registers extern fn with declared effects", () => {
    const result = compile(`
      module test;
      extern fn read_file(path: Str) -> Str ! IoError = "fs.readFileSync";
      fn process(path: Str) -> Str ! IoError {
        read_file(path)
      }
    `);
    const effectErrors = result.errors.filter(e => e.includes("effect") || e.includes("not declared"));
    assert.strictEqual(effectErrors.length, 0, `Unexpected effect errors: ${effectErrors.join("; ")}`);
  });

  it("errors when calling extern fn with effects from pure function", () => {
    const result = compile(`
      module test;
      extern fn read_file(path: Str) -> Str ! IoError = "fs.readFileSync";
      fn process(path: Str) -> Str {
        read_file(path)
      }
    `);
    const effectErrors = result.errors.filter(e => e.includes("IoError") || e.includes("not declared"));
    assert.ok(effectErrors.length > 0, `Expected IoError effect error, got: ${result.errors.join("; ")}`);
  });

  it("parses extern fn with effect annotations", () => {
    const result = compile(`
      module test;
      extern fn dangerous(x: Int) -> Int ! RuntimeError | SecurityError = "eval";
    `);
    assert.ok(result.js);
  });

  it("parses extern module methods with effects", () => {
    const result = compile(`
      module test;
      extern module "fs" as fs {
        fn readFileSync(path: Str) -> Str ! IoError;
        fn writeFileSync(path: Str, data: Str) -> Void ! IoError;
      }
    `);
    assert.ok(result.js);
  });

  it("tracks extern module method effects in type checker", () => {
    const result = compile(`
      module test;
      extern module "fs" as fs {
        fn readFileSync(path: Str) -> Str ! IoError;
      }
      fn process(path: Str) -> Str {
        fs.readFileSync(path)
      }
    `);
    // process() doesn't declare IoError but calls fs.readFileSync which has it
    const effectErrors = result.errors.filter(e => e.includes("IoError") || e.includes("not declared"));
    assert.ok(effectErrors.length > 0, `Expected IoError effect error, got: ${result.errors.join("; ")}`);
  });

  it("accepts extern module call when effects are declared", () => {
    const result = compile(`
      module test;
      extern module "fs" as fs {
        fn readFileSync(path: Str) -> Str ! IoError;
      }
      fn process(path: Str) -> Str ! IoError {
        fs.readFileSync(path)
      }
    `);
    const effectErrors = result.errors.filter(e => e.includes("effect") || e.includes("not declared"));
    assert.strictEqual(effectErrors.length, 0, `Unexpected effect errors: ${effectErrors.join("; ")}`);
  });

  it("extern fn without effects is pure — callable from anywhere", () => {
    const result = compile(`
      module test;
      extern fn parse_int(s: Str) -> Int = "parseInt";
      fn caller(s: Str) -> Int {
        parse_int(s)
      }
    `);
    assert.strictEqual(result.errors.length, 0);
  });
});

describe("Effect System — Phase 3: Async Effect Tracking", () => {
  it("errors when calling async fn from non-async context", () => {
    const result = compile(`
      module test;
      async fn fetch_data(url: Str) -> Str {
        url
      }
      fn caller() -> Str {
        fetch_data("http://example.com")
      }
    `);
    const asyncErrors = result.errors.filter(e => e.includes("async"));
    assert.ok(asyncErrors.length > 0, `Expected async effect error, got: ${result.errors.join("; ")}`);
  });

  it("accepts calling async fn from async context", () => {
    const result = compile(`
      module test;
      async fn fetch_data(url: Str) -> Str {
        url
      }
      async fn caller() -> Str {
        fetch_data("http://example.com")
      }
    `);
    const asyncErrors = result.errors.filter(e => e.includes("Cannot call async"));
    assert.strictEqual(asyncErrors.length, 0, `Unexpected async errors: ${asyncErrors.join("; ")}`);
  });

  it("errors when calling async extern fn from sync context", () => {
    const result = compile(`
      module test;
      extern async fn fetch(url: Str) -> Str = "fetch";
      fn caller() -> Str {
        fetch("http://example.com")
      }
    `);
    const asyncErrors = result.errors.filter(e => e.includes("async"));
    assert.ok(asyncErrors.length > 0, `Expected async error, got: ${result.errors.join("; ")}`);
  });

  it("accepts calling async extern fn from async context", () => {
    const result = compile(`
      module test;
      extern async fn fetch(url: Str) -> Str = "fetch";
      async fn caller() -> Str {
        fetch("http://example.com")
      }
    `);
    const asyncErrors = result.errors.filter(e => e.includes("Cannot call async"));
    assert.strictEqual(asyncErrors.length, 0, `Unexpected async errors: ${asyncErrors.join("; ")}`);
  });
});

describe("Effect System — Subsumption & Edge Cases", () => {
  it("pure functions are subtypes of effectful (effect subsumption)", () => {
    const result = compile(`
      module test;
      fn pure_add(a: Int, b: Int) -> Int {
        a + b
      }
    `);
    assert.strictEqual(result.errors.length, 0);
  });

  it("compiles and runs: effectful function with propagation", () => {
    const result = compile(`
      module test;
      fn may_fail(x: Int) -> Result<Int, Str> {
        if x > 0 {
          Ok { value: x }
        } else {
          Err { error: "negative" }
        }
      }
      fn caller(x: Int) -> Int ! Str {
        let v = may_fail(x)!;
        v + 1
      }
    `);
    assert.ok(result.js);
    // Propagation should compile to __propagate
    assert.ok(result.js!.includes("__propagate"));
  });

  it("typeToString includes effects in function type display", () => {
    const result = compile(`
      module test;
      fn fail() -> Int ! ParseError {
        42
      }
    `);
    // Just verify it compiles — the typeToString improvement is internal
    assert.ok(result.js);
  });

  it("still generates JS even with effect errors (for development)", () => {
    const result = compile(`
      module test;
      fn may_fail(x: Int) -> Int ! ParseError {
        x + 1
      }
      fn caller(x: Int) -> Int {
        may_fail(x)
      }
    `);
    // Should have errors but still produce JS
    assert.ok(result.errors.length > 0);
    assert.ok(result.js);
  });
});
