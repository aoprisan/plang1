# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

PLang is a TypeScript-to-JavaScript transpiler for an AI-optimized programming language. PLang source files use the `.pl1` extension and compile to ES2022 JavaScript.

## Build & Test Commands

```bash
npm run build          # Compile TypeScript (runs tsc)
npm test               # Run all tests (must build first)
npm run build && npm test  # Build and test together

# Run a single test file:
node --test dist/tests/lexer.test.js

# Use the CLI:
node dist/cli.js compile <file.pl1> [-o output.js]
node dist/cli.js run <file.pl1>
node dist/cli.js test <file.pl1>
node dist/cli.js check <file.pl1>
```

Tests require building first — they run against compiled JS in `dist/`, not TypeScript source directly. The test framework is Node.js built-in `node:test` with `node:assert`.

## Compiler Pipeline Architecture

The compiler is a classic multi-stage pipeline in `src/`:

```
Source (.pl1) → Lexer → Token[] → Parser → AST → TypeChecker → CodeGenerator → JavaScript
```

- **`lexer.ts`** — Tokenizes PLang source into a token stream. Exports `Lexer`, `TokenType`, `LexerError`.
- **`parser.ts`** — Recursive descent parser producing an AST. Exports `Parser`, `ParseError`.
- **`ast.ts`** — All AST node type definitions. Every node has a `kind` discriminant and a `span` for source location tracking.
- **`typechecker.ts`** — Type checking with Hindley-Milner inference. Exports `TypeChecker`, `TypeCheckError`. Returns error array rather than throwing.
- **`codegen.ts`** — Generates JavaScript from AST. Has both `generate()` (normal code) and `generateTestRunner()` (for PLang's `test` blocks). Exports `CodeGenerator`.
- **`index.ts`** — Orchestrates the pipeline via `compile()` and `compileTests()` functions. Continues to codegen even with type errors (for development).
- **`cli.ts`** — CLI entry point with `compile`, `run`, `test`, `check` subcommands.

## Key Language Features to Know

PLang uses structural typing, `let` (immutable) / `var` (mutable) bindings, `Option<T>` / `Result<T, E>` instead of null/exceptions, `!` for error propagation, exhaustive `match`, `async`/`await` with structured concurrency (task groups, channels, select), `extern fn`/`extern module` for FFI to JavaScript, and built-in `test` blocks.

## Project Layout

- `src/` — Compiler source (TypeScript)
- `tests/` — Compiler tests (lexer, parser, codegen, ffi, async)
- `spec/` — Language specification (syntax.md, types.md, semantics.md)
- `grammar/plang.ebnf` — Formal EBNF grammar
- `stdlib/` — Standard library written in PLang
- `examples/` — Example `.pl1` programs
- `editors/vscode/` — VS Code syntax highlighting extension
- `dist/` — Build output (gitignored)
