// PLang Type Checker — validates types and infers missing type annotations

import * as AST from "./ast";

// Internal type representation
export type Type =
  | PrimitiveType
  | RecordTypeInfo
  | SumTypeInfo
  | FunctionTypeInfo
  | ListTypeInfo
  | MapTypeInfo
  | OptionTypeInfo
  | ResultTypeInfo
  | ChannelTypeInfo
  | TypeVar
  | VoidType;

export interface PrimitiveType { tag: "primitive"; name: "Int" | "Float" | "Bool" | "Char" | "Str"; }
export interface RecordTypeInfo { tag: "record"; name: string; fields: Map<string, Type>; }
export interface SumTypeInfo { tag: "sum"; name: string; variants: Map<string, Map<string, Type>>; }
export interface FunctionTypeInfo { tag: "function"; params: Type[]; returnType: Type; effects: Type[]; }
export interface ListTypeInfo { tag: "list"; elementType: Type; }
export interface MapTypeInfo { tag: "map"; keyType: Type; valueType: Type; }
export interface OptionTypeInfo { tag: "option"; innerType: Type; }
export interface ResultTypeInfo { tag: "result"; okType: Type; errType: Type; }
export interface ChannelTypeInfo { tag: "channel"; elementType: Type; }
export interface TypeVar { tag: "typevar"; name: string; id: number; resolved?: Type; }
export interface VoidType { tag: "void"; }

// Built-in types
const INT: PrimitiveType = { tag: "primitive", name: "Int" };
const FLOAT: PrimitiveType = { tag: "primitive", name: "Float" };
const BOOL: PrimitiveType = { tag: "primitive", name: "Bool" };
const CHAR: PrimitiveType = { tag: "primitive", name: "Char" };
const STR: PrimitiveType = { tag: "primitive", name: "Str" };
const VOID: VoidType = { tag: "void" };

export class TypeCheckError extends Error {
  constructor(
    message: string,
    public span: AST.SourceSpan,
  ) {
    super(`Type error at ${span.start.line}:${span.start.column}: ${message}`);
    this.name = "TypeCheckError";
  }
}

interface TypeEnv {
  variables: Map<string, Type>;
  types: Map<string, Type>;
  traits: Map<string, AST.TraitDecl>;
  parent?: TypeEnv;
  inAsync: boolean;
  currentFnEffects: Type[];
}

export class TypeChecker {
  private nextTypeVarId = 0;
  private globalEnv: TypeEnv;
  private errors: TypeCheckError[] = [];

  constructor() {
    const types = new Map<string, Type>();
    types.set("Int", INT);
    types.set("Float", FLOAT);
    types.set("Bool", BOOL);
    types.set("Char", CHAR);
    types.set("Str", STR);
    types.set("Void", VOID);

    this.globalEnv = {
      variables: new Map(),
      types,
      traits: new Map(),
      inAsync: false,
      currentFnEffects: [],
    };
  }

  check(program: AST.Program): TypeCheckError[] {
    this.errors = [];

    // First pass: register all type declarations
    for (const decl of program.declarations) {
      if (decl.kind === "TypeDecl") {
        this.registerTypeDecl(decl);
      }
    }

    // Second pass: register all function signatures
    for (const decl of program.declarations) {
      if (decl.kind === "FnDecl") {
        this.registerFnDecl(decl);
      }
    }

    // Third pass: check function bodies and expressions
    for (const decl of program.declarations) {
      this.checkDecl(decl, this.globalEnv);
    }

    return this.errors;
  }

  private registerTypeDecl(decl: AST.TypeDecl): void {
    const type = this.resolveTypeBody(decl.name, decl.body);
    this.globalEnv.types.set(decl.name, type);
  }

  private resolveTypeBody(name: string, body: AST.TypeBody): Type {
    switch (body.kind) {
      case "RecordTypeBody": {
        const fields = new Map<string, Type>();
        for (const field of body.fields) {
          fields.set(field.name, this.resolveTypeExpr(field.type));
        }
        return { tag: "record", name, fields };
      }
      case "SumTypeBody": {
        const variants = new Map<string, Map<string, Type>>();
        for (const variant of body.variants) {
          const fields = new Map<string, Type>();
          for (const field of variant.fields) {
            fields.set(field.name, this.resolveTypeExpr(field.type));
          }
          variants.set(variant.name, fields);
        }
        return { tag: "sum", name, variants };
      }
      case "AliasTypeBody":
        return this.resolveTypeExpr(body.type);
    }
  }

