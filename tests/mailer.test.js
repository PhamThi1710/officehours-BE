const mockSendMail = jest.fn();

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

describe("mailer.sendEmail", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    jest.resetModules();
  });

  it("skips sending and warns when Gmail credentials aren't configured", async () => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    const { sendEmail } = require("../utils/mailer");

    const result = await sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

    expect(result).toEqual({ skipped: true });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("sends via nodemailer when credentials are configured", async () => {
    process.env.GMAIL_USER = "bot@officehours.dev";
    process.env.GMAIL_APP_PASSWORD = "app-password";
    mockSendMail.mockResolvedValue({ messageId: "123" });
    const { sendEmail } = require("../utils/mailer");

    await sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>", from: expect.stringContaining("bot@officehours.dev") })
    );
  });
});
