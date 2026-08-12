jest.mock("../models/index", () => ({
  SupportTicket: { findAndCountAll: jest.fn(), findByPk: jest.fn() },
  User: {},
}));
jest.mock("../utils/mailer");

const db = require("../models/index");
const mailer = require("../utils/mailer");
const supportTicketAdminController = require("../controllers/admin/support-ticket-admin.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("supportTicketAdminController.list", () => {
  it("rejects an invalid status filter", async () => {
    const req = { query: { status: "banana" } };
    const res = makeRes();

    await supportTicketAdminController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.SupportTicket.findAndCountAll).not.toHaveBeenCalled();
  });
});

describe("supportTicketAdminController.update", () => {
  function makeTicket(overrides) {
    return {
      id: "ticket-1",
      email: "a@b.com",
      subject: "Help",
      status: "open",
      admin_reply: null,
      replied_at: null,
      save: jest.fn().mockResolvedValue(),
      ...overrides,
    };
  }

  it("404s when the ticket doesn't exist", async () => {
    db.SupportTicket.findByPk.mockResolvedValue(null);
    const req = { params: { id: "missing" }, body: {} };
    const res = makeRes();

    await supportTicketAdminController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("rejects an invalid status", async () => {
    db.SupportTicket.findByPk.mockResolvedValue(makeTicket());
    const req = { params: { id: "ticket-1" }, body: { status: "banana" } };
    const res = makeRes();

    await supportTicketAdminController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("auto-bumps an open ticket to in_progress when replying without an explicit status", async () => {
    const ticket = makeTicket();
    db.SupportTicket.findByPk.mockResolvedValue(ticket);
    const req = { params: { id: "ticket-1" }, body: { admin_reply: "Here's the answer" } };
    const res = makeRes();

    await supportTicketAdminController.update(req, res);

    expect(ticket.status).toBe("in_progress");
    expect(ticket.admin_reply).toBe("Here's the answer");
    expect(ticket.replied_at).toBeInstanceOf(Date);
    expect(mailer.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.com" }));
  });

  it("respects an explicit status even while replying", async () => {
    const ticket = makeTicket();
    db.SupportTicket.findByPk.mockResolvedValue(ticket);
    const req = { params: { id: "ticket-1" }, body: { admin_reply: "Closing this out", status: "closed" } };
    const res = makeRes();

    await supportTicketAdminController.update(req, res);

    expect(ticket.status).toBe("closed");
  });

  it("does not email or touch status when only a status change is requested", async () => {
    const ticket = makeTicket();
    db.SupportTicket.findByPk.mockResolvedValue(ticket);
    const req = { params: { id: "ticket-1" }, body: { status: "closed" } };
    const res = makeRes();

    await supportTicketAdminController.update(req, res);

    expect(ticket.status).toBe("closed");
    expect(ticket.admin_reply).toBeNull();
    expect(mailer.sendEmail).not.toHaveBeenCalled();
  });
});
