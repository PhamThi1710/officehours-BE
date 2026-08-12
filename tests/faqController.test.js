jest.mock("../models/index", () => ({
  Faq: { findAll: jest.fn() },
}));

const db = require("../models/index");
const faqController = require("../controllers/faq.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("faqController.list", () => {
  it("only returns published FAQs by default", async () => {
    db.Faq.findAll.mockResolvedValue([]);
    const req = { query: {} };
    const res = makeRes();

    await faqController.list(req, res);

    const callArgs = db.Faq.findAll.mock.calls[0][0];
    expect(callArgs.where).toEqual({ is_published: true });
  });

  it("filters by category when provided", async () => {
    db.Faq.findAll.mockResolvedValue([]);
    const req = { query: { category: "billing" } };
    const res = makeRes();

    await faqController.list(req, res);

    const callArgs = db.Faq.findAll.mock.calls[0][0];
    expect(callArgs.where).toEqual({ is_published: true, category: "billing" });
  });

  it("shapes the response as items[]", async () => {
    db.Faq.findAll.mockResolvedValue([
      { id: "faq-1", category: "general", question: "Q?", answer: "A.", sort_order: 0 },
    ]);
    const req = { query: {} };
    const res = makeRes();

    await faqController.list(req, res);

    expect(res.json).toHaveBeenCalledWith({
      items: [{ id: "faq-1", category: "general", question: "Q?", answer: "A.", sort_order: 0 }],
    });
  });
});
