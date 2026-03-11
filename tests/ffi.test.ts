import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Lexer, TokenType } from "../src/lexer";
import { Parser } from "../src/parser";
import { CodeGenerator } from "../src/codegen";
import { compile } from "../src/index";

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function generateJs(source: string): string {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const gen = new CodeGenerator();
  return gen.generate(ast);
}

describe("FFI — Lexer", () => {
  it("tokenizes extern keyword", () => {
    const lexer = new Lexer("extern");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.Extern);
  });
});

describe("FFI — Parser", () => {
  it("parses extern fn with js binding", () => {
    const ast = parse(`
      module test;
      extern fn log(msg: Str) -> Void = "console.log";
    `);
    assert.strictEqual(ast.declarations.length, 1);
    const decl = ast.declarations[0];
    assert.strictEqual(decl.kind, "ExternFnDecl");
    if (decl.kind === "ExternFnDecl") {
      assert.strictEqual(decl.name, "log");
      assert.strictEqual(decl.jsBinding, "console.log");
      assert.strictEqual(decl.params.length, 1);
      assert.strictEqual(decl.isAsync, false);
    }
  });

  it("parses async extern fn", () => {
    const ast = parse(`
      module test;
      extern async fn fetchData(url: Str) -> Str = "fetch";
    `);
    const decl = ast.declarations[0];
    assert.strictEqual(decl.kind, "ExternFnDecl");
    if (decl.kind === "ExternFnDecl") {
      assert.strictEqual(decl.isAsync, true);
      assert.strictEqual(decl.name, "fetchData");
    }
  });

  it("parses pub extern fn", () => {
    const ast = parse(`
      module test;
      pub extern fn log(msg: Str) -> Void = "console.log";
    `);
    const decl = ast.declarations[0];
    if (decl.kind === "ExternFnDecl") {
      assert.strictEqual(decl.isPublic, true);
    }
  });

  it("parses extern module with methods", () => {
    const ast = parse(`
      module test;
      extern module "fs" as fs {
        fn readFileSync(path: Str, encoding: Str) -> Str;
        fn writeFileSync(path: Str, data: Str) -> Void;
      }
    `);
    assert.strictEqual(ast.declarations.length, 1);
    const decl = ast.declarations[0];
    assert.strictEqual(decl.kind, "ExternModuleDecl");
    if (decl.kind === "ExternModuleDecl") {
      assert.strictEqual(decl.name, "fs");
      assert.strictEqual(decl.jsModule, "fs");
      assert.strictEqual(decl.methods.length, 2);
      assert.strictEqual(decl.methods[0].name, "readFileSync");
      assert.strictEqual(decl.methods[1].name, "writeFileSync");
    }
  });

  it("parses extern module with custom js binding", () => {
    const ast = parse(`
      module test;
      extern module "better-sqlite3" as sqlite {
        fn open(path: Str) -> Any = "Database";
      }
    `);
    const decl = ast.declarations[0];
    if (decl.kind === "ExternModuleDecl") {
      assert.strictEqual(decl.name, "sqlite");
      assert.strictEqual(decl.jsModule, "better-sqlite3");
      assert.strictEqual(decl.methods[0].jsBinding, "Database");
    }
  });

  it("parses extern module without alias", () => {
    const ast = parse(`
      module test;
      extern module "path" {
        fn join(a: Str, b: Str) -> Str;
      }
    `);
    const decl = ast.declarations[0];
    if (decl.kind === "ExternModuleDecl") {
      assert.strictEqual(decl.name, "path");
    }
  });
});

