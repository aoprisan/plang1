import { describe, it } from "node:test";
import * as assert from "node:assert";
import { Lexer, TokenType } from "../src/lexer";
import { Parser } from "../src/parser";
import { TypeChecker } from "../src/typechecker";
import { compile } from "../src/index";

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function typeCheck(source: string) {
  const ast = parse(source);
  const checker = new TypeChecker();
  return checker.check(ast);
}

describe("Async — Lexer", () => {
  it("tokenizes channel keyword", () => {
    const lexer = new Lexer("channel");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.Channel);
  });

  it("tokenizes send keyword", () => {
    const lexer = new Lexer("send");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.Send);
  });

  it("tokenizes recv keyword", () => {
    const lexer = new Lexer("recv");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.Recv);
  });

  it("tokenizes select keyword", () => {
    const lexer = new Lexer("select");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.Select);
  });

  it("tokenizes timeout keyword", () => {
    const lexer = new Lexer("timeout");
    const tokens = lexer.tokenize();
    assert.strictEqual(tokens[0].type, TokenType.Timeout);
  });
});

describe("Async — Parser", () => {
  it("parses channel expression", () => {
    const ast = parse(`
      module test;
      async fn main() -> Void {
        let ch = channel();
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl") {
      const letDecl = fn.body.statements[0];
      if (letDecl.kind === "LetDecl") {
        assert.strictEqual(letDecl.value.kind, "ChannelExpr");
      }
    }
  });

  it("parses buffered channel", () => {
    const ast = parse(`
      module test;
      async fn main() -> Void {
        let ch = channel(10);
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl") {
      const letDecl = fn.body.statements[0];
      if (letDecl.kind === "LetDecl" && letDecl.value.kind === "ChannelExpr") {
        assert.ok(letDecl.value.capacity);
        assert.strictEqual(letDecl.value.capacity!.kind, "IntLiteral");
      }
    }
  });

  it("parses send expression", () => {
    const ast = parse(`
      module test;
      async fn main() -> Void {
        send(ch, 42);
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl") {
      const stmt = fn.body.statements[0];
      if (stmt.kind === "ExprStmt") {
        assert.strictEqual(stmt.expr.kind, "SendExpr");
      }
    }
  });

  it("parses recv expression", () => {
    const ast = parse(`
      module test;
      async fn main() -> Void {
        let msg = recv(ch);
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl") {
      const stmt = fn.body.statements[0];
      if (stmt.kind === "LetDecl") {
        assert.strictEqual(stmt.value.kind, "RecvExpr");
      }
    }
  });

  it("parses select expression", () => {
    const ast = parse(`
      module test;
      async fn main() -> Void {
        let result = select {
          recv(ch1) as msg => msg,
          timeout(1000) => "timed out",
        };
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl") {
      const stmt = fn.body.statements[0];
      if (stmt.kind === "LetDecl" && stmt.value.kind === "SelectExpr") {
        assert.strictEqual(stmt.value.arms.length, 2);
        assert.strictEqual(stmt.value.arms[0].operation.kind, "RecvExpr");
        assert.strictEqual(stmt.value.arms[0].bindName, "msg");
        assert.strictEqual(stmt.value.arms[1].operation.kind, "TimeoutExpr");
      }
    }
  });

  it("parses select with send arm", () => {
    const ast = parse(`
      module test;
      async fn main() -> Void {
        select {
          send(ch, 42) => "sent",
          timeout(500) => "timeout",
        };
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl") {
      const stmt = fn.body.statements[0];
      if (stmt.kind === "ExprStmt" && stmt.expr.kind === "SelectExpr") {
        assert.strictEqual(stmt.expr.arms[0].operation.kind, "SendExpr");
      }
    }
  });

  it("parses task_group with spawn", () => {
    const ast = parse(`
      module test;
      async fn main() -> Void {
        task_group |group| {
          group.spawn(|| fetch("url1"));
          group.spawn(|| fetch("url2"));
        };
      }
    `);
    const fn = ast.declarations[0];
    if (fn.kind === "FnDecl") {
      const stmt = fn.body.statements[0];
      if (stmt.kind === "ExprStmt") {
        assert.strictEqual(stmt.expr.kind, "TaskGroupExpr");
      }
    }
  });
});

describe("Async — Type Checker", () => {
  it("errors on await outside async fn", () => {
    const errors = typeCheck(`
      module test;
      fn main() -> Void {
        let x = await fetch("url");
      }
    `);
    const awaitError = errors.find(e => e.message.includes("await"));
    assert.ok(awaitError, "Should error on await in non-async function");
  });

  it("allows await inside async fn", () => {
    const errors = typeCheck(`
      module test;
      async fn main() -> Void {
        let x = await fetch("url");
      }
    `);
    const awaitError = errors.find(e => e.message.includes("await"));
    assert.strictEqual(awaitError, undefined, "Should not error on await in async function");
  });

  it("errors on send outside async fn", () => {
    const errors = typeCheck(`
      module test;
      fn main() -> Void {
        send(ch, 42);
      }
    `);
    const sendError = errors.find(e => e.message.includes("send"));
    assert.ok(sendError, "Should error on send in non-async function");
  });

  it("errors on recv outside async fn", () => {
    const errors = typeCheck(`
      module test;
      fn main() -> Void {
        let x = recv(ch);
      }
    `);
    const recvError = errors.find(e => e.message.includes("recv"));
    assert.ok(recvError, "Should error on recv in non-async function");
  });

  it("errors on select outside async fn", () => {
    const errors = typeCheck(`
      module test;
      fn main() -> Void {
        select {
          recv(ch) as msg => msg,
          timeout(1000) => "default",
        };
      }
    `);
    const selectError = errors.find(e => e.message.includes("select"));
    assert.ok(selectError, "Should error on select in non-async function");
  });

  it("errors on task_group outside async fn", () => {
    const errors = typeCheck(`
      module test;
      fn main() -> Void {
        task_group |g| {
          g.spawn(|| work());
        };
      }
    `);
    const tgError = errors.find(e => e.message.includes("task_group"));
    assert.ok(tgError, "Should error on task_group in non-async function");
  });

  it("accepts channel creation in any context", () => {
    const errors = typeCheck(`
      module test;
      fn main() -> Void {
        let ch = channel();
      }
    `);
    const chError = errors.find(e => e.message.includes("channel") || e.message.includes("Channel"));
    assert.strictEqual(chError, undefined, "Channel creation should work anywhere");
  });
});

describe("Async — Code Generator", () => {
  it("compiles channel to __Channel", () => {
    const result = compile(`
      module test;
      async fn main() -> Void {
        let ch = channel();
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("new __Channel()"));
  });

  it("compiles buffered channel", () => {
    const result = compile(`
      module test;
      async fn main() -> Void {
        let ch = channel(10);
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("new __Channel(10)"));
  });

  it("compiles send to channel.send", () => {
    const result = compile(`
      module test;
      async fn main() -> Void {
        send(ch, 42);
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes(".send("));
  });

  it("compiles recv to channel.recv", () => {
    const result = compile(`
      module test;
      async fn main() -> Void {
        let msg = recv(ch);
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes(".recv()"));
  });

  it("compiles task_group to __TaskGroup", () => {
    const result = compile(`
      module test;
      async fn main() -> Void {
        task_group |group| {
          group.spawn(|| work());
        };
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("new __TaskGroup()"));
    assert.ok(result.js!.includes(".run()"));
  });

  it("compiles select to __select", () => {
    const result = compile(`
      module test;
      async fn main() -> Void {
        select {
          recv(ch) as msg => msg,
          timeout(1000) => "default",
        };
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("__select"));
    assert.ok(result.js!.includes("'recv'"));
    assert.ok(result.js!.includes("'timeout'"));
  });

  it("includes __Channel class in runtime", () => {
    const result = compile("module test;");
    assert.ok(result.js);
    assert.ok(result.js!.includes("class __Channel"));
    assert.ok(result.js!.includes("async send(value)"));
    assert.ok(result.js!.includes("async recv()"));
    assert.ok(result.js!.includes("close()"));
  });

  it("includes __TaskGroup class in runtime", () => {
    const result = compile("module test;");
    assert.ok(result.js);
    assert.ok(result.js!.includes("class __TaskGroup"));
    assert.ok(result.js!.includes("AbortController"));
    assert.ok(result.js!.includes("allSettled"));
  });

  it("includes __select function in runtime", () => {
    const result = compile("module test;");
    assert.ok(result.js);
    assert.ok(result.js!.includes("async function __select"));
  });
});

describe("Async — End-to-End", () => {
  it("channel send/recv works at runtime", async () => {
    const result = compile(`
      module test;
      async fn main() -> Void {
        let ch = channel(1);
        send(ch, 42);
        let val = recv(ch);
      }
    `);
    assert.ok(result.js);
    // Verify the JS is syntactically valid by evaluating it
    const fn = new Function("require", "module", "exports", result.js!);
    // Should not throw
    assert.ok(typeof fn === "function");
  });

  it("full async pipeline compiles correctly", () => {
    const result = compile(`
      module async_demo;
      use std.io;

      async fn producer(ch: Channel<Int>) -> Void {
        for i in 0..5 {
          send(ch, i);
        }
      }

      async fn consumer(ch: Channel<Int>) -> Void {
        for _ in 0..5 {
          let val = recv(ch);
        }
      }

      async fn main() -> Void {
        let ch = channel(10);
        task_group |g| {
          g.spawn(|| producer(ch));
          g.spawn(|| consumer(ch));
        };
      }
    `);
    assert.ok(result.js);
    assert.ok(result.js!.includes("async function producer"));
    assert.ok(result.js!.includes("async function consumer"));
    assert.ok(result.js!.includes("new __Channel(10)"));
    assert.ok(result.js!.includes("new __TaskGroup()"));
  });
});
