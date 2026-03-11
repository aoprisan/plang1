# PLang Syntax Specification

## Design Rationale

PLang syntax is designed for **unambiguous parsing** by both humans and AI. Every construct has exactly one syntactic form. There are no optional semicolons, no significant whitespace, and no context-dependent parsing.

## Lexical Elements

### Comments
```plang
// Single-line comment

/* Multi-line
   comment */
```

### Identifiers
- Must start with a letter or underscore
- Can contain letters, digits, and underscores
- Convention: `snake_case` for values/functions, `PascalCase` for types
- Pattern: `[a-zA-Z_][a-zA-Z0-9_]*`

### Literals
```plang
42              // Int
3.14            // Float
"hello"         // Str (double quotes only)
'c'             // Char (single quotes, single character)
true            // Bool
false           // Bool
[1, 2, 3]       // List<Int>
{a: 1, b: 2}   // Record literal
```

### Keywords
```
let var fn pub type trait impl use module
if else match for while return break continue
async await spawn test require ensure assert
true false
```

### Operators
```
+  -  *  /  %           // arithmetic
== != < > <= >=          // comparison
&& || !                  // logical
|> :: ..                 // pipe, cons, range
= += -= *= /=           // assignment
!                        // error propagation (postfix)
~=                       // approximate equality (floats)
```

## Declarations

### Module Declaration
Every file must begin with a module declaration:
```plang
module my_app.utils;
```

### Imports
```plang
use std.io;                    // import entire module
use std.io.{println, readln};  // import specific items
use std.math as m;             // aliased import
```

### Variable Bindings
```plang
let x: Int = 42;        // immutable, explicit type
let y = "hello";         // immutable, inferred type
var counter = 0;         // mutable
counter = counter + 1;   // reassignment (only var)
```

### Functions
```plang
fn add(a: Int, b: Int) -> Int {
  a + b
}

// With effects
fn read_config(path: Str) -> Config ! IoError | ParseError {
  let content = read_file(path)!;
  parse(content)!
}

// Generic
fn first<T>(list: List<T>) -> Option<T> {
  match list {
    [] => None,
    [head, ..] => Some(head),
  }
}

// Lambda
let double = |x: Int| -> Int { x * 2 };
```

### Type Definitions
```plang
// Record type
type Point = { x: Float, y: Float };

// Sum type (tagged union)
type Shape =
  | Circle { radius: Float }
  | Rect { width: Float, height: Float }
  | Triangle { a: Float, b: Float, c: Float };

// Type alias
type UserId = Int;

// Generic type
type Pair<A, B> = { first: A, second: B };
```

### Traits
```plang
trait Eq {
  fn eq(self, other: Self) -> Bool;
  fn neq(self, other: Self) -> Bool {
    !(self.eq(other))
  }
}

impl Eq for Point {
  fn eq(self, other: Point) -> Bool {
    self.x == other.x && self.y == other.y
  }
}
```

## Expressions

### If Expression
```plang
let max = if a > b { a } else { b };
```

### Match Expression
```plang
let description = match shape {
  Circle { radius } => "circle with radius " ++ radius.to_string(),
  Rect { width, height } => "rectangle " ++ width.to_string() ++ "x" ++ height.to_string(),
  Triangle { .. } => "triangle",
};
```

### For Expression
```plang
let squares = for x in 1..10 {
  x * x
};
```

### Block Expression
The last expression in a block is its value:
```plang
let result = {
  let a = compute_a();
  let b = compute_b();
  a + b
};
```

### Pipe Operator
```plang
let result = data
  |> filter(|x| x > 0)
  |> map(|x| x * 2)
  |> sum();
```

## Statements

Statements are expressions followed by semicolons:
```plang
let x = 42;
println("hello")!;
var y = 0;
y = y + 1;
```

The last expression in a block does NOT require a semicolon (it becomes the block's return value).