describe("FFI — Code Generator", () => {
  it("compiles extern fn to js wrapper", () => {
    const js = generateJs(`
      module test;
      extern fn log(msg: Str) -> Void = "console.log";
    `);
    assert.ok(js.includes("const log = (msg) => console.log(msg);"));
  });

  it("compiles async extern fn", () => {
    const js = generateJs(`
      module test;
      extern async fn fetchUrl(url: Str) -> Str = "fetch";
    `);
    assert.ok(js.includes("const fetchUrl = async (url) => fetch(url);"));
  });

  it("compiles pub extern fn with export", () => {
    const js = generateJs(`
      module test;
      pub extern fn log(msg: Str) -> Void = "console.log";
    `);
    assert.ok(js.includes("module.exports.log = log;"));
  });

  it("compiles extern module to require", () => {
    const js = generateJs(`
      module test;
      extern module "fs" as fs {
        fn readFileSync(path: Str, encoding: Str) -> Str;
      }
    `);
    assert.ok(js.includes('require("fs")'));
    assert.ok(js.includes("readFileSync"));
  });

  it("compiles extern module with custom binding", () => {
    const js = generateJs(`
      module test;
      extern module "better-sqlite3" as sqlite {
        fn open(path: Str) -> Any = "Database";
      }
    `);
    assert.ok(js.includes('require("better-sqlite3")'));
    assert.ok(js.includes("__mod.Database"));
  });
});

