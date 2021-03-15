const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const express = require('express');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cookieParser());

const AWS = require('aws-sdk');
const { createToken, getTwitchId } = require('./lib/auth');

// Make a request for a user with a given ID
const { AOE_TABLE, IS_OFFLINE, CLIENT_HOST } = process.env;

if (IS_OFFLINE === 'true') {
  AWS.config.update({
    region: 'us-west-2',
    endpoint: 'http://localhost:8000',
  });
}
const dbClient = new AWS.DynamoDB.DocumentClient();
const dynamodb = new AWS.DynamoDB();

app.use(express.json());
app.use(express.urlencoded());

app.get('/', (req, res) => {
  res.send('Hello World!');
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

app.delete('/table', () => {
  const params = {
    TableName: AOE_TABLE,
  };

  dynamodb.deleteTable(params, (err, data) => {
    if (err) {
      console.error('Unable to delete table. Error JSON:', JSON.stringify(err, null, 2));
    } else {
      console.log('Deleted table. Table description JSON:', JSON.stringify(data, null, 2));
    }
  });
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

app.delete('/votes', async (req, res) => {
  const { twitchId, resourceId } = req.body;
  const idFromToken = getTwitchId(req.cookies);
  if (idFromToken !== twitchId) {
    res.status(400).json({ error: 'Twitch user not authenticated' });
    return;
  }

  const resourceKey = `resource#${resourceId}`;
  const twitchKey = `twitch#${twitchId}`;

  const params = {
    TableName: AOE_TABLE,
    Key: {
      pk: twitchKey,
      sk: resourceKey,
    },
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

  const updateTotal = {
    TableName: AOE_TABLE,
    Key: {
      pk: 'TOTAL',
      sk: resourceKey,
    },
    UpdateExpression: 'ADD voteCount :inc',
    ExpressionAttributeValues: { ':inc': -1 },
    ReturnValues: 'ALL_NEW',
  };

  try {
    const { Attributes } = await dbClient.update(updateTotal).promise();
    res.json({
      twitchId,
      resourceId,
      totalVotes: Attributes.voteCount,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: 'Could not create vote', message: error });
  }
});

app.post('/votes', async (req, res) => {
  const { twitchId, resourceId } = req.body;
  const idFromToken = getTwitchId(req.cookies);
  if (idFromToken !== twitchId) {
    res.status(400).json({ error: 'Twitch user not authenticated' });
    return;
  }

  const resourceKey = `resource#${resourceId}`;
  const twitchKey = `twitch#${twitchId}`;

  const findVote = {
    TableName: AOE_TABLE,
    Key: {
      pk: twitchKey,
      sk: resourceKey,
    },
  };

  const found = await dbClient.get(findVote).promise();
  if (found.Item) {
    res.status(400).json({ error: 'User has already votes for resource' });
    return;
  }

  const addVote = {
    TableName: AOE_TABLE,
    Item: {
      pk: twitchKey,
      sk: resourceKey,
      type: 'vote',
    },
  };

  const updateTotal = {
    TableName: AOE_TABLE,
    Key: {
      pk: 'TOTAL',
      sk: resourceKey,
    },
    UpdateExpression: 'ADD voteCount :inc',
    ExpressionAttributeValues: { ':inc': 1 },
    ReturnValues: 'ALL_NEW',
  };

  try {
    await dbClient.put(addVote).promise();
    const { Attributes } = await dbClient.update(updateTotal).promise();
    res.json({
      twitchId,
      resourceId,
      totalVotes: Attributes.voteCount,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: 'Could not create vote', message: error });
  }
});

module.exports.handler = serverless(app);
