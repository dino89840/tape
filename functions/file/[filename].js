import { AwsClient } from 'aws4fetch';

export async function onRequest(context) {
  const { request, env, params } = context;
  
  const filename = params.filename;
  
  // Wasabi credentials from environment variables
  const aws = new AwsClient({
    accessKeyId: env.WASABI_ACCESS_KEY,
    secretAccessKey: env.WASABI_SECRET_KEY,
    region: 'ap-southeast-1',
    service: 's3',
  });

  const wasabiUrl = `https://s3.ap-southeast-1.wasabisys.com/${env.WASABI_BUCKET}/${filename}`;

  try {
    // aws4fetch က automatically sign လုပ်ပေးတယ်
    const signedRequest = await aws.sign(wasabiUrl, {
      method: 'GET',
      headers: {
        'Host': 's3.ap-southeast-1.wasabisys.com',
      }
    });

    const response = await fetch(signedRequest);

    if (!response.ok) {
      return new Response('File not found', { status: response.status });
    }

    // File ကို stream လုပ်ပြန်ပေးတယ်
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Length': response.headers.get('Content-Length') || '',
        'Cache-Control': 'public, max-age=3600',
        // CORS လိုရင် ထည့်
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}