  private resolveTypeExpr(typeExpr: AST.TypeExpr): Type {
    switch (typeExpr.kind) {
      case "NamedType": {
        const resolved = this.globalEnv.types.get(typeExpr.name);
        if (!resolved) {
          // Could be a type variable or forward reference
          if (typeExpr.name === "List" && typeExpr.typeArgs.length === 1) {
            return { tag: "list", elementType: this.resolveTypeExpr(typeExpr.typeArgs[0]) };
          }
          if (typeExpr.name === "Map" && typeExpr.typeArgs.length === 2) {
            return {
              tag: "map",
              keyType: this.resolveTypeExpr(typeExpr.typeArgs[0]),
              valueType: this.resolveTypeExpr(typeExpr.typeArgs[1]),
            };
          }
          if (typeExpr.name === "Channel" && typeExpr.typeArgs.length === 1) {
            return { tag: "channel", elementType: this.resolveTypeExpr(typeExpr.typeArgs[0]) };
          }
          if (typeExpr.name === "Option" && typeExpr.typeArgs.length === 1) {
            return { tag: "option", innerType: this.resolveTypeExpr(typeExpr.typeArgs[0]) };
          }
          if (typeExpr.name === "Result" && typeExpr.typeArgs.length === 2) {
            return {
              tag: "result",
              okType: this.resolveTypeExpr(typeExpr.typeArgs[0]),
              errType: this.resolveTypeExpr(typeExpr.typeArgs[1]),
            };
          }
          // Treat as a type variable for generics
          return this.freshTypeVar(typeExpr.name);
        }
        return resolved;
      }
      case "FunctionType": {
        return {
          tag: "function",
          params: typeExpr.params.map(p => this.resolveTypeExpr(p)),
          returnType: this.resolveTypeExpr(typeExpr.returnType),
          effects: typeExpr.effects.map(e => this.resolveTypeExpr(e)),
        };
      }
      case "TupleType": {
        const fields = new Map<string, Type>();
        typeExpr.elements.forEach((el, i) => {
          fields.set(`_${i}`, this.resolveTypeExpr(el));
        });
        return { tag: "record", name: "$Tuple", fields };
      }
      case "RecordType": {
        const fields = new Map<string, Type>();
        for (const field of typeExpr.fields) {
          fields.set(field.name, this.resolveTypeExpr(field.type));
        }
        return { tag: "record", name: "$Anonymous", fields };
      }
    }
  }

  private registerFnDecl(decl: AST.FnDecl): void {
    const paramTypes = decl.params.map(p => this.resolveTypeExpr(p.type));
    const returnType = decl.returnType ? this.resolveTypeExpr(decl.returnType) : VOID;
    const effects = decl.effects.map(e => this.resolveTypeExpr(e));

    const fnType: FunctionTypeInfo = {
      tag: "function",
      params: paramTypes,
      returnType,
      effects,
    };

    this.globalEnv.variables.set(decl.name, fnType);
  }

  private checkDecl(decl: AST.TopLevelDecl, env: TypeEnv): void {
    switch (decl.kind) {
      case "FnDecl":
        this.checkFnDecl(decl, env);
        break;
      case "LetDecl":
        this.checkLetDecl(decl, env);
        break;
      case "TestDecl":
        this.checkTestDecl(decl, env);
        break;
      case "TypeDecl":
      case "TraitDecl":
      case "ImplDecl":
        // Already handled in registration passes
        break;
    }
  }

