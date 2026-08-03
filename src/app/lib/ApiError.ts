export class ApiError extends Error {
  statusCode: number;
  data: null;
  success: boolean;
  errors: string[];

  constructor(
    statusCode: number,
    message: string = "Something wentwrong",
    errors: string[] = [],
    stack: string = "",
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.data = null;
    this.success = false;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else if (
      typeof (Error as { captureStackTrace?: unknown }).captureStackTrace ===
      "function"
    ) {
      (
        Error as {
          captureStackTrace: (target: object, ctor?: Function) => void;
        }
      ).captureStackTrace(this, this.constructor);
    }
  }
}
