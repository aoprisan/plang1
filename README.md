# PLang

An AI-optimized general-purpose programming language.

PLang is designed from the ground up to be easy for AI/LLMs to generate, understand, and reason about — while remaining readable and practical for human developers.

## Key Features

- **Explicit over implicit** — no hidden control flow, no implicit conversions
- **Expression-oriented** — everything returns a value
- **Static structural typing** with full type inference
- **Effect annotations** — function signatures declare their side effects and errors
- **Immutable by default** — `let` bindings are immutable, `var` opts into mutability
- **No null, no exceptions** — `Option<T>` and `Result<T, E>` with `!` propagation
- **Built-in testing & contracts** — `test` blocks and `require`/`ensure` are first-class
- **Structured concurrency** — `async`/`await` with task groups, no shared mutable state

## Quick Start

```bash
npm install
npm run build
npx plang run examples/hello.pl1
```

## Example

```plang
module hello;

use std.io;

fn main() -> Void ! IoError {
  println("Hello, world!")!;
}

test "greeting" {
  assert greet("PLang") == "Hello, PLang!";
}
```

## Architecture

PLang transpiles to JavaScript via a TypeScript-based compiler pipeline:

```
.pl1 source → Lexer → Parser → AST → Type Checker → JS Code Generator → .js output
```

## Project Structure

```
spec/          Language specification
grammar/       Formal EBNF grammar
examples/      Example PLang programs
src/           Transpiler source (TypeScript)
stdlib/        Standard library (PLang)
tests/         Transpiler test suite
```

## License

MIT
