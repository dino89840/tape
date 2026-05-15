import { AwsClient } from 'aws4fetch';

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const fileName = requestUrl.searchParams.get("file");

  const aws = new AwsClient({
    accessKeyId: context.env.WASABI_ACCESS_KEY,
    secretAccessKey: context.env.WASABI_SECRET_KEY,
    service: 's3',
    region: 'ap-northeast-2'
  });

  const wasabiUrl = `https://s3.ap-northeast-2.wasabisys.com/osaa/${fileName}`;

  // ၁။ Wasabi ဆီကနေ ဖိုင်ရဲ့ Header (Size နဲ့ Type) ကို အရင်ယူမယ်
  const headResponse = await aws.fetch(wasabiUrl, { method: 'HEAD' });
  const fileSize = headResponse.headers.get('content-length');

  // ၂။ အကယ်၍ APK က File Size စစ်ဖို့ (HEAD request) ပို့လာရင်
  if (context.request.method === 'HEAD') {
    return new Response(null, {
      headers: {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes'
      }
    });
  }

  // ၃။ တကယ်ဒေါင်းဖို့အတွက် Redirect လုပ်မယ့်အစား 
  // APK က Download Manager နဲ့သုံးလို့ရအောင် Link အသစ်ကို ချက်ချင်းပို့ပေးလိုက်မယ်
  const signedRequest = await aws.sign(wasabiUrl, {
    method: 'GET',
    awsService: 's3',
    signQuery: true,
    expiresIn: 604800
  });

  // အရေးကြီးချက် - APK က Size မြင်ဖို့အတွက် Proxy လုပ်ပေးရမယ်
  // Redirect မလုပ်ဘဲ Header တွေနဲ့တကွ ပြန်ပို့ပေးလိုက်မယ်
  return Response.redirect(signedRequest.url, 302);
}
