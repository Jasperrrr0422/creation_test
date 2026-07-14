const modeInstructions = {
  'image-to-image': 'Preserve the complete image frame, dimensions, composition, typography, and all unmentioned pixels. Do not crop, zoom, shift, resize, reframe, or move edge content. Only apply the requested change.',
  inpaint: 'Only change the object or area described by the user. Keep every other pixel, the complete frame, and all typography unchanged. Do not crop or reframe.',
  'style-transfer': 'Apply the requested visual style while preserving subject identity and composition.',
  upscale: 'Improve clarity, edge detail, and texture. Do not add or remove content.',
};

export class AiGatewayError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

export async function generateQwenImage(payload) {
  validatePayload(payload);
  await configureNetwork();
  const { InferenceClient } = await import('@huggingface/inference');
  const accessToken = normalizeToken(payload.token || process.env.HF_TOKEN || '');
  const client = new InferenceClient(accessToken);
  const sourceImage = dataUrlToBlob(payload.sourceImageDataUrl);
  const parameters = payload.parameters || {};
  const instruction = modeInstructions[payload.mode] || modeInstructions['image-to-image'];

  try {
    return await client.imageToImage({
      provider: 'auto',
      model: payload.model,
      inputs: sourceImage,
      parameters: {
        prompt: `${instruction}\nUser request: ${payload.prompt}`,
        num_inference_steps: clamp(parameters.steps, 8, 80, 50),
        guidance_scale: clamp(parameters.guidanceScale, 1, 20, 4),
        target_size: {
          width: clamp(parameters.width, 256, 1536, 1024),
          height: clamp(parameters.height, 256, 1536, 1024),
        },
        strength: clamp(parameters.strength, 0.1, 1, 0.7),
        output_format: 'png',
        acceleration: 'regular',
        enable_safety_checker: true,
      },
    });
  } catch (error) {
    const status = errorStatus(error);
    const message = errorMessage(error);
    console.error(`[AI gateway] ${error?.name || 'Error'} ${status}: ${message}`);
    throw new AiGatewayError(message, status);
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') throw new AiGatewayError('Request body is required.', 400);
  normalizeToken(payload.token || process.env.HF_TOKEN || '');
  if (typeof payload.model !== 'string' || !payload.model.startsWith('Qwen/Qwen-Image-Edit')) {
    throw new AiGatewayError('Unsupported image model.', 400);
  }
  if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) throw new AiGatewayError('An edit prompt is required.', 400);
  if (typeof payload.sourceImageDataUrl !== 'string' || !payload.sourceImageDataUrl.startsWith('data:image/')) {
    throw new AiGatewayError('A source image is required.', 400);
  }
}

function dataUrlToBlob(dataUrl) {
  const [metadata, encoded = ''] = dataUrl.split(',');
  const declaredMimeType = metadata.match(/data:([^;]+)/)?.[1]?.toLowerCase() || 'image/png';
  const mimeType = sanitizeImageMimeType(declaredMimeType);
  return new Blob([Buffer.from(encoded, 'base64')], { type: mimeType });
}

function normalizeToken(value) {
  const token = String(value || '')
    .trim()
    .replace(/^bearer\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  if (!token) throw new AiGatewayError('A Hugging Face token is required.', 401);
  if (!token.startsWith('hf_')) {
    throw new AiGatewayError('Hugging Face token must start with "hf_". Paste only the token value, or clear the token field to use the server HF_TOKEN.', 401);
  }
  if (!/^[\x21-\x7e]+$/.test(token)) {
    throw new AiGatewayError('Hugging Face token contains unsupported characters. Paste the raw hf_ token only.', 401);
  }
  return token;
}

function sanitizeImageMimeType(value) {
  const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  if (allowedTypes.has(value)) return value;
  if (value === 'image/jpg') return 'image/jpeg';
  return 'image/png';
}

function clamp(value, min, max, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.min(Math.max(numericValue, min), max) : fallback;
}

function errorStatus(error) {
  const providerStatus = Number(error?.httpResponse?.status || error?.status || 0);
  if (providerStatus) return providerStatus;
  if (error?.cause || /fetch failed|network|connect/i.test(error?.message || '')) return 502;
  if (error?.name === 'InputError') return 400;
  if (error?.name === 'RoutingError') return 503;
  if (error?.name === 'ProviderOutputError') return 502;
  return 500;
}

function errorMessage(error) {
  const body = error?.httpResponse?.body;
  const providerMessage = typeof body === 'object' && body
    ? body.error || body.message || body.detail
    : body;
  const networkCause = extractNetworkCause(error?.cause);
  const message = networkCause || providerMessage || error?.message || 'Image generation failed.';
  return String(message).replace(/hf_[A-Za-z0-9]+/g, '[redacted]').slice(0, 500);
}

let networkConfigured = false;
async function configureNetwork() {
  if (networkConfigured) return;
  networkConfigured = true;
  const proxyUrl = process.env.AI_PROXY
    || process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.HTTP_PROXY
    || process.env.http_proxy;
  if (!proxyUrl) return;
  const { ProxyAgent, setGlobalDispatcher } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

function extractNetworkCause(cause) {
  if (!cause) return '';
  const nestedCause = Array.isArray(cause.errors) ? cause.errors[0] : cause;
  const details = [nestedCause.code, nestedCause.hostname, nestedCause.message].filter(Boolean);
  return details.length ? `Network connection failed: ${details.join(' - ')}` : '';
}
