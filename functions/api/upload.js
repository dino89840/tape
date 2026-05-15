import { AwsClient } from 'aws4fetch';

export async function onRequestPost(context) {
  const { request, env } = context;

  const formData = await request.formData();
  const file = formData.get('file');
  
  if (!file) {
    return Response.json({ success: false, error: 'No file provided' }, { status: 400 });
  }

  const filename = `${Date.now()}_${file.name}`;
  const fileBuffer = await file.arrayBuffer();

  const aws = new AwsClient({
    accessKeyId: env.WASABI_ACCESS_KEY,
    secretAccessKey: env.WASABI_SECRET_KEY,
    region: 'ap-southeast-1',
    service: 's3',
  });

  const wasabiUrl = `https://s3.ap-southeast-1.wasabisys.com/${env.WASABI_BUCKET}/${filename}`;

  const uploadResponse = await aws.fetch(wasabiUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      'Content-Length': fileBuffer.byteLength.toString(),
    },
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
}
