package com.safepath.exception;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final Long retryAfterSeconds;

    public ApiException(HttpStatus status, String message) {
        this(status, message, null);
    }

    public ApiException(HttpStatus status, String message, Long retryAfterSeconds) {
        super(message);
        this.status = status;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    /** Seconds the client should wait (429 only), otherwise null. */
    public Long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }

    public static ApiException tooManyRequests(long retryAfterSeconds) {
        long mins = (retryAfterSeconds + 59) / 60;
        String wait = retryAfterSeconds < 60
                ? retryAfterSeconds + " seconds"
                : mins + (mins == 1 ? " minute" : " minutes");
        return new ApiException(
                HttpStatus.TOO_MANY_REQUESTS,
                "Too many attempts. Please try again in " + wait + ".",
                retryAfterSeconds);
    }

    public HttpStatus getStatus() {
        return status;
    }

    public static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message);
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, message);
    }

    public static ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, message);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, message);
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, message);
    }
}
