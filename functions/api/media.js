import { AwsClient } from 'aws4fetch';

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const fileName = requestUrl.searchParams.get("file");

  if (!fileName) {
    return new Response("File name is missing", { status: 400 });
  }

  const aws = new AwsClient({
    accessKeyId: context.env.WASABI_ACCESS_KEY,
    secretAccessKey: context.env.WASABI_SECRET_KEY,
    service: 's3',
    region: 'ap-southeast-1' // အစ်ကို့ Wasabi Region အတိုင်း (လိုအပ်ရင် ပြင်ပေးပါ)
  });

  const bucketName = "lugyi";
  const wasabiUrl = `https://s3.ap-southeast-1.wasabisys.com/${bucketName}/${fileName}`;

  try {
    // ၇ ရက်စာ (604800 စက္ကန့်) သက်တမ်းရှိတဲ့ Link ထုတ်မယ်
    const signedRequest = await aws.sign(wasabiUrl, {
      method: 'GET',
      awsService: 's3',
      signQuery: true,
      expiresIn: 604800 
    });

    // User ကို Wasabi လင့်ခ်အရှည်ကြီးဆီ Redirect လုပ်ပေးမယ်
    return Response.redirect(signedRequest.url, 302);
    
  } catch (error) {
    return new Response("Error generating link", { status: 500 });
  }
}
