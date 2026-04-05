const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const createQueryChain = (result, extra = {}) => {
  const chain = {
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    sort: jest.fn().mockResolvedValue(result),
    select: jest.fn().mockReturnThis(),
    countDocuments: jest.fn().mockResolvedValue(Array.isArray(result) ? result.length : result),
    ...extra,
  };

  return chain;
};

const createAggregateChain = (result) => ({
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  sort: jest.fn().mockResolvedValue(result),
});

module.exports = {
  createRes,
  createQueryChain,
  createAggregateChain,
};