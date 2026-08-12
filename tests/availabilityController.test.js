jest.mock("../models/index", () => ({
  ProfessorProfile: {
    findOne: jest.fn(),
  },
  AvailabilityRule: {
    create: jest.fn(),
    findAll: jest.fn(),
    destroy: jest.fn(),
  },
  AvailabilityException: {
    create: jest.fn(),
    findAll: jest.fn(),
    destroy: jest.fn(),
  },
  Booking: {
    findAll: jest.fn(),
  },
}));

const db = require("../models/index");
const availabilityController = require("../controllers/availability.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

const OWN_PROFILE = { id: "profile-1", user_id: "prof-user-1", timezone: "UTC" };

beforeEach(() => {
  jest.clearAllMocks();
  db.ProfessorProfile.findOne.mockResolvedValue(OWN_PROFILE);
  db.Booking.findAll.mockResolvedValue([]);
});

describe("availabilityController.createRule", () => {
  const baseReq = (overrides) => ({
    authUser: { id: "prof-user-1" },
    body: {
      day_of_week: 1,
      start_time: "09:00",
      end_time: "10:00",
      slot_duration_minutes: 30,
      ...overrides,
    },
  });

  it("404s when the caller has no professor profile", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue(null);
    const req = baseReq();
    const res = makeRes();

    await availabilityController.createRule(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.AvailabilityRule.create).not.toHaveBeenCalled();
  });

  it("rejects when both day_of_week and specific_date are provided", async () => {
    const req = baseReq({ specific_date: "2026-08-17" });
    const res = makeRes();

    await availabilityController.createRule(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.AvailabilityRule.create).not.toHaveBeenCalled();
  });

  it("rejects when neither day_of_week nor specific_date are provided", async () => {
    const req = baseReq({ day_of_week: undefined });
    const res = makeRes();

    await availabilityController.createRule(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects an out-of-range day_of_week", async () => {
    const req = baseReq({ day_of_week: 7 });
    const res = makeRes();

    await availabilityController.createRule(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects start_time >= end_time", async () => {
    const req = baseReq({ start_time: "10:00", end_time: "09:00" });
    const res = makeRes();

    await availabilityController.createRule(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects a malformed time string", async () => {
    const req = baseReq({ start_time: "9am" });
    const res = makeRes();

    await availabilityController.createRule(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects a non-positive slot_duration_minutes", async () => {
    const req = baseReq({ slot_duration_minutes: 0 });
    const res = makeRes();

    await availabilityController.createRule(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("creates a rule scoped to the caller's professor profile on valid input", async () => {
    db.AvailabilityRule.create.mockResolvedValue({ id: "rule-1" });
    const req = baseReq();
    const res = makeRes();

    await availabilityController.createRule(req, res);

    expect(db.AvailabilityRule.create).toHaveBeenCalledWith(
      expect.objectContaining({ professor_id: "profile-1", day_of_week: 1, specific_date: null })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("availabilityController.deleteRule", () => {
  it("scopes deletion to the caller's own professor profile", async () => {
    db.AvailabilityRule.destroy.mockResolvedValue(1);
    const req = { authUser: { id: "prof-user-1" }, params: { ruleId: "rule-1" } };
    const res = makeRes();

    await availabilityController.deleteRule(req, res);

    expect(db.AvailabilityRule.destroy).toHaveBeenCalledWith({
      where: { id: "rule-1", professor_id: "profile-1" },
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it("404s when nothing was deleted", async () => {
    db.AvailabilityRule.destroy.mockResolvedValue(0);
    const req = { authUser: { id: "prof-user-1" }, params: { ruleId: "someone-elses-rule" } };
    const res = makeRes();

    await availabilityController.deleteRule(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("availabilityController.getSlots", () => {
  it("400s when the date query param is missing or malformed", async () => {
    const req = { params: { id: "profile-1" }, query: {} };
    const res = makeRes();

    await availabilityController.getSlots(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("404s when the professor doesn't exist or isn't approved", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue(null);
    const req = { params: { id: "profile-1" }, query: { date: "2026-08-17" } };
    const res = makeRes();

    await availabilityController.getSlots(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns generated slots for a valid approved professor and date", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue({ id: "profile-1", timezone: "UTC" });
    db.AvailabilityRule.findAll.mockResolvedValue([
      { is_active: true, day_of_week: 1, specific_date: null, start_time: "09:00", end_time: "09:30", slot_duration_minutes: 30, valid_from: null, valid_until: null },
    ]);
    db.AvailabilityException.findAll.mockResolvedValue([]);

    const req = { params: { id: "profile-1" }, query: { date: "2026-08-17" } };
    const res = makeRes();

    await availabilityController.getSlots(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        professor_id: "profile-1",
        date: "2026-08-17",
        slots: expect.arrayContaining([expect.objectContaining({ start_at: "2026-08-17T09:00:00.000Z" })]),
      })
    );
  });

  it("excludes a slot that is already actively booked", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue({ id: "profile-1", timezone: "UTC" });
    db.AvailabilityRule.findAll.mockResolvedValue([
      { is_active: true, day_of_week: 1, specific_date: null, start_time: "09:00", end_time: "10:00", slot_duration_minutes: 30, valid_from: null, valid_until: null },
    ]);
    db.AvailabilityException.findAll.mockResolvedValue([]);
    db.Booking.findAll.mockResolvedValue([{ start_at: new Date("2026-08-17T09:00:00.000Z") }]);

    const req = { params: { id: "profile-1" }, query: { date: "2026-08-17" } };
    const res = makeRes();

    await availabilityController.getSlots(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.slots.map((s) => s.start_at)).toEqual(["2026-08-17T09:30:00.000Z"]);
    expect(db.Booking.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ professor_id: "profile-1" }) })
    );
  });
});
