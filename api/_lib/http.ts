/// <reference types="node" />

import type { IncomingMessage, ServerResponse } from 'node:http'

export interface VercelRequest extends IncomingMessage {
  body?: Record<string, unknown>
}

export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse
  json(body: unknown): VercelResponse
}