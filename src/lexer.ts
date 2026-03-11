// PLang Lexer — tokenizes .pl1 source into a token stream

export enum TokenType {
  // Literals
  IntLiteral = "IntLiteral",
  FloatLiteral = "FloatLiteral",
  StrLiteral = "StrLiteral",
  CharLiteral = "CharLiteral",

  // Identifiers & Keywords
  Identifier = "Identifier",
  Module = "module",
  Use = "use",
  Pub = "pub",
  Fn = "fn",
  Let = "let",
  Var = "var",
  Type = "type",
  Trait = "trait",
  Impl = "impl",
  For = "for",
  In = "in",
  If = "if",
  Else = "else",
  Match = "match",
  While = "while",
  Return = "return",
  Break = "break",
  Continue = "continue",
  Async = "async",
  Await = "await",
  True = "true",
  False = "false",
  Test = "test",
  Require = "require",
  Ensure = "ensure",
  Assert = "assert",
  As = "as",
  With = "with",
  TaskGroup = "task_group",
  Catch = "catch",
  Self = "self",
  Spawn = "spawn",
  Channel = "channel",
  Send = "send",
  Recv = "recv",
  Select = "select",
  Timeout = "timeout",
  Extern = "extern",
  Null = "null",

  // Operators
  Plus = "+",
  Minus = "-",
  Star = "*",
  Slash = "/",
  Percent = "%",
  EqEq = "==",
  NotEq = "!=",
  Lt = "<",
  Gt = ">",
  LtEq = "<=",
  GtEq = ">=",
  And = "&&",
  Or = "||",
  Bang = "!",
  Pipe = "|",
  PipeGt = "|>",
  PlusPlus = "++",
  DotDot = "..",
  TildeEq = "~=",
  Eq = "=",
  PlusEq = "+=",
  MinusEq = "-=",
  StarEq = "*=",
  SlashEq = "/=",
  Arrow = "->",
  FatArrow = "=>",

  // Delimiters
  LParen = "(",
  RParen = ")",
  LBrace = "{",
  RBrace = "}",
  LBracket = "[",
  RBracket = "]",

  // Punctuation
  Semicolon = ";",
  Colon = ":",
  Comma = ",",
  Dot = ".",
  Underscore = "_",

  // Special
  EOF = "EOF",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  offset: number;
}

const KEYWORDS: Record<string, TokenType> = {
  module: TokenType.Module,
  use: TokenType.Use,
  pub: TokenType.Pub,
  fn: TokenType.Fn,
  let: TokenType.Let,
  var: TokenType.Var,
  type: TokenType.Type,
  trait: TokenType.Trait,
  impl: TokenType.Impl,
  for: TokenType.For,
  in: TokenType.In,
  if: TokenType.If,
  else: TokenType.Else,
  match: TokenType.Match,
  while: TokenType.While,
  return: TokenType.Return,
  break: TokenType.Break,
  continue: TokenType.Continue,
  async: TokenType.Async,
  await: TokenType.Await,
  true: TokenType.True,
  false: TokenType.False,
  test: TokenType.Test,
  require: TokenType.Require,
  ensure: TokenType.Ensure,
  assert: TokenType.Assert,
  as: TokenType.As,
  with: TokenType.With,
  task_group: TokenType.TaskGroup,
  catch: TokenType.Catch,
  self: TokenType.Self,
  spawn: TokenType.Spawn,
  channel: TokenType.Channel,
  send: TokenType.Send,
  recv: TokenType.Recv,
  select: TokenType.Select,
  timeout: TokenType.Timeout,
  extern: TokenType.Extern,
  null: TokenType.Null,
};

