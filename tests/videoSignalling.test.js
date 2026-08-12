const { EventEmitter } = require("events");

jest.mock("../utils/videoToken", () => ({ verifyVideoToken: jest.fn() }));

const { handleConnection, rooms } = require("../ws/videoSignalling");

function makeFakeSocket() {
  const socket = new EventEmitter();
  socket.send = jest.fn();
  socket.close = jest.fn();
  socket.OPEN = 1;
  socket.readyState = 1;
  return socket;
}

beforeEach(() => {
  rooms.clear();
  jest.clearAllMocks();
});

describe("handleConnection", () => {
  it("relays a message from one participant to the other, tagging the sender", () => {
    const wsStudent = makeFakeSocket();
    const wsProfessor = makeFakeSocket();

    handleConnection(wsStudent, { bookingId: "booking-1", userId: "student-1" });
    handleConnection(wsProfessor, { bookingId: "booking-1", userId: "prof-1" });
    jest.clearAllMocks();

    wsStudent.emit("message", JSON.stringify({ type: "offer", sdp: "fake-sdp" }));

    expect(wsProfessor.send).toHaveBeenCalledWith(JSON.stringify({ type: "offer", sdp: "fake-sdp", from: "student-1" }));
    expect(wsStudent.send).not.toHaveBeenCalled();
  });

  it("broadcasts peer-joined to the existing participant when a second one connects", () => {
    const wsStudent = makeFakeSocket();
    const wsProfessor = makeFakeSocket();

    handleConnection(wsStudent, { bookingId: "booking-1", userId: "student-1" });
    handleConnection(wsProfessor, { bookingId: "booking-1", userId: "prof-1" });

    expect(wsStudent.send).toHaveBeenCalledWith(JSON.stringify({ type: "peer-joined", userId: "prof-1" }));
  });

  it("rejects a third participant once the room already has 2", () => {
    const wsA = makeFakeSocket();
    const wsB = makeFakeSocket();
    const wsC = makeFakeSocket();

    handleConnection(wsA, { bookingId: "booking-1", userId: "student-1" });
    handleConnection(wsB, { bookingId: "booking-1", userId: "prof-1" });
    handleConnection(wsC, { bookingId: "booking-1", userId: "intruder" });

    expect(wsC.close).toHaveBeenCalledWith(4001, "Room is full");
    expect(rooms.get("booking-1").size).toBe(2);
  });

  it("lets the same user reconnect, replacing (and closing) their old socket", () => {
    const wsFirst = makeFakeSocket();
    const wsSecond = makeFakeSocket();

    handleConnection(wsFirst, { bookingId: "booking-1", userId: "student-1" });
    handleConnection(wsSecond, { bookingId: "booking-1", userId: "student-1" });

    expect(wsFirst.close).toHaveBeenCalledWith(4000, "Replaced by a new connection");
    expect(rooms.get("booking-1").get("student-1")).toBe(wsSecond);
    expect(rooms.get("booking-1").size).toBe(1);
  });

  it("removes the participant and notifies the remaining peer on disconnect", () => {
    const wsStudent = makeFakeSocket();
    const wsProfessor = makeFakeSocket();

    handleConnection(wsStudent, { bookingId: "booking-1", userId: "student-1" });
    handleConnection(wsProfessor, { bookingId: "booking-1", userId: "prof-1" });
    jest.clearAllMocks();

    wsStudent.emit("close");

    expect(rooms.get("booking-1").has("student-1")).toBe(false);
    expect(wsProfessor.send).toHaveBeenCalledWith(JSON.stringify({ type: "peer-left", userId: "student-1" }));
  });

  it("deletes the room entirely once the last participant disconnects", () => {
    const wsStudent = makeFakeSocket();
    handleConnection(wsStudent, { bookingId: "booking-1", userId: "student-1" });

    wsStudent.emit("close");

    expect(rooms.has("booking-1")).toBe(false);
  });

  it("ignores a malformed message frame instead of crashing or relaying garbage", () => {
    const wsStudent = makeFakeSocket();
    const wsProfessor = makeFakeSocket();
    handleConnection(wsStudent, { bookingId: "booking-1", userId: "student-1" });
    handleConnection(wsProfessor, { bookingId: "booking-1", userId: "prof-1" });
    jest.clearAllMocks();

    expect(() => wsStudent.emit("message", "not json")).not.toThrow();
    expect(wsProfessor.send).not.toHaveBeenCalled();
  });

  it("keeps separate rooms fully isolated per bookingId", () => {
    const wsRoom1 = makeFakeSocket();
    const wsRoom2 = makeFakeSocket();

    handleConnection(wsRoom1, { bookingId: "booking-1", userId: "student-1" });
    handleConnection(wsRoom2, { bookingId: "booking-2", userId: "student-2" });
    jest.clearAllMocks();

    wsRoom1.emit("message", JSON.stringify({ type: "offer" }));

    expect(wsRoom2.send).not.toHaveBeenCalled();
  });
});
