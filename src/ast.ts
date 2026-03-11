// PLang Abstract Syntax Tree type definitions

export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export interface SourceSpan {
  start: SourceLocation;
  end: SourceLocation;
  file: string;
}

// Base node with location tracking
interface BaseNode {
  span: SourceSpan;
}

// === Top-Level ===

export interface Program extends BaseNode {
  kind: "Program";
  module: ModuleDecl;
  imports: ImportDecl[];
  declarations: TopLevelDecl[];
}

export interface ModuleDecl extends BaseNode {
  kind: "ModuleDecl";
  path: string[];
}

export interface ImportDecl extends BaseNode {
  kind: "ImportDecl";
  path: string[];
  items?: string[];  // specific imports: use x.{a, b}
  alias?: string;    // aliased import: use x as y
}

export type TopLevelDecl = FnDecl | TypeDecl | TraitDecl | ImplDecl | LetDecl | TestDecl | ExternFnDecl | ExternModuleDecl;

// === Functions ===

export interface FnDecl extends BaseNode {
  kind: "FnDecl";
  name: string;
  isPublic: boolean;
  isAsync: boolean;
  typeParams: TypeParam[];
  params: Param[];
  returnType?: TypeExpr;
  effects: TypeExpr[];
  body?: BlockExpr;
}

export interface Param extends BaseNode {
  kind: "Param";
  name: string;
  type: TypeExpr;
}

export interface TypeParam extends BaseNode {
  kind: "TypeParam";
  name: string;
  bounds: string[];
}

// === Types ===

export interface TypeDecl extends BaseNode {
  kind: "TypeDecl";
  name: string;
  isPublic: boolean;
  typeParams: TypeParam[];
  body: TypeBody;
}

export type TypeBody = RecordTypeBody | SumTypeBody | AliasTypeBody;

export interface RecordTypeBody extends BaseNode {
  kind: "RecordTypeBody";
  fields: FieldDecl[];
}

export interface SumTypeBody extends BaseNode {
  kind: "SumTypeBody";
  variants: Variant[];
}

export interface AliasTypeBody extends BaseNode {
  kind: "AliasTypeBody";
  type: TypeExpr;
}

export interface FieldDecl extends BaseNode {
  kind: "FieldDecl";
  name: string;
  type: TypeExpr;
}

export interface Variant extends BaseNode {
  kind: "Variant";
  name: string;
  fields: FieldDecl[];
}

// === Type Expressions ===

export type TypeExpr = NamedType | FunctionType | TupleType | RecordType;

export interface NamedType extends BaseNode {
  kind: "NamedType";
  name: string;
  typeArgs: TypeExpr[];
}

export interface FunctionType extends BaseNode {
  kind: "FunctionType";
  params: TypeExpr[];
  returnType: TypeExpr;
  effects: TypeExpr[];
}

export interface TupleType extends BaseNode {
  kind: "TupleType";
  elements: TypeExpr[];
}

export interface RecordType extends BaseNode {
  kind: "RecordType";
  fields: FieldDecl[];
}

// === Traits & Impls ===

export interface TraitDecl extends BaseNode {
  kind: "TraitDecl";
  name: string;
  isPublic: boolean;
  typeParams: TypeParam[];
  methods: FnDecl[];
}

export interface ImplDecl extends BaseNode {
  kind: "ImplDecl";
  traitPath: string[];
  typeParams: TypeParam[];
  targetType: TypeExpr;
  methods: FnDecl[];
}

// === Statements ===

export type Statement = LetDecl | VarDecl | AssignStmt | ExprStmt | RequireStmt | EnsureStmt;

export interface LetDecl extends BaseNode {
  kind: "LetDecl";
  name: string;
  type?: TypeExpr;
  value: Expr;
}

export interface VarDecl extends BaseNode {
  kind: "VarDecl";
  name: string;
  type?: TypeExpr;
  value: Expr;
}

