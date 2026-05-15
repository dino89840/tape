import { AwsClient } from 'aws4fetch';

const CONFIG = {
  region: 'ap-northeast-2',
  bucket: 'osaa',
  endpoint: 's3.ap-northeast-2.wasabisys.com',
  signedUrlExpiry: 604800, // 7 days
};

// Path traversal တားဆီးရန် filename sanitize
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

    // ၂။ Environment variables စစ်ဆေးခြင်း
    if (!env.WASABI_ACCESS_KEY || !env.WASABI_SECRET_KEY) {
      console.error('Wasabi credentials မထည့်ထားပါ');
      return new Response('Server configuration error', { status: 500 });
    }

    // ၃။ AWS client ဖန်တီးခြင်း
    const aws = new AwsClient({
      accessKeyId: env.WASABI_ACCESS_KEY,
      secretAccessKey: env.WASABI_SECRET_KEY,
      service: 's3',
      region: CONFIG.region,
    });

    // ၄။ Filename ကို URL encode (slash တွေတော့ ထားခဲ့)
    const encodedFileName = encodeURIComponent(fileName).replace(/%2F/g, '/');
    const wasabiUrl = `https://${CONFIG.endpoint}/${CONFIG.bucket}/${encodedFileName}`;

    // ၅။ HEAD request → file size/metadata ပြန်ပေး (Proxy mode)
    if (request.method === 'HEAD') {
      const headResponse = await aws.fetch(wasabiUrl, { method: 'HEAD' });

      if (!headResponse.ok) {
        return new Response(null, {
          status: headResponse.status === 404 ? 404 : 502,
        });
      }

      const responseHeaders = new Headers();
      // Wasabi ဆီက ပြန်လာတဲ့ headers တွေကို forward
      const forwardHeaders = ['content-length', 'content-type', 'etag', 'last-modified'];
      for (const h of forwardHeaders) {
        const v = headResponse.headers.get(h);
        if (v) responseHeaders.set(h, v);
      }
      responseHeaders.set('Accept-Ranges', 'bytes');
      responseHeaders.set('Cache-Control', 'public, max-age=3600');

      return new Response(null, {
        status: 200,
        headers: responseHeaders,
      });
    }

    // ၆။ GET request → Signed URL ထုတ်ပြီး redirect (Stream/Download mode)
    if (request.method === 'GET') {
      const signedRequest = await aws.sign(wasabiUrl, {
        method: 'GET',
        aws: { signQuery: true },
        headers: {
          'X-Amz-Expires': CONFIG.signedUrlExpiry.toString(),
        },
      });

      return Response.redirect(signedRequest.url, 302);
    }

    // ၇။ တခြား method တွေ မလက်ခံ
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