  private checkFnDecl(decl: AST.FnDecl, env: TypeEnv): void {
    const fnEnv = this.childEnv(env);
    fnEnv.inAsync = decl.isAsync;
    fnEnv.currentFnEffects = decl.effects.map(e => this.resolveTypeExpr(e));

    // Add parameters to scope
    for (const param of decl.params) {
      fnEnv.variables.set(param.name, this.resolveTypeExpr(param.type));
    }

    // Check body
    const bodyType = this.checkBlock(decl.body, fnEnv);

    // Verify return type
    if (decl.returnType) {
      const expectedReturn = this.resolveTypeExpr(decl.returnType);
      if (!this.isAssignable(bodyType, expectedReturn)) {
        this.errors.push(new TypeCheckError(
          `Function '${decl.name}' returns ${this.typeToString(bodyType)} but declared ${this.typeToString(expectedReturn)}`,
          decl.span,
        ));
      }
    }
  }

  private checkLetDecl(decl: AST.LetDecl, env: TypeEnv): void {
    const valueType = this.inferExpr(decl.value, env);
    if (decl.type) {
      const declaredType = this.resolveTypeExpr(decl.type);
      if (!this.isAssignable(valueType, declaredType)) {
        this.errors.push(new TypeCheckError(
          `Cannot assign ${this.typeToString(valueType)} to ${this.typeToString(declaredType)}`,
          decl.span,
        ));
      }
    }
    env.variables.set(decl.name, decl.type ? this.resolveTypeExpr(decl.type) : valueType);
  }

  private checkTestDecl(decl: AST.TestDecl, env: TypeEnv): void {
    const testEnv = this.childEnv(env);
    this.checkBlock(decl.body, testEnv);
  }

  private checkBlock(block: AST.BlockExpr, env: TypeEnv): Type {
    const blockEnv = this.childEnv(env);

    for (const stmt of block.statements) {
      this.checkStatement(stmt, blockEnv);
    }

    if (block.finalExpr) {
      return this.inferExpr(block.finalExpr, blockEnv);
    }

    return VOID;
  }

  private checkStatement(stmt: AST.Statement, env: TypeEnv): void {
    switch (stmt.kind) {
      case "LetDecl":
        this.checkLetDecl(stmt, env);
        break;
      case "VarDecl": {
        const valueType = this.inferExpr(stmt.value, env);
        env.variables.set(stmt.name, stmt.type ? this.resolveTypeExpr(stmt.type) : valueType);
        break;
      }
      case "AssignStmt": {
        const varType = this.lookupVariable(stmt.target, env, stmt.span);
        const valueType = this.inferExpr(stmt.value, env);
        if (varType && !this.isAssignable(valueType, varType)) {
          this.errors.push(new TypeCheckError(
            `Cannot assign ${this.typeToString(valueType)} to ${this.typeToString(varType)}`,
            stmt.span,
          ));
        }
        break;
      }
      case "ExprStmt":
        this.inferExpr(stmt.expr, env);
        break;
      case "RequireStmt": {
        const condType = this.inferExpr(stmt.condition, env);
        if (condType.tag !== "primitive" || condType.name !== "Bool") {
          this.errors.push(new TypeCheckError(
            `Require condition must be Bool, got ${this.typeToString(condType)}`,
            stmt.span,
          ));
        }
        break;
      }
      case "EnsureStmt": {
        const ensureEnv = this.childEnv(env);
        ensureEnv.variables.set(stmt.paramName, this.freshTypeVar(stmt.paramName));
        const condType = this.inferExpr(stmt.condition, ensureEnv);
        if (condType.tag !== "primitive" || condType.name !== "Bool") {
          this.errors.push(new TypeCheckError(
            `Ensure condition must be Bool, got ${this.typeToString(condType)}`,
            stmt.span,
          ));
        }
        break;
      }
    }
  }

