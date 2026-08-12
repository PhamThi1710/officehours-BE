const db = require("../models/index");

const Faq = db.Faq;

function toFaqResponse(faq) {
  return {
    id: faq.id,
    category: faq.category,
    question: faq.question,
    answer: faq.answer,
    sort_order: faq.sort_order,
  };
}

// GET /api/faqs?category=
exports.list = async (req, res) => {
  try {
    const { category } = req.query;
    const where = { is_published: true };
    if (category) where.category = category;

    const faqs = await Faq.findAll({
      where,
      order: [
        ["sort_order", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    return res.json({ items: faqs.map(toFaqResponse) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
