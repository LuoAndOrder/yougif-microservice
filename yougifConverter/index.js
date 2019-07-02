const ytdl = require('youtube-dl');
const ffmpeg = require('fluent-ffmpeg');
const Gfycat = require('gfycat-sdk');
const uuidv4 = require('uuid/v4');
const rp = require('request-promise');
const fs = require('fs');
const Discord = require('discord.js');
const { promisify } = require('util');

const discordHook = new Discord.WebhookClient(process.env.DACKBOT_WEBHOOK_ID, process.env.DACKBOT_WEBHOOK_TOKEN);
const client = new Discord.client();
client.login(process.env.DACKBOT_BOT_TOKEN);

let gfycat = new Gfycat({
  clientId: process.env.GFYCAT_CLIENT_ID,
  clientSecret: process.env.GFYCAT_CLIENT_SECRET
});

async function getGfyname(title) {
  const headers = {Authorization: gfycat.token};
  return await rp({
    uri: 'https://api.gfycat.com/v1/gfycats',
      json: true,
      method: 'POST',
      headers,
      body: {title},
  })
  .then(async ({gfyname, secret}) => {
    console.log(`gfyname: ${gfyname} secret: ${secret}`);
    return gfyname;
  });
}

async function uploadGfycat(fileUrl, gfyname) {
  await rp({
    uri: 'https://filedrop.gfycat.com',
      json: true,
      method: 'POST',
      formData: {
        key: gfyname,
        file: fs.createReadStream(fileUrl),
      },
  })
  .then(() => {
    console.log("Uploaded to gfycat.");
  });
}

async function sendMessage(channelId, msg) {
  await client.channels.get(channelId).send(msg);
}

async function handleError(err, channelId) {
  await sendMessage(channelId).send(`Human, I failed: ${err.message}`);
  console.error(err.message);
  throw err;
}

async function handleYouGifRequest(body) {
  let {url, startTime, duration, channelId} = body;
  await sendMessage('Beep boop, I am processing...');

  await gfycat.authenticate()
    .then(res => {
      console.log(res.access_token);
      console.log('token', gfycat.token);
    })
    .catch(err => {
      console.log(err);
      throw err;
    });

  let uuid = uuidv4();
  let fileUrl = `/tmp/${uuid}.webm`;
  
  let ytOptions = ['-f 22/43/18', '--get-url'];
  const ytdlGetInfo = promisify(ytdl.getInfo);
  let info = await ytdlGetInfo(url, ytOptions);

  const getSub = promisify(ytdl.getSubs);
  await getSub(url, {
    auto: true,
    format: 'srt',
    lang: 'en',
    cwd: '/tmp'
  });

  const filename = '/tmp' + info._filename.split('.mp4')[0] + '.en.vtt';
  const newFilename = '/tmp' + uuid + '.vtt';
  fs.renameSync(filename, newFilename);

  await new Promise((resolve, reject) => {
    ffmpeg(info.url)
      .setFfmpegPath('/opt/bin/ffmpeg')
      .on('start', function() {
        console.log(`[ffmpeg] Start Processing: ${info.url}`);
      })
      .on('error', function(err) {
        reject(err);
      })
      .on('end', function() {
        resolve();
      })
      .format('webm')
      .seekInput(startTime)
      .duration(duration)
      .withVideoCodec('libvpx')
      .withVideoBitrate(1024)
      .withAudioCodec('libvorbis')
      .saveToFile(fileUrl)
  });

  console.log(`[ffmpeg] Finished processing. Saved file to: ${fileUrl}`);

  // Upload to gfycat
  let gfyname; 
  try {
    gfyname = await getGfyname(info.title);
    await uploadGfycat(fileUrl, gfyname);
  } catch (err) {
    return await handleError(err, channelId);
  }

  return ({
    statusCode: 200,
    body: JSON.stringify({
      gfyname: gfyname,
      channelId: channelId
    })
  });
}

exports.handler = async (event, context) => {
  console.log(event);
  const {channelId} = event;
  try {
    return await handleYouGifRequest(event);
  } catch (err) {
    console.log(err);
    return await handleError(err, channelId);
  }
};
