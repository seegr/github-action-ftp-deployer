let args = null;

const setArgs = (newArgs) => {
  args = newArgs;
};

const getArgs = () => {
  if (!args) {
    throw new Error("Args not set. Call setArgs() first.");
  }
  return args;
};

module.exports = { setArgs, getArgs };