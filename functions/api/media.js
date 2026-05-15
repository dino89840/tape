import { AwsClient } from 'aws4fetch';

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const fileName = requestUrl.searchParams.get("file");
  
  if (!fileName) return new Response("File not found", { status: 404 });

  const aws = new AwsClient({
    accessKeyId: context.env.WASABI_ACCESS_KEY,
    secretAccessKey: context.env.WASABI_SECRET_KEY,
    service: 's3',
    region: 'ap-southeast-1'
  });

  const wasabiUrl = `https://s3.ap-southeast-1.wasabisys.com/lugyi/${fileName}`;

  // Wasabi ဆီကနေ Response တောင်းမယ်
  // APK က Range Request (ရစ်ကြည့်တာ) ပို့လာရင် အဲဒီ header ကို Wasabi ဆီ ပြန်ပို့မယ်
  const response = await aws.fetch(wasabiUrl, {
    method: context.request.method,
    headers: context.request.headers
  });

  // အရေးကြီး: Cloudflare ကနေ Response ပြန်ပို့တဲ့အခါ body ကို အပြည့်အစုံယူပြီးမှ ပြန်ပို့မယ်
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "video/mp4",
      "Content-Length": response.headers.get("content-length"),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
