import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const fileName = requestUrl.searchParams.get("file");

  const aws = new AwsClient({
    accessKeyId: context.env.WASABI_ACCESS_KEY,
    secretAccessKey: context.env.WASABI_SECRET_KEY,
    service: 's3',
    region: 'ap-southeast-1'
  });

  const wasabiUrl = `https://s3.ap-southeast-1.wasabisys.com/lugyi/${fileName}`;

  // ၁။ ဖိုင်ဆိုဒ်နဲ့ အမျိုးအစားကို သိရအောင် Wasabi ကို HEAD Request ပို့မယ်
  const headRes = await aws.fetch(wasabiUrl, { method: 'HEAD' });

  // ၂။ အကယ်၍ APK က File Size စစ်ဖို့ လှမ်းခေါ်တာဆိုရင် (HEAD request)
  if (context.request.method === 'HEAD') {
    return new Response(null, {
      headers: {
        'Content-Length': headRes.headers.get('content-length'),
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes'
      }
    });
  }

  // ၃။ တကယ်ဒေါင်းဖို့အတွက် Redirect လုပ်မယ်
  const signedRequest = await aws.sign(wasabiUrl, {
    method: 'GET',
    awsService: 's3',
    signQuery: true,
    expiresIn: 604800
  });

  return Response.redirect(signedRequest.url, 302);
}
