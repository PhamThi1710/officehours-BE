const { EventEmitter } = require("events");

jest.mock("ws", () => ({
  WebSocketServer: jest.fn().mockImplementation(() => ({
    handleUpgrade: jest.fn(),
  })),
}));
jest.mock("../utils/videoToken", () => ({ verifyVideoToken: jest.fn() }));

const { WebSocketServer } = require("ws");
const { verifyVideoToken } = require("../utils/videoToken");
const { attach, WS_PATH } = require("../ws/videoSignalling");

function makeFakeHttpServer() {
  return new EventEmitter();
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("videoSignalling attach() — upgrade routing", () => {
  it("leaves upgrade requests for a different path alone (so e.g. Socket.io's chat server can still handle them)", () => {
    const httpServer = makeFakeHttpServer();
    attach(httpServer);
    const socket = { destroy: jest.fn() };

    httpServer.emit("upgrade", { url: "/socket.io/?EIO=4&transport=websocket" }, socket, Buffer.alloc(0));

    expect(socket.destroy).not.toHaveBeenCalled();
  });

  it("destroys the socket for its own path when the token is missing/invalid", () => {
    verifyVideoToken.mockImplementation(() => {
      throw new Error("bad token");
    });
    const httpServer = makeFakeHttpServer();
    attach(httpServer);
    const socket = { destroy: jest.fn() };

    httpServer.emit("upgrade", { url: `${WS_PATH}?token=bad` }, socket, Buffer.alloc(0));

    expect(socket.destroy).toHaveBeenCalled();
  });

  it("hands the request to the WebSocketServer for its own path with a valid token", () => {
    verifyVideoToken.mockReturnValue({ bookingId: "booking-1", userId: "user-1" });
    const httpServer = makeFakeHttpServer();
    attach(httpServer);
    const socket = { destroy: jest.fn() };
    const head = Buffer.alloc(0);

    httpServer.emit("upgrade", { url: `${WS_PATH}?token=good` }, socket, head);

    const wssInstance = WebSocketServer.mock.results[0].value;
    expect(wssInstance.handleUpgrade).toHaveBeenCalledWith({ url: `${WS_PATH}?token=good` }, socket, head, expect.any(Function));
    expect(socket.destroy).not.toHaveBeenCalled();
  });
});
