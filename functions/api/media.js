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

  // Wasabi ဆီကနေ ဖိုင်ကိုဆွဲယူပြီး Proxy လုပ်မယ်
  const response = await aws.fetch(wasabiUrl, {
    headers: context.request.headers // APK ရဲ့ Range request တွေကိုပါ Wasabi ဆီပို့ပေးမယ်
  });

  // Cloudflare ကနေ headers တွေကို ပြန်ပြင်ပို့မယ် (Size နဲ့ Download အတွက်)
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Content-Disposition", `attachment; filename="${fileName}"`);
  newHeaders.set("Access-Control-Allow-Origin", "*");

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders
  });
}
