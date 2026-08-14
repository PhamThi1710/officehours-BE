jest.mock("../models/index", () => ({
  ProfessorProfile: { findOne: jest.fn() },
  OfflineClass: { create: jest.fn(), findOne: jest.fn(), findByPk: jest.fn() },
  Booking: { count: jest.fn(), create: jest.fn() },
  User: {},
  Sequelize: { Transaction: { LOCK: { UPDATE: "UPDATE" } } },
  sequelize: { transaction: jest.fn(), fn: jest.fn(), col: jest.fn(), query: jest.fn() },
}));
jest.mock("../utils/geocoding", () => ({
  geocodeAddress: jest.fn(),
  GeocodeError: class GeocodeError extends Error {},
}));

const db = require("../models/index");
const { geocodeAddress, GeocodeError } = require("../utils/geocoding");
const offlineClassesController = require("../controllers/offlineClasses.controller");

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

const OWN_PROFILE = { id: "profile-1", user_id: "prof-user-1", timezone: "UTC" };
const VALID_BODY = {
  title: "Beginner Yoga",
  description: "A relaxing session",
  address: "123 Main St, Springfield",
  capacity: 10,
  price: 20,
  day_of_week: 1,
  start_time: "09:00",
  end_time: "10:00",
};

beforeEach(() => {
  jest.clearAllMocks();
  db.ProfessorProfile.findOne.mockResolvedValue(OWN_PROFILE);
  geocodeAddress.mockResolvedValue({ latitude: 39.78, longitude: -89.65 });
});

describe("offlineClassesController.create", () => {
  const baseReq = (overrides) => ({ authUser: { id: "prof-user-1" }, body: { ...VALID_BODY, ...overrides } });

  it("404s when the caller has no professor profile", async () => {
    db.ProfessorProfile.findOne.mockResolvedValue(null);
    const res = makeRes();

    await offlineClassesController.create(baseReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.OfflineClass.create).not.toHaveBeenCalled();
  });

  it("rejects a missing address", async () => {
    const res = makeRes();

    await offlineClassesController.create(baseReq({ address: "" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it("rejects a non-positive capacity", async () => {
    const res = makeRes();

    await offlineClassesController.create(baseReq({ capacity: 0 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("rejects providing both day_of_week and specific_date", async () => {
    const res = makeRes();

    await offlineClassesController.create(baseReq({ specific_date: "2026-08-24" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 422 when geocoding fails", async () => {
    geocodeAddress.mockRejectedValue(new GeocodeError("No geocoding result found for address: 123 Main St, Springfield"));
    const res = makeRes();

    await offlineClassesController.create(baseReq(), res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(db.OfflineClass.create).not.toHaveBeenCalled();
  });

  it("geocodes the address and creates the class scoped to the caller's profile", async () => {
    db.OfflineClass.create.mockResolvedValue({ id: "class-1", ...VALID_BODY, latitude: 39.78, longitude: -89.65 });
    const res = makeRes();

    await offlineClassesController.create(baseReq(), res);

    expect(geocodeAddress).toHaveBeenCalledWith(VALID_BODY.address);
    expect(db.OfflineClass.create).toHaveBeenCalledWith(
      expect.objectContaining({
        professor_id: "profile-1",
        latitude: 39.78,
        longitude: -89.65,
        day_of_week: 1,
        specific_date: null,
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("offlineClassesController.update", () => {
  it("re-geocodes when the address changed", async () => {
    const existing = { id: "class-1", professor_id: "profile-1", address: "old address", save: jest.fn().mockResolvedValue() };
    db.OfflineClass.findOne.mockResolvedValue(existing);
    const req = { authUser: { id: "prof-user-1" }, params: { id: "class-1" }, body: { ...VALID_BODY } };
    const res = makeRes();

    await offlineClassesController.update(req, res);

    expect(geocodeAddress).toHaveBeenCalledWith(VALID_BODY.address);
    expect(existing.latitude).toBe(39.78);
    expect(existing.save).toHaveBeenCalled();
  });

  it("does not re-geocode when the address is unchanged", async () => {
    const existing = {
      id: "class-1",
      professor_id: "profile-1",
      address: VALID_BODY.address,
      save: jest.fn().mockResolvedValue(),
    };
    db.OfflineClass.findOne.mockResolvedValue(existing);
    const req = { authUser: { id: "prof-user-1" }, params: { id: "class-1" }, body: { ...VALID_BODY } };
    const res = makeRes();

    await offlineClassesController.update(req, res);

    expect(geocodeAddress).not.toHaveBeenCalled();
    expect(existing.save).toHaveBeenCalled();
  });
});

describe("offlineClassesController.book", () => {
  // 2026-08-24 is a Monday matching OFFLINE_CLASS.day_of_week below.
  const OFFLINE_CLASS = {
    id: "class-1",
    professor_id: "profile-1",
    capacity: 2,
    price: 20,
    is_active: true,
    day_of_week: 1,
    specific_date: null,
    start_time: "09:00",
    end_time: "10:00",
    valid_from: null,
    valid_until: null,
    professor: { id: "profile-1", timezone: "UTC", status: "approved" },
  };

  function baseReq(overrides) {
    return {
      authUser: { id: "student-1" },
      params: { id: "class-1" },
      body: { start_at: "2026-08-24T09:00:00.000Z" },
      ...overrides,
    };
  }

  beforeEach(() => {
    db.OfflineClass.findOne.mockResolvedValue(OFFLINE_CLASS);
    db.OfflineClass.findByPk.mockResolvedValue(OFFLINE_CLASS);
    db.sequelize.transaction.mockResolvedValue({
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
    });
  });

  it("404s when the class doesn't exist", async () => {
    db.OfflineClass.findOne.mockResolvedValue(null);
    const res = makeRes();

    await offlineClassesController.book(baseReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("409s when start_at doesn't match a real upcoming instance", async () => {
    const res = makeRes();

    await offlineClassesController.book(baseReq({ body: { start_at: "2026-08-24T11:00:00.000Z" } }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.Booking.create).not.toHaveBeenCalled();
  });

  it("409s when the class instance is already at capacity", async () => {
    db.Booking.count.mockResolvedValue(2); // capacity is 2
    const res = makeRes();

    await offlineClassesController.book(baseReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.Booking.create).not.toHaveBeenCalled();
  });

  it("creates an offline booking with session_type offline when a spot is free", async () => {
    db.Booking.count.mockResolvedValue(0);
    db.Booking.create.mockResolvedValue({
      id: "booking-1",
      student_id: "student-1",
      professor_id: "profile-1",
      offline_class_id: "class-1",
      session_type: "offline",
      status: "pending",
      payment_status: "unpaid",
      price: 20,
    });
    const res = makeRes();

    await offlineClassesController.book(baseReq(), res);

    expect(db.Booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: "student-1",
        professor_id: "profile-1",
        offline_class_id: "class-1",
        session_type: "offline",
        video_room_slug: null,
        status: "pending",
        payment_status: "unpaid",
      }),
      expect.anything()
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("auto-confirms and marks free when the class price is 0", async () => {
    db.OfflineClass.findOne.mockResolvedValue({ ...OFFLINE_CLASS, price: 0 });
    db.OfflineClass.findByPk.mockResolvedValue({ ...OFFLINE_CLASS, price: 0 });
    db.Booking.count.mockResolvedValue(0);
    db.Booking.create.mockResolvedValue({ id: "booking-1", status: "confirmed", payment_status: "free" });
    const res = makeRes();

    await offlineClassesController.book(baseReq(), res);

    expect(db.Booking.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "confirmed", payment_status: "free" }),
      expect.anything()
    );
  });
});
