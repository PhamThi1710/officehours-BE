// STUN alone often isn't enough for two peers behind restrictive/symmetric
// NAT to connect directly, so a free TURN relay (e.g. Metered.ca's Open
// Relay project) is offered as a fallback whenever it's configured — see
// TURN_URL/TURN_USERNAME/TURN_CREDENTIAL in .env.example.
function getIceServers() {
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];

  if (process.env.TURN_URL) {
    servers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  return servers;
}

module.exports = { getIceServers };
