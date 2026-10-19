package com.safepath.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Turns exceptions into JSON like { "message": "...", "error": "..." } so the
 * app and the dashboard can show a useful text instead of "Internal Server Error".
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log =
            LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static ResponseEntity<Map<String, Object>> body(
            HttpStatus status, String message
    ) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("status", status.value());
        map.put("message", message);
        map.put("error", message);
        return ResponseEntity.status(status).body(map);
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException e) {
        ResponseEntity<Map<String, Object>> res = body(e.getStatus(), e.getMessage());
        if (e.getRetryAfterSeconds() == null) {
            return res;
        }
        return ResponseEntity.status(e.getStatus())
                .header("Retry-After", String.valueOf(e.getRetryAfterSeconds()))
                .body(res.getBody());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleTooLarge(
            MaxUploadSizeExceededException e
    ) {
        return body(HttpStatus.valueOf(413), "Photo is too large (max 15 MB)");
    }

    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class
    })
    public ResponseEntity<Map<String, Object>> handleBadInput(Exception e) {
        return body(HttpStatus.BAD_REQUEST, "Invalid request");
    }

    /** YOLO service down / unreachable. */
    @ExceptionHandler(RestClientException.class)
    public ResponseEntity<Map<String, Object>> handleUpstream(RestClientException e) {
        log.error("Detection service call failed", e);
        return body(
                HttpStatus.BAD_GATEWAY,
                "Pothole detection service is unavailable. Please try again shortly."
        );
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(RuntimeException e) {
        log.error("Unexpected error", e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong on the server");
    }
}