  private inferExpr(expr: AST.Expr, env: TypeEnv): Type {
    switch (expr.kind) {
      case "IntLiteral": return INT;
      case "FloatLiteral": return FLOAT;
      case "StrLiteral": return STR;
      case "CharLiteral": return CHAR;
      case "BoolLiteral": return BOOL;

      case "Identifier": {
        const type = this.lookupVariable(expr.name, env, expr.span);
        return type ?? this.freshTypeVar(expr.name);
      }

      case "BinaryExpr":
        return this.inferBinaryExpr(expr, env);

      case "UnaryExpr": {
        const operandType = this.inferExpr(expr.operand, env);
        if (expr.operator === "!") return BOOL;
        if (expr.operator === "-") return operandType;
        return operandType;
      }

      case "CallExpr":
        return this.inferCallExpr(expr, env);

      case "MemberExpr": {
        const objType = this.inferExpr(expr.object, env);
        if (objType.tag === "record") {
          const fieldType = objType.fields.get(expr.member);
          if (fieldType) return fieldType;
        }
        // Could be a method call — return a type variable for now
        return this.freshTypeVar(`${expr.member}_result`);
      }

      case "PropagateExpr": {
        const innerType = this.inferExpr(expr.expr, env);
        if (innerType.tag === "result") return innerType.okType;
        return innerType;
      }

      case "IfExpr": {
        const condType = this.inferExpr(expr.condition, env);
        if (condType.tag !== "primitive" || condType.name !== "Bool") {
          this.errors.push(new TypeCheckError(
            `If condition must be Bool, got ${this.typeToString(condType)}`,
            expr.span,
          ));
        }
        const thenType = this.checkBlock(expr.then, env);
        if (expr.else_) {
          const elseType = expr.else_.kind === "IfExpr"
            ? this.inferExpr(expr.else_, env)
            : this.checkBlock(expr.else_, env);
          // Both branches should return the same type
          if (!this.isAssignable(elseType, thenType)) {
            this.errors.push(new TypeCheckError(
              `If branches have different types: ${this.typeToString(thenType)} vs ${this.typeToString(elseType)}`,
              expr.span,
            ));
          }
        }
        return thenType;
      }

      case "MatchExpr": {
        this.inferExpr(expr.subject, env);
        let resultType: Type | null = null;
        for (const arm of expr.arms) {
          const armEnv = this.childEnv(env);
          this.bindPattern(arm.pattern, armEnv);
          const armType = this.inferExpr(arm.body, armEnv);
          if (!resultType) resultType = armType;
        }
        return resultType ?? VOID;
      }

      case "ForExpr": {
        const iterableType = this.inferExpr(expr.iterable, env);
        const forEnv = this.childEnv(env);
        if (iterableType.tag === "list") {
          forEnv.variables.set(expr.variable, iterableType.elementType);
        } else {
          forEnv.variables.set(expr.variable, this.freshTypeVar(expr.variable));
        }
        const bodyType = this.checkBlock(expr.body, forEnv);
        return { tag: "list", elementType: bodyType };
      }

      case "WhileExpr": {
        const condType = this.inferExpr(expr.condition, env);
        if (condType.tag !== "primitive" || condType.name !== "Bool") {
          this.errors.push(new TypeCheckError(
            `While condition must be Bool, got ${this.typeToString(condType)}`,
            expr.span,
          ));
        }
        this.checkBlock(expr.body, env);
        return VOID;
      }

      case "BlockExpr":
        return this.checkBlock(expr, env);

      case "LambdaExpr": {
        const lambdaEnv = this.childEnv(env);
        const paramTypes = expr.params.map(p => {
          const type = this.resolveTypeExpr(p.type);
          lambdaEnv.variables.set(p.name, type);
          return type;
        });
        const bodyType = this.checkBlock(expr.body, lambdaEnv);
        return { tag: "function", params: paramTypes, returnType: bodyType, effects: [] };
      }

      case "ListExpr": {
        if (expr.elements.length === 0) {
          return { tag: "list", elementType: this.freshTypeVar("T") };
        }
        const elemType = this.inferExpr(expr.elements[0], env);
        for (let i = 1; i < expr.elements.length; i++) {
          this.inferExpr(expr.elements[i], env);
        }
        return { tag: "list", elementType: elemType };
      }

      case "RecordExpr": {
        const fields = new Map<string, Type>();
        for (const field of expr.fields) {
          fields.set(field.name, this.inferExpr(field.value, env));
        }
        return { tag: "record", name: expr.typeName, fields };
      }

      case "RecordUpdateExpr": {
        return this.inferExpr(expr.base, env);
      }

      case "PipeExpr": {
        this.inferExpr(expr.left, env);
        return this.inferCallExpr(expr.right, env);
      }

      case "ReturnExpr":
        if (expr.value) this.inferExpr(expr.value, env);
        return VOID;

      case "BreakExpr":
      case "ContinueExpr":
        return VOID;

      case "AwaitExpr": {
        if (!this.isInAsync(env)) {
          this.errors.push(new TypeCheckError(
            "'await' can only be used inside an async function",
            expr.span,
          ));
        }
        return this.inferExpr(expr.expr, env);
      }

      case "TaskGroupExpr": {
        if (!this.isInAsync(env)) {
          this.errors.push(new TypeCheckError(
            "'task_group' can only be used inside an async function",
            expr.span,
          ));
        }
        const tgEnv = this.childEnv(env);
        tgEnv.inAsync = true;
        return this.checkBlock(expr.body, tgEnv);
      }

      case "ChannelExpr": {
        if (expr.capacity) {
          const capType = this.inferExpr(expr.capacity, env);
          if (capType.tag !== "primitive" || capType.name !== "Int") {
            this.errors.push(new TypeCheckError(
              `Channel capacity must be Int, got ${this.typeToString(capType)}`,
              expr.span,
            ));
          }
        }
        return { tag: "channel", elementType: this.freshTypeVar("T") } as ChannelTypeInfo;
      }

      case "SendExpr": {
        if (!this.isInAsync(env)) {
          this.errors.push(new TypeCheckError(
            "'send' can only be used inside an async function",
            expr.span,
          ));
        }
        const chType = this.inferExpr(expr.channel, env);
        this.inferExpr(expr.value, env);
        if (chType.tag !== "channel" && chType.tag !== "typevar") {
          this.errors.push(new TypeCheckError(
            `send expects a Channel, got ${this.typeToString(chType)}`,
            expr.span,
          ));
        }
        return VOID;
      }

      case "RecvExpr": {
        if (!this.isInAsync(env)) {
          this.errors.push(new TypeCheckError(
            "'recv' can only be used inside an async function",
            expr.span,
          ));
        }
        const chType = this.inferExpr(expr.channel, env);
        if (chType.tag === "channel") return chType.elementType;
        return this.freshTypeVar("recv_result");
      }

      case "SelectExpr": {
        if (!this.isInAsync(env)) {
          this.errors.push(new TypeCheckError(
            "'select' can only be used inside an async function",
            expr.span,
          ));
        }
        let resultType: Type | null = null;
        for (const arm of expr.arms) {
          const armEnv = this.childEnv(env);
          armEnv.inAsync = true;
          if (arm.bindName) {
            armEnv.variables.set(arm.bindName, this.freshTypeVar(arm.bindName));
          }
          const armType = this.inferExpr(arm.body, armEnv);
          if (!resultType) resultType = armType;
        }
        return resultType ?? VOID;
      }

      case "TimeoutExpr": {
        const durType = this.inferExpr(expr.duration, env);
        if (durType.tag !== "primitive" || durType.name !== "Int") {
          this.errors.push(new TypeCheckError(
            `timeout duration must be Int, got ${this.typeToString(durType)}`,
            expr.span,
          ));
        }
        return VOID;
      }

      case "AssertExpr": {
        const condType = this.inferExpr(expr.condition, env);
        if (condType.tag !== "primitive" || condType.name !== "Bool") {
          this.errors.push(new TypeCheckError(
            `Assert condition must be Bool, got ${this.typeToString(condType)}`,
            expr.span,
          ));
        }
        return VOID;
      }

      case "RangeExpr": {
        this.inferExpr(expr.start, env);
        this.inferExpr(expr.end, env);
        return { tag: "list", elementType: INT };
      }

      default:
        return this.freshTypeVar("unknown");
    }
  }

