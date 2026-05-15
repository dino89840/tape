import { AwsClient } from 'aws4fetch';

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const fileName = requestUrl.searchParams.get("file");

  // CORS preflight
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type, If-Range, If-Match, If-None-Match",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (!fileName) {
    return new Response("Missing 'file' parameter", { status: 400 });
  }

  const aws = new AwsClient({
    accessKeyId: context.env.WASABI_ACCESS_KEY,
    secretAccessKey: context.env.WASABI_SECRET_KEY,
    service: 's3',
    region: 'ap-southeast-1',
  });

  // ၁။ Presigned URL ထုတ်မယ် — X-Amz-Expires ကို query string ထဲ ထည့်ပေးရမယ်
  //    Range header က signature ထဲ မပါစေဖို့ sign() ထဲ မထည့်ဖူး
  const wasabiUrl = `https://s3.ap-southeast-1.wasabisys.com/lugyi/${encodeURIComponent(fileName)}?X-Amz-Expires=3600`;

  const signedRequest = await aws.sign(
    new Request(wasabiUrl, { method: 'GET' }),
    { aws: { signQuery: true } }
  );

  // ၂။ Wasabi ဆီ Range header ပါတဲ့ request ပို့မယ်
  //    presigned URL က host ကိုပဲ sign ထားလို့ Range ထည့်ပို့လို့ ရတယ်
  const upstreamHeaders = new Headers();
  const range = context.request.headers.get("Range");
  if (range) {
    upstreamHeaders.set("Range", range);
  }
  const ifRange = context.request.headers.get("If-Range");
  if (ifRange) {
    upstreamHeaders.set("If-Range", ifRange);
  }

  const upstreamResponse = await fetch(signedRequest.url, {
    method: context.request.method === "HEAD" ? "HEAD" : "GET",
    headers: upstreamHeaders,
  });

  // ၃။ Wasabi ဆီက ပြန်လာတဲ့ status (200 ဒါမှမဟုတ် 206) ကို မပြောင်းဘဲ ပြန်ပို့မယ်
  //    streaming အတွက် လိုအပ်တဲ့ headers တွေပဲ ရွေးပြီး forward လုပ်မယ်
  const responseHeaders = new Headers();

  const passthrough = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ];
  for (const key of passthrough) {
    const value = upstreamResponse.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }

  // Browser က Range request သိအောင်
  if (!responseHeaders.has("accept-ranges")) {
    responseHeaders.set("Accept-Ranges", "bytes");
  }

  // Cache control — seek တိုင်း Cloudflare က cache မလုပ်စေချင်ရင်
  responseHeaders.set("Cache-Control", "public, max-age=3600");

  // CORS
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag, Last-Modified"
  );

  // Error ဖြစ်ရင် log
  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    const errorText = await upstreamResponse.text();
    console.log("Wasabi error:", upstreamResponse.status, errorText);
    return new Response(`Upstream error: ${upstreamResponse.status}`, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,   // 200 ဒါမှမဟုတ် 206 — Wasabi ပေးတဲ့အတိုင်း
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
