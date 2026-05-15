import { AwsClient } from 'aws4fetch';

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

  // ၁။ Wasabi ဆီကနေ အချိန်ပိုင်း Link (Pre-signed URL) ကို အရင်ယူမယ်
  const signedRequest = await aws.sign(wasabiUrl, {
    method: 'GET',
    awsService: 's3',
    signQuery: true,
    expiresIn: 3600
  });

  // ၂။ အဲ့ဒီ Link ကို Cloudflare ရဲ့ fetch နဲ့ ပြန်ခေါ်ပြီး User ကို stream ပေးမယ်
  // ဒီနေရာမှာ Cloudflare က Wasabi ဆီက Data ကို ဆွဲပြီး User ကို ပြန်ပို့ပေးသွားမှာ
  const response = await fetch(signedRequest.url, {
    method: context.request.method,
    headers: context.request.headers
  });

  // ၃။ Proxy ပြန်လုပ်ပေးမယ် (VPN မလိုတော့ဘူး)
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": response.headers.get("Content-Length"),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
