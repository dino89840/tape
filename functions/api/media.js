// npm install စရာမလိုဘဲ esm.sh ကနေ တိုက်ရိုက် လှမ်းယူသုံးပါမယ်
import { AwsClient } from 'aws4fetch';

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  
  // URL ထဲကနေ file နာမည်ကို ယူမယ် (?file=image.jpg)
  const fileName = requestUrl.searchParams.get("file");

  if (!fileName) {
    return new Response("File name is missing", { status: 400 });
  }

  // Cloudflare Environment Variables ကနေ Key တွေယူမယ်
  const aws = new AwsClient({
    accessKeyId: context.env.WASABI_ACCESS_KEY,
    secretAccessKey: context.env.WASABI_SECRET_KEY,
    service: 's3',
    region: 'ap-southeast-1' // အစ်ကို့ Wasabi Region
  });

  const bucketName = "lugyi"; // အစ်ကို့ Bucket နာမည်
  const wasabiUrl = `https://s3.ap-southeast-1.wasabisys.com/${bucketName}/${fileName}`;

  try {
    // Wasabi ဆီကနေ ၁ နာရီခံမယ့် Temporary Link (Pre-signed URL) ကို အလိုအလျောက် ထုတ်မယ်
    const signedRequest = await aws.sign(wasabiUrl, {
      method: 'GET',
      awsService: 's3',
      signQuery: true, // Header အနေနဲ့မသုံးဘဲ URL နောက်မှာ Key တွေကပ်ပါအောင်လုပ်တာပါ
      expiresIn: 3600  // Link သက်တမ်း ၁ နာရီ (စက္ကန့် ၃၆၀၀)
    });

    // ထွက်လာတဲ့ Link ဆီကို User ကို ချက်ချင်း Redirect လွှဲပေးလိုက်မယ်
    // ဒါမှ Video တွေဆို လွတ်လွတ်လပ်လပ် ရစ်ကြည့်လို့ရမှာပါ
    return Response.redirect(signedRequest.url, 302);
    
  } catch (error) {
    return new Response("Error generating media link", { status: 500 });
  }
}
