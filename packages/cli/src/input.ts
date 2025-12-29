import { readFileSync } from "node:fs";
import { Readable } from "node:stream";

declare const Deno:
  | {
    stdin: {
      readable: ReadableStream<Uint8Array>;
    };
  }
  | undefined;

/**
 * Reads input from a file or stdin.
 *
 * @param filePath The file path to read from, or undefined to read from stdin.
 * @returns The input text.
 */
export async function readInput(filePath?: string): Promise<string> {
  if (filePath != null) {
    return readFileSync(filePath, "utf-8");
  }

  return await readStdin();
}

/**
 * Reads all input from stdin.
 *
 * @returns The stdin content as a string.
 */
async function readStdin(): Promise<string> {
  const stream = await getStdinStream();
  const decoder = new TextDecoder();
  const chunks: string[] = [];

  for await (const chunk of stream) {
    chunks.push(decoder.decode(chunk, { stream: true }));
  }
  // Flush remaining bytes
  chunks.push(decoder.decode());

  return chunks.join("");
}

/**
 * Gets the stdin stream as a ReadableStream.
 * Works across Deno, Node.js, and Bun.
 *
 * @returns The stdin ReadableStream.
 */
async function getStdinStream(): Promise<ReadableStream<Uint8Array>> {
  // Deno has Deno.stdin.readable
  if (typeof Deno !== "undefined" && Deno?.stdin?.readable != null) {
    return Deno.stdin.readable;
  }

  // Node.js and Bun: convert process.stdin to web stream
  const { stdin } = await import("node:process");
  return Readable.toWeb(stdin) as ReadableStream<Uint8Array>;
}