export interface AssignStmt extends BaseNode {
  kind: "AssignStmt";
  target: string;
  operator: "=" | "+=" | "-=" | "*=" | "/=";
  value: Expr;
}

export interface ExprStmt extends BaseNode {
  kind: "ExprStmt";
  expr: Expr;
}

export interface RequireStmt extends BaseNode {
  kind: "RequireStmt";
  condition: Expr;
}

export interface EnsureStmt extends BaseNode {
  kind: "EnsureStmt";
  paramName: string;
  condition: Expr;
}

// === Expressions ===

export type Expr =
  | IntLiteral
  | FloatLiteral
  | StrLiteral
  | CharLiteral
  | BoolLiteral
  | NullLiteral
  | Identifier
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | MemberExpr
  | PropagateExpr
  | IfExpr
  | MatchExpr
  | ForExpr
  | WhileExpr
  | BlockExpr
  | LambdaExpr
  | ListExpr
  | ObjectLiteral
  | RecordExpr
  | RecordUpdateExpr
  | PipeExpr
  | ReturnExpr
  | BreakExpr
  | ContinueExpr
  | AwaitExpr
  | TaskGroupExpr
  | AssertExpr
  | RangeExpr
  | ChannelExpr
  | SendExpr
  | RecvExpr
  | SelectExpr
  | TimeoutExpr
  | TupleExpr;

export interface TupleExpr extends BaseNode {
  kind: "TupleExpr";
  elements: Expr[];
}

export interface IntLiteral extends BaseNode {
  kind: "IntLiteral";
  value: number;
}

export interface FloatLiteral extends BaseNode {
  kind: "FloatLiteral";
  value: number;
}

export interface StrLiteral extends BaseNode {
  kind: "StrLiteral";
  value: string;
}

export interface CharLiteral extends BaseNode {
  kind: "CharLiteral";
  value: string;
}

export interface BoolLiteral extends BaseNode {
  kind: "BoolLiteral";
  value: boolean;
}

export interface NullLiteral extends BaseNode {
  kind: "NullLiteral";
}

export interface Identifier extends BaseNode {
  kind: "Identifier";
  name: string;
}

export interface BinaryExpr extends BaseNode {
  kind: "BinaryExpr";
  operator: string;
  left: Expr;
  right: Expr;
}

export interface UnaryExpr extends BaseNode {
  kind: "UnaryExpr";
  operator: "!" | "-";
  operand: Expr;
}

export interface CallExpr extends BaseNode {
  kind: "CallExpr";
  callee: Expr;
  args: Expr[];
}

export interface MemberExpr extends BaseNode {
  kind: "MemberExpr";
  object: Expr;
  member: string;
}

export interface PropagateExpr extends BaseNode {
  kind: "PropagateExpr";
  expr: Expr;
}

export interface IfExpr extends BaseNode {
  kind: "IfExpr";
  condition: Expr;
  then: BlockExpr;
  else_?: BlockExpr | IfExpr;
}

export interface MatchExpr extends BaseNode {
  kind: "MatchExpr";
  subject: Expr;
  arms: MatchArm[];
}

export interface MatchArm extends BaseNode {
  kind: "MatchArm";
  pattern: Pattern;
  body: Expr;
}

export type Pattern =
  | VariantPattern
  | LiteralPattern
  | ListPattern
  | WildcardPattern
  | IdentifierPattern;

export interface VariantPattern extends BaseNode {
  kind: "VariantPattern";
  name: string;
  fields: FieldPattern[];
}

export interface FieldPattern extends BaseNode {
  kind: "FieldPattern";
  name: string;
  pattern?: Pattern;
  isRest: boolean;
}

export interface LiteralPattern extends BaseNode {
  kind: "LiteralPattern";
  value: IntLiteral | StrLiteral | CharLiteral | BoolLiteral;
}

export interface ListPattern extends BaseNode {
  kind: "ListPattern";
  elements: Pattern[];
  hasRest: boolean;
}

export interface WildcardPattern extends BaseNode {
  kind: "WildcardPattern";
}

