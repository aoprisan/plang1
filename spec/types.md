# PLang Type System Specification

## Overview

PLang uses a **static, structural type system** with **Hindley-Milner type inference** extended with effect types. Types are checked at compile time. The type system is designed so an AI can reason locally about correctness — every function signature tells you exactly what it does, what it needs, and what can go wrong.

## Primitive Types

| Type    | Description                    | Examples          |
|---------|--------------------------------|-------------------|
| `Int`   | 64-bit signed integer          | `42`, `-1`, `0`   |
| `Float` | 64-bit IEEE 754                | `3.14`, `-0.5`    |
| `Bool`  | Boolean                        | `true`, `false`   |
| `Char`  | Unicode scalar value           | `'a'`, `'Z'`      |
| `Str`   | UTF-8 string (immutable)       | `"hello"`         |
| `Void`  | Unit type (no meaningful value)| (implicit)        |

## Compound Types

### Records (Product Types)
```plang
type Point = { x: Float, y: Float };
type User = { name: Str, age: Int, email: Str };
```

Records are **structurally typed** — two record types with the same fields and field types are compatible:
```plang
type Vec2 = { x: Float, y: Float };
// Vec2 and Point are interchangeable
```

### Sum Types (Tagged Unions)
```plang
type Option<T> = Some { value: T } | None;
type Result<T, E> = Ok { value: T } | Err { error: E };
```

Sum types are **nominally typed** — you must use the declared type name.

### Collections
```plang
List<T>      // ordered, immutable sequence
Map<K, V>    // immutable hash map (K must implement Hash + Eq)
Set<T>       // immutable hash set (T must implement Hash + Eq)
```

### Function Types
```plang
(Int, Int) -> Int              // pure function
(Str) -> Str ! IoError         // function with effect
() -> Void                     // side-effect-only function
```

### Tuple Types
```plang
(Int, Str)         // pair
(Int, Str, Bool)   // triple
```

## Type Inference

PLang infers types wherever possible. Annotations are required on:
1. Function parameters
2. Function return types (including effects)

Everything else is inferred:
```plang
let x = 42;                     // inferred as Int
let names = ["alice", "bob"];   // inferred as List<Str>
let result = add(1, 2);        // inferred from add's return type
```

## Effect Types

Functions that perform side effects or can fail must declare their effects in the signature using `!`:

```plang
fn pure_fn(x: Int) -> Int { x + 1 }                         // no effects
fn fallible(x: Int) -> Int ! ValueError { ... }              // can fail
fn effectful(path: Str) -> Str ! IoError { ... }             // IO effect
fn multi_error(x: Str) -> Int ! ParseError | ValueError { .. } // multiple errors
```

Effects are **tracked and propagated** by the type checker:
- A function calling an effectful function must either handle the effect or declare it in its own signature
- The `!` postfix operator propagates errors to the caller
- `match` or `catch` can handle errors locally

## Generics

```plang
fn identity<T>(x: T) -> T { x }

fn map<A, B>(list: List<A>, f: (A) -> B) -> List<B> {
  for item in list { f(item) }
}
```

### Trait Bounds
```plang
fn sort<T: Ord>(list: List<T>) -> List<T> { ... }
fn print_all<T: Printable + Eq>(items: List<T>) -> Void ! IoError { ... }
```

## Subtyping Rules

1. **Records**: `{ a: Int, b: Str, c: Bool }` is a subtype of `{ a: Int, b: Str }` (width subtyping)
2. **Sum types**: No subtyping — must match exactly
3. **Effects**: `() -> T` is a subtype of `() -> T ! E` (pure functions are trivially effectful)

## Built-in Type Aliases

```plang
type Option<T> = Some { value: T } | None;
type Result<T, E> = Ok { value: T } | Err { error: E };
```
