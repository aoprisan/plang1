# PLang Semantics Specification

## Evaluation Model

PLang uses **eager evaluation** with **left-to-right** evaluation order. All expressions are evaluated immediately when encountered.

## Values and Mutability

### Immutable Bindings (default)
```plang
let x = 42;
x = 43;  // COMPILE ERROR: cannot reassign immutable binding
```

### Mutable Bindings
```plang
var x = 42;
x = 43;  // OK
```

### Immutable Data Structures
All data structures are immutable. "Modification" produces a new value:
```plang
let point = Point { x: 1.0, y: 2.0 };
let moved = point with { x: 3.0 };  // new Point, original unchanged
```

## Control Flow

### If/Else
Always an expression. Both branches must have the same type. `else` is required unless the type is `Void`.
```plang
let abs = if x >= 0 { x } else { -x };
```

### Match
Exhaustive pattern matching. The compiler verifies all cases are covered.
```plang
match option {
  Some { value } => use(value),
  None => default_value,
}
```

### Loops
```plang
// For loop (iterates over anything implementing Iterable)
for item in collection {
  process(item);
}

// For as expression (produces a List)
let doubled = for x in items { x * 2 };

// While loop
while condition {
  do_work();
}
```

### Early Return
```plang
fn find<T>(list: List<T>, pred: (T) -> Bool) -> Option<T> {
  for item in list {
    if pred(item) { return Some { value: item }; }
  }
  None
}
```

## Error Handling

### Error Propagation
The `!` postfix operator on a `Result` expression:
- If `Ok { value }`, unwraps to `value`
- If `Err { error }`, returns the error from the current function

```plang
fn process(path: Str) -> Data ! IoError | ParseError {
  let content = read_file(path)!;   // propagates IoError
  let parsed = parse(content)!;      // propagates ParseError
  transform(parsed)
}
```

### Error Handling with Match
```plang
match read_file("config.json") {
  Ok { value } => use_config(value),
  Err { error } => use_defaults(),
}
```

### Error Handling with Catch
```plang
let config = catch read_file("config.json") {
  IoError => default_config(),
};
```

## Function Evaluation

### Closures
Closures capture variables from their environment by reference (immutable) or by copy (mutable):
```plang
let multiplier = 3;
let triple = |x: Int| -> Int { x * multiplier };
```

### Recursion
Direct and mutual recursion are supported. Tail-call optimization is guaranteed for self-recursive tail calls.
```plang
fn factorial(n: Int, acc: Int) -> Int {
  if n <= 1 { acc } else { factorial(n - 1, n * acc) }
}
```

### Pipe Operator
`a |> f(b)` is syntactic sugar for `f(a, b)`:
```plang
// These are equivalent:
sum(map(filter(data, pred), transform));
data |> filter(pred) |> map(transform) |> sum();
```

## Concurrency

### Async Functions
```plang
async fn fetch(url: Str) -> Response ! NetError {
  // implementation
}

async fn main() -> Void ! NetError {
  let response = await fetch("https://example.com");
}
```

### Task Groups (Structured Concurrency)
```plang
async fn fetch_all(urls: List<Str>) -> List<Response> ! NetError {
  task_group |group| {
    for url in urls {
      group.spawn(|| fetch(url));
    }
  }
  // All tasks complete before this point
}
```

## Contracts

### Preconditions
```plang
fn sqrt(x: Float) -> Float {
  require x >= 0.0;  // panics at runtime if violated
  // implementation
}
```

### Postconditions
```plang
fn abs(x: Int) -> Int {
  ensure |result| result >= 0;
  if x >= 0 { x } else { -x }
}
```

Contracts are checked at runtime in debug mode and can be stripped in release builds.

## Testing

Test blocks are first-class and collected by the test runner:
```plang
test "addition is commutative" {
  assert add(1, 2) == add(2, 1);
  assert add(0, 5) == 5;
}
```

Tests have access to all module-private items (no need for `pub` to test).
