import { AwsClient } from 'aws4fetch';

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const fileName = requestUrl.searchParams.get("file");

  if (!fileName) {
    return new Response("Missing 'file' parameter", { status: 400 });
  }

  // CORS preflight ကို ဖြေရှင်းပေးမယ်
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const aws = new AwsClient({
    accessKeyId: context.env.WASABI_ACCESS_KEY,
    secretAccessKey: context.env.WASABI_SECRET_KEY,
    service: 's3',
    region: 'ap-southeast-1'
  });

  const wasabiUrl = `https://s3.ap-southeast-1.wasabisys.com/lugyi/${encodeURIComponent(fileName)}`;

  // ၁။ Presigned URL ထုတ်မယ် (၁ နာရီ သက်တမ်း)
  const signedRequest = await aws.sign(wasabiUrl, {
    method: 'GET',
    aws: { signQuery: true },
  });

  // ၂။ Client ရဲ့ Range header ကိုပဲ ရွေးပြီး Wasabi ဆီ ပို့မယ်
  //    (Headers အကုန်လုံး forward မလုပ်ဖူး – ဒါက ပြဿနာ၏ အရင်းအမြစ်)
  const forwardHeaders = new Headers();
  const rangeHeader = context.request.headers.get("Range");
  if (rangeHeader) {
    forwardHeaders.set("Range", rangeHeader);
  }
  const ifRange = context.request.headers.get("If-Range");
  if (ifRange) {
    forwardHeaders.set("If-Range", ifRange);
  }

  // ၃။ Wasabi ဆီ fetch လုပ်မယ်
  const response = await fetch(signedRequest.url, {
    method: context.request.method, // GET ဒါမှမဟုတ် HEAD
    headers: forwardHeaders,
  });

  // ၄။ လိုအပ်တဲ့ Headers တွေပဲ ပြန် Copy လုပ်မယ်
  const newHeaders = new Headers();

  const passthrough = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
    "cache-control",
  ];

  for (const key of passthrough) {
    const value = response.headers.get(key);
    if (value) newHeaders.set(key, value);
  }

  // Range request ကို browser က သိအောင် Accept-Ranges အမြဲထည့်ပေးမယ်
  if (!newHeaders.has("accept-ranges")) {
    newHeaders.set("Accept-Ranges", "bytes");
  }

  // CORS
  newHeaders.set("Access-Control-Allow-Origin", "*");
  newHeaders.set("Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, Content-Type");

  // Status code က Wasabi ပြန်ပေးတဲ့အတိုင်း (200 ဒါမှမဟုတ် 206) ထားရမယ်
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
