const db = require("../../models/index");
const { parsePagination, toPaginatedResponse } = require("../../utils/pagination");

const Faq = db.Faq;

function toAdminFaqResponse(faq) {
  return {
    id: faq.id,
    category: faq.category,
    question: faq.question,
    answer: faq.answer,
    sort_order: faq.sort_order,
    is_published: faq.is_published,
  };
}

// GET /api/admin/faqs?category=&is_published=
exports.list = async (req, res) => {
  try {
    const { category, is_published } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const where = {};
    if (category) where.category = category;
    if (is_published !== undefined) where.is_published = is_published === "true";

    const result = await Faq.findAndCountAll({
      where,
      order: [
        ["sort_order", "ASC"],
        ["createdAt", "ASC"],
      ],
      limit,
      offset,
    });

    return res.json(toPaginatedResponse(result, { page, limit }, toAdminFaqResponse));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /api/admin/faqs
exports.create = async (req, res) => {
  try {
    const { category, question, answer, sort_order, is_published } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ message: "question and answer are required" });
    }

    const faq = await Faq.create({
      category: category || "general",
      question,
      answer,
      sort_order: sort_order ?? 0,
      is_published: is_published ?? true,
    });

    return res.status(201).json({ faq: toAdminFaqResponse(faq) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/admin/faqs/:id
exports.update = async (req, res) => {
  try {
    const faq = await Faq.findByPk(req.params.id);
    if (!faq) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    const { category, question, answer, sort_order, is_published } = req.body;
    if (category !== undefined) faq.category = category;
    if (question !== undefined) faq.question = question;
    if (answer !== undefined) faq.answer = answer;
    if (sort_order !== undefined) faq.sort_order = sort_order;
    if (is_published !== undefined) faq.is_published = is_published;

    await faq.save();
    return res.json({ faq: toAdminFaqResponse(faq) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /api/admin/faqs/:id
exports.remove = async (req, res) => {
  try {
    const deleted = await Faq.destroy({ where: { id: req.params.id } });
    if (!deleted) {
      return res.status(404).json({ message: "FAQ not found" });
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
