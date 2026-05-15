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

  // ၁။ Wasabi ဆီကနေ အချိန်ပိုင်း Link (Pre-signed URL) ထုတ်မယ်
  const signedRequest = await aws.sign(wasabiUrl, {
    method: 'GET',
    awsService: 's3',
    signQuery: true,
    expiresIn: 3600
  });

  // ၂။ APK က ပို့လိုက်တဲ့ Headers (Range: bytes=...) ကို Wasabi ဆီ ပို့ပေးရမယ်
  // ဒါမှသာ သူက ရစ်ကြည့်တဲ့ အပိုင်းကို သီးသန့်ပေးမှာပါ
  const response = await fetch(signedRequest.url, {
    method: context.request.method,
    headers: context.request.headers // ဒီနေရာမှာ Range header ပါသွားပြီ
  });

  // ၃။ Headers အကုန် ပြန် Copy ကူးပေးမယ်
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*");
  
  // အရေးကြီး: Range request ဖြစ်ရင် Status က 206 ဖြစ်ရမယ်
  return new Response(response.body, {
    status: response.status,
    headers: newHeaders
  });
}