  private inferBinaryExpr(expr: AST.BinaryExpr, env: TypeEnv): Type {
    const leftType = this.inferExpr(expr.left, env);
    const rightType = this.inferExpr(expr.right, env);

    switch (expr.operator) {
      case "+": case "-": case "*": case "/": case "%":
        return leftType; // numeric operations preserve type
      case "++":
        return STR; // string concatenation
      case "==": case "!=": case "<": case ">": case "<=": case ">=": case "~=":
        return BOOL;
      case "&&": case "||":
        return BOOL;
      default:
        return leftType;
    }
  }

  private inferCallExpr(expr: AST.CallExpr, env: TypeEnv): Type {
    const calleeType = this.inferExpr(expr.callee, env);
    if (calleeType.tag === "function") {
      return calleeType.returnType;
    }
    return this.freshTypeVar("call_result");
  }

  private bindPattern(pattern: AST.Pattern, env: TypeEnv): void {
    switch (pattern.kind) {
      case "IdentifierPattern":
        env.variables.set(pattern.name, this.freshTypeVar(pattern.name));
        break;
      case "VariantPattern":
        for (const field of pattern.fields) {
          if (!field.isRest) {
            env.variables.set(field.name, this.freshTypeVar(field.name));
            if (field.pattern) this.bindPattern(field.pattern, env);
          }
        }
        break;
      case "ListPattern":
        for (const elem of pattern.elements) {
          this.bindPattern(elem, env);
        }
        break;
      case "WildcardPattern":
      case "LiteralPattern":
        break;
    }
  }

