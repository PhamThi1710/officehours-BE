process.env.JWT_ACCESS_SECRET = "test-secret";

const jwt = require("jsonwebtoken");
const { attachUserIfPresent } = require("../middleware/authJwt");

function makeReqRes(headers = {}) {
  return [{ headers }, {}, jest.fn()];
}

describe("attachUserIfPresent", () => {
  it("calls next() without setting authUser when no token is provided", () => {
    const [req, res, next] = makeReqRes();

    attachUserIfPresent(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authUser).toBeUndefined();
  });

  it("sets authUser and calls next() for a valid token", (done) => {
    const token = jwt.sign({ sub: "user-1", role: "student", email: "s@school.edu" }, "test-secret");
    const [req, res, next] = makeReqRes({ authorization: `Bearer ${token}` });

    attachUserIfPresent(req, res, () => {
      expect(req.authUser).toEqual({ id: "user-1", role: "student", email: "s@school.edu" });
      done();
    });
    expect(next).not.toHaveBeenCalled(); // sanity: we passed our own callback above, not `next`
  });

  it("calls next() without setting authUser for an invalid token, never blocking the request", (done) => {
    const [req, res] = makeReqRes({ authorization: "Bearer not-a-real-token" });

    attachUserIfPresent(req, res, () => {
      expect(req.authUser).toBeUndefined();
      done();
    });
  });
});
