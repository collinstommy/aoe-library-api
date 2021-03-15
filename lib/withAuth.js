const axios = require('axios');

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/userinfo';

module.exports = async ({ req, res, twitchId, next }) => {
  const token = req.headers.authorization;
  try {
    const { data } = await axios.get(TWITCH_AUTH_URL, {
      headers: {
        Authorization: token,
      },
    });
    if (data.sub !== twitchId) {
      throw Error();
    }
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: 'Twitch user not authenticated' });
    next();
  }
};
