#!/usr/bin/env node

// PLang CLI — command-line interface for the PLang compiler

import * as fs from "fs";
import * as path from "path";
import { compile, compileTests } from "./index";

function usage(): void {
  console.log(`PLang Compiler v0.1.0

Usage:
  plang compile <file.pl1> [-o <output.js>]    Compile a .pl1 file to JavaScript
  plang run <file.pl1>                          Compile and run a .pl1 file
  plang test <file.pl1>                         Run tests in a .pl1 file
  plang check <file.pl1>                        Type-check without generating code
  plang help                                    Show this help message

Options:
  -o, --output <file>    Output file path (default: stdout for compile, temp for run)
  --no-typecheck         Skip type checking
  --emit-ast             Print the AST as JSON
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    usage();
    process.exit(0);
  }

  const command = args[0];
  const file = args[1];

  if (!file) {
    console.error(`Error: No input file specified`);
    process.exit(1);
  }

  if (!fs.existsSync(file)) {
    console.error(`Error: File not found: ${file}`);
    process.exit(1);
  }

  const source = fs.readFileSync(file, "utf-8");

  switch (command) {
    case "compile": {
      const result = compile(source, file);

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.error(err);
        }
      }

      const outputIdx = args.indexOf("-o") !== -1 ? args.indexOf("-o") : args.indexOf("--output");
      if (outputIdx !== -1 && args[outputIdx + 1]) {
        const outPath = args[outputIdx + 1];
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, result.js || "");
        console.log(`Compiled to ${outPath}`);
      } else {
        console.log(result.js || "");
      }

      if (!result.success) process.exit(1);
      break;
    }

    case "run": {
      const result = compile(source, file);

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.error(err);
        }
      }

      if (result.js) {
        // Write to temp file and execute
        const tmpDir = path.join(process.cwd(), ".plang-tmp");
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmpFile = path.join(tmpDir, path.basename(file, ".pl1") + ".js");
        fs.writeFileSync(tmpFile, result.js);

        try {
          require(tmpFile);
        } catch (e: any) {
          if (e.tag === "propagate") {
            console.error("Unhandled error:", e.data);
          } else {
            console.error(e.message);
          }
          process.exit(1);
        } finally {
          // Cleanup
          try {
            fs.unlinkSync(tmpFile);
            fs.rmdirSync(tmpDir);
          } catch {}
        }
      }

      if (!result.success) process.exit(1);
      break;
    }

    case "test": {
      const result = compileTests(source, file);

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.error(err);
        }
      }

      if (result.js) {
        const tmpDir = path.join(process.cwd(), ".plang-tmp");
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmpFile = path.join(tmpDir, path.basename(file, ".pl1") + ".test.js");
        fs.writeFileSync(tmpFile, result.js);

        try {
          require(tmpFile);
        } catch (e: any) {
          console.error("Test runner error:", e.message);
          process.exit(1);
        } finally {
          try {
            fs.unlinkSync(tmpFile);
            fs.rmdirSync(tmpDir);
          } catch {}
        }
      }

      if (!result.success) process.exit(1);
      break;
    }

    case "check": {
      const result = compile(source, file);

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.error(err);
        }
        process.exit(1);
      } else {
        console.log("No type errors found.");
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

main();
