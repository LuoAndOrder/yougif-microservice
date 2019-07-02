const Gfycat = require('gfycat-sdk');
const rp = require('request-promise');
const Discord = require('discord.js');

const discordHook = new Discord.WebhookClient(process.env.DACKBOT_WEBHOOK_ID, process.env.DACKBOT_WEBHOOK_TOKEN);
const client = new Discord.Client();
client.login(process.env.DACKBOT_BOT_TOKEN);

let gfycat = new Gfycat({
  clientId: process.env.GFYCAT_CLIENT_ID,
  clientSecret: process.env.GFYCAT_CLIENT_SECRET
});

async function sendMessage(channelId, msg) {
  await client.channels.get(channelId).send(msg);
}

async function pollGfycat(gfyname, channelId) {
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
      await sendMessage(url);
      return ({
        statusCode: 200,
        body: url
      });
    }

    throw Error("Not yet complete");
  })
}

exports.handler = async (event, context) => {
  let input = JSON.parse(event.body);
  console.log(`Input Event: ${JSON.stringify(event)}`);
  if (!input.gfyname || !input.channelId) {
    throw Error("Bad input: " + JSON.stringify(event));
  }

  return await pollGfycat(input.gfyname, input.channelId);
};