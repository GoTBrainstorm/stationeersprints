/** An error with an HTTP status, serialized to JSON by the top-level handler. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const badRequest = (message: string, code = 'bad_request') => new ApiError(400, code, message)
export const forbidden = (message = 'Not allowed') => new ApiError(403, 'forbidden', message)
export const notFound = (message = 'Not found') => new ApiError(404, 'not_found', message)
export const tooLarge = (message: string) => new ApiError(413, 'too_large', message)
export const tooManyRequests = (message: string) => new ApiError(429, 'rate_limited', message)
export const serverError = (message = 'Something went wrong') => new ApiError(500, 'server_error', message)
