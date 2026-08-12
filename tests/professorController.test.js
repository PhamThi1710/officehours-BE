jest.mock("../models/index", () => ({
  ProfessorProfile: {
    findOne: jest.fn(),
    create: jest.fn(),
    findAndCountAll: jest.fn(),
  },
  User: {},
}));

const db = require("../models/index");
const professorController = require("../controllers/professor.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("professorController.apply", () => {
  const baseReq = () => ({
    authUser: { id: "prof-user-1", role: "professor" },
    body: { headline: "Algorithms & Data Structures", subjects: ["CS101"], price_per_session: 20 },
  });

  it("rejects a missing headline/subjects", async () => {
    const req = { authUser: { id: "prof-user-1" }, body: { subjects: [] } };
    const res = makeRes();

    await professorController.apply(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.ProfessorProfile.create).not.toHaveBeenCalled();
  });

  it("rejects a negative price", async () => {
    const req = baseReq();
    req.body.price_per_session = -5;
    const res = makeRes();

    await professorController.apply(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.ProfessorProfile.create).not.toHaveBeenCalled();
  });

  it("rejects applying twice", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue({ id: "existing-profile" });
    const req = baseReq();
    const res = makeRes();

    await professorController.apply(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.ProfessorProfile.create).not.toHaveBeenCalled();
  });

  it("creates a pending profile on success", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue(null);
    db.ProfessorProfile.create.mockResolvedValue({
      id: "profile-1",
      user_id: "prof-user-1",
      headline: "Algorithms & Data Structures",
      subjects: ["CS101"],
      price_per_session: 20,
      session_duration_default: 30,
      timezone: "UTC",
      status: "pending",
      rejection_reason: null,
      rating_avg: 0,
      total_reviews: 0,
      total_sessions: 0,
    });

    const req = baseReq();
    const res = makeRes();

    await professorController.apply(req, res);

    expect(db.ProfessorProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "prof-user-1", status: "pending" })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload.professor.status).toBe("pending");
  });
});

describe("professorController.list", () => {
  it("only queries approved professors", async () => {
    db.ProfessorProfile.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const req = { query: {} };
    const res = makeRes();

    await professorController.list(req, res);

    const callArgs = db.ProfessorProfile.findAndCountAll.mock.calls[0][0];
    expect(callArgs.where.status).toBe("approved");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ items: [], total: 0 })
    );
  });
});
