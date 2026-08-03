export class ApiResponse<T = unknown> {
  statusCode: number;
  data: T | null;
  message = "OK";
  success: boolean;
  constructor(statusCode: number, data: T, message: string = "Success") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }
}
