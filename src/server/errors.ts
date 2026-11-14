export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_ERROR",
  ) {
    super(message);
  }
}
export function notFound(): never {
  throw new AppError(404, "항목을 찾을 수 없습니다.", "NOT_FOUND");
}
