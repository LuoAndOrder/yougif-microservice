const AWS = require('aws-sdk');
const { promisify } = require('util');
AWS.config.update({ region: process.env.AWS_REGION });

const Discord = require('discord.js');

let client = new Discord.Client();
var ddb;

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

exports.handler = async (event, context) => {
  console.log(event.queryStringParameters);
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

  let { url, startTime, duration, channelId } = event.queryStringParameters;
  if (!url) {
    return ({
      statusCode: 400,
      body: 'Missing url.'
    });
  }

  if (!ddb) ddb = new AWS.DynamoDB.DocumentClient();

  startTime = startTime ? startTime : '00:00:00';
  duration = duration ? duration : 10;

  console.log(`url: ${url} startTime: ${startTime} duration: ${duration} channelId: ${channelId}`);

  console.log(`stateMachine: ${process.env.STEPFUNCTION_ARN}`);
  // First check if we've processed this video before
  const keyName = [url, startTime, duration].join(':');
  let getParams = {
    TableName: process.env.CACHE_TABLE,
    Key: {
      args: keyName
    }
  };

  try {
    var cacheResult = await ddb.get(getParams).promise();
    console.log(cacheResult);
  } catch (err) {
    console.log(err);
    cacheResult = null;
  }

  if (cacheResult.Item) {
    await sendMessage(channelId, cacheResult.Item.gfyUrl);
    return({
      statusCode: 200,
      body: cacheResult.Item.gfyUrl
    });
  }

  let params = {
    stateMachineArn: process.env.STEPFUNCTION_ARN,
    input: JSON.stringify({
      url: url,
      startTime: startTime,
      duration: duration,
      channelId: channelId
    })
  };

  let sf = new AWS.StepFunctions();
  try {
    return await promisify(sf.startExecution.bind(sf))(params)
      .then(() => {
        return ({
          statusCode: 200,
          body: "Success."
        });
      })
      .catch(err => {
        console.log('Error while executing step function: ' + err.message);
        return ({
          statusCode: 500,
          body: err.message
        });
      })
  } catch (err) {
    console.log('Error while executing step function: ' + err.message);
    return ({
      statusCode: 500,
      body: err.message
    });
  }


};