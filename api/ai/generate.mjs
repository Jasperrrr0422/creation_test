import { AiGatewayError, generateQwenImage } from '../../server/ai-request.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  try {
    const payload = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    const image = await generateQwenImage(payload);
    const bytes = Buffer.from(await image.arrayBuffer());
    response.setHeader('Content-Type', image.type || 'image/png');
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).send(bytes);
  } catch (error) {
    const status = error instanceof AiGatewayError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'AI gateway failed.';
    response.status(status).json({ message });
  }
}
