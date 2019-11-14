const ytdl = require('youtube-dl');
const ffmpeg = require('fluent-ffmpeg');
const Gfycat = require('gfycat-sdk');
const uuidv4 = require('uuid/v4');
const rp = require('request-promise');
const fs = require('fs');
const Discord = require('discord.js');
const { promisify } = require('util');

let client = new Discord.Client();

let gfycat = new Gfycat({
  clientId: process.env.GFYCAT_CLIENT_ID,
  clientSecret: process.env.GFYCAT_CLIENT_SECRET
});

async function getGfyname(title) {
  const headers = { Authorization: gfycat.token };
  return await rp({
    uri: 'https://api.gfycat.com/v1/gfycats',
    json: true,
    method: 'POST',
    headers,
    body: { title },
  })
    .then(async ({ gfyname, secret }) => {
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
  console.log(`[sendMessage] channelId: ${channelId} msg: ${msg}`);
  let channel = client.channels.get(channelId);
  if (!channel) {
    console.log(`[sendMessage] channel not found! ${channelId}`);
    console.log(JSON.stringify(client.channels));
    console.log(`Client Status: ${client.status}`);
  }
  var msg = await client.channels.get(channelId).send(msg);
  return msg.id;
}

async function handleError(err, channelId) {
  await sendMessage(channelId, `Human, I failed: ${err.message}`);
  console.error(err.message);
  throw err;
}

async function handleYouGifRequest(body) {
  let { url, startTime, duration, channelId } = body;
  console.log(`url: ${url} startTime: ${startTime} duration: ${duration} channelId: ${channelId}`);
  var msgId = await sendMessage(channelId, 'Beep boop, I am processing...');

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

  const filename = '/tmp/' + info._filename.split('.mp4')[0] + '.en.vtt';
  const newFilename = '/tmp/' + uuid + '.vtt';
  let hasSubs = fs.existsSync(filename);
  if (hasSubs) {
    fs.renameSync(filename, newFilename);
  }

  await new Promise((resolve, reject) => {
    let command = ffmpeg(info.url)
      .setFfmpegPath('/opt/bin/ffmpeg')
      .on('start', function () {
        console.log(`[ffmpeg] Start Processing: ${info.url}`);
      })
      .on('error', function (err) {
        reject(err);
      })
      .on('end', function () {
        resolve();
      })
      .format('webm')
      .seekInput(startTime)
      .duration(duration)
      .withVideoCodec('libvpx')
      .withVideoBitrate(1024)
      .withAudioCodec('libvorbis')
      .saveToFile(fileUrl);

    if (hasSubs) {
      command.withOutputOptions("-vf subtitles=" + newFilename);
    }

    command
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
      channelId: channelId,
      msgId: msgId
    })
  });
}

exports.handler = async (event, context) => {
  console.log(event);
  if (client.status != 0) {
    console.log("Discord client needs to be initialized. Logging in...");
    await client.login(process.env.DACKBOT_BOT_TOKEN);
    let retries = 0;
    while (client.status != 0 && client.channels.size == 0 && retries <= 20) {
      console.log(`Waiting for discord client to initialize. Retry: ${retries}`);
      setTimeout(() => { }, 50);
      retries++;
    }
    if (client.status != 0) {
      throw Error("Failed to connect");
    }
  }

  const { channelId } = event;
  try {
    return await handleYouGifRequest(event);
  } catch (err) {
    console.log(err);
    return await handleError(err, channelId);
  }
};
