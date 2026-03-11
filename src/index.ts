// PLang Compiler — main entry point

export { Lexer, TokenType, LexerError } from "./lexer";
export { Parser, ParseError } from "./parser";
export { TypeChecker, TypeCheckError } from "./typechecker";
export { CodeGenerator } from "./codegen";
export * as AST from "./ast";

import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { TypeChecker } from "./typechecker";
import { CodeGenerator } from "./codegen";

export interface CompileResult {
  success: boolean;
  js?: string;
  errors: string[];
}

export function compile(source: string, file: string = "<stdin>"): CompileResult {
  const errors: string[] = [];

  // Lex
  let tokens;
  try {
    const lexer = new Lexer(source);
    tokens = lexer.tokenize();
  } catch (e: any) {
    return { success: false, errors: [e.message] };
  }

  // Parse
  let ast;
  try {
    const parser = new Parser(tokens, file);
    ast = parser.parse();
  } catch (e: any) {
    return { success: false, errors: [e.message] };
  }

  // Type check
  const checker = new TypeChecker();
  const typeErrors = checker.check(ast);
  for (const err of typeErrors) {
    errors.push(err.message);
  }

  // Generate JS (even with type errors, for development)
  const generator = new CodeGenerator();
  const js = generator.generate(ast);

  return {
    success: errors.length === 0,
    js,
    errors,
  };
}

export function compileTests(source: string, file: string = "<stdin>"): CompileResult {
  const errors: string[] = [];

  let tokens;
  try {
    const lexer = new Lexer(source);
    tokens = lexer.tokenize();
  } catch (e: any) {
    return { success: false, errors: [e.message] };
  }

  let ast;
  try {
    const parser = new Parser(tokens, file);
    ast = parser.parse();
  } catch (e: any) {
    return { success: false, errors: [e.message] };
  }

  const checker = new TypeChecker();
  const typeErrors = checker.check(ast);
  for (const err of typeErrors) {
    errors.push(err.message);
  }

  const generator = new CodeGenerator();
  const js = generator.generateTestRunner(ast);

  return {
    success: errors.length === 0,
    js,
    errors,
  };
}
