/* eslint-disable camelcase */
const axios = require('axios');
const jwt = require('jsonwebtoken');

const { TWITCH_CLIENT_ID: clientId, TWITCH_SECRET: secret, HOST: host } = process.env;

const createToken = async (code) => {
  if (!clientId) {
    throw Error('No twitch client found');
  }

  const authUrl = `https://id.twitch.tv/oauth2/token
  ?client_id=${clientId}
  &client_secret=${secret}
  &code=${code}
  &grant_type=authorization_code
  &redirect_uri=${host}/auth/twitch/callback`;
  const userUrl = 'https://id.twitch.tv/oauth2/userinfo';

  try {
    const { data: { access_token } } = await axios.post(authUrl);
    const { data: { sub } } = await axios.get(userUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    return jwt.sign({ sub }, secret);
  } catch (error) {
    console.log({ error });
    return {};
  }
};

const getTwitchId = (cookie) => {
  const jwtToken = cookie['aoe-library'];
  const { sub } = jwt.verify(jwtToken, secret);
  return sub;
};

const isVerifiedUser = (req, res, next) => {
  const { twitchId } = req.body;
  const idFromToken = getTwitchId(req.cookies);
  if (idFromToken !== twitchId) {
    res.status(400).json({ error: 'Twitch user not authenticated' });
  }
  next();
};

module.exports = {
  createToken,
  getTwitchId,
  isVerifiedUser,
};
