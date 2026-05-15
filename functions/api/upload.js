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

async function sha256bytes(data) {
  return crypto.subtle.digest('SHA-256', data);
}

async function sha256(message) {
  return sha256bytes(new TextEncoder().encode(message));
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function signUploadRequest(accessKey, secretKey, region, bucket, filename, contentType, bodyBuffer) {
  const service = 's3';
  const host = `s3.${region}.wasabisys.com`;
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');

  const canonicalUri = `/${bucket}/${filename}`;
  const canonicalQueryString = '';
  const payloadHash = toHex(await sha256bytes(bodyBuffer));

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';

  const canonicalRequest = [
    'PUT',
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
      'Content-Type': contentType,
      'x-amz-date': amzDate,
      'Authorization': authorization,
    }
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const formData = await request.formData();
  const file = formData.get('file');

  if (!file) {
    return Response.json({ success: false, error: 'No file provided' }, { status: 400 });
  }

  const filename = `${Date.now()}_${file.name}`;
  const contentType = file.type || 'application/octet-stream';
  const fileBuffer = await file.arrayBuffer();

  try {
    const { url, headers } = await signUploadRequest(
      env.WASABI_ACCESS_KEY,
      env.WASABI_SECRET_KEY,
      'ap-southeast-1',
      env.WASABI_BUCKET,
      filename,
      contentType,
      fileBuffer
    );

    const uploadResponse = await fetch(url, {
      method: 'PUT',
      headers,
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      return Response.json({ success: false, error: errText }, { status: 500 });
    }

    return Response.json({
      success: true,
      filename: filename,
      proxyUrl: `/file/${filename}`
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
