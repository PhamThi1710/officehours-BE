jest.mock("../models/index", () => ({
  SupportTicket: { create: jest.fn(), findAndCountAll: jest.fn() },
}));

const db = require("../models/index");
const supportTicketController = require("../controllers/supportTicket.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("supportTicketController.create", () => {
  it("rejects a missing/invalid email for a guest submission", async () => {
    const req = { body: { email: "not-an-email", subject: "Help", message: "..." } };
    const res = makeRes();

    await supportTicketController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.SupportTicket.create).not.toHaveBeenCalled();
  });

  it("rejects a missing subject/message", async () => {
    const req = { body: { email: "a@b.com" } };
    const res = makeRes();

    await supportTicketController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("accepts a guest submission with no authUser", async () => {
    db.SupportTicket.create.mockResolvedValue({ id: "ticket-1", email: "a@b.com", subject: "Help", message: "...", status: "open" });
    const req = { body: { email: "a@b.com", subject: "Help", message: "..." } };
    const res = makeRes();

    await supportTicketController.create(req, res);

    expect(db.SupportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null, email: "a@b.com" })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("falls back to the logged-in user's email and links user_id when no email is given", async () => {
    db.SupportTicket.create.mockResolvedValue({ id: "ticket-1" });
    const req = {
      body: { subject: "Help", message: "..." },
      authUser: { id: "user-1", email: "student@school.edu" },
    };
    const res = makeRes();

    await supportTicketController.create(req, res);

    expect(db.SupportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", email: "student@school.edu" })
    );
  });
});

describe("supportTicketController.listMine", () => {
  it("scopes the list to the authenticated user", async () => {
    db.SupportTicket.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const req = { authUser: { id: "user-1" }, query: {} };
    const res = makeRes();

    await supportTicketController.listMine(req, res);

    const callArgs = db.SupportTicket.findAndCountAll.mock.calls[0][0];
    expect(callArgs.where).toEqual({ user_id: "user-1" });
  });
});
