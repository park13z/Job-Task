import { z } from "zod";
import type { Context } from "hono";
import { successSchema } from "../shared/contracts";
import { ApiError, input, output } from "./errors";
import { revision } from "./reads";
import type { App } from "./types";

export async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    throw new ApiError(403, "FORBIDDEN", "The request origin is not allowed.");
  }
  if (request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Use application/json.");
  }
  const tooLarge = () => new ApiError(413, "PAYLOAD_TOO_LARGE", "The request exceeds 32 KiB.");
  const length = request.headers.get("Content-Length");
  if (length !== null && Number(length) > 32_768) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "VALIDATION_ERROR", "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 32_768) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ApiError(400, "VALIDATION_ERROR", "The body must be valid JSON."); }
}

export async function body<T extends z.ZodType>(context: Context<App>, schema: T): Promise<z.output<T>> {
  return input(schema, await readBody(context.req.raw));
}

export async function respond<T extends z.ZodType>(context: Context<App>, schema: T, data: unknown, status: 200 | 201 = 200) {
  return context.json(output(successSchema(schema), { data, revision: await revision(context.env.DB) }), status);
}
