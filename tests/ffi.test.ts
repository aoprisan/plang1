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
});
