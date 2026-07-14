import http from 'node:http';
import { AiGatewayError, generateQwenImage } from './ai-request.mjs';

const port = Number(process.env.AI_API_PORT || 3001);
const maximumBodySize = 25 * 1024 * 1024;

const server = http.createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/api/ai/generate') {
    sendJson(response, 404, { message: 'Not found.' });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const image = await generateQwenImage(body);
    const bytes = Buffer.from(await image.arrayBuffer());
    response.writeHead(200, {
      'Content-Type': image.type || 'image/png',
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store',
    });
    response.end(bytes);
  } catch (error) {
    const status = error instanceof AiGatewayError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'AI gateway failed.';
    sendJson(response, status, { message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`AI gateway listening on http://127.0.0.1:${port}`);
});

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maximumBodySize) {
        reject(new AiGatewayError('Source image is too large.', 413));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new AiGatewayError('Invalid JSON request.', 400));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
