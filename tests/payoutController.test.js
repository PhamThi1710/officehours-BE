jest.mock("../models/index", () => ({
  ProfessorProfile: { findOne: jest.fn() },
  Payout: { findAndCountAll: jest.fn(), findByPk: jest.fn(), sum: jest.fn() },
  User: {},
}));

const db = require("../models/index");
const payoutController = require("../controllers/payout.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  db.Payout.sum.mockResolvedValue(null);
});

describe("payoutController.listMine", () => {
  it("404s when the caller has no professor profile", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue(null);
    const req = { authUser: { id: "prof-user-1" }, query: {} };
    const res = makeRes();

    await payoutController.listMine(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("rejects an invalid status filter", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue({ id: "profile-1" });
    const req = { authUser: { id: "prof-user-1" }, query: { status: "banana" } };
    const res = makeRes();

    await payoutController.listMine(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns paginated payouts with a pending/paid summary, defaulting nulls to 0", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue({ id: "profile-1" });
    db.Payout.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const req = { authUser: { id: "prof-user-1" }, query: {} };
    const res = makeRes();

    await payoutController.listMine(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ summary: { total_pending: 0, total_paid: 0 } })
    );
  });

  it("passes through real sums when payouts exist", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue({ id: "profile-1" });
    db.Payout.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    db.Payout.sum.mockResolvedValueOnce(150).mockResolvedValueOnce(75);
    const req = { authUser: { id: "prof-user-1" }, query: {} };
    const res = makeRes();

    await payoutController.listMine(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ summary: { total_pending: 150, total_paid: 75 } })
    );
  });
});

describe("payoutController.listAll", () => {
  it("rejects an invalid status filter", async () => {
    const req = { query: { status: "banana" } };
    const res = makeRes();

    await payoutController.listAll(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.Payout.findAndCountAll).not.toHaveBeenCalled();
  });

  it("filters by professor_id when provided", async () => {
    db.Payout.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const req = { query: { professor_id: "profile-1" } };
    const res = makeRes();

    await payoutController.listAll(req, res);

    const callArgs = db.Payout.findAndCountAll.mock.calls[0][0];
    expect(callArgs.where.professor_id).toBe("profile-1");
  });
});

describe("payoutController.markPaid", () => {
  it("404s when the payout doesn't exist", async () => {
    db.Payout.findByPk.mockResolvedValue(null);
    const req = { params: { id: "missing" } };
    const res = makeRes();

    await payoutController.markPaid(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("rejects marking an already-paid payout", async () => {
    db.Payout.findByPk.mockResolvedValue({ status: "paid_simulated" });
    const req = { params: { id: "payout-1" } };
    const res = makeRes();

    await payoutController.markPaid(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("marks a pending payout as paid_simulated with a paid_at timestamp", async () => {
    const payout = { status: "pending", paid_at: null, save: jest.fn().mockResolvedValue() };
    db.Payout.findByPk.mockResolvedValue(payout);
    const req = { params: { id: "payout-1" } };
    const res = makeRes();

    await payoutController.markPaid(req, res);

    expect(payout.status).toBe("paid_simulated");
    expect(payout.paid_at).toBeInstanceOf(Date);
    expect(payout.save).toHaveBeenCalled();
  });
});