  // === Utility ===

  private lookupVariable(name: string, env: TypeEnv, span: AST.SourceSpan): Type | null {
    let current: TypeEnv | undefined = env;
    while (current) {
      const type = current.variables.get(name);
      if (type) return type;
      current = current.parent;
    }
    // Don't report error for built-in functions that might not be registered
    return null;
  }

  private isAssignable(source: Type, target: Type): boolean {
    // Type variables are always assignable (for now — full unification later)
    if (source.tag === "typevar" || target.tag === "typevar") return true;
    if (source.tag === "void" && target.tag === "void") return true;

    if (source.tag === "primitive" && target.tag === "primitive") {
      return source.name === target.name;
    }

    if (source.tag === "list" && target.tag === "list") {
      return this.isAssignable(source.elementType, target.elementType);
    }

    if (source.tag === "record" && target.tag === "record") {
      // Structural subtyping: source must have all fields of target
      for (const [name, targetFieldType] of target.fields) {
        const sourceFieldType = source.fields.get(name);
        if (!sourceFieldType) return false;
        if (!this.isAssignable(sourceFieldType, targetFieldType)) return false;
      }
      return true;
    }

    if (source.tag === "function" && target.tag === "function") {
      if (source.params.length !== target.params.length) return false;
      return this.isAssignable(source.returnType, target.returnType);
    }

    return source.tag === target.tag;
  }

  private isInAsync(env: TypeEnv): boolean {
    let current: TypeEnv | undefined = env;
    while (current) {
      if (current.inAsync) return true;
      current = current.parent;
    }
    return false;
  }

  private freshTypeVar(name: string): TypeVar {
    return { tag: "typevar", name, id: this.nextTypeVarId++ };
  }

  private childEnv(parent: TypeEnv): TypeEnv {
    return {
      variables: new Map(),
      types: new Map(),
      traits: new Map(),
      parent,
      inAsync: parent.inAsync,
      currentFnEffects: parent.currentFnEffects,
    };
  }

  typeToString(type: Type): string {
    switch (type.tag) {
      case "primitive": return type.name;
      case "void": return "Void";
      case "record": return type.name;
      case "sum": return type.name;
      case "function": return `(${type.params.map(p => this.typeToString(p)).join(", ")}) -> ${this.typeToString(type.returnType)}`;
      case "list": return `List<${this.typeToString(type.elementType)}>`;
      case "map": return `Map<${this.typeToString(type.keyType)}, ${this.typeToString(type.valueType)}>`;
      case "option": return `Option<${this.typeToString(type.innerType)}>`;
      case "result": return `Result<${this.typeToString(type.okType)}, ${this.typeToString(type.errType)}>`;
      case "channel": return `Channel<${this.typeToString(type.elementType)}>`;
      case "typevar": return type.resolved ? this.typeToString(type.resolved) : `?${type.name}`;
    }
  }
}
