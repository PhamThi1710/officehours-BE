jest.mock("../models/index", () => ({
  ProfessorProfile: {
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
  },
  User: {},
}));

const db = require("../models/index");
const professorAdminController = require("../controllers/admin/professor-admin.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("professorAdminController.list", () => {
  it("rejects an invalid status filter", async () => {
    const req = { query: { status: "banana" } };
    const res = makeRes();

    await professorAdminController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.ProfessorProfile.findAndCountAll).not.toHaveBeenCalled();
  });

  it("filters by status when provided", async () => {
    db.ProfessorProfile.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const req = { query: { status: "pending" } };
    const res = makeRes();

    await professorAdminController.list(req, res);

    const callArgs = db.ProfessorProfile.findAndCountAll.mock.calls[0][0];
    expect(callArgs.where.status).toBe("pending");
  });
});

describe("professorAdminController.approve", () => {
  it("404s when the profile does not exist", async () => {
    db.ProfessorProfile.findByPk.mockResolvedValue(null);
    const req = { params: { id: "missing" } };
    const res = makeRes();

    await professorAdminController.approve(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("sets status to approved and clears any rejection reason", async () => {
    const profile = { status: "pending", rejection_reason: "was incomplete", save: jest.fn().mockResolvedValue() };
    db.ProfessorProfile.findByPk.mockResolvedValue(profile);
    const req = { params: { id: "profile-1" } };
    const res = makeRes();

    await professorAdminController.approve(req, res);

    expect(profile.status).toBe("approved");
    expect(profile.rejection_reason).toBeNull();
    expect(profile.save).toHaveBeenCalled();
  });
});

describe("professorAdminController.reject", () => {
  it("sets status to rejected with a reason", async () => {
    const profile = { status: "pending", rejection_reason: null, save: jest.fn().mockResolvedValue() };
    db.ProfessorProfile.findByPk.mockResolvedValue(profile);
    const req = { params: { id: "profile-1" }, body: { reason: "Missing credentials" } };
    const res = makeRes();

    await professorAdminController.reject(req, res);

    expect(profile.status).toBe("rejected");
    expect(profile.rejection_reason).toBe("Missing credentials");
    expect(profile.save).toHaveBeenCalled();
  });
});
