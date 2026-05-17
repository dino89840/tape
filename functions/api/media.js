import { AwsClient } from 'aws4fetch';

const CONFIG = {
  region: 'ap-northeast-1',
  bucket: 'namisi',
  endpoint: 's3.ap-northeast-1.wasabisys.com',
  signedUrlExpiry: 604800, // 7 days (max for S3 signed URLs)
};

function sanitizeFileName(name) {
  if (!name || typeof name !== 'string') return null;
  if (name.includes('..') || name.includes('\\') || name.startsWith('/')) return null;
  if (name.length > 500) return null;
  return name;
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    const requestUrl = new URL(request.url);
    const rawFileName = requestUrl.searchParams.get('file');

    // ၁။ Input validation
    const fileName = sanitizeFileName(rawFileName);
    if (!fileName) {
      return new Response('Invalid or missing file parameter', { status: 400 });
    }

    // ၂။ Env vars စစ်ဆေး
    if (!env.WASABI_ACCESS_KEY || !env.WASABI_SECRET_KEY) {
      console.error('Wasabi credentials မထည့်ထားပါ');
      return new Response('Server configuration error', { status: 500 });
    }

    // ၃။ AWS client
    const aws = new AwsClient({
      accessKeyId: env.WASABI_ACCESS_KEY,
      secretAccessKey: env.WASABI_SECRET_KEY,
      service: 's3',
      region: CONFIG.region,
    });

    // ၄။ Filename ကို encode (slash ထားခဲ့)
    const encodedFileName = encodeURIComponent(fileName).replace(/%2F/g, '/');
    const wasabiUrl = `https://${CONFIG.endpoint}/${CONFIG.bucket}/${encodedFileName}`;

    // ၅။ HEAD → file size/metadata proxy
    if (request.method === 'HEAD') {
      const headResponse = await aws.fetch(wasabiUrl, { method: 'HEAD' });

      if (!headResponse.ok) {
        return new Response(null, {
          status: headResponse.status === 404 ? 404 : 502,
        });
      }

      const responseHeaders = new Headers();
      const forwardHeaders = ['content-length', 'content-type', 'etag', 'last-modified'];
      for (const h of forwardHeaders) {
        const v = headResponse.headers.get(h);
        if (v) responseHeaders.set(h, v);
      }
      responseHeaders.set('Accept-Ranges', 'bytes');
      responseHeaders.set('Cache-Control', 'public, max-age=3600');

      return new Response(null, { status: 200, headers: responseHeaders });
    }

    // ၆။ GET → Signed URL redirect
    if (request.method === 'GET') {
      // X-Amz-Expires ကို query parameter အဖြစ် URL ထဲ တိုက်ရိုက်ထည့်ရမယ်
      const urlToSign = new URL(wasabiUrl);
      urlToSign.searchParams.set('X-Amz-Expires', CONFIG.signedUrlExpiry.toString());

      const signedRequest = await aws.sign(urlToSign.toString(), {
        method: 'GET',
        aws: { signQuery: true },
      });

      return Response.redirect(signedRequest.url, 302);
    }

    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