export class LexerError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
  ) {
    super(`Lexer error at ${line}:${column}: ${message}`);
    this.name = "LexerError";
  }
}

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];

      if (this.isDigit(ch)) {
        this.readNumber();
      } else if (this.isIdentStart(ch)) {
        this.readIdentifierOrKeyword();
      } else if (ch === '"') {
        this.readString();
      } else if (ch === "'") {
        this.readChar();
      } else {
        this.readOperatorOrPunctuation();
      }
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: "",
      line: this.line,
      column: this.column,
      offset: this.pos,
    });

    return this.tokens;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];

      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        if (ch === '\n') {
          this.line++;
          this.column = 1;
        } else {
          this.column++;
        }
        this.pos++;
      } else if (ch === '/' && this.pos + 1 < this.source.length) {
        if (this.source[this.pos + 1] === '/') {
          // Single-line comment
          this.pos += 2;
          this.column += 2;
          while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
            this.pos++;
            this.column++;
          }
        } else if (this.source[this.pos + 1] === '*') {
          // Multi-line comment
          this.pos += 2;
          this.column += 2;
          while (this.pos + 1 < this.source.length) {
            if (this.source[this.pos] === '*' && this.source[this.pos + 1] === '/') {
              this.pos += 2;
              this.column += 2;
              break;
            }
            if (this.source[this.pos] === '\n') {
              this.line++;
              this.column = 1;
            } else {
              this.column++;
            }
            this.pos++;
          }
        } else {
          break;
        }
      } else {
        break;
      }
    }
  }

  private readNumber(): void {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;
    let isFloat = false;

    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      this.pos++;
      this.column++;
    }

    if (
      this.pos < this.source.length &&
      this.source[this.pos] === '.' &&
      this.pos + 1 < this.source.length &&
      this.isDigit(this.source[this.pos + 1])
    ) {
      isFloat = true;
      this.pos++;
      this.column++;
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        this.pos++;
        this.column++;
      }
    }

    const value = this.source.slice(startPos, this.pos);
    this.tokens.push({
      type: isFloat ? TokenType.FloatLiteral : TokenType.IntLiteral,
      value,
      line: startLine,
      column: startCol,
      offset: startPos,
    });
  }

  private readIdentifierOrKeyword(): void {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;

    while (this.pos < this.source.length && this.isIdentContinue(this.source[this.pos])) {
      this.pos++;
      this.column++;
    }

    const value = this.source.slice(startPos, this.pos);
    const tokenType = KEYWORDS[value] ?? TokenType.Identifier;

    // Special case: _ alone is Underscore
    if (value === "_") {
      this.tokens.push({
        type: TokenType.Underscore,
        value,
        line: startLine,
        column: startCol,
        offset: startPos,
      });
      return;
    }

    this.tokens.push({
      type: tokenType,
      value,
      line: startLine,
      column: startCol,
      offset: startPos,
    });
  }

  private readString(): void {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;

    this.pos++; // skip opening "
    this.column++;

    let value = "";
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === '\\') {
        this.pos++;
        this.column++;
        if (this.pos >= this.source.length) {
          throw new LexerError("Unterminated string escape", this.line, this.column);
        }
        const escaped = this.source[this.pos];
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case '"': value += '"'; break;
          default:
            throw new LexerError(`Unknown escape sequence: \\${escaped}`, this.line, this.column);
        }
      } else {
        if (this.source[this.pos] === '\n') {
          this.line++;
          this.column = 1;
        }
        value += this.source[this.pos];
      }
      this.pos++;
      this.column++;
    }

    if (this.pos >= this.source.length) {
      throw new LexerError("Unterminated string literal", startLine, startCol);
    }

    this.pos++; // skip closing "
    this.column++;

    this.tokens.push({
      type: TokenType.StrLiteral,
      value,
      line: startLine,
      column: startCol,
      offset: startPos,
    });
  }

  private readChar(): void {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;

    this.pos++; // skip opening '
    this.column++;

    let value: string;
    if (this.source[this.pos] === '\\') {
      this.pos++;
      this.column++;
      const escaped = this.source[this.pos];
      switch (escaped) {
        case 'n': value = '\n'; break;
        case 't': value = '\t'; break;
        case 'r': value = '\r'; break;
        case '\\': value = '\\'; break;
        case "'": value = "'"; break;
        default:
          throw new LexerError(`Unknown escape in char: \\${escaped}`, this.line, this.column);
      }
    } else {
      value = this.source[this.pos];
    }

    this.pos++;
    this.column++;

    if (this.pos >= this.source.length || this.source[this.pos] !== "'") {
      throw new LexerError("Unterminated char literal", startLine, startCol);
    }

    this.pos++; // skip closing '
    this.column++;

    this.tokens.push({
      type: TokenType.CharLiteral,
      value,
      line: startLine,
      column: startCol,
      offset: startPos,
    });
  }

  private readOperatorOrPunctuation(): void {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;
    const ch = this.source[this.pos];
    const next = this.pos + 1 < this.source.length ? this.source[this.pos + 1] : "";

    let type: TokenType;
    let value: string;

    // Two-character operators
    if (ch === '=' && next === '=') { type = TokenType.EqEq; value = "=="; this.pos += 2; this.column += 2; }
    else if (ch === '!' && next === '=') { type = TokenType.NotEq; value = "!="; this.pos += 2; this.column += 2; }
    else if (ch === '<' && next === '=') { type = TokenType.LtEq; value = "<="; this.pos += 2; this.column += 2; }
    else if (ch === '>' && next === '=') { type = TokenType.GtEq; value = ">="; this.pos += 2; this.column += 2; }
    else if (ch === '&' && next === '&') { type = TokenType.And; value = "&&"; this.pos += 2; this.column += 2; }
    else if (ch === '|' && next === '>') { type = TokenType.PipeGt; value = "|>"; this.pos += 2; this.column += 2; }
    else if (ch === '|' && next === '|') { type = TokenType.Or; value = "||"; this.pos += 2; this.column += 2; }
    else if (ch === '+' && next === '+') { type = TokenType.PlusPlus; value = "++"; this.pos += 2; this.column += 2; }
    else if (ch === '+' && next === '=') { type = TokenType.PlusEq; value = "+="; this.pos += 2; this.column += 2; }
    else if (ch === '-' && next === '>') { type = TokenType.Arrow; value = "->"; this.pos += 2; this.column += 2; }
    else if (ch === '-' && next === '=') { type = TokenType.MinusEq; value = "-="; this.pos += 2; this.column += 2; }
    else if (ch === '*' && next === '=') { type = TokenType.StarEq; value = "*="; this.pos += 2; this.column += 2; }
    else if (ch === '/' && next === '=') { type = TokenType.SlashEq; value = "/="; this.pos += 2; this.column += 2; }
    else if (ch === '=' && next === '>') { type = TokenType.FatArrow; value = "=>"; this.pos += 2; this.column += 2; }
    else if (ch === '~' && next === '=') { type = TokenType.TildeEq; value = "~="; this.pos += 2; this.column += 2; }
    else if (ch === '.' && next === '.') { type = TokenType.DotDot; value = ".."; this.pos += 2; this.column += 2; }
    // Single-character operators
    else {
      this.pos++;
      this.column++;
      value = ch;
      switch (ch) {
        case '+': type = TokenType.Plus; break;
        case '-': type = TokenType.Minus; break;
        case '*': type = TokenType.Star; break;
        case '/': type = TokenType.Slash; break;
        case '%': type = TokenType.Percent; break;
        case '<': type = TokenType.Lt; break;
        case '>': type = TokenType.Gt; break;
        case '!': type = TokenType.Bang; break;
        case '|': type = TokenType.Pipe; break;
        case '=': type = TokenType.Eq; break;
        case '(': type = TokenType.LParen; break;
        case ')': type = TokenType.RParen; break;
        case '{': type = TokenType.LBrace; break;
        case '}': type = TokenType.RBrace; break;
        case '[': type = TokenType.LBracket; break;
        case ']': type = TokenType.RBracket; break;
        case ';': type = TokenType.Semicolon; break;
        case ':': type = TokenType.Colon; break;
        case ',': type = TokenType.Comma; break;
        case '.': type = TokenType.Dot; break;
        default:
          throw new LexerError(`Unexpected character: '${ch}'`, startLine, startCol);
      }
    }

    this.tokens.push({ type, value, line: startLine, column: startCol, offset: startPos });
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isIdentStart(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  private isIdentContinue(ch: string): boolean {
    return this.isIdentStart(ch) || this.isDigit(ch);
  }
}
