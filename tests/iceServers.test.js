describe("getIceServers", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("always includes the public Google STUN server", () => {
    delete process.env.TURN_URL;
    delete process.env.TURN_USERNAME;
    delete process.env.TURN_CREDENTIAL;
    const { getIceServers } = require("../utils/iceServers");

    expect(getIceServers()).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
  });

  it("adds a TURN server when configured", () => {
    process.env.TURN_URL = "turn:relay.metered.ca:80";
    process.env.TURN_USERNAME = "openrelayuser";
    process.env.TURN_CREDENTIAL = "openrelaypass";
    const { getIceServers } = require("../utils/iceServers");

    const servers = getIceServers();
    expect(servers).toHaveLength(2);
    expect(servers[1]).toEqual({
      urls: "turn:relay.metered.ca:80",
      username: "openrelayuser",
      credential: "openrelaypass",
    });
  });
});
