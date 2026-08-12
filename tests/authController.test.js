process.env.JWT_ACCESS_SECRET = "test-secret";

jest.mock("../models/index", () => ({
  User: {
    findOne: jest.fn(),
    create: jest.fn(),
    findByPk: jest.fn(),
  },
  RefreshToken: {
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  },
}));

const bcrypt = require("bcryptjs");
const db = require("../models/index");
const authController = require("../controllers/auth.controller");

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

describe("authController.register", () => {
  it("rejects a non-.edu email", async () => {
    const req = {
      body: { email: "student@gmail.com", password: "pw123456", full_name: "A Student", role: "student" },
    };
    const res = makeRes();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.User.create).not.toHaveBeenCalled();
  });

  it("rejects an admin role at self-registration", async () => {
    const req = {
      body: { email: "person@university.edu", password: "pw123456", full_name: "A Person", role: "admin" },
    };
    const res = makeRes();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.User.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate email", async () => {
    db.User.findOne.mockResolvedValue({ id: "existing-user" });
    const req = {
      body: { email: "student@university.edu", password: "pw123456", full_name: "A Student", role: "student" },
    };
    const res = makeRes();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.User.create).not.toHaveBeenCalled();
  });

  it("creates a user and returns a token pair on success", async () => {
    db.User.findOne.mockResolvedValue(null);
    db.User.create.mockResolvedValue({
      id: "new-user-id",
      email: "student@university.edu",
      role: "student",
      full_name: "A Student",
      avatar_url: null,
      is_edu_email: true,
    });
    db.RefreshToken.create.mockResolvedValue({});

    const req = {
      body: {
        email: "student@university.edu",
        password: "pw123456",
        full_name: "A Student",
        role: "student",
      },
    };
    const res = makeRes();

    await authController.register(req, res);

    expect(db.User.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "student@university.edu", role: "student", is_edu_email: true })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload.user.email).toBe("student@university.edu");
    expect(typeof payload.accessToken).toBe("string");
    expect(typeof payload.refreshToken).toBe("string");
  });
});

describe("authController.login", () => {
  it("rejects an unknown email", async () => {
    db.User.findOne.mockResolvedValue(null);
    const req = { body: { email: "nobody@university.edu", password: "pw123456" } };
    const res = makeRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects a wrong password", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 10);
    db.User.findOne.mockResolvedValue({ id: "user-1", password_hash: passwordHash });
    const req = { body: { email: "student@university.edu", password: "wrong-password" } };
    const res = makeRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns a token pair on valid credentials", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 10);
    db.User.findOne.mockResolvedValue({
      id: "user-1",
      email: "student@university.edu",
      role: "student",
      full_name: "A Student",
      password_hash: passwordHash,
    });
    db.RefreshToken.create.mockResolvedValue({});

    const req = { body: { email: "student@university.edu", password: "correct-password" } };
    const res = makeRes();

    await authController.login(req, res);

    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.user.id).toBe("user-1");
    expect(typeof payload.accessToken).toBe("string");
  });
});
