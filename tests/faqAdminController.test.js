jest.mock("../models/index", () => ({
  Faq: { findAndCountAll: jest.fn(), create: jest.fn(), findByPk: jest.fn(), destroy: jest.fn() },
}));

const db = require("../models/index");
const faqAdminController = require("../controllers/admin/faq-admin.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("faqAdminController.create", () => {
  it("rejects a missing question/answer", async () => {
    const req = { body: { category: "general" } };
    const res = makeRes();

    await faqAdminController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.Faq.create).not.toHaveBeenCalled();
  });

  it("defaults category/sort_order/is_published", async () => {
    db.Faq.create.mockResolvedValue({ id: "faq-1", category: "general", question: "Q?", answer: "A.", sort_order: 0, is_published: true });
    const req = { body: { question: "Q?", answer: "A." } };
    const res = makeRes();

    await faqAdminController.create(req, res);

    expect(db.Faq.create).toHaveBeenCalledWith({
      category: "general",
      question: "Q?",
      answer: "A.",
      sort_order: 0,
      is_published: true,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("faqAdminController.update", () => {
  it("404s when the FAQ doesn't exist", async () => {
    db.Faq.findByPk.mockResolvedValue(null);
    const req = { params: { id: "missing" }, body: {} };
    const res = makeRes();

    await faqAdminController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("only updates the fields provided", async () => {
    const faq = { category: "general", question: "old?", answer: "old.", sort_order: 0, is_published: true, save: jest.fn().mockResolvedValue() };
    db.Faq.findByPk.mockResolvedValue(faq);
    const req = { params: { id: "faq-1" }, body: { is_published: false } };
    const res = makeRes();

    await faqAdminController.update(req, res);

    expect(faq.is_published).toBe(false);
    expect(faq.question).toBe("old?");
    expect(faq.save).toHaveBeenCalled();
  });
});

describe("faqAdminController.remove", () => {
  it("404s when nothing was deleted", async () => {
    db.Faq.destroy.mockResolvedValue(0);
    const req = { params: { id: "missing" } };
    const res = makeRes();

    await faqAdminController.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("204s on successful delete", async () => {
    db.Faq.destroy.mockResolvedValue(1);
    const req = { params: { id: "faq-1" } };
    const res = makeRes();

    await faqAdminController.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
  });
});