export interface IdentifierPattern extends BaseNode {
  kind: "IdentifierPattern";
  name: string;
}

export interface ForExpr extends BaseNode {
  kind: "ForExpr";
  variable: string;
  iterable: Expr;
  body: BlockExpr;
}

export interface WhileExpr extends BaseNode {
  kind: "WhileExpr";
  condition: Expr;
  body: BlockExpr;
}

export interface BlockExpr extends BaseNode {
  kind: "BlockExpr";
  statements: Statement[];
  finalExpr?: Expr;
}

export interface LambdaExpr extends BaseNode {
  kind: "LambdaExpr";
  params: Param[];
  returnType?: TypeExpr;
  body: BlockExpr;
}

export interface ListExpr extends BaseNode {
  kind: "ListExpr";
  elements: Expr[];
}

export interface ObjectLiteral extends BaseNode {
  kind: "ObjectLiteral";
  fields: { name: string; value: Expr }[];
}

export interface RecordExpr extends BaseNode {
  kind: "RecordExpr";
  typeName: string;
  fields: RecordFieldInit[];
}

export interface RecordFieldInit extends BaseNode {
  kind: "RecordFieldInit";
  name: string;
  value: Expr;
}

export interface RecordUpdateExpr extends BaseNode {
  kind: "RecordUpdateExpr";
  base: Expr;
  updates: RecordFieldInit[];
}

export interface PipeExpr extends BaseNode {
  kind: "PipeExpr";
  left: Expr;
  right: CallExpr;
}

export interface ReturnExpr extends BaseNode {
  kind: "ReturnExpr";
  value?: Expr;
}

export interface BreakExpr extends BaseNode {
  kind: "BreakExpr";
}

export interface ContinueExpr extends BaseNode {
  kind: "ContinueExpr";
}

export interface AwaitExpr extends BaseNode {
  kind: "AwaitExpr";
  expr: Expr;
}

export interface TaskGroupExpr extends BaseNode {
  kind: "TaskGroupExpr";
  paramName: string;
  body: BlockExpr;
}

export interface AssertExpr extends BaseNode {
  kind: "AssertExpr";
  condition: Expr;
}

export interface RangeExpr extends BaseNode {
  kind: "RangeExpr";
  start: Expr;
  end: Expr;
}

// === Channel & Concurrency ===

export interface ChannelExpr extends BaseNode {
  kind: "ChannelExpr";
  capacity?: Expr;  // None = unbuffered, Some = buffered
}

export interface SendExpr extends BaseNode {
  kind: "SendExpr";
  channel: Expr;
  value: Expr;
}

export interface RecvExpr extends BaseNode {
  kind: "RecvExpr";
  channel: Expr;
}

export interface SelectExpr extends BaseNode {
  kind: "SelectExpr";
  arms: SelectArm[];
}

export interface SelectArm extends BaseNode {
  kind: "SelectArm";
  operation: SendExpr | RecvExpr | TimeoutExpr;
  bindName?: string;  // for recv: select { msg <- ch => ... }
  body: Expr;
}

export interface TimeoutExpr extends BaseNode {
  kind: "TimeoutExpr";
  duration: Expr;  // milliseconds
}

// === FFI Declarations ===

export interface ExternFnDecl extends BaseNode {
  kind: "ExternFnDecl";
  name: string;
  isPublic: boolean;
  isAsync: boolean;
  params: Param[];
  returnType?: TypeExpr;
  effects: TypeExpr[];
  jsBinding: string;  // JavaScript expression: "console.log", "JSON.parse", etc.
}

export interface ExternModuleDecl extends BaseNode {
  kind: "ExternModuleDecl";
  name: string;        // PLang alias: "fs", "http", "db"
  isPublic: boolean;
  jsModule: string;    // npm/node module: "fs", "better-sqlite3", "express"
  methods: ExternFnDecl[];
}

// === Test Declarations ===

export interface TestDecl extends BaseNode {
  kind: "TestDecl";
  name: string;
  body: BlockExpr;
}