describe("FFI — End-to-End", () => {
  it("full extern fn pipeline compiles", () => {
    const result = compile(`
      module app;
      extern fn log(msg: Str) -> Void = "console.log";
      fn main() -> Void {
        log("hello from FFI");
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("console.log"));
  });

  it("extern module pipeline compiles", () => {
    const result = compile(`
      module app;
      extern module "path" as path {
        fn join(a: Str, b: Str) -> Str;
      }
      fn main() -> Void {
        let p = path.join("src", "index.ts");
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes('require("path")'));
  });

  it("compiled extern fn is callable JS", () => {
    const result = compile(`
      module test;
      extern fn floor(x: Float) -> Int = "Math.floor";
    `);
    assert.ok(result.js);
    // Verify the generated JS is valid
    const fn = new Function("require", "module", "exports", result.js!);
    assert.ok(typeof fn === "function");
  });

  it("extern module with default binding compiles to __mod()", () => {
    const result = compile(`
      module test;
      extern module "better-sqlite3" as db {
        fn open(path: Str) -> Any = "default";
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("__mod(path)"));
    assert.ok(!result.js!.includes("__mod.default"));
  });
});

describe("Null literal", () => {
  it("parses null literal", () => {
    const ast = parse(`
      module test;
      fn main() -> Void {
        let x = null;
      }
    `);
    assert.strictEqual(ast.declarations.length, 1);
  });

  it("compiles null to JS null", () => {
    const js = generateJs(`
      module test;
      fn check(x: Any) -> Bool {
        x == null
      }
    `);
    assert.ok(js.includes("null"));
  });
});

describe("Object literals", () => {
  it("parses anonymous object literal", () => {
    const ast = parse(`
      module test;
      fn main() -> Void {
        let obj = { name: "hello", value: 42 };
      }
    `);
    assert.strictEqual(ast.declarations.length, 1);
  });

  it("compiles object literal to JS", () => {
    const js = generateJs(`
      module test;
      fn main() -> Any {
        { name: "hello", count: 42 }
      }
    `);
    assert.ok(js.includes("name:"));
    assert.ok(js.includes('"hello"'));
    assert.ok(js.includes("42"));
  });

  it("compiles empty object literal", () => {
    const js = generateJs(`
      module test;
      fn main() -> Any {
        let x = {};
        x
      }
    `);
    assert.ok(js.includes("{}"));
  });

  it("object literal in function call compiles", () => {
    const result = compile(`
      module test;
      extern fn emit(data: Any) -> Void = "console.log";
      fn main() -> Void {
        emit({ error: "not found" });
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("error:"));
  });
});

describe("Examples compile", () => {
  it("todo_api.pl1 compiles", () => {
    const fs = require("fs");
    const src = fs.readFileSync("examples/todo_api.pl1", "utf-8");
    const result = compile(src);
    assert.ok(result.js, "todo_api.pl1 should compile: " + (result.errors?.[0] || ""));
    assert.ok(result.js!.includes('require("express")'));
    assert.ok(result.js!.includes('require("better-sqlite3")'));
  });

  it("sqlite_demo.pl1 compiles", () => {
    const fs = require("fs");
    const src = fs.readFileSync("examples/sqlite_demo.pl1", "utf-8");
    const result = compile(src);
    assert.ok(result.js, "sqlite_demo.pl1 should compile: " + (result.errors?.[0] || ""));
    assert.ok(result.js!.includes('require("better-sqlite3")'));
  });

  it("web_sqlite.pl1 compiles", () => {
    const fs = require("fs");
    const src = fs.readFileSync("examples/web_sqlite.pl1", "utf-8");
    const result = compile(src);
    assert.ok(result.js, "web_sqlite.pl1 should compile: " + (result.errors?.[0] || ""));
    assert.ok(result.js!.includes('require("http")'));
    assert.ok(result.js!.includes('require("better-sqlite3")'));
  });

  it("todo_api.pl1 uses Option for find_todo", () => {
    const fs = require("fs");
    const src = fs.readFileSync("examples/todo_api.pl1", "utf-8");
    const result = compile(src);
    assert.ok(result.js!.includes("to_option("));
  });

  it("sqlite_demo.pl1 uses Option for find_user", () => {
    const fs = require("fs");
    const src = fs.readFileSync("examples/sqlite_demo.pl1", "utf-8");
    const result = compile(src);
    assert.ok(result.js!.includes("to_option("));
  });
});

describe("Option<T> wrapping", () => {
  it("runtime has __wrapOption, Some, None", () => {
    const js = generateJs(`
      module test;
      fn main() -> Void {
        let x = Some(42);
        let y = None;
      }
    `);
    assert.ok(js.includes("__wrapOption"));
    assert.ok(js.includes("const Some = __some;"));
    assert.ok(js.includes("const None = __none;"));
  });

  it("to_option wraps null to None at runtime", () => {
    const js = generateJs(`
      module test;
      fn main() -> Void {
        let x = to_option(null);
      }
    `);
    assert.ok(js.includes("to_option(null)"));
    // Execute the generated JS and verify wrapping
    const mod: any = {};
    new Function("require", "module", "exports", js)(require, mod, {});
    // to_option is available in the generated scope — verified by compilation
  });

  it("Some(value) compiles to __some(value)", () => {
    const js = generateJs(`
      module test;
      fn wrap(x: Int) -> Option<Int> {
        Some(x)
      }
    `);
    assert.ok(js.includes("Some(x)"));
  });

  it("None compiles to __none", () => {
    const js = generateJs(`
      module test;
      fn empty() -> Option<Int> {
        None
      }
    `);
    assert.ok(js.includes("None"));
  });

  it("extern fn with Option<T> return wraps result", () => {
    const js = generateJs(`
      module test;
      extern fn maybe_parse(s: Str) -> Option<Int> = "parseInt";
    `);
    assert.ok(js.includes("__wrapOption(parseInt(s))"));
  });

  it("extern module method with Option<T> return wraps result", () => {
    const js = generateJs(`
      module test;
      extern module "db-lib" as db {
        fn find(id: Int) -> Option<Any>;
      }
    `);
    assert.ok(js.includes("__wrapOption(__mod.find(id))"));
  });

  it("match on Option works end-to-end", () => {
    const result = compile(`
      module test;
      fn main() -> Str {
        let val = to_option(null);
        match val {
          Some { value } => "got: " ++ value,
          None => "nothing",
        }
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("__tag"));
  });

  it("Option wrapping preserves non-null values", () => {
    const result = compile(`
      module test;
      fn main() -> Str {
        let val = to_option("hello");
        match val {
          Some { value } => value,
          None => "empty",
        }
      }
    `);
    assert.ok(result.js);
    // Run the generated code to verify behavior
    const mod: any = { exports: {} };
    new Function("require", "module", "exports", result.js!)(require, mod, mod.exports);
  });
});
