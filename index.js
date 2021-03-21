const serverless = require('serverless-http');
const express = require('express');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cookieParser());

const AWS = require('aws-sdk');
const { createToken, isVerifiedUser } = require('./lib/auth');
const { getVoteParams, getResourceKey, getTwitchKey } = require('./lib/db-helpers');

// Make a request for a user with a given ID
const { AOE_TABLE, IS_OFFLINE, CLIENT_HOST } = process.env;

if (IS_OFFLINE === 'true') {
  AWS.config.update({
    region: 'us-west-2',
    endpoint: 'http://localhost:8000',
  });
}
const dbClient = new AWS.DynamoDB.DocumentClient();

app.use(express.json());
app.use(express.urlencoded());

app.get('/', (_, res) => {
  res.send(`AOE Library API. Stage: ${process.env.STAGE} . Deployed.`);
});

app.get('/dev/dev', (_, res) => {
  res.send(`AOE Library API. Stage: ${process.env.STAGE} . Deployed.`);
});

app.get('/dev', (_, res) => {
  res.send(`AOE Library API. Stage: ${process.env.STAGE}. Deployed.`);
});

app.get('/health', (_, res) => {
  res.send('Sever Running');
});

app.get('/votes', async (req, res) => {
  const params = {
    TableName: AOE_TABLE,
    KeyConditionExpression: 'pk = :p',
    ExpressionAttributeValues: {
      ':p': 'TOTAL',
    },
  };

  try {
    const { Items } = await dbClient.query(params).promise();
    const result = Items.map(({ sk, voteCount }) => ({
      voteCount,
      resourceId: sk.replace('resource#', ''),
    }));
    res.json(result);
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: 'Could get vote' });
  }
});

app.get('/votes/:twitchId', async (req, res) => {
  const { twitchId } = req.params;
  const twitch = `twitch#${twitchId}`;
  const params = {
    TableName: AOE_TABLE,
    KeyConditionExpression: 'pk = :p',
    ExpressionAttributeValues: {
      ':p': twitch,
    },
  };

  try {
    const { Items } = await dbClient.query(params).promise();
    const results = Items.map(({ sk }) => sk.replace('resource#', ''));
    res.json(results);
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: 'Could not get votes vote', message: error });
  }
});

app.get('/test', async (req, res) => {
  console.log({ body: req.body });
  console.log('Cookies: ', req.cookies);
  res.status(200).send(req.body);
});

app.post('/auth/twitch', async (req, res) => {
  console.log({ body: req.body });
  const { code } = req.body;
  console.log({ code });
  const data = await createToken(code);
  res.json(data);
});

app.get('/auth/twitch/callback', async (req, res) => {
  const { code } = req.query;
  console.log({ code });
  const jwtToken = await createToken(code);
  res.cookie('aoe-library', jwtToken, { httpOnly: true });
  res.redirect(302, CLIENT_HOST);
});

const updateVoteCount = async ({ resourceId, count }) => {
  const updateTotal = {
    TableName: AOE_TABLE,
    Key: {
      pk: 'TOTAL',
      sk: getResourceKey(resourceId),
    },
    UpdateExpression: 'ADD voteCount :inc',
    ExpressionAttributeValues: { ':inc': count },
    ReturnValues: 'ALL_NEW',
  };

  const { Attributes } = await dbClient.update(updateTotal).promise();
  return Attributes.voteCount;
};

app.delete('/votes', isVerifiedUser, async (req, res) => {
  const { twitchId, resourceId } = req.body;
  const params = {
    ...getVoteParams({ twitchId, resourceId }),
    ReturnValues: 'ALL_OLD',
  };

  try {
    const { Attributes } = await dbClient.delete(params).promise();
    if (!Attributes) {
      res.status(400).json({ error: 'Could not delete vote' });
      return;
    }
  } catch (error) {
    res.status(400).json({ error: 'Could not delete vote' });
    return;
  }

  try {
    const voteCount = await updateVoteCount({ resourceId, count: -1 });
    res.json({
      twitchId,
      resourceId,
      totalVotes: voteCount,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: 'Could not create vote', message: error });
  }
});

app.post('/votes', isVerifiedUser, async (req, res) => {
  const { twitchId, resourceId } = req.body;

  const params = getVoteParams({ resourceId, twitchId });

  const found = await dbClient.get(params).promise();
  if (found.Item) {
    res.status(400).json({ error: 'User has already votes for resource' });
    return;
  }

  const addVote = {
    TableName: AOE_TABLE,
    Item: {
      pk: getTwitchKey(twitchId),
      sk: getResourceKey(resourceId),
      type: 'vote',
    },
  };

  try {
    await dbClient.put(addVote).promise();
    const voteCount = await updateVoteCount({ resourceId, count: 1 });
    res.json({
      twitchId,
      resourceId,
      totalVotes: voteCount,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: 'Could not create vote', message: error });
  }
});

module.exports.handler = serverless(app);
