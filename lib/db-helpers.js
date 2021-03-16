const { AOE_TABLE } = process.env;

const getResourceKey = (resourceId) => `resource#${resourceId}`;
const getTwitchKey = (twitchId) => `twitch#${twitchId}`;

const getVoteParams = ({
  resourceId,
  twitchId,
}) => {
  const resourceKey = getResourceKey(resourceId);
  const twitchKey = getTwitchKey(twitchId);

  return {
    TableName: AOE_TABLE,
    Key: {
      pk: twitchKey,
      sk: resourceKey,
    },
  };
};

module.exports = {
  getVoteParams,
  getResourceKey,
  getTwitchKey,
};
