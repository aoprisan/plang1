// PLang Parser — recursive descent parser producing AST

import { Token, TokenType } from "./lexer";
import * as AST from "./ast";

export class ParseError extends Error {
  constructor(
    message: string,
    public token: Token,
  ) {
    super(`Parse error at ${token.line}:${token.column}: ${message} (got '${token.value}')`);
    this.name = "ParseError";
  }
}

export class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private file: string;

  constructor(tokens: Token[], file: string = "<stdin>") {
    this.tokens = tokens;
    this.file = file;
  }

  parse(): AST.Program {
    const start = this.current();
    const module = this.parseModuleDecl();
    const imports: AST.ImportDecl[] = [];
    while (this.check(TokenType.Use)) {
      imports.push(this.parseImportDecl());
    }
    const declarations: AST.TopLevelDecl[] = [];
    while (!this.check(TokenType.EOF)) {
      declarations.push(this.parseTopLevelDecl());
    }
    return {
      kind: "Program",
      module,
      imports,
      declarations,
      span: this.spanFrom(start),
    };
  }

  // === Module & Imports ===

  private parseModuleDecl(): AST.ModuleDecl {
    const start = this.current();
    this.expect(TokenType.Module);
    const path = this.parseModulePath();
    this.expect(TokenType.Semicolon);
    return { kind: "ModuleDecl", path, span: this.spanFrom(start) };
  }

  private parseModulePath(): string[] {
    const parts = [this.expectIdentOrKeyword().value];
    while (this.check(TokenType.Dot) && !this.peekIs(1, TokenType.LBrace)) {
      this.advance(); // consume dot
      parts.push(this.expectIdentOrKeyword().value);
    }
    return parts;
  }

  private expectIdentOrKeyword(): Token {
    const tok = this.current();
    // Allow keywords to be used as identifiers in module paths
    if (tok.type === TokenType.Identifier || tok.type === TokenType.Test ||
        tok.type === TokenType.Type || tok.type === TokenType.Match ||
        tok.type === TokenType.Self || tok.type === TokenType.As) {
      return this.advance();
    }
    return this.expect(TokenType.Identifier);
  }

  private expectMemberName(): Token {
    const tok = this.current();
    // Allow identifiers and any keyword as member names (e.g., app.use, app.delete, ch.send)
    if (tok.type === TokenType.Identifier || tok.type === TokenType.EOF) {
      return tok.type === TokenType.EOF
        ? this.expect(TokenType.Identifier)
        : this.advance();
    }
    // Any keyword can be used as a member name after '.'
    if (tok.value && /^[a-zA-Z_]/.test(tok.value)) {
      return this.advance();
    }
    return this.expect(TokenType.Identifier);
  }

  private parseImportDecl(): AST.ImportDecl {
    const start = this.current();
    this.expect(TokenType.Use);
    const path = this.parseModulePath();

    let items: string[] | undefined;
    let alias: string | undefined;

    if (this.match(TokenType.Dot)) {
      this.expect(TokenType.LBrace);
      items = [this.expect(TokenType.Identifier).value];
      while (this.match(TokenType.Comma)) {
        items.push(this.expect(TokenType.Identifier).value);
      }
      this.expect(TokenType.RBrace);
    } else if (this.match(TokenType.As)) {
      alias = this.expect(TokenType.Identifier).value;
    }

    this.expect(TokenType.Semicolon);
    return { kind: "ImportDecl", path, items, alias, span: this.spanFrom(start) };
  }

  // === Top-Level Declarations ===

  private parseTopLevelDecl(): AST.TopLevelDecl {
    if (this.check(TokenType.Test)) return this.parseTestDecl();

    const isPublic = this.match(TokenType.Pub);

    if (this.check(TokenType.Extern)) {
      return this.parseExternDecl(isPublic);
    }

    const isAsync = this.check(TokenType.Async);

    if (this.check(TokenType.Fn) || isAsync) {
      return this.parseFnDecl(isPublic);
    }
    if (this.check(TokenType.Type)) {
      return this.parseTypeDecl(isPublic);
    }
    if (this.check(TokenType.Trait)) {
      return this.parseTraitDecl(isPublic);
    }
    if (this.check(TokenType.Impl)) {
      return this.parseImplDecl();
    }
    if (this.check(TokenType.Let)) {
      return this.parseLetDecl();
    }

    throw new ParseError("Expected declaration", this.current());
  }

  // === Functions ===

  private parseFnDecl(isPublic: boolean): AST.FnDecl {
    const start = this.current();
    const isAsync = this.match(TokenType.Async);
    this.expect(TokenType.Fn);
    const name = this.expect(TokenType.Identifier).value;
    const typeParams = this.check(TokenType.Lt) ? this.parseTypeParams() : [];
    this.expect(TokenType.LParen);
    const params = this.parseParamList();
    this.expect(TokenType.RParen);

    let returnType: AST.TypeExpr | undefined;
    let effects: AST.TypeExpr[] = [];
    if (this.match(TokenType.Arrow)) {
      returnType = this.parseTypeExpr();
      if (this.match(TokenType.Bang)) {
        effects = this.parseEffectTypes();
      }
    }

    const body = this.parseBlock();

    return {
      kind: "FnDecl",
      name,
      isPublic,
      isAsync,
      typeParams,
      params,
      returnType,
      effects,
      body,
      span: this.spanFrom(start),
    };
  }

  private parseParamList(): AST.Param[] {
    const params: AST.Param[] = [];
    if (this.check(TokenType.RParen)) return params;

    // Handle 'self' parameter
    if (this.check(TokenType.Self)) {
      const start = this.current();
      this.advance();
      params.push({
        kind: "Param",
        name: "self",
        type: { kind: "NamedType", name: "Self", typeArgs: [], span: this.spanFrom(start) },
        span: this.spanFrom(start),
      });
      if (this.match(TokenType.Comma) && this.check(TokenType.RParen)) {
        // trailing comma after self
      } else if (!this.check(TokenType.RParen)) {
        // more params after self
      } else {
        return params;
      }
    }

    if (!this.check(TokenType.RParen)) {
      params.push(this.parseParam());
      while (this.match(TokenType.Comma)) {
        if (this.check(TokenType.RParen)) break;
        params.push(this.parseParam());
      }
    }

    return params;
  }

  private parseParam(): AST.Param {
    const start = this.current();
    const name = this.expect(TokenType.Identifier).value;
    this.expect(TokenType.Colon);
    const type = this.parseTypeExpr();
    return { kind: "Param", name, type, span: this.spanFrom(start) };
  }

  private parseTypeParams(): AST.TypeParam[] {
    this.expect(TokenType.Lt);
    const params: AST.TypeParam[] = [];
    params.push(this.parseTypeParam());
    while (this.match(TokenType.Comma)) {
      params.push(this.parseTypeParam());
    }
    this.expect(TokenType.Gt);
    return params;
  }

  private parseTypeParam(): AST.TypeParam {
    const start = this.current();
    const name = this.expect(TokenType.Identifier).value;
    const bounds: string[] = [];
    if (this.match(TokenType.Colon)) {
      bounds.push(this.expect(TokenType.Identifier).value);
      while (this.match(TokenType.Plus)) {
        bounds.push(this.expect(TokenType.Identifier).value);
      }
    }
    return { kind: "TypeParam", name, bounds, span: this.spanFrom(start) };
  }

  private parseEffectTypes(): AST.TypeExpr[] {
    const effects: AST.TypeExpr[] = [this.parseTypeExpr()];
    while (this.match(TokenType.Pipe)) {
      effects.push(this.parseTypeExpr());
    }
    return effects;
  }

  // === Type Declarations ===

  private parseTypeDecl(isPublic: boolean): AST.TypeDecl {
    const start = this.current();
    this.expect(TokenType.Type);
    const name = this.expect(TokenType.Identifier).value;
    const typeParams = this.check(TokenType.Lt) ? this.parseTypeParams() : [];
    this.expect(TokenType.Eq);

    let body: AST.TypeBody;
    if (this.check(TokenType.Pipe) || (this.check(TokenType.Identifier) && this.peekIs(1, TokenType.LBrace) && !this.peekIs(1, TokenType.Colon))) {
      body = this.parseSumType(start);
    } else if (this.check(TokenType.LBrace)) {
      body = this.parseRecordTypeBody(start);
    } else {
      const type = this.parseTypeExpr();
      body = { kind: "AliasTypeBody", type, span: this.spanFrom(start) };
    }

    this.expect(TokenType.Semicolon);
    return { kind: "TypeDecl", name, isPublic, typeParams, body, span: this.spanFrom(start) };
  }

  private parseSumType(start: Token): AST.SumTypeBody {
    const variants: AST.Variant[] = [];
    this.match(TokenType.Pipe); // optional leading pipe
    variants.push(this.parseVariant());
    while (this.match(TokenType.Pipe)) {
      variants.push(this.parseVariant());
    }
    return { kind: "SumTypeBody", variants, span: this.spanFrom(start) };
  }

  private parseVariant(): AST.Variant {
    const start = this.current();
    const name = this.expect(TokenType.Identifier).value;
    const fields: AST.FieldDecl[] = [];
    if (this.match(TokenType.LBrace)) {
      if (!this.check(TokenType.RBrace)) {
        fields.push(this.parseFieldDecl());
        while (this.match(TokenType.Comma)) {
          if (this.check(TokenType.RBrace)) break;
          fields.push(this.parseFieldDecl());
        }
      }
      this.expect(TokenType.RBrace);
    }
    return { kind: "Variant", name, fields, span: this.spanFrom(start) };
  }

  private parseRecordTypeBody(start: Token): AST.RecordTypeBody {
    this.expect(TokenType.LBrace);
    const fields: AST.FieldDecl[] = [];
    if (!this.check(TokenType.RBrace)) {
      fields.push(this.parseFieldDecl());
      while (this.match(TokenType.Comma)) {
        if (this.check(TokenType.RBrace)) break;
        fields.push(this.parseFieldDecl());
      }
    }
    this.expect(TokenType.RBrace);
    return { kind: "RecordTypeBody", fields, span: this.spanFrom(start) };
  }

  private parseFieldDecl(): AST.FieldDecl {
    const start = this.current();
    const name = this.expect(TokenType.Identifier).value;
    this.expect(TokenType.Colon);
    const type = this.parseTypeExpr();
    return { kind: "FieldDecl", name, type, span: this.spanFrom(start) };
  }

  // === Type Expressions ===

  private parseTypeExpr(): AST.TypeExpr {
    // Check for function type: (A, B) -> C
    if (this.check(TokenType.LParen)) {
      const saved = this.pos;
      try {
        return this.parseFunctionType();
      } catch {
        this.pos = saved;
        return this.parseTupleType();
      }
    }

    // Record type: { field: Type, ... }
    if (this.check(TokenType.LBrace)) {
      return this.parseRecordTypeExpr();
    }

    // Named type: Ident or Ident<A, B>
    return this.parseNamedType();
  }

  private parseNamedType(): AST.NamedType {
    const start = this.current();
    const name = this.expect(TokenType.Identifier).value;
    const typeArgs: AST.TypeExpr[] = [];
    if (this.match(TokenType.Lt)) {
      typeArgs.push(this.parseTypeExpr());
      while (this.match(TokenType.Comma)) {
        typeArgs.push(this.parseTypeExpr());
      }
      this.expect(TokenType.Gt);
    }
    return { kind: "NamedType", name, typeArgs, span: this.spanFrom(start) };
  }

  private parseFunctionType(): AST.FunctionType {
    const start = this.current();
    this.expect(TokenType.LParen);
    const params: AST.TypeExpr[] = [];
    if (!this.check(TokenType.RParen)) {
      params.push(this.parseTypeExpr());
      while (this.match(TokenType.Comma)) {
        params.push(this.parseTypeExpr());
      }
    }
    this.expect(TokenType.RParen);
    this.expect(TokenType.Arrow);
    const returnType = this.parseTypeExpr();
    const effects: AST.TypeExpr[] = [];
    if (this.match(TokenType.Bang)) {
      effects.push(...this.parseEffectTypes());
    }
    return { kind: "FunctionType", params, returnType, effects, span: this.spanFrom(start) };
  }

  private parseTupleType(): AST.TupleType {
    const start = this.current();
    this.expect(TokenType.LParen);
    const elements: AST.TypeExpr[] = [];
    if (!this.check(TokenType.RParen)) {
      elements.push(this.parseTypeExpr());
      while (this.match(TokenType.Comma)) {
        elements.push(this.parseTypeExpr());
      }
    }
    this.expect(TokenType.RParen);
    return { kind: "TupleType", elements, span: this.spanFrom(start) };
  }

  private parseRecordTypeExpr(): AST.RecordType {
    const start = this.current();
    this.expect(TokenType.LBrace);
    const fields: AST.FieldDecl[] = [];
    if (!this.check(TokenType.RBrace)) {
      fields.push(this.parseFieldDecl());
      while (this.match(TokenType.Comma)) {
        if (this.check(TokenType.RBrace)) break;
        fields.push(this.parseFieldDecl());
      }
    }
    this.expect(TokenType.RBrace);
    return { kind: "RecordType", fields, span: this.spanFrom(start) };
  }

  // === Traits & Impls ===

  private parseTraitDecl(isPublic: boolean): AST.TraitDecl {
    const start = this.current();
    this.expect(TokenType.Trait);
    const name = this.expect(TokenType.Identifier).value;
    const typeParams = this.check(TokenType.Lt) ? this.parseTypeParams() : [];
    this.expect(TokenType.LBrace);
    const methods: AST.FnDecl[] = [];
    while (!this.check(TokenType.RBrace)) {
      methods.push(this.parseFnDecl(false));
    }
    this.expect(TokenType.RBrace);
    return { kind: "TraitDecl", name, isPublic, typeParams, methods, span: this.spanFrom(start) };
  }

  private parseImplDecl(): AST.ImplDecl {
    const start = this.current();
    this.expect(TokenType.Impl);
    const traitPath = this.parseModulePath();
    const typeParams = this.check(TokenType.Lt) ? this.parseTypeParams() : [];
    this.expect(TokenType.For);
    const targetType = this.parseTypeExpr();
    this.expect(TokenType.LBrace);
    const methods: AST.FnDecl[] = [];
    while (!this.check(TokenType.RBrace)) {
      methods.push(this.parseFnDecl(false));
    }
    this.expect(TokenType.RBrace);
    return { kind: "ImplDecl", traitPath, typeParams, targetType, methods, span: this.spanFrom(start) };
  }

  // === Statements ===

  private parseStatement(): AST.Statement {
    if (this.check(TokenType.Let)) return this.parseLetDecl();
    if (this.check(TokenType.Var)) return this.parseVarDecl();
    if (this.check(TokenType.Require)) return this.parseRequireStmt();
    if (this.check(TokenType.Ensure)) return this.parseEnsureStmt();

    // Try assignment: IDENT op= expr;
    if (this.check(TokenType.Identifier) && this.isAssignOp(1)) {
      return this.parseAssignStmt();
    }

    // Expression statement
    const start = this.current();
    const expr = this.parseExpr();
    this.expect(TokenType.Semicolon);
    return { kind: "ExprStmt", expr, span: this.spanFrom(start) };
  }

  private parseLetDecl(): AST.LetDecl {
    const start = this.current();
    this.expect(TokenType.Let);
    const name = this.expect(TokenType.Identifier).value;
    let type: AST.TypeExpr | undefined;
    if (this.match(TokenType.Colon)) {
      type = this.parseTypeExpr();
    }
    this.expect(TokenType.Eq);
    const value = this.parseExpr();
    this.expect(TokenType.Semicolon);
    return { kind: "LetDecl", name, type, value, span: this.spanFrom(start) };
  }

  private parseVarDecl(): AST.VarDecl {
    const start = this.current();
    this.expect(TokenType.Var);
    const name = this.expect(TokenType.Identifier).value;
    let type: AST.TypeExpr | undefined;
    if (this.match(TokenType.Colon)) {
      type = this.parseTypeExpr();
    }
    this.expect(TokenType.Eq);
    const value = this.parseExpr();
    this.expect(TokenType.Semicolon);
    return { kind: "VarDecl", name, type, value, span: this.spanFrom(start) };
  }

  private parseAssignStmt(): AST.AssignStmt {
    const start = this.current();
    const target = this.expect(TokenType.Identifier).value;
    const opToken = this.advance();
    const operator = opToken.value as AST.AssignStmt["operator"];
    const value = this.parseExpr();
    this.expect(TokenType.Semicolon);
    return { kind: "AssignStmt", target, operator, value, span: this.spanFrom(start) };
  }

  private parseRequireStmt(): AST.RequireStmt {
    const start = this.current();
    this.expect(TokenType.Require);
    const condition = this.parseExpr();
    this.expect(TokenType.Semicolon);
    return { kind: "RequireStmt", condition, span: this.spanFrom(start) };
  }

  private parseEnsureStmt(): AST.EnsureStmt {
    const start = this.current();
    this.expect(TokenType.Ensure);
    this.expect(TokenType.Pipe);
    const paramName = this.expect(TokenType.Identifier).value;
    this.expect(TokenType.Pipe);
    const condition = this.parseExpr();
    this.expect(TokenType.Semicolon);
    return { kind: "EnsureStmt", paramName, condition, span: this.spanFrom(start) };
  }

  private parseTestDecl(): AST.TestDecl {
    const start = this.current();
    this.expect(TokenType.Test);
    const name = this.expect(TokenType.StrLiteral).value;
    const body = this.parseBlock();
    return { kind: "TestDecl", name, body, span: this.spanFrom(start) };
  }

  // === FFI / Extern ===

  private parseExternDecl(isPublic: boolean): AST.ExternFnDecl | AST.ExternModuleDecl {
    const start = this.current();
    this.expect(TokenType.Extern);

    // extern module "name" { ... }
    if (this.check(TokenType.Module)) {
      return this.parseExternModuleDecl(isPublic, start);
    }

    // extern fn name(...) -> Type = "js.expression";
    return this.parseExternFnDecl(isPublic, start);
  }

  private parseExternFnDecl(isPublic: boolean, start: Token): AST.ExternFnDecl {
    const isAsync = this.match(TokenType.Async);
    this.expect(TokenType.Fn);
    const name = this.expect(TokenType.Identifier).value;
    this.expect(TokenType.LParen);
    const params: AST.Param[] = [];
    if (!this.check(TokenType.RParen)) {
      params.push(this.parseParam());
      while (this.match(TokenType.Comma)) {
        if (this.check(TokenType.RParen)) break;
        params.push(this.parseParam());
      }
    }
    this.expect(TokenType.RParen);

    let returnType: AST.TypeExpr | undefined;
    if (this.match(TokenType.Arrow)) {
      returnType = this.parseTypeExpr();
    }

    this.expect(TokenType.Eq);
    const jsBinding = this.expect(TokenType.StrLiteral).value;
    this.expect(TokenType.Semicolon);

    return {
      kind: "ExternFnDecl", name, isPublic, isAsync, params, returnType,
      jsBinding, span: this.spanFrom(start),
    };
  }

  private parseExternModuleDecl(isPublic: boolean, start: Token): AST.ExternModuleDecl {
    this.expect(TokenType.Module);
    const jsModule = this.expect(TokenType.StrLiteral).value;
    const name = this.match(TokenType.As) ? this.expect(TokenType.Identifier).value : jsModule.replace(/[^a-zA-Z0-9_]/g, "_");
    this.expect(TokenType.LBrace);

    const methods: AST.ExternFnDecl[] = [];
    while (!this.check(TokenType.RBrace)) {
      const methodStart = this.current();
      const isAsync = this.match(TokenType.Async);
      this.expect(TokenType.Fn);
      const methodName = this.expect(TokenType.Identifier).value;
      this.expect(TokenType.LParen);
      const params: AST.Param[] = [];
      if (!this.check(TokenType.RParen)) {
        params.push(this.parseParam());
        while (this.match(TokenType.Comma)) {
          if (this.check(TokenType.RParen)) break;
          params.push(this.parseParam());
        }
      }
      this.expect(TokenType.RParen);

      let returnType: AST.TypeExpr | undefined;
      if (this.match(TokenType.Arrow)) {
        returnType = this.parseTypeExpr();
      }

      // Optional JS binding override: = "customName"
      let jsBinding = methodName;
      if (this.match(TokenType.Eq)) {
        jsBinding = this.expect(TokenType.StrLiteral).value;
      }
      this.expect(TokenType.Semicolon);

      methods.push({
        kind: "ExternFnDecl", name: methodName, isPublic: false, isAsync, params,
        returnType, jsBinding, span: this.spanFrom(methodStart),
      });
    }
    this.expect(TokenType.RBrace);

    return {
      kind: "ExternModuleDecl", name, isPublic, jsModule, methods,
      span: this.spanFrom(start),
    };
  }

  // === Expressions ===

  private parseExpr(): AST.Expr {
    return this.parsePipe();
  }

  private parsePipe(): AST.Expr {
    let left = this.parseOr();
    while (this.match(TokenType.PipeGt)) {
      const start = this.tokens[this.pos - 2]; // token before |>
      const right = this.parseCallExpr(this.parsePrimary());
      if (right.kind !== "CallExpr") {
        throw new ParseError("Expected function call after |>", this.current());
      }
      left = {
        kind: "PipeExpr",
        left,
        right: right as AST.CallExpr,
        span: this.spanFrom(start),
      };
    }
    return left;
  }

  private parseOr(): AST.Expr {
    let left = this.parseAnd();
    while (this.match(TokenType.Or)) {
      const start = this.tokens[this.pos - 2];
      const right = this.parseAnd();
      left = { kind: "BinaryExpr", operator: "||", left, right, span: this.spanFrom(start) };
    }
    return left;
  }

  private parseAnd(): AST.Expr {
    let left = this.parseEquality();
    while (this.match(TokenType.And)) {
      const start = this.tokens[this.pos - 2];
      const right = this.parseEquality();
      left = { kind: "BinaryExpr", operator: "&&", left, right, span: this.spanFrom(start) };
    }
    return left;
  }

  private parseEquality(): AST.Expr {
    let left = this.parseRange();
    while (this.check(TokenType.EqEq) || this.check(TokenType.NotEq) || this.check(TokenType.TildeEq)) {
      const op = this.advance().value;
      const right = this.parseRange();
      left = { kind: "BinaryExpr", operator: op, left, right, span: left.span };
    }
    return left;
  }

  private parseRange(): AST.Expr {
    let left = this.parseComparison();
    if (this.check(TokenType.DotDot)) {
      this.advance();
      const right = this.parseComparison();
      return { kind: "RangeExpr", start: left, end: right, span: left.span };
    }
    return left;
  }

  private parseComparison(): AST.Expr {
    let left = this.parseAddition();
    while (this.check(TokenType.Lt) || this.check(TokenType.Gt) ||
           this.check(TokenType.LtEq) || this.check(TokenType.GtEq)) {
      const op = this.advance().value;
      const right = this.parseAddition();
      left = { kind: "BinaryExpr", operator: op, left, right, span: left.span };
    }
    return left;
  }

  private parseAddition(): AST.Expr {
    let left = this.parseMultiplication();
    while (this.check(TokenType.Plus) || this.check(TokenType.Minus) || this.check(TokenType.PlusPlus)) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      left = { kind: "BinaryExpr", operator: op, left, right, span: left.span };
    }
    return left;
  }

  private parseMultiplication(): AST.Expr {
    let left = this.parseUnary();
    while (this.check(TokenType.Star) || this.check(TokenType.Slash) || this.check(TokenType.Percent)) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { kind: "BinaryExpr", operator: op, left, right, span: left.span };
    }
    return left;
  }

  private parseUnary(): AST.Expr {
    if (this.check(TokenType.Bang) || this.check(TokenType.Minus)) {
      const start = this.current();
      const op = this.advance().value as "!" | "-";
      const operand = this.parseUnary();
      return { kind: "UnaryExpr", operator: op, operand, span: this.spanFrom(start) };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): AST.Expr {
    let expr = this.parsePrimary();
    return this.parseCallExpr(expr);
  }

  private parseCallExpr(expr: AST.Expr): AST.Expr {
    while (true) {
      if (this.match(TokenType.Dot)) {
        const member = this.expectMemberName().value;
        expr = { kind: "MemberExpr", object: expr, member, span: expr.span };
      } else if (this.check(TokenType.LParen)) {
        this.advance();
        const args: AST.Expr[] = [];
        if (!this.check(TokenType.RParen)) {
          args.push(this.parseExpr());
          while (this.match(TokenType.Comma)) {
            if (this.check(TokenType.RParen)) break;
            args.push(this.parseExpr());
          }
        }
        this.expect(TokenType.RParen);
        expr = { kind: "CallExpr", callee: expr, args, span: expr.span };
      } else if (this.check(TokenType.Bang) && !this.checkNext(TokenType.Eq)) {
        this.advance();
        expr = { kind: "PropagateExpr", expr, span: expr.span };
      } else {
        break;
      }
    }
    return expr;
  }

  private parsePrimary(): AST.Expr {
    const start = this.current();

    // Literals
    if (this.check(TokenType.IntLiteral)) {
      const tok = this.advance();
      return { kind: "IntLiteral", value: parseInt(tok.value, 10), span: this.spanFrom(start) };
    }
    if (this.check(TokenType.FloatLiteral)) {
      const tok = this.advance();
      return { kind: "FloatLiteral", value: parseFloat(tok.value), span: this.spanFrom(start) };
    }
    if (this.check(TokenType.StrLiteral)) {
      const tok = this.advance();
      return { kind: "StrLiteral", value: tok.value, span: this.spanFrom(start) };
    }
    if (this.check(TokenType.CharLiteral)) {
      const tok = this.advance();
      return { kind: "CharLiteral", value: tok.value, span: this.spanFrom(start) };
    }
    if (this.check(TokenType.True)) {
      this.advance();
      return { kind: "BoolLiteral", value: true, span: this.spanFrom(start) };
    }
    if (this.check(TokenType.False)) {
      this.advance();
      return { kind: "BoolLiteral", value: false, span: this.spanFrom(start) };
    }
    if (this.check(TokenType.Null)) {
      this.advance();
      return { kind: "NullLiteral", span: this.spanFrom(start) };
    }

    // Control flow expressions
    if (this.check(TokenType.If)) return this.parseIfExpr();
    if (this.check(TokenType.Match)) return this.parseMatchExpr();
    if (this.check(TokenType.For)) return this.parseForExpr();
    if (this.check(TokenType.While)) return this.parseWhileExpr();
    if (this.check(TokenType.Return)) return this.parseReturnExpr();
    if (this.check(TokenType.Break)) { this.advance(); return { kind: "BreakExpr", span: this.spanFrom(start) }; }
    if (this.check(TokenType.Continue)) { this.advance(); return { kind: "ContinueExpr", span: this.spanFrom(start) }; }
    if (this.check(TokenType.Await)) return this.parseAwaitExpr();
    if (this.check(TokenType.Assert)) return this.parseAssertExpr();
    if (this.check(TokenType.Channel)) return this.parseChannelExpr();
    if (this.check(TokenType.Send)) return this.parseSendExpr();
    if (this.check(TokenType.Recv)) return this.parseRecvExpr();
    if (this.check(TokenType.Select)) return this.parseSelectExpr();
    if (this.check(TokenType.Timeout)) return this.parseTimeoutExpr();

    // task_group |name| { ... }
    if (this.check(TokenType.TaskGroup)) return this.parseTaskGroupExpr();

    // Lambda: |params| body
    if (this.check(TokenType.Pipe) || this.check(TokenType.Or)) {
      return this.parseLambdaExpr();
    }

    // List literal
    if (this.check(TokenType.LBracket)) {
      return this.parseListExpr();
    }

    // Grouped expression or tuple
    if (this.check(TokenType.LParen)) {
      this.advance();
      const expr = this.parseExpr();
      this.expect(TokenType.RParen);
      return expr;
    }

    // Object literal or block expression
    if (this.check(TokenType.LBrace)) {
      // Lookahead: { identifier : ... } is an object literal
      if (this.isObjectLiteral()) {
        return this.parseObjectLiteral();
      }
      return this.parseBlock();
    }

    // Identifier — could be simple ident or record constructor
    if (this.check(TokenType.Identifier)) {
      const name = this.advance().value;

      // Record constructor: Name { field: value, ... }
      if (this.check(TokenType.LBrace) && name[0] >= 'A' && name[0] <= 'Z') {
        return this.parseRecordExpr(name, start);
      }

      return { kind: "Identifier", name, span: this.spanFrom(start) };
    }

    throw new ParseError("Expected expression", this.current());
  }

  // === Complex Expressions ===

  private parseIfExpr(): AST.IfExpr {
    const start = this.current();
    this.expect(TokenType.If);
    const condition = this.parseExpr();
    const then = this.parseBlock();
    let else_: AST.BlockExpr | AST.IfExpr | undefined;
    if (this.match(TokenType.Else)) {
      if (this.check(TokenType.If)) {
        else_ = this.parseIfExpr();
      } else {
        else_ = this.parseBlock();
      }
    }
    return { kind: "IfExpr", condition, then, else_, span: this.spanFrom(start) };
  }

  private parseMatchExpr(): AST.MatchExpr {
    const start = this.current();
    this.expect(TokenType.Match);
    const subject = this.parseExpr();
    this.expect(TokenType.LBrace);
    const arms: AST.MatchArm[] = [];
    while (!this.check(TokenType.RBrace)) {
      arms.push(this.parseMatchArm());
      this.match(TokenType.Comma); // optional trailing comma
    }
    this.expect(TokenType.RBrace);
    return { kind: "MatchExpr", subject, arms, span: this.spanFrom(start) };
  }

  private parseMatchArm(): AST.MatchArm {
    const start = this.current();
    const pattern = this.parsePattern();
    this.expect(TokenType.FatArrow);
    const body = this.parseExpr();
    return { kind: "MatchArm", pattern, body, span: this.spanFrom(start) };
  }

  private parsePattern(): AST.Pattern {
    const start = this.current();

    if (this.check(TokenType.Underscore)) {
      this.advance();
      return { kind: "WildcardPattern", span: this.spanFrom(start) };
    }

    if (this.check(TokenType.LBracket)) {
      return this.parseListPattern();
    }

    if (this.check(TokenType.IntLiteral) || this.check(TokenType.StrLiteral) ||
        this.check(TokenType.CharLiteral) || this.check(TokenType.True) || this.check(TokenType.False)) {
      return this.parseLiteralPattern();
    }

    if (this.check(TokenType.Identifier)) {
      const name = this.advance().value;

      // Variant pattern: Name { field, ... }
      if (this.check(TokenType.LBrace)) {
        this.advance();
        const fields: AST.FieldPattern[] = [];
        if (!this.check(TokenType.RBrace)) {
          fields.push(this.parseFieldPattern());
          while (this.match(TokenType.Comma)) {
            if (this.check(TokenType.RBrace)) break;
            fields.push(this.parseFieldPattern());
          }
        }
        this.expect(TokenType.RBrace);
        return { kind: "VariantPattern", name, fields, span: this.spanFrom(start) };
      }

      return { kind: "IdentifierPattern", name, span: this.spanFrom(start) };
    }

    throw new ParseError("Expected pattern", this.current());
  }

  private parseFieldPattern(): AST.FieldPattern {
    const start = this.current();

    if (this.check(TokenType.DotDot)) {
      this.advance();
      return { kind: "FieldPattern", name: "..", isRest: true, span: this.spanFrom(start) };
    }

    const name = this.expect(TokenType.Identifier).value;
    let pattern: AST.Pattern | undefined;
    if (this.match(TokenType.Colon)) {
      pattern = this.parsePattern();
    }
    return { kind: "FieldPattern", name, pattern, isRest: false, span: this.spanFrom(start) };
  }

  private parseListPattern(): AST.ListPattern {
    const start = this.current();
    this.expect(TokenType.LBracket);
    const elements: AST.Pattern[] = [];
    let hasRest = false;
    if (!this.check(TokenType.RBracket)) {
      elements.push(this.parsePattern());
      while (this.match(TokenType.Comma)) {
        if (this.check(TokenType.DotDot)) {
          this.advance();
          hasRest = true;
          break;
        }
        if (this.check(TokenType.RBracket)) break;
        elements.push(this.parsePattern());
      }
    }
    this.expect(TokenType.RBracket);
    return { kind: "ListPattern", elements, hasRest, span: this.spanFrom(start) };
  }

  private parseLiteralPattern(): AST.LiteralPattern {
    const start = this.current();
    let value: AST.IntLiteral | AST.StrLiteral | AST.CharLiteral | AST.BoolLiteral;

    if (this.check(TokenType.IntLiteral)) {
      const tok = this.advance();
      value = { kind: "IntLiteral", value: parseInt(tok.value, 10), span: this.spanFrom(start) };
    } else if (this.check(TokenType.StrLiteral)) {
      const tok = this.advance();
      value = { kind: "StrLiteral", value: tok.value, span: this.spanFrom(start) };
    } else if (this.check(TokenType.CharLiteral)) {
      const tok = this.advance();
      value = { kind: "CharLiteral", value: tok.value, span: this.spanFrom(start) };
    } else {
      const tok = this.advance();
      value = { kind: "BoolLiteral", value: tok.value === "true", span: this.spanFrom(start) };
    }

    return { kind: "LiteralPattern", value, span: this.spanFrom(start) };
  }

  private parseForExpr(): AST.ForExpr {
    const start = this.current();
    this.expect(TokenType.For);
    const variable = this.check(TokenType.Underscore) ? this.advance().value : this.expect(TokenType.Identifier).value;
    this.expect(TokenType.In);
    const iterable = this.parseExpr();
    const body = this.parseBlock();
    return { kind: "ForExpr", variable, iterable, body, span: this.spanFrom(start) };
  }

  private parseWhileExpr(): AST.WhileExpr {
    const start = this.current();
    this.expect(TokenType.While);
    const condition = this.parseExpr();
    const body = this.parseBlock();
    return { kind: "WhileExpr", condition, body, span: this.spanFrom(start) };
  }

  private parseReturnExpr(): AST.ReturnExpr {
    const start = this.current();
    this.expect(TokenType.Return);
    let value: AST.Expr | undefined;
    if (!this.check(TokenType.Semicolon) && !this.check(TokenType.RBrace)) {
      value = this.parseExpr();
    }
    return { kind: "ReturnExpr", value, span: this.spanFrom(start) };
  }

  private parseAwaitExpr(): AST.AwaitExpr {
    const start = this.current();
    this.expect(TokenType.Await);
    const expr = this.parseExpr();
    return { kind: "AwaitExpr", expr, span: this.spanFrom(start) };
  }

  private parseAssertExpr(): AST.AssertExpr {
    const start = this.current();
    this.expect(TokenType.Assert);
    const condition = this.parseExpr();
    return { kind: "AssertExpr", condition, span: this.spanFrom(start) };
  }

  // task_group |name| { ... }
  private parseTaskGroupExpr(): AST.TaskGroupExpr {
    const start = this.current();
    this.expect(TokenType.TaskGroup);
    this.expect(TokenType.Pipe);
    const paramName = this.expect(TokenType.Identifier).value;
    this.expect(TokenType.Pipe);
    const body = this.parseBlock();
    return { kind: "TaskGroupExpr", paramName, body, span: this.spanFrom(start) };
  }

  // channel()  or  channel(10)
  private parseChannelExpr(): AST.ChannelExpr {
    const start = this.current();
    this.expect(TokenType.Channel);
    this.expect(TokenType.LParen);
    let capacity: AST.Expr | undefined;
    if (!this.check(TokenType.RParen)) {
      capacity = this.parseExpr();
    }
    this.expect(TokenType.RParen);
    return { kind: "ChannelExpr", capacity, span: this.spanFrom(start) };
  }

  // send(ch, value)
  private parseSendExpr(): AST.SendExpr {
    const start = this.current();
    this.expect(TokenType.Send);
    this.expect(TokenType.LParen);
    const channel = this.parseExpr();
    this.expect(TokenType.Comma);
    const value = this.parseExpr();
    this.expect(TokenType.RParen);
    return { kind: "SendExpr", channel, value, span: this.spanFrom(start) };
  }

  // recv(ch)
  private parseRecvExpr(): AST.RecvExpr {
    const start = this.current();
    this.expect(TokenType.Recv);
    this.expect(TokenType.LParen);
    const channel = this.parseExpr();
    this.expect(TokenType.RParen);
    return { kind: "RecvExpr", channel, span: this.spanFrom(start) };
  }

  // select { recv(ch) as msg => ..., send(ch, val) => ..., timeout(1000) => ... }
  private parseSelectExpr(): AST.SelectExpr {
    const start = this.current();
    this.expect(TokenType.Select);
    this.expect(TokenType.LBrace);
    const arms: AST.SelectArm[] = [];
    while (!this.check(TokenType.RBrace)) {
      arms.push(this.parseSelectArm());
      this.match(TokenType.Comma);
    }
    this.expect(TokenType.RBrace);
    return { kind: "SelectExpr", arms, span: this.spanFrom(start) };
  }

  private parseSelectArm(): AST.SelectArm {
    const start = this.current();
    let operation: AST.SendExpr | AST.RecvExpr | AST.TimeoutExpr;
    let bindName: string | undefined;

    if (this.check(TokenType.Send)) {
      operation = this.parseSendExpr();
    } else if (this.check(TokenType.Recv)) {
      operation = this.parseRecvExpr();
      // optional: recv(ch) as name
      if (this.match(TokenType.As)) {
        bindName = this.expect(TokenType.Identifier).value;
      }
    } else if (this.check(TokenType.Timeout)) {
      operation = this.parseTimeoutExpr();
    } else {
      throw new ParseError("Expected send, recv, or timeout in select arm", this.current());
    }

    this.expect(TokenType.FatArrow);
    const body = this.parseExpr();
    return { kind: "SelectArm", operation, bindName, body, span: this.spanFrom(start) };
  }

  // timeout(1000)
  private parseTimeoutExpr(): AST.TimeoutExpr {
    const start = this.current();
    this.expect(TokenType.Timeout);
    this.expect(TokenType.LParen);
    const duration = this.parseExpr();
    this.expect(TokenType.RParen);
    return { kind: "TimeoutExpr", duration, span: this.spanFrom(start) };
  }

  private parseLambdaExpr(): AST.LambdaExpr {
    const start = this.current();
    const params: AST.Param[] = [];

    if (this.check(TokenType.Or)) {
      // || means no params
      this.advance();
    } else {
      this.expect(TokenType.Pipe);
      if (!this.check(TokenType.Pipe)) {
        params.push(this.parseParam());
        while (this.match(TokenType.Comma)) {
          params.push(this.parseParam());
        }
      }
      this.expect(TokenType.Pipe);
    }

    let returnType: AST.TypeExpr | undefined;
    if (this.match(TokenType.Arrow)) {
      returnType = this.parseTypeExpr();
    }

    let body: AST.BlockExpr;
    if (this.check(TokenType.LBrace)) {
      body = this.parseBlock();
    } else {
      // Single-expression lambda: || expr
      const expr = this.parseExpr();
      body = { kind: "BlockExpr", statements: [], finalExpr: expr, span: expr.span };
    }
    return { kind: "LambdaExpr", params, returnType, body, span: this.spanFrom(start) };
  }

  private parseListExpr(): AST.ListExpr {
    const start = this.current();
    this.expect(TokenType.LBracket);
    const elements: AST.Expr[] = [];
    if (!this.check(TokenType.RBracket)) {
      elements.push(this.parseExpr());
      while (this.match(TokenType.Comma)) {
        if (this.check(TokenType.RBracket)) break;
        elements.push(this.parseExpr());
      }
    }
    this.expect(TokenType.RBracket);
    return { kind: "ListExpr", elements, span: this.spanFrom(start) };
  }

  // Lookahead: is this { identifier: expr, ... } (object literal)?
  private isObjectLiteral(): boolean {
    // Save position for lookahead
    const saved = this.pos;
    try {
      if (!this.check(TokenType.LBrace)) return false;
      this.advance(); // skip {

      // Empty braces {} — treat as empty object literal
      if (this.check(TokenType.RBrace)) return true;

      // Check for identifier followed by colon
      if (this.check(TokenType.Identifier)) {
        this.advance();
        return this.check(TokenType.Colon);
      }
      return false;
    } finally {
      this.pos = saved;
    }
  }

  private parseObjectLiteral(): AST.ObjectLiteral {
    const start = this.current();
    this.expect(TokenType.LBrace);
    const fields: { name: string; value: AST.Expr }[] = [];
    if (!this.check(TokenType.RBrace)) {
      const name = this.expect(TokenType.Identifier).value;
      this.expect(TokenType.Colon);
      const value = this.parseExpr();
      fields.push({ name, value });
      while (this.match(TokenType.Comma)) {
        if (this.check(TokenType.RBrace)) break;
        const fname = this.expect(TokenType.Identifier).value;
        this.expect(TokenType.Colon);
        const fvalue = this.parseExpr();
        fields.push({ name: fname, value: fvalue });
      }
    }
    this.expect(TokenType.RBrace);
    return { kind: "ObjectLiteral", fields, span: this.spanFrom(start) };
  }

  private parseRecordExpr(typeName: string, start: Token): AST.RecordExpr {
    this.expect(TokenType.LBrace);
    const fields: AST.RecordFieldInit[] = [];
    if (!this.check(TokenType.RBrace)) {
      fields.push(this.parseRecordFieldInit());
      while (this.match(TokenType.Comma)) {
        if (this.check(TokenType.RBrace)) break;
        fields.push(this.parseRecordFieldInit());
      }
    }
    this.expect(TokenType.RBrace);
    return { kind: "RecordExpr", typeName, fields, span: this.spanFrom(start) };
  }

  private parseRecordFieldInit(): AST.RecordFieldInit {
    const start = this.current();
    const name = this.expect(TokenType.Identifier).value;
    if (this.match(TokenType.Colon)) {
      const value = this.parseExpr();
      return { kind: "RecordFieldInit", name, value, span: this.spanFrom(start) };
    }
    // Shorthand: { name } means { name: name }
    return {
      kind: "RecordFieldInit",
      name,
      value: { kind: "Identifier", name, span: this.spanFrom(start) },
      span: this.spanFrom(start),
    };
  }

  private parseBlock(): AST.BlockExpr {
    const start = this.current();
    this.expect(TokenType.LBrace);
    const statements: AST.Statement[] = [];
    let finalExpr: AST.Expr | undefined;

    while (!this.check(TokenType.RBrace)) {
      // Try to determine if this is the final expression (no semicolon)
      const savedPos = this.pos;

      // These are always statements
      if (this.check(TokenType.Let) || this.check(TokenType.Var) ||
          this.check(TokenType.Require) || this.check(TokenType.Ensure)) {
        statements.push(this.parseStatement());
        continue;
      }

      // Assignment statement
      if (this.check(TokenType.Identifier) && this.isAssignOp(1)) {
        statements.push(this.parseAssignStmt());
        continue;
      }

      // Try parsing as expression
      const expr = this.parseExpr();

      if (this.check(TokenType.Semicolon)) {
        this.advance();
        statements.push({ kind: "ExprStmt", expr, span: expr.span });
      } else if (this.check(TokenType.RBrace)) {
        finalExpr = expr;
      } else {
        // Could be a statement missing semicolon — error
        throw new ParseError("Expected ';' or '}'", this.current());
      }
    }

    this.expect(TokenType.RBrace);
    return { kind: "BlockExpr", statements, finalExpr, span: this.spanFrom(start) };
  }

  // === Helper Methods ===

  private current(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  private check(type: TokenType): boolean {
    return this.current().type === type;
  }

  private checkNext(type: TokenType): boolean {
    if (this.pos + 1 >= this.tokens.length) return false;
    return this.tokens[this.pos + 1].type === type;
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expect(type: TokenType): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw new ParseError(`Expected '${type}'`, this.current());
  }

  private peekIs(offset: number, type: TokenType): boolean {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return false;
    return this.tokens[idx].type === type;
  }

  private isAssignOp(offset: number): boolean {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return false;
    const t = this.tokens[idx].type;
    return t === TokenType.Eq || t === TokenType.PlusEq ||
           t === TokenType.MinusEq || t === TokenType.StarEq || t === TokenType.SlashEq;
  }

  private spanFrom(start: Token): AST.SourceSpan {
    const prev = this.pos > 0 ? this.tokens[this.pos - 1] : start;
    return {
      start: { line: start.line, column: start.column, offset: start.offset },
      end: { line: prev.line, column: prev.column + prev.value.length, offset: prev.offset + prev.value.length },
      file: this.file,
    };
  }
}
