async function hmac(key, string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(string));
}

async function sha256(message) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function signRequest(accessKey, secretKey, region, bucket, filename) {
  const service = 's3';
  const host = `s3.${region}.wasabisys.com`;
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');

  const canonicalUri = `/${bucket}/${filename}`;
  const canonicalQueryString = '';
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';
  const payloadHash = toHex(await sha256(''));

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    toHex(await sha256(canonicalRequest))
  ].join('\n');

  const signingKey = await hmac(
    await hmac(
      await hmac(
        await hmac('AWS4' + secretKey, dateStamp),
        region
      ),
      service
    ),
    'aws4_request'
  );

  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${host}${canonicalUri}`,
    headers: {
      'Host': host,
      'x-amz-date': amzDate,
      'Authorization': authorization,
    }
  };
}

export async function onRequest(context) {
  const { env, params } = context;
  const filename = params.filename;

  try {
    const { url, headers } = await signRequest(
      env.WASABI_ACCESS_KEY,
      env.WASABI_SECRET_KEY,
      'ap-southeast-1',
      env.WASABI_BUCKET,
      filename
    );

    const response = await fetch(url, { headers });

    if (!response.ok) {
      return new Response('File not found', { status: response.status });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Length': response.headers.get('Content-Length') || '',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}
