const Gfycat = require('gfycat-sdk');
const rp = require('request-promise');
const Discord = require('discord.js');

const client = new Discord.Client();

let gfycat = new Gfycat({
  clientId: process.env.GFYCAT_CLIENT_ID,
  clientSecret: process.env.GFYCAT_CLIENT_SECRET
});

async function sendMessage(channelId, msg, msgId) {
  console.log(`[sendMessage] channelId: ${channelId} msg: ${msg}`);
  let channel = client.channels.get(channelId);
  if (!channel) {
    console.log(`[sendMessage] channel not found! ${channelId}`);
    console.log(JSON.stringify(client.channels));
    console.log(`Client Status: ${client.status}`);
  }
  await client.channels.get(channelId).fetchMessage(msgId).edit(msg);
}

async function pollGfycat(gfyname, channelId, msgId) {
  await gfycat.authenticate()
  .then(res => {
    console.log(res.access_token);
    console.log('token', gfycat.token);
  })
  .catch(err => {
    console.log(err);
    throw err;
  });

  const headers = {Authorization: gfycat.token};
  return await rp({
    uri: `https://api.gfycat.com/v1/gfycats/fetch/status/${gfyname}`,
    method: 'GET',
    headers
  })
  .then(async (result) => {
    let res = JSON.parse(result);

    if (res.task === 'complete') {
      console.log('gfycat processing complete');
      if (res.md5Found === 1) {
        gfyname = res.gfyName;
      }
      let url = `https://gfycat.com/${gfyname}`;
      await sendMessage(channelId, url, msgId);
      return ({
        statusCode: 200,
        body: url
      });
    }

    throw Error("Not yet complete");
  })
}

exports.handler = async (event, context) => {
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

  let input = JSON.parse(event.body);
  console.log(`Input Event: ${JSON.stringify(event)}`);
  if (!input.gfyname || !input.channelId || !input.msgId) {
    throw Error("Bad input: " + JSON.stringify(event));
  }

  return await pollGfycat(input.gfyname, input.channelId, input.msgId);
};